/**
 * Builds the Round-2 ODV transaction using Lucid Evolution.
 *
 * The transaction spends the script's RewardAccount (C3RA) + AggState (C3AS)
 * UTxOs, reads the Settings (C3CS) UTxO as a reference input, and produces
 * two new script outputs with updated datums. Required signers are the VKHs
 * of every oracle node whose feed is included in the aggregate message.
 *
 * The caller is responsible for:
 *   - collecting Round-1 signed feeds from the oracle nodes
 *   - supplying a Lucid instance with a wallet capable of paying fees
 *   - calling /odv/sign at each node to obtain the per-VKH witnesses
 *   - attaching those witnesses and submitting
 *
 * This module stays intentionally low-level; `c3.submitRound2()` wraps it.
 */
import type {
  CML,
  LucidEvolution,
  OutputDatum,
  TxSignBuilder,
  UTxO,
} from "@lucid-evolution/lucid";
import {
  slotToUnixTime,
  unixTimeToSlot,
} from "@lucid-evolution/utils";
import type { NodeFeedEntry } from "./aggregate-message";
import type { OracleSettings } from "./datums";
import {
  buildAggStateDatumCbor,
  buildOdvAggregateMsgRedeemerCbor,
  buildOdvAggregateRedeemerCbor,
  buildRewardAccountDatumCbor,
  parseAggState,
  parseOracleSettings,
  parseRewardAccount,
} from "./datums";
import {
  calculateMinFeeAmount,
  calculateRewardDistribution,
} from "./iqr";

export interface OracleScriptUtxos {
  /** C3CS — used as reference input. */
  settings: UTxO;
  /** C3RA — spent with OdvAggregate redeemer. */
  rewardAccount: UTxO;
  /** C3AS — spent with OdvAggregateMsg redeemer. Must be empty or expired. */
  aggState: UTxO;
  /** UTxO that carries the oracle script as a reference script. */
  referenceScript: UTxO;
}

export interface BuildOdvTxParams {
  oracleAddress: string;
  policyIdHex: string;
  sortedFeeds: NodeFeedEntry[];
  median: bigint;
  oracleUtxos: OracleScriptUtxos;
  /**
   * Optional validity window override, in POSIX ms. If omitted, the tx is
   * valid from (now - halfWindow) to (now + halfWindow) where halfWindow is
   * `timeUncertaintyAggregation / 2` from the settings datum.
   */
  validity?: { startMs: number; endMs: number };
}

export interface BuildOdvTxResult {
  txSignBuilder: TxSignBuilder;
  /** TransactionBody-only CBOR hex, used in the /odv/sign request. */
  txBodyCborHex: string;
  /** Full Transaction CBOR hex (body + empty witness set), for debugging. */
  txFullCborHex: string;
  signerVkhsHex: string[];
  validityMs: { startMs: number; endMs: number };
  medianValue: bigint;
  rewardDistribution: Array<{ vkhHex: string; reward: bigint }>;
  parsedSettings: OracleSettings;
  minFee: bigint;
}

function utf8ToHex(s: string): string {
  return Buffer.from(s, "utf8").toString("hex");
}

/** Lucid `Unit` (policyHex + assetNameHex) for one of the oracle NFTs. */
function oracleTokenUnit(
  policyIdHex: string,
  assetName: "C3CS" | "C3RA" | "C3AS" | "C3RT",
): string {
  return `${policyIdHex}${utf8ToHex(assetName)}`;
}

/**
 * Pick the oracle script UTxOs needed for a Round-2 tx.
 * Filters by the protocol tokens (C3CS/C3RA/C3AS) and validates that the
 * AggState UTxO is either empty or expired (so the validator will accept
 * replacing it with a new aggregation).
 */
