import { Charli3, verifyFeedSignature } from "../src";

async function main() {
  const pair = process.argv[2] ?? "ADA/USD";
  const c3 = new Charli3({ network: "preprod" });

  console.log(`\nCollecting ${pair} feeds with ed25519 verification...\n`);

  const result = await c3.collectFeeds(pair, { verifySignatures: true });
  console.log(`ok: ${result.feeds.length} feeds passed verification`);
  console.log(`median: ${result.median}\n`);

  console.log("Independent verification (same result):");
  for (const feed of result.feeds) {
    const ok = verifyFeedSignature(feed);
    const mark = ok ? "OK" : "FAIL";
    console.log(`  [${mark}] ${feed.nodeUrl} -> ${feed.value}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
