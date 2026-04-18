import type { RawOracleUtxo } from "../types";

interface KupoMatch {
  transaction_id: string;
  output_index: number;
  address: string;
  value: {
    coins: number;
    assets: Record<string, number>;
  };
  datum_hash: string | null;
  datum_type?: "hash" | "inline";
  script_hash: string | null;
  created_at?: { slot_no: number; header_hash: string };
  spent_at?: unknown;
}

interface KupoDatumResponse {
  datum: string;
}

interface KupoHealthResponse {
  connection_status: string;
  most_recent_checkpoint: number;
  most_recent_node_tip: number;
  configuration?: unknown;
  version?: string;
}

export class KupoProvider {
  constructor(private readonly baseUrl: string) {
    if (!baseUrl) throw new Error("KupoProvider requires a baseUrl");
  }

  private url(path: string): string {
    const base = this.baseUrl.replace(/\/+$/, "");
    return `${base}${path}`;
  }

  async health(): Promise<KupoHealthResponse> {
    const res = await fetch(this.url("/health"), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Kupo /health failed: ${res.status}`);
    }
    return (await res.json()) as KupoHealthResponse;
  }

  async getTipSlot(): Promise<number> {
    const h = await this.health();
    return h.most_recent_node_tip;
  }

  async getChainTimeMs(systemStartMs: number): Promise<number> {
    const slot = await this.getTipSlot();
    return systemStartMs + slot * 1000;
  }

  async matches(pattern: string, unspent = true): Promise<KupoMatch[]> {
    const qs = unspent ? "?unspent" : "";
    const res = await fetch(this.url(`/matches/${pattern}${qs}`));
    if (!res.ok) {
      throw new Error(
        `Kupo /matches/${pattern} failed: ${res.status} ${res.statusText}`,
      );
    }
    return (await res.json()) as KupoMatch[];
  }

  async getDatum(datumHash: string): Promise<string> {
    const res = await fetch(this.url(`/datums/${datumHash}`));
    if (!res.ok) {
      throw new Error(
        `Kupo /datums/${datumHash} failed: ${res.status} ${res.statusText}`,
      );
    }
    const data = (await res.json()) as KupoDatumResponse;
    if (!data.datum) {
      throw new Error(`Kupo returned no datum for hash ${datumHash}`);
    }
    return data.datum;
  }

  async findOracleUtxo(
    policyId: string,
    tokenName: string,
  ): Promise<RawOracleUtxo> {
    const pattern = `${policyId}.${tokenName}`;
    const matches = await this.matches(pattern, true);
    if (matches.length === 0) {
      throw new Error(
        `No unspent UTXO found for oracle NFT ${pattern}. ` +
          `The feed may not exist on this network or Kupo hasn't indexed it yet.`,
      );
    }
    const match = matches[0];
    return {
      txHash: match.transaction_id,
      outputIndex: match.output_index,
      address: match.address,
      datumHash: match.datum_hash,
      inlineDatum: null,
      slotNo: match.created_at?.slot_no,
    };
  }

  async getOracleDatum(policyId: string, tokenName: string): Promise<{
    utxo: RawOracleUtxo;
    datumHex: string;
  }> {
    const utxo = await this.findOracleUtxo(policyId, tokenName);
    if (!utxo.datumHash) {
      throw new Error(
        `Oracle UTXO at ${utxo.txHash}#${utxo.outputIndex} has no datum_hash`,
      );
    }
    const datumHex = await this.getDatum(utxo.datumHash);
    return { utxo, datumHex };
  }
}
