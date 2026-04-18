import { Decoder, Tag } from "cbor-x";
import type { PriceData } from "../types";

const decoder = new Decoder({ useRecords: false });

interface Constr {
  index: number;
  fields: unknown[];
}

function asConstr(val: unknown): Constr | null {
  if (!(val instanceof Tag)) return null;
  const tag = (val as Tag).tag;
  const inner = (val as Tag).value;
  if (tag >= 121 && tag < 128) {
    return { index: tag - 121, fields: inner as unknown[] };
  }
  if (tag === 102) {
    const [alt, fields] = inner as [number, unknown[]];
    return { index: Number(alt), fields };
  }
  return null;
}

function mapGet(m: unknown, key: number): unknown {
  if (m instanceof Map) {
    if (m.has(key)) return m.get(key);
    for (const [k, v] of m.entries()) {
      if (typeof k === "bigint" && Number(k) === key) return v;
      if (typeof k === "number" && k === key) return v;
    }
    return undefined;
  }
  if (m && typeof m === "object") {
    const anyM = m as Record<string, unknown>;
    return anyM[key] ?? anyM[String(key)];
  }
  return undefined;
}

function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  throw new Error(`Expected integer, got ${typeof v}: ${String(v)}`);
}

function toNumber(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  throw new Error(`Expected number, got ${typeof v}: ${String(v)}`);
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex string length");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function decodeCbor(hex: string): unknown {
  return decoder.decode(Buffer.from(hexToBytes(hex)));
}

export function decodeOracleDatum(
  datumHex: string,
  pair: string,
): PriceData {
  const decoded = decodeCbor(datumHex);
  const outer = asConstr(decoded);
  if (!outer) {
    throw new Error(
      "Oracle datum is not a Plutus Constr (outer wrapper missing)",
    );
  }

  let priceFields: unknown[] | null = null;

  const candidates: unknown[] = [];
  for (const field of outer.fields) candidates.push(field);
  if (outer.fields.length === 1) {
    const solo = outer.fields[0];
    if (Array.isArray(solo)) {
      for (const x of solo) candidates.push(x);
    }
  }

  for (const c of candidates) {
    const cc = asConstr(c);
    if (cc && cc.index === 2) {
      priceFields = cc.fields;
      break;
    }
  }

  if (!priceFields) {
    const cc = asConstr(outer.fields[0]);
    if (cc && cc.index === 2) priceFields = cc.fields;
  }

  if (!priceFields) {
    throw new Error(
      "No generic_data (Constr 2) found in oracle datum — datum format may have changed",
    );
  }

  const priceMap = priceFields[0];

  const rawPriceVal = mapGet(priceMap, 0);
  if (rawPriceVal === undefined) {
    throw new Error("Price field (key 0) missing from oracle datum");
  }
  const rawPrice = toBigInt(rawPriceVal);

  const createdVal = mapGet(priceMap, 1);
  const expiresVal = mapGet(priceMap, 2);
  const precisionVal = mapGet(priceMap, 3);

  const createdMs = createdVal !== undefined ? toNumber(createdVal) : 0;
  const expiresMs = expiresVal !== undefined ? toNumber(expiresVal) : 0;
  const precision = precisionVal !== undefined ? toNumber(precisionVal) : 6;

  const divisor = 10 ** precision;
  const value = Number(rawPrice) / divisor;

  return {
    pair,
    value,
    rawValue: rawPrice,
    precision,
    createdAt: new Date(createdMs),
    expiresAt: new Date(expiresMs),
    isExpired: expiresMs > 0 ? Date.now() > expiresMs : false,
  };
}
