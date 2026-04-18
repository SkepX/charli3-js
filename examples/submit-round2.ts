/**
 * Round-2 ODV submission end-to-end. Uses the preprod demo wallet at
 * ./demo/.wallet.seed (created by `npm run demo:setup`).
 *
 * Usage:
 *   npx ts-node examples/submit-round2.ts [PAIR] [--dry-run]
 */
import fs from "fs";
import path from "path";
import { Charli3, PREPROD } from "../src";
import { Kupmios } from "@lucid-evolution/provider";
import { Lucid } from "@lucid-evolution/lucid";

function parseArgs() {
  const args = process.argv.slice(2);
  const pair = args.find((a) => !a.startsWith("--")) ?? "ADA/USD";
  const dryRun = args.includes("--dry-run");
  return { pair, dryRun };
}

async function main() {
  const { pair, dryRun } = parseArgs();
  const walletSeedPath = path.join(__dirname, "..", "demo", ".wallet.seed");
  if (!fs.existsSync(walletSeedPath)) {
    throw new Error(
      `No wallet at ${walletSeedPath} — run \`npm run demo:setup\` first.`,
    );
  }
  const seed = fs.readFileSync(walletSeedPath, "utf-8").trim();

  const ogmiosUrl = process.env.OGMIOS_URL ?? PREPROD.ogmiosUrl!;
  const kupoUrl = process.env.KUPO_URL ?? PREPROD.kupoUrl;

  const provider = new Kupmios(kupoUrl, ogmiosUrl);
  const lucid = await Lucid(provider, "Preprod");
  lucid.selectWallet.fromSeed(seed);
  const addr = await lucid.wallet().address();
  console.log(`wallet: ${addr}`);

  const c3 = new Charli3({ network: "preprod", kupoUrl });

  console.log(`\nRound 2 for ${pair} (dryRun=${dryRun})\n`);

  const result = await c3.submitRound2(lucid, pair, { dryRun });

  const { build, aggregateMessage, signatureCollection, txHash } = result;
  console.log(
    `  feeds collected       : ${aggregateMessage.sortedFeeds.length}`,
  );
  console.log(`  median                : ${aggregateMessage.median}`);
  console.log(
    `  node signatures ok    : ${signatureCollection.signatures.length}/${signatureCollection.signatures.length + signatureCollection.failed.length}`,
  );
  console.log(`  min fee (lovelace)    : ${build.minFee}`);
  console.log(
    `  validity window       : ${new Date(build.validityMs.startMs).toISOString()} -> ${new Date(build.validityMs.endMs).toISOString()}`,
  );
  console.log(
    `  reward distribution   : ${build.rewardDistribution.length} entries`,
  );

  if (dryRun) {
    console.log(`\n[dry run] signed tx cbor length: ${result.signedTxCborHex.length / 2} bytes`);
    return;
  }

  console.log(`\nSubmitted tx: ${txHash}`);
}

main().catch((err) => {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
});
