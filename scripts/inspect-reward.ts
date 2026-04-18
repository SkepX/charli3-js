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
  const raUnit = `${ada.policyId}${Buffer.from("C3RA", "utf8").toString("hex")}`;
  const raList = utxos.filter((u) => (u.assets[raUnit] ?? 0n) >= 1n);
  console.log(`found ${raList.length} reward account utxos`);
  raList.slice(0, 3).forEach((u, i) => {
    console.log(`\nreward #${i}:`);
    console.log(`  datum: ${u.datum}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
