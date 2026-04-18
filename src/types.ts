export type Network = "preprod" | "mainnet";

export interface PriceData {
  pair: string;
  value: number;
  rawValue: bigint;
  precision: number;
  createdAt: Date;
  expiresAt: Date;
  isExpired: boolean;
  slot?: number;
  txHash?: string;
}

export interface FeedPreset {
  pair: string;
  address: string;
  policyId: string;
  tokenName: string;
  updateFrequencyMinutes?: number;
}

export interface NodeConfig {
  url: string;
  publicKey: string;
}

export interface ReferenceScript {
  address: string;
  txHash: string;
  outputIndex: number;
}

export interface OdvFeedConfig {
  pair: string;
  policyId: string;
  oracleAddress: string;
  validityLengthMs: number;
  nodes: NodeConfig[];
  referenceScript?: ReferenceScript;
  feedPrecision?: number;
}

export interface NetworkPreset {
  network: Network;
  kupoUrl: string;
  ogmiosUrl?: string;
  systemStartMs: number;
  feeds: Record<string, FeedPreset>;
  odvFeeds: Record<string, OdvFeedConfig>;
}

export interface Charli3Config {
  network: Network;
  kupoUrl?: string;
  blockfrostProjectId?: string;
}

export interface SignedFeedMessage {
  nodeUrl: string;
  publicKey: string;
  feed: bigint;
  timestamp: number;
  value: number;
  messageCborHex: string;
  signatureHex: string;
  verificationKeyHex: string;
}

export interface FailedFeed {
  nodeUrl: string;
  error: string;
}

export interface AggregateFeedResult {
  pair: string;
  median: number;
  feeds: SignedFeedMessage[];
  nonOutliers: SignedFeedMessage[];
  outliers: SignedFeedMessage[];
  failed: FailedFeed[];
  validityInterval: { start: number; end: number };
}

export interface RawOracleUtxo {
  txHash: string;
  outputIndex: number;
  address: string;
  datumHash: string | null;
  inlineDatum: string | null;
  slotNo?: number;
}

export interface OutRef {
  txHash: string;
  outputIndex: number;
}

export interface OracleReference {
  pair: string;
  policyId: string;
  tokenName: string;
  address: string;
  outRef: OutRef;
  price: PriceData;
}
