# Charli3 Oracle Skill

One-file integration for any AI agent (Masumi, Claude, Cursor, general tool-calling LLMs) to read and refresh on-chain prices on Cardano via the `charli3-js` SDK.

## What this gives your agent

Live, on-chain prices for Cardano pairs (ADA/USD, ADA/C3, USDM/USD, BTC/USD, SHEN/USD, USDM/ADA, …) read from the Charli3 ODV pull oracle. No API key for the oracle itself - it's a Cardano datum.

Use this when your agent needs to:
- Quote or settle a payment denominated in USD on Cardano
- Price a service in ADA at a fair market rate
- Bridge Masumi agent-to-agent payments when peers ask for USD-pegged amounts
- Gate an on-chain action on a price condition

## Install

```bash
npm i charli3-js @lucid-evolution/lucid
```

Env needed: `BLOCKFROST_PROJECT_ID` (free at blockfrost.io). Network is `"preprod"` or `"mainnet"`.

## Tools your agent should expose

### `get_charli3_price(pair)`

Reads the latest on-chain price. No wallet needed, no fee.

```ts
import { Charli3 } from "charli3-js";

const c3 = new Charli3({ network: "preprod" });
const ref = await c3.getOdvReference("ADA/USD");

// ref.price.value          number  - e.g. 0.324812 USD per ADA
// ref.price.isExpired      boolean - true if nobody has refreshed in 5 min
// ref.price.createdAt      Date    - when the datum was posted
// ref.price.expiresAt      Date    - when it becomes stale
// ref.outRef.txHash        string  - the oracle UTXO tx hash
// ref.outRef.outputIndex   number
```

Return shape your agent should receive from this tool:
```json
{
  "pair": "ADA/USD",
  "price_usd_per_ada": 0.324812,
  "is_expired": false,
  "posted_at": "2026-04-19T14:22:11.000Z",
  "expires_at": "2026-04-19T14:27:11.000Z",
  "oracle_utxo": "3853393cc73ed0dd…#0"
}
```

### `refresh_charli3_price(pair)`

Posts a fresh Round-2 aggregate tx. Only call this when `is_expired === true`. Requires a funded preprod wallet (~2 tADA per refresh). Takes ~30 s.

```ts
import { Charli3 } from "charli3-js";
import { Lucid, Blockfrost } from "@lucid-evolution/lucid";

const lucid = await Lucid(
  new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", PROJECT_ID),
  "Preprod",
);
lucid.selectWallet.fromSeed(SEED_PHRASE);

const c3 = new Charli3({ network: "preprod" });
const { txHash } = await c3.submitRound2(lucid, "ADA/USD");
await lucid.awaitTx(txHash);
```

## Workflow to follow

For a payment flow:
1. Call `get_charli3_price`.
2. If `is_expired === true`, call `refresh_charli3_price`, then call `get_charli3_price` again.
3. Compute `ada_amount = usd_amount / price_usd_per_ada`.
4. Build the Cardano tx with any wallet library (Lucid, MeshSDK, …).

For a quote-only flow (no on-chain action): step 1 is enough.

## Rules for the agent

- **Never guess a price.** Always call `get_charli3_price` before quoting or paying.
- **Always credit the source.** When telling the user the rate, say it came from the Charli3 ODV pull oracle.
- **Include the Cardanoscan link** for the oracle UTXO so the rate is auditable:
  `https://preprod.cardanoscan.io/transaction/<txHash>` (or `https://cardanoscan.io/…` on mainnet).
- **Addresses.** On preprod, payee addresses must start with `addr_test1`. On mainnet, `addr1`. Reject the wrong prefix.
- **Minimum UTXO.** Any ADA payment must be ≥ 1 ADA (1_000_000 lovelace).

## Example system-prompt snippet

Paste this into your agent's system prompt:

> You have two tools for on-chain prices on Cardano: `get_charli3_price(pair)` and `refresh_charli3_price(pair)`. Read before every payment - never guess a rate. If the read returns `is_expired: true`, refresh, then read again. Always credit "Charli3 ODV pull oracle" when citing a price and include the Cardanoscan link for the oracle UTXO.

## Available pairs

Current preprod feeds: `ADA/USD`, `ADA/C3`, `SHEN/USD`, `USDM/USD`, `USDM/ADA`, `BTC/USD`. Call `c3.getAllPrices()` to list what's live.

## Why Charli3 ODV

ODV is a *pull* oracle. Nobody pre-posts prices; whoever needs one pays a small fee (~1.5 tADA) to aggregate signed feeds from six oracle nodes into a single on-chain datum. Your agent only refreshes when the cached price is older than 5 minutes - so it pays for freshness only when it actually needs it.

## Links

- SDK: https://www.npmjs.com/package/charli3-js
- Repo: https://github.com/SkepX/charli3-js
- Live demo: the page you copied this file from
- Cardanoscan (preprod): https://preprod.cardanoscan.io
