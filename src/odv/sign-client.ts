import type { NodeConfig, SignedFeedMessage } from "../types";

export interface OdvTxSignatureRequest {
  node_messages: Record<
    string,
    { message: string; signature: string; verification_key: string }
  >;
  tx_body_cbor: string;
}

export interface NodeSignature {
  nodeUrl: string;
  publicKey: string;
  signatureHex: string;
}

export interface FailedSignature {
  nodeUrl: string;
  error: string;
}

export interface CollectSignaturesResult {
  signatures: NodeSignature[];
  failed: FailedSignature[];
}

export interface CollectSignaturesOptions {
  endpointPath?: string;
  timeoutMs?: number;
}

async function postJson(
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

export function buildSignatureRequest(
  feeds: SignedFeedMessage[],
  txBodyCborHex: string,
): OdvTxSignatureRequest {
  const node_messages: OdvTxSignatureRequest["node_messages"] = {};
  for (const f of feeds) {
    node_messages[f.publicKey] = {
      message: f.messageCborHex,
      signature: f.signatureHex,
      verification_key: f.verificationKeyHex,
    };
  }
  return { node_messages, tx_body_cbor: txBodyCborHex };
}

export async function collectTxSignatures(
  nodes: NodeConfig[],
  request: OdvTxSignatureRequest,
  opts: CollectSignaturesOptions = {},
): Promise<CollectSignaturesResult> {
  const path = opts.endpointPath ?? "/odv/sign";
  const timeoutMs = opts.timeoutMs ?? 20_000;

  const attempts = await Promise.allSettled(
    nodes.map(async (node): Promise<NodeSignature> => {
      const url = `${node.url.replace(/\/+$/, "")}${path}`;
      const res = await postJson(url, request, timeoutMs);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Node ${node.url} returned ${res.status}: ${text.slice(0, 200)}`,
        );
      }
      const data = (await res.json()) as { signature?: string };
      if (!data.signature || typeof data.signature !== "string") {
        throw new Error(`Node ${node.url} returned no signature`);
      }
      return {
        nodeUrl: node.url,
        publicKey: node.publicKey,
        signatureHex: data.signature,
      };
    }),
  );

  const signatures: NodeSignature[] = [];
  const failed: FailedSignature[] = [];
  attempts.forEach((result, idx) => {
    const node = nodes[idx];
    if (result.status === "fulfilled") {
      signatures.push(result.value);
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

  return { signatures, failed };
}
