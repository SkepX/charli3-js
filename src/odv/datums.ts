/**
 * Datum parsers + builders for the three oracle-script datum variants:
 *   Constr 0 AggState(PriceData)
 *   Constr 1 OracleSettingsVariant(OracleSettingsDatum)
 *   Constr 2 RewardAccountVariant(RewardAccountDatum)
 *
 * Parsers use cbor-x (same as src/datum/parser.ts). Builders use Lucid's Data
 * model because we only hand the resulting CBOR to Lucid's tx builder.
 *
 * The encoding must match what the Aiken validator decodes. Field order and
 * Constr indices are copied verbatim from charli3-pull-oracle-client's
 * models/datums.py — do not reorder.
 */
import { Decoder, Tag } from "cbor-x";
import { Constr, Data } from "@lucid-evolution/plutus";

const decoder = new Decoder({ useRecords: false, mapsAsObjects: false });

interface RawConstr {
  index: number;
  fields: unknown[];
}

function asConstr(val: unknown): RawConstr | null {
  if (!(val instanceof Tag)) return null;
  const tag = (val as Tag).tag;
  const inner = (val as Tag).value;
  if (tag >= 121 && tag < 128) {
    return { index: tag - 121, fields: inner as unknown[] };
  }
  if (tag >= 1280 && tag < 1401) {
    return { index: tag - 1280 + 7, fields: inner as unknown[] };
  }
  if (tag === 102) {
    const [alt, fields] = inner as [number | bigint, unknown[]];
    return { index: Number(alt), fields };
  }
  return null;
}

function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  throw new Error(`Expected integer, got ${typeof v}: ${String(v)}`);
}

function toBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (Buffer.isBuffer(v)) return new Uint8Array(v);
  throw new Error(`Expected bytes, got ${typeof v}`);
}

