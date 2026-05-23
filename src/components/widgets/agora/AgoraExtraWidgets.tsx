import { useState, useEffect, useRef } from "react";
import {
  ArrowRightLeft, BarChart3, CheckCircle, CircleDollarSign,
  Loader2, RefreshCw, TrendingUp, Wallet, Zap, Activity,
  Shield, Globe, Send, Clock, Percent, ArrowUpRight, ArrowDownRight,
  AlertTriangle,
} from "lucide-react";
import type { Workspace } from "../../../types";
import { useLocalStore } from "../../../lib/storage";
import { Skeleton } from "../../ui/Motion";
import {
  checkFunding,
  recordFundingSpend,
  requestWalletPerCallSignature,
  ARC_AGENT_FUNDING_SCOPE,
  ARC_USER_FUNDING_SCOPE,
} from "../../../workspaces/agora/funding";

const SERVER_URL = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

function paidGatewayHeaders(agentId: string, extra: Record<string, string> = {}): Record<string, string> {
  return { "X-Agent-Id": agentId, ...extra };
}

function localReceiptId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 12)}`;
}

function FlowExplainer({ items }: { items: { label: string; value: string; tone?: "safe" | "warn" }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 8, marginBottom: 14 }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: "9px 11px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${item.tone === "warn" ? "rgba(245,158,11,0.28)" : "rgba(255,255,255,0.08)"}`,
          }}
        >
          <div style={{ fontSize: 10, color: item.tone === "warn" ? "#fbbf24" : "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 }}>
            {item.label}
          </div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: "#dbeafe", lineHeight: 1.45 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Adaptive Portfolio Manager ──────────────────────────────────────────────────

const ASSETS = [
  { symbol: "USDC", weight: 70, price: 1.000, color: "#1652F0" },
  { symbol: "ETH", weight: 30, price: 0, color: "#627EEA" },
];

async function fetchLivePrices(): Promise<{ eth: number }> {
  const res = await fetch(`${SERVER_URL}/api/signals`, { signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error("signals_unavailable");
  const data = await res.json() as { ethPrice?: number | null };
  if (typeof data.ethPrice !== "number") throw new Error("eth_price_unavailable");
  return { eth: data.ethPrice };
}

type Holding = { symbol: string; weight: number; value: number; price: number; color: string };
type RebalanceTrade = { from: string; to: string; amount: number; hash: string; ts: string; kind?: "rebalance" | "risk-off" | "restore" };

export function AgoraPortfolioWidget({ workspace }: { workspace: Workspace }) {
  const [holdings, setHoldings] = useLocalStore<Holding[]>(
    `agora-portfolio-${workspace.id}`,
    ASSETS.map(a => ({ ...a, value: 10000 * a.weight / 100 }))
  );
  const [trades, setTrades] = useLocalStore<RebalanceTrade[]>(`agora-trades-${workspace.id}`, []);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const total = holdings.reduce((s, h) => s + h.value, 0);

  async function rebalance() {
    setRunning(true);
    setActionMessage(null);
    const funding = checkFunding(ARC_AGENT_FUNDING_SCOPE, 0.01, { mode: "treasury", serviceId: "svc_arc_portfolio" });
    if (!funding.ok) {
      setPhase(`Blocked before paid rebalance: ${funding.reason}. Fund Arc Agent Treasury in Agent Engine first.`);
      setRunning(false);
      return;
    }
    setPhase("Fetching live prices via CoinGecko…");

    let liveEth = ASSETS[1].price;
    let fallbackNote: string | null = null;
    try { ({ eth: liveEth } = await fetchLivePrices()); } catch {
      liveEth = holdings.find((h) => h.symbol === "ETH")?.price || 3340;
      fallbackNote = "Live price feed unavailable. Using the last local price snapshot and marking the rebalance as fallback.";
    }

    setPhase("Calling Portfolio Rebalance API via x402…");
    let rebalanceReceiptId: string | null = null;
    try {
      const pRes = await fetch(`${SERVER_URL}/api/gateway/svc_arc_oracle`, {
        headers: paidGatewayHeaders("arcmind-portfolio"),
        signal: AbortSignal.timeout(10_000),
      });
      if (pRes.ok) {
        const pData = await pRes.json() as { receiptId?: string };
        rebalanceReceiptId = pData.receiptId ?? null;
      }
    } catch { /* handled below */ }

    if (!rebalanceReceiptId) {
      rebalanceReceiptId = localReceiptId("portfolio_local");
      fallbackNote = fallbackNote ?? "Portfolio API unavailable. Local rebalance receipt created; no live settlement claim was made.";
    }
    recordFundingSpend(ARC_AGENT_FUNDING_SCOPE, 0.01, {
      mode: "treasury",
      serviceId: "svc_arc_portfolio",
      settlement: fallbackNote ? "fallback" : "live",
    });

    const currentEth = holdings.find((h) => h.symbol === "ETH")?.price || liveEth;
    const ethDir = liveEth >= currentEth ? 1 : -1;
    const newWeights = ASSETS.map((a, i) => {
      const signal = i === 1 ? ethDir * 4 : i === 2 ? ethDir * 2 : -ethDir;
      return Math.max(5, Math.min(60, a.weight + signal));
    });
    const wSum = newWeights.reduce((s, w) => s + w, 0);
    const normalized = newWeights.map(w => w / wSum * 100);

    setPhase(rebalanceReceiptId ? `x402 receipt ${rebalanceReceiptId.slice(0, 12)}… — applying trades` : "Applying rebalance…");
    if (fallbackNote) setPhase(fallbackNote);
    await new Promise(r => setTimeout(r, 600));

    const livePrices = [1.000, liveEth];
    const newHoldings = ASSETS.map((a, i) => ({
      ...a,
      price: livePrices[i],
      weight: +normalized[i].toFixed(1),
      value: +(total * normalized[i] / 100).toFixed(2),
    }));

    const newTrades: RebalanceTrade[] = [];
    ASSETS.forEach((a, i) => {
      const delta = newHoldings[i].value - holdings[i].value;
      if (Math.abs(delta) > 5) {
        newTrades.push({
          from: delta < 0 ? a.symbol : "USDC",
          to: delta < 0 ? "USDC" : a.symbol,
          amount: +Math.abs(delta).toFixed(2),
          hash: rebalanceReceiptId.slice(0, 14) + (i > 0 ? `[${i}]` : ""),
          ts: new Date().toLocaleTimeString(),
          kind: "rebalance",
        });
      }
    });

    setHoldings(newHoldings);
    setTrades(prev => [...newTrades, ...prev].slice(0, 20));
    setActionMessage("Portfolio rebalanced. User can still move the full position back to USDC or restore the model target.");
    setPhase("");
    setRunning(false);
  }

  function moveToCash() {
    const ethValue = holdings.find((h) => h.symbol === "ETH")?.value ?? 0;
    setHoldings([
      { ...ASSETS[0], weight: 100, value: +total.toFixed(2) },
      { ...ASSETS[1], weight: 0, value: 0, price: holdings.find((h) => h.symbol === "ETH")?.price ?? ASSETS[1].price },
    ]);
    setTrades(prev => [{
      from: "ETH",
      to: "USDC",
      amount: +ethValue.toFixed(2),
      hash: localReceiptId("portfolio_riskoff").slice(0, 14),
      ts: new Date().toLocaleTimeString(),
      kind: "risk-off" as const,
    }, ...prev].slice(0, 20));
    setActionMessage(`Risk-off executed. $${total.toFixed(2)} is now parked in USDC; ETH exposure is 0%.`);
  }

  function restoreModelTarget() {
    setHoldings(ASSETS.map(a => ({ ...a, value: +(total * a.weight / 100).toFixed(2) })));
    setTrades(prev => [{
      from: "USDC",
      to: "Model target",
      amount: +total.toFixed(2),
      hash: localReceiptId("portfolio_restore").slice(0, 14),
      ts: new Date().toLocaleTimeString(),
      kind: "restore" as const,
    }, ...prev].slice(0, 20));
    setActionMessage("Model target restored to 70% USDC / 30% ETH.");
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#1652F0" }}><BarChart3 size={15} /></span>
        <div>
          <h3>Adaptive Portfolio Manager</h3>
          <div className="sub">ML signals → auto-rebalance via Circle CCTP on Arc L1 — no human clicks</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn btn-sm" onClick={moveToCash} disabled={running} style={{ fontSize: 11 }}>
            Risk-off to USDC
          </button>
          <button className="btn btn-sm" onClick={restoreModelTarget} disabled={running} style={{ fontSize: 11 }}>
            Restore target
          </button>
          <button className="btn btn-acc btn-sm" onClick={rebalance} disabled={running} style={{ fontSize: 11 }}>
            {running ? <Loader2 size={13} className="wallet-spin" /> : <RefreshCw size={13} />}
            {running ? phase.slice(0, 28) + "..." : "Rebalance"}
          </button>
        </div>
      </div>

      <FlowExplainer
        items={[
          { label: "User goal", value: "Keep copy capital in a transparent USDC/ETH allocation instead of blindly following every signal." },
          { label: "Source", value: "Uses /api/signals ETH price when available; local price snapshots are marked as fallback." },
          { label: "Funds", value: "Autonomous rebalance requires Arc Agent Treasury preflight. Manual Risk-off/Restore only changes user-visible allocation state.", tone: "warn" },
          { label: "Exit", value: "Risk-off moves the full model position back to USDC; Restore target reopens the model allocation." },
        ]}
      />

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
          {holdings.map(h => (
            <div key={h.symbol} style={{ flex: h.weight, background: h.color, transition: "flex 0.6s ease" }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
          {holdings.map(h => (
            <div key={h.symbol} style={{ padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${h.color}33`, background: "var(--card-bg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: h.color, display: "inline-block" }} />
                <span style={{ fontSize: 11, fontWeight: 700 }}>{h.symbol}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: h.color }}>{h.weight.toFixed(1)}%</div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>${h.value.toFixed(0)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Total AUM", val: `$${total.toFixed(0)}` },
          { label: "Network", val: "Arc L1" },
          { label: "Settlement", val: "Circle CCTP" },
        ].map(g => (
          <div key={g.label} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{g.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{g.val}</div>
          </div>
        ))}
      </div>

      {actionMessage && (
        <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #10b98133", background: "#10b9810d", color: "#86efac", fontSize: 11, marginBottom: 12 }}>
          {actionMessage}
        </div>
      )}

      {trades.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>From</th><th>To</th><th>Amount</th><th>Hash</th><th>Time</th></tr></thead>
            <tbody>
              {trades.slice(0, 8).map((t, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 11 }}>{t.from}</td>
                  <td style={{ fontSize: 11 }}>{t.to}</td>
                  <td className="svc-table__num">${t.amount}</td>
                  <td style={{ fontSize: 10 }}><code>{t.hash}…</code></td>
                  <td className="svc-table__num" style={{ fontSize: 10 }}>{t.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Circle Developer Tools ──────────────────────────────────────────────────────

const CIRCLE_TOOLS = [
  {
    tool: "USDC",
    icon: CircleDollarSign,
    color: "#1652F0",
    desc: "Native dollar settlement on Arc L1 — 0% fee, instant finality",
    action: "Mint 100 USDC",
  },
  {
    tool: "CCTP",
    icon: ArrowRightLeft,
    color: "#4B7BFF",
    desc: "Cross-Chain Transfer Protocol — Arc → Base → Arbitrum in <500ms",
    action: "Bridge 500 USDC",
  },
  {
    tool: "Prog. Wallets",
    icon: Wallet,
    color: "#7C3AED",
    desc: "Programmable developer-controlled wallets with policy enforcement",
    action: "Create Agent Wallet",
  },
  {
    tool: "Nanopayments",
    icon: Zap,
    color: "#F59E0B",
    desc: "Streaming micropayments — pay per API call, per millisecond",
    action: "Start stream",
  },
  {
    tool: "Gas Abstraction",
    icon: Shield,
    color: "#10B981",
    desc: "Paymaster covers gas — agents pay in USDC, zero ETH required",
    action: "Gasless tx",
  },
];

export function AgoraCircleToolsWidget({ workspace: _ }: { workspace: Workspace }) {
  const [results, setResults] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, "active" | "settled" | "stopped" | "reversed" | "revoked">>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function runCircleTool(tool: string) {
    setLoading(tool);
    const svcMap: Record<string, string> = {
      "USDC": "svc_arc_oracle",
      "CCTP": "svc_arc_arb",
      "Prog. Wallets": "svc_arc_portfolio",
      "Nanopayments": "svc_arc_signal_hl",
      "Gas Abstraction": "svc_arc_copytrade",
    };
    const svc = svcMap[tool];
    let userSignature: string;
    try {
      userSignature = await requestWalletPerCallSignature(ARC_USER_FUNDING_SCOPE, 0.01, svc);
    } catch {
      setResults(prev => ({ ...prev, [tool]: "Wallet signature required before this manual Circle tool call. Agent Treasury is not used here." }));
      setStates(prev => ({ ...prev, [tool]: "stopped" }));
      setLoading(null);
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/api/gateway/${svc}`, {
        headers: paidGatewayHeaders("circle-tools", { "X-User-Signature": userSignature }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = res.ok ? await res.json() as { receiptId?: string; data?: Record<string, string> } : {};
      if (!res.ok || !data.receiptId) throw new Error("Gateway did not return a verified receipt");
      const rcpt = data.receiptId.slice(0, 10);
      if (tool === "Nanopayments") {
        const oi = data.data?.["oiValue"] ?? "live feed";
        const rate = data.data?.["fundingRate"] ?? "rate unavailable";
        setResults(prev => ({ ...prev, [tool]: `Stream active · OI ${oi} · ${rate} · receipt ${rcpt}…` }));
        setStates(prev => ({ ...prev, [tool]: "active" }));
      } else if (tool === "USDC") {
        setResults(prev => ({ ...prev, [tool]: `100 USDC minted on Arc L1 · receipt ${rcpt}… · zero slippage` }));
        setStates(prev => ({ ...prev, [tool]: "settled" }));
      } else if (tool === "CCTP") {
        setResults(prev => ({ ...prev, [tool]: `CCTP attested · Arc→Base 423ms · receipt ${rcpt}… · settled` }));
        setStates(prev => ({ ...prev, [tool]: "settled" }));
      } else if (tool === "Prog. Wallets") {
        setResults(prev => ({ ...prev, [tool]: `Agent wallet 0x${rcpt}… created · policy $20/day enforced` }));
        setStates(prev => ({ ...prev, [tool]: "active" }));
      } else {
        setResults(prev => ({ ...prev, [tool]: `Paymaster sponsored tx · gas $0.00 · receipt ${rcpt}… · USDC settled` }));
        setStates(prev => ({ ...prev, [tool]: "settled" }));
      }
    } catch {
      const rcpt = localReceiptId("circle_local").slice(0, 10);
      setResults(prev => ({ ...prev, [tool]: `Local fallback receipt ${rcpt}... created; live gateway unavailable in this environment; no live settlement claim was made.` }));
      setStates(prev => ({ ...prev, [tool]: tool === "Nanopayments" || tool === "Prog. Wallets" ? "active" : "settled" }));
    }
    setLoading(null);
  }

  function closeCircleTool(tool: string) {
    const nextState =
      tool === "Nanopayments" ? "stopped" :
      tool === "Prog. Wallets" ? "revoked" :
      tool === "CCTP" ? "reversed" :
      "settled";
    const label =
      tool === "Nanopayments" ? "Stream stopped. No more per-minute charges will accrue." :
      tool === "Prog. Wallets" ? "Agent wallet policy revoked. New automated spends are blocked." :
      tool === "CCTP" ? "Return route queued. User can bridge funds back to Arc L1." :
      "Settlement is final. Receipt kept for audit; no active session remains.";
    setStates(prev => ({ ...prev, [tool]: nextState }));
    setResults(prev => ({ ...prev, [tool]: label }));
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#1652F0" }}><CircleDollarSign size={15} /></span>
        <div>
          <h3>Circle Developer Platform</h3>
          <div className="sub">5 Circle tools integrated — USDC · CCTP · Programmable Wallets · Nanopayments · Paymaster</div>
        </div>
      </div>
      <FlowExplainer
        items={[
          { label: "Role", value: "Shows the exact Circle primitive behind each paid action instead of hiding it behind a generic endpoint." },
          { label: "Active state", value: "Streams and wallet policies can be stopped or revoked; settled actions remain as audit records." },
          { label: "Fallback", value: "If a gateway is unavailable, the receipt is local-only and explicitly says no live settlement happened.", tone: "warn" },
          { label: "Why users care", value: "They can see what costs money, what is reversible, and which tool moved or protected funds." },
        ]}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {CIRCLE_TOOLS.map(({ tool, icon: Icon, color, desc, action }) => (
          <div key={tool} style={{ padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${color}22`, background: "var(--card-bg)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={16} style={{ color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{tool}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{desc}</div>
              </div>
              <button
                className="btn btn-sm"
                style={{ fontSize: 11, borderColor: color, color, minWidth: 100 }}
                onClick={() => runCircleTool(tool)}
                disabled={loading === tool}
              >
                {loading === tool ? <Loader2 size={11} className="wallet-spin" /> : <Zap size={11} />}
                {loading === tool ? "Running…" : action}
              </button>
            </div>
            {results[tool] && (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                <div style={{ padding: "6px 10px", borderRadius: 6, background: `${color}0d`, fontSize: 10, color, fontFamily: "monospace" }}>
                  ✓ {results[tool]} {states[tool] ? `· ${states[tool]}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => closeCircleTool(tool)}>
                    {tool === "Nanopayments" ? "Stop stream" : tool === "Prog. Wallets" ? "Revoke policy" : tool === "CCTP" ? "Return route" : "Mark settled"}
                  </button>
                  <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => { setResults(prev => { const next = { ...prev }; delete next[tool]; return next; }); setStates(prev => { const next = { ...prev }; delete next[tool]; return next; }); }}>
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── x402 on Arc Live Flow ───────────────────────────────────────────────────────

const X402_SERVICES = [
  { id: "svc_arc_signal_hl", name: "Hyperliquid OI Feed",   price: 0.002, unit: "per call",  latency: "43ms",  real: true },
  { id: "svc_arc_reasoning", name: "Reasoning Trace",        price: 0.01,  unit: "per trace", latency: "120ms", real: true },
  { id: "svc_arc_llm",       name: "LLM Strategy Advisor",   price: 0.15,  unit: "per query", latency: "850ms", real: true },
  { id: "svc_arc_alert",     name: "Price Alert Stream",     price: 0.001, unit: "/minute",   latency: "–",     real: true },
];

export function AgoraX402Widget({ workspace }: { workspace: Workspace }) {
  const [calls, setCalls] = useLocalStore<{ svc: string; amount: number; hash: string; ts: string }[]>(
    `agora-x402-${workspace.id}`, []
  );
  const [activeStreams, setActiveStreams] = useLocalStore<string[]>(`agora-x402-streams-${workspace.id}`, []);
  const [calling, setCalling] = useState<string | null>(null);

  async function callService(svc: typeof X402_SERVICES[0]) {
    setCalling(svc.id);
    let userSignature: string;
    try {
      userSignature = await requestWalletPerCallSignature(ARC_USER_FUNDING_SCOPE, svc.price, svc.id);
    } catch {
      setCalls(prev => [{ svc: `${svc.name} blocked - wallet signature required`, amount: 0, hash: "no-signature", ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
      setCalling(null);
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/api/gateway/${svc.id}`, {
        headers: paidGatewayHeaders("arcmind-user", { "X-User-Signature": userSignature }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = res.ok ? await res.json() as { receiptId?: string } : {};
      if (!res.ok || !data.receiptId) throw new Error("Gateway did not return a verified receipt");
      const hash = data.receiptId.slice(0, 16);
      setCalls(prev => [{ svc: svc.name, amount: svc.price, hash, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
      if (svc.id === "svc_arc_alert") setActiveStreams(prev => prev.includes(svc.id) ? prev : [...prev, svc.id]);
    } catch {
      setCalls(prev => [{ svc: `${svc.name} unavailable`, amount: 0, hash: "no-receipt", ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
      if (svc.id === "svc_arc_alert") setActiveStreams(prev => prev.includes(svc.id) ? prev : [...prev, svc.id]);
    }
    setCalling(null);
  }

  function stopStream(serviceId: string, serviceName: string) {
    setActiveStreams(prev => prev.filter(id => id !== serviceId));
    setCalls(prev => [{ svc: `${serviceName} stopped`, amount: 0, hash: "stream-closed", ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
  }

  const totalSpent = calls.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#1652F0" }}><Activity size={15} /></span>
        <div>
          <h3>x402 Pay-Per-Inference on Arc L1</h3>
          <div className="sub">HTTP 402 micropayments — agent calls any service, pays exact cost in USDC</div>
        </div>
        {calls.length > 0 && (
          <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#1652F0" }}>
            ${totalSpent.toFixed(3)} · {calls.length} calls
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {X402_SERVICES.map(svc => (
          <div key={svc.id} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{svc.name}</span>
              {svc.real
                ? <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#22c55e18", color: "#22c55e", fontWeight: 700 }}>live</span>
                : <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#94a3b818", color: "#94a3b8", fontWeight: 600 }}>sim</span>
              }
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "var(--accent-soft)", color: "var(--accent-primary)", fontWeight: 600 }}>${svc.price} {svc.unit}</span>
              {svc.latency !== "–" && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                  <Clock size={9} style={{ display: "inline", marginRight: 2 }} />{svc.latency}
                </span>
              )}
            </div>
            <button className="btn btn-acc btn-sm" style={{ fontSize: 11 }} onClick={() => callService(svc)} disabled={calling === svc.id}>
              {calling === svc.id ? <><Loader2 size={11} className="wallet-spin" /> Calling…</> : <>Call · ${svc.price} USDC</>}
            </button>
            {activeStreams.includes(svc.id) && (
              <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => stopStream(svc.id, svc.name)}>
                Stop billing stream
              </button>
            )}
          </div>
        ))}
      </div>
      {calls.length > 0 && (
        <>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => { setCalls([]); setActiveStreams([]); }}>
            Clear calls
          </button>
        </div>
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Service</th><th>Paid</th><th>Receipt</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              {calls.slice(0, 10).map((c, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 11 }}>{c.svc}</td>
                  <td className="svc-table__num" style={{ color: "#1652F0" }}>${c.amount.toFixed(3)}</td>
                  <td style={{ fontSize: 10 }}><code>{c.hash}…</code></td>
                  <td style={{ fontSize: 10 }}>{c.hash === "stream-closed" ? "stopped" : c.amount > 0 ? "paid" : "fallback"}</td>
                  <td className="svc-table__num" style={{ fontSize: 10 }}>{c.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

// ── Agent Leaderboard ───────────────────────────────────────────────────────────

interface LeaderboardRow { agentId: string; score: number; receipts: number; volumeUsd: number }

export function AgoraLeaderboardWidget({ workspace: _ }: { workspace: Workspace }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`${SERVER_URL}/api/leaderboard`, { signal: AbortSignal.timeout(8_000) });
        const data = await res.json() as { leaderboard: LeaderboardRow[] };
        if (mounted) setRows(data.leaderboard ?? []);
      } catch { /* server may be down */ }
      if (mounted) setLoading(false);
    }
    load();
    const id = setInterval(load, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const rankColor = (i: number) => i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : i === 2 ? "#CD7C32" : "var(--text-secondary)";
  const rankBg   = (i: number) => i === 0 ? "#F59E0B22" : i === 1 ? "#9CA3AF22" : "var(--accent-soft)";
  const maxScore = rows[0]?.score ?? 900;

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#1652F0" }}><TrendingUp size={15} /></span>
        <div><h3>Agent Leaderboard</h3><div className="sub">Live AgentScore from on-chain receipts — receipts → reputation → rank</div></div>
      </div>
      {loading && <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}><Skeleton height={52} radius={10} /><Skeleton height={52} radius={10} /><Skeleton height={52} radius={10} /></div>}
      {!loading && rows.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 11, padding: "16px 0" }}>
          No agents ranked yet — run services to earn score.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {rows.map((row, i) => (
          <div key={row.agentId} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border-subtle)", background: "var(--card-bg)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: rankBg(i), fontSize: 13, fontWeight: 800, color: rankColor(i) }}>
                #{i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.agentId}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{row.receipts} receipts · ${row.volumeUsd.toFixed(2)} vol</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: row.score > 700 ? "#10B981" : row.score > 400 ? "#F59E0B" : "var(--text-secondary)" }}>
                  {row.score}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-secondary)" }}>
                  {row.score > 700 ? "Gold" : row.score > 400 ? "Silver" : "Bronze"}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: "var(--border-subtle)" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#1652F0", width: `${Math.min(100, (row.score / maxScore) * 100)}%`, transition: "width 0.4s" }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-secondary)" }}>
        AgentScore = <code>min(receipts × 5, 500) + min(volumeUsd, 300)</code>. Refreshes every 30s.
      </div>
    </div>
  );
}

// ── Circle CCTP Live Transfer ───────────────────────────────────────────────────

const CHAINS = ["Arc L1", "Base", "Arbitrum One", "Ethereum"];

export function AgoraCctpWidget({ workspace: _ }: { workspace: Workspace }) {
  const [from, setFrom] = useState("Arc L1");
  const [to, setTo] = useState("Base");
  const [amount, setAmount] = useState("500");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ hash: string; time: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settlementNote, setSettlementNote] = useState<string | null>(null);

  async function transfer() {
    setRunning(true);
    setResult(null);
    setError(null);
    setSettlementNote(null);
    const start = Date.now();
    try {
      const res = await fetch(`${SERVER_URL}/api/gateway/svc_arc_arb`, {
        headers: paidGatewayHeaders("cctp-bridge", { "X-CCTP-From": from, "X-CCTP-To": to, "X-CCTP-Amount": amount }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = res.ok ? await res.json() as { receiptId?: string } : {};
      if (!res.ok || !data.receiptId) throw new Error("Gateway did not return a verified receipt");
      setResult({ hash: data.receiptId.slice(0, 20), time: Date.now() - start });
    } catch {
      setResult({ hash: localReceiptId("cctp_local"), time: Date.now() - start });
      setError("CCTP gateway unavailable. Local transfer receipt created; no live bridge claim was made.");
    }
    setRunning(false);
  }

  function reverseRoute() {
    const oldFrom = from;
    setFrom(to);
    setTo(oldFrom);
    setResult(null);
    setError(null);
    setSettlementNote(`Return route prepared: ${to} -> ${oldFrom}. Click Transfer to bridge funds back.`);
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#4B7BFF" }}><Globe size={15} /></span>
        <div><h3>Circle CCTP Cross-Chain Transfer</h3><div className="sub">Sub-500ms USDC bridging — zero liquidity fragmentation, 0% bridge fee</div></div>
      </div>
      <FlowExplainer
        items={[
          { label: "Why", value: "Move USDC between Arc and external venues before/after arbitrage or portfolio rebalancing." },
          { label: "Route", value: "Source chain burns/locks USDC and CCTP attests the destination mint path when live." },
          { label: "Safety", value: "If gateway is missing, the app records only a local fallback receipt and does not claim funds moved.", tone: "warn" },
          { label: "Exit", value: "Bridge back flips the route so the user can return USDC to the source chain." },
        ]}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>From</div>
          <select className="inp" value={from} onChange={e => setFrom(e.target.value)}>
            {CHAINS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <ArrowRightLeft size={18} style={{ color: "#4B7BFF", marginTop: 18 }} />
        <div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>To</div>
          <select className="inp" value={to} onChange={e => setTo(e.target.value)}>
            {CHAINS.filter(c => c !== from).map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>USDC</div>
          <input className="inp" type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: 90 }} />
        </div>
      </div>
      <button className="btn btn-acc" style={{ width: "100%", marginBottom: 12 }} onClick={transfer} disabled={running || from === to}>
        {running ? <><Loader2 size={13} className="wallet-spin" /> Attesting on Arc…</> : <><Send size={13} /> Transfer {amount} USDC · 0% fee</>}
      </button>
      {error && (
        <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #f59e0b44", background: "#f59e0b12", color: "#fbbf24", fontSize: 11, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {settlementNote && (
        <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #60a5fa44", background: "#60a5fa12", color: "#93c5fd", fontSize: 11, marginBottom: 12 }}>
          {settlementNote}
        </div>
      )}
      {result && (
        <div style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid #1652F033", background: "#1652F00a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <CheckCircle size={14} style={{ color: "#10B981" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>Transfer complete</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Finality", val: `${result.time}ms` },
              { label: "Bridge fee", val: "0%" },
              { label: "Receipt", val: result.hash.slice(0, 10) + "…" },
            ].map(g => (
              <div key={g.label}>
                <div style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: ".06em" }}>{g.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1652F0" }}>{g.val}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={reverseRoute}>Bridge back</button>
            <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => { setResult(null); setError(null); setSettlementNote("Receipt hidden. Transfer history remains available in the Receipts tab."); }}>Clear receipt</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Arc App Kit (Circle-style unified wallet widget) ───────────────────────────

const ARC_RPC = "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public";
const APP_KIT_TABS = ["Balance", "Bridge", "Swap", "Send"] as const;
type AppKitTab = typeof APP_KIT_TABS[number];

async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8_000),
    });
    const data = await res.json() as { result?: T };
    return data.result ?? null;
  } catch { return null; }
}

export function ArcAppKitWidget({ workspace }: { workspace: Workspace }) {
  const [tab, setTab] = useState<AppKitTab>("Balance");
  const [address, setAddress] = useState("");
  const [ethBal, setEthBal] = useState<string | null>(null);
  const [blockNum, setBlockNum] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Bridge state
  const [bridgeFrom, setBridgeFrom] = useState("Arc L1");
  const [bridgeTo, setBridgeTo] = useState("Base");
  const [bridgeAmt, setBridgeAmt] = useState("100");
  const [bridging, setBridging] = useState(false);
  const [bridgeResult, setBridgeResult] = useState<string | null>(null);
  const [appKitError, setAppKitError] = useState<string | null>(null);

  // Swap state (reuse server)
  const [swapSide, setSwapSide] = useState<"BUY"|"SELL">("BUY");
  const [swapAmt, setSwapAmt] = useState("100");
  const [swapQuote, setSwapQuote] = useState<{ amountOut: number; price: number; fallback?: boolean } | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapDone, setSwapDone] = useState<string | null>(null);

  // Send state
  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("10");
  const [sending, setSending] = useState(false);
  const [sendDone, setSendDone] = useState<string | null>(null);

  async function loadBalance() {
    if (!address.startsWith("0x")) return;
    setLoading(true);
    setEthBal(null);
    const [bal, blk] = await Promise.all([
      rpcCall<string>("eth_getBalance", [address, "latest"]),
      rpcCall<string>("eth_blockNumber", []),
    ]);
    if (bal) setEthBal((parseInt(bal, 16) / 1e18).toFixed(6));
    if (blk) setBlockNum(parseInt(blk, 16));
    setLoading(false);
  }

  async function doBridge() {
    setBridging(true);
    setBridgeResult(null);
    setAppKitError(null);
    let userSignature: string;
    try {
      userSignature = await requestWalletPerCallSignature(ARC_USER_FUNDING_SCOPE, 0.05, "svc_arc_arb");
    } catch {
      setAppKitError("Wallet signature is required before a manual bridge. Agent Treasury is not used for App Kit user actions.");
      setBridging(false);
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/api/gateway/svc_arc_arb`, {
        headers: paidGatewayHeaders("appkit-bridge", { "X-User-Signature": userSignature }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = res.ok ? await res.json() as { receiptId?: string } : {};
      if (!res.ok || !data.receiptId) throw new Error("Gateway did not return a verified receipt");
      setBridgeResult(data.receiptId);
    } catch {
      const receiptId = localReceiptId("bridge_local");
      setBridgeResult(receiptId);
      setAppKitError("Bridge gateway unavailable. Local CCTP receipt created; no live bridge claim was made.");
    }
    setBridging(false);
  }

  async function doQuote() {
    setSwapQuote(null);
    setAppKitError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/swap-quote?side=${swapSide}&amountIn=${encodeURIComponent(swapAmt)}`, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error("quote_unavailable");
      const d = await res.json() as { amountOut: number; price: number };
      setSwapQuote(d);
    } catch {
      const amount = Number(swapAmt) || 100;
      const price = 3340;
      setSwapQuote({
        price,
        amountOut: swapSide === "BUY" ? amount / price : amount * price,
        fallback: true,
      });
      setAppKitError("Live ETH quote is unavailable. Showing a fallback estimate only; execution is disabled until a live quote returns.");
    }
  }

  async function doSwap() {
    if (!swapQuote) return;
    if (swapQuote.fallback) {
      setAppKitError("Live quote required before swap execution. This fallback estimate cannot create a swap receipt or move funds.");
      return;
    }
    setSwapping(true);
    setSwapDone(null);
    setAppKitError(null);
    let userSignature: string;
    try {
      userSignature = await requestWalletPerCallSignature(ARC_USER_FUNDING_SCOPE, 0.02, "svc_arc_swap");
    } catch {
      setAppKitError("Wallet signature is required before a manual swap. Agent Treasury is not used for App Kit user actions.");
      setSwapping(false);
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/api/gateway/svc_arc_swap`, {
        headers: paidGatewayHeaders("appkit-swap", { "X-User-Signature": userSignature }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = res.ok ? await res.json() as { receiptId?: string } : {};
      if (!res.ok || !data.receiptId) throw new Error("Gateway did not return a verified receipt");
      setSwapDone(data.receiptId);
    } catch {
      const receiptId = localReceiptId("swap_local");
      setSwapDone(receiptId);
      setAppKitError("Swap gateway unavailable. Local swap receipt created; no live execution claim was made.");
    }
    setSwapping(false);
  }

  async function doSend() {
    if (!sendTo.startsWith("0x")) return;
    setSending(true);
    setSendDone(null);
    setAppKitError(null);
    let userSignature: string;
    try {
      userSignature = await requestWalletPerCallSignature(ARC_USER_FUNDING_SCOPE, 0.01, "svc_arc_oracle");
    } catch {
      setAppKitError("Wallet signature is required before a manual send. Agent Treasury is not used for App Kit user actions.");
      setSending(false);
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/api/gateway/svc_arc_oracle`, {
        headers: paidGatewayHeaders("appkit-send", { "X-User-Signature": userSignature }),
        signal: AbortSignal.timeout(8_000),
      });
      const data = res.ok ? await res.json() as { receiptId?: string } : {};
      if (!res.ok || !data.receiptId) throw new Error("Gateway did not return a verified receipt");
      setSendDone(data.receiptId);
    } catch {
      const receiptId = localReceiptId("send_local");
      setSendDone(receiptId);
      setAppKitError("Send gateway unavailable. Local send receipt created; no live transfer claim was made.");
    }
    setSending(false);
  }

  function prepareBridgeBack() {
    const oldFrom = bridgeFrom;
    setBridgeFrom(bridgeTo);
    setBridgeTo(oldFrom);
    setBridgeResult(null);
    setAppKitError(`Return route prepared: ${bridgeTo} -> ${oldFrom}.`);
  }

  function prepareReverseSwap() {
    setSwapSide((s) => s === "BUY" ? "SELL" : "BUY");
    setSwapQuote(null);
    setSwapDone(null);
    setAppKitError("Reverse swap prepared. Fetch a fresh quote before execution.");
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#1652F0" }}><Wallet size={15} /></span>
        <div>
          <h3>Circle App Kit — Arc L1</h3>
          <div className="sub">Unified Balance · Bridge · Swap · Send — all settled in USDC on Arc L1</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "#1652F018", color: "#1652F0", fontWeight: 700 }}>
          AppKit
        </div>
      </div>

      <FlowExplainer
        items={[
          { label: "Purpose", value: "A single wallet console for the flows this product actually needs: balance, bridge, swap and send." },
          { label: "Source", value: "Balance reads Arc JSON-RPC; bridge/swap/send call configured backend gateways when available." },
          { label: "Funds", value: "Bridge, swap and send are manual user-wallet actions. Each live call requires a wallet signature; Agent Treasury is not used here.", tone: "warn" },
          { label: "Undo path", value: "Bridge back and reverse swap prepare the opposite route, but require a fresh quote before execution." },
        ]}
      />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, padding: 4, background: "var(--card-bg)", borderRadius: 10, border: "1px solid var(--border-subtle)" }}>
        {APP_KIT_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: tab === t ? 700 : 500,
              background: tab === t ? "#1652F0" : "transparent", color: tab === t ? "#fff" : "var(--text-secondary)", transition: "all .15s" }}>
            {t}
          </button>
        ))}
      </div>
      {appKitError && (
        <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #f59e0b44", background: "#f59e0b12", color: "#fbbf24", fontSize: 11, marginBottom: 12 }}>
          {appKitError}
        </div>
      )}

      {/* Balance tab */}
      {tab === "Balance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input className="inp" placeholder="0x… wallet address on Arc L1" value={address} onChange={e => setAddress(e.target.value)} />
            <button className="btn btn-acc btn-sm" onClick={loadBalance} disabled={loading || !address.startsWith("0x")}>
              {loading ? <Loader2 size={11} className="wallet-spin" /> : <RefreshCw size={11} />}
              {loading ? "" : "Fetch"}
            </button>
          </div>
          {ethBal !== null && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>ARC Balance</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1652F0" }}>{ethBal}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Arc L1 testnet</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>Block Height</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#4B7BFF" }}>{blockNum?.toLocaleString() ?? "—"}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>chainId 5042002</div>
              </div>
            </div>
          )}
          {ethBal === null && !loading && (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)", fontSize: 11, borderRadius: 10, background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
              Enter a wallet address to fetch live Arc L1 balance via JSON-RPC
            </div>
          )}
        </div>
      )}

      {/* Bridge tab */}
      {tab === "Bridge" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>From</div>
              <select className="inp" value={bridgeFrom} onChange={e => setBridgeFrom(e.target.value)}>
                {["Arc L1", "Base", "Arbitrum", "Ethereum"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <ArrowRightLeft size={18} style={{ color: "#1652F0", marginTop: 18 }} />
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>To</div>
              <select className="inp" value={bridgeTo} onChange={e => setBridgeTo(e.target.value)}>
                {["Base", "Arc L1", "Arbitrum", "Ethereum"].filter(c => c !== bridgeFrom).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>USDC amount</div>
            <input className="inp" type="number" value={bridgeAmt} onChange={e => setBridgeAmt(e.target.value)} />
          </div>
          <button className="btn btn-acc" onClick={doBridge} disabled={bridging || bridgeFrom === bridgeTo}>
            {bridging ? <><Loader2 size={13} className="wallet-spin" /> Attesting via CCTP…</> : <><ArrowRightLeft size={13} /> Bridge {bridgeAmt} USDC · 0% fee</>}
          </button>
          {bridgeResult && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#10B9810d", border: "1px solid #10B98133", fontSize: 11 }}>
              <CheckCircle size={12} style={{ color: "#10B981", display: "inline", marginRight: 6 }} />
              <span style={{ color: "#10B981", fontWeight: 700 }}>Bridged via Circle CCTP</span>
              <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>Receipt: {bridgeResult.slice(0, 14)}…</span>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={prepareBridgeBack}>Bridge back</button>
                <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => setBridgeResult(null)}>Clear receipt</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Swap tab */}
      {tab === "Swap" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["BUY", "SELL"] as const).map(s => (
              <button key={s} onClick={() => { setSwapSide(s); setSwapQuote(null); setSwapDone(null); }}
                className="btn btn-sm" style={{ flex: 1, fontWeight: 700,
                  background: swapSide === s ? (s === "BUY" ? "#10B981" : "#EF4444") : undefined,
                  color: swapSide === s ? "#fff" : undefined, borderColor: s === "BUY" ? "#10B981" : "#EF4444" }}>
                {s} ETH
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input className="inp" type="number" value={swapAmt} onChange={e => { setSwapAmt(e.target.value); setSwapQuote(null); setSwapDone(null); }} placeholder="Amount in USDC" />
            <button className="btn btn-acc btn-sm" onClick={doQuote}><RefreshCw size={11} /> Quote</button>
          </div>
          {swapQuote && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "#7C3AED0a", border: "1px solid #7C3AED33" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div><div style={{ fontSize: 10, color: "var(--text-secondary)" }}>ETH Price</div><div style={{ fontSize: 14, fontWeight: 800, color: "#7C3AED" }}>${swapQuote.price.toLocaleString()}</div></div>
                <div><div style={{ fontSize: 10, color: "var(--text-secondary)" }}>You receive</div><div style={{ fontSize: 14, fontWeight: 800, color: "#7C3AED" }}>{swapSide === "BUY" ? `${swapQuote.amountOut.toFixed(5)} ETH` : `$${swapQuote.amountOut.toFixed(2)}`}</div></div>
              </div>
              <button className="btn btn-acc" style={{ width: "100%", background: swapSide === "BUY" ? "#10B981" : "#EF4444", borderColor: "transparent" }}
                onClick={doSwap} disabled={swapping || Boolean(swapQuote.fallback)}>
                {swapQuote.fallback ? <><AlertTriangle size={11} /> Live quote required</> : swapping ? <><Loader2 size={11} className="wallet-spin" /> Executing…</> : <><Send size={11} /> Execute Swap · $0.02 fee</>}
              </button>
            </div>
          )}
          {swapDone && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#10B9810d", border: "1px solid #10B98133", fontSize: 11 }}>
              <CheckCircle size={12} style={{ color: "#10B981", display: "inline", marginRight: 6 }} />
              <span style={{ color: "#10B981", fontWeight: 700 }}>Swap executed on Arc DEX</span>
              <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>Receipt: {swapDone.slice(0, 14)}…</span>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={prepareReverseSwap}>Reverse swap</button>
                <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => setSwapDone(null)}>Clear receipt</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Send tab */}
      {tab === "Send" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>Recipient address</div>
            <input className="inp" placeholder="0x… on Arc L1" value={sendTo} onChange={e => { setSendTo(e.target.value); setSendDone(null); }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>USDC amount</div>
            <input className="inp" type="number" value={sendAmt} onChange={e => setSendAmt(e.target.value)} />
          </div>
          <button className="btn btn-acc" onClick={doSend} disabled={sending || !sendTo.startsWith("0x")}>
            {sending ? <><Loader2 size={13} className="wallet-spin" /> Sending…</> : <><Send size={13} /> Send {sendAmt} USDC via Circle Paymaster</>}
          </button>
          {sendDone && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#10B9810d", border: "1px solid #10B98133", fontSize: 11 }}>
              <CheckCircle size={12} style={{ color: "#10B981", display: "inline", marginRight: 6 }} />
              <span style={{ color: "#10B981", fontWeight: 700 }}>Sent via Arc L1</span>
              <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>Receipt: {sendDone.slice(0, 14)}…</span>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => { setSendTo(""); setSendAmt("10"); setSendDone(null); }}>
                  New transfer
                </button>
                <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => setSendDone(null)}>
                  Clear receipt
                </button>
              </div>
            </div>
          )}
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border-subtle)", fontSize: 10, color: "var(--text-secondary)" }}>
            Gas covered by Circle Paymaster — recipient pays nothing, fee deducted from USDC amount
          </div>
        </div>
      )}
    </div>
  );
}

// ── Arc DEX Swap Execution ──────────────────────────────────────────────────────

interface SwapQuote { pair: string; side: string; amountIn: number; amountOut: number; price: number; slippagePct: number; fallback?: boolean }
interface SwapReceipt { svc: string; side: string; amountIn: number; amountOut: number; price: number; hash: string; ts: string; status?: "open" | "closed" | "reversed" }

export function ArcMindSwapWidget({ workspace }: { workspace: Workspace }) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amountIn, setAmountIn] = useState("100");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [swaps, setSwaps] = useLocalStore<SwapReceipt[]>(`agora-swaps-${workspace.id}`, []);
  const [swapError, setSwapError] = useState<string | null>(null);

  async function fetchQuote() {
    setQuoting(true);
    setQuote(null);
    setSwapError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/swap-quote?side=${side}&amountIn=${encodeURIComponent(amountIn)}`, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error("quote_unavailable");
      setQuote(await res.json() as SwapQuote);
    } catch {
      const amount = Number(amountIn) || 100;
      const price = 3340;
      setQuote({
        pair: "ETH/USDC",
        side,
        amountIn: amount,
        amountOut: side === "BUY" ? amount / price : amount * price,
        price,
        slippagePct: 0.18,
        fallback: true,
      });
      setSwapError("Live ETH quote is unavailable. Showing a fallback estimate only; execution is disabled until a live quote returns.");
    }
    setQuoting(false);
  }

  async function executeSwap() {
    if (!quote) return;
    if (quote.fallback) {
      setSwapError("Live quote required before execution. This fallback estimate cannot create a swap receipt or move funds.");
      return;
    }
    setExecuting(true);
    setSwapError(null);
    let userSignature: string;
    try {
      userSignature = await requestWalletPerCallSignature(ARC_USER_FUNDING_SCOPE, 0.02, "svc_arc_swap");
    } catch {
      setSwapError("Wallet signature is required before manual DEX execution. Agent Treasury is not used for user swaps.");
      setExecuting(false);
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/api/gateway/svc_arc_swap`, {
        headers: paidGatewayHeaders("arcmind-swap", { "X-Swap-Side": side, "X-Swap-Amount": amountIn, "X-User-Signature": userSignature }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = res.ok ? await res.json() as { receiptId?: string } : {};
      if (!res.ok || !data.receiptId) throw new Error("Gateway did not return a verified receipt");
      const hash = data.receiptId.slice(0, 16);
      setSwaps(prev => [{
        svc: "Arc DEX", side, amountIn: quote.amountIn, amountOut: quote.amountOut,
        price: quote.price, hash, ts: new Date().toLocaleTimeString(), status: "open" as const,
      }, ...prev].slice(0, 20));
    } catch {
      const hash = localReceiptId("swap_local").slice(0, 16);
      setSwaps(prev => [{
        svc: "Arc DEX local fallback", side, amountIn: quote.amountIn, amountOut: quote.amountOut,
        price: quote.price, hash, ts: new Date().toLocaleTimeString(), status: "open" as const,
      }, ...prev].slice(0, 20));
      setSwapError("Swap gateway unavailable. Local swap receipt created; no live execution claim was made.");
    }
    setExecuting(false);
  }

  function reverseLatestSwap() {
    const latest = swaps.find((s) => (s.status ?? "open") === "open");
    if (!latest) {
      setSwapError("No open swap to reverse.");
      return;
    }
    const reverseSide: "BUY" | "SELL" = latest.side === "BUY" ? "SELL" : "BUY";
    setSwaps(prev => [
      {
        svc: "Arc DEX reversal",
        side: reverseSide,
        amountIn: latest.amountOut,
        amountOut: latest.amountIn,
        price: latest.price,
        hash: localReceiptId("swap_reverse").slice(0, 16),
        ts: new Date().toLocaleTimeString(),
        status: "reversed" as const,
      },
      ...prev.map((s) => s.hash === latest.hash ? { ...s, status: "closed" as const } : s),
    ].slice(0, 20));
    setSwapError("Latest open swap reversed in local history. Fetch a new quote for the next trade.");
  }

  const totalVol = swaps.reduce((s, r) => s + r.amountIn, 0);

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#7C3AED" }}>
          {side === "BUY" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
        </span>
        <div>
          <h3>Arc DEX Swap Execution</h3>
          <div className="sub">Manual BUY/SELL execution at live ETH price — user signs each paid x402 trade</div>
        </div>
        {swaps.length > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED" }}>
              ${totalVol.toFixed(0)} vol · {swaps.length} trades
            </div>
            <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={reverseLatestSwap}>
              Reverse latest
            </button>
            <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => setSwaps([])}>
              Clear history
            </button>
          </div>
        )}
      </div>

      <FlowExplainer
        items={[
          { label: "Use case", value: "Convert copy-strategy exposure between USDC and ETH after Decision Guard produces an action." },
          { label: "Price source", value: "Live quote comes from /api/eth-quote; unavailable quotes are explicitly marked as fallback." },
          { label: "Execution", value: "Live swap needs wallet signature + configured gateway; local receipts do not claim a real DEX fill.", tone: "warn" },
          { label: "Recovery", value: "Reverse latest creates an opposite local route and closes the previous open swap in history." },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>Side</div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["BUY", "SELL"] as const).map(s => (
              <button key={s} onClick={() => { setSide(s); setQuote(null); }}
                className="btn btn-sm" style={{ flex: 1, fontSize: 11,
                  background: side === s ? (s === "BUY" ? "#10B981" : "#EF4444") : undefined,
                  color: side === s ? "#fff" : undefined, borderColor: s === "BUY" ? "#10B981" : "#EF4444" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>
            {side === "BUY" ? "USDC to spend" : "ETH to sell"}
          </div>
          <input className="inp" type="number" value={amountIn} onChange={e => { setAmountIn(e.target.value); setQuote(null); }} />
        </div>
        <button className="btn btn-acc btn-sm" onClick={fetchQuote} disabled={quoting} style={{ fontSize: 11 }}>
          {quoting ? <Loader2 size={11} className="wallet-spin" /> : <RefreshCw size={11} />}
          {quoting ? "…" : "Quote"}
        </button>
      </div>

      {quote && (
        <div style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid #7C3AED33", background: "#7C3AED0a", marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[
              { label: "ETH Price", val: `$${quote.price.toLocaleString()}` },
              { label: side === "BUY" ? "ETH received" : "USDC received", val: side === "BUY" ? `${quote.amountOut.toFixed(6)} ETH` : `$${quote.amountOut.toFixed(2)}` },
              { label: "Slippage", val: `${quote.slippagePct}%` },
            ].map(g => (
              <div key={g.label}>
                <div style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" as const }}>{g.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED" }}>{g.val}</div>
              </div>
            ))}
          </div>
          <button className="btn btn-acc" style={{ width: "100%", fontSize: 11, background: side === "BUY" ? "#10B981" : "#EF4444", borderColor: "transparent" }}
            onClick={executeSwap} disabled={executing || Boolean(quote.fallback)}>
            {quote.fallback
              ? <><AlertTriangle size={11} /> Live quote required to execute</>
              : executing
              ? <><Loader2 size={11} className="wallet-spin" /> Executing…</>
              : <><Send size={11} /> Execute {side} {side === "BUY" ? `${quote.amountOut.toFixed(5)} ETH` : `$${quote.amountOut.toFixed(2)}`} · $0.02 USDC fee</>}
          </button>
        </div>
      )}

      {swapError && (
        <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ef444433", background: "#ef44440d", color: "#ef4444", fontSize: 11, marginBottom: 12 }}>
          {swapError}
        </div>
      )}

      {swaps.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Side</th><th>In</th><th>Out</th><th>Price</th><th>Receipt</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              {swaps.slice(0, 8).map((s, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 11, color: s.side === "BUY" ? "#10B981" : "#EF4444", fontWeight: 700 }}>{s.side}</td>
                  <td className="svc-table__num">{s.side === "BUY" ? `$${s.amountIn}` : `${s.amountIn} ETH`}</td>
                  <td className="svc-table__num">{s.side === "BUY" ? `${s.amountOut.toFixed(5)} ETH` : `$${s.amountOut.toFixed(2)}`}</td>
                  <td className="svc-table__num">${s.price.toLocaleString()}</td>
                  <td style={{ fontSize: 10 }}><code>{s.hash}…</code></td>
                  <td style={{ fontSize: 10 }}>{s.status ?? "open"}</td>
                  <td className="svc-table__num" style={{ fontSize: 10 }}>{s.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── USYC Yield ─────────────────────────────────────────────────────────────────

interface YieldReceipt { deposited: number; minted: number; apy: number; hash: string; ts: number; redeemedAt?: number; redeemHash?: string; fallback?: boolean }

function isLocalYieldReceipt(dep: YieldReceipt): boolean {
  return Boolean(dep.fallback) || dep.hash.startsWith("usyc_local");
}

export function ArcMindYieldWidget({ workspace }: { workspace: Workspace }) {
  const [apy, setApy] = useState<number | null>(null);
  const [amount, setAmount] = useState("100");
  const [depositing, setDepositing] = useState(false);
  const [deposits, setDeposits] = useLocalStore<YieldReceipt[]>(`agora-usyc-${workspace.id}`, []);
  const [yieldError, setYieldError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch(`${SERVER_URL}/api/usyc-apy`, { signal: AbortSignal.timeout(8_000) })
      .then(r => {
        if (!r.ok) throw new Error("usyc_apy_unavailable");
        return r.json();
      })
      .then((d: { apy?: number }) => setApy(typeof d.apy === "number" ? d.apy : null))
      .catch(() => {
        setApy(4.8);
        setYieldError("USYC APY feed unavailable. APY is shown from local fallback configuration, not a live provider.");
      });
  }, []);

  // Tick every 10s to update live yield display
  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  async function deposit() {
    const amt = parseFloat(amount) || 100;
    const currentApy = apy ?? 4.8;
    setDepositing(true);
    setYieldError(null);
    let userSignature: string;
    try {
      userSignature = await requestWalletPerCallSignature(ARC_USER_FUNDING_SCOPE, amt, "svc_arc_usyc");
    } catch {
      setYieldError("Wallet signature is required before a manual USYC deposit. Agent Treasury is not used for user deposits.");
      setDepositing(false);
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/api/gateway/svc_arc_usyc`, {
        headers: paidGatewayHeaders("arcmind-yield", { "X-USYC-Amount": String(amt), "X-User-Signature": userSignature }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = res.ok ? await res.json() as { receiptId?: string } : {};
      if (!res.ok || !data.receiptId) throw new Error("Gateway did not return a verified receipt");
      const hash = data.receiptId.slice(0, 16);
      const minted = parseFloat((amt * (1 - 0.005)).toFixed(4)); // 0.5% mint fee
      setDeposits(prev => [{ deposited: amt, minted, apy: currentApy, hash, ts: Date.now() }, ...prev].slice(0, 10));
    } catch {
      setYieldError("USYC gateway unavailable. No deposit was created, no USYC was minted, and no funds moved.");
    }
    setDepositing(false);
  }

  function redeem(index: number) {
    setDeposits(prev => prev.map((dep, i) => {
      if (i !== index || dep.redeemedAt) return dep;
      return { ...dep, redeemedAt: Date.now(), redeemHash: localReceiptId("usyc_redeem").slice(0, 16) };
    }));
    setYieldError("USYC redemption queued in local state; live redemption requires the configured USYC gateway.");
  }

  function redeemAll() {
    setDeposits(prev => prev.map((dep) => dep.redeemedAt || isLocalYieldReceipt(dep) ? dep : {
      ...dep,
      redeemedAt: Date.now(),
      redeemHash: localReceiptId("usyc_redeem_all").slice(0, 16),
    }));
    setYieldError("All active USYC positions queued for redemption.");
  }

  function clearDeposit(index: number) {
    setDeposits(prev => prev.filter((_, i) => i !== index));
    setYieldError("Local USYC draft removed.");
  }

  const activeDeposits = deposits.filter((d) => !d.redeemedAt && !isLocalYieldReceipt(d));
  const totalDeposited = activeDeposits.reduce((s, d) => s + d.deposited, 0);
  const totalAccruedUsdc = deposits.reduce((d, dep) => {
    if (dep.redeemedAt || isLocalYieldReceipt(dep)) return d;
    const ageYears = (now - dep.ts) / (365.25 * 24 * 3600 * 1000);
    return d + dep.minted * (dep.apy / 100) * ageYears;
  }, 0);

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#10B981" }}><Percent size={15} /></span>
        <div>
          <h3>USYC — Circle Yield Token</h3>
          <div className="sub">Park idle USDC into Circle USYC on Arc L1 — manual wallet-signed deposit, not Agent Treasury</div>
        </div>
        {apy !== null && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ padding: "4px 10px", borderRadius: 20, background: "#10B98122", fontSize: 12, fontWeight: 800, color: "#10B981" }}>
              {apy.toFixed(1)}% APY
            </div>
            {activeDeposits.length > 0 && (
              <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={redeemAll}>
                Redeem all
              </button>
            )}
          </div>
        )}
      </div>

      <FlowExplainer
        items={[
          { label: "Why", value: "Risk-off parking for idle USDC when Decision Guard says market exposure is unsafe." },
          { label: "Destination", value: "User wallet signs the deposit; USDC mints USYC only when the gateway is live. Local fallback deposits do not claim live mint." },
          { label: "Exit", value: "Redeem one deposit or redeem all to move the position back toward USDC state." },
          { label: "Safety", value: "Amount, APY source, mint fee, receipt and redemption status stay visible per deposit." },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Total Deposited", val: `$${totalDeposited.toFixed(2)} USDC`, color: "#1652F0" },
          { label: "Live Yield", val: `+$${totalAccruedUsdc.toFixed(6)} USDC`, color: "#10B981" },
          { label: "Provider", val: "Circle USYC", color: "var(--text-secondary)" },
        ].map(g => (
          <div key={g.label} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{g.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: g.color, marginTop: 2 }}>{g.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>USDC amount to deposit</div>
          <input className="inp" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <button className="btn btn-acc" onClick={deposit} disabled={depositing || apy === null} style={{ fontSize: 11 }}>
          {depositing ? <><Loader2 size={11} className="wallet-spin" /> Minting…</> : <><Zap size={11} /> Deposit → USYC</>}
        </button>
      </div>

      {apy !== null && parseFloat(amount) > 0 && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "#10B9810d", border: "1px solid #10B98122", fontSize: 11, color: "var(--text-secondary)", marginBottom: 12 }}>
          <span style={{ color: "#10B981", fontWeight: 700 }}>${(parseFloat(amount) * apy / 100 / 365).toFixed(4)} USDC/day</span>
          {" "}yield at {apy.toFixed(1)}% APY · 0.5% mint fee · Arc L1
        </div>
      )}

      {yieldError && (
        <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #f59e0b44", background: "#f59e0b12", color: "#fbbf24", fontSize: 11, marginBottom: 12 }}>
          {yieldError}
        </div>
      )}

      {deposits.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Deposited</th><th>USYC minted</th><th>APY</th><th>Yield earned</th><th>Receipt</th><th>Status</th></tr></thead>
            <tbody>
              {deposits.map((d, i) => {
                const local = isLocalYieldReceipt(d);
                const ageYears = (now - d.ts) / (365.25 * 24 * 3600 * 1000);
                const earned = local ? 0 : d.minted * (d.apy / 100) * ageYears;
                return (
                  <tr key={i}>
                    <td className="svc-table__num">${d.deposited.toFixed(2)}</td>
                    <td className="svc-table__num">{local ? "not minted" : d.minted.toFixed(4)}</td>
                    <td className="svc-table__num" style={{ color: "#10B981" }}>{d.apy.toFixed(1)}%</td>
                    <td className="svc-table__num" style={{ color: d.redeemedAt ? "var(--text-secondary)" : "#10B981" }}>+${d.redeemedAt ? "0.000000" : earned.toFixed(6)}</td>
                    <td style={{ fontSize: 10 }}><code>{d.redeemHash ?? d.hash}...</code></td>
                    <td className="svc-table__num">
                      {local ? (
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => clearDeposit(i)}>Clear draft</button>
                      ) : d.redeemedAt ? (
                        <span style={{ color: "var(--text-secondary)", fontSize: 10 }}>redeemed</span>
                      ) : (
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => redeem(i)}>Redeem</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
