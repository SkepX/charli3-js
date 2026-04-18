import { Kupmios } from "@lucid-evolution/provider";
import { Lucid } from "@lucid-evolution/lucid";
import { Charli3, PREPROD } from "../src";

async function main() {
  const provider = new Kupmios(PREPROD.kupoUrl!, PREPROD.ogmiosUrl!);
  const lucid = await Lucid(provider, "Preprod");
  const c3 = new Charli3({ network: "preprod" });
  const feeds = c3.listOdvFeeds();
  const ada = feeds.find((f) => f.pair === "ADA/USD")!;
  const utxos = await lucid.utxosAt(ada.oracleAddress);
  const asUnit = `${ada.policyId}${Buffer.from("C3AS", "utf8").toString("hex")}`;
  const aggStates = utxos.filter((u) => (u.assets[asUnit] ?? 0n) >= 1n);
  console.log(`found ${aggStates.length} aggstate utxos`);
  aggStates.slice(0, 3).forEach((u, i) => {
    console.log(`\naggstate #${i}:`);
    console.log(`  datum: ${u.datum}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
