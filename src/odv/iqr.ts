/**
 * Ports charli3-pull-oracle-client's IQR + divergency logic verbatim. The
 * on-chain validator runs the same math to decide which nodes get rewarded
 * in this round, so any drift here will cause the tx to fail script eval.
 */

export const IQR_APPLICABILITY_THRESHOLD = 4;

/**
 * Linear-interpolated quantile (matches Python SDK's `quantile`). Implemented
 * with rationals to avoid float drift that would change reward rounding.
 */
function quantileRational(
  sortedValues: bigint[],
  q: { num: number; den: number },
): { num: bigint; den: bigint } {
  const n = sortedValues.length;
  const nSubOne = BigInt(n - 1);
  const qNum = BigInt(q.num);
  const qDen = BigInt(q.den);

  const qiNum = qNum * nSubOne;
  const qiDen = qDen;

  const j = qiNum / qiDen;
  const gNum = qiNum - j * qiDen;
  const gDen = qiDen;

  const idx = Number(j);
  const xj = sortedValues[idx];
  const xj1 = sortedValues[idx + 1] ?? xj;

  const num = xj * (gDen - gNum) + xj1 * gNum;
  const den = gDen;
  return { num, den };
}

/** Round-half-up division matching Python's `round()` for positive half-even edge cases. */
function roundDiv(num: bigint, den: bigint): bigint {
  if (den === 0n) throw new Error("roundDiv by zero");
  const neg = num < 0n !== den < 0n;
  const absN = num < 0n ? -num : num;
  const absD = den < 0n ? -den : den;
  const q = absN / absD;
  const r = absN - q * absD;
  let rounded: bigint;
  if (r * 2n < absD) rounded = q;
  else if (r * 2n > absD) rounded = q + 1n;
  else rounded = q % 2n === 0n ? q : q + 1n;
  return neg ? -rounded : rounded;
}

function iqrFences(
  sortedValues: bigint[],
  multiplierPct: number,
): { lower: bigint; upper: bigint } {
  const q25 = quantileRational(sortedValues, { num: 25, den: 100 });
  const q75 = quantileRational(sortedValues, { num: 75, den: 100 });
  const den = q25.den * q75.den;
  const q25n = q25.num * q75.den;
  const q75n = q75.num * q25.den;
  const iqrNum = q75n - q25n;
  const mulNum = BigInt(multiplierPct);
  const mulDen = 100n;
  const fenceNum = iqrNum * mulNum;
  const fenceDen = den * mulDen;
  const lowerNum = q25n * fenceDen - fenceNum * den;
  const upperNum = q75n * fenceDen + fenceNum * den;
  const outDen = den * fenceDen;
  return {
    lower: roundDiv(lowerNum, outDen),
    upper: roundDiv(upperNum, outDen),
  };
}

export interface ConsensusOptions {
  /** From settings datum. Expressed in percent * 100 (e.g. 150 = 1.5x). */
  iqrFenceMultiplier: number;
  /** From settings datum. Expressed in thousandths (e.g. 30 = 3%). */
  medianDivergencyFactor: number;
}

/**
 * Compute which node-VKHs fall inside the consensus band. The on-chain validator
 * must agree on this set; anything outside gets 0 reward for this round.
 *
 * Algorithm mirrors Python's `consensus_by_iqr_and_divergency`: use IQR fences
 * when n >= 4 and the fences don't collapse, otherwise fall back to a
 * median ± divergency% band around the midpoint.
 */
export function consensusNodes<K extends string>(
  feeds: Array<{ vkhHex: K; feed: bigint }>,
  opts: ConsensusOptions,
): K[] {
  if (feeds.length === 0) throw new Error("Empty node feeds list");
  if (feeds.length === 1) return feeds.map((f) => f.vkhHex);

  const sorted = [...feeds.map((f) => f.feed)].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  const mid = quantileRational(sorted, { num: 1, den: 2 });

  let lower: bigint;
  let upper: bigint;

  if (feeds.length >= IQR_APPLICABILITY_THRESHOLD) {
    const fences = iqrFences(sorted, opts.iqrFenceMultiplier);
    lower = fences.lower;
    upper = fences.upper;
  } else {
    lower = 0n;
    upper = 0n;
  }

  if (feeds.length < IQR_APPLICABILITY_THRESHOLD || lower === upper) {
    // fence = midpoint * (factor/1000)
    const factor = BigInt(opts.medianDivergencyFactor);
    const fenceNum = mid.num * factor;
    const fenceDen = mid.den * 1000n;
    const midpointNum = mid.num * fenceDen;
    const midpointDen = mid.den * fenceDen;
    const lowerNum = midpointNum - fenceNum * mid.den;
    const upperNum = midpointNum + fenceNum * mid.den;
    lower = roundDiv(lowerNum, midpointDen);
    upper = roundDiv(upperNum, midpointDen);
  }

  return feeds
    .filter((f) => f.feed >= lower && f.feed <= upper)
    .map((f) => f.vkhHex);
}

/**
 * Compute the new `nodes_to_rewards` distribution. Matches
 * `reward_calculations.calculate_reward_distribution`:
 *   out[vkh] = in[vkh] + (node_fee if vkh in consensus else 0)
 * Strictly-positive entries survive; the result is sorted by VKH ascending
 * (which is how the on-chain datum is required to be ordered).
 */
export function calculateRewardDistribution(args: {
  sortedFeeds: Array<{ vkhHex: string; feed: bigint }>;
  allowedNodeVkhs: string[];
  nodeFee: bigint;
  priorDistribution: Map<string, bigint>;
  consensus: ConsensusOptions;
}): Array<{ vkhHex: string; reward: bigint }> {
  const rewarded = new Set(consensusNodes(args.sortedFeeds, args.consensus));
  const out = new Map<string, bigint>();
  for (const vkh of args.allowedNodeVkhs) {
    const base = args.priorDistribution.get(vkh) ?? 0n;
    const addend = rewarded.has(vkh) ? args.nodeFee : 0n;
    const total = base + addend;
    if (total > 0n) out.set(vkh, total);
  }
  const entries = Array.from(out.entries()).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return entries.map(([vkhHex, reward]) => ({ vkhHex, reward }));
}

export function calculateMinFeeAmount(
  nodeFee: bigint,
  platformFee: bigint,
  nodeCount: number,
): bigint {
  return platformFee + nodeFee * BigInt(nodeCount);
}
