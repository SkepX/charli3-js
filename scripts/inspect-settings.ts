import { Kupmios } from "@lucid-evolution/provider";
import { Lucid } from "@lucid-evolution/lucid";
import { Charli3, PREPROD, parseOracleSettings } from "../src";

async function main() {
  const provider = new Kupmios(PREPROD.kupoUrl!, PREPROD.ogmiosUrl!);
  const lucid = await Lucid(provider, "Preprod");
  const c3 = new Charli3({ network: "preprod" });
  const feeds = c3.listOdvFeeds();
  const ada = feeds.find((f) => f.pair === "ADA/USD")!;
  console.log("feed:", ada.pair, "addr:", ada.oracleAddress.slice(0, 40));
  const utxos = await lucid.utxosAt(ada.oracleAddress);
  const csUnit = `${ada.policyId}${Buffer.from("C3CS", "utf8").toString("hex")}`;
  const settingsUtxo = utxos.find((u) => (u.assets[csUnit] ?? 0n) >= 1n)!;
  if (!settingsUtxo || !settingsUtxo.datum) {
    console.log("no settings utxo");
    return;
  }
  console.log("datum hex len:", settingsUtxo.datum.length / 2);
  const parsed = parseOracleSettings(settingsUtxo.datum);
  console.log("parsed:", {
    nodes: parsed.nodeVkhsHex.length,
    required: parsed.requiredNodeSignaturesCount,
    aggregationLivenessMs: parsed.aggregationLivenessPeriodMs.toString(),
    timeUncertaintyAggregationMs: parsed.timeUncertaintyAggregationMs.toString(),
    timeUncertaintyPlatformMs: parsed.timeUncertaintyPlatformMs.toString(),
    nodeFee: parsed.feeInfo.rewardPrices.nodeFee.toString(),
    platformFee: parsed.feeInfo.rewardPrices.platformFee.toString(),
    rateNft: parsed.feeInfo.rateNft,
    pause: parsed.pausePeriodStartedAtMs,
  });
  console.log("\nRaw first 400 hex chars:");
  console.log(settingsUtxo.datum.slice(0, 400));
}

main().catch((e) => { console.error(e); process.exit(1); });
