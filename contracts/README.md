# price_gated_payout — Aiken reference contract

A minimal Aiken validator that consumes a **Charli3 oracle feed as a reference
input** and gates a payout on the live price. Designed to be read as an
example of how to consume `charli3-js` off-chain alongside an on-chain script.

## What it does

Locks funds at a script address with datum:

```aiken
Datum {
  threshold_price: Int,         // lovelace-scale; e.g. 500_000 == $0.50 at 1e6
  beneficiary: VerificationKeyHash,
}
```

The funds are spendable **only** when the spending transaction:

1. includes a **reference input** carrying exactly one unit of the Charli3
   oracle feed NFT (parameterised by `oracle_policy_id` + `oracle_token_name`),
2. the oracle's inline datum parses as `OracleDatum`,
3. `oracle_price >= threshold_price`,
4. the oracle has not expired by the transaction's upper validity bound, and
5. the transaction is signed by `beneficiary`.

The oracle datum layout matches Charli3's on-chain representation verbatim —
the `oracle_datum.ak` module is vendored from the official
[`Charli3-Official/oracle-integration-aiken`](https://github.com/Charli3-Official/oracle-integration-aiken)
repo (Apache-2.0).

## Build

Requires [Aiken](https://aiken-lang.org/) `v1.0.29-alpha` or newer.

```bash
cd contracts
aiken check    # type-check + run unit tests
aiken build    # emit plutus.json
```

`aiken build` produces `plutus.json` with the parameterised validator. To
apply the oracle NFT parameters and get a concrete script + address, use
`aiken blueprint apply` or apply the params in your off-chain code.

## Using it with `charli3-js`

The SDK already gives you the oracle UTXO location for any configured feed:

```ts
import { Charli3, KupoProvider, PRESETS } from "charli3-js";

const c3 = new Charli3({ network: "preprod" });
const kupo = new KupoProvider(PRESETS.preprod.kupoUrl);

const feed = PRESETS.preprod.feeds["ADA/USD"];
const utxo = await kupo.findOracleUtxo(feed.policyId, feed.tokenName);
//  ^ wire { txHash, outputIndex } into your tx as a reference input
```

For the contract params, pass `feed.policyId` as `oracle_policy_id` and
`feed.tokenName` (the hex-encoded `OracleFeed` token name,
`4f7261636c6546656564`) as `oracle_token_name`.

## Status

This is a reference integration. It compiles and unit-tests under Aiken but has
not been deployed to preprod as part of this hackathon submission — the
`charli3-js` SDK on its own already satisfies the Oracle Tooling track.
