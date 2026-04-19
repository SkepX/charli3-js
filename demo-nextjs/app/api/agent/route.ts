import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { Charli3 } from "charli3-js";
import { Lucid, Blockfrost } from "@lucid-evolution/lucid";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a Cardano payment agent running inside a Charli3 demo. The user drops USD invoices and you help settle them in ADA on the Cardano preprod testnet.

You have four tools:
- get_charli3_ada_usd: reads the current on-chain ADA/USD price from the Charli3 ODV pull oracle (Round-2 aggregate datum). Returns is_expired. Never guess a price.
- submit_round2_refresh: posts a fresh Round-2 aggregate tx on Cardano preprod so the on-chain price becomes fresh. Call this ONLY if get_charli3_ada_usd returned is_expired: true. Takes ~30s.
- validate_address: validates a preprod bech32 address (addr_test1...). Trust its "valid" field - if it says valid: true, the address is good, proceed.
- propose_payment: creates a payment proposal the user signs with Lace. Call only AFTER you have a fresh oracle price and a validated address.

Workflow:
1. Parse the USD amount and the preprod address (addr_test1...) from the user's invoice text. If either is missing, ask for it briefly.
2. Call get_charli3_ada_usd.
3. If the result has is_expired: true, call submit_round2_refresh to post a new aggregate tx, then call get_charli3_ada_usd again to read the fresh price. Skip this if the first read is already fresh.
4. Call validate_address on the address. If it returns valid: true, proceed - do NOT claim the address is invalid when the tool said it is valid.
5. Compute ada_amount = usd_amount / oracle_price.
6. Call propose_payment. After it returns, reply with ONE sentence that (a) says you pulled ADA/USD from Charli3's ODV pull oracle, (b) gives the rate, and (c) says "sign in Lace below". Example: "I pulled ADA/USD from Charli3 ODV - $0.324812 per ADA, so $2.50 = 7.6967 ADA. Sign in Lace below."

When the user tells you "Paid. Tx hash: <hex>":
- Confirm in one line and include the Cardanoscan link exactly as: https://preprod.cardanoscan.io/transaction/<hex>
- Remind them the rate came from Charli3's ODV pull oracle.
- Do NOT call any more tools.
- Example: "Paid ✓ - settled at the ODV-pulled rate. https://preprod.cardanoscan.io/transaction/abc123…"

Network: Cardano preprod only. Addresses must start with addr_test1. Currency displayed: ADA (it's really tADA). Keep all replies to 1–2 sentences. Never invent a price or address. Always credit Charli3 ODV when mentioning the rate.`;

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_charli3_ada_usd",
      description:
        "Read the latest on-chain ADA/USD price from the Charli3 pull oracle. Returns price, timestamps, freshness, and the oracle UTXO.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "submit_round2_refresh",
      description:
        "Post a fresh Round-2 aggregate tx on Cardano preprod so the on-chain ADA/USD price is fresh. Use ONLY when get_charli3_ada_usd returned is_expired: true. Takes ~30s to confirm.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "validate_address",
      description:
        "Validate a preprod Cardano address (must start with addr_test1) so the payment goes to a real recipient. Returns an error for mainnet addresses or malformed input.",
      parameters: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Preprod bech32 Cardano address starting with addr_test1",
          },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_payment",
      description:
        "Propose a payment for the user to sign with Lace. Call only after you have the oracle price and validated address.",
      parameters: {
        type: "object",
        properties: {
          recipient_address: { type: "string" },
          usd_amount: { type: "number" },
          ada_amount: { type: "number" },
          oracle_price: { type: "number" },
          oracle_utxo: { type: "string" },
          reason: { type: "string" },
        },
        required: [
          "recipient_address",
          "usd_amount",
          "ada_amount",
          "oracle_price",
          "reason",
        ],
      },
    },
  },
];

