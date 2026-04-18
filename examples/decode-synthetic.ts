import { Encoder, Tag } from "cbor-x";
import { decodeCbor } from "../src/datum/parser";

const encoder = new Encoder();

function encodeConstr0(fields: unknown[]): string {
  const buf = encoder.encode(new Tag(fields, 121));
  return Buffer.from(buf).toString("hex");
}

const fakeFeed = 407_740n;
const fakeTimestamp = Date.now();
const policyId = "886dcb2363e160c944e63cf544ce6f6265b22ef7c4e2478dd975078e";

const messageHex = encodeConstr0([
  fakeFeed,
  BigInt(fakeTimestamp),
  Buffer.from(policyId, "hex"),
]);

console.log("Synthetic node message CBOR hex:");
console.log(` ${messageHex}\n`);

const decoded = decodeCbor(messageHex);
console.log("Decoded structure:");
console.log(` tag: ${(decoded as Tag).tag}`);
console.log(` fields:`, (decoded as Tag).value);

const fields = (decoded as Tag).value as unknown[];
const feed = fields[0] as bigint;
const timestamp = fields[1] as bigint;
const policy = fields[2] as Uint8Array;

console.log(`\nReconstructed:`);
console.log(` feed value:    ${Number(feed) / 1_000_000} USD`);
console.log(` timestamp:     ${new Date(Number(timestamp)).toISOString()}`);
console.log(` policy id hex: ${Buffer.from(policy).toString("hex")}`);
console.log(`\nPolicy id roundtrip matches: ${Buffer.from(policy).toString("hex") === policyId}`);
