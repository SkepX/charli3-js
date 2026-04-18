import { Charli3 } from "../src";

async function main() {
  const pair = process.argv[2] ?? "ADA/USD";
  const c3 = new Charli3({ network: "preprod" });

  console.log(`\nODV Round 1: requesting ${pair} from oracle nodes...\n`);

  const result = await c3.collectFeeds(pair);

  const start = new Date(result.validityInterval.start).toISOString();
  const end = new Date(result.validityInterval.end).toISOString();
  console.log(`Validity interval: ${start} -> ${end}\n`);
  console.log(
    `Received ${result.feeds.length} feeds, ${result.failed.length} failed\n`,
  );

  for (const f of result.feeds) {
    const mark = result.outliers.includes(f) ? " [OUTLIER]" : "";
    const ts = new Date(f.timestamp).toISOString();
    console.log(
      `  ${f.nodeUrl.padEnd(30)} ${f.value.toFixed(6)}  @ ${ts}${mark}`,
    );
  }

  if (result.failed.length > 0) {
    console.log("\nFailed nodes:");
    for (const f of result.failed) {
      console.log(`  ${f.nodeUrl}: ${f.error}`);
    }
  }

  if (result.feeds.length > 0) {
    console.log(`\n--> Aggregated median: ${result.median}`);
  } else {
    console.log("\n(no feeds collected — see errors above)");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
