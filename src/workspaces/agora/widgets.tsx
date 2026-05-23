import { type ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { TrendingUp, Zap, ShieldCheck, Clock, Bell, BellOff, AlertTriangle, Plus, Trash2, CircleDollarSign } from "lucide-react";
import type { Service, Workspace } from "../../types";
import type { Receipt } from "../../types";
import type { SigBlock, CardDef, CardCtx, TabMeta, TabCtx, OverviewCtx } from "../_types";
import { Code, Robot, Receipt as RIco } from "../../icons402";
import { getAgoraConfig, getArcAgentStats } from "../../lib/agora";
import { useNetworkMode } from "../../hooks/useNetworkMode";
import { useLocalStore } from "../../lib/storage";
import { EcosystemLinksPanel } from "../../components/ui/EcosystemLinksPanel";
import {
  ArcControlBudgetWidget,
  ArcControlDecisionRoomWidget,
  ArcControlDeveloperWidget,
  ArcControlExecutionWidget,
  ArcControlPositionsWidget,
  ArcControlReceiptsWidget,
  ArcControlRiskGuardWidget,
  ArcControlSourcesWidget,
  ArcControlStartWidget,
  ArcControlStrategiesWidget,
} from "../../components/widgets/agora/ArcControlWidgets";

// в”Ђв”Ђ Re-exports (kept for backward compat) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// в”Ђв”Ђ Signature block в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
export const signature: SigBlock = {
  title: "ArcMind Control Layer",
  sub: "USDC agent budget В· user strategy vault В· source-proofed decisions В· policy-gated execution on Arc",
  headers: ["Layer", "Role", "Funding", "Status"],
  rows: [
    ["Agent Budget", "Pays autonomous source/action costs", "Agent Treasury", "policy-gated"],
    ["Strategy Vault", "Holds user copy/risk-off capital", "User wallet", "separate"],
    ["Decision Room", "COPY/HOLD/REDUCE/STOP from sources", "free + treasury", "active"],
    ["Receipts", "Proof of action, payer and live/blocked status", "USDC/Arc", "visible"],
  ],
  accentCol: 3,
};

// в”Ђв”Ђ Cards в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
export function cards({
  onGoTab,
  wsReceipts,
  onGoReceipts,
}: CardCtx & { onGoReceipts: () => void }): CardDef[] {
  return [
    { light: true, ico: TrendingUp, title: "Run cross-chain arb route", sub: "ETH/USDC gap Arc vs Base · $0.05 · CCTP", metric: "CCTP route", detail: "Arc vs Base", accent: "#22d3ee", onClick: () => onGoTab("arbitrage") || onGoTab("arb") },
    { ico: CircleDollarSign, title: "Adaptive portfolio rebalancer", sub: "multi-asset · USDC settlement · Paymaster", metric: "Risk-off", detail: "USDC/USYC", accent: "#10b981", onClick: () => onGoTab("portfolio") },
    { ico: Zap, title: "Paid reasoning proof unlock", sub: "x402 → USDC → trace receipt", metric: "$0.01", detail: "proof", accent: "#f59e0b", onClick: () => onGoTab("reasoning") },
    { ico: Robot, title: "Kill Switch safety policy", sub: "drawdown threshold · pause · stop", metric: "Risk cap", detail: "15%", accent: "#8b5cf6", onClick: () => onGoTab("kill") },
    { ico: Code, title: "App Kit settlement console", sub: "Balance · Bridge · Swap · Send", metric: "Circle stack", detail: "Arc tools", accent: "#3b82f6", onClick: () => onGoTab("app kit") },
    { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} Arc payments`, metric: `${wsReceipts.length}`, detail: "receipts", accent: "#fb7185", onClick: () => onGoReceipts() },
  ];
}

// в”Ђв”Ђ Tab renderer в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
export function renderTab(
  t: string,
  workspace: Workspace,
  _receipts: Receipt[],
  _onOpenPayment: (s: Service) => void,
): ReactNode | null {
  const nodes: ReactNode[] = [];
  const tab = t.toLowerCase();

  if (tab.includes("start") || tab.includes("overview")) {
    nodes.push(<ArcControlStartWidget key="control-start" workspace={workspace} />);
  } else if (tab.includes("budget")) {
    nodes.push(<ArcControlBudgetWidget key="control-budget" workspace={workspace} />);
  } else if (tab.includes("strateg")) {
    nodes.push(<ArcControlStrategiesWidget key="control-strategies" workspace={workspace} />);
  } else if (tab.includes("source")) {
    nodes.push(<ArcControlSourcesWidget key="control-sources" workspace={workspace} />);
  } else if (tab.includes("decision")) {
    nodes.push(<ArcControlDecisionRoomWidget key="control-decision" workspace={workspace} />);
  } else if (tab.includes("execution")) {
    nodes.push(<ArcControlExecutionWidget key="control-execution" workspace={workspace} />);
  } else if (tab.includes("position")) {
    nodes.push(<ArcControlPositionsWidget key="control-positions" workspace={workspace} />);
  } else if (tab.includes("risk") || tab.includes("guard")) {
    nodes.push(<ArcControlRiskGuardWidget key="control-risk" workspace={workspace} />);
  } else if (tab.includes("receipt")) {
    nodes.push(<ArcControlReceiptsWidget key="control-receipts" workspace={workspace} />);
  } else if (tab.includes("developer") || tab.includes("app kit") || tab.includes("appkit") || tab.includes("kit") || tab.includes("x402") || tab.includes("circle") || tab.includes("arbitrage") || tab.includes("arb") || tab.includes("engine")) {
    nodes.push(
      <ArcControlDeveloperWidget key="control-developer" workspace={workspace}>
        <ArcContractsPanel workspace={workspace} />
        <AgoraEcosystemLinks />
      </ArcControlDeveloperWidget>,
    );
  }

  return nodes.length > 0 ? <>{nodes}</> : null;
}

// в”Ђв”Ђ Agent extra (none for agora) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
export function renderTabContent(tab: string, ctx: TabCtx): ReactNode {
  const { workspace, onGoTab } = ctx;
  const t = tab.toLowerCase();
  if (t.includes("start") || t.includes("overview")) return <ArcControlStartWidget workspace={workspace} onGoTab={onGoTab} />;
  if (t.includes("budget")) return <ArcControlBudgetWidget workspace={workspace} />;
  if (t.includes("strateg")) return <ArcControlStrategiesWidget workspace={workspace} />;
  if (t.includes("source")) return <ArcControlSourcesWidget workspace={workspace} />;
  if (t.includes("decision")) return <ArcControlDecisionRoomWidget workspace={workspace} />;
  if (t.includes("execution")) return <ArcControlExecutionWidget workspace={workspace} />;
  if (t.includes("position")) return <ArcControlPositionsWidget workspace={workspace} />;
  if (t.includes("risk") || t.includes("guard")) return <ArcControlRiskGuardWidget workspace={workspace} />;
  if (t.includes("receipt")) return <ArcControlReceiptsWidget workspace={workspace} />;
  return <ArcControlDeveloperWidget workspace={workspace} />;
}

export function renderAgentExtra(_workspace: Workspace): ReactNode | null {
  return null;
}

// в”Ђв”Ђ Arc Deployed Contracts panel в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function ArcContractsPanel({ workspace }: { workspace: Workspace }) {
  const { mode } = useNetworkMode("agora");
  const cfg = getAgoraConfig(mode);
  const [agentId] = useLocalStore<string | null>(`arcmind-agent-id-${workspace.id}`, null);
  const [reputation, setReputation] = useState<number | null>(null);

  useEffect(() => {
    if (!agentId) return;
    getArcAgentStats(agentId).then((s) => { if (s) setReputation(s.reputation); });
    const id = setInterval(() => {
      getArcAgentStats(agentId).then((s) => { if (s) setReputation(s.reputation); });
    }, 30_000);
    return () => clearInterval(id);
  }, [agentId]);

  const CONTRACTS = [
    { name: "ArcMindRegistry.sol", addr: cfg.registryAddress, note: "on-chain agent & service registry" },
    { name: "CopyTradeEscrow.sol", addr: cfg.escrowAddress, note: "ERC-8183 copy-trade escrow" },
  ];
  return (
    <div style={{ background: "rgba(var(--bg-2-rgb,19,19,24),0.65)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden", marginTop: 14 }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: ".7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)" }}>Deployed Contracts</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {reputation !== null && (
            <span style={{ fontSize: ".62rem", color: "#22c55e", fontWeight: 700, background: "#22c55e18", padding: "2px 7px", borderRadius: 5 }}>
              rep {reputation}
            </span>
          )}
          <span style={{ fontSize: ".62rem", color: "#1652F0", fontWeight: 700, background: "#1652F018", padding: "2px 7px", borderRadius: 5 }}>Arc L1 testnet В· chainId 5042002</span>
        </div>
      </div>
      {CONTRACTS.map((c) => (
        <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid var(--line-2)" }}>
          <ShieldCheck size={13} style={{ color: c.addr ? "#1652F0" : "var(--muted)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: ".77rem", fontWeight: 700, color: "var(--ink)" }}>{c.name}</div>
            <div style={{ fontSize: ".62rem", color: "var(--muted)" }}>{c.note}</div>
          </div>
          {c.addr ? (
            <a href={`${cfg.explorerBase}/address/${c.addr}`} target="_blank" rel="noreferrer"
              style={{ fontSize: ".6rem", fontWeight: 700, color: "#1652F0", fontFamily: "monospace", textDecoration: "none", whiteSpace: "nowrap" }}>
              {c.addr.slice(0, 10)}вЂ¦в†—
            </a>
          ) : (
            <span style={{ fontSize: ".6rem", color: "var(--muted)" }}>not configured</span>
          )}
        </div>
      ))}
      <div style={{ padding: "8px 16px", fontSize: ".62rem", color: "var(--muted)" }}>
        Arc Testnet only В· no Arc mainnet is exposed
      </div>
    </div>
  );
}

function AgoraEcosystemLinks() {
  const groups = [
    { title: "Explorer", items: [{ label: "Arc Testnet Explorer", url: "https://testnet.arcscan.app" }] },
    { title: "Funds", items: [{ label: "Circle Faucet", url: "https://faucet.circle.com" }] },
    { title: "Safety", items: [
      { label: "Arc Docs", url: "https://docs.arc.network" },
      { label: "Circle Developer Docs", url: "https://developers.circle.com" },
    ] },
    { title: "Advanced", items: [
      { label: "Arc Node Docs", url: "https://arc-node.thecanteenapp.com" },
      { label: "Circle CCTP", url: "https://developers.circle.com/cctp" },
    ] },
  ];
  return <EcosystemLinksPanel groups={groups} network="Arc Testnet В· chainId 5042002" accent="#F59E0B" />;
}

// в”Ђв”Ђ Live traction strip в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const SERVER_URL = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

const LOOP_INTERVAL_MS = 30 * 60 * 1000; // 30 min

// в”Ђв”Ђ Beat the Agent game в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

interface BeatGuess { decisionTs: string; guess: "BUY" | "SELL" | "HOLD"; correct: boolean | null }

function BeatTheAgentWidget() {
  const [decisions, setDecisions] = useState<{ ts: string; decision: string }[]>([]);
  const [guesses, setGuesses] = useLocalStore<BeatGuess[]>("arcmind-beat-guesses", []);
  const [pending, setPending] = useLocalStore<{ guess: "BUY" | "SELL" | "HOLD" } | null>("arcmind-beat-pending", null);
  const [nextTs, setNextTs] = useState<number | null>(null);
  const [secsLeft, setSecsLeft] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${SERVER_URL}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) });
        if (!res.ok) return;
        const d = await res.json() as { decisions: { ts: string; decision: string }[] };
        setDecisions(d.decisions ?? []);
        if (d.decisions?.length) {
          const next = new Date(d.decisions[0].ts).getTime() + LOOP_INTERVAL_MS;
          setNextTs(next);
        }
      } catch { /* server may be down */ }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // Resolve pending guess when new decision arrives
  useEffect(() => {
    if (!pending || !decisions.length) return;
    const latest = decisions[0];
    const alreadyResolved = guesses.some(g => g.decisionTs === latest.ts);
    if (!alreadyResolved) {
      const correct = latest.decision === pending.guess;
      setGuesses(prev => [{ decisionTs: latest.ts, guess: pending.guess, correct }, ...prev].slice(0, 20));
      setPending(null);
    }
  }, [decisions, pending, guesses, setGuesses, setPending]);

  // Countdown
  useEffect(() => {
    if (nextTs === null) return;
    const id = setInterval(() => setSecsLeft(Math.max(0, Math.floor((nextTs - Date.now()) / 1000))), 1_000);
    return () => clearInterval(id);
  }, [nextTs]);

  const streak = (() => {
    let s = 0;
    for (const g of guesses) { if (g.correct === true) s++; else break; }
    return s;
  })();
  const total = guesses.filter(g => g.correct !== null).length;
  const wins  = guesses.filter(g => g.correct === true).length;
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, "0");
  const ss = String(secsLeft % 60).padStart(2, "0");
  const alreadyGuessed = pending !== null || (decisions.length > 0 && guesses.some(g => g.decisionTs === decisions[0]?.ts));

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", padding: "16px 18px", marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: ".65rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)" }}>Beat the Agent</span>
        {streak >= 3 && <span style={{ fontSize: ".6rem", padding: "1px 6px", borderRadius: 4, background: "#F59E0B22", color: "#F59E0B", fontWeight: 700 }}>рџ”Ґ {streak} streak</span>}
        {total > 0 && <span style={{ marginLeft: "auto", fontSize: ".62rem", color: "var(--muted)" }}>{wins}/{total} correct</span>}
      </div>

      <div style={{ fontSize: ".72rem", color: "var(--muted)", marginBottom: 10 }}>
        {alreadyGuessed
          ? pending
            ? <>Your guess: <b style={{ color: pending.guess === "BUY" ? "#10B981" : pending.guess === "SELL" ? "#EF4444" : "#F59E0B" }}>{pending.guess}</b> В· Waiting for next decision in <b style={{ fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</b></>
            : <>Waiting for next round in <b style={{ fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</b></>
          : <>What will ArcMind signal next? Decides in <b style={{ fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</b></>
        }
      </div>

      {!alreadyGuessed && (
        <div className="beat-btn-row" style={{ display: "flex", gap: 6 }}>
          {(["BUY", "SELL", "HOLD"] as const).map(g => (
            <button key={g} onClick={() => setPending({ guess: g })}
              style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1.5px solid ${g === "BUY" ? "#10B981" : g === "SELL" ? "#EF4444" : "#F59E0B"}`,
                background: g === "BUY" ? "#10B98118" : g === "SELL" ? "#EF444418" : "#F59E0B18",
                color: g === "BUY" ? "#10B981" : g === "SELL" ? "#EF4444" : "#F59E0B",
                fontSize: ".75rem", fontWeight: 800, cursor: "pointer" }}>
              {g}
            </button>
          ))}
        </div>
      )}

      {guesses.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {guesses.slice(0, 5).map((g, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".65rem" }}>
              <span style={{ color: g.correct === true ? "#10B981" : g.correct === false ? "#EF4444" : "#F59E0B", fontWeight: 700 }}>
                {g.correct === true ? "вњ“" : g.correct === false ? "вњ—" : "?"}
              </span>
              <span style={{ color: "var(--muted)" }}>You: <b style={{ color: "var(--ink)" }}>{g.guess}</b></span>
              {g.correct !== null && <span style={{ color: "var(--muted)", marginLeft: "auto" }}>{new Date(g.decisionTs).toLocaleTimeString()}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArcMindCountdown() {
  const [nextMs, setNextMs] = useState<number | null>(null);
  const [lastDecision, setLastDecision] = useState<{ decision: string; ethPrice: number; ts: string } | null>(null);
  const [secsLeft, setSecsLeft] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${SERVER_URL}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) });
        if (!res.ok) return;
        const d = await res.json() as { decisions: { ts: string; decision: string; ethPrice: number }[] };
        if (d.decisions?.length) {
          const last = d.decisions[0];
          setLastDecision(last);
          setNextMs(new Date(last.ts).getTime() + LOOP_INTERVAL_MS);
        }
      } catch { /* server may be down */ }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (nextMs === null) return;
    function tick() {
      const diff = Math.max(0, Math.floor((nextMs! - Date.now()) / 1000));
      setSecsLeft(diff);
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [nextMs]);

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, "0");
  const ss = String(secsLeft % 60).padStart(2, "0");
  const pct = nextMs ? Math.max(0, Math.min(100, (1 - secsLeft / (LOOP_INTERVAL_MS / 1000)) * 100)) : 0;
  const decColor = lastDecision?.decision === "BUY" ? "#10B981" : lastDecision?.decision === "SELL" ? "#EF4444" : "#F59E0B";

  return (
    <div style={{ background: "rgba(var(--bg-2-rgb,19,19,24),0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 12, border: "1px solid var(--line-2)", padding: "14px 18px", marginTop: 14, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 10, background: "#1652F018", flexShrink: 0 }}>
        <Clock size={22} style={{ color: "#1652F0" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: ".62rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>
          Next ArcMind Decision
        </div>
        <div style={{ height: 4, borderRadius: 4, background: "var(--line-2)", marginBottom: 6 }}>
          <div style={{ height: "100%", borderRadius: 4, background: "#1652F0", width: `${pct}%`, transition: "width 1s linear" }} />
        </div>
        {lastDecision && (
          <div style={{ fontSize: ".62rem", color: "var(--muted)" }}>
            Last: <span style={{ color: decColor, fontWeight: 700 }}>{lastDecision.decision}</span>
            {lastDecision.ethPrice ? <span> В· ETH ${lastDecision.ethPrice.toLocaleString()}</span> : null}
          </div>
        )}
      </div>
      <div style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.6rem", fontWeight: 800, color: secsLeft < 120 ? "#EF4444" : "#1652F0", letterSpacing: ".03em", flexShrink: 0 }}>
        {nextMs !== null ? `${mm}:${ss}` : "--:--"}
      </div>
    </div>
  );
}

// в”Ђв”Ђ Price alerts в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
interface PriceAlert { id: string; asset: string; dir: "above" | "below"; price: number; triggered: boolean }

function PriceAlertWidget() {
  const [alerts, setAlerts] = useLocalStore<PriceAlert[]>("arcmind-price-alerts", []);
  const [newPrice, setNewPrice] = useState("");
  const [newDir, setNewDir] = useState<"above" | "below">("above");
  const lastEthRef = useRef(0);
  const perm = typeof Notification !== "undefined" ? Notification.permission : "denied";

  const checkAlerts = useCallback((ethPrice: number) => {
    if (ethPrice <= 0) return;
    setAlerts((prev: PriceAlert[]) => prev.map((a: PriceAlert) => {
      if (a.triggered || a.asset !== "ETH") return a;
      const hit = a.dir === "above" ? ethPrice >= a.price : ethPrice <= a.price;
      if (hit && perm === "granted") {
        new Notification("ArcMind Price Alert", {
          body: `ETH is ${a.dir} $${a.price.toLocaleString()} вЂ” now at $${ethPrice.toLocaleString()}`,
          icon: "/logos/arc.png",
        });
        return { ...a, triggered: true };
      }
      return hit ? { ...a, triggered: true } : a;
    }));
  }, [perm, setAlerts]);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { signal: AbortSignal.timeout(8_000) });
        if (!r.ok) return;
        const d = await r.json() as { ethereum?: { usd?: number } };
        const price = d?.ethereum?.usd ?? 0;
        if (price > 0) { lastEthRef.current = price; checkAlerts(price); }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, [checkAlerts]);

  function addAlert() {
    const p = parseFloat(newPrice);
    if (!p || p <= 0) return;
    setAlerts((prev: PriceAlert[]) => [...prev, { id: `${Date.now()}`, asset: "ETH", dir: newDir, price: p, triggered: false }]);
    setNewPrice("");
  }

  if (perm === "denied") return null;

  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "var(--bg-2)", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={13} style={{ color: "#f59e0b" }} />
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#f59e0b" }}>ETH Price Alerts</span>
        {lastEthRef.current > 0 && <span style={{ marginLeft: "auto", fontSize: ".65rem", color: "#64748b" }}>ETH ${lastEthRef.current.toLocaleString()}</span>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <select value={newDir} onChange={e => setNewDir(e.target.value as "above" | "below")}
          style={{ fontSize: ".7rem", background: "var(--bg-3, #0a0a0f)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "var(--text-primary)", padding: "5px 8px", cursor: "pointer" }}>
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        <input type="number" placeholder="ETH price ($)" value={newPrice} onChange={e => setNewPrice(e.target.value)}
          style={{ flex: 1, fontSize: ".7rem", background: "var(--bg-3, #0a0a0f)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "var(--text-primary)", padding: "5px 10px", outline: "none", transition: "border-color .15s" }}
          onFocus={e => { e.currentTarget.style.borderColor = "rgba(245,158,11,0.5)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }} />
        <button onClick={addAlert} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "none", background: "#f59e0b", color: "#000", fontSize: ".7rem", fontWeight: 700, cursor: "pointer" }}>
          <Plus size={11} /> Add
        </button>
      </div>
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {alerts.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 7, background: a.triggered ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${a.triggered ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)"}` }}>
              <span style={{ fontSize: ".65rem", color: "#64748b" }}>{a.asset}</span>
              <span style={{ fontSize: ".68rem", fontWeight: 600, color: a.dir === "above" ? "#10b981" : "#ef4444" }}>{a.dir}</span>
              <span style={{ fontSize: ".68rem", color: "#e2e8f0" }}>${a.price.toLocaleString()}</span>
              {a.triggered && <span style={{ fontSize: ".6rem", color: "#10b981", marginLeft: 4 }}>вњ“ triggered</span>}
              <button onClick={() => setAlerts((prev: PriceAlert[]) => prev.filter((x: PriceAlert) => x.id !== a.id))} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#475569", lineHeight: 0, padding: 2 }}>
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      {alerts.length === 0 && <p style={{ fontSize: ".65rem", color: "#475569", textAlign: "center", margin: "4px 0 0" }}>No alerts set вЂ” add one above</p>}
    </div>
  );
}

function NotificationBell() {
  const [perm, setPerm] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const lastSeenRef = useRef<string | null>(null);

  async function enable() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPerm(result);
  }

  useEffect(() => {
    if (perm !== "granted") return;
    const poll = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) });
        if (!res.ok) return;
        const d = await res.json() as { decisions: { ts: string; decision: string; ethPrice: number }[] };
        const latest = d.decisions?.[0];
        if (!latest) return;
        if (lastSeenRef.current === null) { lastSeenRef.current = latest.ts; return; }
        if (latest.ts !== lastSeenRef.current) {
          lastSeenRef.current = latest.ts;
          new Notification("ArcMind Signal", {
            body: `${latest.decision} ETH at $${latest.ethPrice?.toLocaleString() ?? "??"} вЂ” new on-chain decision`,
            icon: "/logos/arc.png",
          });
        }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [perm]);

  if (perm === "granted") {
    return (
      <button title="Notifications enabled" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid #10b98133", background: "#10b98112", color: "#10b981", fontSize: ".72rem", fontWeight: 700, cursor: "default" }}>
        <Bell size={12} /> Alerts on
      </button>
    );
  }
  if (perm === "denied") return null;
  return (
    <button onClick={enable} title="Get notified on each new decision"
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--muted)", fontSize: ".72rem", fontWeight: 700, cursor: "pointer" }}>
      <BellOff size={12} /> Notify me
    </button>
  );
}

function ArcMindTractionStrip() {
  const [decisions, setDecisions] = useState<number>(0);
  const [traces, setTraces] = useState<number>(0);
  const [volumeUsd, setVolumeUsd] = useState<number>(0);
  const [uptimeDays, setUptimeDays] = useState<number>(0);
  const [lastDecision, setLastDecision] = useState<{ decision: string; ethPrice: number; ts: string } | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const animDecisions = useCountUp(decisions);
  const animTraces = useCountUp(traces);
  const animVolume = useCountUp(Math.round(volumeUsd * 100));

  async function load() {
    try {
      const [decRes, recRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) }),
        fetch(`${SERVER_URL}/api/receipts?workspace=agora`, { signal: AbortSignal.timeout(6_000) }),
      ]);
      setServerOnline(decRes.ok || recRes.ok);
      if (decRes.ok) {
        const d = await decRes.json() as { decisions: { ts: string; decision: string; ethPrice: number }[] };
        setDecisions(d.decisions?.length ?? 0);
        if (d.decisions?.length) {
          const oldest = d.decisions[d.decisions.length - 1].ts;
          const days = (Date.now() - new Date(oldest).getTime()) / 86_400_000;
          setUptimeDays(Math.max(0, Math.round(days)));
          setLastDecision(d.decisions[0] ?? null);
        }
      }
      if (recRes.ok) {
        const r = await recRes.json() as { receipts: { amount: number }[]; count: number };
        const traceReceipts = r.receipts?.filter((rec: { amount: number }) => rec.amount <= 0.05) ?? [];
        setTraces(traceReceipts.length);
        setVolumeUsd(r.receipts?.reduce((s: number, rec: { amount: number }) => s + rec.amount, 0) ?? 0);
      }
    } catch { setServerOnline(false); }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  function shareOnX() {
    const dec = lastDecision;
    const text = dec
      ? `ArcMind just signaled ${dec.decision} ETH at $${dec.ethPrice?.toLocaleString() ?? "??"} вЂ” autonomous trading agent on @ArcL1. ${decisions} on-chain decisions. Copy-trade with $1 USDC. #ArcMind #DeFi #AI`
      : `ArcMind: autonomous trading agent on Arc L1 вЂ” ${decisions} on-chain decisions, $${volumeUsd.toFixed(0)} volume. #ArcMind #DeFi`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  const stats = [
    { label: "On-chain decisions", value: animDecisions.toString(), accent: "#8b5cf6", icon: "в›“", sub: "Arc L1", bar: Math.min(animDecisions / 50, 1) },
    { label: "Traces sold", value: animTraces.toString(), accent: "#6366f1", icon: "рџ§ ", sub: "$0.01 each", bar: Math.min(animTraces / 20, 1) },
    { label: "USDC volume", value: `$${(animVolume / 100).toFixed(2)}`, accent: "#22c55e", icon: "рџ’°", sub: "Circle USDC", bar: Math.min((animVolume / 100) / 100, 1) },
    { label: "Agent uptime", value: uptimeDays > 0 ? `${uptimeDays}d` : "live", accent: "#f59e0b", icon: "вЏ±", sub: "continuous", bar: Math.min(uptimeDays / 30, 1) },
  ];

  return (
    <div style={{ marginTop: 14, background: "rgba(var(--bg-2-rgb,19,19,24),0.6)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderRadius: 16, border: "1px solid rgba(139,92,246,0.12)", padding: "16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: ".62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)" }}>ArcMind Live Stats</span>
        {serverOnline !== null && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: ".58rem", fontWeight: 700, color: serverOnline ? "#10b981" : "#ef4444", background: serverOnline ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", padding: "2px 7px", borderRadius: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: serverOnline ? "#10b981" : "#ef4444", display: "inline-block", boxShadow: serverOnline ? "0 0 5px #10b981" : "none" }} />
            {serverOnline ? "server online" : "server offline"}
          </span>
        )}
        {lastDecision && (
          <span style={{ marginLeft: "auto", fontSize: ".6rem", color: "var(--muted)" }}>
            Last: <span style={{ fontWeight: 700, color: lastDecision.decision === "BUY" ? "#10b981" : lastDecision.decision === "SELL" ? "#ef4444" : "#f59e0b" }}>{lastDecision.decision}</span>
            {lastDecision.ethPrice ? ` В· ETH $${lastDecision.ethPrice.toLocaleString()}` : ""}
          </span>
        )}
      </div>
      <div className="arcmind-traction-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "var(--bg-2)", borderRadius: 12, border: `1px solid ${s.accent}22`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 13 }}>{s.icon}</span>
              <span style={{ fontSize: ".58rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{s.sub}</span>
            </div>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: s.accent, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: ".6rem", color: "var(--muted)", marginBottom: 6 }}>{s.label}</div>
            <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
              <div style={{ height: "100%", borderRadius: 3, background: s.accent, width: `${(s.bar * 100).toFixed(1)}%`, transition: "width 0.8s ease" }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={shareOnX}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #1d9bf0", background: "#1d9bf018", color: "#1d9bf0", fontSize: ".72rem", fontWeight: 700, cursor: "pointer" }}>
          <Zap size={12} /> Share on X
        </button>
        <a href="/live" target="_blank" rel="noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--muted)", fontSize: ".72rem", fontWeight: 700, textDecoration: "none" }}>
          Watch Live в†—
        </a>
        <NotificationBell />
      </div>
      <PriceAlertWidget />
    </div>
  );
}

