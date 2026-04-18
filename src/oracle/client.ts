import type { KupoProvider } from "../chain/kupo";
import { verifyFeedSignature } from "../crypto/verify";
import { decodeCbor } from "../datum/parser";
import type {
  AggregateFeedResult,
  FailedFeed,
  NodeConfig,
  OdvFeedConfig,
  SignedFeedMessage,
} from "../types";
import { aggregate } from "./aggregate";

export interface CollectFeedsOptions {
  endpointPath?: string;
  timeoutMs?: number;
  iqrMultiplier?: number;
  divergencyFactor?: number;
  precisionOverride?: number;
  safetyBufferMs?: number;
  useChainTime?: boolean;
  verifySignatures?: boolean;
}

interface NodeFeedResponse {
  message: string;
  signature: string;
  verification_key: string;
}

function isNodeFeedResponse(x: unknown): x is NodeFeedResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.message === "string" &&
    typeof o.signature === "string" &&
    typeof o.verification_key === "string"
  );
}

interface DecodedMessage {
  feed: bigint;
  timestamp: number;
  policyId: string;
}

function decodeNodeMessage(messageCborHex: string): DecodedMessage {
  const decoded = decodeCbor(messageCborHex);
  const tag = decoded as { tag?: number; value?: unknown };
  const fields = tag && tag.tag === 121 ? (tag.value as unknown[]) : null;
  if (!fields || fields.length < 3) {
    throw new Error(
      `Node message is not a Plutus Constr 0 triple (got ${JSON.stringify(decoded).slice(0, 120)})`,
    );
  }
  const [feedRaw, timestampRaw, policyRaw] = fields;
  const feed =
    typeof feedRaw === "bigint" ? feedRaw : BigInt(feedRaw as number);
  const timestamp =
    typeof timestampRaw === "bigint"
      ? Number(timestampRaw)
      : (timestampRaw as number);
  const policyId =
    policyRaw instanceof Uint8Array
      ? Buffer.from(policyRaw).toString("hex")
      : typeof policyRaw === "string"
        ? policyRaw
        : "";
  return { feed, timestamp, policyId };
}

async function fetchWithTimeout(
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export class OracleNodeClient {
  constructor(
    private readonly odvFeeds: Record<string, OdvFeedConfig>,
    private readonly kupo: KupoProvider | null = null,
    private readonly systemStartMs: number | null = null,
  ) {}

  listOdvFeeds(): OdvFeedConfig[] {
    return Object.values(this.odvFeeds);
  }

  getOdvFeed(pair: string): OdvFeedConfig {
    const feed = this.odvFeeds[pair.toUpperCase()];
    if (!feed) {
      const avail = Object.keys(this.odvFeeds).join(", ");
      throw new Error(
        `Unknown ODV feed "${pair}". Available: ${avail || "none"}`,
      );
    }
    return feed;
  }

  private async computeValidityInterval(
    validityLengthMs: number,
    opts: CollectFeedsOptions,
  ): Promise<{ start: number; end: number }> {
    const buffer = opts.safetyBufferMs ?? 60_000;
    const useChainTime = opts.useChainTime ?? false;

    if (useChainTime && this.kupo && this.systemStartMs !== null) {
      try {
        const chainTime = await this.kupo.getChainTimeMs(this.systemStartMs);
        return {
          start: chainTime - buffer,
          end: chainTime + validityLengthMs,
        };
      } catch {
        // fall through to wall clock
      }
    }
    const now = Date.now();
    return { start: now - buffer, end: now + validityLengthMs };
  }

  async collectFeeds(
    pair: string,
    opts: CollectFeedsOptions = {},
  ): Promise<AggregateFeedResult> {
    const feed = this.getOdvFeed(pair);
    const path = opts.endpointPath ?? "/odv/feed";
    const timeoutMs = opts.timeoutMs ?? 15_000;
    const precision = opts.precisionOverride ?? feed.feedPrecision ?? 6;

    const validity = await this.computeValidityInterval(
      feed.validityLengthMs,
      opts,
    );
    const payload = {
      oracle_nft_policy_id: feed.policyId,
      tx_validity_interval: validity,
    };

    const attempts = await Promise.allSettled(
      feed.nodes.map(async (node): Promise<SignedFeedMessage> => {
        const url = `${node.url.replace(/\/+$/, "")}${path}`;
        const res = await fetchWithTimeout(url, payload, timeoutMs);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Node ${node.url} returned ${res.status}: ${text.slice(0, 200)}`,
          );
        }
        const raw = await res.json();
        if (!isNodeFeedResponse(raw)) {
          throw new Error(
            `Unexpected node response shape: ${JSON.stringify(raw).slice(0, 200)}`,
          );
        }
        const decoded = decodeNodeMessage(raw.message);
        if (opts.verifySignatures) {
          const ok = verifyFeedSignature({
            messageCborHex: raw.message,
            signatureHex: raw.signature,
            verificationKeyHex: raw.verification_key,
          });
          if (!ok) {
            throw new Error(
              `ed25519 signature verification failed for node ${node.url}`,
            );
          }
        }
        const divisor = 10 ** precision;
        return {
          nodeUrl: node.url,
          publicKey: node.publicKey,
          feed: decoded.feed,
          timestamp: decoded.timestamp,
          value: Number(decoded.feed) / divisor,
          messageCborHex: raw.message,
          signatureHex: raw.signature,
          verificationKeyHex: raw.verification_key,
        };
      }),
    );

    const feeds: SignedFeedMessage[] = [];
    const failed: FailedFeed[] = [];
    attempts.forEach((result, idx) => {
      const node = feed.nodes[idx];
      if (result.status === "fulfilled") {
        feeds.push(result.value);
      } else {
        failed.push({
          nodeUrl: node.url,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    });

    const agg = aggregate(feeds, {
      iqrMultiplier: opts.iqrMultiplier,
      divergencyFactor: opts.divergencyFactor,
    });

    return {
      pair: feed.pair,
      median: agg.median,
      feeds,
      nonOutliers: agg.nonOutliers,
      outliers: agg.outliers,
      failed,
      validityInterval: validity,
    };
  }

  listNodesFor(pair: string): NodeConfig[] {
    return [...this.getOdvFeed(pair).nodes];
  }
}
