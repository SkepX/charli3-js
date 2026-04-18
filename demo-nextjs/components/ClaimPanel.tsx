"use client";

import { useEffect, useState } from "react";

interface CardanoApi {
  getNetworkId: () => Promise<number>;
  getUsedAddresses: () => Promise<string[]>;
  submitTx: (tx: string) => Promise<string>;
}

interface CardanoWindow {
  cardano?: Record<
    string,
    {
      name: string;
      icon?: string;
      apiVersion?: string;
      enable: () => Promise<CardanoApi>;
      isEnabled: () => Promise<boolean>;
    }
  >;
}

interface OracleRef {
  pair: string;
  policyId: string;
  outRef: { txHash: string; outputIndex: number };
  price: {
    value: number;
    rawValue: string;
    precision: number;
    createdAt: string;
    expiresAt: string;
    isExpired: boolean;
  };
}

interface RefreshResult {
  txHash: string;
  pair: string;
  median: string;
  validityMs: { startMs: number; endMs: number };
  feedsUsed: number;
}

interface PriceTrace {
  sdkMedian?: { value: number; feedsUsed: number };
  onChain?: { value: number; createdAt: string; expiresAt: string };
  validatorSaw?: { value: number; claimTxHash?: string };
}

interface ScriptArtifacts {
  scriptAddress: string;
  scriptCborHex: string;
  thresholdPrice: string;
}

type Phase = "idle" | "busy" | "done" | "error";

interface TxStatus {
  phase: Phase;
  message?: string;
  txHash?: string;
}

const DEPOSIT_LOVELACE = 3_000_000n;

