/*
 * Standalone setup for the Next.js demo.
 *
 * - Reads the Aiken blueprint shipped in this package (./plutus.json).
 * - Applies the ODV policy id + C3AS token name to parameterize the validator.
 * - Generates a preprod wallet the server uses to pay for Round 2 refreshes
 *   and writes the seed to ./.wallet.seed (gitignored).
 * - Emits ./artifacts.json that the /api/script route hands to the browser.
 *
 * Imports charli3-js from npm, so you do not need the SDK source to run this.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyParamsToScript,
  generateSeedPhrase,
  validatorToAddress,
  walletFromSeed,
  type SpendingValidator,
  type Validator,
} from "@lucid-evolution/lucid";
import { PRESETS } from "charli3-js";

const NETWORK = "Preprod" as const;
const FEED_POLICY = PRESETS.preprod.odvFeeds["ADA/USD"].policyId;
const FEED_TOKEN_HEX = Buffer.from("C3AS", "utf8").toString("hex");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const plutusPath = path.join(root, "plutus.json");
const walletSeedPath = path.join(root, ".wallet.seed");
const artifactsPath = path.join(root, "artifacts.json");

async function main() {
  const blueprint = JSON.parse(fs.readFileSync(plutusPath, "utf-8"));
  const rawCbor = blueprint.validators[0].compiledCode;
  const appliedCbor = applyParamsToScript(rawCbor, [FEED_POLICY, FEED_TOKEN_HEX]);

  const validator: Validator = { type: "PlutusV2", script: appliedCbor };
  const scriptAddress = validatorToAddress(NETWORK, validator as SpendingValidator);

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

  fs.writeFileSync(
    artifactsPath,
    JSON.stringify(
      {
        network: NETWORK,
        oraclePolicyId: FEED_POLICY,
        oracleTokenNameHex: FEED_TOKEN_HEX,
        scriptCborHex: appliedCbor,
        scriptAddress,
        walletAddress,
        faucetUrl: "https://docs.cardano.org/cardano-testnets/tools/faucet",
      },
      null,
      2,
    ),
  );

  console.log();
  console.log("script address :", scriptAddress);
  console.log("wallet address :", walletAddress);
  console.log();
  console.log("next:");
  console.log("  1. fund the wallet above with 10 000 tADA from the preprod faucet:");
  console.log("     https://docs.cardano.org/cardano-testnets/tools/faucet");
  console.log("  2. grab a free preprod Blockfrost project id:");
  console.log("     https://blockfrost.io  ->  add new project  ->  Network: Cardano preprod");
  console.log("  3. put the project id in .env.local:");
  console.log("     echo 'NEXT_PUBLIC_BLOCKFROST_PROJECT_ID=preprod...' > .env.local");
  console.log("  4. npm run dev        # open http://localhost:3000");
  console.log();
  console.log("artifacts saved to", artifactsPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
