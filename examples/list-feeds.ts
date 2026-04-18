import { Charli3 } from "../src";

async function main() {
  const c3 = new Charli3({ network: "preprod" });

  console.log("\nAvailable preprod feeds:\n");
  for (const feed of c3.listFeeds()) {
    console.log(`  ${feed.pair.padEnd(10)} -> ${feed.address}`);
  }

  console.log("\nReading all feeds in parallel...\n");
  const prices = await c3.getAllPrices();
  for (const p of prices) {
    const age = Math.floor((Date.now() - p.createdAt.getTime()) / 60000);
    console.log(
      `  ${p.pair.padEnd(10)} ${p.value.toFixed(p.precision)}  (updated ${age}m ago)`,
    );
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
