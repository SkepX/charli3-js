import { createHash, createPublicKey, verify as nodeVerify } from "crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function hexToBuffer(hex: string): Buffer {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(clean, "hex");
}

function rawPubKeyFromHex(hex: string): Buffer {
  const buf = hexToBuffer(hex);
  if (buf.length === 32) return buf;
  if (buf.length === 34 && buf[0] === 0x58 && buf[1] === 0x20) {
    return buf.subarray(2);
  }
  throw new Error(
    `Unexpected ed25519 public key length: ${buf.length} bytes ` +
      `(expected 32 raw, or 34 with CBOR bytes(32) header 5820...)`,
  );
}

function rawSignatureFromHex(hex: string): Buffer {
  const buf = hexToBuffer(hex);
  if (buf.length === 64) return buf;
  throw new Error(
    `Unexpected ed25519 signature length: ${buf.length} bytes (expected 64)`,
  );
}

function verifyBytes(
  message: Buffer,
  signature: Buffer,
  publicKey: Buffer,
): boolean {
  const spki = Buffer.concat([ED25519_SPKI_PREFIX, publicKey]);
  const keyObject = createPublicKey({ key: spki, format: "der", type: "spki" });
  return nodeVerify(null, message, keyObject, signature);
}

/**
 * Verify a Charli3 oracle node's ed25519 signature over a CBOR-encoded feed
 * message. Matches the Python SDK's SignedOracleNodeMessage.validate_signature
 * logic: the node signs sha256(cbor_bytes), so we hash before verifying.
 */
export function verifyEd25519(
  messageHex: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  const digest = createHash("sha256").update(hexToBuffer(messageHex)).digest();
  return verifyBytes(
    digest,
    rawSignatureFromHex(signatureHex),
    rawPubKeyFromHex(publicKeyHex),
  );
}

/**
 * Verify an ed25519 signature over raw bytes (no hashing). Useful when the
 * message was signed directly without a pre-hash step.
 */
export function verifyEd25519Raw(
  messageHex: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  return verifyBytes(
    hexToBuffer(messageHex),
    rawSignatureFromHex(signatureHex),
    rawPubKeyFromHex(publicKeyHex),
  );
}

export interface FeedSignatureInput {
  messageCborHex: string;
  signatureHex: string;
  verificationKeyHex: string;
}

export function verifyFeedSignature(feed: FeedSignatureInput): boolean {
  return verifyEd25519(
    feed.messageCborHex,
    feed.signatureHex,
    feed.verificationKeyHex,
  );
}
