import { Charli3 } from "charli3-js";
import AiAgentPanel from "../components/AiAgentPanel";
import ClaimPanel from "../components/ClaimPanel";
import CodeCompare from "../components/CodeCompare";
import InstallPill from "../components/InstallPill";
import NavBar from "../components/NavBar";

export const revalidate = 30;

async function loadHero() {
  const c3 = new Charli3({ network: "preprod" });
  const [odv, push] = await Promise.all([
    c3.getOdvReference("ADA/USD").catch(() => null),
    c3.getAllPrices().catch(() => []),
  ]);
  return { odv, push };
}

function formatAge(from: Date): string {
  const secs = Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export default function Page() {
  return <PageBody />;
}

async function PageBody() {
  const { odv, push } = await loadHero();

  const STEPS: { title: string; body: string }[] = [
    {
      title: "Connect Lace",
      body: "CIP-30 handshake from the browser. The demo reads your preprod address and checks you are on the right network.",
    },
    {
      title: "Lock 3 tADA",
      body: 'Deposit to a vault with datum "release only when ADA/USD is at or above $0.10". Lace signs the deposit tx.',
    },
    {
      title: "Pull a fresh price",
      body: "The SDK asks every oracle node for a signed feed, runs IQR consensus, builds the aggregator tx, collects node vkey witnesses, and submits. Around 30 seconds end to end.",
    },
    {
      title: "Claim",
      body: "Spend the vault. The Aiken validator reads the freshly posted AggState datum as a reference input and releases the tADA if the price clears the threshold.",
    },
  ];

  return (
    <>
      <NavBar />
      <main>
      <header className="page-head" id="hero">
        <div className="eyebrow">Charli3 Oracles Hackathon, Track 3</div>
        <h1>
          <span className="brand">charli3-js</span>
        </h1>
        <p className="tagline">
          A TypeScript SDK for the Charli3 pull oracle on Cardano. One import,
          one call, a fresh price on chain.
        </p>
        <div className="hero-install">
          <InstallPill />
          <a
            className="hero-npm-link"
            href="https://www.npmjs.com/package/charli3-js"
            target="_blank"
            rel="noreferrer"
          >
            view on npm ↗
          </a>
          <a
            className="hero-npm-link"
            href="https://charli3-js-bc690dc5.mintlify.app/introduction"
            target="_blank"
            rel="noreferrer"
          >
            read the docs ↗
          </a>
        </div>
      </header>

      <section className="step hero">
        <div className="price-hero">
          <div>
            <div className="price-label">ada / usd on chain</div>
            <div className="price-value">
              {odv && odv.price.rawValue > 0n
                ? `$${odv.price.value.toFixed(6)}`
                : "--"}
            </div>
            {odv && odv.price.rawValue > 0n && (
              <div className="price-meta">
                posted {formatAge(odv.price.createdAt)}
                <span className="dot">·</span>
                {odv.price.isExpired
                  ? "needs a fresh pull"
                  : `valid for ${Math.max(0, Math.floor((odv.price.expiresAt.getTime() - Date.now()) / 1000))}s`}
              </div>
            )}
          </div>
          {odv && (
            <span className={`badge ${odv.price.isExpired ? "warn" : "ok"}`}>
              {odv.price.isExpired ? "stale" : "fresh"}
            </span>
          )}
        </div>
        {push.length > 0 && (
          <div className="feeds-grid">
            {push
              .filter((p: { pair: string }) => p.pair !== "ADA/USD")
              .map((p: { pair: string; value: number }) => (
                <div key={p.pair} className="feed-tile">
                  <div className="pair">{p.pair}</div>
                  <div className="val">${p.value.toFixed(4)}</div>
                </div>
              ))}
          </div>
        )}
        <div className="sdk-note">
          <span className="tag">charli3-js</span>
          Hero price is <code>new Charli3().getOdvReference(&quot;ADA/USD&quot;)</code>.
          If it shows stale, no one has paid to post a fresh datum in the last
          5 minutes. That is the point of a pull oracle. Scroll down to pull
          one yourself.
        </div>
      </section>

      <h2 id="loop">The pull-oracle loop</h2>
      <div className="steps-grid">
        {STEPS.map((s, i) => (
          <div key={s.title} className="step-card">
            <div className="step-num">{i + 1}</div>
            <div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 id="demo">Run the loop</h2>
      <ClaimPanel pair="ADA/USD" />

      <h2 id="invoice">AI agent: pay a USD invoice in ADA</h2>
      <p className="section-lede">
        Drop a USD invoice into the box. A GPT-4o-mini agent calls{" "}
        <code>charli3-js</code> as a tool to read the latest on-chain ADA/USD
        price, validates the preprod address, computes the ADA amount, and
        proposes a payment you sign with Lace. The agent never guesses a
        price - it reads the Charli3 ODV datum directly.
      </p>
      <AiAgentPanel />

      <h2 id="compare">Same action, two SDKs</h2>
      <p className="section-lede">
        The only existing client for Charli3 ODV is the official Python SDK.
        Cardano builders on Node, Next.js, or Vercel cannot use it in process.
        Toggle to see what a single &quot;refresh ADA/USD&quot; costs in each.
      </p>
      <CodeCompare />

      <h2 id="track3">Track 3, Oracle Tooling</h2>
      <p className="section-lede">
        The challenge asks for work that lets the next Cardano builder ship
        faster on MIT open-source pull oracles. This is how charli3-js answers
        each lens.
      </p>
      <div className="criteria-grid">
        <div className="criterion">
          <div className="criterion-label">Technical implementation</div>
          <p>
            Full ODV Round 2 works on preprod today. Three feeds confirmed on
            chain during development (ADA/USD, BTC/USD, USDM/ADA). The SDK,
            the Aiken validator, and the Next.js demo all read the same
            AggState UTXO, so the loop closes end to end. Solving the CBOR map
            ordering and slot-rounded validity window took real work against
            the on-chain error traces.
          </p>
        </div>
        <div className="criterion">
          <div className="criterion-label">Innovation</div>
          <p>
            First TypeScript client for Charli3&apos;s pull oracle. It fills a
            runtime gap the Python SDK cannot reach, browsers, server
            components, and serverless functions. The aggregate-message
            builder, IQR consensus, and Ed25519 verification were ported from
            scratch, not wrapped.
          </p>
        </div>
        <div className="criterion">
          <div className="criterion-label">Impact on Cardano</div>
          <p>
            Any JS or TS project on Cardano can now read and refresh oracle
            prices with three lines. DeFi, NFT markets, and gaming apps that
            already live in the Node ecosystem get a path to on-chain data
            without a Python sidecar. Lower friction, more oracle-backed
            products, more on-chain transactions.
          </p>
        </div>
        <div className="criterion">
          <div className="criterion-label">Business potential</div>
          <p>
            Every pull costs an oracle fee, so a usable JS SDK is a direct
            volume lever for Charli3. For builders, charli3-js removes the
            infrastructure cost of running a separate Python worker. A Vercel
            deployment is enough.
          </p>
        </div>
      </div>

      <div className="footer">
        <span className="count-pill">npm i charli3-js</span>
        <p className="footer-line">
          <a href="https://github.com/SkepX/charli3-js">
            github.com/SkepX/charli3-js
          </a>
          <span className="dot">·</span>
          Charli3 Oracles Hackathon, April 2026
        </p>
      </div>
      </main>
    </>
  );
}
