# charli3-js

**TypeScript SDK for the Charli3 oracle on Cardano.** One import, one call, a fresh price on chain.

- **Live demo:** https://charli3-js-demo.vercel.app
- **Docs:** https://charli3-js-bc690dc5.mintlify.app
- **npm:** https://www.npmjs.com/package/charli3-js
- **Oracles Hackathon** submission, built against Cardano preprod.

```bash
npm install charli3-js
```

```ts
import { Charli3 } from "charli3-js";

const c3 = new Charli3({ network: "preprod" });
const { price } = await c3.getOdvReference("ADA/USD");
console.log(price.value, price.isExpired);
```

---

## What it does

Charli3 ships two oracle styles on Cardano: a classic **push** oracle (price UTXO updated every ~30 min) and a newer **ODV pull** oracle (any client can post a fresh on-chain aggregate in one tx). Reading either one from JavaScript previously meant manually walking UTXOs, decoding Plutus data, verifying Ed25519 feed signatures, and rebuilding a Round-2 aggregate datum by hand.

`charli3-js` collapses that into three ergonomic entry points:

| Method | Purpose |
| --- | --- |
| `c3.getPrice(pair)` | Read the current price from the **classic (push) oracle** feed. |
| `c3.getOdvReference(pair)` | Read the current on-chain aggregate from the **ODV (pull) oracle**, including freshness. |
| `c3.submitRound2(lucid, pair)` | Collect fresh signed prices from feed nodes, aggregate with IQR consensus, and post a **Round-2 aggregate** tx to Cardano so the on-chain price becomes current. |

Under the hood it handles Kupo/Ogmios provider plumbing, CBOR + Plutus data decoding, Ed25519 feed-signature verification, IQR outlier filtering, datum construction, slot-rounded validity windows, and tx assembly via Lucid Evolution.