async function toolGetCharli3() {
  const c3 = new Charli3({ network: "preprod" });
  const ref = await c3.getOdvReference("ADA/USD");
  return {
    pair: ref.pair,
    price_usd_per_ada: ref.price.value,
    posted_at: ref.price.createdAt.toISOString(),
    expires_at: ref.price.expiresAt.toISOString(),
    is_expired: ref.price.isExpired,
    oracle_utxo: `${ref.outRef.txHash}#${ref.outRef.outputIndex}`,
  };
}

function toolValidateAddress(address: string) {
  const addr = address.trim();
  if (!addr) {
    return { error: "Empty address." };
  }
  if (addr.startsWith("addr1")) {
    return {
      error:
        "That's a mainnet address (addr1...). This demo runs on Cardano preprod - ask for a preprod address starting with addr_test1.",
    };
  }
  if (!addr.startsWith("addr_test1")) {
    return {
      error:
        "Not a preprod Cardano address. Expected a bech32 address starting with addr_test1.",
    };
  }
  if (addr.length < 50 || addr.length > 130) {
    return { error: `Address length looks wrong (${addr.length} chars).` };
  }
  if (!/^addr_test1[0-9a-z]+$/.test(addr)) {
    return { error: "Address has invalid characters for bech32." };
  }
  return {
    valid: true,
    address: addr,
    message: "Address is a valid preprod bech32 address. Proceed with propose_payment.",
  };
}

async function toolSubmitRound2Refresh(): Promise<
  | { ok: true; tx_hash: string; median: string; feeds_used: number }
  | { error: string }
> {
  const projectId = process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID;
  if (!projectId) {
    return { error: "NEXT_PUBLIC_BLOCKFROST_PROJECT_ID is not set." };
  }
  let seed = process.env.DEMO_WALLET_SEED?.trim() ?? "";
  if (!seed) {
    const seedPath = path.join(process.cwd(), ".wallet.seed");
    try {
      seed = fs.readFileSync(seedPath, "utf-8").trim();
    } catch {
      return {
        error:
          "No demo wallet seed configured. Run `npm run setup` locally, or set DEMO_WALLET_SEED in your deploy env.",
      };
    }
  }
  if (!seed) return { error: "demo wallet seed is empty." };

  const lucid = await Lucid(
    new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", projectId),
    "Preprod",
  );
  lucid.selectWallet.fromSeed(seed);
  const c3 = new Charli3({ network: "preprod" });
  const result = await c3.submitRound2(lucid, "ADA/USD");
  if (!result.txHash) {
    return { error: "Round-2 submission did not return a tx hash." };
  }
  await lucid.awaitTx(result.txHash);
  return {
    ok: true,
    tx_hash: result.txHash,
    median: result.build.medianValue.toString(),
    feeds_used: result.build.rewardDistribution.length,
  };
}

interface TraceStep {
  tool: string;
  label: string;
  detail: string;
  ok: boolean;
  link?: { label: string; url: string };
}

function summarizeToolCall(
  name: string,
  args: Record<string, unknown>,
): { label: string; pending: string } {
  if (name === "get_charli3_ada_usd") {
    return {
      label: "Pull ADA/USD from Charli3 ODV",
      pending: "Reading the on-chain aggregate datum at the ODV address…",
    };
  }
  if (name === "submit_round2_refresh") {
    return {
      label: "Post fresh Round-2 tx",
      pending:
        "Aggregating feeds and submitting a new ODV Round-2 tx to preprod (~30s)…",
    };
  }
  if (name === "validate_address") {
    const raw = String(args.address ?? "");
    const short = raw ? `${raw.slice(0, 18)}…${raw.slice(-6)}` : "";
    return {
      label: "Validate preprod address",
      pending: `Checking ${short || "address"} is a well-formed addr_test1.`,
    };
  }
  if (name === "propose_payment") {
    const usd = args.usd_amount as number | undefined;
    const ada = args.ada_amount as number | undefined;
    const rate = args.oracle_price as number | undefined;
    return {
      label: "Build payment proposal",
      pending:
        usd != null && ada != null && rate != null
          ? `$${usd} / $${rate} ≈ ${ada.toFixed(4)} ADA`
          : "Computing ADA amount and drafting proposal.",
    };
  }
  return { label: name, pending: "Running tool…" };
}

