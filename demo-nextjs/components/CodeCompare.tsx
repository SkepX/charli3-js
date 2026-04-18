"use client";

import { useState } from "react";

const PY_CODE = `# 1. client.yaml - hand-authored config the SDK loads at boot

network: preprod
blockfrost:
  project_id_env: BLOCKFROST_PROJECT_ID
  base_url: https://cardano-preprod.blockfrost.io/api

wallet:
  mnemonic_env: WALLET_MNEMONIC
  account_index: 0
  address_index: 0

oracle:
  pair: ADA/USD
  address: addr_test1wq...charli3_odv_contract
  policy_id: 886dcb2363e160c944e63cf544ce6f6265b22ef7c4e2478dd975078e
  tokens:
    c3cs: "43334353"
    c3ra: "43334241"
    c3as: "43334153"
    c3rt: "43335254"
  odv_validity_length_ms: 300000
  price_precision: 6

reference_script:
  utxo_reference:
    tx_id: 6e1c...b7f4
    index: 0

nodes:
  - root_url: http://35.208.117.223:8001
    pub_key: ed25519_pub_1a9b...0f2c
  - root_url: http://35.208.117.223:8002
    pub_key: ed25519_pub_7c44...e81d
  - root_url: http://35.208.117.223:8003
    pub_key: ed25519_pub_3def...9a02
  - root_url: http://35.208.117.223:8004
    pub_key: ed25519_pub_b155...44a9
  - root_url: http://35.208.117.223:8005
    pub_key: ed25519_pub_2ea7...58b1
  - root_url: http://35.208.117.223:8006
    pub_key: ed25519_pub_90fc...6723

submit:
  collateral_min_lovelace: 5000000
  change_address_env: WALLET_ADDRESS
  tx_retries: 3
  confirmation_timeout_s: 90


# 2. refresh.py - the driver that reads client.yaml and submits

from charli3_offchain_core.client import OdvClient
from pycardano import BlockFrostChainContext, Network
import os, asyncio, sys

async def refresh():
    ctx = BlockFrostChainContext(
        project_id=os.environ["BLOCKFROST_PROJECT_ID"],
        network=Network.TESTNET,
    )
    client = OdvClient.from_yaml("client.yaml", ctx)

    # Pull signed feeds from every node, run IQR, build aggregate tx,
    # collect vkey witnesses, submit. About 30 seconds round trip.
    tx_id = await client.submit_round2(pair="ADA/USD")
    await client.wait_for_confirmation(tx_id)
    print("ADA/USD refreshed:", tx_id)

if __name__ == "__main__":
    try:
        asyncio.run(refresh())
    except Exception as e:
        print("refresh failed:", e, file=sys.stderr)
        sys.exit(1)

# Runs as a separate Python process. Has to live outside the
# Next.js runtime, so a web deployment needs a sidecar worker,
# a queue, or a remote microservice fronting this script.
`;

const JS_CODE = `// app/api/refresh/route.ts (the entire file)
import { Charli3 } from "charli3-js";
import { Lucid, Blockfrost } from "@lucid-evolution/lucid";
import { NextResponse } from "next/server";

export async function POST() {
  const lucid = await Lucid(
    new Blockfrost(URL, PROJECT_ID),
    "Preprod",
  );
  lucid.selectWallet.fromSeed(SEED);

  const c3 = new Charli3({ network: "preprod" });
  const { txHash } = await c3.submitRound2(lucid, "ADA/USD");

  return NextResponse.json({ txHash });
}

// Deploys to Vercel as-is. Same process as the web app.
// No YAML, no sidecar, no subprocess.
`;

interface Row {
  label: string;
  py: string;
  js: string;
}

const ROWS: Row[] = [
  { label: "Runtime", py: "Python 3.10+, virtualenv, pycardano", js: "Node 20+, same process as the app" },
  { label: "Config", py: "client.yaml (40+ lines, hand-edited)", js: "versioned preset - Charli3 address/policy changes ship as npm update" },
  { label: "Integration code", py: "60 to 80 lines of glue", js: "3 lines per action" },
  { label: "Next.js fit", py: "sidecar service or subprocess", js: "drop-in API route, Vercel ready" },
  { label: "Time to first tx", py: "half a day", js: "under 10 minutes" },
];

export default function CodeCompare() {
  const [tab, setTab] = useState<"py" | "js">("js");

  const pyLines = PY_CODE.split("\n").length;
  const jsLines = JS_CODE.split("\n").length;
  const reduction = Math.round(((pyLines - jsLines) / pyLines) * 100);

  return (
    <div className="code-compare">
      <div className="tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "py"}
          className={`tab ${tab === "py" ? "active" : ""}`}
          onClick={() => setTab("py")}
        >
          Python SDK
        </button>
        <button
          role="tab"
          aria-selected={tab === "js"}
          className={`tab ${tab === "js" ? "active" : ""}`}
          onClick={() => setTab("js")}
        >
          charli3-js
        </button>
        <span className="line-count">
          <span className="lc-py">
            <span className="lc-num">{pyLines}</span> loc python
          </span>
          <span className="lc-arrow" aria-hidden>
            →
          </span>
          <span className="lc-js">
            <span className="lc-num">{jsLines}</span> loc charli3-js
          </span>
          <span className="lc-reduction">−{reduction}%</span>
        </span>
      </div>

      <pre className="code-pane">{tab === "py" ? PY_CODE : JS_CODE}</pre>

      <table className="compare-table">
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label}>
              <th>{r.label}</th>
              <td className={tab === "py" ? "active" : ""}>{r.py}</td>
              <td className={tab === "js" ? "active" : ""}>{r.js}</td>
            </tr>
          ))}
        </tbody>
        <thead>
          <tr>
            <th></th>
            <th className={tab === "py" ? "active" : ""}>Python SDK</th>
            <th className={tab === "js" ? "active" : ""}>charli3-js</th>
          </tr>
        </thead>
      </table>
    </div>
  );
}