The SDK ships a 300-line [skill.md](demo-nextjs/public/skill.md) spec so any LLM agent (OpenAI, Claude, etc.) can plug the oracle into its tool loop. A working end-to-end example is the [`demo-nextjs/`](demo-nextjs/) app in this repo — it is the same thing deployed at [charli3-js-demo.vercel.app](https://charli3-js-demo.vercel.app).

---

## Oracle feeds used

The SDK ships network presets for every feed Charli3 operates on **Cardano preprod**. Addresses and policy IDs live in [`src/config/presets.ts`](src/config/presets.ts).

### Classic (push) oracle feeds — read-only

| Pair | Policy ID |
| --- | --- |
| ADA/USD | `1116903479e7320b8e4592207aaebf627898267fcd80e2d9646cbf07` |
| ADA/C3 | `5e4a2431a465a00dc5d8181aaff63959bb235d97013e7acb50b55bc4` |
| SHEN/USD | `2b556df9f37c04ef31b8f7f581c4e48174adcf5041e8e52497d81556` |
| USDM/USD | `424f268a65632944ddfe17967208178082058cbe9044f53aee28697d` |

### ODV (pull) oracle feeds — read + post Round-2

| Pair | Policy ID |
| --- | --- |
| ADA/USD | `886dcb2363e160c944e63cf544ce6f6265b22ef7c4e2478dd975078e` |
| BTC/USD | `43d766bafc64c96754353e9686fac6130990a4f8568b3a2f76e2643f` |
| USDM/ADA | `fcc738fa9ae006bc8de82385ff3457a2817ccc4eaa5ce53a61334674` |

The demo app exercises the **ADA/USD ODV pull oracle** end-to-end: it reads the current aggregate, detects expiry, calls `submitRound2` to post a fresh tx, and spends a sample Aiken `price_gated_payout` validator against the fresh price.

Mainnet presets are wired but empty — Charli3 ODV is preprod-only at the time of submission.

---

## How to run it

Three ways, pick one.

### 1. Just click around (zero setup)

Open **https://charli3-js-demo.vercel.app**. Live ADA/USD price, a deposit/claim loop against the Aiken validator, and an AI-agent panel that settles USD invoices in ADA using Charli3 ODV.

### 2. Use the SDK in your own project

```bash
npm install charli3-js @lucid-evolution/lucid
```

Reading a price:

```ts
import { Charli3 } from "charli3-js";
const c3 = new Charli3({ network: "preprod" });
const ref = await c3.getOdvReference("ADA/USD");
console.log(ref.price.value, "USD per ADA, expires at", ref.price.expiresAt);
```

Posting a fresh Round-2 tx:

```ts
import { Charli3 } from "charli3-js";
import { Lucid, Blockfrost } from "@lucid-evolution/lucid";

const lucid = await Lucid(
  new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", YOUR_PROJECT_ID),
  "Preprod",
);
lucid.selectWallet.fromSeed(YOUR_SEED);

const c3 = new Charli3({ network: "preprod" });
const result = await c3.submitRound2(lucid, "ADA/USD");
console.log("posted", result.txHash);
```

Full API reference: [charli3-js-bc690dc5.mintlify.app](https://charli3-js-bc690dc5.mintlify.app).

### 3. Run the sample app locally (for judges)

See the section below.

---

## Setup instructions for judges

The sample app lives in [`demo-nextjs/`](demo-nextjs/) and is self-contained — it imports `charli3-js` from npm, so there is no SDK build step.

### Prerequisites

- Node.js 20+ and npm 10+
- Git
- [Lace wallet](https://www.lace.io) browser extension, set to **Preprod** network
- Free [Blockfrost](https://blockfrost.io) project id (network: **Cardano preprod**)
- *(optional)* [OpenAI API key](https://platform.openai.com/api-keys) to exercise the AI-agent panel

### Steps

**1. Clone and install**

```bash
git clone https://github.com/SkepX/charli3-js.git
cd charli3-js/demo-nextjs
npm install
```

**2. Generate the demo wallet and contract address**

```bash
# in charli3-js/demo-nextjs/
npm run setup
```

This prints two addresses. Copy the second one (`wallet address : addr_test1...`) — you will paste it into the faucet next. The seed is saved to `demo-nextjs/.wallet.seed` (gitignored).

> The output lines that start with `script address :` and `wallet address :` are **printed output**, not commands to run.

**3. Fund the demo wallet**

Go to the [Cardano preprod faucet](https://docs.cardano.org/cardano-testnets/tools/faucet), paste the `wallet address` from step 2, and send **10 000 tADA**. This wallet pays for Round-2 refreshes server-side. Your own Lace wallet is separate.

**4. Set env vars**

Create `demo-nextjs/.env.local`:

```bash
NEXT_PUBLIC_BLOCKFROST_PROJECT_ID=preprod...
OPENAI_API_KEY=sk-...        # optional, only needed for the AI-agent panel
```

**5. Run it**

```bash
# in charli3-js/demo-nextjs/
npm run dev
```

Open http://localhost:3000. You should see a live ADA/USD price within a second.

### What to click first

1. Scroll to **Run the loop**, click **Connect Lace**, then **Deposit 3 tADA**.
2. Click **Refresh oracle price**. The server posts a fresh Round-2 tx using the demo seed.
3. Click **Claim locked tADA**. The Aiken validator releases the deposit because the price cleared the threshold.
4. *(optional)* Scroll to **AI agent**, drop the sample invoice, sign the payment with Lace.

Full troubleshooting list: [Docs → Run locally](https://charli3-js-bc690dc5.mintlify.app/example-app/run-locally).

---

## Repo layout

```
src/             Charli3 class + oracle reader + ODV Round-2 aggregator
  config/        Network presets (addresses, policy IDs, nodes)
  chain/         Kupo provider wrapper
  oracle/        Feed reader + node client
  odv/           Round-2 submitter, IQR aggregator, datum builder
  crypto/        Ed25519 signature verification
  datum/         CBOR + Plutus data helpers
examples/        Standalone scripts (read-price, list-feeds, submit-round2, …)
contracts/       Aiken price_gated_payout validator source + compiled plutus.json
demo-nextjs/     Self-contained Next.js sample app (deployed to Vercel)
docs/            Mintlify source (mirror — deployed docs live in SkepX/documentation)
```

---

## Links

- **Live demo:** https://charli3-js-demo.vercel.app
- **Documentation:** https://charli3-js-bc690dc5.mintlify.app
- **npm package:** https://www.npmjs.com/package/charli3-js
- **Charli3 ODV paper / specs:** https://docs.charli3.io

## License

MIT
