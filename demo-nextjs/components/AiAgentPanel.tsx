"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

interface CardanoApi {
  getNetworkId: () => Promise<number>;
  getUsedAddresses: () => Promise<string[]>;
  submitTx: (tx: string) => Promise<string>;
}
interface CardanoWindow {
  cardano?: Record<
    string,
    {
      enable: () => Promise<CardanoApi>;
    }
  >;
}

interface TraceStep {
  tool: string;
  label: string;
  detail: string;
  ok: boolean;
  link?: { label: string; url: string };
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  trace?: TraceStep[];
}

interface PaymentProposal {
  recipient_address: string;
  usd_amount: number;
  ada_amount: number;
  oracle_price: number;
  oracle_utxo?: string;
  reason: string;
}

type PayPhase = "idle" | "busy" | "done" | "error";
interface PayStatus {
  phase: PayPhase;
  message?: string;
  txHash?: string;
}

function renderWithLinks(text: string) {
  const parts: (string | { url: string })[] = [];
  const regex = /https?:\/\/[^\s)]+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ url: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <a
        key={i}
        href={p.url}
        target="_blank"
        rel="noreferrer"
        className="chat-link"
      >
        {p.url.length > 64 ? `${p.url.slice(0, 56)}…` : p.url}
      </a>
    ),
  );
}

const SAMPLE_INVOICE = `INVOICE #INV-2041
Issued: ${new Date().toISOString().slice(0, 10)}
From:   Atlas, code-review agent
For:    Reviewed PR #412 (2 files, 37 lines)
Amount due: $2.50 USD

Settle on Cardano preprod.
Pay to: addr_test1qqdw6xlva7ray98vvc85wfurmfvg2elp2cfuyfx2xqmy2akh94vvt36jzyzty422ruhemmy0lnxtgxxtdu7rvk3mxxxqlzm4j4

Notes: client needs to be paid in ADA.`;

