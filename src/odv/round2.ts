/**
 * End-to-end Round-2 orchestrator. Glues together:
 *   1. Round-1 feed collection (`OracleNodeClient.collectFeeds`)
 *   2. UTxO + settings resolution (Lucid provider)
 *   3. Tx build (`buildOdvTx`)
 *   4. /odv/sign round-trip (`collectTxSignatures`)
 *   5. Witness assembly + wallet signature + submit
 *
 * The caller brings the Lucid instance (with wallet + provider). We never
 * handle private keys ourselves.
 */
import type { LucidEvolution, TxSignBuilder } from "@lucid-evolution/lucid";
import { CML } from "@lucid-evolution/lucid";
import type { OracleNodeClient } from "../oracle/client";
import type { OdvFeedConfig, SignedFeedMessage } from "../types";
import { buildAggregateMessage } from "./aggregate-message";
import type { AggregateMessage } from "./aggregate-message";
import {
  buildSignatureRequest,
  collectTxSignatures,
  type CollectSignaturesResult,
} from "./sign-client";
import {
  buildOdvTx,
  buildVkeyWitnessSetHex,
  selectOracleUtxos,
  type BuildOdvTxResult,
} from "./tx-builder";

export interface SubmitRound2Options {
  /** Additional lovelace buffer on top of the min collateral/fee math. */
  changeAddress?: string;
  /** Forwarded to `OracleNodeClient.collectFeeds`. */
  collectFeedsTimeoutMs?: number;
  /** Forwarded to `/odv/sign`. */
  signTimeoutMs?: number;
  /** Optional feeds to reuse instead of collecting again. */
  presetFeeds?: SignedFeedMessage[];
  /** Dry-run — return built tx + signatures but don't submit. */
  dryRun?: boolean;
  /** Optional validity window override in POSIX ms. */
  validity?: { startMs: number; endMs: number };
}

export interface SubmitRound2Result {
  pair: string;
  aggregateMessage: AggregateMessage;
  build: BuildOdvTxResult;
  signatureCollection: CollectSignaturesResult;
  /** Populated when not a dry run. */
  txHash?: string;
  /** Final signed tx CBOR hex (body + full witness set). */
  signedTxCborHex: string;
}

async function findRefScriptUtxo(
  lucid: LucidEvolution,
  feed: OdvFeedConfig,
) {
  if (!feed.referenceScript) {
    throw new Error(
      `OdvFeedConfig for ${feed.pair} has no referenceScript — cannot locate validator`,
    );
  }
  const [utxo] = await lucid.utxosByOutRef([
    {
      txHash: feed.referenceScript.txHash,
      outputIndex: feed.referenceScript.outputIndex,
    },
  ]);
  if (!utxo) {
    throw new Error(
      `Reference script UTxO not found at ${feed.referenceScript.txHash}#${feed.referenceScript.outputIndex}`,
    );
  }
  return utxo;
}

/**
 * Build + (optionally) submit a Round-2 ODV transaction for one feed pair.
 *
 * Flow: collect signed feeds → fetch oracle UTxOs → build tx → POST body to
 * /odv/sign on each node → assemble witnesses + submitter signature → submit.
 */
export async function submitRound2(args: {
  lucid: LucidEvolution;
  nodeClient: OracleNodeClient;
  feedConfig: OdvFeedConfig;
  opts?: SubmitRound2Options;
}): Promise<SubmitRound2Result> {
  const { lucid, nodeClient, feedConfig, opts = {} } = args;

  const feeds =
    opts.presetFeeds ??
    (
      await nodeClient.collectFeeds(feedConfig.pair, {
        timeoutMs: opts.collectFeedsTimeoutMs,
      })
    ).feeds;

  if (feeds.length === 0) {
    throw new Error(
      `No successful Round-1 feed responses for ${feedConfig.pair} — cannot proceed`,
    );
  }

  const aggregate = buildAggregateMessage(feeds);

  const scriptUtxos = await lucid.utxosAt(feedConfig.oracleAddress);
  const refScriptUtxo = await findRefScriptUtxo(lucid, feedConfig);

  const selected = selectOracleUtxos({
    scriptAddressUtxos: scriptUtxos,
    referenceScriptUtxo: refScriptUtxo,
    policyIdHex: feedConfig.policyId,
    currentTimeMs: Date.now(),
  });

  const build = await buildOdvTx(lucid, {
    oracleAddress: feedConfig.oracleAddress,
    policyIdHex: feedConfig.policyId,
    sortedFeeds: aggregate.sortedFeeds,
    median: aggregate.median,
    oracleUtxos: selected,
    validity: opts.validity,
  });

  // Round-trip each node for its tx-body signature.
  const signRequest = buildSignatureRequest(feeds, build.txBodyCborHex);
  const signatureCollection = await collectTxSignatures(
    feedConfig.nodes,
    signRequest,
    { timeoutMs: opts.signTimeoutMs },
  );

  if (signatureCollection.signatures.length < feedConfig.nodes.length) {
    const failedSummary = signatureCollection.failed
      .map((f) => `${f.nodeUrl}: ${f.error}`)
      .join("; ");
    throw new Error(
      `Only ${signatureCollection.signatures.length}/${feedConfig.nodes.length} nodes signed. ` +
        `Failures: ${failedSummary}`,
    );
  }

  // Build one witness set per node signature and pair it with its raw vkey
  // (Lucid wants the raw 32-byte pubkey, not the CBOR-wrapped form that the
  // nodes return alongside their feed payload).
  const vkeyByPublicKey = new Map(
    feeds.map((f) => [f.publicKey, f.verificationKeyHex]),
  );

  const witnessHexes: string[] = signatureCollection.signatures.map((s) => {
    const vkCbor = vkeyByPublicKey.get(s.publicKey);
    if (!vkCbor) {
      throw new Error(
        `Missing verification key for node ${s.nodeUrl} — cannot build witness`,
      );
    }
    const rawVkey = stripCborVkeyPrefix(vkCbor);
    return buildVkeyWitnessSetHex({
      cml: CML,
      rawVkeyHex: rawVkey,
      signatureHex: s.signatureHex,
    });
  });

  let signed: TxSignBuilder = build.txSignBuilder.assemble(witnessHexes);
  signed = signed.sign.withWallet();
  const completed = await signed.complete();
  const signedTxCborHex = completed.toCBOR();

  if (opts.dryRun) {
    return {
      pair: feedConfig.pair,
      aggregateMessage: aggregate,
      build,
      signatureCollection,
      signedTxCborHex,
    };
  }

  const txHash = await completed.submit();
  return {
    pair: feedConfig.pair,
    aggregateMessage: aggregate,
    build,
    signatureCollection,
    txHash,
    signedTxCborHex,
  };
}

/** Strip a CBOR `0x5820` bytes(32) header from a 34-byte hex vkey, or return as-is if already 32 bytes. */
function stripCborVkeyPrefix(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 64) return clean;
  if (clean.length === 68 && clean.toLowerCase().startsWith("5820")) {
    return clean.slice(4);
  }
  throw new Error(`Unexpected vkey hex length: ${clean.length}`);
}
