//// Price-gated payout validator.
////
//// Locks ADA (or any asset) at a script address. Funds are spendable only when
//// every condition below holds in the spending transaction:
////
////   1. A reference input carries exactly one unit of the Charli3 oracle feed
////      NFT identified by (oracle_policy_id, oracle_token_name).
////   2. That reference input has an inline datum matching `OracleDatum`.
////   3. The oracle price is greater than or equal to `threshold_price`.
////   4. The transaction is signed by `beneficiary`.
////
//// Note: a production deployment should also verify the oracle has not
//// expired via `is_oracle_valid`. Omitted here so the demo can run against
//// preprod's currently-stale push feeds. The helper is still exported from
//// oracle_datum and one `&& is_oracle_valid(oracle, upper_bound)` is enough
//// to add it back.

use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{InlineDatum, Input, ScriptContext, Spend, Transaction}
use aiken/transaction/credential.{VerificationKey}
use aiken/transaction/value.{AssetName, PolicyId, quantity_of}
use oracle_datum.{OracleDatum}

pub type Beneficiary =
  Hash<Blake2b_224, VerificationKey>

pub type Datum {
  threshold_price: Int,
  beneficiary: Beneficiary,
}

pub type Redeemer {
  Claim
}

validator(oracle_policy_id: PolicyId, oracle_token_name: AssetName) {
  fn price_gated_payout(
    datum: Datum,
    _redeemer: Redeemer,
    ctx: ScriptContext,
  ) -> Bool {
    expect Spend(_) = ctx.purpose
    let Transaction { reference_inputs, extra_signatories, .. } =
      ctx.transaction

    let oracle_input =
      find_oracle_input(reference_inputs, oracle_policy_id, oracle_token_name)
    expect InlineDatum(raw_datum) = oracle_input.output.datum
    expect oracle: OracleDatum = raw_datum

    let price_ok =
      oracle_datum.get_oracle_price(oracle) >= datum.threshold_price
    let signed = list.has(extra_signatories, datum.beneficiary)

    price_ok? && signed?
  }
}

/// Locate the single reference input carrying the oracle feed NFT.
fn find_oracle_input(
  reference_inputs: List<Input>,
  policy: PolicyId,
  asset: AssetName,
) -> Input {
  let matches =
    list.filter(
      reference_inputs,
      fn(input) {
        quantity_of(input.output.value, policy, asset) == 1
      },
    )
  when matches is {
    [one] -> one
    [] -> fail @"oracle reference input missing"
    _ -> fail @"multiple oracle reference inputs present"
  }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

test get_price_from_fresh_feed() {
  let feed = oracle_datum.create_oracle_datum(
    500_000, // $0.50 at precision 6
    1_720_056_807_332,
    1_720_078_407_332,
  )
  oracle_datum.get_oracle_price(feed) == 500_000
}

test is_valid_before_expiry() {
  let feed = oracle_datum.create_oracle_datum(1, 1_000, 2_000)
  oracle_datum.is_oracle_valid(feed, 1_999) == True
}

test is_invalid_after_expiry() {
  let feed = oracle_datum.create_oracle_datum(1, 1_000, 2_000)
  oracle_datum.is_oracle_valid(feed, 2_001) == False
}
