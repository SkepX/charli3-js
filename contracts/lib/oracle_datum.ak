//// Vendored from Charli3-Official/oracle-integration-aiken (Apache-2.0).
//// Canonical on-chain representation of the Charli3 oracle feed datum.

use aiken/cbor
use aiken/hash.{Blake2b_224, Hash}
use aiken/pairs
use aiken/transaction/credential.{Script}

/// Represents a map of key-value pairs for price-related data
pub type PriceMap =
  Pairs<Int, Int>

/// Represents different types of price data
pub type PriceData {
  /// Placeholder for shared data across multiple oracles
  SharedData
  /// Placeholder for extended data with additional information
  ExtendedData
  /// Generic data structure for price information
  GenericData { price_map: PriceMap }
}

/// Represents the main oracle datum structure
pub type OracleDatum {
  price_data: PriceData,
}

/// Type alias for validator hash
pub type ValidatorHash =
  Hash<Blake2b_224, Script>

/// Retrieves the price from the PriceData
pub fn get_price(price_data: PriceData) -> Int {
  when price_data is {
    GenericData { price_map } ->
      when pairs.get_first(price_map, 0) is {
        Some(price) -> price
        None -> fail @"Price not found"
      }
    _ -> fail @"Invalid PriceData variant"
  }
}

/// Retrieves the timestamp from the PriceData
pub fn get_timestamp(price_data: PriceData) -> Int {
  when price_data is {
    GenericData { price_map } ->
      when pairs.get_first(price_map, 1) is {
        Some(timestamp) -> timestamp
        None -> fail @"Timestamp not found"
      }
    _ -> fail @"Invalid PriceData variant"
  }
}

/// Retrieves the expiry from the PriceData
pub fn get_expiry(price_data: PriceData) -> Int {
  when price_data is {
    GenericData { price_map } ->
      when pairs.get_first(price_map, 2) is {
        Some(expiry) -> expiry
        None -> fail @"Expiry not found"
      }
    _ -> fail @"Invalid PriceData variant"
  }
}

/// Checks if the oracle data is valid (not expired)
pub fn is_oracle_valid(oracle_datum: OracleDatum, current_time: Int) -> Bool {
  current_time <= get_expiry(oracle_datum.price_data)
}

/// Retrieves the price from the OracleDatum
pub fn get_oracle_price(oracle_datum: OracleDatum) -> Int {
  get_price(oracle_datum.price_data)
}

/// Retrieves the timestamp from the OracleDatum
pub fn get_oracle_timestamp(oracle_datum: OracleDatum) -> Int {
  get_timestamp(oracle_datum.price_data)
}

/// Creates a new OracleDatum with the given price, timestamp, and expiry
pub fn create_oracle_datum(
  price: Int,
  timestamp: Int,
  expiry: Int,
) -> OracleDatum {
  OracleDatum {
    price_data: GenericData {
      price_map: [Pair(0, price), Pair(1, timestamp), Pair(2, expiry)],
    },
  }
}

test create_and_get_price() {
  let datum = create_oracle_datum(2723, 1720056807332, 1720078407332)
  get_price(datum.price_data) == 2723 && get_oracle_price(datum) == 2723
}

test create_and_get_timestamp() {
  let datum = create_oracle_datum(2723, 1720056807332, 1720078407332)
  get_timestamp(datum.price_data) == 1720056807332 && get_oracle_timestamp(
    datum,
  ) == 1720056807332
}

test create_and_get_expiry() {
  let datum = create_oracle_datum(2723, 1720056807332, 1720078407332)
  get_expiry(datum.price_data) == 1720078407332
}

test is_oracle_valid_test() {
  let datum = create_oracle_datum(2723, 1720056807332, 1720078407332)
  is_oracle_valid(datum, 1720056807332) == True && is_oracle_valid(
    datum,
    1720078407333,
  ) == False
}

test oracle_datum_serialise() {
  let datum =
    OracleDatum {
      price_data: GenericData(
        [Pair(0, 490850), Pair(1, 1707172554600), Pair(2, 1707176154600)],
      ),
    }
  let expected_cbor =
    #"d8799fd87b9fa3001a00077d62011b0000018d7b69e768021b0000018d7ba0d5e8ffff"

  cbor.serialise(datum) == expected_cbor
}
