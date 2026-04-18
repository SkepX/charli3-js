/*
 * Deposit: lock 10 tADA at price_gated_payout with
 *   datum = { threshold_price: 100_000 (==$0.10), beneficiary: wallet pkh }.
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
  credentialToAddress,
  getAddressDetails,
  paymentCredentialOf,
  walletFromSeed,
  type Validator,
} from "@lucid-evolution/lucid";

const NETWORK = "Preprod" as const;
const DEPOSIT_LOVELACE = 10_000_000n; // 10 tADA
const THRESHOLD_PRICE = 100_000n;     // $0.10 at precision 6

const artifactsPath = path.join(__dirname, "artifacts.json");
const walletSeedPath = path.join(__dirname, ".wallet.seed");

async function main() {
  const projectId = process.env.BLOCKFROST_PROJECT_ID;
  if (!projectId) throw new Error("set BLOCKFROST_PROJECT_ID=preprod...");

  const artifacts = JSON.parse(fs.readFileSync(artifactsPath, "utf-8"));
  const seed = fs.readFileSync(walletSeedPath, "utf-8").trim();

  const lucid = await Lucid(
    new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", projectId),
    NETWORK,
  );
  lucid.selectWallet.fromSeed(seed);

  const walletAddress = await lucid.wallet().address();
  const { paymentCredential } = getAddressDetails(walletAddress);
  if (!paymentCredential) throw new Error("no payment credential");
  const beneficiaryPkh = paymentCredential.hash;

  console.log(`wallet         ${walletAddress}`);
  console.log(`beneficiary    ${beneficiaryPkh}`);
  console.log(`script address ${artifacts.scriptAddress}`);
  console.log(`threshold      ${THRESHOLD_PRICE} ( $${Number(THRESHOLD_PRICE) / 1e6} )`);
  console.log(`depositing     ${Number(DEPOSIT_LOVELACE) / 1e6} tADA`);
  console.log();

  // datum = Constr 0 [threshold_price, beneficiary_pkh]
  const datum = Data.to(
    new Constr(0, [THRESHOLD_PRICE, beneficiaryPkh]),
  );

  const tx = await lucid
    .newTx()
    .pay.ToContract(
      artifacts.scriptAddress,
      { kind: "inline", value: datum },
      { lovelace: DEPOSIT_LOVELACE },
    )
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  console.log(`submitted deposit tx: ${txHash}`);
  console.log(`https://preprod.cardanoscan.io/transaction/${txHash}`);

  artifacts.depositTx = txHash;
  artifacts.beneficiaryPkh = beneficiaryPkh;
  artifacts.thresholdPrice = THRESHOLD_PRICE.toString();
  fs.writeFileSync(artifactsPath, JSON.stringify(artifacts, null, 2));

  console.log();
  console.log("waiting for confirmation...");
  await lucid.awaitTx(txHash);
  console.log("confirmed. run `npm run demo:claim` next.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
