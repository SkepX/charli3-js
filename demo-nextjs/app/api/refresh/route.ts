import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { Charli3 } from "charli3-js";
import { Lucid, Blockfrost } from "@lucid-evolution/lucid";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function loadDemoSeed(): string {
  const envSeed = process.env.DEMO_WALLET_SEED?.trim();
  if (envSeed) return envSeed;
  const seedPath = path.join(process.cwd(), ".wallet.seed");
  const raw = fs.readFileSync(seedPath, "utf-8").trim();
  if (!raw) throw new Error(".wallet.seed is empty");
  return raw;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const pair = typeof body.pair === "string" ? body.pair : "ADA/USD";

  const projectId = process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID;
  if (!projectId) {
    return NextResponse.json(
      { error: "Set NEXT_PUBLIC_BLOCKFROST_PROJECT_ID in .env.local" },
      { status: 500 },
    );
  }

  try {
    const seed = loadDemoSeed();
    const lucid = await Lucid(
      new Blockfrost(
        "https://cardano-preprod.blockfrost.io/api/v0",
        projectId,
      ),
      "Preprod",
    );
    lucid.selectWallet.fromSeed(seed);

    const c3 = new Charli3({ network: "preprod" });
    const result = await c3.submitRound2(lucid, pair);

    return NextResponse.json({
      txHash: result.txHash,
      pair,
      median: result.build.medianValue.toString(),
      validityMs: result.build.validityMs,
      feedsUsed: result.build.rewardDistribution.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
