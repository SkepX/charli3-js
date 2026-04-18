import { Charli3 } from "../src";

async function main() {
  const c3 = new Charli3({ network: "preprod" });

  const price = await c3.getPrice("ADA/USD");

  console.log(`\n${price.pair}: ${price.value.toFixed(price.precision)}`);
  console.log(`  raw:       ${price.rawValue}`);
  console.log(`  precision: ${price.precision}`);
  console.log(`  created:   ${price.createdAt.toISOString()}`);
  console.log(`  expires:   ${price.expiresAt.toISOString()}`);
  console.log(`  expired?:  ${price.isExpired}`);
  console.log(`  tx:        ${price.txHash}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
