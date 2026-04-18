import type { LucidEvolution } from "@lucid-evolution/lucid";
import { KupoProvider } from "./chain/kupo";
import { getPreset } from "./config/presets";
import { OracleNodeClient, type CollectFeedsOptions } from "./oracle/client";
import { OracleReader } from "./oracle/reader";
import {
  submitRound2,
  type SubmitRound2Options,
  type SubmitRound2Result,
} from "./odv/round2";
import type {
  AggregateFeedResult,
  Charli3Config,
  FeedPreset,
  NetworkPreset,
  OdvFeedConfig,
  OracleReference,
  PriceData,
} from "./types";

export class Charli3 {
  readonly network: "preprod" | "mainnet";
  readonly preset: NetworkPreset;
  private readonly kupo: KupoProvider;
  private readonly reader: OracleReader;
  private readonly nodeClient: OracleNodeClient;

  constructor(config: Charli3Config) {
    this.network = config.network;
    this.preset = getPreset(config.network);
    const kupoUrl = config.kupoUrl ?? this.preset.kupoUrl;
    if (!kupoUrl) {
      throw new Error(
        `No kupoUrl configured for network "${config.network}". ` +
          `Pass kupoUrl in Charli3Config.`,
      );
    }
    this.kupo = new KupoProvider(kupoUrl);
    this.reader = new OracleReader(this.kupo, this.preset);
    this.nodeClient = new OracleNodeClient(
      this.preset.odvFeeds,
      this.kupo,
      this.preset.systemStartMs,
    );
  }

  async getPrice(pair: string): Promise<PriceData> {
    return this.reader.readFeed(pair);
  }

  async getAllPrices(): Promise<PriceData[]> {
    return this.reader.readAll();
  }

  async getOracleReference(pair: string): Promise<OracleReference> {
    return this.reader.getOracleReference(pair);
  }

  async getOdvReference(pair: string): Promise<OracleReference> {
    return this.reader.getOdvReference(pair);
  }

  listFeeds(): FeedPreset[] {
    return this.reader.listFeeds();
  }

  listOdvFeeds(): OdvFeedConfig[] {
    return this.nodeClient.listOdvFeeds();
  }

  async collectFeeds(
    pair: string,
    opts: CollectFeedsOptions = {},
  ): Promise<AggregateFeedResult> {
    return this.nodeClient.collectFeeds(pair, opts);
  }

  /**
   * Build, sign and submit the Round-2 ODV tx for one feed pair. Caller must
   * supply a Lucid instance with wallet + provider; we never handle keys.
   */
  async submitRound2(
    lucid: LucidEvolution,
    pair: string,
    opts: SubmitRound2Options = {},
  ): Promise<SubmitRound2Result> {
    const feedConfig = this.nodeClient.getOdvFeed(pair);
    return submitRound2({
      lucid,
      nodeClient: this.nodeClient,
      feedConfig,
      opts,
    });
  }
}

export { KupoProvider } from "./chain/kupo";
export { OracleReader } from "./oracle/reader";
export { OracleNodeClient } from "./oracle/client";
export { aggregate } from "./oracle/aggregate";
export { decodeOracleDatum, decodeCbor } from "./datum/parser";
export {
  verifyEd25519,
  verifyEd25519Raw,
  verifyFeedSignature,
} from "./crypto/verify";
export { PRESETS, PREPROD, MAINNET, getPreset } from "./config/presets";
export type {
  AggregateFeedResult,
  Charli3Config,
  FailedFeed,
  FeedPreset,
  NetworkPreset,
  NodeConfig,
  OdvFeedConfig,
  OracleReference,
  OutRef,
  PriceData,
  RawOracleUtxo,
  ReferenceScript,
  SignedFeedMessage,
  Network,
} from "./types";
export type { CollectFeedsOptions } from "./oracle/client";
export {
  submitRound2,
  type SubmitRound2Options,
  type SubmitRound2Result,
} from "./odv/round2";
export {
  buildOdvTx,
  selectOracleUtxos,
  buildVkeyWitnessSetHex,
  type BuildOdvTxParams,
  type BuildOdvTxResult,
  type OracleScriptUtxos,
} from "./odv/tx-builder";
export {
  buildAggregateMessage,
  medianBigInt,
  rawVkeyBytes,
  vkhOf,
  type AggregateMessage,
  type NodeFeedEntry,
} from "./odv/aggregate-message";
export {
  consensusNodes,
  calculateRewardDistribution,
  calculateMinFeeAmount,
  IQR_APPLICABILITY_THRESHOLD,
  type ConsensusOptions,
} from "./odv/iqr";
export {
  parseOracleSettings,
  parseRewardAccount,
  parseAggState,
  buildAggStateDatumCbor,
  buildRewardAccountDatumCbor,
  buildOdvAggregateRedeemerCbor,
  buildOdvAggregateMsgRedeemerCbor,
  type OracleSettings,
  type RewardAccountState,
  type AggStateData,
} from "./odv/datums";
export {
  buildSignatureRequest,
  collectTxSignatures,
  type CollectSignaturesOptions,
  type CollectSignaturesResult,
  type NodeSignature,
  type FailedSignature,
  type OdvTxSignatureRequest,
} from "./odv/sign-client";

export default Charli3;