export function selectOracleUtxos(args: {
  scriptAddressUtxos: UTxO[];
  referenceScriptUtxo: UTxO;
  policyIdHex: string;
  currentTimeMs: number;
}): OracleScriptUtxos {
  const { scriptAddressUtxos, referenceScriptUtxo, policyIdHex } = args;
  const csUnit = oracleTokenUnit(policyIdHex, "C3CS");
  const raUnit = oracleTokenUnit(policyIdHex, "C3RA");
  const asUnit = oracleTokenUnit(policyIdHex, "C3AS");

  const byUnit = (unit: string) =>
    scriptAddressUtxos.filter((u) => (u.assets[unit] ?? 0n) >= 1n);

  const settingsList = byUnit(csUnit);
  if (settingsList.length === 0) {
    throw new Error(`No oracle settings (C3CS) UTxO found for policy ${policyIdHex}`);
  }
  const rewardList = byUnit(raUnit);
  if (rewardList.length === 0) {
    throw new Error(`No reward account (C3RA) UTxO found for policy ${policyIdHex}`);
  }
  const aggList = byUnit(asUnit);
  if (aggList.length === 0) {
    throw new Error(`No aggregation state (C3AS) UTxO found for policy ${policyIdHex}`);
  }

  // Pick an AggState that is empty or expired.
  let aggState: UTxO | undefined;
  for (const u of aggList) {
    if (!u.datum) continue;
    try {
      const parsed = parseAggState(u.datum);
      if (parsed.isEmpty) {
        aggState = u;
        break;
      }
      if (parsed.expiryMs !== null && parsed.expiryMs < BigInt(args.currentTimeMs)) {
        aggState = u;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!aggState) {
    throw new Error(
      "No valid AggState UTxO (empty or expired) — another aggregator may have already updated this feed",
    );
  }

  return {
    settings: settingsList[0],
    rewardAccount: rewardList[0],
    aggState,
    referenceScript: referenceScriptUtxo,
  };
}

/**
 * Build the Round-2 tx. Does NOT sign or submit; returns a `TxSignBuilder`
 * plus the body CBOR to ship to /odv/sign.
 */
export async function buildOdvTx(
  lucid: LucidEvolution,
  params: BuildOdvTxParams,
): Promise<BuildOdvTxResult> {
  const { oracleAddress, policyIdHex, sortedFeeds, median, oracleUtxos } = params;

  if (!oracleUtxos.settings.datum) {
    throw new Error("Settings UTxO has no inline datum");
  }
  const settings = parseOracleSettings(oracleUtxos.settings.datum);

  if (!oracleUtxos.rewardAccount.datum) {
    throw new Error("Reward account UTxO has no inline datum");
  }
  const priorAccount = parseRewardAccount(oracleUtxos.rewardAccount.datum);

  // Validity window — centered on now, kept well under time_uncertainty_aggregation
  // so that Lucid's ms->slot rounding can't push the on-chain interval past the
  // validator's `validity_range_size <= time_accuracy` check.
  let startMs: number, endMs: number;
  if (params.validity) {
    startMs = params.validity.startMs;
    endMs = params.validity.endMs;
  } else {
    // Backdate start by 60s so the ledger tip (which lags wall clock by
    // ~1 block time) is already past `invalid_before` when the node
    // submits. Window is kept just under time_uncertainty_aggregation so
    // slot-rounding can't push us past the `<= time_accuracy` check.
    const fullAccuracy = Number(settings.timeUncertaintyAggregationMs);
    const backdateMs = 60_000;
    const now = Date.now();
    startMs = now - backdateMs;
    endMs = startMs + fullAccuracy - 2_000;
  }
  // Lucid floors ms -> slot in validFrom/validTo. The script context sees the
  // slot-rounded bounds, so current_time must be computed from those to match
  // the validator's `(end + start) / 2` in must_have_correct_datum.
  const network = lucid.config().network ?? "Preprod";
  const onChainStartMs = slotToUnixTime(network, unixTimeToSlot(network, startMs));
  const onChainEndMs = slotToUnixTime(network, unixTimeToSlot(network, endMs));
  const currentTimeMs = Math.floor((onChainStartMs + onChainEndMs) / 2);
  const windowLen = onChainEndMs - onChainStartMs;
  if (windowLen <= 0 || windowLen > Number(settings.timeUncertaintyAggregationMs)) {
    throw new Error(
      `Invalid validity window length ${windowLen}ms (limit ${settings.timeUncertaintyAggregationMs}ms)`,
    );
  }

  // Reward + consensus.
  const distribution = calculateRewardDistribution({
    sortedFeeds: sortedFeeds.map((f) => ({ vkhHex: f.vkhHex, feed: f.feed })),
    allowedNodeVkhs: settings.nodeVkhsHex,
    nodeFee: settings.feeInfo.rewardPrices.nodeFee,
    priorDistribution: priorAccount.nodesToRewards,
    consensus: {
      iqrFenceMultiplier: settings.iqrFenceMultiplier,
      medianDivergencyFactor: settings.medianDivergencyFactor,
    },
  });
  const minFee = calculateMinFeeAmount(
    settings.feeInfo.rewardPrices.nodeFee,
    settings.feeInfo.rewardPrices.platformFee,
    sortedFeeds.length,
  );

  // Build the two new script outputs: new RewardAccount + new AggState.
  const newRewardAccountDatumCbor = buildRewardAccountDatumCbor({
    distributionSortedByVkh: distribution,
    lastUpdateTimeMs: BigInt(currentTimeMs),
  });
  const newAggStateDatumCbor = buildAggStateDatumCbor({
    medianPrice: median,
    validFromMs: BigInt(currentTimeMs),
    aggregationLivenessPeriodMs: settings.aggregationLivenessPeriodMs,
  });

  // Preserve every asset on the input reward-account UTxO, add `minFee` lovelace.
  const newRewardAssets: Record<string, bigint> = {};
  for (const [unit, qty] of Object.entries(oracleUtxos.rewardAccount.assets)) {
    newRewardAssets[unit] = qty;
  }
  newRewardAssets["lovelace"] = (newRewardAssets["lovelace"] ?? 0n) + minFee;

  // AggState output carries the same assets as its input.
  const newAggStateAssets: Record<string, bigint> = { ...oracleUtxos.aggState.assets };

  // Redeemers.
  const odvAggregateRedeemer = buildOdvAggregateRedeemerCbor(
    sortedFeeds.map((f) => ({ vkhHex: f.vkhHex, feed: f.feed })),
  );
  const odvAggregateMsgRedeemer = buildOdvAggregateMsgRedeemerCbor();

  // Compose the tx.
  const rewardAccountDatum: OutputDatum = {
    kind: "inline",
    value: newRewardAccountDatumCbor,
  };
  const aggStateDatum: OutputDatum = {
    kind: "inline",
    value: newAggStateDatumCbor,
  };

  let tx = lucid
    .newTx()
    .readFrom([oracleUtxos.settings, oracleUtxos.referenceScript])
    .collectFrom([oracleUtxos.rewardAccount], odvAggregateRedeemer)
    .collectFrom([oracleUtxos.aggState], odvAggregateMsgRedeemer)
    .pay.ToContract(oracleAddress, rewardAccountDatum, newRewardAssets)
    .pay.ToContract(oracleAddress, aggStateDatum, newAggStateAssets)
    .validFrom(startMs)
    .validTo(endMs);

  const signerVkhsHex = sortedFeeds.map((f) => f.vkhHex);
  for (const vkh of signerVkhsHex) {
    tx = tx.addSignerKey(vkh);
  }

  const txSignBuilder = await tx.complete();
  const cmlTx = txSignBuilder.toTransaction();
  const txBodyCborHex = cmlTx.body().to_cbor_hex();
  const txFullCborHex = cmlTx.to_cbor_hex();

  return {
    txSignBuilder,
    txBodyCborHex,
    txFullCborHex,
    signerVkhsHex,
    validityMs: { startMs, endMs },
    medianValue: median,
    rewardDistribution: distribution,
    parsedSettings: settings,
    minFee,
  };
}

/**
 * Wrap a per-node signature as a full CML.TransactionWitnessSet (hex). Lucid's
 * `assemble()` expects an array of such hex strings.
 */
export function buildVkeyWitnessSetHex(args: {
  cml: typeof CML;
  rawVkeyHex: string;
  signatureHex: string;
}): string {
  const vkey = args.cml.PublicKey.from_bytes(hexToBytes(args.rawVkeyHex));
  const sig = args.cml.Ed25519Signature.from_raw_bytes(
    hexToBytes(args.signatureHex),
  );
  const vkw = args.cml.Vkeywitness.new(vkey, sig);
  const list = args.cml.VkeywitnessList.new();
  list.add(vkw);
  const ws = args.cml.TransactionWitnessSet.new();
  ws.set_vkeywitnesses(list);
  return ws.to_cbor_hex();
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
