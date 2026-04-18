import {
  buildAggStateDatumCbor,
  buildRewardAccountDatumCbor,
  buildOdvAggregateRedeemerCbor,
  buildOdvAggregateMsgRedeemerCbor,
} from "../src/odv/datums";

const sampleVkh = "346f808be06b58f0066d6f8a4d74f48396f97f335bb75f5579e8e587";
const sampleVkh2 = "b0213fd209df01c2420d06bb952d6b7dec8d6e5011a8e786edd9f7ae";

console.log("=== AggState CBOR ===");
console.log(
  buildAggStateDatumCbor({
    medianPrice: 258100n,
    validFromMs: 1776491876000n,
    aggregationLivenessPeriodMs: 600000n,
  }),
);

console.log("\n=== RewardAccount CBOR ===");
console.log(
  buildRewardAccountDatumCbor({
    distributionSortedByVkh: [
      { vkhHex: sampleVkh, reward: 500000n },
      { vkhHex: sampleVkh2, reward: 500000n },
    ],
    lastUpdateTimeMs: 1776491876000n,
  }),
);

console.log("\n=== OdvAggregate redeemer CBOR ===");
console.log(
  buildOdvAggregateRedeemerCbor([
    { vkhHex: sampleVkh, feed: 258000n },
    { vkhHex: sampleVkh2, feed: 258100n },
  ]),
);

console.log("\n=== OdvAggregateMsg redeemer CBOR ===");
console.log(buildOdvAggregateMsgRedeemerCbor());