export default function AiAgentPanel() {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<PaymentProposal | null>(null);
  const [pay, setPay] = useState<PayStatus>({ phase: "idle" });
  const [agentError, setAgentError] = useState<string | null>(null);
  const [hasLace, setHasLace] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [skillCopied, setSkillCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const w = window as unknown as CardanoWindow;
      setHasLace(!!w.cardano?.lace);
    }, 500);
    return () => clearInterval(id);
  }, []);

  async function copySkill() {
    try {
      const res = await fetch("/skill.md", { cache: "no-store" });
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setSkillCopied(true);
      setTimeout(() => setSkillCopied(false), 1800);
    } catch {
      window.open("/skill.md", "_blank");
    }
  }

  async function connectLace() {
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
          `Lace is on ${netId === 1 ? "mainnet" : `network ${netId}`}. Switch to preprod in Lace's settings and reconnect.`,
        );
      }
      const [addr] = await api.getUsedAddresses();
      if (!addr) {
        throw new Error("Lace returned no used addresses. Fund the wallet first.");
      }
      setWalletAddress(addr);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && lastAssistantRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = lastAssistantRef.current;
      container.scrollTo({
        top: el.offsetTop - container.offsetTop - 8,
        behavior: "smooth",
      });
      return;
    }
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, proposal, pay]);

  async function callAgent(next: ChatTurn[]) {
    setBusy(true);
    setAgentError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const j = (await res.json()) as {
        message?: string;
        paymentProposal?: PaymentProposal;
        trace?: TraceStep[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "agent error");
      const reply: ChatTurn = {
        role: "assistant",
        content: j.message ?? "",
        trace: j.trace,
      };
      setMessages([...next, reply]);
      if (j.paymentProposal) {
        setProposal(j.paymentProposal);
        setPay({ phase: "idle" });
      }
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    await callAgent(next);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setInput("");
    send(v);
  }

  function reset() {
    setMessages([]);
    setProposal(null);
    setPay({ phase: "idle" });
    setAgentError(null);
  }

  async function signAndPay() {
    if (!proposal) return;
    setPay({ phase: "busy", message: "Opening Lace…" });
    try {
      const w = window as unknown as CardanoWindow;
      const lace = w.cardano?.lace;
      if (!lace) throw new Error("Lace not detected. Install from lace.io.");
      const api = await lace.enable();
      const netId = await api.getNetworkId();
      if (netId !== 0) {
        throw new Error("Switch Lace to preprod and reconnect.");
      }

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
      lucid.selectWallet.fromAPI(api as never);

      const lovelace = BigInt(Math.round(proposal.ada_amount * 1_000_000));
      if (lovelace < 1_000_000n) {
        throw new Error(
          "Payment is below the 1 ADA minimum UTXO. Try a larger USD amount.",
        );
      }

      setPay({ phase: "busy", message: "Building tx…" });
      const tx = await lucid
        .newTx()
        .pay.ToAddress(proposal.recipient_address, { lovelace })
        .complete();

      setPay({ phase: "busy", message: "Sign in Lace…" });
      const signed = await tx.sign.withWallet().complete();
      setPay({ phase: "busy", message: "Submitting…" });
      const txHash = await signed.submit();
      setPay({
        phase: "busy",
        message: "Waiting for confirmation…",
        txHash,
      });
      await lucid.awaitTx(txHash);
      setPay({ phase: "done", message: "Paid", txHash });

      const paidTurn: ChatTurn = {
        role: "user",
        content: `Paid. Tx hash: ${txHash}`,
      };
      const next = [...messages, paidTurn];
      setMessages(next);
      setProposal(null);
      await callAgent(next);
    } catch (err) {
      setPay({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <section className="panel agent-panel">
      <div className="agent-head">
        <div className="agent-eyebrow">AI agent · live tool-calling</div>
        <h3 className="agent-title">Pay a USD invoice in ADA</h3>
        <p className="agent-lede">
          Drop a USD invoice below. A GPT-4o-mini agent calls{" "}
          <code>charli3-js</code> as a tool to read the latest on-chain ADA/USD
          price, validates the preprod address, computes the ADA amount, and
          hands you a payment proposal to sign in Lace.
        </p>
        <div className="agent-skill">
          <div className="agent-skill-copy">
            <span className="agent-skill-label">
              use Charli3 in your own agent
            </span>
            <span className="agent-skill-sub">
              one markdown file that teaches any agent (Masumi, Claude, Cursor,
              any tool-calling LLM) to read + refresh on-chain prices via{" "}
              <code>charli3-js</code>.
            </span>
          </div>
          <div className="agent-skill-actions">
            <button
              type="button"
              className="skill-btn"
              onClick={copySkill}
            >
              {skillCopied ? "copied ✓" : "copy skill.md"}
            </button>
            <a
              className="ghost example-pill"
              href="/skill.md"
              target="_blank"
              rel="noreferrer"
            >
              view raw
            </a>
          </div>
        </div>
        <div className="agent-wallet">
          {walletAddress ? (
            <span className="agent-wallet-ok">
              <span className="dot-ok" /> Lace connected ·{" "}
              <code className="mono">
                {walletAddress.slice(0, 14)}…{walletAddress.slice(-6)}
              </code>
            </span>
          ) : (
            <span className="agent-wallet-warn">
              <span className="dot-warn" /> Lace not connected - connect to
              enable the agent.
            </span>
          )}
        </div>
      </div>

      {!walletAddress ? (
        <div className="agent-gate">
          <div className="agent-gate-title">Connect Lace to continue</div>
          <p className="agent-gate-hint">
            The agent proposes a payment you sign in Lace. Connect your
            preprod wallet before dropping an invoice.
          </p>
          <div className="agent-gate-actions">
            <button
              onClick={connectLace}
              disabled={!hasLace || connecting}
            >
              {connecting
                ? "Connecting…"
                : hasLace
                  ? "Connect Lace"
                  : "Lace not detected"}
            </button>
            {!hasLace && (
              <a
                className="ghost example-pill"
                href="https://www.lace.io/"
                target="_blank"
                rel="noreferrer"
              >
                install lace
              </a>
            )}
          </div>
          {connectError && (
            <div className="chat-status err">{connectError}</div>
          )}
        </div>
      ) : (
      <>
      <div className="agent-transcript" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="agent-empty">
            <div className="agent-empty-title">Drop an invoice</div>
            <p className="agent-empty-hint">
              Paste any invoice text containing a USD amount and a preprod
              address (<code>addr_test1…</code>) into the box below and hit
              send. No format required - the agent parses it.
            </p>
            <div className="agent-empty-actions">
              <button
                type="button"
                className="ghost example-pill"
                onClick={() => setInput(SAMPLE_INVOICE)}
                disabled={busy}
              >
                insert sample invoice
              </button>
              <a
                className="ghost example-pill"
                href="/sample-invoice.pdf"
                target="_blank"
                rel="noreferrer"
              >
                download PDF
              </a>
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isLastAssistant =
            m.role === "assistant" && i === messages.length - 1;
          return (
          <div
            key={i}
            className={`chat-msg chat-${m.role}`}
            ref={isLastAssistant ? lastAssistantRef : undefined}
          >
            <div className="chat-who">{m.role === "user" ? "you" : "agent"}</div>
            {m.role === "assistant" && m.trace && m.trace.length > 0 && (
              <div className="agent-trace">
                <div className="agent-trace-title">
                  thought process · {m.trace.length} tool call
                  {m.trace.length === 1 ? "" : "s"}
                </div>
                <ol className="agent-trace-list">
                  {m.trace.map((t, k) => (
                    <li
                      key={k}
                      className={`agent-trace-step ${t.ok ? "ok" : "err"}`}
                    >
                      <span className="agent-trace-num">{k + 1}</span>
                      <div>
                        <div className="agent-trace-label">{t.label}</div>
                        <div className="agent-trace-detail">{t.detail}</div>
                        {t.link && (
                          <a
                            className="agent-trace-link"
                            href={t.link.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t.link.label} ↗
                          </a>
                        )}
                        <div className="agent-trace-tool">
                          <code>{t.tool}()</code>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="chat-body">
              {m.role === "assistant" ? renderWithLinks(m.content) : m.content}
            </div>
          </div>
          );
        })}

        {busy && (
          <div className="chat-msg chat-assistant">
            <div className="chat-who">agent</div>
            <div className="chat-body">
              <span className="typing">thinking</span>
            </div>
          </div>
        )}

        {proposal && pay.phase !== "done" && (
          <div className="payment-proposal">
            <div className="pp-title">Payment proposal</div>
            <dl className="pp-grid">
              <dt>Recipient</dt>
              <dd className="mono">
                {proposal.recipient_address.slice(0, 20)}…
                {proposal.recipient_address.slice(-10)}
              </dd>
              <dt>Reason</dt>
              <dd>{proposal.reason}</dd>
              <dt>Amount</dt>
              <dd>
                ${proposal.usd_amount.toFixed(2)} USD{" "}
                <span className="dim">=</span>{" "}
                <strong className="accent">
                  {proposal.ada_amount.toFixed(4)} ADA
                </strong>
              </dd>
              <dt>Rate</dt>
              <dd className="mono">
                1 ADA = ${proposal.oracle_price.toFixed(6)} - Charli3 ODV
              </dd>
              {proposal.oracle_utxo && (
                <>
                  <dt>Oracle UTXO</dt>
                  <dd>
                    <a
                      href={`https://preprod.cardanoscan.io/transaction/${proposal.oracle_utxo.split("#")[0]}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mono"
                    >
                      {proposal.oracle_utxo.slice(0, 16)}…
                    </a>
                  </dd>
                </>
              )}
            </dl>
            <div className="pp-actions">
              <button onClick={signAndPay} disabled={pay.phase === "busy"}>
                {pay.phase === "busy"
                  ? pay.message ?? "Working…"
                  : "Sign & pay with Lace"}
              </button>
              <button className="ghost" onClick={() => setProposal(null)}>
                dismiss
              </button>
            </div>
          </div>
        )}

        {pay.phase === "error" && (
          <div className="chat-status err">{pay.message}</div>
        )}
        {pay.phase === "done" && pay.txHash && (
          <div className="chat-status ok">
            Paid ·{" "}
            <a
              href={`https://preprod.cardanoscan.io/transaction/${pay.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mono"
            >
              {pay.txHash.slice(0, 22)}…
            </a>
          </div>
        )}
        {agentError && <div className="chat-status err">{agentError}</div>}
      </div>

      <form onSubmit={onSubmit} className="agent-input-col">
        <textarea
          className="agent-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            "Paste or drop an invoice here.\nExample: Pay $3 for code review to addr_test1qz… ⌘/Ctrl + Enter to send."
          }
          disabled={busy}
          rows={6}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit(e as unknown as FormEvent<HTMLFormElement>);
            }
          }}
        />
        <div className="agent-input-actions">
          <span className="agent-input-hint">
            ⌘/Ctrl + Enter to send
          </span>
          <div className="agent-input-btns">
            {messages.length > 0 && (
              <button type="button" className="ghost" onClick={reset}>
                new chat
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim()}>
              {busy ? "Sending…" : "Send invoice"}
            </button>
          </div>
        </div>
      </form>
      </>
      )}
    </section>
  );
}
