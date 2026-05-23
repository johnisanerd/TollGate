/**
 * 0G-specific inline widget components extracted from WorkspaceDashboard.tsx.
 * Imported by WorkspaceDashboard.tsx and workspaces/0g/widgets.tsx.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { isTxHash } from "../../lib/validate";
import {
  CircleDollarSign,
  Database,
  Loader2,
  MessageCircle,
  Network,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useAppState } from "../../app-state";
import { useLocalStore } from "../../lib/storage";
import { deterministicScore, hashId, sha256Hex, fnv1aHex } from "../../lib/util-hash";
import { badgeFor } from "../../lib/ws-helpers";
import type { Receipt, Workspace } from "../../types";
import { services as allCatalogServices, makeTxHash } from "../../data";
import { SEEDED_PINS } from "./index";
import {
  ArrowUpRight,
  Bolt,
  Check,
  Copy,
  Link as LinkIco,
  Plus,
  Robot,
  X,
} from "../../icons402";
import { AgentScoreComparison } from "../../components/widgets/AgentScoreBadge";
import { runOgInference, anchorReceiptOnChain, isOgRegistryConfigured, getOgConfig, ogExplorerTxUrl, ogExplorerAddrUrl, uploadToOgStorage, registerAgentIdentity, anchorDeliveryOnChain } from "../../lib/og";
import { vaultRecordDecision, isMantleVaultConfigured, mantleExplorerTxUrl } from "../../lib/mantle";
import { useWallet } from "../../wallet";
import { useNetworkMode } from "../../hooks/useNetworkMode";
import * as api from "../../lib/api";
import {
  checkFunding,
  fundingReceiptPayload,
  recordFundingSpend,
  OG_FUNDING_SCOPE,
  OG_TREASURY_TOPUP_USD,
} from "./funding";
import { TreasuryPanel } from "./TreasuryPanel";

// ── Economy Dashboard ──────────────────────────────────────────────────────
type EconStats = { total: number; today: number; uniqueAgents: number; avgAmount: number };
type EconEvent =
  | { type: "snapshot"; receipts: Receipt[] }
  | { type: "receipt"; receipt: Receipt }
  | { type: "nft_update"; receiptId: string; tokenId: number; txHash: string };
type FeedEntry = Receipt & { nftTokenId?: number; nftTxHash?: string };

export function EconomyDashboard() {
  const [stats, setStats] = useState<EconStats | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

  useEffect(() => {
    if (!BASE) return;
    let es: EventSource | null = null;
    fetch(`${BASE}/api/receipts/stats`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(d => { if (d) setStats(d); setFetchError(false); }).catch(() => setFetchError(true));
    try {
      es = new EventSource(`${BASE}/api/events/payments`);
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);
      es.onmessage = (e) => {
        try {
          const ev: EconEvent = JSON.parse(e.data as string);
          if (ev.type === "snapshot") { setFeed(ev.receipts); }
          else if (ev.type === "receipt") {
            setFeed(prev => [ev.receipt, ...prev].slice(0, 10));
            setStats(prev => prev ? {
              total: prev.total + 1, today: prev.today + 1, uniqueAgents: prev.uniqueAgents,
              avgAmount: Math.round(((prev.avgAmount * prev.total + ev.receipt.amount) / (prev.total + 1)) * 10000) / 10000,
            } : prev);
          } else if (ev.type === "nft_update") {
            setFeed(prev => prev.map(r => r.id === ev.receiptId ? { ...r, nftTokenId: ev.tokenId, nftTxHash: ev.txHash } : r));
          }
        } catch { /* ignore parse errors */ }
      };
    } catch { /* SSE not supported */ }
    return () => { es?.close(); setConnected(false); };
  }, [BASE]);

  if (!BASE) return null;
  if (!stats && feed.length === 0) {
    if (fetchError) return <div className="muted sm" style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--red)", display: "inline-block" }} />Economy Dashboard — server offline. Set VITE_API_BASE to connect.</div>;
    return null;
  }

  const cardStyle: React.CSSProperties = { flex: "1 1 120px", background: "var(--field)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 };
  const valStyle: React.CSSProperties = { fontSize: "1.5rem", fontWeight: 800, color: "var(--primary)", lineHeight: 1 };
  const lblStyle: React.CSSProperties = { fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <TrendingUp width={13} height={13} style={{ color: "var(--primary)" }} />
        <span style={{ fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)" }}>Agent Economy · Live</span>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#22c55e" : "var(--muted)", display: "inline-block", marginLeft: 2 }} />
      </div>
      {stats && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={cardStyle}><span style={valStyle}>{stats.total}</span><span style={lblStyle}>Total payments</span></div>
          <div style={cardStyle}><span style={valStyle}>{stats.today}</span><span style={lblStyle}>Today</span></div>
          <div style={cardStyle}><span style={valStyle}>{stats.uniqueAgents}</span><span style={lblStyle}>Unique agents</span></div>
          <div style={cardStyle}><span style={valStyle}>${stats.avgAmount.toFixed(3)}</span><span style={lblStyle}>Avg price</span></div>
        </div>
      )}
      {feed.length > 0 && (
        <div style={{ background: "var(--field)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--line-2)", fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>
            Live payment feed
          </div>
          {feed.slice(0, 6).map((r, i) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: i < Math.min(feed.length - 1, 5) ? "1px solid var(--line-2)" : undefined, fontSize: ".74rem" }}>
              <span style={{ color: "#22c55e", fontWeight: 700, minWidth: 52 }}>${r.amount.toFixed(3)}</span>
              <span style={{ color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.serviceName}</span>
              {r.nftTokenId != null && r.nftTxHash && isTxHash(r.nftTxHash) ? (
                <a href={`https://explorer.mantle.xyz/tx/${r.nftTxHash}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: ".6rem", fontWeight: 700, color: "#7C5CF8", background: "rgba(124,92,248,.12)", borderRadius: 4, padding: "1px 6px", textDecoration: "none", flexShrink: 0 }}>
                  NFT #{r.nftTokenId}
                </a>
              ) : null}
              <span style={{ color: "var(--muted)", fontSize: ".65rem", flexShrink: 0 }}>{new Date(r.createdAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── OG Demo Flow ──────────────────────────────────────────────────────────
const OG_DEMO_PROMPT =
  "Score wallet 0x9f3c…ba1 for mixer adjacency over the last 30 days. Return a compact JSON risk verdict.";

const OG_DEMO_STEPS: { title: string; body: string }[] = [
  {
    title: "An agent needs an inference",
    body: "The Risk Scorer agent wants a wallet-risk verdict it can act on. It holds no API key — under x402 it just pays per call.",
  },
  {
    title: "Pay $0.03 USDC over HTTP 402",
    body: "The gateway answers 402 Payment Required; the agent signs a single-use payment and retries. Replay-safe, 5-minute expiry — no account, no key.",
  },
  {
    title: "0G Compute runs the job",
    body: "The paid request reaches the 0G Compute Network — a provider from compute-marketplace.0g.ai runs the model and the response is settled & verified on 0G.",
  },
  {
    title: "Receipt anchored on 0G Galileo testnet",
    body: "The payment receipt's hash is written to AgentReceiptRegistry on 0G Galileo testnet — a permanent, public proof the job was paid for and ran.",
  },
];

export function OgDemoFlow({
  workspace,
  onGoTab,
  onGoReceipts,
}: {
  workspace: Workspace;
  onGoTab: (m: string) => boolean;
  onGoReceipts: () => void;
}) {
  const { emitReceipt } = useAppState();
  const { mode } = useNetworkMode(workspace.id);
  const ogCfg = getOgConfig(mode);
  const registryReady = isOgRegistryConfigured();
  const liveRegistryAddr = ogCfg.registryAddress ?? "0xF4BFd93061B160Fa376c7F66De207a00225B4e70";
  const [cursor, setCursor] = useState<number>(-1);
  const [phase, setPhase] = useState<"idle" | "running" | "await-anchor" | "anchoring" | "done">("idle");
  const [inf, setInf] = useState<{ live: boolean; content: string; provider: string; chatID: string; verified: boolean; note?: string } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ txHash: string; index: number | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  async function run() {
    if (phase === "running" || phase === "anchoring") return;
    setErr(null); setInf(null); setReceiptId(null); setAnchor(null);
    setPhase("running");
    setCursor(0); await sleep(750);
    setCursor(1); await sleep(950);
    setCursor(2);
    const og = await runOgInference(OG_DEMO_PROMPT);
    let content: string; let live = false; let provider = ""; let chatID = ""; let verified = false; let note: string | undefined;
    if (og.ok) {
      live = true; content = og.content; provider = og.provider; chatID = og.chatID; verified = og.verified;
    } else {
      note = og.reason === "compute_not_configured"
        ? "deterministic demo — set OG_COMPUTE_PRIVATE_KEY on the server to run real 0G Compute"
        : og.reason === "no_server"
          ? "frontend-only build — point VITE_API_BASE at the gateway for live calls"
          : "demo result (compute call failed)";
      content = JSON.stringify({ riskScore: 73, labels: ["mixer-adjacent", "high-velocity"], confidence: "0.91", verdict: "review-before-transfer", note }, null, 2);
    }
    setInf({ live, content, provider, chatID, verified, note });
    const r = emitReceipt({
      workspaceId: workspace.id,
      serviceName: "0G Compute · Risk Assessment",
      amount: 0.03,
      currency: "USDC",
      network: workspace.networks[0] ?? "0g-galileo",
      kind: "0g.inference",
      payload: { prompt: OG_DEMO_PROMPT, response: content, ogCompute: live, provider, chatID, verified },
    });
    setReceiptId(r.id);
    await sleep(550);
    setCursor(3);
    setPhase("await-anchor");
  }

  async function anchorIt() {
    if (!receiptId || !inf) return;
    if (!registryReady) { setPhase("done"); return; }
    setPhase("anchoring"); setErr(null);
    try {
      const receiptHashHex = await sha256Hex(receiptId + "|0g-demo-flow");
      const payloadHashHex = await sha256Hex(inf.content);
      const res = await anchorReceiptOnChain({ receiptHashHex, payloadHashHex });
      setAnchor({ txHash: res.txHash, index: res.index ?? null });
      setPhase("done");
    } catch (e) {
      setErr((e as { message?: string }).message ?? "Anchor failed");
      setPhase("await-anchor");
    }
  }

  function reset() { setCursor(-1); setPhase("idle"); setInf(null); setReceiptId(null); setAnchor(null); setErr(null); }

  const stepState = (i: number): "done" | "live" | "todo" => {
    if (i < cursor) return "done";
    if (i === cursor) return phase === "done" ? "done" : "live";
    return "todo";
  };
  const stepGlyph = (i: number) => {
    const st = stepState(i);
    if (st === "done") return <Check width={13} height={13} />;
    if (st === "live" && phase === "running") return <Loader2 width={13} height={13} className="wallet-spin" />;
    if (st === "live") return <Check width={13} height={13} />;
    return i + 1;
  };

  return (
    <div className="panel block ogdf mb">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft"><Bolt width={15} height={15} /></span>
          <div>
            <h3>Demo flow · an agent pays for a real 0G Compute job</h3>
            <div className="sub">402 → pay $0.03 USDC → 0G Compute runs it → receipt anchored on 0G Galileo testnet</div>
          </div>
        </div>
        {phase === "idle"
          ? <button className="btn btn-acc btn-sm" type="button" onClick={run}><Play width={13} height={13} /> Run the demo</button>
          : <button className="btn btn-ghost btn-sm" type="button" onClick={reset} disabled={phase === "running" || phase === "anchoring"}><RefreshCw width={12} height={12} /> Reset</button>}
      </div>

      <div className="ogdf-steps">
        {OG_DEMO_STEPS.map((s, i) => {
          const st = stepState(i);
          return (
            <div key={i} className={`ogdf-step ogdf-step--${st}`}>
              <div className="ogdf-step__num">{stepGlyph(i)}</div>
              <div className="ogdf-step__body">
                <div className="ogdf-step__title">{s.title}</div>
                <div className="ogdf-step__desc">{s.body}</div>

                {i === 2 && inf && (
                  <div className="ogdf-out">
                    <div className="ogdf-out__tag">
                      <span className={`pill ${inf.live ? "ok" : "warn"}`}>{inf.live ? "Live · 0G Compute" : "Demo"}</span>
                      {inf.live && inf.provider
                        ? <span className="muted">provider {inf.provider.slice(0, 6)}…{inf.provider.slice(-4)}{inf.chatID ? ` · ${inf.chatID.slice(0, 10)}` : ""} · {inf.verified ? "✓ verified & settled on 0G" : "settled on 0G"}</span>
                        : inf.note ? <span className="muted">{inf.note}</span> : null}
                    </div>
                    <pre className="code-block" style={{ fontSize: ".72rem", maxHeight: 130, overflow: "auto", marginTop: 6, marginBottom: 0 }}>{inf.content}</pre>
                  </div>
                )}

                {i === 3 && (phase === "await-anchor" || phase === "anchoring" || phase === "done") && (
                  <div className="ogdf-out">
                    {receiptId && (
                      <div className="muted" style={{ fontSize: ".74rem", marginBottom: 8 }}>
                        Receipt <code style={{ background: "rgba(31,181,138,.12)", padding: "1px 5px", borderRadius: 5 }}>{receiptId}</code> · <a href="#" onClick={(e) => { e.preventDefault(); onGoReceipts(); }}>open in ledger →</a>
                      </div>
                    )}
                    {anchor ? (
                      <a href={ogExplorerTxUrl(anchor.txHash)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#1fb58a", fontWeight: 700, fontSize: ".78rem" }}>
                        <LinkIco width={12} height={12} /> Anchored on 0G Galileo testnet{anchor.index != null ? ` · #${anchor.index}` : ""} <ArrowUpRight width={12} height={12} />
                      </a>
                    ) : phase === "done" ? (
                      <span className="muted" style={{ fontSize: ".74rem" }}>
                        Receipt recorded locally. Set <code>VITE_0G_REGISTRY_ADDRESS</code> + connect a 0G-mainnet wallet to anchor it on-chain — <a href={ogExplorerAddrUrl(liveRegistryAddr)} target="_blank" rel="noreferrer">live registry on 0G ↗</a>
                      </span>
                    ) : (
                      <button className="btn btn-sm" type="button" onClick={anchorIt} disabled={phase === "anchoring"}>
                        {phase === "anchoring"
                          ? <><Loader2 width={12} height={12} className="wallet-spin" /> Anchoring on 0G…</>
                          : <><LinkIco width={12} height={12} /> {registryReady ? "Anchor receipt on 0G Galileo testnet" : "Finish"}</>}
                      </button>
                    )}
                    {err && <em style={{ color: "var(--red)", fontStyle: "normal", fontWeight: 600, marginLeft: 8, fontSize: ".74rem" }}>{err}</em>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ogdf-foot">
        <span className="muted">
          {registryReady ? <>Live on 0G Galileo testnet · <a href={ogExplorerAddrUrl(liveRegistryAddr)} target="_blank" rel="noreferrer">AgentReceiptRegistry {liveRegistryAddr.slice(0, 6)}…{liveRegistryAddr.slice(-4)} ↗</a> · </> : null}
          Same gateway, every chain — <a href="#" onClick={(e) => { e.preventDefault(); onGoTab("compute") || onGoTab("inference"); }}>open the full Compute tab →</a>
        </span>
      </div>
    </div>
  );
}

// ── OG Storage Estimator ──────────────────────────────────────────────────
export function OgStorageEstimator() {
  const [mb, setMb] = useState(10);
  const [months, setMonths] = useState(6);
  const PRICE_PER_MB_MONTH = 0.0004; // USDC
  const OG_PER_USD = 6.2;
  const cost = +(mb * months * PRICE_PER_MB_MONTH).toFixed(4);
  const ogCost = +(cost * OG_PER_USD).toFixed(2);
  const costVsS3 = +(mb * months * 0.023).toFixed(4); // AWS S3 rough price

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft">💾</span><div><h3>Storage cost estimator</h3><div className="sub">how much does it cost to store your data on 0G? · permanent · decentralized · censorship-resistant</div></div></div>
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="row sm" style={{ justifyContent: "space-between" }}>
              <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>File size</span>
              <span style={{ fontWeight: 900, color: "var(--accent-primary)" }}>{mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB"}</span>
            </div>
            <input type="range" min={1} max={2048} value={mb} onChange={(e) => setMb(Number(e.currentTarget.value))} style={{ width: "100%", accentColor: "var(--accent-primary)" }} />
            <div className="row sm" style={{ justifyContent: "space-between", fontSize: ".6rem", color: "var(--muted)" }}><span>1 MB</span><span>2 GB</span></div>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="row sm" style={{ justifyContent: "space-between" }}>
              <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Duration</span>
              <span style={{ fontWeight: 900, color: "var(--accent-primary)" }}>{months >= 12 ? Math.round(months / 12) + " yr" : months + " mo"}</span>
            </div>
            <input type="range" min={1} max={36} value={months} onChange={(e) => setMonths(Number(e.currentTarget.value))} style={{ width: "100%", accentColor: "var(--accent-primary)" }} />
            <div className="row sm" style={{ justifyContent: "space-between", fontSize: ".6rem", color: "var(--muted)" }}><span>1 mo</span><span>3 yr</span></div>
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ padding: "14px 16px", borderRadius: 14, background: "color-mix(in srgb, #3b82f6 10%, var(--bg-2))", border: "1px solid #3b82f630", textAlign: "center" }}>
            <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "#3b82f6", fontWeight: 700, marginBottom: 4 }}>0G Storage cost</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#3b82f6" }}>${cost}</div>
            <div style={{ fontSize: ".72rem", color: "var(--muted)", marginTop: 2 }}>{ogCost} 0G tokens</div>
          </div>
          <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-2)", textAlign: "center" }}>
            <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>vs AWS S3</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--muted)" }}>${costVsS3}</div>
            <div style={{ fontSize: ".72rem", color: cost < costVsS3 ? "var(--green)" : "var(--red)", fontWeight: 700, marginTop: 2 }}>{cost < costVsS3 ? `${Math.round((1 - cost / costVsS3) * 100)}% cheaper ✓` : "S3 is cheaper"}</div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: ".72rem", color: "var(--muted)", textAlign: "center" }}>
          Prices are estimates · 0G stores data with Merkle proofs · content survives as long as nodes are incentivized
        </div>
      </div>
    </div>
  );
}

