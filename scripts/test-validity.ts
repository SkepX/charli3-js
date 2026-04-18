// Test if the validity check is the issue by passing an EXPLICIT wide validity
// via submitRound2's opts.validity override (len > 300000ms should hit <= fail)
import fs from "fs";
import path from "path";
import { Charli3, PREPROD } from "../src";
import { Kupmios } from "@lucid-evolution/provider";
import { Lucid } from "@lucid-evolution/lucid";

async function main() {
  const seed = fs.readFileSync(path.join(__dirname, "..", "demo", ".wallet.seed"), "utf-8").trim();
  const provider = new Kupmios(PREPROD.kupoUrl!, PREPROD.ogmiosUrl!);
  const lucid = await Lucid(provider, "Preprod");
  lucid.selectWallet.fromSeed(seed);
  const c3 = new Charli3({ network: "preprod" });

  const now = Date.now();
  // 500s window — definitely > 300000ms time_accuracy. If the check is on
  // validity_range_size, this should fail PRE-T4 via the builder's validity
  // length error (throw) or fail AT T4 with <= check.
  const startMs = now;
  const endMs = now + 500_000;

  try {
    await c3.submitRound2(lucid, "ADA/USD", {
      dryRun: true,
      validity: { startMs, endMs },
    });
  } catch (e: any) {
    console.log("error:", e?.message ?? e);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
