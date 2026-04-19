/*
 * Demo setup.
 *
 * - Applies oracle (policy_id, token_name) params to the compiled validator
 *   and computes the preprod script address.
 * - Generates a fresh preprod wallet, writes the seed to ./demo/.wallet.seed
 *   (git-ignored) and prints the wallet address so you can fund it from the
 *   faucet: https://docs.cardano.org/cardano-testnets/tools/faucet
 */

import fs from "fs";
import path from "path";
import {
  applyParamsToScript,
  generateSeedPhrase,
  validatorToAddress,
  walletFromSeed,
  type SpendingValidator,
  type Validator,
} from "@lucid-evolution/lucid";
import { PRESETS } from "../src";

const NETWORK = "Preprod" as const;
// Parameterize the validator with the ODV (pull-oracle) policy + the C3AS
// AggState token. Refresh writes the AggState datum → claim reads that same
// datum, so the full pull-oracle loop is one coherent cycle.
const FEED_POLICY = PRESETS.preprod.odvFeeds["ADA/USD"].policyId;
const FEED_TOKEN_HEX = Buffer.from("C3AS", "utf8").toString("hex");

const plutusPath = path.join(__dirname, "../contracts/plutus.json");
const walletSeedPath = path.join(__dirname, ".wallet.seed");
const artifactsPath = path.join(__dirname, "artifacts.json");

async function main() {
  const blueprint = JSON.parse(fs.readFileSync(plutusPath, "utf-8"));
  const v = blueprint.validators[0];
  const rawCbor = v.compiledCode;

  // params: [oracle_policy_id: ByteArray, oracle_token_name: ByteArray]
  const paramBytes = [FEED_POLICY, FEED_TOKEN_HEX];
  const appliedCbor = applyParamsToScript(rawCbor, paramBytes);

  const validator: Validator = {
    type: "PlutusV2",
    script: appliedCbor,
  };
  const scriptAddress = validatorToAddress(NETWORK, validator as SpendingValidator);

  // wallet
  let seed: string;
  if (fs.existsSync(walletSeedPath)) {
    seed = fs.readFileSync(walletSeedPath, "utf-8").trim();
    console.log(`(reusing wallet at ${walletSeedPath})`);
  } else {
    seed = generateSeedPhrase();
    fs.writeFileSync(walletSeedPath, seed + "\n", { mode: 0o600 });
    console.log(`new wallet written to ${walletSeedPath} (keep secret, gitignored)`);
  }

  const { address: walletAddress } = walletFromSeed(seed, {
    network: NETWORK,
    addressType: "Base",
    accountIndex: 0,
  });

  const artifacts = {
    network: NETWORK,
    oraclePolicyId: FEED_POLICY,
    oracleTokenNameHex: FEED_TOKEN_HEX,
    scriptCborHex: appliedCbor,
    scriptAddress,
    walletAddress,
    faucetUrl: "https://docs.cardano.org/cardano-testnets/tools/faucet",
  };
  fs.writeFileSync(artifactsPath, JSON.stringify(artifacts, null, 2));

  console.log();
  console.log("script address :", scriptAddress);
  console.log("wallet address :", walletAddress);
  console.log();
  console.log("next:");
  console.log("  1. fund the wallet above with the preprod faucet (10 000 tADA):");
  console.log("     https://docs.cardano.org/cardano-testnets/tools/faucet");
  console.log("  2. grab a free preprod Blockfrost project id:");
  console.log("     https://blockfrost.io  ->  add new project  ->  Network: Cardano preprod");
  console.log("  3. run the web demo:");
  console.log("     cd demo-nextjs");
  console.log("     npm install");
  console.log("     echo 'NEXT_PUBLIC_BLOCKFROST_PROJECT_ID=preprod...' > .env.local");
  console.log("     npm run dev        # open http://localhost:3000");
  console.log();
  console.log("artifacts saved to", artifactsPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
