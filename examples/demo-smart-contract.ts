/*
 * Smart-contract integration demo.
 *
 * Scenario: you are writing a Cardano DApp whose on-chain validator
 * (contracts/validators/price_gated_payout.ak) unlocks locked ADA only
 * when the Charli3 ADA/USD feed reports a price >= some threshold.
 * This demo walks through every off-chain step the SDK does for you.
 */

import { Charli3, KupoProvider, PRESETS } from "../src";

const THRESHOLD_USD = 0.3;
const PAIR = "ADA/USD";

function section(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

async function main() {
  section(`DEMO: price-gated payout DApp — threshold $${THRESHOLD_USD}`);
  console.log(
    [
      "You are building a DApp whose on-chain validator",
      "(contracts/validators/price_gated_payout.ak) unlocks funds only when",
      `the Charli3 ${PAIR} feed reports a price >= $${THRESHOLD_USD}.`,
      "Below is everything charli3-js does for your off-chain code.",
    ].join("\n"),
  );

  const c3 = new Charli3({ network: "preprod" });
  const kupo = new KupoProvider(PRESETS.preprod.kupoUrl);

  section("Step 1. Read the on-chain oracle feed");
  const price = await c3.getPrice(PAIR);
  console.log(`  pair         ${price.pair}`);
  console.log(`  value        $${price.value}`);
  console.log(`  raw          ${price.rawValue} (precision ${price.precision})`);
  console.log(`  created      ${price.createdAt.toISOString()}`);
  console.log(`  expires      ${price.expiresAt.toISOString()}`);
  console.log(`  isExpired    ${price.isExpired}`);
  console.log();
  console.log("  One line in your app:");
  console.log('    const price = await c3.getPrice("ADA/USD");');

  section("Step 2. Locate the oracle UTXO (your contract's ref input)");
  const feed = PRESETS.preprod.feeds[PAIR];
  const utxo = await kupo.findOracleUtxo(feed.policyId, feed.tokenName);
  console.log(`  policy id    ${feed.policyId}`);
  console.log(`  token name   ${feed.tokenName}  ("OracleFeed")`);
  console.log(`  tx hash      ${utxo.txHash}`);
  console.log(`  output idx   ${utxo.outputIndex}`);
  console.log(`  address      ${utxo.address}`);
  console.log();
  console.log("  Attach (txHash, outputIndex) as a reference input and your");
  console.log("  validator can read the inline datum without spending it.");

  section("Step 3. Would your validator accept the spend right now?");
  const priceOk = price.value >= THRESHOLD_USD;
  const fresh = !price.isExpired;
  const verdict = priceOk && fresh;
  const mark = (ok: boolean) => (ok ? "pass" : "fail");
  console.log(
    `  price >= $${THRESHOLD_USD}       ${mark(priceOk)}  (actual $${price.value})`,
  );
  console.log(`  oracle not expired   ${mark(fresh)}`);
  console.log(`\n  Verdict: would this tx validate on-chain today?  ${verdict ? "YES" : "NO"}`);
  if (!verdict) {
    const reasons: string[] = [];
    if (!priceOk) reasons.push(`price $${price.value} < $${THRESHOLD_USD}`);
    if (!fresh) reasons.push("preprod push feed is stale");
    console.log(`  (reason: ${reasons.join(", ")})`);
  }

  section("Step 4. Pull a fresh signed feed via ODV");
  console.log("  For live price discovery before submitting a tx, ask the");
  console.log("  oracle nodes directly:\n");
  const result = await c3.collectFeeds(PAIR);
  console.log(`  median       $${result.median}`);
  console.log(`  feeds        ${result.feeds.length}`);
  console.log(`  failed       ${result.failed.length}`);
  for (const f of result.feeds) {
    console.log(
      `    ${f.nodeUrl.padEnd(30)} $${f.value.toFixed(6)}  @ ${new Date(
        f.timestamp,
      ).toISOString()}`,
    );
  }

  section("Step 5. The on-chain side (Aiken, ~5 lines of logic)");
  console.log(
    [
      "  expect InlineDatum(raw) = oracle_input.output.datum",
      "  expect oracle: OracleDatum = raw",
      "  let price_ok = get_oracle_price(oracle) >= datum.threshold_price",
      "  let fresh    = is_oracle_valid(oracle, tx_upper_bound)",
      "  let signed   = list.has(extra_signatories, datum.beneficiary)",
      "",
      "  price_ok? && fresh? && signed?",
    ].join("\n"),
  );

  section("Summary");
  console.log("  off-chain TypeScript   charli3-js   (this SDK)");
  console.log("  on-chain Aiken         contracts/validators/price_gated_payout.ak");
  console.log("  config required        zero (preprod presets ship with the SDK)");
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