export default function ClaimPanel({ pair }: { pair: string }) {
  const [hasLace, setHasLace] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [artifacts, setArtifacts] = useState<ScriptArtifacts | null>(null);
  const [depositTx, setDepositTx] = useState<string | null>(null);

  const [deposit, setDeposit] = useState<TxStatus>({ phase: "idle" });
  const [refresh, setRefresh] = useState<TxStatus>({ phase: "idle" });
  const [claim, setClaim] = useState<TxStatus>({ phase: "idle" });
  const [trace, setTrace] = useState<PriceTrace>({});

  useEffect(() => {
    const id = setInterval(() => {
      const w = window as unknown as CardanoWindow;
      setHasLace(!!w.cardano?.lace);
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("charli3-demo-deposit-tx");
    if (saved) setDepositTx(saved);
  }, []);

  useEffect(() => {
    fetch("/api/script")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setArtifacts(j);
      })
      .catch((err) =>
        setDeposit({
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, []);

  async function connect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const w = window as unknown as CardanoWindow;
      const lace = w.cardano?.lace;
      if (!lace) throw new Error("Lace not detected. Install it from lace.io.");
      const api = await lace.enable();
      const netId = await api.getNetworkId();
      if (netId !== 0) {
        throw new Error(
          `Lace is on ${netId === 1 ? "mainnet" : `network ${netId}`}. ` +
            `Switch to preprod in Lace's settings and reconnect.`,
        );
      }
      const [addr] = await api.getUsedAddresses();
      if (!addr) throw new Error("Lace returned no used addresses. Fund the wallet first.");
      setWalletAddress(addr);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function getLucid() {
    const { Lucid, Blockfrost } = await import("@lucid-evolution/lucid");
    const projectId = process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        "Set NEXT_PUBLIC_BLOCKFROST_PROJECT_ID in demo-nextjs/.env.local",
      );
    }
    const lucid = await Lucid(
      new Blockfrost(
        "https://cardano-preprod.blockfrost.io/api/v0",
        projectId,
      ),
      "Preprod",
    );
    const w = window as unknown as CardanoWindow;
    const api = await w.cardano!.lace.enable();
    lucid.selectWallet.fromAPI(api as never);
    return lucid;
  }

  async function runDeposit() {
    if (!artifacts) return;
    try {
      setDeposit({ phase: "busy", message: "Building deposit tx…" });
      const { Constr, Data, getAddressDetails } = await import(
        "@lucid-evolution/lucid"
      );
      const lucid = await getLucid();
      const addr = await lucid.wallet().address();
      const { paymentCredential } = getAddressDetails(addr);
      if (!paymentCredential)
        throw new Error("wallet has no payment credential");
      const beneficiaryPkh = paymentCredential.hash;

      const datum = Data.to(
        new Constr(0, [BigInt(artifacts.thresholdPrice), beneficiaryPkh]),
      );

      const tx = await lucid
        .newTx()
        .pay.ToContract(
          artifacts.scriptAddress,
          { kind: "inline", value: datum },
          { lovelace: DEPOSIT_LOVELACE },
        )
        .complete();

      setDeposit({ phase: "busy", message: "Sign deposit in Lace…" });
      const signed = await tx.sign.withWallet().complete();

      setDeposit({ phase: "busy", message: "Submitting deposit…" });
      const txHash = await signed.submit();
      localStorage.setItem("charli3-demo-deposit-tx", txHash);
      setDepositTx(txHash);
      setDeposit({
        phase: "busy",
        message: "Waiting for confirmation (this can take ~60s)…",
        txHash,
      });

      await lucid.awaitTx(txHash);
      setDeposit({
        phase: "done",
        message: "Deposit confirmed. Now run the claim.",
        txHash,
      });
    } catch (err) {
      setDeposit({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function runRefresh() {
    try {
      setRefresh({
        phase: "busy",
        message: "Collecting fresh feeds from oracle nodes…",
      });
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair }),
      });
      const j = (await res.json()) as RefreshResult & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "refresh failed");
      const txHash = j.txHash;
      const medianRaw = BigInt(j.median);
      const medianValue = Number(medianRaw) / 1e6;
      setTrace((t) => ({
        ...t,
        sdkMedian: { value: medianValue, feedsUsed: j.feedsUsed },
      }));
      setRefresh({
        phase: "busy",
        message: "Waiting for the new oracle UTXO to confirm…",
        txHash,
      });

      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3_000));
        const r = await fetch(
          `/api/oracle-ref?pair=${encodeURIComponent(pair)}`,
        );
        if (!r.ok) continue;
        const ref = (await r.json()) as OracleRef;
        if (ref.outRef.txHash === txHash) {
          setTrace((t) => ({
            ...t,
            onChain: {
              value: ref.price.value,
              createdAt: ref.price.createdAt,
              expiresAt: ref.price.expiresAt,
            },
          }));
          setRefresh({
            phase: "done",
            message: "Oracle updated on-chain. Your claim will read this price.",
            txHash,
          });
          return;
        }
      }
      setRefresh({
        phase: "error",
        message:
          "Refresh tx submitted but confirmation took too long. Try claim anyway.",
        txHash,
      });
    } catch (err) {
      setRefresh({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function runClaim() {
    if (!artifacts || !depositTx) return;
    try {
      setClaim({ phase: "busy", message: "Fetching oracle UTXO + locked UTXO…" });
      const { Constr, Data, getAddressDetails } = await import(
        "@lucid-evolution/lucid"
      );

      const refRes = await fetch(
        `/api/oracle-ref?pair=${encodeURIComponent(pair)}`,
      );
      const ref = (await refRes.json()) as OracleRef;
      if (!refRes.ok)
        throw new Error((ref as unknown as { error: string }).error);
      setTrace((t) => ({
        ...t,
        validatorSaw: { value: ref.price.value },
      }));

      const lucid = await getLucid();
      const addr = await lucid.wallet().address();
      const { paymentCredential } = getAddressDetails(addr);
      if (!paymentCredential)
        throw new Error("wallet has no payment credential");
      const beneficiaryPkh = paymentCredential.hash;

      const [oracleUtxo, locked] = await lucid.utxosByOutRef([
        ref.outRef,
        { txHash: depositTx, outputIndex: 0 },
      ]);
      if (!oracleUtxo) throw new Error("oracle utxo not yet visible");
      if (!locked)
        throw new Error(
          `no locked UTXO found from deposit ${depositTx} - ` +
            `did it confirm? Already claimed? Reset below.`,
        );
      if (locked.address !== artifacts.scriptAddress)
        throw new Error(
          `deposit ${depositTx}#0 is at ${locked.address}, not the script address - reset`,
        );

      const validator = {
        type: "PlutusV2" as const,
        script: artifacts.scriptCborHex,
      };
      const redeemer = Data.to(new Constr(0, []));

      setClaim({ phase: "busy", message: "Building claim tx…" });
      const tx = await lucid
        .newTx()
        .collectFrom([locked], redeemer)
        .readFrom([oracleUtxo])
        .addSignerKey(beneficiaryPkh)
        .attach.SpendingValidator(validator)
        .pay.ToAddress(addr, { lovelace: 0n })
        .complete();

      setClaim({ phase: "busy", message: "Sign claim in Lace…" });
      const signed = await tx.sign.withWallet().complete();

      setClaim({ phase: "busy", message: "Submitting claim…" });
      const txHash = await signed.submit();
      setClaim({
        phase: "busy",
        message: "Waiting for confirmation…",
        txHash,
      });

      await lucid.awaitTx(txHash);
      localStorage.removeItem("charli3-demo-deposit-tx");
      setDepositTx(null);
      setTrace((t) => ({
        ...t,
        validatorSaw: t.validatorSaw
          ? { ...t.validatorSaw, claimTxHash: txHash }
          : { value: 0, claimTxHash: txHash },
      }));
      setClaim({
        phase: "done",
        message: "Claimed. Aiken validator read the oracle and released the funds.",
        txHash,
      });
    } catch (err) {
      setClaim({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function resetDeposit() {
    localStorage.removeItem("charli3-demo-deposit-tx");
    setDepositTx(null);
    setDeposit({ phase: "idle" });
    setRefresh({ phase: "idle" });
    setClaim({ phase: "idle" });
    setTrace({});
  }

  if (!hasLace) {
    return (
      <section className="panel">
        <p className="small">
          Lace wallet not detected. Install from{" "}
          <a href="https://www.lace.io/" target="_blank" rel="noreferrer">
            lace.io
          </a>
          , switch to preprod, and fund the wallet from the{" "}
          <a
            href="https://docs.cardano.org/cardano-testnets/tools/faucet"
            target="_blank"
            rel="noreferrer"
          >
            preprod faucet
          </a>
          .
        </p>
      </section>
    );
  }

  if (!walletAddress) {
    return (
      <section className="panel">
        <button disabled={connecting} onClick={connect}>
          {connecting ? "Connecting…" : "Connect Lace"}
        </button>
        {connectError && (
          <p className="err" style={{ marginTop: 12 }}>
            {connectError}
          </p>
        )}
      </section>
    );
  }

  const depositBusy = deposit.phase === "busy";
  const refreshBusy = refresh.phase === "busy";
  const claimBusy = claim.phase === "busy";

  return (
    <section className="panel">
      <dl className="kv">
        <dt>wallet</dt>
        <dd className="mono">{walletAddress}</dd>
        {artifacts && (
          <>
            <dt>script</dt>
            <dd className="mono">{artifacts.scriptAddress}</dd>
            <dt>threshold</dt>
            <dd>
              ${(Number(artifacts.thresholdPrice) / 1e6).toFixed(6)} (claim
              succeeds only if the oracle price is at or above this)
            </dd>
          </>
        )}
      </dl>

      <h3 style={{ marginTop: 24, fontSize: 15 }}>1. Deposit</h3>
      <p className="small" style={{ margin: "4px 0 12px" }}>
        Lock {Number(DEPOSIT_LOVELACE) / 1e6} tADA at <code>price_gated_payout</code>{" "}
        with datum = (threshold, your PKH).
      </p>
      <button
        disabled={!artifacts || depositBusy || !!depositTx}
        onClick={runDeposit}
      >
        {depositBusy
          ? deposit.message ?? "Working…"
          : depositTx
            ? "Deposited"
            : `Deposit ${Number(DEPOSIT_LOVELACE) / 1e6} tADA`}
      </button>
      {deposit.message && deposit.phase !== "busy" && (
        <p
          className={deposit.phase === "error" ? "err" : "small"}
          style={{ marginTop: 8 }}
        >
          {deposit.message}
        </p>
      )}
      {deposit.txHash && (
        <p className="small" style={{ marginTop: 4 }}>
          <a
            href={`https://preprod.cardanoscan.io/transaction/${deposit.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mono"
          >
            {deposit.txHash}
          </a>
        </p>
      )}

      <h3 style={{ marginTop: 24, fontSize: 15 }}>2. Refresh oracle (pull round-trip)</h3>
      <p className="small" style={{ margin: "4px 0 12px" }}>
        Post a fresh ADA/USD price on-chain. <code>charli3-js</code> asks every
        oracle node for a freshly signed feed, combines them, builds the
        aggregator tx, and submits it. A demo server wallet pays the ~1.5 tADA
        fee here - in a real dApp this can be a keeper bot, your backend, or
        the end user.
      </p>
      <button
        disabled={!depositTx || refreshBusy || refresh.phase === "done"}
        onClick={runRefresh}
      >
        {refreshBusy
          ? refresh.message ?? "Working…"
          : refresh.phase === "done"
            ? "Oracle refreshed"
            : "Refresh oracle price"}
      </button>
      {refresh.message && refresh.phase !== "busy" && (
        <p
          className={refresh.phase === "error" ? "err" : "small"}
          style={{ marginTop: 8 }}
        >
          {refresh.message}
        </p>
      )}
      {refresh.txHash && (
        <p className="small" style={{ marginTop: 4 }}>
          <a
            href={`https://preprod.cardanoscan.io/transaction/${refresh.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mono"
          >
            {refresh.txHash}
          </a>
        </p>
      )}
      {(trace.sdkMedian || trace.onChain) && (
        <div className="price-trace">
          <div className="price-trace-title">price trace</div>
          {trace.sdkMedian && (
            <div className="price-trace-row">
              <span className="pt-step">1. SDK median</span>
              <span className="pt-value">
                ${trace.sdkMedian.value.toFixed(6)}
              </span>
              <span className="pt-note">
                IQR consensus of {trace.sdkMedian.feedsUsed} signed feeds (what{" "}
                <code>submitRound2</code> returned)
              </span>
            </div>
          )}
          {trace.onChain && (
            <div className="price-trace-row">
              <span className="pt-step">2. On-chain datum</span>
              <span className="pt-value">
                ${trace.onChain.value.toFixed(6)}
              </span>
              <span className="pt-note">
                posted {new Date(trace.onChain.createdAt).toLocaleTimeString()}{" "}
                · expires{" "}
                {new Date(trace.onChain.expiresAt).toLocaleTimeString()}
              </span>
            </div>
          )}
          {trace.validatorSaw && (
            <div className="price-trace-row">
              <span className="pt-step">3. Validator read</span>
              <span className="pt-value">
                ${trace.validatorSaw.value.toFixed(6)}
              </span>
              <span className="pt-note">
                Aiken <code>price_gated_payout</code> compared this to{" "}
                {artifacts &&
                  `$${(Number(artifacts.thresholdPrice) / 1e6).toFixed(2)}`}{" "}
                threshold
                {trace.validatorSaw.claimTxHash && " · funds released"}
              </span>
            </div>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 24, fontSize: 15 }}>3. Claim</h3>
      <p className="small" style={{ margin: "4px 0 12px" }}>
        Spend the locked UTXO, attaching the freshly-posted Charli3 oracle UTXO
        as a reference input. The Aiken validator reads the oracle datum and
        releases the funds only if the price is at or above the threshold.
      </p>
      <button
        disabled={!depositTx || claimBusy || claim.phase === "done"}
        onClick={runClaim}
      >
        {claimBusy
          ? claim.message ?? "Working…"
          : claim.phase === "done"
            ? "Claimed"
            : "Claim locked tADA"}
      </button>
      {claim.message && claim.phase !== "busy" && (
        <p
          className={claim.phase === "error" ? "err" : "small"}
          style={{ marginTop: 8 }}
        >
          {claim.message}
        </p>
      )}
      {claim.txHash && (
        <p className="small" style={{ marginTop: 4 }}>
          <a
            href={`https://preprod.cardanoscan.io/transaction/${claim.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mono"
          >
            {claim.txHash}
          </a>
        </p>
      )}

      {(depositTx ||
        deposit.phase === "error" ||
        refresh.phase === "error" ||
        claim.phase === "error") && (
        <p style={{ marginTop: 16 }}>
          <button className="ghost" onClick={resetDeposit}>
            reset demo state
          </button>
        </p>
      )}
    </section>
  );
}