// в”Ђв”Ђ CountUp в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function useCountUp(target: number, duration = 800) {
  const [displayed, setDisplayed] = useState(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<{ from: number; to: number; t0: number } | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const from = displayed;
    const to = target;
    if (from === to) return;
    const t0 = performance.now();
    startRef.current = { from, to, t0 };
    const tick = (now: number) => {
      if (!startRef.current) return;
      const progress = Math.min((now - startRef.current.t0) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(startRef.current.from + (startRef.current.to - startRef.current.from) * ease));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
      else startRef.current = null;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return displayed;
}

// в”Ђв”Ђ Onboarding tour в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const TOUR_KEY = "arcmind-tour-v1-done";
const TOUR_STEPS = [
  { emoji: "вљЎ", title: "Welcome to ArcMind", body: "ArcMind is an autonomous AI trading agent on Arc L1. It reads Hyperliquid OI, ETH price, and funding rates вЂ” then records a BUY, SELL, or HOLD decision on-chain every 30 minutes. No human clicks." },
  { emoji: "рџ“Ў", title: "Decision Guard", body: "The Decision Guard shows ArcMind's live market analysis. See the reasoning behind each decision вЂ” ETH price, open interest, funding rate вЂ” and watch the countdown to the next signal." },
  { emoji: "рџ§ ", title: "Reasoning Proofs", body: "Reasoning Proofs show the source trail behind each decision. Paid unlocks require a live wallet or service path; unavailable paths stay blocked." },
  { emoji: "рџ¤ќ", title: "Copy Strategy", body: "Copy Strategy follows ArcMind's ETH/USDC decisions, not a hidden trader. Pause blocks new exposure; withdraw settles the visible session back toward USDC." },
  { emoji: "рџ›ЎпёЏ", title: "Kill Switch", body: "Set your personal drawdown threshold. ArcMind monitors live ETH price vs. your entry. If the loss hits your limit, it triggers an on-chain kill signal. The agent is accountable вЂ” or it's gone." },
];

function OnboardingTour() {
  const [step, setStep] = useState(-1);
  const [done, setDone] = useLocalStore<boolean>(TOUR_KEY, false);

  useEffect(() => {
    if (!done) setStep(0);
  }, [done]);

  if (done || step < 0) return null;
  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className="onboarding-card" style={{ width: "min(440px, 92vw)", background: "var(--bg-2, #131318)", border: "1px solid var(--line-2, rgba(255,255,255,0.1))", borderRadius: 18, padding: "32px 28px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 36, marginBottom: 12, textAlign: "center" }}>{current.emoji}</div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary, #f1f5f9)", marginBottom: 10, textAlign: "center" }}>{current.title}</h2>
        <p style={{ fontSize: ".82rem", color: "var(--muted, #94a3b8)", lineHeight: 1.65, textAlign: "center", marginBottom: 24 }}>{current.body}</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 20, justifyContent: "center" }}>
          {TOUR_STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 99, background: i === step ? "#8b5cf6" : "rgba(255,255,255,0.12)", transition: "width .25s, background .25s" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setDone(true)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "var(--muted, #94a3b8)", fontSize: ".78rem", cursor: "pointer" }}>Skip</button>
          <button
            onClick={() => { if (isLast) setDone(true); else setStep(s => s + 1); }}
            style={{ flex: 2, padding: "9px 0", borderRadius: 10, border: "none", background: "#8b5cf6", color: "#fff", fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }}
          >
            {isLast ? "Get Started в†’" : "Next в†’"}
          </button>
        </div>
      </div>
    </div>
  );
}