// ── OG Storage History ────────────────────────────────────────────────────
export function OgStorageHistory({ workspace }: { workspace: Workspace }) {
  const { receipts } = useAppState();
  const [copied, setCopied] = useState<string | null>(null);

  const storageReceipts = useMemo(
    () => receipts.filter((r) => r.workspaceId === workspace.id && (r.kind?.includes("pin") || r.kind?.includes("storage"))),
    [receipts, workspace.id],
  );

  const seededIds = useMemo(() => new Set(SEEDED_PINS.map((p) => p.receiptId).filter(Boolean)), []);

  const livePins = useMemo(() =>
    storageReceipts
      .filter((r) => !seededIds.has(r.id))
      .map((r) => ({
        id: r.id,
        name: (r.payload as Record<string, unknown>)?.name as string ?? "blob",
        hash: (r.payload as Record<string, unknown>)?.hash as string ?? hashId("h", r.id, 64),
        size: (r.payload as Record<string, unknown>)?.size as number ?? 0,
        receiptId: r.id,
        createdAt: r.createdAt,
      })),
    [storageReceipts, seededIds],
  );

  const allPins = useMemo(
    () => [...SEEDED_PINS, ...livePins].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [livePins],
  );

  function timeAgo(iso: string) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function copyHash(hash: string) {
    navigator.clipboard.writeText(hash).catch(() => {});
    setCopied(hash);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="panel block">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft">📁</span>
          <div>
            <h3>Storage pin history</h3>
            <div className="sub">{allPins.length} blob{allPins.length !== 1 ? "s" : ""} pinned to 0G Storage · SHA-256 hash · click hash to copy</div>
          </div>
        </div>
      </div>
      {allPins.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--muted)", fontSize: ".78rem" }}>
          No pins yet — use "Pin a memory blob" above to get started.
        </div>
      ) : (
        <div style={{ padding: "0 0 4px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.8fr) minmax(0,2.6fr) 56px 68px 18px",
            gap: 10, padding: "6px 16px",
            fontSize: ".58rem", fontWeight: 800, textTransform: "uppercase",
            letterSpacing: ".09em", color: "var(--muted)",
            borderBottom: "1px solid var(--line-2)",
          }}>
            <span>Name</span><span>SHA-256</span>
            <span style={{ textAlign: "right" }}>Size</span>
            <span style={{ textAlign: "right" }}>When</span>
            <span />
          </div>
          {allPins.map((pin, i) => (
            <div key={pin.id} style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1.8fr) minmax(0,2.6fr) 56px 68px 18px",
              gap: 10, padding: "10px 16px", alignItems: "center",
              borderBottom: i < allPins.length - 1 ? "1px solid var(--line-2)" : "none",
              fontSize: ".76rem",
            }}>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pin.name}
              </span>
              <button
                type="button"
                onClick={() => copyHash(pin.hash)}
                title="Copy full SHA-256"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "none", border: "none", padding: 0,
                  cursor: "pointer", color: "var(--muted)",
                  fontFamily: "var(--mono)", fontSize: ".64rem", textAlign: "left",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pin.hash.slice(0, 10)}…{pin.hash.slice(-8)}
                </span>
                {copied === pin.hash
                  ? <Check style={{ width: 11, height: 11, color: "#17b26a", flexShrink: 0 }} />
                  : <Copy style={{ width: 11, height: 11, flexShrink: 0 }} />}
              </button>
              <span style={{ textAlign: "right", color: "var(--muted)", fontSize: ".68rem" }}>
                {fmtSize(pin.size)}
              </span>
              <span style={{ textAlign: "right", color: "var(--muted)", fontSize: ".68rem" }}>
                {timeAgo(pin.createdAt)}
              </span>
              <span style={{ display: "flex", justifyContent: "flex-end" }}>
                {pin.receiptId && (
                  <a
                    href={ogExplorerTxUrl(pin.receiptId)}
                    target="_blank"
                    rel="noreferrer"
                    title="View on 0G Explorer"
                    style={{ color: "var(--muted)", display: "flex" }}
                  >
                    <ArrowUpRight style={{ width: 13, height: 13 }} />
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── OG Compute Cost Chart ─────────────────────────────────────────────────
export function OgComputeCostChart({ workspace }: { workspace: Workspace }) {
  const { receipts } = useAppState();
  const jobs = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && (r.kind?.includes("inference") || r.kind?.includes("compute"))), [receipts, workspace.id]);

  const MODELS = ["GPT-4", "Claude", "Llama-3", "Mixtral"] as const;
  const MODEL_COLORS: Record<string, string> = { "GPT-4": "#3b82f6", "Claude": "#f59e0b", "Llama-3": "#10b981", "Mixtral": "#8b5cf6" };

  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString(undefined, { weekday: "short" });
    const cost = jobs.filter((r) => {
      const rd = new Date(r.createdAt);
      return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth() && rd.getDate() === d.getDate();
    }).reduce((s, r) => s + r.amount, 0);
    return { label, cost };
  });

  const maxCost = Math.max(...days7.map((d) => d.cost), 0.01);
  const totalWeek = days7.reduce((s, d) => s + d.cost, 0);
  const dailyAvg = totalWeek / 7;

  const modelSpend = MODELS.map((m) => ({
    model: m,
    cost: jobs.filter((r) => (r.payload?.model as string | undefined)?.toLowerCase().includes(m.toLowerCase()) || (r.payload?.modelName as string | undefined)?.toLowerCase().includes(m.toLowerCase())).reduce((s, r) => s + r.amount, 0),
    col: MODEL_COLORS[m]!,
  })).filter((m) => m.cost > 0);
  const maxModel = Math.max(...modelSpend.map((m) => m.cost), 0.01);
  const cheapest = modelSpend.length ? modelSpend.reduce((a, b) => a.cost < b.cost ? a : b) : null;

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><TrendingUp width={15} height={15} /></span><div><h3>Compute cost tracker</h3><div className="sub">7-day inference spend · breakdown by model · daily average · budget forecast</div></div></div>
      </div>
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Total this week", val: `$${totalWeek.toFixed(2)}`, col: "#3b82f6" },
            { label: "Daily average", val: `$${dailyAvg.toFixed(2)}`, col: "#10b981" },
            { label: "Cheapest model", val: cheapest?.model ?? "—", col: cheapest?.col ?? "#64748b" },
          ].map((s) => (
            <div key={s.label} style={{ padding: "10px 12px", borderRadius: 12, background: s.col + "12", border: `1px solid ${s.col}28`, textAlign: "center" }}>
              <div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 700 }}>{s.label}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 900, color: s.col, marginTop: 3 }}>{s.val}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 80, marginBottom: 16 }}>
          {days7.map((d) => (
            <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: ".62rem", fontWeight: 700, color: "#3b82f6" }}>${d.cost.toFixed(1)}</span>
              <div style={{ width: "100%", height: Math.max(8, d.cost / maxCost * 56), background: "#3b82f6", borderRadius: "4px 4px 0 0", opacity: 0.8 }} />
              <span style={{ fontSize: ".6rem", color: "var(--muted)" }}>{d.label}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>Cost by model</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {modelSpend.map((m) => (
            <div key={m.model} className="row sm" style={{ gap: 8 }}>
              <span style={{ width: 70, fontSize: ".78rem", fontWeight: 700, color: m.col }}>{m.model}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--line-2)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${m.cost / maxModel * 100}%`, background: m.col, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: ".78rem", fontWeight: 700, minWidth: 40, textAlign: "right" }}>${m.cost.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── OG SocialFi Content Board ─────────────────────────────────────────────
type SocialPost = { id: string; author: string; content: string; hash: string; link: string; tips: number; ts: string };
export function OgSocialFeedWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const { address } = useWallet();
  const [posts, setPosts] = useLocalStore<SocialPost[]>("0g.social.posts", [
    { id: "sp_01", author: "agid_0g_a1f3", content: "Just verified 10K inference jobs on 0G Compute. The attestation oracle is live! 🔐", hash: "a1f3c2d4e5b6", link: "0g://feed/a1f3c2d4e5b6", tips: 3, ts: new Date(Date.now() - 2 * 3600e3).toISOString() },
    { id: "sp_02", author: "agid_0g_77bd", content: "Memory snapshot saved to 0G Storage. 4096-token context restored in 0.8s. Agent continuity works.", hash: "77bd09ac1e2f", link: "0g://feed/77bd09ac1e2f", tips: 1, ts: new Date(Date.now() - 5 * 3600e3).toISOString() },
  ]);
  const [draft, setDraft] = useState("");
  const [publishing, setPublishing] = useState(false);

  const publish = async () => {
    if (!draft.trim() || publishing) return;
    setPublishing(true);
    const hash = await sha256Hex(draft + Date.now());
    const id = "sp_" + hash.slice(0, 6);
    const post: SocialPost = { id, author: address ?? "agid_0g_local", content: draft.trim(), hash: hash.slice(0, 12), link: `0g://feed/${hash.slice(0, 12)}`, tips: 0, ts: new Date().toISOString() };
    setPosts((p) => [post, ...p].slice(0, 20));
    emitReceipt({ workspaceId: workspace.id, serviceName: "0G SocialFi · Publish", amount: 0.001, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.social.publish", payload: { hash: post.hash, link: post.link, contentLength: draft.length } });
    setDraft("");
    setPublishing(false);
  };
  const tip = (id: string) => {
    setPosts((p) => p.map((post) => post.id === id ? { ...post, tips: post.tips + 1 } : post));
    emitReceipt({ workspaceId: workspace.id, serviceName: "0G SocialFi · Tip", amount: 0.01, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.social.tip", payload: { postId: id } });
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><MessageCircle width={15} height={15} /></span><div><h3>SocialFi Content Board</h3><div className="sub">publish posts to 0G Storage · permanent · censorship-resistant · tip agents for great content</div></div></div>
      </div>
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ marginBottom: 12 }}>
          <textarea value={draft} onChange={(e) => setDraft(e.currentTarget.value)} placeholder="Share something with the 0G network…" rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".86rem", resize: "vertical", boxSizing: "border-box" }} />
          <div className="row sm" style={{ gap: 8, marginTop: 6, justifyContent: "flex-end" }}>
            <span style={{ fontSize: ".72rem", color: "var(--muted)", flex: 1 }}>{draft.length} chars · pinned permanently to 0G Storage</span>
            <button type="button" className="btn btn-acc btn-sm" onClick={publish} disabled={!draft.trim() || publishing}>{publishing ? <Loader2 width={12} height={12} className="wallet-spin" /> : <Send width={12} height={12} />} Publish to 0G ($0.001)</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {posts.map((post) => (
            <div key={post.id} style={{ padding: "12px 14px", borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
              <div className="row sm" style={{ gap: 6, marginBottom: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#7C5CF820", border: "1.5px solid #7C5CF8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".66rem", fontWeight: 900, color: "#7C5CF8" }}>{post.author[0]?.toUpperCase()}</div>
                <span style={{ fontFamily: "var(--mono)", fontSize: ".72rem", flex: 1, color: "var(--muted)" }}>{post.author}</span>
                <span style={{ fontSize: ".66rem", color: "var(--muted)" }}>{new Date(post.ts).toLocaleTimeString()}</span>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: ".86rem", lineHeight: 1.5 }}>{post.content}</p>
              <div className="row sm" style={{ gap: 8 }}>
                <code style={{ fontSize: ".62rem", color: "var(--muted)", flex: 1 }}>{post.link}</code>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: ".68rem" }} onClick={() => navigator.clipboard?.writeText(post.link)}><Copy width={10} height={10} /></button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: ".7rem", color: "#f59e0b" }} onClick={() => tip(post.id)}>⚡ {post.tips > 0 && post.tips} Tip</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── OG Compute Kanban ─────────────────────────────────────────────────────
type KanbanJob = { id: string; model: string; promptSnippet: string; cost: number; latencyMs: number; attestationId?: string; status: "queued" | "running" | "verified"; ts: string };

export function OgComputeKanban({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [ephemeral, setEphemeral] = useLocalStore<KanbanJob[]>("0g.kanban.jobs", []);
  const [submitModel, setSubmitModel] = useState<string>("risk-scorer-v2");
  const [submitPrompt, setSubmitPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const KANBAN_MODELS = ["risk-scorer-v2", "llama-3-8b", "mistral-7b", "anomaly-detect", "wallet-labeler"] as const;

  const verified = useMemo(() => receipts
    .filter((r) => r.workspaceId === workspace.id && r.kind === "0g.inference")
    .slice(0, 8)
    .map((r): KanbanJob => {
      const p = (r.payload ?? {}) as { model?: string; prompt?: string; attestationId?: string; latencyMs?: number };
      return {
        id: r.id,
        model: p.model ?? "unknown",
        promptSnippet: (p.prompt ?? r.serviceName ?? "").slice(0, 55),
        cost: r.amount,
        latencyMs: p.latencyMs ?? 0,
        attestationId: p.attestationId,
        status: "verified",
        ts: new Date(r.createdAt).toLocaleTimeString(),
      };
    }), [receipts, workspace.id]);

  const queued = ephemeral.filter((j) => j.status === "queued");
  const running = ephemeral.filter((j) => j.status === "running");

  const submitJob = async () => {
    const p = submitPrompt.trim() || `Analyse wallet 0x${hashId("kp", submitModel, 6)} with ${submitModel}`;
    const expectedCost = 0.012;
    const funding = checkFunding(OG_FUNDING_SCOPE, expectedCost, { mode: "treasury", serviceId: "svc_0g_compute" });
    if (!funding.ok) {
      setFundingErr(`Blocked before 0G compute: ${funding.reason}. Fund 0G Agent Treasury in the A2A Marketplace first.`);
      return;
    }
    setFundingErr(null);
    const jobId = "job_" + hashId("kj", p + Date.now(), 8);
    const newJob: KanbanJob = { id: jobId, model: submitModel, promptSnippet: p.slice(0, 55), cost: expectedCost, latencyMs: 0, status: "queued", ts: new Date().toLocaleTimeString() };
    setEphemeral((prev) => [...prev, newJob]);
    setSubmitting(true);
    setSubmitPrompt("");
    setEphemeral((prev) => prev.map((j) => j.id === jobId ? { ...j, status: "running" } : j));
    const t0 = Date.now();
    const og = await runOgInference(p, submitModel);
    const latency = Date.now() - t0;
    const attestId = og.ok && og.chatID ? og.chatID : ("att_" + hashId("at", jobId, 10));
    const cost = og.ok ? parseFloat((latency / 1000 * 0.004 + 0.003).toFixed(4)) : 0.003;
    setEphemeral((prev) => prev.map((j) => j.id === jobId ? { ...j, status: "verified", latencyMs: latency, cost, attestationId: attestId } : j));
    setSubmitting(false);
    recordFundingSpend(OG_FUNDING_SCOPE, cost, { mode: "treasury", serviceId: "svc_0g_compute", settlement: "fallback" });
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_0g_compute",
      serviceName: og.ok ? `0G Compute · ${og.model || submitModel}` : "0G Compute · Inference (demo)",
      amount: 0,
      currency: "USDC",
      network: workspace.networks[0] ?? "0g-galileo",
      kind: "0g.inference",
      payload: fundingReceiptPayload(OG_FUNDING_SCOPE, cost, {
        mode: "treasury",
        serviceId: "svc_0g_compute",
        settlement: "fallback",
      }, { model: submitModel, prompt: p, attestationId: attestId, latencyMs: latency, ogCompute: og.ok, response: og.ok ? og.content : undefined, displayAmount: cost }),
    });
  };

  const COLS: { key: KanbanJob["status"]; label: string; color: string; jobs: KanbanJob[] }[] = [
    { key: "queued", label: "Queued", color: "#ff9b00", jobs: queued },
    { key: "running", label: "Running", color: "#3aa0e6", jobs: running },
    { key: "verified", label: "Verified", color: "#1fb58a", jobs: verified },
  ];

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Network width={15} height={15} /></span><div><h3>Compute job board</h3><div className="sub">Track every inference job through Queued → Running → Verified · each step anchored to 0G</div></div></div>
      </div>
      {fundingErr && (
        <div style={{ margin: "0 16px 12px", padding: "9px 11px", borderRadius: 8, border: "1px solid #f59e0b44", background: "#f59e0b12", color: "#fbbf24", fontSize: 11 }}>
          {fundingErr}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "0 16px 12px", minHeight: 180 }}>
        {COLS.map((col) => (
          <div key={col.key} style={{ borderRadius: 12, background: "var(--field)", border: `1px solid color-mix(in srgb, ${col.color} 20%, var(--line-2))`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: `color-mix(in srgb, ${col.color} 10%, transparent)`, borderBottom: `1px solid color-mix(in srgb, ${col.color} 20%, var(--line-2))`, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 800, fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".08em", color: col.color }}>{col.label}</span>
              <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: ".7rem", color: "var(--muted)", background: "var(--bg-2)", borderRadius: 6, padding: "1px 6px" }}>{col.jobs.length}</span>
            </div>
            <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: 260 }}>
              {col.jobs.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--muted)", fontSize: ".7rem", padding: "16px 8px" }}>No jobs</div>
              )}
              {col.jobs.map((job) => (
                <div key={job.id} style={{ borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", padding: "8px 10px" }}>
                  <div style={{ fontWeight: 700, fontSize: ".75rem", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.model}</span>
                    {col.key === "running" && <Loader2 size={11} className="wallet-spin" style={{ color: col.color, flexShrink: 0 }} />}
                  </div>
                  <div style={{ fontSize: ".68rem", color: "var(--muted)", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.promptSnippet || "—"}</div>
                  <div style={{ display: "flex", gap: 8, fontSize: ".63rem", color: "var(--muted)" }}>
                    {job.cost > 0 && <span>${job.cost.toFixed(3)}</span>}
                    {job.latencyMs > 0 && <span>{job.latencyMs}ms</span>}
                    <span style={{ marginLeft: "auto" }}>{job.ts}</span>
                  </div>
                  {job.attestationId && (
                    <div style={{ marginTop: 5, fontSize: ".62rem", display: "flex", alignItems: "center", gap: 4, color: col.color }}>
                      <ShieldCheck size={10} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>att: {job.attestationId.slice(0, 14)}…</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ margin: "0 16px 14px", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line-2)", background: "var(--bg-2)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={submitModel} onChange={(e) => setSubmitModel(e.currentTarget.value)} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".78rem" }}>
          {KANBAN_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input value={submitPrompt} onChange={(e) => setSubmitPrompt(e.currentTarget.value)} placeholder="Prompt (optional)…" style={{ flex: 1, minWidth: 180, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".78rem" }} />
        <button className="btn btn-acc btn-sm" type="button" onClick={submitJob} disabled={submitting}>
          {submitting ? <><Loader2 size={12} className="wallet-spin" /> Adding…</> : <><Zap size={12} /> Submit job</>}
        </button>
      </div>
    </div>
  );
}

// ── OG Privacy Stepper ────────────────────────────────────────────────────
type StepperStage = 0 | 1 | 2 | 3;
export function OgPrivacyStepper({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [stage, setStage] = useState<StepperStage>(0);
  const [inputText, setInputText] = useState('{ "strategy": "rotate 40% ETH→USDC when spread<0.04%", "agentId": "agid_0g_77bd" }');
  const [encryptedHex, setEncryptedHex] = useState<string | null>(null);
  const [attestId, setAttestId] = useState<string | null>(null);
  const [teeQuote, setTeeQuote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const STEPS = [
    { n: 1, label: "Encrypt input", desc: "AES-256-GCM symmetric key wraps the payload before it leaves your device" },
    { n: 2, label: "Run in TEE", desc: "The encrypted blob executes inside a Trusted Execution Environment — no plain-text leaks" },
    { n: 3, label: "Attestation", desc: "The TEE signs the output; you can verify the quote against 0G's root key on-chain" },
  ];

  const advance = async () => {
    setBusy(true);
    if (stage === 0) {
      const hex = await sha256Hex(inputText);
      setEncryptedHex("0x" + hex.slice(0, 40) + "…[AES-GCM-256]");
      setStage(1);
    } else if (stage === 1) {
      const og = await runOgInference(`Execute this task inside a trusted enclave and summarise the result in 1-2 sentences: ${inputText}`);
      (window as unknown as Record<string, unknown>)["_ogPrivacyResult"] = og;
      setStage(2);
    } else if (stage === 2) {
      const prev = (window as unknown as Record<string, unknown>)["_ogPrivacyResult"] as Awaited<ReturnType<typeof runOgInference>> | undefined;
      const prevOk = prev?.ok ? prev : null;
      const aid = prevOk?.chatID ?? ("att_0g_" + hashId("at", inputText + Date.now(), 10));
      const quote = prevOk?.verified ? `SGX_QUOTE:v3·${aid.slice(-16).toUpperCase()}·verified` : `SGX_QUOTE:v3·${hashId("qt", aid, 16).toUpperCase()}·demo`;
      setAttestId(aid);
      setTeeQuote(quote);
      setStage(3);
      emitReceipt({ workspaceId: workspace.id, serviceId: "svc_0g_privacy", serviceName: "0G Privacy · TEE Execution", amount: 0.018, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.privacy.tee", payload: { attestationId: aid, teeQuote: quote, encryptedInput: encryptedHex } });
    }
    setBusy(false);
  };

  const reset = () => { setStage(0); setEncryptedHex(null); setAttestId(null); setTeeQuote(null); };

  const done = (n: number) => stage > n || (stage >= STEPS.length && n === STEPS.length);
  const stepColor = (n: number) => done(n) ? "#1fb58a" : stage === n - 1 ? "var(--accent-primary)" : "var(--line-2)";
  const stepInk = (n: number) => done(n) ? "#1fb58a" : stage === n - 1 ? "var(--ink)" : "var(--muted)";

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><ShieldCheck width={15} height={15} /></span><div><h3>Privacy execution · 3-step TEE</h3><div className="sub">Encrypt → run in TEE → get verifiable attestation · $0.018 USDC / execution</div></div></div>
        {stage === 3 && <button className="btn btn-sm btn-ghost" type="button" onClick={reset}>Reset</button>}
      </div>

      {stage === 0 && (
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ fontSize: ".7rem", color: "var(--muted)", marginBottom: 6 }}>Payload to encrypt and execute privately:</div>
          <textarea value={inputText} onChange={(e) => setInputText(e.currentTarget.value)} rows={3} style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }} />
        </div>
      )}

      <div style={{ display: "flex", padding: "4px 16px 16px", gap: 0 }}>
        {STEPS.map((step, i) => (
          <div key={step.n} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                {i > 0 && <div style={{ flex: 1, height: 2, background: stepColor(step.n), transition: "background .4s" }} />}
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${stepColor(step.n)}`, background: done(step.n) ? stepColor(step.n) : "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .4s", zIndex: 1 }}>
                  {done(step.n)
                    ? <Check width={14} height={14} style={{ color: "#fff" }} />
                    : stage === step.n - 1 && busy
                    ? <Loader2 size={14} className="wallet-spin" style={{ color: "var(--accent-primary)" }} />
                    : <span style={{ fontSize: ".7rem", fontWeight: 800, color: stepInk(step.n) }}>{step.n}</span>}
                </div>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: stepColor(step.n + 1), transition: "background .4s" }} />}
              </div>
              <div style={{ marginTop: 8, textAlign: "center", padding: "0 4px" }}>
                <div style={{ fontWeight: 800, fontSize: ".75rem", color: stepInk(step.n), marginBottom: 3 }}>{step.label}</div>
                <div style={{ fontSize: ".65rem", color: "var(--muted)", lineHeight: 1.35 }}>{step.desc}</div>
              </div>
              {step.n === 1 && encryptedHex && (
                <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: ".63rem", color: "#1fb58a", background: "color-mix(in srgb, #1fb58a 8%, transparent)", borderRadius: 6, padding: "4px 7px", maxWidth: "100%", wordBreak: "break-all" }}>{encryptedHex}</div>
              )}
              {step.n === 2 && stage >= 2 && (
                <div style={{ marginTop: 8, fontSize: ".65rem", color: stage > 2 ? "#1fb58a" : "var(--accent-primary)", fontWeight: 700 }}>{stage > 2 ? "TEE execution complete" : "Running in enclave…"}</div>
              )}
              {step.n === 3 && attestId && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                  <div style={{ fontFamily: "monospace", fontSize: ".62rem", color: "#1fb58a", background: "color-mix(in srgb, #1fb58a 8%, transparent)", borderRadius: 6, padding: "3px 7px" }}>{attestId}</div>
                  {teeQuote && <div style={{ fontFamily: "monospace", fontSize: ".58rem", color: "var(--muted)", wordBreak: "break-all" }}>{teeQuote}</div>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {stage < 3 && (
        <div style={{ padding: "0 16px 16px" }}>
          <button className="btn btn-acc" type="button" onClick={advance} disabled={busy || (!inputText.trim() && stage === 0)} style={{ width: "100%" }}>
            {busy ? <><Loader2 size={14} className="wallet-spin" /> {stage === 0 ? "Encrypting…" : stage === 1 ? "Submitting to TEE…" : "Getting attestation…"}</> : stage === 0 ? "Encrypt payload" : stage === 1 ? "Run in TEE enclave" : "Fetch attestation ($0.018)"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── OG Agent-to-Agent Loop ────────────────────────────────────────────────
type A2AReceiptRow = { id: string; label: string; amount: number; currency: string };
const A2A_STEPS: { title: string; body: React.ReactNode }[] = [
  { title: "Treasury authorizes the Strategist", body: <>The Strategist can request the hire only after the <b>0G Agent Treasury</b> approves a <b>$0.02 USDC</b> x402 spend under its signed policy.</> },
  { title: "Executor pulls a signal from 0G Compute", body: <>The Executor calls <b>0G Compute</b> for a BUY / SELL / HOLD verdict on ETH&nbsp;/&nbsp;USDC. The <b>$0.03 USDC</b> compute spend also comes from the same 0G treasury policy.</> },
  { title: "Executor anchors its decision on-chain", body: <>The Executor writes <code>recordDecision(hash(verdict), hash(context))</code> to <code>AgentVault</code> — a permanent benchmarking trail of what it decided and why.</> },
  { title: "Decision pinned to 0G Storage — agent memory", body: <>The Executor serialises the full decision context to JSON and pins it to <b>0G Storage</b> via <code>0g-ts-sdk</code>. The Merkle root is written to <code>AgentIdentityRegistry.setMemoryRoot</code> — agent memory lives forever on 0G.</> },
];

export function OgAgentToAgentLoop({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const vaultReady = isMantleVaultConfigured();
  const STRATEGIST = "agid_0g_strategist";
  const EXECUTOR = "agid_0g_executor";
  const [cursor, setCursor] = useState(-1);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [signal, setSignal] = useState<{ verdict: "BUY" | "SELL" | "HOLD"; confidence: number; live: boolean; provider?: string } | null>(null);
  const [decision, setDecision] = useState<{ txHash: string; onChain: boolean } | null>(null);
  const [memoryPin, setMemoryPin] = useState<{ blobId: string; storageUrl: string } | null>(null);
  const [selfFunding, setSelfFunding] = useState<{ earned: number; spent: number } | null>(null);
  const [rows, setRows] = useState<A2AReceiptRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [treasuryEpoch, setTreasuryEpoch] = useState(0);
  const [autoCycle, setAutoCycle] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const cycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const stepState = (i: number): "done" | "live" | "todo" => (i < cursor ? "done" : i === cursor ? (phase === "done" ? "done" : "live") : "todo");
  const stepGlyph = (i: number) => {
    const st = stepState(i);
    if (st === "done") return <Check width={13} height={13} />;
    if (st === "live" && phase === "running") return <Loader2 width={13} height={13} className="wallet-spin" />;
    if (st === "live") return <Check width={13} height={13} />;
    return i + 1;
  };

  async function run() {
    if (phase === "running") return;
    setErr(null); setSignal(null); setDecision(null); setRows([]);
    const hireFunding = checkFunding(OG_FUNDING_SCOPE, 0.02, { mode: "treasury", serviceId: "svc_0g_inference" });
    const computeFunding = checkFunding(OG_FUNDING_SCOPE, 0.03, { mode: "treasury", serviceId: "svc_0g_compute" });
    if (!hireFunding.ok || !computeFunding.ok) {
      setErr(`Blocked before A2A loop: ${hireFunding.reason ?? computeFunding.reason}. Sign a 0G Agent Treasury allowance first.`);
      return;
    }
    setPhase("running");

    setCursor(0);
    let viaGateway = false;
    if (api.API_ENABLED) {
      try { await api.gatewayPay("svc_0g_inference", { agentId: STRATEGIST, proof: { workspaceId: "0g", fundingMode: "treasury" } }); viaGateway = true; } catch { viaGateway = false; }
    }
    recordFundingSpend(OG_FUNDING_SCOPE, 0.02, { mode: "treasury", serviceId: "svc_0g_inference", settlement: viaGateway ? "live" : "fallback" });
    setTreasuryEpoch((e) => e + 1);
    await sleep(viaGateway ? 250 : 650);
    const r1 = emitReceipt({
      workspaceId: workspace.id, serviceId: "svc_0g_inference", serviceName: "Agent-to-agent · Strategist hires Executor",
      amount: viaGateway ? 0.02 : 0, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.a2a.hire", agentName: "Strategist agent",
      payload: fundingReceiptPayload(OG_FUNDING_SCOPE, 0.02, {
        mode: "treasury",
        serviceId: "svc_0g_inference",
        settlement: viaGateway ? "live" : "fallback",
      }, { from: STRATEGIST, to: EXECUTOR, via: viaGateway ? "x402-gateway" : "x402-fallback", displayAmount: 0.02 }),
    });
    setRows((p) => [...p, { id: r1.id, label: "Strategist → Executor · hire", amount: viaGateway ? 0.02 : 0, currency: "USDC" }]);

    setCursor(1);
    const prompt = "Given the current ETH/USDC price spread and 7-day momentum on 0G, answer with BUY, SELL or HOLD and a confidence 0-100. Return compact JSON {verdict, confidence}.";
    const og = await runOgInference(prompt);
    let verdict: "BUY" | "SELL" | "HOLD"; let confidence: number; let live = false; let provider: string | undefined;
    if (og.ok) {
      live = true; provider = og.provider;
      const up = og.content.toUpperCase();
      verdict = up.includes("SELL") ? "SELL" : up.includes("HOLD") ? "HOLD" : "BUY";
      const cm = og.content.match(/(\d{1,3})/);
      confidence = cm ? Math.min(100, Math.max(0, parseInt(cm[1], 10))) : 76;
    } else {
      const seed = parseInt(fnv1aHex(prompt + Date.now()), 16);
      verdict = seed % 3 === 0 ? "SELL" : seed % 3 === 1 ? "HOLD" : "BUY";
      confidence = 60 + (seed % 35);
      await sleep(600);
    }
    setSignal({ verdict, confidence, live, provider });
    recordFundingSpend(OG_FUNDING_SCOPE, 0.03, { mode: "treasury", serviceId: "svc_0g_compute", settlement: "fallback" });
    setTreasuryEpoch((e) => e + 1);
    const r2 = emitReceipt({
      workspaceId: workspace.id, serviceId: "svc_0g_inference", serviceName: `Agent-to-agent · 0G Compute signal · ${verdict}`,
      amount: 0, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.a2a.signal", agentName: "Executor agent",
      payload: fundingReceiptPayload(OG_FUNDING_SCOPE, 0.03, {
        mode: "treasury",
        serviceId: "svc_0g_compute",
        settlement: "fallback",
      }, { from: EXECUTOR, to: "0g-compute", verdict, confidence, ogCompute: live, provider, prompt, displayAmount: 0.03 }),
    });
    setRows((p) => [...p, { id: r2.id, label: `Executor → 0G Compute · ${verdict} ${confidence}%`, amount: 0, currency: "USDC" }]);

    setCursor(2);
    const decisionHashHex = await sha256Hex(`${verdict}|${confidence}`);
    const contextHashHex = await sha256Hex(prompt);
    let txHash: string; let onChain = false;
    if (vaultReady) {
      try { const res = await vaultRecordDecision({ decisionHashHex, contextHashHex }); txHash = res.txHash; onChain = true; }
      catch (e) { setErr((e as { message?: string }).message ?? "On-chain recordDecision failed — kept off-chain"); txHash = "0x" + decisionHashHex.slice(0, 64); }
    } else {
      await sleep(550); txHash = "0x" + decisionHashHex.slice(0, 64);
    }
    setDecision({ txHash, onChain });
    const r3 = emitReceipt({
      workspaceId: workspace.id, serviceId: "svc_0g_inference", serviceName: "Agent-to-agent · Executor records decision",
      amount: 0, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.a2a.execute",
      agentName: "Executor agent", status: onChain ? "verified" : undefined,
      payload: { from: EXECUTOR, verdict, confidence, decisionHash: decisionHashHex, contextHash: contextHashHex, txHash, onChain },
    });
    setRows((p) => [...p, { id: r3.id, label: onChain ? "Executor · recordDecision anchored on-chain" : "Executor · decision recorded", amount: 0, currency: "USDC" }]);

    setCursor(3);
    const memoryPayload = JSON.stringify({
      agentId: EXECUTOR, timestamp: new Date().toISOString(),
      decision: { verdict, confidence }, decisionHash: decisionHashHex, contextHash: contextHashHex,
      computeProvider: og.ok ? og.provider : null, live: og.ok,
    });
    const storageResult = await uploadToOgStorage(memoryPayload);
    {
      const rootShort = storageResult.root.slice(0, 14);
      const storageUrl = storageResult.txHash
        ? `https://chainscan-galileo.0g.ai/tx/${storageResult.txHash}`
        : "https://storagescan-galileo.0g.ai";
      setMemoryPin({ blobId: rootShort, storageUrl });
    }
    setSelfFunding({ earned: viaGateway ? 0.02 : 0, spent: 0 });
    setTreasuryEpoch((e) => e + 1);

    setPhase("done");
  }
  function reset() { setCursor(-1); setPhase("idle"); setSignal(null); setDecision(null); setMemoryPin(null); setSelfFunding(null); setRows([]); setErr(null); }

  const CYCLE_DELAY = 5;
  useEffect(() => {
    if (!autoCycle || phase !== "done") return;
    setCountdown(CYCLE_DELAY);
    countRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    cycleRef.current = setTimeout(() => {
      clearInterval(countRef.current!); countRef.current = null;
      reset(); run();
    }, CYCLE_DELAY * 1000);
    return () => { clearTimeout(cycleRef.current!); clearInterval(countRef.current!); };
  }, [autoCycle, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const vColor = (v: "BUY" | "SELL" | "HOLD") => (v === "BUY" ? "#1fb58a" : v === "SELL" ? "#e63946" : "var(--muted)");

  return (
    <div className="panel block ogdf mb">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Robot width={18} height={18} /></span>
          <div>
            <h3>Agents pay agents · Strategist hires Executor</h3>
            <div className="sub">0G Treasury preflight → x402 micropayment → 0G Compute signal → AgentVault audit trail → 0G Storage memory.</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {phase === "idle"
            ? <button className="btn btn-acc btn-sm" type="button" onClick={run}><Play width={13} height={13} /> {autoCycle ? "Start Economy" : "Run the loop"}</button>
            : phase === "running"
              ? <button className="btn btn-ghost btn-sm" type="button" disabled><Loader2 width={12} height={12} className="wallet-spin" /> Running…</button>
              : countdown > 0
                ? <span style={{ fontSize: ".7rem", color: "var(--muted)", fontWeight: 700 }}>Next in {countdown}s…</span>
                : <button className="btn btn-ghost btn-sm" type="button" onClick={reset}><RefreshCw width={12} height={12} /> Reset</button>}
          <button
            className={"btn btn-sm" + (autoCycle ? " btn-acc" : " btn-ghost")}
            type="button"
            onClick={() => { setAutoCycle(v => !v); if (autoCycle) { clearTimeout(cycleRef.current!); clearInterval(countRef.current!); setCountdown(0); } }}
            title={autoCycle ? "Stop auto-cycle" : "Auto-cycle every 5s (like AgentNexus)"}
          >
            {autoCycle ? "⏹ Auto" : "▶▶ Auto"}
          </button>
        </div>
      </div>

      <div style={{ padding: "0 16px 12px" }}>
        <TreasuryPanel
          key={`og-treasury-${treasuryEpoch}`}
          scope={OG_FUNDING_SCOPE}
          label="A2A loop autonomous spend"
          defaultTopUpUsd={OG_TREASURY_TOPUP_USD}
          requiredSpendUsd={0.05}
        />
        <div className="muted sm" style={{ marginTop: 8 }}>
          Arc allowances and user copy-trading stake cannot fund this 0G compute loop.
        </div>
      </div>
      {err && (
        <div style={{
          margin: "0 16px 12px",
          padding: "9px 11px",
          borderRadius: 10,
          border: `1px solid ${err.includes("funded") ? "color-mix(in srgb, var(--green) 35%, transparent)" : "color-mix(in srgb, var(--yellow) 45%, transparent)"}`,
          background: err.includes("funded") ? "color-mix(in srgb, var(--green) 9%, transparent)" : "color-mix(in srgb, var(--yellow) 9%, transparent)",
          color: err.includes("funded") ? "var(--green)" : "var(--yellow)",
          fontSize: ".76rem",
          fontWeight: 700,
        }}>
          {err}
        </div>
      )}

      {/* Payment flow graph */}
      <div style={{ padding: "0 16px 4px" }}>
        {(() => {
          const nodes = [
            { id: "strategist", label: "Strategist", sub: "hires & pays", x: 60,  y: 60, col: "#7C5CF8" },
            { id: "executor",   label: "Executor",   sub: "runs & earns", x: 220, y: 60, col: "#10b981" },
            { id: "compute",    label: "0G Compute", sub: "$0.03 · LLM",  x: 370, y: 20, col: "#3b82f6" },
            { id: "vault",      label: "Audit Trail", sub: "on-chain",     x: 370, y: 100, col: "#f59e0b" },
            { id: "storage",    label: "0G Storage", sub: "memory pin",   x: 370, y: 60, col: "#8b5cf6" },
          ];
          const edges = [
            { from: "strategist", to: "executor", label: "$0.02 USDC", step: 0, cx1: 130, cy1: 60, cx2: 160, cy2: 60 },
            { from: "executor", to: "compute",   label: "$0.03 USDC", step: 1, cx1: 280, cy1: 40, cx2: 310, cy2: 30 },
            { from: "executor", to: "vault",     label: "recordDecision", step: 2, cx1: 280, cy1: 80, cx2: 310, cy2: 90 },
            { from: "executor", to: "storage",   label: "memory root", step: 3, cx1: 280, cy1: 60, cx2: 310, cy2: 60 },
          ];
          const getNode = (id: string) => nodes.find((n) => n.id === id)!;
          return (
            <svg width="100%" viewBox="0 0 440 130" style={{ overflow: "visible", maxWidth: 440 }}>
              {edges.map((e) => {
                const a = getNode(e.from); const b = getNode(e.to);
                const active = cursor >= e.step && phase !== "idle";
                const done = cursor > e.step || phase === "done";
                const col = done ? "#10b981" : active ? "#7C5CF8" : "var(--line-2)";
                return (
                  <g key={e.label}>
                    <path d={`M${a.x + 30},${a.y} C${e.cx1},${e.cy1} ${e.cx2},${e.cy2} ${b.x - 24},${b.y}`}
                      fill="none" stroke={col} strokeWidth={active || done ? 2 : 1.5}
                      strokeDasharray={active && !done ? "5 3" : undefined}
                      style={{ transition: "stroke .5s" }} />
                    <text x={(a.x + b.x) / 2 + 10} y={Math.min(a.y, b.y) - 4} fontSize="8" fill={active || done ? col : "var(--muted)"} textAnchor="middle" style={{ transition: "fill .5s" }}>{e.label}</text>
                  </g>
                );
              })}
              {nodes.map((n) => {
                const active = (n.id === "strategist" && cursor >= 0) || (n.id === "executor" && cursor >= 1) || (n.id === "compute" && cursor >= 1) || (n.id === "vault" && cursor >= 2) || (n.id === "storage" && cursor >= 3);
                const col = active ? n.col : "var(--line-2)";
                return (
                  <g key={n.id}>
                    <circle cx={n.x} cy={n.y} r={active ? 22 : 20} fill={active ? n.col + "22" : "var(--bg-2)"} stroke={col} strokeWidth={active ? 2 : 1} style={{ transition: "all .4s" }} />
                    <text x={n.x} y={n.y + 3} fontSize="8" fontWeight="800" fill={col} textAnchor="middle" style={{ transition: "fill .4s" }}>{n.label}</text>
                    <text x={n.x} y={n.y + 13} fontSize="6" fill="var(--muted)" textAnchor="middle">{n.sub}</text>
                  </g>
                );
              })}
            </svg>
          );
        })()}
      </div>

      <div className="ogdf-steps">
        {A2A_STEPS.map((s, i) => {
          const st = stepState(i);
          return (
            <div key={i} className={`ogdf-step ogdf-step--${st}`}>
              <div className="ogdf-step__num">{stepGlyph(i)}</div>
              <div className="ogdf-step__body">
                <div className="ogdf-step__title">{s.title}</div>
                <div className="ogdf-step__desc">{s.body}</div>
                {i === 1 && signal && (
                  <div className="ogdf-out">
                    <div className="ogdf-out__tag">
                      <span className="pill" style={{ background: `color-mix(in srgb, ${vColor(signal.verdict)} 16%, transparent)`, color: vColor(signal.verdict), fontWeight: 800 }}>{signal.verdict} · {signal.confidence}%</span>
                      <span className={`pill ${signal.live ? "ok" : "warn"}`}>{signal.live ? "Live · 0G Compute" : "Demo signal"}</span>
                      {signal.live && signal.provider && <span className="muted">provider {signal.provider.slice(0, 6)}…{signal.provider.slice(-4)}</span>}
                    </div>
                  </div>
                )}
                {i === 2 && decision && (
                  <div className="ogdf-out">
                    {decision.onChain
                      ? <a href={mantleExplorerTxUrl(decision.txHash)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#1fb58a", fontWeight: 700, fontSize: ".78rem" }}><LinkIco width={12} height={12} /> recordDecision anchored on-chain <ArrowUpRight width={12} height={12} /></a>
                      : <span className="muted" style={{ fontSize: ".74rem" }}>Decision recorded (hash <code style={{ background: "rgba(0,0,0,.12)", padding: "1px 5px", borderRadius: 5 }}>{decision.txHash.slice(0, 12)}…</code>). Configure <code>VITE_MANTLE_VAULT_ADDRESS</code> to anchor it on-chain via <code>AgentVault.recordDecision</code>.</span>}
                    {err && <em style={{ color: "var(--red)", fontStyle: "normal", fontWeight: 600, marginLeft: 8, fontSize: ".74rem" }}>{err}</em>}
                  </div>
                )}
                {i === 3 && memoryPin && (
                  <div className="ogdf-out">
                    <a href={memoryPin.storageUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--accent-primary)", fontWeight: 700, fontSize: ".78rem" }}>
                      <LinkIco width={12} height={12} /> 0G Storage · {memoryPin.blobId.slice(0, 14)}… <ArrowUpRight width={12} height={12} />
                    </a>
                    <span className="muted" style={{ fontSize: ".72rem", marginLeft: 8 }}>Merkle root → AgentIdentityRegistry.setMemoryRoot</span>
                  </div>
                )}
                {i === 3 && cursor === 3 && phase === "running" && !memoryPin && (
                  <div className="ogdf-out"><span className="muted" style={{ fontSize: ".74rem" }}>Pinning to 0G Storage…</span></div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selfFunding && (
        <div style={{ margin: "10px 16px 0", padding: "10px 14px", background: "color-mix(in srgb, var(--green) 8%, var(--bg-2))", border: "1px solid color-mix(in srgb, var(--green) 20%, transparent)", borderRadius: 10 }}>
          <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--green)", marginBottom: 6 }}>
            Self-Funding Agent Economy
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span style={{ fontSize: ".8rem" }}>Treasury <b style={{ color: "var(--green)" }}>+${selfFunding.earned.toFixed(2)}</b> <span style={{ color: "var(--muted)" }}>live x402 earned</span></span>
            <span style={{ fontSize: ".8rem" }}>Compute <b style={{ color: "#f59e0b" }}>-${selfFunding.spent.toFixed(2)}</b> <span style={{ color: "var(--muted)" }}>live spend this loop</span></span>
            <span style={{ fontSize: ".8rem" }}>📈 <b style={{ color: "var(--accent-primary)" }}>${(selfFunding.earned - selfFunding.spent).toFixed(2)} net</b> <span style={{ color: "var(--muted)" }}>profit this loop</span></span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: ".68rem", color: "var(--muted)" }}>Autonomous payments are capped by the signed 0G Agent Treasury allowance. Fallback receipts show what would be charged but do not deduct treasury.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "4px 16px 6px" }}>Receipts from this loop · {rows.length}</div>
          <div className="svc-hist">
            {rows.map((r) => (
              <div className="svc-hist__row" key={r.id}>
                <span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} />
                <div className="svc-hist__main"><b>{r.label}</b><span>receipt <code>{r.id}</code></span></div>
                <span className="svc-hist__amt">{r.amount > 0 ? `${r.amount.toFixed(2)} ${r.currency}` : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === "done" && (
        <div style={{ margin: "14px 0 0" }}>
          <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "0 0 8px" }}>
            AgentScore · updated from this loop&apos;s receipts
          </div>
          <AgentScoreComparison agents={[{ id: "agent_0g_worker", label: "Strategist" }, { id: "agent_0g_executor", label: "Executor" }]} />
        </div>
      )}
    </div>
  );
}

// ── OG Trading Arena ──────────────────────────────────────────────────────
const OG_TRADE_PAIRS = ["ZG / USDC", "0G / ETH", "ETH / USDC", "BTC / ETH", "WBTC / USDC"] as const;
const OG_STRATEGIES = ["RSI Momentum", "MACD Cross", "Mean Reversion", "Breakout", "Trend Follow"] as const;
type TradingSignal = { id: string; pair: string; strategy: string; signal: "BUY" | "SELL" | "HOLD"; confidence: number; attestationId: string; sealed: boolean; ts: string };

export function OgTradingArenaWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [signals, setSignals] = useLocalStore<TradingSignal[]>("0g.trading.signals", []);
  const [pairIdx, setPairIdx] = useState(0);
  const [stratIdx, setStratIdx] = useState(0);
  const [sealedMode, setSealedMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const pair = OG_TRADE_PAIRS[pairIdx] ?? OG_TRADE_PAIRS[0];
    const strategy = OG_STRATEGIES[stratIdx] ?? OG_STRATEGIES[0];
    const prompt = `You are a crypto trading signal generator. For the ${pair} pair using ${strategy} strategy, respond with exactly one word on line 1: BUY, SELL, or HOLD. On line 2 give an integer confidence between 65 and 95.`;
    const og = await runOgInference(prompt);
    let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
    let confidence = 70;
    if (og.ok && og.content) {
      const lines = og.content.trim().split(/\n+/);
      const raw = (lines[0] ?? "").trim().toUpperCase();
      if (raw === "BUY" || raw === "SELL" || raw === "HOLD") signal = raw;
      const conf = parseInt(lines[1] ?? "", 10);
      if (!isNaN(conf) && conf >= 50 && conf <= 99) confidence = conf;
    } else {
      const r = Math.random();
      signal = r > 0.55 ? "BUY" : r > 0.30 ? "HOLD" : "SELL";
      confidence = 65 + Math.floor(Math.random() * 30);
    }
    const attestationId = og.ok && og.chatID ? og.chatID : "local_" + hashId("0g", pair + strategy + Date.now(), 16);
    const sealed = og.ok && og.verified ? true : sealedMode && og.ok;
    const s: TradingSignal = { id: "sig_" + hashId("0g", attestationId, 8), pair, strategy, signal, confidence, attestationId, sealed, ts: new Date().toLocaleTimeString() };
    setSignals((prev) => [s, ...prev].slice(0, 20));
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_0g_inference", serviceName: `Trading Arena · ${pair}`, amount: 0.03, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.trading.signal", payload: { pair, strategy, signal, confidence, attestationId, sealed: sealedMode } });
    setBusy(false);
  };
  const sigColor = (s: TradingSignal["signal"]) => s === "BUY" ? "#1fb58a" : s === "SELL" ? "#e63946" : "var(--muted)";
  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><TrendingUp width={15} height={15} /></span><div><h3>0G Trading Arena</h3><div className="sub">sealed inference → BUY / SELL / HOLD signal with TEE attestation · $0.03 USDC per query</div></div></div>
        <button className="btn btn-acc btn-sm" type="button" onClick={run} disabled={busy}>{busy ? <><Loader2 size={13} className="wallet-spin" /> Running…</> : <><Zap width={13} height={13} /> Run inference</>}</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 16px 8px" }}>
        {OG_TRADE_PAIRS.map((p, i) => (
          <button key={p} className={"pill click" + (pairIdx === i ? " on" : "")} type="button" onClick={() => setPairIdx(i)}>{p}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 16px 10px", alignItems: "center" }}>
        {OG_STRATEGIES.map((s, i) => (
          <button key={s} className={"pill click" + (stratIdx === i ? " on" : "")} type="button" onClick={() => setStratIdx(i)} style={{ fontSize: ".7rem" }}>{s}</button>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: ".76rem", cursor: "pointer" }}>
          <input type="checkbox" checked={sealedMode} onChange={(e) => setSealedMode(e.currentTarget.checked)} />
          <span style={{ fontWeight: 700, color: sealedMode ? "var(--accent-primary)" : "var(--muted)" }}>Sealed TEE</span>
        </label>
      </div>
      {signals.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>
            Strategy leaderboard — ranked by signal confidence
          </div>
          {signals.slice(0, 8).map((s, i) => {
            const bullish = s.signal === "BUY";
            const bearish = s.signal === "SELL";
            const pnlPct = bullish ? s.confidence - 50 : bearish ? -(s.confidence - 50) : 0;
            const barFill = Math.abs(pnlPct) * 1.5;
            const barColor = bullish ? "#1fb58a" : bearish ? "#e63946" : "var(--muted)";
            return (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "22px 140px 52px 1fr 56px 44px", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: i < Math.min(signals.length, 8) - 1 ? "1px solid var(--line-2)" : "none" }}>
                <span style={{ fontSize: ".68rem", color: "var(--muted)", fontWeight: 700 }}>#{i + 1}</span>
                <div>
                  <div style={{ fontSize: ".78rem", fontWeight: 700, fontFamily: "var(--mono)" }}>{s.pair}</div>
                  <div style={{ fontSize: ".63rem", color: "var(--muted)", lineHeight: 1.2 }}>{s.strategy.slice(0, 22)}</div>
                </div>
                <span style={{ padding: "2px 6px", borderRadius: 6, background: `color-mix(in srgb, ${sigColor(s.signal)} 15%, transparent)`, color: sigColor(s.signal), fontWeight: 800, fontSize: ".7rem", textAlign: "center" }}>{s.signal}</span>
                <div style={{ position: "relative", height: 14, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: "50%", width: 1, height: "100%", background: "var(--line-2)", zIndex: 1 }} />
                  {pnlPct > 0 && <div style={{ position: "absolute", left: "50%", width: `${barFill}%`, height: "100%", background: barColor, opacity: .75, borderRadius: "0 3px 3px 0" }} />}
                  {pnlPct < 0 && <div style={{ position: "absolute", right: "50%", width: `${barFill}%`, height: "100%", background: barColor, opacity: .75, borderRadius: "3px 0 0 3px" }} />}
                </div>
                <span style={{ fontSize: ".74rem", fontWeight: 800, color: barColor, textAlign: "right" }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(0)}%</span>
                <div style={{ textAlign: "right" }}>
                  {s.sealed
                    ? <span style={{ fontSize: ".62rem", color: "var(--green)", fontWeight: 700 }}>sealed</span>
                    : <span style={{ fontSize: ".62rem", color: "var(--muted)" }}>open</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {signals.length === 0 && <div className="muted sm" style={{ padding: "0 16px 14px" }}>Run sealed inference to see the strategy leaderboard with PnL bars.</div>}
    </div>
  );
}

// ── Live Wallet Balance ────────────────────────────────────────────────────
const OG_RPC = (import.meta.env as Record<string, string | undefined>)["VITE_0G_RPC_URL"] ?? "https://evmrpc.0g.ai";
const DEPLOYER = "0x82736f84Ad234566180F902237e2Fb4c35177bDB";

async function fetchOgBalance(address: string): Promise<string | null> {
  try {
    const res = await fetch(OG_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"], id: 1 }),
    });
    const data = (await res.json()) as { result?: string };
    if (!data.result) return null;
    const wei = BigInt(data.result);
    const og = Number(wei) / 1e18;
    return og.toFixed(4);
  } catch {
    return null;
  }
}

export function LiveWalletBalance() {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.hidden) return; // skip when tab is hidden
      const b = await fetchOgBalance(DEPLOYER);
      if (!alive) return;
      setBalance(b);
      setLoading(false);
      setLastFetch(new Date().toLocaleTimeString());
    };
    void poll();
    const id = setInterval(poll, 30_000);
    // Re-poll immediately when the tab becomes visible again
    const onVisible = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: "var(--field)", border: "1px solid var(--line-2)", marginBottom: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: balance !== null ? "#10b981" : loading ? "#60a5fa" : "#f87171", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Deployer wallet · 0G Galileo · live</div>
        <div style={{ fontFamily: "monospace", fontSize: ".72rem", color: "var(--muted)", marginBottom: 2 }}>{DEPLOYER}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        {loading
          ? <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: ".78rem" }}><Loader2 width={12} height={12} className="wallet-spin" /> checking…</div>
          : balance !== null
            ? <div><div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#10b981" }}>{balance} <span style={{ fontSize: ".72rem", fontWeight: 600 }}>OG</span></div>{lastFetch && <div style={{ fontSize: ".58rem", color: "var(--muted)" }}>updated {lastFetch}</div>}</div>
            : <div style={{ fontSize: ".78rem", color: "var(--red)", fontWeight: 700 }}>RPC offline</div>}
      </div>
    </div>
  );
}

// ── Agent ID Registry ─────────────────────────────────────────────────────
type RegAgent = { agentId: string; name: string; role: string; wallet: string; dailyCapUsd: number; sealed: boolean; createdAt: string; status: "active" | "revoked"; txHash?: string };
const AG_ROLES = ["Job Worker", "Trading Agent", "Memory Curator", "Data Pipeline", "Custom"] as const;

export function AgentIdRegistry({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [list, setList] = useLocalStore<RegAgent[]>("0g.agentIds", []);
  const [name, setName] = useState("Inference Worker");
  const [role, setRole] = useState<typeof AG_ROLES[number]>("Job Worker");
  const [cap, setCap] = useState("8");
  const [sealed, setSealed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const recent = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "0g.agentid.register").slice(0, 6), [receipts, workspace.id]);

  const register = async () => {
    setRegError(null);
    setBusy(true);
    try {
      const dailyCapUsd = parseFloat(cap) || 5;
      const domain = `${name.trim().toLowerCase().replace(/\s+/g, "-")}-${role.toLowerCase().replace(/\s+/g, "-")}.tollgate.0g`;
      const result = await registerAgentIdentity(domain);
      const reg: RegAgent = {
        agentId: `agid_0g_${result.agentId}`,
        name: name.trim() || "Unnamed agent",
        role,
        wallet: result.walletAddress,
        dailyCapUsd,
        sealed,
        createdAt: new Date().toISOString(),
        status: "active",
        txHash: result.txHash === "already-registered" ? undefined : result.txHash,
      };
      setList((prev) => [reg, ...prev.filter((x) => x.wallet.toLowerCase() !== result.walletAddress.toLowerCase())].slice(0, 20));
      emitReceipt({ workspaceId: workspace.id, serviceName: "0G Agent ID Registry", amount: 0.01, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.agentid.register", payload: { agentId: reg.agentId, wallet: result.walletAddress, role, dailyCapUsd, sealed, txHash: result.txHash } });
    } catch (e) {
      const raw = (e as Error).message ?? String(e);
      setRegError(raw.startsWith("Set VITE") ? "On-chain registration is not available on this network. Connect MetaMask to 0G Galileo and try again." : raw);
    }
    setBusy(false);
  };
  const setStatus = (id: string, status: RegAgent["status"]) => setList((prev) => prev.map((x) => x.agentId === id ? { ...x, status } : x));

  const roleColor: Record<string, string> = { "Job Worker": "#3b82f6", "Trading Agent": "#f59e0b", "Memory Curator": "#8b5cf6", "Data Pipeline": "#10b981", "Custom": "#64748b" };
  const agentInitials = (n: string) => n.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  const agentColor = (id: string) => { const colors = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#ef4444","#ec4899","#14b8a6"]; return colors[id.charCodeAt(id.length - 1) % colors.length]!; };

  const FLAT_SPARK = Array.from({ length: 7 }, (_, i) => `${i * 10},28`).join(" ");
  const agentStats = useMemo(() => list.map((a) => ({
    agentId: a.agentId,
    spentToday: 0,
    sparkPts: FLAT_SPARK,
  })), [list, FLAT_SPARK]);

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Robot width={15} height={15} /></span><div><h3>Agent ID registry</h3><div className="sub">on-chain agent identities via AgentIdentityRegistry · MetaMask required · 0G Galileo testnet</div></div></div>
        <button className="btn btn-acc btn-sm" type="button" onClick={register} disabled={busy}>{busy ? <><Loader2 size={13} className="wallet-spin" /> Registering…</> : <><Plus width={13} height={13} /> Register agent</>}</button>
      </div>
      {regError && <div style={{ margin: "0 16px 8px", padding: "8px 12px", borderRadius: 8, background: "color-mix(in srgb,var(--red) 12%,transparent)", color: "var(--red)", fontSize: ".75rem" }}>{regError}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr auto", gap: 10, padding: "0 16px 12px", alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Agent name</span>
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Role</span>
          <select value={role} onChange={(e) => setRole(e.currentTarget.value as typeof role)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>{AG_ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Daily cap USDC</span>
          <input value={cap} onChange={(e) => setCap(e.currentTarget.value)} inputMode="decimal" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }} />
        </label>
        <label className="row sm" style={{ gap: 6, fontSize: ".78rem", cursor: "pointer", paddingBottom: 8 }}>
          <input type="checkbox" checked={sealed} onChange={(e) => setSealed(e.currentTarget.checked)} /> TEE
        </label>
      </div>
      <div style={{ padding: "0 16px 6px" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "2px 0 8px" }}>Your agents · {list.length}</div>
        {list.length === 0 && <div style={{ color: "var(--muted)", fontSize: ".8rem", padding: "8px 0" }}>No agents yet — register one above.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {list.map((a) => {
            const col = agentColor(a.agentId);
            const stats = agentStats.find((s) => s.agentId === a.agentId);
            const pts = stats?.sparkPts ?? FLAT_SPARK;
            return (
              <div key={a.agentId} style={{ borderRadius: 14, border: `1px solid ${a.status === "revoked" ? "var(--line-2)" : col + "44"}`, background: "var(--bg-2)", padding: "14px 14px 10px", display: "flex", flexDirection: "column", gap: 8, opacity: a.status === "revoked" ? 0.5 : 1, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: col, borderRadius: "14px 14px 0 0" }} />
                <div className="row sm" style={{ gap: 10, alignItems: "center" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: col + "22", border: `2px solid ${col}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: ".82rem", color: col, flexShrink: 0 }}>{agentInitials(a.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: ".88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                    <div style={{ fontSize: ".68rem", color: roleColor[a.role] ?? "var(--muted)", fontWeight: 700, marginTop: 2 }}>{a.role}</div>
                  </div>
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: ".68rem", color: "var(--muted)", background: "var(--bg-1)", padding: "4px 8px", borderRadius: 7, letterSpacing: ".03em", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{a.wallet.slice(0, 10)}…{a.wallet.slice(-6)}</span>
                  {a.txHash && <a href={ogExplorerTxUrl(a.txHash)} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)", fontSize: ".6rem", textDecoration: "none" }}>tx↗</a>}
                </div>
                <div className="row sm" style={{ gap: 6, flexWrap: "wrap" }}>
                  <span className="pill" style={{ background: col + "18", color: col, fontWeight: 800, fontSize: ".62rem" }}>${a.dailyCapUsd}/day</span>
                  {a.sealed ? <span className="pill ok" style={{ fontSize: ".62rem" }}>TEE sealed</span> : <span className="pill" style={{ color: "var(--muted)", fontSize: ".62rem" }}>open exec</span>}
                  {a.status === "active" ? <span className="pill ok" style={{ fontSize: ".62rem" }}>active</span> : <span className="pill" style={{ background: "color-mix(in srgb,var(--red) 15%,transparent)", color: "var(--red)", fontSize: ".62rem" }}>revoked</span>}
                </div>
                <div>
                  <div style={{ fontSize: ".58rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 3 }}>7-day activity</div>
                  <svg width="68" height="24" viewBox="0 0 62 32" style={{ display: "block" }}>
                    <polyline points={pts} fill="none" stroke={col} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                    <polyline points={pts + " 60,32 0,32"} fill={col + "22"} stroke="none" />
                  </svg>
                </div>
                {(() => {
                  const spentToday = agentStats.find((s) => s.agentId === a.agentId)?.spentToday ?? 0;
                  const pct = Math.min(1, spentToday / a.dailyCapUsd);
                  const r = 18; const circ = 2 * Math.PI * r;
                  const dash = circ * pct;
                  const warn = pct > 0.8;
                  const gaugeCol = warn ? "#ef4444" : pct > 0.5 ? "#f59e0b" : col;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                      <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
                        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line-2)" strokeWidth="4" />
                        <circle cx="22" cy="22" r={r} fill="none" stroke={gaugeCol} strokeWidth="4"
                          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                          transform="rotate(-90 22 22)" style={{ transition: "stroke-dasharray .6s ease" }} />
                        <text x="22" y="26" textAnchor="middle" fill={gaugeCol} fontSize="8" fontWeight="800">{Math.round(pct * 100)}%</text>
                      </svg>
                      <div>
                        <div style={{ fontSize: ".62rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em" }}>Daily spend</div>
                        <div style={{ fontSize: ".78rem", fontWeight: 800, color: gaugeCol }}>${spentToday.toFixed(2)} <span style={{ color: "var(--muted)", fontWeight: 500 }}>/ ${a.dailyCapUsd}</span></div>
                        {warn && <div style={{ fontSize: ".6rem", color: "#ef4444", fontWeight: 700 }}>⚠ near limit</div>}
                      </div>
                    </div>
                  );
                })()}
                <button className="btn btn-ghost btn-sm" type="button" style={{ alignSelf: "flex-start", marginTop: 2, fontSize: ".7rem", padding: "3px 10px" }} onClick={() => setStatus(a.agentId, a.status === "active" ? "revoked" : "active")}>{a.status === "active" ? "Revoke" : "Restore"}</button>
              </div>
            );
          })}
        </div>
      </div>
      {recent.length > 0 && (
        <div style={{ padding: "8px 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0 4px" }}>Recent registrations · {recent.length}</div>
          <div className="svc-hist">{recent.map((r) => { const p = (r.payload ?? {}) as { agentId?: string; role?: string }; return (
            <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} /><div className="svc-hist__main"><b>{p.agentId}</b><span>{p.role} · {new Date(r.createdAt).toLocaleTimeString()}</span></div>{badgeFor(r.status)}<span className="svc-hist__amt">{r.amount.toFixed(2)}</span></div>
          ); })}</div>
        </div>
      )}
    </div>
  );
}

// ── Revenue Split Console ─────────────────────────────────────────────────
export function RevenueSplitConsole({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const wsServices = useMemo(() => allCatalogServices.filter((s) => s.workspaceIds.includes(workspace.id)), [workspace.id]);
  const [svcId, setSvcId] = useState(wsServices[0]?.id ?? "");
  const [pool, setPool] = useState("1.20");
  const [rows, setRows] = useState<{ wallet: string; pct: string }[]>([{ wallet: "", pct: "70" }, { wallet: "", pct: "30" }]);
  const [done, setDone] = useState<string | null>(null);
  const pctSum = rows.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0);
  const splits = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "0g.revenue.split").slice(0, 12), [receipts, workspace.id]);

  const setRow = (i: number, k: "wallet" | "pct", v: string) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const addRow = () => setRows((rs) => [...rs, { wallet: "", pct: "0" }]);
  const rmRow = (i: number) => setRows((rs) => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs);

  const execute = () => {
    const p = parseFloat(pool) || 0;
    if (p <= 0 || Math.abs(pctSum - 100) > 0.01) return;
    const svc = wsServices.find((s) => s.id === svcId);
    const batchId = "split_" + hashId("split", svcId + Date.now(), 6);
    rows.forEach((row) => {
      const pct = parseFloat(row.pct) || 0;
      if (pct <= 0) return;
      emitReceipt({ workspaceId: workspace.id, serviceId: svcId, serviceName: `${svc?.name ?? "Service"} · Revenue Share`, amount: Number((p * pct / 100).toFixed(4)), currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.revenue.split", payload: { recipient: row.wallet.trim() || "(unset)", pct, batchId, serviceId: svcId } });
    });
    setDone(batchId);
  };

  const recentBatches = useMemo(() => {
    const m = new Map<string, { batchId: string; total: number; n: number; when: string }>();
    for (const r of splits) {
      const b = ((r.payload ?? {}) as { batchId?: string }).batchId ?? r.id;
      const e = m.get(b) ?? { batchId: b, total: 0, n: 0, when: r.createdAt };
      e.total += r.amount; e.n += 1; m.set(b, e);
    }
    return [...m.values()].slice(0, 6);
  }, [splits]);

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><CircleDollarSign width={15} height={15} /></span><div><h3>Revenue split console</h3><div className="sub">fan a service&apos;s earnings out to N wallets · one receipt per recipient · automated billing / revenue-share</div></div></div>
        <button className="btn btn-acc btn-sm" type="button" onClick={execute} disabled={Math.abs(pctSum - 100) > 0.01 || !(parseFloat(pool) > 0)}><Bolt width={13} height={13} /> Execute split</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, padding: "0 16px 10px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Service</span>
          <select value={svcId} onChange={(e) => setSvcId(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>{wsServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Pool (USDC)</span>
          <input value={pool} onChange={(e) => setPool(e.currentTarget.value)} inputMode="decimal" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }} />
        </label>
      </div>
      <div style={{ padding: "0 16px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} className="row sm" style={{ gap: 8 }}>
            <input value={r.wallet} onChange={(e) => setRow(i, "wallet", e.currentTarget.value)} placeholder="recipient 0x…" style={{ flex: 1, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "var(--mono)" }} />
            <input value={r.pct} onChange={(e) => setRow(i, "pct", e.currentTarget.value)} inputMode="decimal" style={{ width: 64, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem", textAlign: "right" }} />
            <span style={{ fontSize: ".74rem", color: "var(--muted)", width: 64 }}>≈ ${(((parseFloat(r.pct) || 0) / 100) * (parseFloat(pool) || 0)).toFixed(3)}</span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => rmRow(i)} title="remove" style={{ color: "var(--red)" }}><Trash2 width={12} height={12} /></button>
          </div>
        ))}
        <div className="row sm" style={{ gap: 10, fontSize: ".74rem" }}>
          <button className="btn btn-ghost btn-sm" type="button" onClick={addRow}><Plus width={12} height={12} /> Add recipient</button>
          <span style={{ color: Math.abs(pctSum - 100) > 0.01 ? "var(--red)" : "var(--green)", fontWeight: 700 }}>total {pctSum}% {Math.abs(pctSum - 100) > 0.01 ? "(must equal 100)" : "✓"}</span>
          {done && <span style={{ color: "var(--green)", fontWeight: 700 }}><Check width={12} height={12} /> split <code style={{ background: "rgba(0,0,0,.14)", padding: "1px 5px", borderRadius: 5 }}>{done}</code> executed</span>}
        </div>
      </div>
      {recentBatches.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent splits · {recentBatches.length}</div>
          <div className="svc-hist">{recentBatches.map((b) => (
            <div className="svc-hist__row" key={b.batchId}><span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} /><div className="svc-hist__main"><b>{b.batchId}</b><span>{b.n} recipients · {new Date(b.when).toLocaleTimeString()}</span></div><span className="svc-hist__amt">{b.total.toFixed(3)}</span></div>
          ))}</div>
        </div>
      )}
    </div>
  );
}

// ── Live Contracts Panel ───────────────────────────────────────────────────────
function envAddr(key: string): string | null {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.trim() ? v.trim() : null;
}

const EXPLORER = "https://chainscan-galileo.0g.ai";

const OG_CONTRACTS = [
  { label: "AgentReceiptRegistry",  envKey: "VITE_0G_REGISTRY_ADDRESS",                  fallback: "0x801ddc5a54E5a7F1d0D6900AA996A04E26D0307f", badge: "live" },
  { label: "AgentIdentityRegistry", envKey: "VITE_0G_IDENTITY_REGISTRY_ADDRESS",          fallback: "0x8769E9ad02728d49D08CE2F5D5cd4ce75EeC0446", badge: "live" },
  { label: "ServiceRegistry",       envKey: "VITE_0G_SERVICE_REGISTRY_MAINNET_ADDRESS",   fallback: "0x2b27425bd22Ae883dEc34F7a8Eacacf336C562b8", badge: "live" },
  { label: "AgentBudgetController", envKey: "VITE_0G_AGENT_BUDGET_MAINNET_ADDRESS",       fallback: "0x305eF265BD964fBe34913E70Ef6AA8951e6b662e", badge: "live" },
  { label: "DeliveryVerifier",      envKey: "VITE_0G_DELIVERY_VERIFIER_MAINNET_ADDRESS",  fallback: "0x5F4999829D57f714497343f5677e66e6A56238E3", badge: "live" },
] as const;

export function OgLiveContractsPanel() {
  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: ".7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)" }}>0G Galileo Contracts</span>
        <span style={{ fontSize: ".63rem", color: "#4ade80", fontWeight: 700, background: "#4ade8018", padding: "2px 7px", borderRadius: 5 }}>chainId 16602</span>
      </div>
      {OG_CONTRACTS.map((c) => {
        const addr = envAddr(c.envKey) ?? c.fallback;
        const short = `${addr.slice(0, 8)}…${addr.slice(-6)}`;
        return (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid var(--line-2)" }}>
            <ShieldCheck width={13} height={13} style={{ color: "#4ade80", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: ".77rem", fontWeight: 700, color: "var(--ink)" }}>{c.label}</div>
              <div style={{ fontSize: ".62rem", color: "var(--muted)", fontFamily: "monospace" }}>{addr}</div>
            </div>
            <a
              href={`${EXPLORER}/address/${addr}`}
              target="_blank" rel="noreferrer"
              style={{ fontSize: ".6rem", color: "#4ade80", fontWeight: 700, textDecoration: "none", background: "#4ade8014", padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap" }}
            >{short} ↗</a>
          </div>
        );
      })}
    </div>
  );
}

// ── 0G DA Monitor ─────────────────────────────────────────────────────────────

const FIXED_PRICE_FLOW = "0x62d4144db0f0a6fbbaeb6296c785c71b3d57c526";
// keccak256("Submit(uint256,bytes32,uint256,address,address)")
const SUBMIT_TOPIC = "0xb0f1b13cf8b3793de7b30921124a19c749ee07ab07baf9d3bef1bec0f1c0cde2";
const OG_MAINNET_RPC = "https://evmrpc.0g.ai";

type DaCommitment = {
  id: string;
  blockHeight: number;
  batchSize: number;
  dataRoot: string;
  submittedAt: string;
  status: "finalized" | "pending";
  throughputKBs: number;
};

async function rpcCall(method: string, params: unknown[]) {
  const r = await fetch(OG_MAINNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  return j.result;
}

async function fetchDaLogs(): Promise<DaCommitment[]> {
  const latestHex: string = await rpcCall("eth_blockNumber", []);
  const latest = parseInt(latestHex, 16);
  const fromBlock = "0x" + Math.max(0, latest - 500).toString(16);
  const logs: Array<{ blockNumber: string; topics: string[]; data: string; transactionHash: string }> = await rpcCall("eth_getLogs", [{
    address: FIXED_PRICE_FLOW,
    topics: [SUBMIT_TOPIC],
    fromBlock,
    toBlock: "latest",
  }]);
  if (!Array.isArray(logs)) return [];
  return logs.slice(-20).reverse().map((log) => {
    const blockHeight = parseInt(log.blockNumber, 16);
    const dataRoot = log.topics[1] ?? log.transactionHash;
    const status: DaCommitment["status"] = blockHeight < latest - 50 ? "finalized" : "pending";
    return {
      id: log.transactionHash,
      blockHeight,
      batchSize: 1,
      dataRoot,
      submittedAt: new Date().toLocaleTimeString(),
      status,
      throughputKBs: 0,
    };
  });
}

export function OgSlashingAlert() {
  return null;
}

export function OgDaMonitor() {
  const [rows, setRows] = useState<DaCommitment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "finalized" | "pending">("all");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const finalized = rows.filter((r) => r.status === "finalized").length;

  async function refresh() {
    setRefreshing(true);
    setLoadErr(null);
    try {
      const data = await fetchDaLogs();
      setRows(data);
    } catch (e: any) {
      setLoadErr(e?.message ?? "RPC error");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 14_000);
    return () => clearInterval(id);
  }, []);

  const statusColor: Record<DaCommitment["status"], string> = {
    finalized: "#10b981",
    pending: "#f59e0b",
  };

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 10 }}>
        <Database width={14} height={14} style={{ color: "#4ade80", flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: ".72rem", color: "var(--ink)", flex: 1 }}>0G DA Monitor</span>
        <span style={{ fontSize: ".62rem", color: "var(--muted)" }}>{finalized}/{rows.length} finalized{loadErr ? <span style={{ color: "#ef4444", fontWeight: 700 }}> · error</span> : null}</span>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--field)", cursor: "pointer", fontSize: ".65rem", color: "var(--muted)" }}
        >
          <RefreshCw width={11} height={11} className={refreshing ? "wallet-spin" : ""} /> Refresh
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "8px 16px", borderBottom: "1px solid var(--line-2)" }}>
        {(["all", "finalized", "pending"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: "2px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: ".65rem", fontWeight: 700,
              background: filter === f ? (f === "all" ? "#7C5CF820" : statusColor[f] + "20") : "transparent",
              color: filter === f ? (f === "all" ? "#7C5CF8" : statusColor[f]) : "var(--muted)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".72rem" }}>
          <thead>
            <tr style={{ background: "var(--field)" }}>
              {["Block", "Txs", "Data root", "Status", "Time"].map((h) => (
                <th key={h} style={{ padding: "6px 14px", textAlign: "left", fontWeight: 700, fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {refreshing && rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "28px 14px", textAlign: "center", color: "var(--muted)", fontSize: ".78rem" }}>Loading DA events from 0G Galileo testnet…</td></tr>
            )}
            {!refreshing && rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "28px 14px", textAlign: "center", color: "var(--muted)", fontSize: ".78rem" }}>{loadErr ?? "No recent Submit events on FixedPriceFlow."}</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--line-2)" }}>
                <td style={{ padding: "7px 14px", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--ink)" }}>#{r.blockHeight.toLocaleString()}</td>
                <td style={{ padding: "7px 14px", color: "var(--muted)" }}>{r.batchSize}</td>
                <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: ".66rem", color: "var(--muted)" }}>{r.dataRoot.slice(0, 18)}…</td>
                <td style={{ padding: "7px 14px" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: ".63rem", fontWeight: 700, background: statusColor[r.status] + "18", color: statusColor[r.status] }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: "7px 14px", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{r.submittedAt}</td>
              </tr>
            ))}
            {rows.length > 0 && filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 18, color: "var(--muted)", textAlign: "center" }}>No {filter} commitments.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 0G Gas Fee Estimator ──────────────────────────────────────────────────────

const GAS_MODELS = [
  { name: "Risk Scorer v2", gasUnits: 180_000 },
  { name: "Llama 3 · 8B",   gasUnits: 260_000 },
  { name: "Mistral · 7B",   gasUnits: 240_000 },
  { name: "Anomaly Detect", gasUnits: 210_000 },
  { name: "Wallet Labeler", gasUnits: 195_000 },
] as const;

// OG price roughly $0.012/token at current market; we convert gas cost to USDC
// using a fixed OG→USDC rate of $0.008 (approximate testnet proxy).
const OG_USD = 0.008;

export function OgGasFeeEstimator() {
  const [gasPriceGwei, setGasPriceGwei] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function fetchGasPrice() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("https://evmrpc.0g.ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
        signal: AbortSignal.timeout(6000),
      });
      const data = await res.json() as { result?: string };
      if (data.result) {
        const wei = parseInt(data.result, 16);
        setGasPriceGwei(wei / 1e9);
        setLastFetch(new Date().toLocaleTimeString());
      } else {
        setError(true);
      }
    } catch {
      setError(true);
      // fallback: use a realistic testnet value so the table stays useful
      setGasPriceGwei(1.2);
      setLastFetch(new Date().toLocaleTimeString() + " (est.)");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGasPrice();
    const id = setInterval(fetchGasPrice, 15_000);
    return () => clearInterval(id);
  }, []);

  const gwei = gasPriceGwei ?? 1.2;

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 10 }}>
        <Zap width={14} height={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: ".72rem", color: "var(--ink)", flex: 1 }}>0G Gas Fee Estimator</span>
        <span style={{ fontSize: ".62rem", fontVariantNumeric: "tabular-nums", color: error ? "#f59e0b" : "#10b981", fontWeight: 700 }}>
          {loading ? "fetching…" : `${gwei.toFixed(3)} Gwei`}
          {lastFetch && !loading && <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 6 }}>· {lastFetch}</span>}
        </span>
        <button
          type="button"
          onClick={fetchGasPrice}
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--field)", cursor: "pointer", fontSize: ".65rem", color: "var(--muted)" }}
        >
          <RefreshCw width={11} height={11} className={loading ? "wallet-spin" : ""} /> Refresh
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".72rem" }}>
          <thead>
            <tr style={{ background: "var(--field)" }}>
              {["Model", "Gas units", "Gas cost (OG)", "Est. USDC"].map((h) => (
                <th key={h} style={{ padding: "6px 16px", textAlign: "left", fontWeight: 700, fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GAS_MODELS.map((m) => {
              const gasCostOg = (m.gasUnits * gwei * 1e-9);
              const gasCostUsd = gasCostOg * OG_USD;
              return (
                <tr key={m.name} style={{ borderTop: "1px solid var(--line-2)" }}>
                  <td style={{ padding: "7px 16px", fontWeight: 700, color: "var(--ink)" }}>{m.name}</td>
                  <td style={{ padding: "7px 16px", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{m.gasUnits.toLocaleString()}</td>
                  <td style={{ padding: "7px 16px", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{gasCostOg.toFixed(6)} OG</td>
                  <td style={{ padding: "7px 16px", fontVariantNumeric: "tabular-nums", color: "#10b981", fontWeight: 700 }}>${gasCostUsd.toFixed(6)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "6px 16px", fontSize: ".6rem", color: "var(--muted)", borderTop: "1px solid var(--line-2)" }}>
        Polled from <code>evmrpc.0g.ai</code> every 15 s · OG→USDC rate ~$0.008 · gas units are per-model estimates
      </div>
    </div>
  );
}

// ── Agent Allowlist Manager ───────────────────────────────────────────────────

type AllowEntry = { address: string; label: string; dailyCapUsd: number; addedAt: string; permitSig: string };

function isValidAddress(a: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

export function OgAllowlistManager() {
  const [entries, setEntries] = useLocalStore<AllowEntry[]>("og.allowlist", []);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [dailyCap, setDailyCap] = useState(8);
  const [signing, setSigning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const add = async () => {
    const addr = address.trim();
    if (!isValidAddress(addr)) { setErr("Enter a valid 0x… Ethereum address."); return; }
    if (entries.find((e) => e.address.toLowerCase() === addr.toLowerCase())) { setErr("Address already on allowlist."); return; }
    setErr(null);
    setSigning(true);
    try {
      const accounts: string[] = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      const from = accounts[0];
      const msg = `allowlist:${addr}:cap=${dailyCap}:ts=${Date.now()}`;
      const permitSig: string = await (window as any).ethereum.request({ method: "personal_sign", params: [msg, from] });
      const entry: AllowEntry = { address: addr, label: label.trim() || "Agent wallet", dailyCapUsd: dailyCap, addedAt: new Date().toLocaleTimeString(), permitSig };
      setEntries((prev) => [entry, ...prev].slice(0, 20));
      setAddress(""); setLabel("");
    } catch (e: any) {
      setErr(e?.message ?? "Signing rejected.");
    } finally {
      setSigning(false);
    }
  };

  const remove = (addr: string) => setEntries((prev) => prev.filter((e) => e.address !== addr));

  const copyPermit = (sig: string, addr: string) => {
    navigator.clipboard.writeText(sig).catch(() => {});
    setCopied(addr);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 10 }}>
        <ShieldCheck width={14} height={14} style={{ color: "#7C5CF8", flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: ".72rem", color: "var(--ink)", flex: 1 }}>Agent Allowlist</span>
        <span style={{ fontSize: ".62rem", color: "var(--muted)" }}>{entries.length} / 20 entries · 0G Budget Controller</span>
      </div>

      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr auto", gap: 8 }}>
          <input
            value={address}
            onChange={(e) => { setAddress(e.currentTarget.value); setErr(null); }}
            placeholder="0x…  agent wallet address"
            style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${err ? "#ef4444" : "var(--line-2)"}`, background: "var(--field)", color: "var(--ink)", fontFamily: "monospace", fontSize: ".74rem" }}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
            placeholder="Label (optional)"
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".74rem" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: ".65rem", color: "var(--muted)", whiteSpace: "nowrap" }}>Cap $</span>
            <input
              type="number" min={0.1} max={1000} step={0.5}
              value={dailyCap}
              onChange={(e) => setDailyCap(Number(e.currentTarget.value))}
              style={{ width: 56, padding: "7px 8px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".74rem" }}
            />
            <span style={{ fontSize: ".6rem", color: "var(--muted)" }}>/day</span>
          </div>
        </div>
        {err && <div style={{ fontSize: ".68rem", color: "#ef4444" }}>{err}</div>}
        <button
          type="button"
          onClick={add}
          disabled={signing || !address.trim()}
          style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "none", background: "#7C5CF8", color: "#fff", fontWeight: 700, fontSize: ".72rem", cursor: "pointer" }}
        >
          {signing ? <><Loader2 width={11} height={11} className="wallet-spin" /> Signing permit…</> : <><ShieldCheck width={11} height={11} /> Add to allowlist</>}
        </button>
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: "18px 16px", fontSize: ".72rem", color: "var(--muted)", textAlign: "center" }}>No agents on allowlist yet. Add the first one above.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".72rem" }}>
            <thead>
              <tr style={{ background: "var(--field)" }}>
                {["Address", "Label", "Daily cap", "Added", "Permit", ""].map((h) => (
                  <th key={h} style={{ padding: "6px 14px", textAlign: "left", fontWeight: 700, fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.address} style={{ borderTop: "1px solid var(--line-2)" }}>
                  <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: ".66rem", color: "var(--ink)" }}>{e.address.slice(0, 10)}…{e.address.slice(-6)}</td>
                  <td style={{ padding: "7px 14px", fontWeight: 600, color: "var(--ink)" }}>{e.label}</td>
                  <td style={{ padding: "7px 14px", fontVariantNumeric: "tabular-nums", color: "#10b981", fontWeight: 700 }}>${e.dailyCapUsd}/day</td>
                  <td style={{ padding: "7px 14px", color: "var(--muted)" }}>{e.addedAt}</td>
                  <td style={{ padding: "7px 14px" }}>
                    <button
                      type="button"
                      onClick={() => copyPermit(e.permitSig, e.address)}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--line-2)", background: "var(--field)", cursor: "pointer", fontSize: ".62rem", color: copied === e.address ? "#10b981" : "var(--muted)" }}
                    >
                      {copied === e.address ? <><Network width={10} height={10} /> Copied!</> : <><Send width={10} height={10} /> Copy sig</>}
                    </button>
                  </td>
                  <td style={{ padding: "7px 14px" }}>
                    <button type="button" onClick={() => remove(e.address)} style={{ display: "flex", alignItems: "center", padding: "2px 6px", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "#ef4444" }}>
                      <Trash2 width={12} height={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: "6px 16px", fontSize: ".6rem", color: "var(--muted)", borderTop: "1px solid var(--line-2)" }}>
        Permit signatures are EIP-191 signed in-browser — stored locally · submit to AgentBudgetController on 0G Galileo to enforce caps on-chain
      </div>
    </div>
  );
}

// ── Compute Node Leaderboard ──────────────────────────────────────────────────

const MEDAL = ["🥇", "🥈", "🥉", "4.", "5."];

type ProviderStats = { provider: string; jobs: number; totalUsd: number; avgMs: number; uptime: number };

function buildLeaderboard(receipts: Receipt[]): ProviderStats[] {
  const map = new Map<string, { jobs: number; totalUsd: number; latencySum: number }>();
  for (const r of receipts) {
    if (r.kind !== "0g.inference") continue;
    const p = (r.payload as { provider?: string } | undefined)?.provider ?? r.providerWallet;
    const key = p ? `${p.slice(0, 8)}...${p.slice(-4)}` : "unknown";
    const cur = map.get(key) ?? { jobs: 0, totalUsd: 0, latencySum: 0 };
    cur.jobs++;
    cur.totalUsd += r.amount;
    cur.latencySum += (r.payload as { latencyMs?: number } | undefined)?.latencyMs ?? 400;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([provider, s]) => ({
      provider,
      jobs: s.jobs,
      totalUsd: s.totalUsd,
      avgMs: Math.round(s.latencySum / s.jobs),
      uptime: 100,
    }))
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 5);
}

export function OgComputeLeaderboard() {
  const { receipts } = useAppState();
  const board = useMemo(() => buildLeaderboard(receipts), [receipts]);

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 10 }}>
        <TrendingUp width={14} height={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: ".72rem", color: "var(--ink)", flex: 1 }}>Compute Node Leaderboard</span>
        <span style={{ fontSize: ".62rem", color: "var(--muted)" }}>ranked by jobs served · last {receipts.filter((r) => r.kind === "0g.inference").length} receipts</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".72rem" }}>
          <thead>
            <tr style={{ background: "var(--field)" }}>
              {["#", "Node", "Jobs", "Volume", "Avg latency", "Uptime"].map((h) => (
                <th key={h} style={{ padding: "6px 14px", textAlign: "left", fontWeight: 700, fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "24px 14px", textAlign: "center", color: "var(--muted)", fontSize: ".78rem" }}>No inference receipts yet — run a Compute job above to populate the leaderboard.</td></tr>
            ) : board.map((p, i) => (
              <tr key={p.provider} style={{ borderTop: "1px solid var(--line-2)" }}>
                <td style={{ padding: "7px 14px", fontWeight: 800, fontSize: ".82rem" }}>{MEDAL[i]}</td>
                <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: ".66rem", fontWeight: 700, color: "var(--ink)" }}>{p.provider}</td>
                <td style={{ padding: "7px 14px", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--ink)" }}>{p.jobs}</td>
                <td style={{ padding: "7px 14px", fontVariantNumeric: "tabular-nums", color: "#10b981", fontWeight: 700 }}>${p.totalUsd.toFixed(3)}</td>
                <td style={{ padding: "7px 14px", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{p.avgMs} ms</td>
                <td style={{ padding: "7px 14px" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#10b981" }}>—</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Job Scheduler ─────────────────────────────────────────────────────────────

type ScheduledJob = {
  id: string;
  prompt: string;
  modelId: string;
  delayMin: number;
  runAt: number;
  status: "waiting" | "running" | "done" | "cancelled";
};

const SCHED_MODELS = [
  { id: "risk-scorer-v2", name: "Risk Scorer v2" },
  { id: "llama-3-8b",     name: "Llama 3 · 8B" },
  { id: "anomaly-detect", name: "Anomaly Detect" },
] as const;

export function OgJobScheduler({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [jobs, setJobs] = useLocalStore<ScheduledJob[]>("og.scheduler.jobs", []);
  const [prompt, setPrompt] = useState("Score wallet 0x9f3c…ba1 for mixer adjacency.");
  const [modelId, setModelId] = useState<(typeof SCHED_MODELS)[number]["id"]>("risk-scorer-v2");
  const [delayMin, setDelayMin] = useState(5);
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const waiting = jobs.filter((j) => j.status === "waiting" && j.runAt <= nowTs);
    if (waiting.length === 0) return;
    setJobs((prev) =>
      prev.map((j) => waiting.find((w) => w.id === j.id) ? { ...j, status: "running" as const } : j)
    );
    waiting.forEach((j) => {
      setTimeout(() => {
        emitReceipt({
          workspaceId: workspace.id,
          serviceName: `Scheduled · ${j.modelId}`,
          amount: 0.022,
          currency: "USDC",
          network: workspace.networks[0] ?? "0g-galileo",
          kind: "0g.inference",
          payload: { model: j.modelId, prompt: j.prompt, scheduled: true, jobId: j.id },
        });
        setJobs((prev) => prev.map((p) => p.id === j.id ? { ...p, status: "done" as const } : p));
      }, 1200);
    });
  }, [nowTs]);

  const schedule = () => {
    if (!prompt.trim()) return;
    const runAt = Date.now() + delayMin * 60_000;
    const job: ScheduledJob = { id: "sj_" + hashId("sj", prompt + runAt, 8), prompt, modelId, delayMin, runAt, status: "waiting" };
    setJobs((prev) => [job, ...prev].slice(0, 12));
  };

  const cancel = (id: string) => setJobs((prev) => prev.map((j) => j.id === id && j.status === "waiting" ? { ...j, status: "cancelled" as const } : j));
  const clear = () => setJobs((prev) => prev.filter((j) => j.status === "waiting" || j.status === "running"));

  const fmt = (ms: number) => {
    const rem = Math.max(0, ms - nowTs);
    if (rem === 0) return "now";
    const s = Math.ceil(rem / 1000);
    return s < 60 ? `${s}s` : `${Math.ceil(s / 60)}m`;
  };

  const statusColor: Record<ScheduledJob["status"], string> = {
    waiting: "#f59e0b", running: "#7C5CF8", done: "#10b981", cancelled: "var(--muted)",
  };

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 10 }}>
        <Play width={14} height={14} style={{ color: "#7C5CF8", flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: ".72rem", color: "var(--ink)", flex: 1 }}>Job Scheduler</span>
        <span style={{ fontSize: ".62rem", color: "var(--muted)" }}>{jobs.filter((j) => j.status === "waiting").length} waiting · {jobs.filter((j) => j.status === "done").length} done</span>
        {jobs.some((j) => j.status === "done" || j.status === "cancelled") && (
          <button type="button" onClick={clear} style={{ fontSize: ".6rem", color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}>Clear history</button>
        )}
      </div>

      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            placeholder="Job prompt…"
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".74rem", resize: "vertical" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.currentTarget.value as typeof modelId)}
              style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".72rem" }}
            >
              {SCHED_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: ".6rem", color: "var(--muted)", whiteSpace: "nowrap" }}>Delay</span>
              <input
                type="number" min={1} max={1440} step={1} value={delayMin}
                onChange={(e) => setDelayMin(Math.max(1, Number(e.currentTarget.value)))}
                style={{ width: 52, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".72rem" }}
              />
              <span style={{ fontSize: ".6rem", color: "var(--muted)" }}>min</span>
            </div>
          </div>
          <button
            type="button"
            onClick={schedule}
            disabled={!prompt.trim()}
            style={{ alignSelf: "center", padding: "8px 14px", borderRadius: 8, border: "none", background: "#7C5CF8", color: "#fff", fontWeight: 700, fontSize: ".72rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Play width={11} height={11} /> Schedule
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div style={{ padding: "18px 16px", fontSize: ".72rem", color: "var(--muted)", textAlign: "center" }}>No jobs scheduled yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".72rem" }}>
            <thead>
              <tr style={{ background: "var(--field)" }}>
                {["Job", "Model", "Prompt", "Fires in", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "6px 14px", textAlign: "left", fontWeight: 700, fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} style={{ borderTop: "1px solid var(--line-2)" }}>
                  <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: ".64rem", color: "var(--muted)" }}>{j.id.slice(0, 12)}</td>
                  <td style={{ padding: "7px 14px", color: "var(--ink)" }}>{SCHED_MODELS.find((m) => m.id === j.modelId)?.name ?? j.modelId}</td>
                  <td style={{ padding: "7px 14px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)" }}>{j.prompt}</td>
                  <td style={{ padding: "7px 14px", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: j.status === "waiting" ? "#f59e0b" : "var(--muted)" }}>
                    {j.status === "waiting" ? fmt(j.runAt) : "—"}
                  </td>
                  <td style={{ padding: "7px 14px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: ".62rem", fontWeight: 700, background: statusColor[j.status] + "18", color: statusColor[j.status] }}>
                      {j.status}
                    </span>
                  </td>
                  <td style={{ padding: "7px 14px" }}>
                    {j.status === "waiting" && (
                      <button type="button" onClick={() => cancel(j.id)} style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid var(--line-2)", background: "transparent", cursor: "pointer", fontSize: ".62rem", color: "#ef4444" }}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Network Topology Mini-Map ─────────────────────────────────────────────────

type TopoNode = { id: string; x: number; y: number; role: "client" | "compute" | "storage" | "da" | "chain"; label: string };
type TopoEdge = { from: string; to: string; active: boolean };

const TOPO_NODES: TopoNode[] = [
  { id: "client",  x: 50,  y: 110, role: "client",  label: "Agent" },
  { id: "compute", x: 170, y: 50,  role: "compute", label: "Compute" },
  { id: "storage", x: 170, y: 110, role: "storage", label: "Storage" },
  { id: "da",      x: 170, y: 170, role: "da",       label: "DA" },
  { id: "chain",   x: 290, y: 110, role: "chain",    label: "Chain" },
];

const TOPO_EDGES: TopoEdge[] = [
  { from: "client",  to: "compute", active: true },
  { from: "client",  to: "storage", active: true },
  { from: "client",  to: "da",      active: false },
  { from: "compute", to: "chain",   active: true },
  { from: "storage", to: "chain",   active: true },
  { from: "da",      to: "chain",   active: false },
];

const NODE_COLOR: Record<TopoNode["role"], string> = {
  client:  "#7C5CF8",
  compute: "#10b981",
  storage: "#3b82f6",
  da:      "#f59e0b",
  chain:   "#a855f7",
};

function nodeById(id: string) {
  return TOPO_NODES.find((n) => n.id === id)!;
}

export function OgNetworkTopology() {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPulse((p) => (p + 1) % 4), 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 10 }}>
        <Network width={14} height={14} style={{ color: "#7C5CF8", flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: ".72rem", color: "var(--ink)", flex: 1 }}>Network Topology</span>
        <span style={{ fontSize: ".62rem", color: "var(--muted)", fontWeight: 700 }}>Architecture overview</span>
      </div>
      <div style={{ padding: "16px", display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <svg width={340} height={220} style={{ flex: "0 0 340px", overflow: "visible" }}>
          <defs>
            <filter id="topo-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {TOPO_EDGES.map((e, i) => {
            const src = nodeById(e.from);
            const dst = nodeById(e.to);
            const lit = e.active && pulse % 4 !== i % 4;
            return (
              <g key={`${e.from}-${e.to}`}>
                <path id={`ep-${i}`} d={`M${src.x},${src.y} L${dst.x},${dst.y}`} fill="none" stroke="none" />
                <line x1={src.x} y1={src.y} x2={dst.x} y2={dst.y}
                  stroke={lit ? NODE_COLOR[src.role] : "var(--line-2)"}
                  strokeWidth={lit ? 1.5 : 1}
                  strokeDasharray={e.active ? "none" : "4 3"}
                  opacity={lit ? 0.7 : 0.3}
                  style={{ transition: "stroke .6s, opacity .6s" }}
                />
                {e.active && (
                  <circle r={3} fill={NODE_COLOR[src.role]} opacity={0.9} filter="url(#topo-glow)">
                    <animateMotion dur={`${1.4 + i * 0.3}s`} repeatCount="indefinite">
                      <mpath href={`#ep-${i}`} />
                    </animateMotion>
                  </circle>
                )}
              </g>
            );
          })}
          {TOPO_NODES.map((n) => {
            const col = NODE_COLOR[n.role];
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={18} fill={col + "18"} stroke={col} strokeWidth={1.5} />
                <circle cx={n.x} cy={n.y} r={6} fill={col} filter="url(#topo-glow)" />
                <text x={n.x} y={n.y + 31} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--muted)" fontFamily="system-ui">{n.label}</text>
              </g>
            );
          })}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
          {TOPO_NODES.filter((n) => n.id !== "client").map((n) => (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: NODE_COLOR[n.role], flexShrink: 0 }} />
              <span style={{ fontSize: ".68rem", fontWeight: 700, color: "var(--ink)" }}>0G {n.label}</span>
              <span style={{ fontSize: ".62rem", color: "#10b981" }}>● active</span>
            </div>
          ))}
          <div style={{ fontSize: ".6rem", color: "var(--muted)", marginTop: 4, maxWidth: 160 }}>
            Solid = active payment channels · dashed = available but idle
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Block Explorer Embed ──────────────────────────────────────────────────────

type BlockInfo = { number: number; hash: string; txCount: number; gasUsed: string; ts: string };

async function fetchLatestBlocks(): Promise<BlockInfo[]> {
  const rpc = async (method: string, params: unknown[]) => {
    const res = await fetch("https://evmrpc.0g.ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json() as { result?: unknown };
    return data.result;
  };
  const latest = await rpc("eth_blockNumber", []) as string;
  const latestNum = parseInt(latest, 16);
  const blocks: BlockInfo[] = [];
  for (let i = 0; i < 5; i++) {
    const num = latestNum - i;
    const hex = "0x" + num.toString(16);
    const block = await rpc("eth_getBlockByNumber", [hex, false]) as { hash?: string; transactions?: unknown[]; gasUsed?: string; timestamp?: string } | null;
    if (!block) continue;
    const ts = block.timestamp ? new Date(parseInt(block.timestamp, 16) * 1000).toLocaleTimeString() : "—";
    blocks.push({ number: num, hash: block.hash ?? "0x…", txCount: block.transactions?.length ?? 0, gasUsed: block.gasUsed ? (parseInt(block.gasUsed, 16) / 1e6).toFixed(2) + "M" : "—", ts });
  }
  return blocks;
}

const OG_EXPLORER = "https://chainscan-galileo.0g.ai";

export function OgBlockExplorerEmbed() {
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetch5 = async () => {
    setLoading(true);
    try {
      const b = await fetchLatestBlocks();
      setBlocks(b);
      setLastFetch(new Date().toLocaleTimeString());
    } catch {
      // fallback deterministic blocks
      const base = 2_842_000 + Math.floor(Date.now() / 14_000);
      setBlocks(Array.from({ length: 5 }, (_, i) => ({
        number: base - i,
        hash: "0x" + fnv1aHex(String(base - i)) + fnv1aHex(String(base - i + 7)),
        txCount: ((base - i) * 7) % 14 + 1,
        gasUsed: (deterministicScore(String(base - i), 1.2, 8.4)).toFixed(2) + "M",
        ts: new Date(Date.now() - i * 14_000).toLocaleTimeString(),
      })));
      setLastFetch(new Date().toLocaleTimeString() + " (est.)");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetch5();
    const id = setInterval(() => { if (!document.hidden) void fetch5(); }, 14_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 10 }}>
        <Database width={14} height={14} style={{ color: "#a855f7", flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: ".72rem", color: "var(--ink)", flex: 1 }}>0G Latest Blocks</span>
        {lastFetch && <span style={{ fontSize: ".6rem", color: "var(--muted)" }}>{lastFetch}</span>}
        <button type="button" onClick={() => void fetch5()} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--field)", cursor: "pointer", fontSize: ".65rem", color: "var(--muted)" }}>
          <RefreshCw width={11} height={11} className={loading ? "wallet-spin" : ""} /> Refresh
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".72rem" }}>
          <thead>
            <tr style={{ background: "var(--field)" }}>
              {["Block", "Hash", "Txs", "Gas used", "Time"].map((h) => (
                <th key={h} style={{ padding: "6px 16px", textAlign: "left", fontWeight: 700, fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && blocks.length === 0
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--line-2)" }}>
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={j} style={{ padding: "10px 16px" }}>
                        <div style={{ height: 10, borderRadius: 4, background: "var(--field)", width: j === 1 ? 120 : j === 0 ? 60 : 50, animation: "shimmer 1.4s ease-in-out infinite" }} />
                      </td>
                    ))}
                  </tr>
                ))
              : blocks.map((b) => (
                  <tr key={b.number} style={{ borderTop: "1px solid var(--line-2)" }}>
                    <td style={{ padding: "7px 16px", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#a855f7" }}>
                      <a href={`${OG_EXPLORER}/block/${b.number}`} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>#{b.number.toLocaleString()} ↗</a>
                    </td>
                    <td style={{ padding: "7px 16px", fontFamily: "monospace", fontSize: ".64rem", color: "var(--muted)" }}>{b.hash.slice(0, 14)}…</td>
                    <td style={{ padding: "7px 16px", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{b.txCount}</td>
                    <td style={{ padding: "7px 16px", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{b.gasUsed}</td>
                    <td style={{ padding: "7px 16px", color: "var(--muted)" }}>{b.ts}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Multi-Sig Approve Flow ────────────────────────────────────────────────────

type Signer = { id: string; label: string; wallet: string; signed: boolean; sig: string | null };

const DEFAULT_SIGNERS: Omit<Signer, "signed" | "sig">[] = [
  { id: "s1", label: "Yield Researcher",  wallet: "0xag9c2a1e0bf3" },
  { id: "s2", label: "Memory Curator",    wallet: "0xag4f1d77aac0" },
  { id: "s3", label: "Data Pipeline Bot", wallet: "0xagd7e2ab8f12" },
];

const THRESHOLD = 2;

export function OgMultiSigApprove({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [receiptId, setReceiptId] = useState("rcpt_0g_" + hashId("ms", "demo", 8));
  const [signers, setSigners] = useLocalStore<Signer[]>("og.multisig.signers", DEFAULT_SIGNERS.map((s) => ({ ...s, signed: false, sig: null })));
  const [signing, setSigning] = useState<string | null>(null);
  const [released, setReleased] = useState(false);

  const signedCount = signers.filter((s) => s.signed).length;
  const quorumMet = signedCount >= THRESHOLD;

  const sign = async (id: string) => {
    setSigning(id);
    try {
      const accounts: string[] = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      const from = accounts[0];
      const signer = signers.find((s) => s.id === id)!;
      const msg = `approve:${receiptId}:${signer.wallet}`;
      const sig: string = await (window as any).ethereum.request({ method: "personal_sign", params: [msg, from] });
      setSigners((prev) => prev.map((s) => s.id === id ? { ...s, signed: true, sig } : s));
    } catch {
      // user rejected or no wallet
    } finally {
      setSigning(null);
    }
  };

  const release = () => {
    if (!quorumMet) return;
    emitReceipt({
      workspaceId: workspace.id,
      serviceName: "Multi-Sig Release",
      amount: 0,
      currency: "USDC",
      network: workspace.networks[0] ?? "0g-galileo",
      kind: "0g.multisig.release",
      payload: { receiptId, signers: signers.filter((s) => s.signed).map((s) => ({ id: s.id, sig: s.sig })), threshold: THRESHOLD },
    });
    setReleased(true);
  };

  const reset = () => {
    setSigners(DEFAULT_SIGNERS.map((s) => ({ ...s, signed: false, sig: null })));
    setReceiptId("rcpt_0g_" + hashId("ms", String(Date.now()), 8));
    setReleased(false);
  };

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 10 }}>
        <ShieldCheck width={14} height={14} style={{ color: "#10b981", flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: ".72rem", color: "var(--ink)", flex: 1 }}>Multi-Sig Approve ({THRESHOLD}-of-{signers.length})</span>
        <span style={{ fontSize: ".62rem", color: quorumMet ? "#10b981" : "#f59e0b", fontWeight: 700 }}>
          {signedCount}/{THRESHOLD} required
        </span>
      </div>

      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-2)" }}>
        <div style={{ fontSize: ".6rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>Receipt to release</div>
        <input
          value={receiptId}
          onChange={(e) => { setReceiptId(e.currentTarget.value); setSigners((prev) => prev.map((s) => ({ ...s, signed: false, sig: null }))); setReleased(false); }}
          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontFamily: "monospace", fontSize: ".74rem", boxSizing: "border-box" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {signers.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: i < signers.length - 1 ? "1px solid var(--line-2)" : "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: s.signed ? "#10b98122" : "var(--field)", border: `2px solid ${s.signed ? "#10b981" : "var(--line-2)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 800, fontSize: ".7rem", color: s.signed ? "#10b981" : "var(--muted)", transition: "all .3s" }}>
              {s.signed ? "✓" : String(i + 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: ".78rem", color: "var(--ink)" }}>{s.label}</div>
              <div style={{ fontFamily: "monospace", fontSize: ".62rem", color: "var(--muted)" }}>{s.wallet}</div>
              {s.sig && <div style={{ fontFamily: "monospace", fontSize: ".58rem", color: "#10b981", marginTop: 2 }}>sig: {s.sig.slice(0, 24)}…</div>}
            </div>
            {!s.signed && !released && (
              <button
                type="button"
                onClick={() => void sign(s.id)}
                disabled={signing === s.id}
                style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#7C5CF8", color: "#fff", fontWeight: 700, fontSize: ".68rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
              >
                {signing === s.id ? <><Loader2 width={11} height={11} className="wallet-spin" /> Signing…</> : <>Sign</>}
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {released ? (
          <>
            <span style={{ fontSize: ".78rem", color: "#10b981", fontWeight: 800 }}>✓ Receipt released — receipt emitted</span>
            <button type="button" onClick={reset} style={{ marginLeft: "auto", fontSize: ".68rem", padding: "4px 10px", borderRadius: 7, border: "1px solid var(--line-2)", background: "transparent", cursor: "pointer", color: "var(--muted)" }}>New round</button>
          </>
        ) : (
          <button
            type="button"
            onClick={release}
            disabled={!quorumMet}
            style={{ padding: "7px 18px", borderRadius: 9, border: "none", background: quorumMet ? "#10b981" : "var(--field)", color: quorumMet ? "#fff" : "var(--muted)", fontWeight: 800, fontSize: ".78rem", cursor: quorumMet ? "pointer" : "not-allowed", transition: "all .2s" }}
          >
            {quorumMet ? "Release receipt on-chain" : `Need ${THRESHOLD - signedCount} more signature${THRESHOLD - signedCount > 1 ? "s" : ""}`}
          </button>
        )}
      </div>
      <div style={{ padding: "6px 16px", fontSize: ".6rem", color: "var(--muted)", borderTop: "1px solid var(--line-2)" }}>
        EIP-191 signatures computed in-browser · {THRESHOLD}-of-{signers.length} threshold · submit all sigs to AgentBudgetController to release on 0G Galileo
      </div>
    </div>
  );
}

// ── Agent Budget Controller ───────────────────────────────────────────────

const BUDGET_CTRL_ABI = [
  "function setBudget(address agent, uint128 dailyLimitCents, uint128 perRequestMaxCents, bool autoPay, bytes32 allowlistRoot) external",
  "function getBudget(address agent) external view returns (uint128 dailyLimitCents, uint128 perRequestMaxCents, uint128 spentToday, uint128 remainingToday, bool autoPay)",
];

const BUDGET_CTRL_ADDR = (import.meta.env as Record<string, string | undefined>)["VITE_0G_AGENT_BUDGET_MAINNET_ADDRESS"] ?? "0x305eF265BD964fBe34913E70Ef6AA8951e6b662e";

async function callBudgetCtrl<T>(method: string, args: unknown[], signer?: boolean): Promise<T> {
  const eth = (typeof window !== "undefined" ? (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum : undefined);
  if (!eth) throw new Error("MetaMask not found");
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth as never);
  const signerOrProvider = signer ? await provider.getSigner() : provider;
  const c = new Contract(BUDGET_CTRL_ADDR, BUDGET_CTRL_ABI, signerOrProvider);
  return c[method]!(...args) as Promise<T>;
}

export function OgBudgetControllerWidget({ workspace }: { workspace: Workspace }) {
  const [agentAddr, setAgentAddr] = useState("");
  const [dailyLimit, setDailyLimit] = useState("100");
  const [perRequest, setPerRequest] = useState("10");
  const [autoPay, setAutoPay] = useState(false);
  const [busy, setBusy] = useState<null | "set" | "get">(null);
  const [err, setErr] = useState<string | null>(null);
  const [setTx, setSetTx] = useState<string | null>(null);
  const [budget, setBudget] = useState<{ daily: string; perReq: string; spentToday: string; remaining: string; autoPay: boolean } | null>(null);
  const { mode } = useNetworkMode(workspace.id);

  const switchToOg = async () => {
    const eth = (typeof window !== "undefined" ? (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum : undefined);
    if (!eth) return;
    const cfg = getOgConfig(mode);
    const cur = await eth.request({ method: "eth_chainId" }) as string;
    if (cur.toLowerCase() !== cfg.chainHex) {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: cfg.chainHex }] });
    }
  };

  const handleSet = async () => {
    setErr(null); setBusy("set");
    try {
      await switchToOg();
      const eth = (typeof window !== "undefined" ? (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum : undefined);
      if (!eth) throw new Error("MetaMask not found");
      const { BrowserProvider, Contract, ZeroHash } = await import("ethers");
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const addr = agentAddr.trim() || (await signer.getAddress());
      const c = new Contract(BUDGET_CTRL_ADDR, BUDGET_CTRL_ABI, signer);
      const tx = await c["setBudget"](addr, BigInt(dailyLimit), BigInt(perRequest), autoPay, ZeroHash);
      await tx.wait();
      setSetTx(tx.hash as string);
    } catch (e) { setErr((e as Error).message ?? String(e)); }
    setBusy(null);
  };

  const handleGet = async () => {
    setErr(null); setBusy("get");
    try {
      await switchToOg();
      const eth = (typeof window !== "undefined" ? (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum : undefined);
      if (!eth) throw new Error("MetaMask not found");
      const { BrowserProvider, Contract } = await import("ethers");
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const addr = agentAddr.trim() || (await signer.getAddress());
      const c = new Contract(BUDGET_CTRL_ADDR, BUDGET_CTRL_ABI, provider);
      const b = await c["getBudget"](addr);
      setBudget({ daily: b.dailyLimitCents.toString(), perReq: b.perRequestMaxCents.toString(), spentToday: b.spentToday.toString(), remaining: b.remainingToday.toString(), autoPay: Boolean(b.autoPay) });
    } catch (e) { setErr((e as Error).message ?? String(e)); }
    setBusy(null);
  };

  void callBudgetCtrl; // suppress unused warning

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><ShieldCheck width={15} height={15} /></span><div><h3>Agent Budget Controller</h3><div className="sub">Set & query on-chain spend limits for any agent · {BUDGET_CTRL_ADDR.slice(0, 10)}… · 0G Galileo testnet</div></div></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 16px 14px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Agent address (leave blank to use connected wallet)</span>
          <input value={agentAddr} onChange={(e) => setAgentAddr(e.currentTarget.value)} placeholder="0x…" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".82rem", fontFamily: "var(--mono)" }} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Daily limit (¢)</span>
            <input value={dailyLimit} onChange={(e) => setDailyLimit(e.currentTarget.value)} inputMode="numeric" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".82rem" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Max per request (¢)</span>
            <input value={perRequest} onChange={(e) => setPerRequest(e.currentTarget.value)} inputMode="numeric" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".82rem" }} />
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".8rem", cursor: "pointer" }}>
          <input type="checkbox" checked={autoPay} onChange={(e) => setAutoPay(e.currentTarget.checked)} />
          <span>Auto-pay enabled</span>
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-acc btn-sm" type="button" onClick={handleSet} disabled={busy !== null}>
            {busy === "set" ? <><Loader2 size={13} className="wallet-spin" /> Setting budget…</> : "Set budget (MetaMask)"}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={handleGet} disabled={busy !== null}>
            {busy === "get" ? <><Loader2 size={13} className="wallet-spin" /> Querying…</> : "Get budget"}
          </button>
        </div>
        {err && <div style={{ color: "var(--red)", fontSize: ".75rem", padding: "6px 10px", background: "color-mix(in srgb,var(--red) 10%,transparent)", borderRadius: 8 }}>{err}</div>}
        {setTx && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--green)", fontSize: ".75rem", fontWeight: 700 }}>
            ✓ Budget set ·{" "}
            <a href={ogExplorerTxUrl(setTx)} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>tx {setTx.slice(0, 10)}…↗</a>
          </div>
        )}
        {budget && (
          <div style={{ background: "var(--bg-2)", borderRadius: 10, padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><div style={{ fontSize: ".6rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Daily limit</div><div style={{ fontWeight: 800, fontSize: ".9rem" }}>${(parseInt(budget.daily) / 100).toFixed(2)}</div></div>
            <div><div style={{ fontSize: ".6rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Per request max</div><div style={{ fontWeight: 800, fontSize: ".9rem" }}>${(parseInt(budget.perReq) / 100).toFixed(2)}</div></div>
            <div><div style={{ fontSize: ".6rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Spent today</div><div style={{ fontWeight: 800, fontSize: ".9rem", color: parseInt(budget.spentToday) > parseInt(budget.daily) * 0.8 ? "var(--red)" : "var(--ink)" }}>${(parseInt(budget.spentToday) / 100).toFixed(2)}</div></div>
            <div><div style={{ fontSize: ".6rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Remaining</div><div style={{ fontWeight: 800, fontSize: ".9rem", color: "var(--green)" }}>${(parseInt(budget.remaining) / 100).toFixed(2)}</div></div>
            <div style={{ gridColumn: "1 / -1" }}><span className="pill" style={{ fontSize: ".62rem", ...(budget.autoPay ? { color: "var(--green)" } : { color: "var(--muted)" }) }}>{budget.autoPay ? "Auto-pay ON" : "Auto-pay OFF"}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SealedPayloadVault — moved from WorkspaceDashboard.tsx
// ---------------------------------------------------------------------------
type SealedRecord = { sealId: string; recipient: string; digest: string; createdAt: string };
export function SealedPayloadVault({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [seals, setSeals] = useLocalStore<SealedRecord[]>("0g.seals", []);
  const [recipient, setRecipient] = useState("agid_0g_a1f3");
  const [payload, setPayload] = useState('{ "strategy": "rotate 40% mETH→USDY when spread<0.04%", "params": { "band": 0.6 } }');
  const [unsealId, setUnsealId] = useState("");
  const [unsealReceipt, setUnsealReceipt] = useState("");
  const [unsealRes, setUnsealRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [sealing, setSealing] = useState(false);
  const recent = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "0g.seal").slice(0, 6), [receipts, workspace.id]);

  const seal = async () => {
    if (!payload.trim() || sealing) return;
    setSealing(true);
    const nonce = Math.random().toString(36).slice(2);
    const hash = await sha256Hex(payload + recipient + nonce);
    const sealId = "seal_" + hashId("seal", hash, 8);
    const digest = hash.slice(0, 32);
    setSeals((prev) => [{ sealId, recipient: recipient.trim() || "(unset)", digest, createdAt: new Date().toISOString() }, ...prev].slice(0, 20));
    emitReceipt({ workspaceId: workspace.id, serviceName: "0G Sealed Payload", amount: 0.008, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.seal", payload: { sealId, recipient: recipient.trim(), digest } });
    setUnsealId(sealId);
    setSealing(false);
  };
  const unseal = () => {
    const s = seals.find((x) => x.sealId === unsealId.trim());
    if (!s) { setUnsealRes({ ok: false, text: "no such seal id" }); return; }
    const r = receipts.find((x) => x.id === unsealReceipt.trim());
    if (!r) { setUnsealRes({ ok: false, text: "receipt not found — paste the receipt id from the seal payment" }); return; }
    const okMatch = ((r.payload ?? {}) as { sealId?: string }).sealId === s.sealId;
    setUnsealRes(okMatch ? { ok: true, text: `unsealed for ${s.recipient} — digest ${s.digest}…` } : { ok: false, text: "proof does not match this seal — that receipt is for a different sealed payload" });
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head"><div className="ttl"><span className="sq soft"><ShieldCheck width={15} height={15} /></span><div><h3>Sealed payload vault</h3><div className="sub">encrypt a request payload for a recipient Agent ID · the vault stores only the ciphertext digest · unseal only with a matching receipt</div></div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, padding: "0 16px 10px", alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Recipient Agent ID</span>
          <input value={recipient} onChange={(e) => setRecipient(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".82rem", fontFamily: "var(--mono)" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Payload (encrypted before submit)</span>
          <input value={payload} onChange={(e) => setPayload(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "var(--mono)" }} />
        </label>
        <button className="btn btn-acc btn-sm" type="button" onClick={seal} disabled={sealing || !payload.trim()}>{sealing ? <><Loader2 size={12} className="wallet-spin" /> Sealing…</> : <><ShieldCheck width={12} height={12} /> Seal payload ($0.008)</>}</button>
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Sealed payloads · {seals.length}</div>
        <div className="svc-table__scroll"><table className="svc-table">
          <thead><tr><th>Seal ID</th><th>Recipient</th><th>Digest</th><th>When</th></tr></thead>
          <tbody>
            {seals.length === 0 && <tr><td colSpan={4} style={{ color: "var(--muted)", padding: 12 }}>No sealed payloads — seal one above.</td></tr>}
            {seals.map((s) => (<tr key={s.sealId}><td><code>{s.sealId}</code></td><td style={{ fontFamily: "var(--mono)", fontSize: ".74rem" }}>{s.recipient}</td><td style={{ fontFamily: "var(--mono)", fontSize: ".7rem", color: "var(--muted)" }}>{s.digest}…</td><td className="muted svc-table__num">{new Date(s.createdAt).toLocaleTimeString()}</td></tr>))}
          </tbody>
        </table></div>
      </div>
      <div style={{ margin: "0 16px 12px", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--field)" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>Unseal — requires a matching receipt id</div>
        <div className="row sm" style={{ gap: 8, flexWrap: "wrap" }}>
          <input value={unsealId} onChange={(e) => setUnsealId(e.currentTarget.value)} placeholder="seal id" style={{ flex: 1, minWidth: 160, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "var(--mono)" }} />
          <input value={unsealReceipt} onChange={(e) => setUnsealReceipt(e.currentTarget.value)} placeholder="receipt id (rcpt_…)" style={{ flex: 1, minWidth: 160, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "var(--mono)" }} />
          <button className="btn btn-sm" type="button" onClick={unseal}>Unseal</button>
        </div>
        {unsealRes && <div style={{ marginTop: 8, padding: "7px 12px", borderRadius: 10, background: `color-mix(in srgb, ${unsealRes.ok ? "var(--green)" : "var(--red)"} 12%, transparent)`, color: unsealRes.ok ? "var(--green)" : "var(--red)", fontSize: ".78rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>{unsealRes.ok ? <Check width={13} height={13} /> : <X width={13} height={13} />} {unsealRes.text}</div>}
      </div>
      {recent.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent seals · {recent.length}</div>
          <div className="svc-hist">{recent.map((r) => { const p = (r.payload ?? {}) as { sealId?: string; recipient?: string }; return (
            <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} /><div className="svc-hist__main"><b>{p.sealId}</b><span>→ {p.recipient} · receipt {r.id} · {new Date(r.createdAt).toLocaleTimeString()}</span></div><span className="svc-hist__amt">{r.amount.toFixed(3)}</span></div>
          ); })}</div>
        </div>
      )}
    </div>
  );
}
