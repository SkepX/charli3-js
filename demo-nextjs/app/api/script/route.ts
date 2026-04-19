import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function loadArtifacts(): Record<string, string> {
  const envJson = process.env.DEMO_ARTIFACTS_JSON;
  if (envJson) return JSON.parse(envJson);
  const artifactsPath = path.join(process.cwd(), "artifacts.json");
  const raw = fs.readFileSync(artifactsPath, "utf-8");
  return JSON.parse(raw);
}

export async function GET() {
  try {
    const a = loadArtifacts();
    return NextResponse.json({
      network: a.network,
      scriptAddress: a.scriptAddress,
      scriptCborHex: a.scriptCborHex,
      thresholdPrice: a.thresholdPrice ?? "100000",
      oraclePolicyId: a.oraclePolicyId,
      oracleTokenNameHex: a.oracleTokenNameHex,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `script artifacts unavailable: ${msg}. Run \`npm run setup\` locally, or set DEMO_ARTIFACTS_JSON in your deploy env.`,
      },
      { status: 500 },
    );
  }
}
