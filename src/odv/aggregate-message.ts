import { blake2b_224 } from "@harmoniclabs/crypto";
import type { SignedFeedMessage } from "../types";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`Bad hex length: ${clean.length}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let h = "";
  for (let i = 0; i < bytes.length; i++)
    h += bytes[i].toString(16).padStart(2, "0");
  return h;
}

/** Strip a CBOR bytes-header (0x58 0x20) from a 34-byte hex string to get the raw 32-byte vkey. */
export function rawVkeyBytes(verificationKeyHex: string): Uint8Array {
  const buf = hexToBytes(verificationKeyHex);
  if (buf.length === 32) return buf;
  if (buf.length === 34 && buf[0] === 0x58 && buf[1] === 0x20) {
    return buf.slice(2);
  }
  throw new Error(
    `Unexpected vkey length: ${buf.length} bytes (want 32, or 34 with 5820 CBOR prefix)`,
  );
}

/** Compute the 28-byte Verification Key Hash (blake2b-224) from a vkey (hex, raw or CBOR-wrapped). */
export function vkhOf(verificationKeyHex: string): string {
  const raw = rawVkeyBytes(verificationKeyHex);
  return bytesToHex(blake2b_224(raw));
}

export interface NodeFeedEntry {
  /** 28-byte VKH hex — matches the `required_signers` set on the tx. */
  vkhHex: string;
  /** Raw 32-byte verification key hex (no CBOR prefix). */
  vkeyHex: string;
  /** Raw signed feed value as written on-chain (bigint). */
  feed: bigint;
  /** The original Round-1 signed message, carried through so we can POST it to /odv/sign. */
  source: SignedFeedMessage;
}

export interface AggregateMessage {
  /**
   * Feeds sorted by (feed ASC, vkh ASC) — the ordering Charli3's on-chain validator
   * uses when it recomputes IQR consensus and reward distribution. Must match exactly
   * or the script will reject the tx.
   */
  sortedFeeds: NodeFeedEntry[];
  /** Median (integer) of the sorted feed values — written into the new AggState datum. */
  median: bigint;
}

/**
 * Build the Round-2 aggregate message from Round-1 node responses. Sorts by feed
 * value (then VKH), computes the median, and tags each entry with its VKH so the
 * transaction can pin them as required signers.
 */
export function buildAggregateMessage(
  feeds: SignedFeedMessage[],
): AggregateMessage {
  if (feeds.length === 0) {
    throw new Error("Cannot build aggregate message: no feeds");
  }
  const entries: NodeFeedEntry[] = feeds.map((f) => ({
    vkhHex: vkhOf(f.verificationKeyHex),
    vkeyHex: bytesToHex(rawVkeyBytes(f.verificationKeyHex)),
    feed: f.feed,
    source: f,
  }));

  entries.sort((a, b) => {
    if (a.feed < b.feed) return -1;
    if (a.feed > b.feed) return 1;
    return a.vkhHex < b.vkhHex ? -1 : a.vkhHex > b.vkhHex ? 1 : 0;
  });

  const values = entries.map((e) => e.feed);
  return { sortedFeeds: entries, median: medianBigInt(values) };
}

/**
 * Integer median matching the on-chain aggregator's algorithm. For an even count
 * the script floors the average of the two middle elements.
 */
export function medianBigInt(sorted: bigint[]): bigint {
  const n = sorted.length;
  if (n === 0) throw new Error("median of empty list");
  if (n % 2 === 1) return sorted[(n - 1) >> 1];
  const mid = n >> 1;
  return (sorted[mid - 1] + sorted[mid]) / 2n;
}