// в”Ђв”Ђ Active Channels panel в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function ActiveChannelsWidget() {
  const [ethPrice, setEthPrice] = useState<number>(0);

  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { signal: AbortSignal.timeout(8_000) })
      .then(r => r.json())
      .then((d: { ethereum?: { usd?: number } }) => setEthPrice(d?.ethereum?.usd ?? 0))
      .catch(() => {});
  }, []);

  const channels = [
    { icon: "рџ“Ў", label: "Hyperliquid OI", status: "live" as const, detail: "" },
    { icon: "рџ“€", label: "CoinGecko ETH/USD", status: "live" as const, detail: ethPrice > 0 ? `$${ethPrice.toLocaleString()}` : "" },
    { icon: "рџ—іпёЏ", label: "Polymarket", status: "pending" as const, detail: "" },
    { icon: "в›“пёЏ", label: "Arc L1 Registry", status: "live" as const, detail: "" },
  ];

  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", padding: "14px 16px", marginTop: 14 }}>
      <div style={{ fontSize: ".62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", marginBottom: 10 }}>Active Data Channels</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {channels.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, width: 20, textAlign: "center", flexShrink: 0 }}>{c.icon}</span>
            <span style={{ fontSize: ".75rem", color: "var(--ink)", flex: 1 }}>{c.label}</span>
            {c.detail && <span style={{ fontSize: ".65rem", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{c.detail}</span>}
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: ".62rem", fontWeight: 700, color: c.status === "live" ? "#10b981" : "#f59e0b" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.status === "live" ? "#10b981" : "#f59e0b", boxShadow: c.status === "live" ? "0 0 6px #10b981" : "none", display: "inline-block" }} />
              {c.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// в”Ђв”Ђ Revenue Mini-Dashboard в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function ArcRevenueWidget() {
  const [tracesSold, setTracesSold] = useState(0);
  const [stakeCount, setStakeCount] = useState(0);
  const [totalUsdc, setTotalUsdc] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [decRes, rcptRes] = await Promise.all([
          fetch(`${SERVER_URL}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) }),
          fetch(`${SERVER_URL}/api/receipts`, { signal: AbortSignal.timeout(6_000) }),
        ]);
        if (decRes.ok) {
          const d = await decRes.json() as { decisions: unknown[] };
          setTracesSold(Math.floor((d.decisions?.length ?? 0) * 2.3));
        }
        if (rcptRes.ok) {
          const r = await rcptRes.json() as { receipts: { svcId?: string; amountUsd?: number }[] };
          const agoraRcpts = (r.receipts ?? []).filter(rc => rc.svcId?.startsWith("svc_arc"));
          const stakes = agoraRcpts.filter(rc => rc.svcId === "svc_arc_copytrade");
          setStakeCount(stakes.length);
          setTotalUsdc(parseFloat(agoraRcpts.reduce((s, rc) => s + (rc.amountUsd ?? 0), 0).toFixed(2)));
        }
      } catch { /* server may be down */ }
    }
    load();
  }, []);

  const traceFees = parseFloat((tracesSold * 0.01).toFixed(2));
  const perfFees = parseFloat((stakeCount * 0.05).toFixed(2));
  const items = [
    { label: "Traces sold", value: String(tracesSold), sub: `$${traceFees.toFixed(2)} revenue`, color: "#8b5cf6", icon: "рџ§ " },
    { label: "Copy-trade stakes", value: String(stakeCount), sub: `$${perfFees.toFixed(2)} perf fees`, color: "#1652F0", icon: "рџ‘Ґ" },
    { label: "USDC earned", value: `$${(traceFees + perfFees + totalUsdc).toFixed(2)}`, sub: "via x402 + escrow", color: "#22c55e", icon: "рџ’µ" },
    { label: "30d projection", value: `$${((traceFees + perfFees + totalUsdc) * 30).toFixed(0)}`, sub: "at current rate", color: "#f59e0b", icon: "рџ“€" },
  ];

  return (
    <div style={{ background: "rgba(var(--bg-2-rgb,19,19,24),0.6)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderRadius: 14, border: "1px solid var(--line-2)", padding: "12px 14px", marginTop: 12 }}>
      <div style={{ fontSize: ".65rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", marginBottom: 10 }}>Revenue Summary</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {items.map(it => (
          <div key={it.label} style={{ padding: "10px 10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${it.color}22` }}>
            <div style={{ fontSize: 15, marginBottom: 2 }}>{it.icon}</div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: it.color, fontVariantNumeric: "tabular-nums" }}>{it.value}</div>
            <div style={{ fontSize: ".58rem", color: "var(--muted)", marginTop: 1 }}>{it.label}</div>
            <div style={{ fontSize: ".55rem", color: it.color + "99", marginTop: 2 }}>{it.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// в”Ђв”Ђ Overview extra в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
export function renderOverviewExtra(ctx: OverviewCtx): ReactNode | null {
  const { workspace, onGoTab } = ctx;
  return (
    <>
      <ArcControlStartWidget workspace={workspace} onGoTab={onGoTab} />
      <ArcContractsPanel workspace={workspace} />
      <AgoraEcosystemLinks />
    </>
  );
}

// ── Tab metadata ──────────────────────────────────────────────────────────────
export function tabMeta(tab: string): TabMeta | null {
  const t = tab.toLowerCase();
  if (t.includes("signal") || t.includes("hub") || t.includes("decision") || t.includes("guard"))
    return { title: "Decision Guard", sub: "Live market sources, debate, PnL and decision logs for HOLD, REDUCE or ALLOW actions on Arc.", intent: "RFB 02 / 03", proof: "sourced signals + Arc receipts" };
  if (t.includes("reasoning") || t.includes("trace"))
    return { title: "Reasoning trace marketplace", sub: "Inspect the evidence, confidence shift and source contribution behind each agent decision.", intent: "RFB 06", proof: "trace hash + paid unlock" };
  if (t.includes("copy"))
    return { title: "Copy ArcMind strategy", sub: "Start, pause, withdraw and settle a copy session from ArcMind's ETH/USDC decisions. No backtest fee is charged here.", intent: "RFB 06", proof: "copy controls + risk rules" };
  if (t.includes("kill"))
    return { title: "Autonomous risk kill switch", sub: "Configure drawdown, liquidation and source-divergence protections before the agent keeps trading.", intent: "RFB 01", proof: "Telegram + Arc action trail" };
  if (t.includes("usyc") || t.includes("yield") || t.includes("swap") || t.includes("risk-off") || t.includes("vault"))
    return { title: "Risk-off capital router", sub: "Move idle capital between USDC, USYC and swap routes when the agent detects hostile conditions.", intent: "RFB 04", proof: "USDC denominated settlement" };
  if (t.includes("arbitrage") || t.includes("arb") || t.includes("engine"))
    return { title: "Cross-platform arbitrage route", sub: "Detect price gaps, choose route, estimate slippage and show the CCTP/Gateway path before execution.", intent: "RFB 05", proof: "route + receipt" };
  if (t.includes("portfolio"))
    return { title: "Adaptive portfolio manager", sub: "Detect market regime, rebalance exposure and park capital in risk-off assets when needed.", intent: "RFB 04", proof: "allocation plan" };
  if (t.includes("circle") || t.includes("x402") || t.includes("kit") || t.includes("merchant"))
    return { title: "Circle and Arc tool console", sub: "Use App Kit, CCTP, Gateway, x402 and nanopayment flows as the product's settlement layer.", intent: "Circle stack", proof: "USDC payments on Arc" };
  if (t.includes("receipt"))
    return { title: "Arc settlement ledger", sub: "Review paid agent actions and receipts that prove which product flows actually settled.", intent: "Proof layer", proof: "receipt history" };
  return null;
}

