/*
 * Claim: spend the locked UTXO at price_gated_payout using the Charli3
 * ADA/USD oracle UTXO as a reference input.
 *
 * End-to-end proof of the SDK: charli3-js.getOracleReference() returns the
 * live price and the oracle UTXO outref in one call; Lucid attaches the
 * outref as a reference input and submits.
 *
 * Env: BLOCKFROST_PROJECT_ID=preprod...
 */

import fs from "fs";
import path from "path";
import {
  Blockfrost,
  Constr,
  Data,
  Lucid,
  type Validator,
} from "@lucid-evolution/lucid";
import { Charli3 } from "../src";

const NETWORK = "Preprod" as const;
const PAIR = "ADA/USD";

const artifactsPath = path.join(__dirname, "artifacts.json");
const walletSeedPath = path.join(__dirname, ".wallet.seed");

async function main() {
  const projectId = process.env.BLOCKFROST_PROJECT_ID;
  if (!projectId) throw new Error("set BLOCKFROST_PROJECT_ID=preprod...");

  const artifacts = JSON.parse(fs.readFileSync(artifactsPath, "utf-8"));
  const seed = fs.readFileSync(walletSeedPath, "utf-8").trim();

  // ---- 1) SDK: one-call oracle lookup (price + ref-input outref) ----
  const c3 = new Charli3({ network: "preprod" });
  const ref = await c3.getOracleReference(PAIR);
  console.log(`oracle ${PAIR}: $${ref.price.value} (expired? ${ref.price.isExpired})`);
  console.log(`threshold    : $${Number(artifacts.thresholdPrice) / 1e6}`);
  console.log(`oracle utxo  : ${ref.outRef.txHash}#${ref.outRef.outputIndex}`);
  if (ref.price.rawValue < BigInt(artifacts.thresholdPrice)) {
    throw new Error(`price below threshold; claim would fail on-chain`);
  }

  // ---- 2) Lucid: build + submit claim tx ----
  const lucid = await Lucid(
    new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", projectId),
    NETWORK,
  );
  lucid.selectWallet.fromSeed(seed);
  const walletAddress = await lucid.wallet().address();

  const [oracleUtxo] = await lucid.utxosByOutRef([ref.outRef]);
  if (!oracleUtxo) throw new Error("oracle utxo not visible yet");

  const scriptUtxos = await lucid.utxosAt(artifacts.scriptAddress);
  const locked = scriptUtxos.find((u) => u.txHash === artifacts.depositTx);
  if (!locked) throw new Error("locked utxo not found at script address");

  const validator: Validator = {
    type: "PlutusV2",
    script: artifacts.scriptCborHex,
  };
  const redeemer = Data.to(new Constr(0, [])); // Redeemer = Claim

  const tx = await lucid
    .newTx()
    .collectFrom([locked], redeemer)
    .readFrom([oracleUtxo])
    .addSignerKey(artifacts.beneficiaryPkh)
    .attach.SpendingValidator(validator)
    .pay.ToAddress(walletAddress, { lovelace: 0n }) // all change to wallet
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  console.log(`submitted claim tx: ${txHash}`);
  console.log(`https://preprod.cardanoscan.io/transaction/${txHash}`);

  artifacts.claimTx = txHash;
  fs.writeFileSync(artifactsPath, JSON.stringify(artifacts, null, 2));

  console.log();
  console.log("waiting for confirmation...");
  await lucid.awaitTx(txHash);
  console.log("confirmed. funds claimed from contract via SDK + Aiken.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