function summarizeToolResult(name: string, result: unknown): string {
  const r = result as Record<string, unknown>;
  if (r && typeof r === "object" && typeof r.error === "string") {
    return `✗ ${r.error}`;
  }
  if (name === "get_charli3_ada_usd") {
    const price = r.price_usd_per_ada as number | undefined;
    const fresh = r.is_expired === false ? "fresh" : "stale";
    const utxo = String(r.oracle_utxo ?? "");
    const short = utxo ? ` · UTXO ${utxo.slice(0, 14)}…` : "";
    return `✓ $${price?.toFixed(6) ?? "?"} per ADA · ${fresh}${short}`;
  }
  if (name === "submit_round2_refresh") {
    const hash = String(r.tx_hash ?? "");
    const feeds = r.feeds_used as number | undefined;
    return `✓ posted · ${feeds ?? "?"} feeds aggregated · tx ${hash.slice(0, 14)}…`;
  }
  if (name === "validate_address") {
    return "✓ address is valid preprod";
  }
  if (name === "propose_payment") {
    return "✓ proposal ready - awaiting Lace signature";
  }
  return "✓ done";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const incoming: OpenAiMessage[] = Array.isArray(body.messages)
    ? body.messages
    : [];
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not set in demo-nextjs/.env.local - add it and restart the dev server.",
      },
      { status: 500 },
    );
  }

  const convo: OpenAiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...incoming.filter((m) => m.role === "user" || m.role === "assistant"),
  ];

  let paymentProposal: Record<string, unknown> | null = null;
  const trace: TraceStep[] = [];

  for (let step = 0; step < 8; step++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: convo,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `OpenAI error: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }
    const j = (await res.json()) as {
      choices: Array<{ message: OpenAiMessage }>;
    };
    const msg = j.choices[0]?.message;
    if (!msg) {
      return NextResponse.json({ error: "empty OpenAI response" }, { status: 502 });
    }
    convo.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const call of msg.tool_calls) {
        let result: unknown;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const { label, pending } = summarizeToolCall(call.function.name, args);
        try {
          if (call.function.name === "get_charli3_ada_usd") {
            result = await toolGetCharli3();
          } else if (call.function.name === "submit_round2_refresh") {
            result = await toolSubmitRound2Refresh();
          } else if (call.function.name === "validate_address") {
            result = toolValidateAddress(String(args.address ?? ""));
          } else if (call.function.name === "propose_payment") {
            paymentProposal = args;
            result = { accepted: true };
          } else {
            result = { error: `unknown tool: ${call.function.name}` };
          }
        } catch (err) {
          result = {
            error: err instanceof Error ? err.message : String(err),
          };
        }
        const r = result as Record<string, unknown>;
        const ok = !(r && typeof r === "object" && "error" in r);
        let link: TraceStep["link"];
        if (ok && call.function.name === "get_charli3_ada_usd") {
          const utxo = String(r.oracle_utxo ?? "");
          const hash = utxo.split("#")[0];
          if (hash) {
            link = {
              label: `ODV tx ${hash.slice(0, 10)}…`,
              url: `https://preprod.cardanoscan.io/transaction/${hash}`,
            };
          }
        }
        if (ok && call.function.name === "submit_round2_refresh") {
          const hash = String(r.tx_hash ?? "");
          if (hash) {
            link = {
              label: `Round-2 tx ${hash.slice(0, 10)}…`,
              url: `https://preprod.cardanoscan.io/transaction/${hash}`,
            };
          }
        }
        trace.push({
          tool: call.function.name,
          label,
          detail: `${pending}\n${summarizeToolResult(call.function.name, result)}`,
          ok,
          link,
        });
        convo.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    return NextResponse.json({
      message: msg.content ?? "",
      paymentProposal,
      trace,
    });
  }

  return NextResponse.json(
    { error: "Agent ran too many tool iterations without a final reply." },
    { status: 500 },
  );
}