function bytesToHex(b: Uint8Array): string {
  let h = "";
  for (let i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, "0");
  return h;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex string length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function decodeHex(hex: string): unknown {
  return decoder.decode(Buffer.from(hexToBytes(hex)));
}

/**
 * Strip the outer OracleDatum variant tag. Returns the inner Constr of the
 * concrete variant (AggState / OracleSettingsDatum / RewardAccountDatum).
 */
function unwrapOracleVariant(decoded: unknown, expectedIndex: 0 | 1 | 2): RawConstr {
  const outer = asConstr(decoded);
  if (!outer) throw new Error("Oracle datum is not a Constr");
  if (outer.index !== expectedIndex) {
    throw new Error(
      `Expected variant Constr ${expectedIndex}, got ${outer.index}`,
    );
  }
  if (expectedIndex === 0) {
    // AggState: variant IS the datum (Constr 0 [PriceData])
    return outer;
  }
  // Settings / RewardAccount variants wrap a single inner Constr.
  const inner = asConstr(outer.fields[0]);
  if (!inner) {
    throw new Error(`Variant ${expectedIndex} wrapper has no inner Constr`);
  }
  return inner;
}

// --- OracleSettingsDatum -----------------------------------------------------

export interface OracleSettings {
  /** 28-byte VKH hex for every node authorised to sign in this round. */
  nodeVkhsHex: string[];
  requiredNodeSignaturesCount: number;
  feeInfo: {
    /** null when rate_nft is NoDatum (Constr 1). */
    rateNft: { policyIdHex: string; assetNameHex: string } | null;
    rewardPrices: { nodeFee: bigint; platformFee: bigint };
  };
  aggregationLivenessPeriodMs: bigint;
  timeUncertaintyAggregationMs: bigint;
  timeUncertaintyPlatformMs: bigint;
  iqrFenceMultiplier: number;
  medianDivergencyFactor: number;
  utxoSizeSafetyBuffer: bigint;
  /** POSIX millis when pause started, or null. */
  pausePeriodStartedAtMs: bigint | null;
}

export function parseOracleSettings(datumHex: string): OracleSettings {
  const inner = unwrapOracleVariant(decodeHex(datumHex), 1);
  const fields = inner.fields;
  if (fields.length < 10) {
    throw new Error(
      `OracleSettingsDatum expects 10 fields, got ${fields.length}`,
    );
  }

  // `nodes` is either a plain list of VKH byte-strings (on-chain form) or a
  // Constr 0 wrapper around such a list (PyCardano model form). Accept both.
  const nodesField = fields[0];
  let nodeList: unknown[];
  if (Array.isArray(nodesField)) {
    nodeList = nodesField;
  } else {
    const nodesConstr = asConstr(nodesField);
    if (!nodesConstr || !Array.isArray(nodesConstr.fields[0])) {
      throw new Error("nodes field is neither a list nor a Constr-wrapped list");
    }
    nodeList = nodesConstr.fields[0];
  }
  const nodeVkhsHex = nodeList.map((v) => bytesToHex(toBytes(v)));

  const requiredNodeSignaturesCount = Number(toBigInt(fields[1]));

  const feeConfig = asConstr(fields[2]);
  if (!feeConfig) throw new Error("fee_info is not a Constr");
  const rateNftField = asConstr(feeConfig.fields[0]);
  let rateNft: OracleSettings["feeInfo"]["rateNft"] = null;
  if (rateNftField && rateNftField.index === 0) {
    const asset = asConstr(rateNftField.fields[0]);
    if (asset) {
      rateNft = {
        policyIdHex: bytesToHex(toBytes(asset.fields[0])),
        assetNameHex: bytesToHex(toBytes(asset.fields[1])),
      };
    }
  }
  const rewardPricesC = asConstr(feeConfig.fields[1]);
  if (!rewardPricesC) throw new Error("reward_prices is not a Constr");
  const rewardPrices = {
    nodeFee: toBigInt(rewardPricesC.fields[0]),
    platformFee: toBigInt(rewardPricesC.fields[1]),
  };

  const pauseField = asConstr(fields[9]);
  const pausePeriodStartedAtMs =
    pauseField && pauseField.index === 0 ? toBigInt(pauseField.fields[0]) : null;

  return {
    nodeVkhsHex,
    requiredNodeSignaturesCount,
    feeInfo: { rateNft, rewardPrices },
    aggregationLivenessPeriodMs: toBigInt(fields[3]),
    timeUncertaintyAggregationMs: toBigInt(fields[4]),
    timeUncertaintyPlatformMs: toBigInt(fields[5]),
    iqrFenceMultiplier: Number(toBigInt(fields[6])),
    medianDivergencyFactor: Number(toBigInt(fields[7])),
    utxoSizeSafetyBuffer: toBigInt(fields[8]),
    pausePeriodStartedAtMs,
  };
}

// --- RewardAccountDatum ------------------------------------------------------

export interface RewardAccountState {
  /** vkhHex -> cumulative reward lovelace owed. */
  nodesToRewards: Map<string, bigint>;
  lastUpdateTimeMs: bigint;
}

export function parseRewardAccount(datumHex: string): RewardAccountState {
  const inner = unwrapOracleVariant(decodeHex(datumHex), 2);
  const fields = inner.fields;
  const raw = fields[0];
  const nodesToRewards = new Map<string, bigint>();
  if (raw instanceof Map) {
    for (const [k, v] of raw.entries()) {
      nodesToRewards.set(bytesToHex(toBytes(k)), toBigInt(v));
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      nodesToRewards.set(k, toBigInt(v));
    }
  } else {
    throw new Error("nodes_to_rewards is not a Map");
  }
  return {
    nodesToRewards,
    lastUpdateTimeMs: fields.length > 1 ? toBigInt(fields[1]) : 0n,
  };
}

// --- AggState ---------------------------------------------------------------

export interface AggStateData {
  /** null when price_map is empty (fresh/rolled-over AggState). */
  price: bigint | null;
  /** POSIX millis the feed was stamped; null when empty. */
  timestampMs: bigint | null;
  /** POSIX millis the feed expires; null when empty. */
  expiryMs: bigint | null;
  isEmpty: boolean;
}

export function parseAggState(datumHex: string): AggStateData {
  // AggState is the outer variant itself (Constr 0 [PriceData]).
  const outer = unwrapOracleVariant(decodeHex(datumHex), 0);
  const priceData = asConstr(outer.fields[0]);
  if (!priceData || priceData.index !== 2) {
    throw new Error("AggState inner is not PriceData (Constr 2)");
  }
  const rawMap = priceData.fields[0];
  let price: bigint | null = null;
  let timestampMs: bigint | null = null;
  let expiryMs: bigint | null = null;
  let size = 0;
  if (rawMap instanceof Map) {
    size = rawMap.size;
    for (const [k, v] of rawMap.entries()) {
      const key = Number(toBigInt(k));
      if (key === 0) price = toBigInt(v);
      else if (key === 1) timestampMs = toBigInt(v);
      else if (key === 2) expiryMs = toBigInt(v);
    }
  } else if (rawMap && typeof rawMap === "object") {
    const obj = rawMap as Record<string, unknown>;
    size = Object.keys(obj).length;
    if ("0" in obj) price = toBigInt(obj["0"]);
    if ("1" in obj) timestampMs = toBigInt(obj["1"]);
    if ("2" in obj) expiryMs = toBigInt(obj["2"]);
  }
  return { price, timestampMs, expiryMs, isEmpty: size === 0 };
}

// --- Builders (Lucid Data) ---------------------------------------------------

/**
 * New AggState datum for the Round-2 output: `Constr 0 [Constr 2 [Map{...}]]`.
 *   validFromMs — tx lower bound in POSIX millis
 *   aggregationLivenessPeriodMs — from OracleSettings
 * Timestamp is `validFromMs`, expiry is `validFromMs + livenessPeriod`, matching
 * what the on-chain script recomputes.
 */
export function buildAggStateDatumCbor(args: {
  medianPrice: bigint;
  validFromMs: bigint;
  aggregationLivenessPeriodMs: bigint;
}): string {
  const priceMap = new Map<Data, Data>([
    [0n, args.medianPrice],
    [1n, args.validFromMs],
    [2n, args.validFromMs + args.aggregationLivenessPeriodMs],
  ]);
  const priceData = new Constr(2, [priceMap]);
  const aggState = new Constr(0, [priceData]);
  return Data.to<Data>(aggState, undefined, { canonical: true });
}

/**
 * New RewardAccountVariant datum for the Round-2 output:
 *   Constr 2 [ Constr 0 [Map{vkh->reward}, lastUpdateTime] ]
 *
 * The map MUST be ordered by VKH ASC; we rely on the caller (or the pre-sorted
 * array from `calculateRewardDistribution`) to provide that order. Map
 * insertion order is preserved by JS Map and emitted in that order by Lucid.
 */
export function buildRewardAccountDatumCbor(args: {
  distributionSortedByVkh: Array<{ vkhHex: string; reward: bigint }>;
  lastUpdateTimeMs: bigint;
}): string {
  const entries: [Data, Data][] = args.distributionSortedByVkh.map((e) => [
    e.vkhHex,
    e.reward,
  ]);
  const map = new Map<Data, Data>(entries);
  const inner = new Constr(0, [map, args.lastUpdateTimeMs]);
  const variant = new Constr(2, [inner]);
  return Data.to<Data>(variant, undefined, { canonical: true });
}

/**
 * `OdvAggregate` redeemer (for the RewardAccount script input).
 *   Constr 0 [ Map{vkh -> feed} ]  — pre-sorted by (feed ASC, vkh ASC).
 *
 * NOT canonical: canonical CBOR reorders map keys bytewise, which would
 * sort the pairs by VKH and break the validator's T25 check that feed
 * values (the map's *values*) are in ascending order.
 */
export function buildOdvAggregateRedeemerCbor(
  sortedFeeds: Array<{ vkhHex: string; feed: bigint }>,
): string {
  const entries: [Data, Data][] = sortedFeeds.map((f) => [f.vkhHex, f.feed]);
  const map = new Map<Data, Data>(entries);
  return Data.to<Data>(new Constr(0, [map]));
}

/** `OdvAggregateMsg` redeemer (for the AggState script input). Constr 1 []. */
export function buildOdvAggregateMsgRedeemerCbor(): string {
  return Data.to<Data>(new Constr(1, []), undefined, { canonical: true });
}
