import { Charli3 } from "charli3-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pair = new URL(req.url).searchParams.get("pair") ?? "ADA/USD";
  try {
    const c3 = new Charli3({ network: "preprod" });
    const ref = await c3.getOdvReference(pair);
    return NextResponse.json({
      pair: ref.pair,
      policyId: ref.policyId,
      tokenName: ref.tokenName,
      address: ref.address,
      outRef: ref.outRef,
      price: {
        value: ref.price.value,
        rawValue: ref.price.rawValue.toString(),
        precision: ref.price.precision,
        createdAt: ref.price.createdAt.toISOString(),
        expiresAt: ref.price.expiresAt.toISOString(),
        isExpired: ref.price.isExpired,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
