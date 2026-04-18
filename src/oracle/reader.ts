import { KupoProvider } from "../chain/kupo";
import { decodeOracleDatum } from "../datum/parser";
import { parseAggState } from "../odv/datums";
import type {
  FeedPreset,
  NetworkPreset,
  OdvFeedConfig,
  OracleReference,
  PriceData,
} from "../types";

const C3AS_TOKEN_HEX = Buffer.from("C3AS", "utf8").toString("hex");

export class OracleReader {
  constructor(
    private readonly kupo: KupoProvider,
    private readonly preset: NetworkPreset,
  ) {}

  listFeeds(): FeedPreset[] {
    return Object.values(this.preset.feeds);
  }

  getOdvFeedConfig(pair: string): OdvFeedConfig {
    const key = pair.toUpperCase();
    const feed = this.preset.odvFeeds[key];
    if (!feed) {
      const available = Object.keys(this.preset.odvFeeds).join(", ");
      throw new Error(
        `Unknown ODV feed "${pair}". Available: ${available || "none"}`,
      );
    }
    return feed;
  }

  async getOdvReference(pair: string): Promise<OracleReference> {
    const feed = this.getOdvFeedConfig(pair);
    const { utxo, datumHex } = await this.kupo.getOracleDatum(
      feed.policyId,
      C3AS_TOKEN_HEX,
    );
    const agg = parseAggState(datumHex);
    const precision = feed.feedPrecision ?? 6;
    const divisor = 10 ** precision;
    const rawPrice = agg.price ?? 0n;
    const createdMs = agg.timestampMs !== null ? Number(agg.timestampMs) : 0;
    const expiresMs = agg.expiryMs !== null ? Number(agg.expiryMs) : 0;
    const priceData: PriceData = {
      pair: feed.pair,
      value: Number(rawPrice) / divisor,
      rawValue: rawPrice,
      precision,
      createdAt: new Date(createdMs),
      expiresAt: new Date(expiresMs),
      isExpired: agg.isEmpty || (expiresMs > 0 ? Date.now() > expiresMs : true),
      slot: utxo.slotNo,
      txHash: utxo.txHash,
    };
    return {
      pair: feed.pair,
      policyId: feed.policyId,
      tokenName: C3AS_TOKEN_HEX,
      address: utxo.address,
      outRef: { txHash: utxo.txHash, outputIndex: utxo.outputIndex },
      price: priceData,
    };
  }

  getFeedPreset(pair: string): FeedPreset {
    const key = pair.toUpperCase();
    const feed = this.preset.feeds[key];
    if (!feed) {
      const available = Object.keys(this.preset.feeds).join(", ");
      throw new Error(
        `Unknown feed "${pair}". Available feeds: ${available || "none"}`,
      );
    }
    return feed;
  }

  async readFeed(pair: string): Promise<PriceData> {
    const feed = this.getFeedPreset(pair);
    const { utxo, datumHex } = await this.kupo.getOracleDatum(
      feed.policyId,
      feed.tokenName,
    );
    const price = decodeOracleDatum(datumHex, feed.pair);
    return {
      ...price,
      slot: utxo.slotNo,
      txHash: utxo.txHash,
    };
  }

  async getOracleReference(pair: string): Promise<OracleReference> {
    const feed = this.getFeedPreset(pair);
    const { utxo, datumHex } = await this.kupo.getOracleDatum(
      feed.policyId,
      feed.tokenName,
    );
    const price = decodeOracleDatum(datumHex, feed.pair);
    return {
      pair: feed.pair,
      policyId: feed.policyId,
      tokenName: feed.tokenName,
      address: utxo.address,
      outRef: {
        txHash: utxo.txHash,
        outputIndex: utxo.outputIndex,
      },
      price: {
        ...price,
        slot: utxo.slotNo,
        txHash: utxo.txHash,
      },
    };
  }

  async readAll(): Promise<PriceData[]> {
    const feeds = this.listFeeds();
    const results = await Promise.allSettled(
      feeds.map((f) => this.readFeed(f.pair)),
    );
    return results
      .filter(
        (r): r is PromiseFulfilledResult<PriceData> => r.status === "fulfilled",
      )
      .map((r) => r.value);
  }
}
