import { useState, useMemo, useEffect } from "react";
import { FileText, Loader2, TrendingUp, Zap } from "lucide-react";
import { Code2 } from "lucide-react";
import { useAppState } from "../../app-state";
import { useLocalStore } from "../../lib/storage";
import { deterministicScore, hashId } from "../../lib/util-hash";
import { fmtUsd } from "../../lib/ws-helpers";
import type { Workspace } from "../../types";
import { Bolt, Check, Plus, Robot } from "../../icons402";
import { fetchMantleGasPrice } from "../../lib/mantle";
import { fetchPrices } from "../../lib/prices";
import { checkFunding, fundingReceiptPayload, requestWalletPerCallSignature, MNT_FUNDING_SCOPE } from "./funding";

// ---------------------------------------------------------------------------
// MANTLE — Earn Calculator (mETH / USDY tab)
// ---------------------------------------------------------------------------
async function fetchMantleApys(): Promise<{ mETH: number; USDY: number }> {
  const defaults = { mETH: 4.12, USDY: 5.03 };
  try {
    const res = await fetch("https://meth.mantle.xyz/api/v1/protocol/rates", { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return defaults;
    const data = await res.json() as { stakingAPR?: string | number; [k: string]: unknown };
    const methApy = data.stakingAPR ? parseFloat(String(data.stakingAPR)) * 100 : 0;
    return { mETH: methApy > 0 ? +methApy.toFixed(2) : defaults.mETH, USDY: defaults.USDY };
  } catch { return defaults; }
}

export function MantleEarnCalc({ workspace: _workspace }: { workspace: Workspace }) {
  const [amount, setAmount] = useState("1000");
  const [asset, setAsset] = useState<"mETH" | "USDY">("mETH");
  const [liveApy, setLiveApy] = useState<Record<"mETH" | "USDY", number>>({ mETH: 4.12, USDY: 5.03 });
  const APY = liveApy;
  const apy = APY[asset];

  useEffect(() => { fetchMantleApys().then(setLiveApy); }, []);
  const principal = parseFloat(amount) || 0;

  const periods = [
    { label: "7 days",   days: 7 },
    { label: "30 days",  days: 30 },
    { label: "90 days",  days: 90 },
    { label: "1 year",   days: 365 },
  ] as const;

  const earn = (days: number) => +(principal * apy / 100 * days / 365).toFixed(4);
  const maxEarn = earn(365);
  const col = asset === "mETH" ? "#3b82f6" : "#10b981";

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft">📈</span><div><h3>How much will I earn?</h3><div className="sub">enter your amount → see projected yield for {asset} at {apy}% APY</div></div></div>
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        <div className="row sm" style={{ gap: 10, marginBottom: 18 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>I have</span>
            <input value={amount} onChange={(e) => setAmount(e.currentTarget.value)} inputMode="decimal" style={{ padding: "10px 12px", borderRadius: 10, border: `2px solid ${col}`, background: "var(--bg-2)", color: "var(--ink)", fontSize: "1.15rem", fontWeight: 800 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Asset</span>
            <div className="row sm" style={{ gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid var(--line-2)" }}>
              {(["mETH", "USDY"] as const).map((a) => <button key={a} type="button" className="btn btn-ghost btn-sm" style={{ borderRadius: 0, background: asset === a ? col : "var(--bg-2)", color: asset === a ? "#fff" : "var(--muted)", fontWeight: asset === a ? 800 : 400, padding: "9px 16px" }} onClick={() => setAsset(a)}>{a}</button>)}
            </div>
          </label>
        </div>
        {/* bar chart */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, alignItems: "end", height: 120 }}>
          {periods.map((p) => {
            const e = earn(p.days);
            const h = maxEarn > 0 ? Math.max(8, (e / maxEarn) * 90) : 8;
            return (
              <div key={p.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: ".78rem", fontWeight: 900, color: col }}>${e.toFixed(2)}</div>
                <div style={{ width: "100%", height: h, background: col, borderRadius: "6px 6px 0 0", opacity: 0.85 }} />
                <div style={{ fontSize: ".64rem", color: "var(--muted)", textAlign: "center" }}>{p.label}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, background: `color-mix(in srgb, ${col} 10%, var(--bg-2))`, border: `1px solid ${col}30` }}>
          <span style={{ fontWeight: 900, color: col, fontSize: ".95rem" }}>${principal.toFixed(2)}</span>
          <span style={{ color: "var(--muted)", fontSize: ".85rem" }}> in {asset} at {apy}% APY earns </span>
          <span style={{ fontWeight: 900, color: col, fontSize: ".95rem" }}>${earn(365).toFixed(2)}</span>
          <span style={{ color: "var(--muted)", fontSize: ".85rem" }}> over 1 year</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANTLE — Agent Economy Dashboard (Economy tab)
// ---------------------------------------------------------------------------
type EconomyAgent = { id: string; name: string; erc8004Id: string; balance: number; spentToday: number; cap: number; status: "active" | "paused" };
const SEED_ECON_AGENTS: EconomyAgent[] = [
  { id: "ea_01", name: "Yield Optimizer", erc8004Id: "0x8004a1f3", balance: 12.4, spentToday: 3.2, cap: 10, status: "active" },
  { id: "ea_02", name: "Alpha Tracker", erc8004Id: "0x8004b7c2", balance: 5.1, spentToday: 1.0, cap: 5, status: "active" },
  { id: "ea_03", name: "RWA Monitor", erc8004Id: "0x8004c9d0", balance: 8.8, spentToday: 0.6, cap: 8, status: "paused" },
];
export function MantleAgentEconomyDashboard({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [agents, setAgents] = useLocalStore<EconomyAgent[]>("mantle.agents.econ", SEED_ECON_AGENTS);
  const [newName, setNewName] = useState("Strategy Agent");
  const [newCap, setNewCap] = useState("10");
  const [fundId, setFundId] = useState<string | null>(null);
  const [fundAmt, setFundAmt] = useState("5");
  const agentSparkline = (id: string) => Array.from({ length: 7 }, (_, i) => deterministicScore(id + i, 2, 22));

  const deployAgent = async () => {
    const erc8004Id = "0x8004" + hashId("8004", newName + Date.now(), 4);
    const walletAddr = "0x" + hashId("wa", newName + erc8004Id, 12);
    const cap = parseFloat(newCap) || 5;
    // Manual agent deployment — needs a per-call wallet signature, never the Agent Treasury.
    try { await requestWalletPerCallSignature(MNT_FUNDING_SCOPE, 0.05, "agent-deploy"); } catch { return; }
    const ag: EconomyAgent = { id: "ea_" + hashId("ea", newName + Date.now(), 4), name: newName.trim() || "Unnamed", erc8004Id, balance: 0, spentToday: 0, cap, status: "active" };
    setAgents((p) => [ag, ...p].slice(0, 10));
    emitReceipt({ workspaceId: workspace.id, serviceName: "Mantle Agent · Deploy ERC-8004", amount: 0.05, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.agent.deploy", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.05, { mode: "wallet_per_call", serviceId: "agent-deploy", settlement: "live" }, { erc8004Id, wallet: walletAddr, cap }) });
  };
  const fundAgent = async (id: string) => {
    const a = parseFloat(fundAmt) || 0; if (a <= 0) return;
    // Manual agent funding (capital movement) — needs a per-call wallet signature, never the Agent Treasury.
    try { await requestWalletPerCallSignature(MNT_FUNDING_SCOPE, a, "agent-fund"); } catch { return; }
    setAgents((p) => p.map((ag) => ag.id === id ? { ...ag, balance: +(ag.balance + a).toFixed(2) } : ag));
    emitReceipt({ workspaceId: workspace.id, serviceName: "Mantle Agent · Fund", amount: a, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.agent.fund", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, a, { mode: "wallet_per_call", serviceId: "agent-fund", settlement: "live" }, { agentId: id, amount: a }) });
    setFundId(null);
  };
  const toggleStatus = (id: string) => setAgents((p) => p.map((ag) => ag.id === id ? { ...ag, status: ag.status === "active" ? "paused" : "active" } : ag));

  const totalManaged = agents.reduce((s, a) => s + a.balance, 0);
  const totalSpent = agents.reduce((s, a) => s + a.spentToday, 0);
  const recent = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind?.startsWith("mantle.agent")).slice(0, 6), [receipts, workspace.id]);

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Robot width={15} height={15} /></span><div><h3>Agent Economy</h3><div className="sub">ERC-8004 on-chain agent identities · individual budgets · real-time spend tracking · fund & pause</div></div></div>
        <button className="btn btn-acc btn-sm" type="button" onClick={deployAgent}><Plus width={13} height={13} /> Deploy agent</button>
      </div>
      {/* economy stats */}
      <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "Agents", val: agents.length.toString(), col: "#10b981" },
          { label: "Active", val: agents.filter((a) => a.status === "active").length.toString(), col: "#3b82f6" },
          { label: "Total managed", val: `$${totalManaged.toFixed(2)}`, col: "#8b5cf6" },
          { label: "Spent today", val: `$${totalSpent.toFixed(2)}`, col: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} style={{ padding: "10px 12px", borderRadius: 12, background: s.col + "12", border: `1px solid ${s.col}30`, textAlign: "center" }}>
            <div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 900, color: s.col, marginTop: 3 }}>{s.val}</div>
          </div>
        ))}
      </div>
      {/* deploy form */}
      <div style={{ padding: "0 16px 12px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
        <input value={newName} onChange={(e) => setNewName(e.currentTarget.value)} placeholder="Agent name" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }} />
        <input value={newCap} onChange={(e) => setNewCap(e.currentTarget.value)} inputMode="decimal" placeholder="Daily cap $" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }} />
      </div>
      {/* agent cards */}
      <div style={{ padding: "0 16px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {agents.map((ag) => {
          const spentPct = Math.min(ag.spentToday / ag.cap * 100, 100);
          const barCol = spentPct > 80 ? "var(--red)" : spentPct > 50 ? "#f59e0b" : "#10b981";
          const pts = agentSparkline(ag.id).map((h, i) => `${i * 10},${24 - h}`).join(" ");
          return (
            <div key={ag.id} style={{ borderRadius: 14, border: `1px solid ${ag.status === "active" ? "#10b98140" : "var(--line-2)"}`, background: "var(--bg-2)", padding: "12px 14px", opacity: ag.status === "paused" ? 0.65 : 1 }}>
              <div className="row sm" style={{ gap: 8, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "#10b98118", border: "1.5px solid #10b98160", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: ".78rem", color: "#10b981" }}>{ag.name[0]}</div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: ".88rem" }}>{ag.name}</div><div style={{ fontFamily: "var(--mono)", fontSize: ".64rem", color: "var(--muted)", marginTop: 1 }}>ERC-8004 {ag.erc8004Id}</div></div>
                <span className={`pill ${ag.status === "active" ? "ok" : ""}`} style={{ fontSize: ".6rem" }}>{ag.status}</span>
              </div>
              {/* spend bar */}
              <div style={{ marginBottom: 6 }}>
                <div className="row sm" style={{ justifyContent: "space-between", fontSize: ".64rem", color: "var(--muted)", marginBottom: 3 }}><span>Spent today</span><span style={{ fontWeight: 700, color: barCol }}>${ag.spentToday.toFixed(2)} / ${ag.cap}</span></div>
                <div style={{ height: 5, borderRadius: 3, background: "var(--line-2)", overflow: "hidden" }}><div style={{ height: "100%", width: `${spentPct}%`, background: barCol, borderRadius: 3, transition: "width .3s" }} /></div>
              </div>
              {/* balance + sparkline */}
              <div className="row sm" style={{ gap: 8, justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: ".78rem" }}>Balance: <b style={{ color: "#10b981" }}>${ag.balance.toFixed(2)}</b></span>
                <svg width="70" height="24" viewBox="0 0 62 26"><polyline points={pts} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" /><polyline points={pts + " 60,24 0,24"} fill="#10b98118" stroke="none" /></svg>
              </div>
              <div className="row sm" style={{ gap: 6 }}>
                <button type="button" className="btn btn-acc btn-sm" style={{ flex: 1, fontSize: ".7rem" }} onClick={() => setFundId(fundId === ag.id ? null : ag.id)}><Plus width={11} height={11} /> Fund</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: ".7rem" }} onClick={() => toggleStatus(ag.id)}>{ag.status === "active" ? "Pause" : "Resume"}</button>
              </div>
              {fundId === ag.id && (
                <div className="row sm" style={{ gap: 6, marginTop: 6 }}>
                  <input value={fundAmt} onChange={(e) => setFundAmt(e.currentTarget.value)} inputMode="decimal" style={{ flex: 1, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".82rem" }} />
                  <button type="button" className="btn btn-acc btn-sm" style={{ fontSize: ".7rem" }} onClick={() => fundAgent(ag.id)}>Send $</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {recent.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "4px 0 6px" }}>Recent · {recent.length}</div>
          <div className="svc-hist">{recent.map((r) => <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "#10b981" }} /><div className="svc-hist__main"><b>{r.serviceName}</b><span>{new Date(r.createdAt).toLocaleTimeString()}</span></div><span className="svc-hist__amt">{r.amount.toFixed(2)}</span></div>)}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANTLE — Portfolio Rebalancer (mETH/USDY tab)
// ---------------------------------------------------------------------------
export function MantlePortfolioRebalancer({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [targetMeth, setTargetMeth] = useState(60);
  const targetUsdy = 100 - targetMeth;
  const [currentMeth, setCurrentMeth] = useLocalStore<number>("mantle.rebalancer.currentMeth", 72);
  const currentUsdy = 100 - currentMeth;
  const drift = Math.abs(currentMeth - targetMeth);
  const driftCol = drift < 5 ? "var(--green)" : drift < 15 ? "#f59e0b" : "var(--red)";
  const swapDir = currentMeth > targetMeth ? "mETH → USDY" : "USDY → mETH";
  const swapAmt = +(Math.abs(currentMeth - targetMeth) * 10).toFixed(2);
  const [autoRebalance, setAutoRebalance] = useState(false);
  const [done, setDone] = useState(false);
  const [rebErr, setRebErr] = useState<string | null>(null);

  const rebalance = async () => {
    // Manual portfolio rebalance — needs a per-call wallet signature, never the Agent Treasury.
    try {
      await requestWalletPerCallSignature(MNT_FUNDING_SCOPE, swapAmt, "svc_mnt_meth");
    } catch {
      setRebErr("Wallet signature required — rebalance not executed. This is a manual wallet action; it never spends the Agent Treasury.");
      return;
    }
    setRebErr(null);
    emitReceipt({ workspaceId: workspace.id, serviceName: `Mantle Rebalancer · ${swapDir}`, amount: swapAmt, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.rebalance", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, swapAmt, { mode: "wallet_per_call", serviceId: "svc_mnt_meth", settlement: "live" }, { from: currentMeth, to: targetMeth, swapAmt, swapDir }) });
    setCurrentMeth(targetMeth);
    setDone(true); setTimeout(() => setDone(false), 2000);
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft">⚖️</span><div><h3>Portfolio Rebalancer</h3><div className="sub">set target mETH/USDY mix · see drift from target · one-click rebalance · auto-rebalance toggle</div></div></div>
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        {/* current vs target */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          {[
            { label: "Current allocation", meth: currentMeth, usdy: currentUsdy, muted: true },
            { label: "Target allocation", meth: targetMeth, usdy: targetUsdy, muted: false },
          ].map((c) => (
            <div key={c.label} style={{ padding: "12px 14px", borderRadius: 14, background: "var(--bg-2)", border: `1px solid ${c.muted ? "var(--line-2)" : "var(--accent-primary)40"}` }}>
              <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700, marginBottom: 8 }}>{c.label}</div>
              <div style={{ height: 10, borderRadius: 5, background: "#3b82f6", display: "flex", overflow: "hidden", marginBottom: 8 }}>
                <div style={{ flex: c.meth, background: "#3b82f6" }} />
                <div style={{ flex: c.usdy, background: "#10b981" }} />
              </div>
              <div className="row sm" style={{ gap: 12 }}>
                <span style={{ fontSize: ".78rem" }}><span style={{ color: "#3b82f6", fontWeight: 800 }}>{c.meth}%</span> mETH</span>
                <span style={{ fontSize: ".78rem" }}><span style={{ color: "#10b981", fontWeight: 800 }}>{c.usdy}%</span> USDY</span>
              </div>
            </div>
          ))}
        </div>
        {/* target slider */}
        <div style={{ marginBottom: 16 }}>
          <div className="row sm" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: ".7rem", color: "var(--muted)" }}>Drag to set target mETH %</span>
            <span style={{ fontWeight: 800, color: "var(--accent-primary)" }}>{targetMeth}% mETH / {targetUsdy}% USDY</span>
          </div>
          <input type="range" min={10} max={90} value={targetMeth} onChange={(e) => { setTargetMeth(Number(e.currentTarget.value)); setDone(false); }} style={{ width: "100%", accentColor: "#3b82f6" }} />
        </div>
        {/* drift hero */}
        <div style={{ padding: "12px 16px", borderRadius: 14, background: `color-mix(in srgb, ${driftCol} 8%, var(--bg-2))`, border: `1px solid ${driftCol}30`, marginBottom: 12 }}>
          <div className="row sm" style={{ gap: 12 }}>
            <div>
              <div style={{ fontSize: ".6rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Drift</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: driftCol }}>{drift.toFixed(0)}%</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: ".72rem", color: "var(--muted)", marginBottom: 2 }}>To rebalance:</div>
              <div style={{ fontSize: ".9rem", fontWeight: 800 }}>Swap ${swapAmt} {swapDir}</div>
            </div>
            <button type="button" className="btn btn-acc" style={{ padding: "9px 18px", fontWeight: 800 }} onClick={rebalance} disabled={done}>{done ? <><Check width={14} height={14} /> Done!</> : "Rebalance now"}</button>
          </div>
        </div>
        {rebErr && <div style={{ marginBottom: 12, padding: "7px 12px", borderRadius: 9, background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)", fontSize: ".74rem", fontWeight: 600 }}>{rebErr}</div>}
        {/* auto-rebalance toggle */}
        <label className="row sm" style={{ gap: 8, cursor: "pointer", fontSize: ".82rem" }}>
          <input type="checkbox" checked={autoRebalance} onChange={(e) => setAutoRebalance(e.currentTarget.checked)} />
          <span>Auto-rebalance when drift exceeds <b>10%</b></span>
          {autoRebalance && <span className="pill ok" style={{ fontSize: ".6rem" }}>Active</span>}
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANTLE — Gas Cost Optimizer (AI DevTools tab)
// ---------------------------------------------------------------------------
export function MantleGasOptimizer({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState("0.05");
  const [realGwei, setRealGwei] = useState<number | null>(null);

  useEffect(() => {
    fetchMantleGasPrice().then((s) => { const n = parseFloat(s); if (n > 0) setRealGwei(n); }).catch(() => {});
  }, []);

  const hours = Array.from({ length: 24 }, (_, h) => ({ h, gwei: +(deterministicScore(`gas_mantle_h${h}`, 0.01, 0.18)).toFixed(3) }));
  const minGas = Math.min(...hours.map((x) => x.gwei));
  const maxGas = Math.max(...hours.map((x) => x.gwei));
  const cheapHour = hours.reduce((a, b) => a.gwei < b.gwei ? a : b);
  const currentHour = new Date().getHours();
  const currentGwei = realGwei ?? hours[currentHour]?.gwei ?? 0.05;
  const ethL1Gwei = 18.4;
  const savingPct = Math.round((1 - currentGwei / ethL1Gwei) * 100);

  const setAlert = () => {
    emitReceipt({ workspaceId: workspace.id, serviceName: "Mantle Gas Alert · Set", amount: 0, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.gas.alert", payload: { threshold: parseFloat(alertThreshold) } });
  };

  const gweiBg = (gwei: number) => {
    const pct = (gwei - minGas) / (maxGas - minGas);
    const r = Math.round(pct * 239 + 16); const g = Math.round((1 - pct) * 185 + 90); const b = 50;
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Zap width={15} height={15} /></span><div><h3>Gas Cost Optimizer</h3><div className="sub">cheapest time to transact on Mantle today · current vs Ethereum L1 · set a gas price alert</div></div></div>
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        {/* hero stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Current Mantle gas", val: `${currentGwei} gwei`, col: "#10b981" },
            { label: "Cheapest window", val: `${cheapHour.h}:00 UTC (${cheapHour.gwei} gwei)`, col: "#3b82f6" },
            { label: "Savings vs Ethereum", val: `${savingPct > 0 ? savingPct : ">99"}% cheaper`, col: "#8b5cf6" },
          ].map((s) => (
            <div key={s.label} style={{ padding: "10px 12px", borderRadius: 12, background: s.col + "12", border: `1px solid ${s.col}28`, textAlign: "center" }}>
              <div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 700 }}>{s.label}</div>
              <div style={{ fontSize: ".9rem", fontWeight: 900, color: s.col, marginTop: 3 }}>{s.val}</div>
            </div>
          ))}
        </div>
        {/* 24h heatmap */}
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 6 }}>24h gas heatmap (gwei) — green = cheap · red = expensive</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, marginBottom: 14 }}>
          {hours.map((x) => (
            <div key={x.h} title={`${x.h}:00 — ${x.gwei} gwei`} style={{ height: 32, borderRadius: 4, background: gweiBg(x.gwei), opacity: x.h === currentHour ? 1 : 0.75, border: x.h === currentHour ? "1.5px solid #fff8" : "none", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              {x.h % 6 === 0 && <span style={{ fontSize: ".48rem", color: "#fff9", paddingBottom: 2 }}>{x.h}h</span>}
            </div>
          ))}
        </div>
        {/* alert */}
        <div style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--field)" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>Gas price alert</div>
          <div className="row sm" style={{ gap: 8 }}>
            <label className="row sm" style={{ gap: 6, fontSize: ".8rem", cursor: "pointer" }}>
              <input type="checkbox" checked={alertEnabled} onChange={(e) => setAlertEnabled(e.currentTarget.checked)} />
              Notify when gas drops below
            </label>
            <input value={alertThreshold} onChange={(e) => setAlertThreshold(e.currentTarget.value)} inputMode="decimal" style={{ width: 70, padding: "6px 8px", borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".82rem" }} />
            <span style={{ fontSize: ".8rem" }}>gwei</span>
            <button type="button" className="btn btn-acc btn-sm" onClick={setAlert} disabled={!alertEnabled}>{alertEnabled ? "Save alert" : "Enable first"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANTLE — Alpha Desk (Alpha terminal tab)
// ---------------------------------------------------------------------------
type AlphaDrop = { id: string; at: string; conf: number; text: string };
const ALPHA_ITEMS: AlphaDrop[] = [
  { id: "a0", at: "09:14", conf: 91, text: "mETH APY trending +0.3% vs 7d avg — accumulate bias confirmed by on-chain flow" },
  { id: "a1", at: "08:41", conf: 76, text: "T-BILL 90D tranche filling fast; next issuance window in 3d — front-run window open" },
  { id: "a2", at: "07:58", conf: 83, text: "USDY / USDC spread compressed to 0.04% — neutral rotation signal" },
  { id: "a3", at: "06:30", conf: 68, text: "RWA basket A- collateral ratio dipped to 102% — monitor closely, grade may slip" },
  { id: "a4", at: "05:11", conf: 88, text: "mETH / USDC pool depth +14% overnight — improved fill for large strategy rebalance" },
];
const ALPHA_LINES = [
  "mETH staking flow turned net-positive over the last 4h — accumulate window",
  "USDY APY ticked to {x}% — rotation edge vs mETH widening",
  "T-BILL {x}D tranche {x}% subscribed — issuance front-run window {x}d",
  "RWA basket grade-{g} collateral ratio at {x}% — {note}",
  "mETH/USDT depth +{x}% — large rebalance fills cleanly now",
  "Smart-money cluster rotated {x}% mETH → USDY at block {x}",
];
function makeAlphaDrop(seed: string): AlphaDrop {
  const tIdx = Math.floor(deterministicScore(seed + "|t", 0, ALPHA_LINES.length - 0.001));
  const conf = Math.round(deterministicScore(seed + "|c", 58, 95));
  const x1 = deterministicScore(seed + "|x", 2, 18).toFixed(1);
  const grade = (["A", "A-", "BBB"] as const)[Math.floor(deterministicScore(seed + "|g", 0, 2.999))]!;
  const note = conf > 80 ? "stable" : "watch for downgrade";
  const text = (ALPHA_LINES[tIdx] ?? ALPHA_LINES[0]!).replace(/\{x\}/g, x1).replace(/\{g\}/g, grade).replace(/\{note\}/g, note);
  const now = new Date();
  return { id: "ad_" + hashId("ad", seed, 6), at: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), conf, text };
}

export function AlphaDesk({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [feed, setFeed] = useState<AlphaDrop[]>(ALPHA_ITEMS);
  const [pulls, setPulls] = useState(0);
  const [subbed, setSubbed] = useLocalStore<boolean>("mantle.alpha.sub", false);
  const [livePrice, setLivePrice] = useState<{ mnt: number; change: number } | null>(null);
  const [pullErr, setPullErr] = useState<string | null>(null);
  const recent = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "mantle.alpha.pull").slice(0, 6), [receipts, workspace.id]);
  const dot = (c: number) => c > 80 ? "#1fb58a" : c > 70 ? "#ff9b00" : "var(--muted)";

  const pull = async () => {
    // Autonomous agent data call — gated by the Mantle Agent Treasury.
    const preflight = checkFunding(MNT_FUNDING_SCOPE, 0.04, { mode: "treasury", serviceId: "svc_mnt_meth" });
    if (!preflight.ok) {
      setPullErr(`Autonomous alpha pull blocked — ${preflight.reason}. Sign a treasury allowance in the Agent Treasury panel above.`);
      return;
    }
    setPullErr(null);
    const n = pulls + 1;
    // fetch real MNT price to anchor alpha drops in real data
    let freshPrice = livePrice;
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=mantle&vs_currencies=usd&include_24hr_change=true", { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json() as { mantle?: { usd: number; usd_24h_change?: number } };
        if (data.mantle) { freshPrice = { mnt: data.mantle.usd, change: data.mantle.usd_24h_change ?? 0 }; setLivePrice(freshPrice); }
      }
    } catch { /* use existing livePrice */ }
    const fresh = [makeAlphaDrop(`${workspace.id}|p${n}|0`), makeAlphaDrop(`${workspace.id}|p${n}|1`)];
    setFeed((f) => [...fresh, ...f].slice(0, 12));
    setPulls(n);
    // Alpha drops are generated locally — fallback receipt (amount 0), no live settlement, no treasury deduction.
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_mnt_meth", serviceName: "Mantle Alpha Desk · Pull (local)", amount: 0, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.alpha.pull", status: "pending", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.04, { mode: "treasury", serviceId: "svc_mnt_meth", settlement: "fallback" }, { drops: fresh.map((d) => ({ conf: d.conf, text: d.text })), pull: n, mntPrice: freshPrice?.mnt }) });
  };
  const toggleSub = () => {
    const next = !subbed; setSubbed(next);
    if (next) emitReceipt({ workspaceId: workspace.id, serviceName: "Mantle Alpha Desk · Subscribe", amount: 0, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.alpha.pull", payload: { event: "subscription_active" } });
  };

  return (
    <div className="panel block svc-flavor" style={{ overflow: "hidden" }}>
      {/* Terminal header bar */}
      <div style={{ background: "var(--bg-3, #0d1117)", borderBottom: "1px solid var(--line-2)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: subbed ? "#1fb58a" : "#555" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff9b00" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#e63946" }} />
          </div>
          <span style={{ fontFamily: "monospace", fontSize: ".75rem", color: "#8b949e", letterSpacing: ".04em" }}>MANTLE ALPHA TERMINAL{subbed ? " — LIVE" : ""}</span>
          {livePrice && (
            <span style={{ fontFamily: "monospace", fontSize: ".72rem", color: livePrice.change >= 0 ? "#1fb58a" : "#e63946", fontWeight: 700, marginLeft: 8 }}>
              MNT ${livePrice.mnt.toFixed(4)} {livePrice.change >= 0 ? "▲" : "▼"}{Math.abs(livePrice.change).toFixed(2)}%
            </span>
          )}
        </div>
        <span style={{ display: "flex", gap: 6 }}>
          <button className={"btn btn-sm" + (subbed ? " btn-ghost" : "")} style={{ fontFamily: "monospace", fontSize: ".7rem" }} type="button" onClick={toggleSub}>{subbed ? "[LIVE ✓]" : "[SUBSCRIBE]"}</button>
          <button className="btn btn-acc btn-sm" style={{ fontFamily: "monospace", fontSize: ".7rem" }} type="button" onClick={pull}>[PULL $0.04]</button>
        </span>
      </div>

      {pullErr && (
        <div style={{ margin: "10px 16px 0", padding: "7px 12px", borderRadius: 9, background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)", fontSize: ".72rem", fontWeight: 600 }}>{pullErr}</div>
      )}

      {/* Terminal body */}
      <div style={{ background: "color-mix(in srgb, var(--bg-3, #0d1117) 60%, transparent)", padding: "8px 0", maxHeight: 360, overflowY: "auto" }}>
        {feed.map((a, i) => {
          const c = dot(a.conf);
          const confLabel = a.conf > 80 ? "HIGH" : a.conf > 70 ? " MED" : " LOW";
          return (
            <div key={a.id} style={{ display: "flex", gap: 0, alignItems: "flex-start", borderLeft: `3px solid ${c}`, marginBottom: 1, padding: "7px 14px", background: i === 0 ? `color-mix(in srgb, ${c} 6%, transparent)` : "transparent", transition: "background .3s" }}>
              <span style={{ fontFamily: "monospace", fontSize: ".68rem", color: "#8b949e", whiteSpace: "nowrap", marginRight: 10, paddingTop: 1 }}>{a.at}</span>
              <span style={{ fontFamily: "monospace", fontSize: ".68rem", fontWeight: 800, color: c, whiteSpace: "nowrap", marginRight: 10, paddingTop: 1 }}>[{confLabel} {a.conf}%]</span>
              <span style={{ fontFamily: "monospace", fontSize: ".75rem", color: "var(--ink)", lineHeight: 1.45 }}>{a.text}</span>
            </div>
          );
        })}
        <div style={{ fontFamily: "monospace", fontSize: ".68rem", color: "#8b949e", padding: "8px 14px", borderLeft: "3px solid transparent" }}>
          <span style={{ animation: "blink 1s step-end infinite" }}>█</span> {pulls > 0 ? `${pulls} pull${pulls === 1 ? "" : "s"} · ${pulls * 2} signals ingested` : "awaiting first pull…"}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 0, borderTop: "1px solid var(--line-2)", fontSize: ".68rem", fontFamily: "monospace" }}>
        {([["signals", feed.length], ["high conf", feed.filter(a => a.conf > 80).length], ["med conf", feed.filter(a => a.conf > 70 && a.conf <= 80).length], ["cost", `$${(pulls * 0.04).toFixed(2)}`]] as [string, string|number][]).map(([k, v]) => (
          <div key={k} style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--line-2)", textAlign: "center" }}>
            <div style={{ color: "var(--muted)", marginBottom: 2 }}>{k}</div>
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>{v}</div>
          </div>
        ))}
      </div>
      {recent.length > 0 && <div style={{ display: "none" }}>{recent.length}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANTLE — RWA portfolio (RWA Data tab)
// ---------------------------------------------------------------------------
const RWA_BASKETS = [
  { id: "rwa_tbill90", name: "US T-Bills 90D", grade: "AAA", duration: "90d", baseApy: 5.3 },
  { id: "rwa_tbill180", name: "US T-Bills 180D", grade: "AAA", duration: "180d", baseApy: 5.1 },
  { id: "rwa_ig_credit", name: "IG Corporate Credit", grade: "A", duration: "1.8y", baseApy: 6.4 },
  { id: "rwa_re_income", name: "Real-Estate Income", grade: "BBB", duration: "3.0y", baseApy: 7.8 },
  { id: "rwa_priv_credit", name: "Private Credit Pool", grade: "BBB-", duration: "1.2y", baseApy: 9.2 },
] as const;
const RWA_GRADE_RUNGS = ["AAA", "AA", "A", "BBB", "BBB-", "BB"] as const;
const RWA_DONUT_COLORS = ["#1fb58a", "#3aa0e6", "#7C5CF8", "#ff9b00", "#e63946", "#d8ff2f"];
function rwaGradeIdx(g: string): number { const i = (RWA_GRADE_RUNGS as readonly string[]).indexOf(g); return i >= 0 ? i : RWA_GRADE_RUNGS.length - 1; }
function rwaGradeColor(g: string): string { return g.startsWith("AAA") ? "#1fb58a" : g.startsWith("AA") ? "#3aa0e6" : g.startsWith("A") ? "#3aa0e6" : g.startsWith("BBB") ? "#ff9b00" : "#e63946"; }
export function RwaRegistry({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const baskets = useMemo(() => {
    const raw = RWA_BASKETS.map((b) => ({
      ...b,
      apy: Number((b.baseApy + deterministicScore(b.id + "|apy", -0.4, 0.4)).toFixed(2)),
      tvl: Number(deterministicScore(b.id + "|tvl", 8, 220).toFixed(1)),
      wRaw: deterministicScore(b.id + "|w", 9, 30),
    }));
    const sum = raw.reduce((s, b) => s + b.wRaw, 0);
    let used = 0;
    return raw.map((b, i) => {
      const w = i === raw.length - 1 ? 100 - used : Math.round((b.wRaw / sum) * 100);
      used += w;
      return { ...b, weight: w, color: RWA_DONUT_COLORS[i % RWA_DONUT_COLORS.length]! };
    });
  }, []);
  const [selId, setSelId] = useState<string>(RWA_BASKETS[0].id);
  const [running, setRunning] = useState(false);
  const [reportErr, setReportErr] = useState<string | null>(null);
  const [report, setReport] = useState<{ basketId: string; collateralRatio: number; defaultProb: number; stress: string; recommendation: string; reportId: string } | null>(null);
  const sel = baskets.find((b) => b.id === selId) ?? baskets[0]!;
  const portfolioApy = (baskets.reduce((s, b) => s + b.apy * b.weight, 0) / 100);
  const wGradeIdx = Math.round(baskets.reduce((s, b) => s + rwaGradeIdx(b.grade) * b.weight, 0) / 100);
  const wGrade = RWA_GRADE_RUNGS[Math.min(wGradeIdx, RWA_GRADE_RUNGS.length - 1)]!;
  const totalTvl = baskets.reduce((s, b) => s + b.tvl, 0);

  // donut geometry
  const R = 46, STROKE = 16, CIRC = 2 * Math.PI * R;
  let acc = 0;
  const segs = baskets.map((b) => {
    const frac = b.weight / 100;
    const s = { id: b.id, color: b.color, len: CIRC * frac, gap: CIRC * (1 - frac), offset: -CIRC * acc };
    acc += frac;
    return s;
  });

  const runReport = async () => {
    // Autonomous agent data call — gated by the Mantle Agent Treasury.
    const preflight = checkFunding(MNT_FUNDING_SCOPE, 0.06, { mode: "treasury", serviceId: "svc_mnt_stress" });
    if (!preflight.ok) {
      setReportErr(`Autonomous RWA risk report blocked — ${preflight.reason}. Sign a treasury allowance first.`);
      return;
    }
    setReportErr(null);
    setRunning(true);
    await new Promise((r) => setTimeout(r, 520));
    const b = sel;
    const collateralRatio = Math.round(deterministicScore(b.id + "|cr", 101, 138));
    const defaultProb = Number(deterministicScore(b.id + "|dp", 0.05, 2.4).toFixed(2));
    const stress = collateralRatio < 108 || defaultProb > 1.5 ? "fails -20% rate shock" : collateralRatio < 118 ? "marginal under -20% rate shock" : "passes -20% rate shock";
    const recommendation = defaultProb < 0.6 && collateralRatio > 115 ? "size up to target weight" : defaultProb < 1.2 ? "hold at current weight" : "trim — grade may slip";
    const reportId = "rwar_" + hashId("rwar", b.id + Date.now(), 8);
    // Risk report computed locally — fallback receipt (amount 0), no live settlement, no treasury deduction.
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_mnt_stress", serviceName: `RWA Risk Report · ${b.name} (local)`, amount: 0, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.rwa.report", status: "pending", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.06, { mode: "treasury", serviceId: "svc_mnt_stress", settlement: "fallback" }, { basket: b.name, basketId: b.id, grade: b.grade, collateralRatio, defaultProb, stress, recommendation, reportId }) });
    setReport({ basketId: b.id, collateralRatio, defaultProb, stress, recommendation, reportId });
    setRunning(false);
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><FileText width={15} height={15} /></span><div><h3>RWA portfolio</h3><div className="sub">tokenised real-world assets on Mantle · allocation by weight, credit quality at a glance · risk reports run on the Agent Treasury</div></div></div>
      </div>
      {reportErr && (
        <div style={{ margin: "0 16px 12px", padding: "7px 12px", borderRadius: 9, background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)", fontSize: ".74rem", fontWeight: 600 }}>{reportErr}</div>
      )}

      {/* Donut + ladder side by side */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "0 16px 14px", alignItems: "flex-start" }}>
        {/* Allocation donut */}
        <div style={{ position: "relative", flex: "0 0 auto" }}>
          <svg width={128} height={128} viewBox="0 0 128 128" role="img" aria-label="RWA allocation">
            <circle cx={64} cy={64} r={R} fill="none" stroke="var(--line-2)" strokeWidth={STROKE} opacity={0.4} />
            {segs.map((s) => (
              <circle key={s.id} cx={64} cy={64} r={R} fill="none" stroke={s.color} strokeWidth={selId === s.id ? STROKE + 4 : STROKE}
                strokeDasharray={`${s.len} ${s.gap}`} strokeDashoffset={s.offset} transform="rotate(-90 64 64)"
                style={{ cursor: "pointer", transition: "stroke-width .15s" }} onClick={() => setSelId(s.id)} />
            ))}
            <text x={64} y={59} textAnchor="middle" fontSize="9" fill="var(--muted)" fontWeight="700">PORTFOLIO APY</text>
            <text x={64} y={76} textAnchor="middle" fontSize="20" fill="var(--ink)" fontWeight="800">{portfolioApy.toFixed(2)}%</text>
          </svg>
        </div>
        {/* Stats + grade ladder */}
        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>Weighted grade</div><div style={{ fontSize: "1.1rem", fontWeight: 800, color: rwaGradeColor(wGrade) }}>{wGrade}</div></div>
            <div><div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>Total TVL</div><div style={{ fontSize: "1.1rem", fontWeight: 800 }}>${totalTvl.toFixed(0)}M</div></div>
            <div><div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>Baskets</div><div style={{ fontSize: "1.1rem", fontWeight: 800 }}>{baskets.length}</div></div>
          </div>
          {/* Credit-grade ladder */}
          <div>
            <div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800, marginBottom: 4 }}>Credit-grade ladder</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {RWA_GRADE_RUNGS.map((rung) => {
                const here = baskets.filter((b) => b.grade === rung);
                if (here.length === 0 && rung !== "AA" && rung !== "BB") { /* keep rung visible only if AAA/A/BBB/BBB- present somewhere */ }
                return (
                  <div key={rung} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", opacity: here.length ? 1 : 0.35 }}>
                    <span style={{ width: 36, fontSize: ".7rem", fontWeight: 800, color: rwaGradeColor(rung), textAlign: "right" }}>{rung}</span>
                    <div style={{ flex: 1, height: 18, borderRadius: 6, background: "var(--bg-2)", border: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 4, padding: "0 5px" }}>
                      {here.map((b) => (
                        <button key={b.id} type="button" onClick={() => setSelId(b.id)} title={`${b.name} · ${b.weight}%`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", borderRadius: 5, padding: "1px 6px", fontSize: ".66rem", fontWeight: 700, cursor: "pointer", background: selId === b.id ? b.color : `color-mix(in srgb, ${b.color} 22%, transparent)`, color: selId === b.id ? "#fff" : "var(--ink)" }}>
                          {b.name.replace(/ \d.*$/, "").slice(0, 16)} {b.weight}%
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend (clickable allocation rows) */}
      <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {baskets.map((b) => (
          <div key={b.id} onClick={() => setSelId(b.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", borderRadius: 10, border: `1px solid ${selId === b.id ? "var(--accent-primary)" : "var(--line-2)"}`, background: selId === b.id ? "color-mix(in srgb, var(--accent-primary) 7%, transparent)" : "var(--bg-2)", cursor: "pointer" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flex: "none" }} />
            <span style={{ flex: 1, fontSize: ".84rem", fontWeight: 700 }}>{b.name}</span>
            <span className="pill" style={{ background: `color-mix(in srgb, ${rwaGradeColor(b.grade)} 16%, transparent)`, color: rwaGradeColor(b.grade), fontWeight: 800, flex: "none", fontSize: ".68rem" }}>{b.grade}</span>
            <span style={{ flex: "none", fontSize: ".74rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>{b.duration}</span>
            <span style={{ flex: "none", fontSize: ".82rem", fontWeight: 700 }}>{b.apy.toFixed(2)}%</span>
            <span style={{ flex: "none", fontSize: ".82rem", fontWeight: 800, color: "var(--accent-primary)", minWidth: 38, textAlign: "right" }}>{b.weight}%</span>
          </div>
        ))}
      </div>

      {/* Selected basket detail + risk report */}
      <div style={{ margin: "0 16px 14px", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--bg-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: report?.basketId === sel.id ? 10 : 0 }}>
          <span style={{ width: 12, height: 12, borderRadius: 4, background: sel.color }} />
          <div style={{ flex: 1, minWidth: 160 }}><div style={{ fontSize: ".95rem", fontWeight: 800 }}>{sel.name}</div><div style={{ fontSize: ".72rem", color: "var(--muted)" }}>{sel.grade} · {sel.duration} duration · {sel.weight}% of portfolio · ${sel.tvl.toFixed(1)}M TVL · {sel.apy.toFixed(2)}% APY</div></div>
          <button className="btn btn-acc btn-sm" type="button" onClick={runReport} disabled={running}>{running ? <><Loader2 size={13} className="wallet-spin" /> Scoring…</> : <><Bolt width={13} height={13} /> Get risk report ($0.06)</>}</button>
        </div>
        {report?.basketId === sel.id && (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid var(--line-2)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 110 }}><span style={{ fontSize: ".56rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>Report</span><span style={{ fontSize: ".74rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>{report.reportId}</span></div>
            {[["Collateral", report.collateralRatio + "%", report.collateralRatio < 108 ? "#e63946" : report.collateralRatio < 118 ? "#ff9b00" : "#1fb58a"], ["Default prob 12m", report.defaultProb + "%", report.defaultProb > 1.5 ? "#e63946" : report.defaultProb > 0.8 ? "#ff9b00" : "#1fb58a"], ["Stress test", report.stress, report.stress.startsWith("fails") ? "#e63946" : report.stress.startsWith("marginal") ? "#ff9b00" : "#1fb58a"], ["Recommendation", report.recommendation, "var(--ink)"]].map(([k, v, c]) => (
              <div key={String(k)} style={{ display: "flex", flexDirection: "column", gap: 1 }}><span style={{ fontSize: ".56rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>{k}</span><span style={{ fontSize: ".88rem", fontWeight: 800, color: String(c) }}>{v}</span></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANTLE — Agent economy loop (Agent Wallets tab)
// ---------------------------------------------------------------------------
type MantleEconomy = { deployedUsd: number; methAcquired: number; deploys: number };
const METH_PRICE = 3120;
export function MantleEconomyLoop({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [eco, setEco] = useLocalStore<MantleEconomy>("mantle.economy", { deployedUsd: 0, methAcquired: 0, deploys: 0 });
  const [fraction, setFraction] = useState("0.5");
  const [liveEthPrice, setLiveEthPrice] = useState(METH_PRICE);
  useEffect(() => {
    fetchPrices().then((p) => { if (p["ETH"] && p["ETH"] > 0) setLiveEthPrice(p["ETH"]); }).catch(() => {});
  }, []);
  const wsReceipts = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id), [receipts, workspace.id]);
  const revenue = useMemo(() => wsReceipts.filter((r) => r.kind !== "mantle.deploy").reduce((s, r) => s + r.amount, 0), [wsReceipts]);
  const threshold = 0.05;
  const surplus = Math.max(0, revenue - eco.deployedUsd - threshold);
  const methNow = liveEthPrice * (1 + 0.012); // +1.2% mark
  const lpCurrent = eco.methAcquired * methNow;
  const yieldUsd = lpCurrent - eco.deployedUsd;
  const aiSpend = useMemo(() => wsReceipts.filter((r) => r.kind === "mantle.backtest" || r.kind === "mantle.alpha.pull" || (r.kind ?? "").startsWith("mantle.rwa")).reduce((s, r) => s + r.amount, 0), [wsReceipts]);
  const netProfit = revenue + yieldUsd - aiSpend;
  const deploys = useMemo(() => wsReceipts.filter((r) => r.kind === "mantle.deploy").slice(0, 6), [wsReceipts]);
  // simulated agent wallet balances
  const mnt = Number((4.2 + deterministicScore(workspace.id + "|mnt", 0, 6)).toFixed(3));

  const deploy = async () => {
    const fr = Math.min(1, Math.max(0.05, parseFloat(fraction) || 0.5));
    const amt = Number((surplus * fr).toFixed(4));
    if (amt <= 0) return;
    // Manual yield allocation (capital movement) — needs a per-call wallet signature, never the Agent Treasury.
    try {
      await requestWalletPerCallSignature(MNT_FUNDING_SCOPE, amt, "svc_mnt_meth");
    } catch {
      return;
    }
    const methGot = amt / liveEthPrice;
    setEco((e) => ({ deployedUsd: Number((e.deployedUsd + amt).toFixed(4)), methAcquired: Number((e.methAcquired + methGot).toFixed(8)), deploys: e.deploys + 1 }));
    emitReceipt({ workspaceId: workspace.id, serviceName: "Agent Economy · Deploy surplus → mETH", amount: amt, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.deploy", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, amt, { mode: "wallet_per_call", serviceId: "svc_mnt_meth", settlement: "live" }, { deployedUsd: amt, methAcquired: methGot, fraction: fr, txHash: "0x" + hashId("tx", "deploy" + Date.now(), 12) }) });
  };

  const Node = ({ n, title, value, sub, active }: { n: string; title: string; value: string; sub: string; active?: boolean }) => (
    <div style={{ flex: 1, minWidth: 150, padding: "12px 14px", borderRadius: 14, border: `1px solid ${active ? "color-mix(in srgb, var(--accent-primary) 40%, var(--line-2))" : "var(--line-2)"}`, background: active ? "color-mix(in srgb, var(--accent-primary) 7%, transparent)" : "var(--bg-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ fontSize: ".64rem", fontWeight: 800, color: active ? "var(--accent-primary)" : "var(--muted)" }}>{n}</span><span style={{ fontSize: ".74rem", fontWeight: 700 }}>{title}</span></div>
      <div style={{ fontSize: "1.25rem", fontWeight: 800, color: active ? "var(--accent-primary)" : "var(--ink)", letterSpacing: "-.02em" }}>{value}</div>
      <div style={{ fontSize: ".66rem", color: "var(--muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><TrendingUp width={15} height={15} /></span><div><h3>Agent economy loop · earn → store → deploy → yield</h3><div className="sub">x402 revenue lands in the agent wallet; surplus over ${threshold.toFixed(2)} is deployed into mETH on Mantle and marked to market</div></div></div>
        <span className="row sm" style={{ gap: 8 }}>
          <select value={fraction} onChange={(e) => setFraction(e.currentTarget.value)} style={{ padding: "6px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem" }}>{["0.25", "0.5", "0.75", "1.0"].map((f) => <option key={f} value={f}>deploy {Math.round(parseFloat(f) * 100)}% of surplus</option>)}</select>
          <button className="btn btn-acc btn-sm" type="button" onClick={deploy} disabled={surplus <= 0}><Bolt width={13} height={13} /> Deploy surplus → mETH</button>
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, padding: "0 16px 12px", flexWrap: "wrap", alignItems: "stretch" }}>
        <Node n="1 · EARN" title="x402 revenue" value={fmtUsd(revenue)} sub={`${wsReceipts.length} receipts`} active={revenue > 0} />
        <Node n="2 · STORE" title="agent wallet" value={`${mnt} MNT`} sub={`+ ${eco.methAcquired.toFixed(5)} mETH`} />
        <Node n="3 · DEPLOY" title="into mETH" value={fmtUsd(eco.deployedUsd)} sub={`${eco.deploys} deploys · surplus ${fmtUsd(surplus)}`} active={surplus > 0} />
        <Node n="4 · YIELD" title="mark-to-market" value={(yieldUsd >= 0 ? "+" : "") + fmtUsd(yieldUsd)} sub={`pos ${fmtUsd(lpCurrent)} @ ${methNow.toLocaleString()}`} active={yieldUsd > 0} />
      </div>
      <div style={{ margin: "0 16px 12px", padding: "8px 12px", borderRadius: 10, background: "var(--field)", fontSize: ".76rem", color: "var(--muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>Revenue <b style={{ color: "var(--ink)" }}>{fmtUsd(revenue)}</b></span>
        <span>AI/data spend <b style={{ color: "var(--ink)" }}>{fmtUsd(aiSpend)}</b></span>
        <span>Yield <b style={{ color: yieldUsd >= 0 ? "#1fb58a" : "#e63946" }}>{(yieldUsd >= 0 ? "+" : "") + fmtUsd(yieldUsd)}</b></span>
        <span>Net <b style={{ color: netProfit >= 0 ? "#1fb58a" : "#e63946" }}>{(netProfit >= 0 ? "+" : "") + fmtUsd(netProfit)}</b></span>
      </div>
      {deploys.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent deploys · {deploys.length}</div>
          <div className="svc-hist">{deploys.map((r) => { const p = (r.payload ?? {}) as { deployedUsd?: number; methAcquired?: number; txHash?: string }; return (
            <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "#1fb58a" }} /><div className="svc-hist__main"><b>{fmtUsd(p.deployedUsd ?? r.amount)} → {(p.methAcquired ?? 0).toFixed(6)} mETH</b><span>{(p.txHash ?? "").slice(0, 14)}… · {new Date(r.createdAt).toLocaleTimeString()}</span></div><span className="svc-hist__amt">{r.amount.toFixed(3)}</span></div>
          ); })}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANTLE — Yield board (mETH vs USDY) + agent rotation
// ---------------------------------------------------------------------------
export function YieldBoard({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState<string | null>(null);
  const [holding, setHolding] = useState<"mETH" | "USDY">("mETH");
  const [holdAmt, setHoldAmt] = useState("1000");

  const meth = { apy: Number(deterministicScore("meth-apy", 3.6, 4.8).toFixed(2)), tvl: 182, risk: "Low", protocol: "Mantle LSP", symbol: "mETH", color: "#1fb58a" };
  const usdy = { apy: Number(deterministicScore("usdy-apy", 4.4, 5.4).toFixed(2)), tvl: 74, risk: "Very Low", protocol: "Ondo Finance", symbol: "USDY", color: "#3aa0e6" };
  const winner = usdy.apy >= meth.apy ? "USDY" : "mETH";
  const loser = winner === "USDY" ? "mETH" : "USDY";
  const movePct = Math.round(deterministicScore("rot-pct", 25, 55));
  const history = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "mantle.yield.rotate").slice(0, 6), [receipts, workspace.id]);

  const totalApy = meth.apy + usdy.apy;
  const methBarPct = Math.round((meth.apy / totalApy) * 100);
  const usdyBarPct = 100 - methBarPct;

  const projAmt = Number(holdAmt) || 0;
  const projAsset = holding === "mETH" ? meth : usdy;
  const proj30 = (projAmt * projAsset.apy / 100 / 12).toFixed(2);
  const proj365 = (projAmt * projAsset.apy / 100).toFixed(2);

  const approveRotation = async () => {
    setRotating(true);
    // Manual yield rotation — needs a per-call wallet signature, never the Agent Treasury.
    try {
      await requestWalletPerCallSignature(MNT_FUNDING_SCOPE, 0.03, "svc_mnt_meth");
    } catch {
      setRotating(false);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
    const rid = emitReceipt({ workspaceId: workspace.id, serviceId: "svc_mnt_meth", serviceName: "mETH/USDY Yield Rotation", amount: 0.03, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.yield.rotate", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.03, { mode: "wallet_per_call", serviceId: "svc_mnt_meth", settlement: "live" }, { from: loser, to: winner, movePct, methApy: meth.apy, usdyApy: usdy.apy }) });
    setRotated(rid.id);
    setRotating(false);
  };

  const winnerAsset = winner === "USDY" ? usdy : meth;
  const spread = Math.abs(usdy.apy - meth.apy).toFixed(2);

  return (
    <div className="panel block svc-flavor" style={{ overflow: "hidden" }}>
      {/* Real-user answer hero — the first thing you see */}
      <div style={{ padding: "14px 18px", background: `color-mix(in srgb, ${winnerAsset.color} 10%, var(--bg-2))`, borderBottom: `2px solid color-mix(in srgb, ${winnerAsset.color} 30%, var(--line-2))` }}>
        <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 800, color: "var(--muted)", marginBottom: 4 }}>Best yield for your mETH right now</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "1.6rem", fontWeight: 900, letterSpacing: "-.04em", color: winnerAsset.color }}>{winner}</span>
          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>at {winnerAsset.apy.toFixed(2)}% APY</span>
          <span style={{ fontSize: ".8rem", color: "var(--muted)" }}>— <b style={{ color: "var(--ink)" }}>+{spread}%</b> more than {loser} right now</span>
        </div>
        <div style={{ fontSize: ".72rem", color: "var(--muted)", marginTop: 3 }}>Rotate {movePct}% of your {loser} position to gain this edge · one click below</div>
      </div>

      {/* Header */}
      <div className="block-head" style={{ borderBottom: "1px solid var(--line-2)", paddingBottom: 12 }}>
        <div className="ttl"><span className="sq soft"><TrendingUp width={15} height={15} /></span><div><h3>mETH vs USDY · yield race</h3><div className="sub">Full comparison · yield projector · rotation advisor · $0.03 / query</div></div></div>
      </div>

      {/* Head-to-head two-column comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 0, padding: "20px 20px 0" }}>
        {/* mETH column */}
        <div style={{ textAlign: "center", padding: "0 12px" }}>
          <div style={{ fontSize: ".7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", color: meth.color, marginBottom: 6 }}>{meth.symbol}</div>
          <div style={{ fontSize: "2.8rem", fontWeight: 900, letterSpacing: "-.04em", color: winner === "mETH" ? meth.color : "var(--ink)", lineHeight: 1 }}>{meth.apy.toFixed(2)}<span style={{ fontSize: "1rem", fontWeight: 700 }}>%</span></div>
          <div style={{ fontSize: ".68rem", color: "var(--muted)", marginTop: 4 }}>APY · {meth.protocol}</div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
            {[["TVL", `$${meth.tvl}M`], ["Risk", meth.risk], ["Type", "Liquid Staking"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", padding: "3px 8px", borderRadius: 6, background: "var(--field)" }}>
                <span style={{ color: "var(--muted)" }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
          {winner === "mETH" && <div style={{ marginTop: 10, fontSize: ".68rem", fontWeight: 800, color: meth.color, padding: "4px 10px", borderRadius: 8, background: `color-mix(in srgb, ${meth.color} 12%, transparent)` }}>▲ HIGHER NOW</div>}
        </div>

        {/* VS divider */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 8px", gap: 6 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 900, color: "var(--muted)", letterSpacing: ".05em" }}>VS</div>
          <div style={{ width: 1, flex: 1, background: "var(--line-2)" }} />
        </div>

        {/* USDY column */}
        <div style={{ textAlign: "center", padding: "0 12px" }}>
          <div style={{ fontSize: ".7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", color: usdy.color, marginBottom: 6 }}>{usdy.symbol}</div>
          <div style={{ fontSize: "2.8rem", fontWeight: 900, letterSpacing: "-.04em", color: winner === "USDY" ? usdy.color : "var(--ink)", lineHeight: 1 }}>{usdy.apy.toFixed(2)}<span style={{ fontSize: "1rem", fontWeight: 700 }}>%</span></div>
          <div style={{ fontSize: ".68rem", color: "var(--muted)", marginTop: 4 }}>APY · {usdy.protocol}</div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
            {[["TVL", `$${usdy.tvl}M`], ["Risk", usdy.risk], ["Type", "Yield-bearing USD"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", padding: "3px 8px", borderRadius: 6, background: "var(--field)" }}>
                <span style={{ color: "var(--muted)" }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
          {winner === "USDY" && <div style={{ marginTop: 10, fontSize: ".68rem", fontWeight: 800, color: usdy.color, padding: "4px 10px", borderRadius: 8, background: `color-mix(in srgb, ${usdy.color} 12%, transparent)` }}>▲ HIGHER NOW</div>}
        </div>
      </div>

      {/* APY Race bar */}
      <div style={{ margin: "16px 20px 0" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 6 }}>APY race · relative share</div>
        <div style={{ display: "flex", height: 20, borderRadius: 10, overflow: "hidden", gap: 2 }}>
          <div style={{ width: `${methBarPct}%`, background: meth.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".6rem", fontWeight: 800, color: "#fff", transition: "width .5s" }}>{meth.apy.toFixed(2)}%</div>
          <div style={{ flex: 1, background: usdy.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".6rem", fontWeight: 800, color: "#fff" }}>{usdy.apy.toFixed(2)}%</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".6rem", color: "var(--muted)", marginTop: 3 }}>
          <span style={{ color: meth.color, fontWeight: 700 }}>mETH {methBarPct}%</span>
          <span style={{ color: usdy.color, fontWeight: 700 }}>{usdyBarPct}% USDY</span>
        </div>
      </div>

      {/* Yield projector */}
      <div style={{ margin: "14px 20px", padding: "12px 14px", borderRadius: 12, background: "var(--field)", border: "1px solid var(--line-2)" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>Your yield projector</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="number" value={holdAmt} onChange={(e) => setHoldAmt(e.currentTarget.value)} placeholder="Amount USD" style={{ width: 110, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem" }} />
          <select value={holding} onChange={(e) => setHolding(e.currentTarget.value as "mETH" | "USDY")} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem" }}>
            <option value="mETH">mETH</option>
            <option value="USDY">USDY</option>
          </select>
          <div style={{ display: "flex", gap: 10, fontSize: ".78rem" }}>
            <span style={{ color: "var(--muted)" }}>30d: <b style={{ color: "var(--accent-primary)" }}>${proj30}</b></span>
            <span style={{ color: "var(--muted)" }}>1y: <b style={{ color: "var(--accent-primary)" }}>${proj365}</b></span>
            <span style={{ color: "var(--muted)" }}>@ <b>{projAsset.apy}% APY</b></span>
          </div>
        </div>
      </div>

      {/* Rotation advisor */}
      <div style={{ margin: "0 20px 16px", padding: "10px 14px", borderRadius: 12, border: `1px solid color-mix(in srgb, var(--accent-primary) 30%, var(--line-2))`, background: "color-mix(in srgb, var(--accent-primary) 5%, transparent)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: ".82rem", flex: 1, minWidth: 220 }}>
          Agent advisor: rotate <b>{movePct}%</b> of {loser} → <b style={{ color: "var(--accent-primary)" }}>{winner}</b> for <b>+{Math.abs(usdy.apy - meth.apy).toFixed(2)}%</b> APY spread.
        </span>
        <button className="btn btn-acc btn-sm" type="button" onClick={approveRotation} disabled={rotating}>{rotating ? <><Loader2 size={13} className="wallet-spin" /> Rotating…</> : <><Check width={13} height={13} /> Approve rotation</>}</button>
      </div>
      {rotated && (
        <div style={{ margin: "-8px 20px 14px", padding: "7px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--green) 12%, transparent)", color: "var(--green)", fontSize: ".78rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
          <Check width={14} height={14} /> Rotation queued — receipt <code style={{ background: "rgba(0,0,0,.14)", padding: "1px 5px", borderRadius: 5 }}>{rotated.slice(0, 14)}…</code>
        </div>
      )}
      {history.length > 0 && (
        <div style={{ padding: "0 20px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Rotation history · {history.length}</div>
          <div className="svc-hist">
            {history.map((r) => {
              const p = (r.payload ?? {}) as { from?: string; to?: string; movePct?: number };
              const col = p.to === "mETH" ? meth.color : usdy.color;
              return (
                <div className="svc-hist__row" key={r.id}>
                  <span className="svc-hist__dot" style={{ background: col }} />
                  <div className="svc-hist__main"><b>{p.movePct ?? "?"}% {p.from} → {p.to}</b><span>{new Date(r.createdAt).toLocaleTimeString()}</span></div>
                  <span className="svc-hist__amt">${r.amount.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANTLE — DevTools Panel (AI DevTools tab)
// ---------------------------------------------------------------------------
const MANTLE_API_ENDPOINTS = [
  { id: "svc_mantle_backtest_api", name: "Backtest Runner API", method: "POST", path: "/api/gateway/svc_mantle_alpha", price: "0.10 MNT", desc: "Run a strategy backtest via x402 — submit {pair, strategy, days} → returns {returns, sharpe, maxDrawdown}" },
  { id: "svc_mantle_yield_api", name: "Yield Projection API", method: "GET", path: "/api/gateway/svc_mantle_yield", price: "0.02 MNT", desc: "Project yield for mETH/USDY/RWA — query {asset, amount, days} → projected returns" },
  { id: "svc_mantle_alpha_api", name: "Alpha Signal API", method: "GET", path: "/api/gateway/svc_mantle_alpha", price: "0.05 MNT", desc: "Real-time alpha signal for a Mantle asset → {signal, confidence, source}" },
] as const;
type RegisteredApi = { id: string; endpointId: string; name: string; path: string; registeredAt: string; calls: number };
export function MantleDevToolsPanel({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [registered, setRegistered] = useLocalStore<RegisteredApi[]>("mantle.devtools.apis", []);
  const [selected, setSelected] = useState<string>(MANTLE_API_ENDPOINTS[0]!.id);
  const [busy, setBusy] = useState(false);
  const endpoint = MANTLE_API_ENDPOINTS.find((e) => e.id === selected) ?? MANTLE_API_ENDPOINTS[0]!;
  const isRegistered = registered.some((r) => r.endpointId === selected);
  const _apiBase = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "https://tollgate-1.onrender.com").replace(/\/+$/, "");
  const curlSnippet = `curl -X ${endpoint.method} \\
  -H "X-PAYMENT: dev-bypass" \\
  -H "X-Agent-Id: agent_mantle_devtools" \\
  ${_apiBase}${endpoint.path}`;
  const register = async () => {
    setBusy(true);
    // Manual API registration (listing action) — needs a per-call wallet signature, never the Agent Treasury.
    try { await requestWalletPerCallSignature(MNT_FUNDING_SCOPE, 0.05, "svc_mnt_backtest"); } catch { setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 500));
    const api: RegisteredApi = { id: "api_" + hashId("mnt", selected + Date.now(), 8), endpointId: selected, name: endpoint.name, path: endpoint.path, registeredAt: new Date().toISOString(), calls: 0 };
    setRegistered((prev) => [api, ...prev]);
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_mnt_backtest", serviceName: `DevTools · Register ${endpoint.name}`, amount: 0.05, currency: "MNT", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.devtools.register", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.05, { mode: "wallet_per_call", serviceId: "svc_mnt_backtest", settlement: "live" }, { endpointId: selected, name: endpoint.name, path: endpoint.path, price: endpoint.price }) });
    setBusy(false);
  };
  const simulate = (api: RegisteredApi) => {
    setRegistered((prev) => prev.map((a) => a.id === api.id ? { ...a, calls: a.calls + 1 } : a));
    // Simulated call — fallback receipt (amount 0), no live settlement, no treasury spend.
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_mnt_backtest", serviceName: `DevTools · Simulate call ${api.name} (local)`, amount: 0, currency: "MNT", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.devtools.simulate", status: "pending", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.01, { mode: "wallet_per_call", serviceId: "svc_mnt_backtest", settlement: "fallback" }, { apiId: api.id, name: api.name }) });
  };
  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Code2 width={15} height={15} /></span><div><h3>AI DevTools · Publish API</h3><div className="sub">register a Mantle strategy as a paid x402 API endpoint · share code snippets · AI DevTools track</div></div></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 10px" }}>
        {MANTLE_API_ENDPOINTS.map((ep) => (
          <div key={ep.id} onClick={() => setSelected(ep.id)} style={{ padding: "9px 12px", borderRadius: 11, border: `1px solid ${selected === ep.id ? "var(--accent-primary)" : "var(--line-2)"}`, background: selected === ep.id ? "color-mix(in srgb, var(--accent-primary) 8%, transparent)" : "var(--bg-2)", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={`mth mth--${ep.method.toLowerCase()}`} style={{ fontSize: ".68rem" }}>{ep.method}</span>
              <code style={{ fontSize: ".76rem", fontWeight: 700 }}>{ep.path.split("/").pop()}</code>
              <span className="pill" style={{ background: "color-mix(in srgb, var(--accent-primary) 14%, transparent)", color: "var(--accent-primary)", fontSize: ".68rem", marginLeft: "auto" }}>{ep.price}</span>
            </div>
            <div style={{ fontSize: ".72rem", color: "var(--muted)", marginTop: 4 }}>{ep.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ margin: "0 16px 10px", padding: "10px 12px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
        <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700, marginBottom: 6 }}>curl snippet</div>
        <pre style={{ margin: 0, fontFamily: "var(--mono)", fontSize: ".72rem", color: "var(--ink)", whiteSpace: "pre-wrap" }}>{curlSnippet}</pre>
      </div>
      <div style={{ padding: "0 16px 14px" }}>
        <button className="btn btn-acc btn-sm" type="button" onClick={register} disabled={busy || isRegistered}>{busy ? <Loader2 size={13} className="wallet-spin" /> : <Zap width={13} height={13} />} {isRegistered ? "Already registered" : "Register as API (0.05 MNT)"}</button>
      </div>
      {registered.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0 8px" }}>Registered APIs · {registered.length}</div>
          <div className="svc-table__scroll"><table className="svc-table">
            <thead><tr><th>API</th><th>Path</th><th className="svc-table__num">Calls</th><th>Action</th></tr></thead>
            <tbody>{registered.map((a) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 700, fontSize: ".8rem" }}>{a.name}</td>
                <td><code style={{ fontSize: ".68rem" }}>{a.path}</code></td>
                <td className="svc-table__num">{a.calls}</td>
                <td><button className="btn btn-sm btn-ghost" type="button" onClick={() => simulate(a)}><Zap width={11} height={11} /> Simulate</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
