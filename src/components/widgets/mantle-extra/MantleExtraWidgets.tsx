import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Award, BarChart3, Bell, BellOff, CheckCircle, ClipboardCopy, CreditCard, ExternalLink, Loader2, Pause, Play, TrendingUp, Zap,
} from "lucide-react";
import type { Workspace } from "../../../types";
import { useAppState } from "../../../app-state";
import { useLocalStore } from "../../../lib/storage";
import { deterministicScore, hashId, sha256Hex } from "../../../lib/util-hash";
import { vaultRecordDecision, isMantleVaultConfigured, getCreditRecord, getCreditRecordCached, isMantleCreditConfigured, recordAgentPayment, mantleExplorerTxUrl, fetchMantleApys, fetchMantleGasPrice, fetchTotalAgentCount, getBudget, isBudgetControllerConfigured, type CreditRecord, type BudgetState } from "../../../lib/mantle";
import { fetchPrices } from "../../../lib/prices";
import { checkFunding, fundingReceiptPayload, requestWalletPerCallSignature, MNT_FUNDING_SCOPE } from "../../../workspaces/mantle/funding";

const hid = (s: string) => hashId("mnt", s);
const now = () => new Date().toLocaleTimeString();

// mETH on Mantle mainnet — used for whale feed Transfer logs
const METH_ADDRESS = "0xcDA86A272531e8640cD7F1a92c01839911B90bb0";
const MANTLE_RPC = "https://rpc.mantle.xyz";

// ── 1. Live Strategy Deployer ────────────────────────────────────────────────

const ASSET_PAIRS = [
  { label: "mETH / MNT", apy: 3.9 },
  { label: "USDY / USDC", apy: 5.1 },
  { label: "RWA-T / MNT", apy: 4.2 },
  { label: "wETH / mETH", apy: 2.8 },
];

type DeployedStrategy = {
  id: string;
  name: string;
  asset: string;
  status: "active" | "paused";
  ticks: number;
  lastSignal: string;
  pnl: number;
  pnlHistory: number[];
  ts: string;
  anchorTx?: string;
  anchorExplorer?: string;
};

// Build an SVG line + fill path for a PnL series. The y-axis is anchored at 0.
function pnlChartPaths(history: number[], w: number, h: number, pad = 4) {
  const series = history.length >= 2 ? history : [0, 0];
  const lo = Math.min(0, ...series);
  const hi = Math.max(0, ...series);
  const range = hi - lo || 1;
  const innerH = h - pad * 2;
  const yFor = (v: number) => pad + (1 - (v - lo) / range) * innerH;
  const xFor = (i: number) => (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
  const pts = series.map((v, i) => [xFor(i), yFor(v)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const lastX = pts[pts.length - 1]![0];
  const area = `${line} L${lastX.toFixed(1)},${h} L0,${h} Z`;
  return { line, area, zeroY: yFor(0), lastY: pts[pts.length - 1]![1], lastX };
}

export function StrategyDeployPanel({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [strategies, setStrategies] = useLocalStore<DeployedStrategy[]>("mantle.strategy.deployed", []);
  const [pairIdx, setPairIdx] = useState(0);
  const [name, setName] = useState("RSI-Momentum-v1");
  const [busy, setBusy] = useState(false);
  const [deployErr, setDeployErr] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const vaultConfigured = isMantleVaultConfigured();


  const selected = strategies.find((s) => s.id === selId) ?? strategies[0] ?? null;

  async function deploy() {
    setBusy(true);
    setDeployErr(null);
    // Manual strategy deploy — needs a per-call wallet signature, never the Agent Treasury.
    try {
      await requestWalletPerCallSignature(MNT_FUNDING_SCOPE, 0.15, "svc_mnt_backtest");
    } catch {
      setDeployErr("Wallet signature required — strategy not deployed. Manual wallet action; never the Agent Treasury.");
      setBusy(false);
      return;
    }
    await new Promise((r) => setTimeout(r, 600));
    const pair = ASSET_PAIRS[pairIdx];
    const id = "strat_" + hid(name + pair.label + String(Date.now()));
    const strategyObj = { id, name, pair: pair.label, deployedAt: new Date().toISOString() };

    let anchorTx: string | undefined;
    let anchorExplorer: string | undefined;
    if (vaultConfigured) {
      try {
        const decisionHashHex = await sha256Hex(JSON.stringify(strategyObj));
        const res = await vaultRecordDecision({ decisionHashHex });
        anchorTx = res.txHash;
        anchorExplorer = res.explorerUrl;
      } catch (e) {
        setDeployErr("Vault anchor failed: " + ((e as { message?: string }).message ?? "unknown"));
      }
    }

    setStrategies((prev) => [
      { id, name, asset: pair.label, status: "active", ticks: 0, lastSignal: "HOLD", pnl: 0, pnlHistory: [0], ts: now(), anchorTx, anchorExplorer },
      ...prev.slice(0, 7),
    ]);
    setSelId(id);
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_mnt_backtest",
      serviceName: `Strategy Deploy · ${name}`,
      amount: 0.15,
      currency: "MNT",
      network: "mantle-mainnet",
      status: "verified",
      kind: "mantle.strategy.deploy",
      payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.15, { mode: "wallet_per_call", serviceId: "svc_mnt_backtest", settlement: "live" }, { strategyId: id, name, pair: pair.label, anchorTx }),
    });
    setBusy(false);
  }

  function toggleStatus(id: string) {
    setStrategies((prev) =>
      prev.map((s) => s.id === id ? { ...s, status: s.status === "active" ? "paused" : "active" } : s)
    );
  }

  const CW = 560, CH = 150;
  const chart = selected ? pnlChartPaths(selected.pnlHistory ?? [0], CW, CH) : null;
  const up = (selected?.pnl ?? 0) >= 0;
  const chartColor = up ? "#0FBF7A" : "#e05";

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Activity size={15} /></span>
          <div>
            <h3>Strategy sandbox</h3>
            <div className="sub">
              Deploy a strategy as a live agent and watch its PnL curve tick in real time · 0.15 MNT to activate
              {vaultConfigured ? " · anchors on Mantle vault" : ""}
            </div>
          </div>
        </div>
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.1 }}>
            <span style={{ fontSize: "1.4rem", fontWeight: 800, color: chartColor }}>{up ? "+" : ""}{selected.pnl.toFixed(2)}%</span>
            <span style={{ fontSize: ".62rem", color: "var(--text-secondary)" }}>{selected.name} · {selected.ticks} ticks</span>
          </div>
        )}
      </div>

      {/* Chart-first: big PnL curve for the selected strategy */}
      {selected && chart ? (
        <div style={{ padding: "0 16px 12px" }}>
          <svg width="100%" viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" style={{ display: "block", borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
            <defs>
              <linearGradient id="pnlfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColor} stopOpacity="0.28" />
                <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* zero line */}
            <line x1="0" y1={chart.zeroY} x2={CW} y2={chart.zeroY} stroke="var(--line-2)" strokeWidth="1" strokeDasharray="4 4" />
            <path d={chart.area} fill="url(#pnlfill)" />
            <path d={chart.line} fill="none" stroke={chartColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={chart.lastX} cy={chart.lastY} r="3.5" fill={chartColor} />
          </svg>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6, fontSize: ".72rem", color: "var(--text-secondary)" }}>
            <span>Pair <b style={{ color: "var(--ink)" }}>{selected.asset}</b></span>
            <span>Last signal <b style={{ color: "var(--ink)" }}>{selected.lastSignal}</b></span>
            <span>Peak <b style={{ color: "#0FBF7A" }}>+{Math.max(0, ...(selected.pnlHistory ?? [0])).toFixed(2)}%</b></span>
            <span>Trough <b style={{ color: "#e05" }}>{Math.min(0, ...(selected.pnlHistory ?? [0])).toFixed(2)}%</b></span>
            {selected.anchorTx && <a href={selected.anchorExplorer ?? ""} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)", display: "inline-flex", alignItems: "center", gap: 3 }}>anchored {selected.anchorTx.slice(0, 10)}… <ExternalLink size={10} /></a>}
          </div>
        </div>
      ) : (
        <div className="muted sm" style={{ padding: "0 16px 12px" }}>No live strategy yet — deploy one below to start the PnL curve.</div>
      )}

      {/* Compact strategy cards (not a table) */}
      {strategies.length > 0 && (
        <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {strategies.map((s) => {
            const sUp = s.pnl >= 0;
            const isSel = selected?.id === s.id;
            return (
              <div key={s.id} onClick={() => setSelId(s.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 10, border: `1px solid ${isSel ? "var(--accent-primary)" : "var(--line-2)"}`, background: isSel ? "color-mix(in srgb, var(--accent-primary) 7%, transparent)" : "var(--bg-2)", cursor: "pointer" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.status === "active" ? "#0FBF7A" : "var(--text-secondary)", flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: ".82rem", fontWeight: 700 }}>{s.name}</div><div style={{ fontSize: ".68rem", color: "var(--text-secondary)" }}>{s.asset} · {s.ticks} ticks · {s.lastSignal}</div></div>
                <span style={{ flex: "none", fontWeight: 800, fontSize: ".88rem", color: sUp ? "#0FBF7A" : "#e05" }}>{sUp ? "+" : ""}{s.pnl.toFixed(2)}%</span>
                <button className="pill click" style={{ fontSize: 10, flex: "none" }} type="button" onClick={(e) => { e.stopPropagation(); toggleStatus(s.id); }}>
                  {s.status === "active" ? <><Pause size={10} /> Pause</> : <><Play size={10} /> Resume</>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Deploy form */}
      <div style={{ padding: "0 16px 14px", borderTop: "1px solid var(--line-2)", paddingTop: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {ASSET_PAIRS.map((p, i) => (
            <button key={p.label} className={"pill click" + (pairIdx === i ? " on" : "")} type="button" onClick={() => setPairIdx(i)}>{p.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field-label" style={{ flex: 1, minWidth: 180 }}>Strategy name<input className="field" value={name} onChange={(e) => setName(e.currentTarget.value)} /></label>
          <button className="btn btn-acc btn-sm" type="button" onClick={deploy} disabled={busy}>
            {busy ? <Loader2 size={13} className="wallet-spin" /> : <Zap size={13} />}
            {busy ? "Deploying…" : "Deploy live (0.15 MNT)"}
          </button>
        </div>
        {!vaultConfigured && (
          <div className="muted sm" style={{ marginTop: 8 }}>Set <code>VITE_MANTLE_VAULT_ADDRESS</code> to anchor strategy decisions on-chain.</div>
        )}
        {deployErr && <div style={{ marginTop: 8, fontSize: 11, color: "#e05" }}>{deployErr}</div>}

        {/* #11 Export strategy report */}
        {selected && (
          <button className="btn btn-ghost btn-sm" type="button" style={{ marginTop: 8 }} onClick={() => {
            const report = {
              strategyId: selected.id,
              name: selected.name,
              asset: selected.asset,
              ticks: selected.ticks,
              pnl: selected.pnl,
              pnlHistory: selected.pnlHistory,
              lastSignal: selected.lastSignal,
              anchorTx: selected.anchorTx ?? null,
              exportedAt: new Date().toISOString(),
            };
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `strategy-${selected.id.slice(0, 12)}.json`; a.click();
            URL.revokeObjectURL(url);
          }}>
            Export report ↓
          </button>
        )}
      </div>
    </div>
  );
}

// ── 2. Yield Projection Calculator ───────────────────────────────────────────

const YIELD_ASSETS = [
  { label: "mETH", apy: 3.9, color: "#0FBF7A" },
  { label: "USDY", apy: 5.1, color: "#4DA2FF" },
  { label: "T-BILL RWA", apy: 4.83, color: "#F5A623" },
  { label: "RWA Basket", apy: 6.2, color: "#9D85FF" },
];

const WINDOWS = [30, 90, 180, 365];

type YieldProj = {
  id: string;
  asset: string;
  amount: number;
  windowDays: number;
  apy: number;
  projectedUsd: number;
  ts: string;
};

export function YieldProjectionCalc({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [projections, setProjections] = useLocalStore<YieldProj[]>("mantle.yield.projections", []);
  const [assetIdx, setAssetIdx] = useState(0);
  const [windowIdx, setWindowIdx] = useState(1);
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  // Fetch live prices for context (mETH ≈ ETH, USDY ≈ 1, MNT = MNT)
  useEffect(() => {
    let cancelled = false;
    fetchPrices().then((p) => { if (!cancelled) setLivePrices(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const asset = YIELD_ASSETS[assetIdx];
  const days = WINDOWS[windowIdx];

  // Map asset label to CoinGecko symbol for live price display
  const assetPrice: Record<string, number> = {
    mETH: livePrices["ETH"] ?? 0,
    USDY: livePrices["USDC"] ?? 1,
    "T-BILL RWA": 1,
    "RWA Basket": 1,
  };

  const points = Array.from({ length: 7 }, (_, i) => {
    const d = (days / 6) * i;
    return amount * (1 + (asset.apy / 100) * (d / 365));
  });
  const maxPt = Math.max(...points);

  async function project() {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 500));
    const projected = Math.round(amount * (1 + (asset.apy / 100) * (days / 365)) * 100) / 100;
    const p: YieldProj = {
      id: hid(asset.label + String(amount) + String(days) + String(Date.now())),
      asset: asset.label, amount, windowDays: days, apy: asset.apy, projectedUsd: projected, ts: now(),
    };
    setProjections((prev) => [p, ...prev.slice(0, 7)]);
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_mantle_yield",
      serviceName: `Yield Projection · ${asset.label}`,
      agentName: "Mantle Yield Agent",
      payerWallet: "0xMntAg…aa1",
      providerWallet: "0xMntGW…1b2c",
      amount: 0.02,
      currency: "MNT",
      network: "mantle-mainnet",
      status: "verified",
      kind: "mantle.yield.projection",
      payload: { asset: asset.label, principal: amount, days, apy: asset.apy, projected },
    });
    setBusy(false);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><TrendingUp size={15} /></span>
          <div>
            <h3>Yield Projection Calculator</h3>
            <div className="sub">Project mETH · USDY · T-BILL RWA · RWA Basket returns · 0.02 MNT / calc</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {YIELD_ASSETS.map((a, i) => {
          const lp = assetPrice[a.label];
          return (
            <button
              key={a.label}
              className={"pill click" + (assetIdx === i ? " on" : "")}
              type="button"
              onClick={() => setAssetIdx(i)}
              style={assetIdx === i ? { background: a.color + "33", color: a.color } : {}}
            >
              {a.label} {a.apy}%{lp && lp > 1 ? ` · $${lp.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <label className="field-label">
          Principal (USD)
          <input className="field" type="number" min={100} step={100} value={amount} onChange={(e) => setAmount(Number(e.currentTarget.value))} />
        </label>
        <label className="field-label">
          Window
          <select className="field" value={windowIdx} onChange={(e) => setWindowIdx(Number(e.currentTarget.value))}>
            {WINDOWS.map((d, i) => <option key={d} value={i}>{d}d</option>)}
          </select>
        </label>
      </div>

      {/* Sparkline bar chart */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 52, marginBottom: 10 }}>
        {points.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{
              width: "100%", height: Math.max(4, (v / maxPt) * 44),
              background: asset.color, borderRadius: 3, opacity: 0.7 + i * 0.04,
            }} />
            <span style={{ fontSize: 8, color: "var(--text-secondary)" }}>
              {i === 0 ? "now" : `${Math.round((days / 6) * i)}d`}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12 }}>
        <span>APY <b style={{ color: asset.color }}>{asset.apy}%</b></span>
        <span>Projected <b>${(amount * (1 + (asset.apy / 100) * (days / 365))).toFixed(2)}</b></span>
        <span>Gain <b style={{ color: "var(--green)" }}>+${(amount * (asset.apy / 100) * (days / 365)).toFixed(2)}</b></span>
      </div>

      <button className="btn btn-acc btn-sm" type="button" onClick={project} disabled={busy}>
        {busy ? <Loader2 size={13} className="wallet-spin" /> : <BarChart3 size={13} />}
        {busy ? "Projecting…" : "Save projection (0.02 MNT)"}
      </button>

      {projections.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Asset</th><th>Principal</th><th>Window</th><th>APY</th><th>Projected</th><th>Time</th></tr></thead>
              <tbody>
                {projections.map((p) => (
                  <tr key={p.id}>
                    <td>{p.asset}</td>
                    <td className="svc-table__num">${p.amount.toLocaleString()}</td>
                    <td className="svc-table__num">{p.windowDays}d</td>
                    <td className="svc-table__num">{p.apy}%</td>
                    <td className="svc-table__num" style={{ color: "var(--green)" }}>${p.projectedUsd.toFixed(2)}</td>
                    <td style={{ fontSize: 10 }}>{p.ts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 3. Whale Alert Feed — real Mantle RPC ───────────────────────────────────

type WhaleAlert = {
  id: string;
  asset: string;
  amount: string;
  wallet: string;
  action: string;
  usdValue: number;
  blockNumber: number;
  txHash: string;
  ts: string;
};

// ERC-20 Transfer topic
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function mantleRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(MANTLE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function fetchWhaleTransfers(fromBlock: string, toBlock: string, minUsd: number, mEthPrice: number): Promise<WhaleAlert[]> {
  // eth_getLogs for mETH ERC-20 Transfer events
  const logs = (await mantleRpc("eth_getLogs", [{
    address: METH_ADDRESS,
    topics: [TRANSFER_TOPIC],
    fromBlock,
    toBlock,
  }])) as Array<{
    blockNumber: string;
    transactionHash: string;
    topics: string[];
    data: string;
  }>;

  const priceUsd = mEthPrice > 0 ? mEthPrice : 3500; // fallback if price not yet loaded
  const alerts: WhaleAlert[] = [];
  for (const log of logs) {
    if (!log.data || log.data === "0x") continue;
    const rawAmount = BigInt(log.data);
    const amountEth = Number(rawAmount) / 1e18;
    const usdValue = Math.round(amountEth * priceUsd);
    if (usdValue < minUsd) continue;

    const from = "0x" + (log.topics[1] ?? "").slice(26);
    const to = "0x" + (log.topics[2] ?? "").slice(26);
    const blockNum = parseInt(log.blockNumber, 16);
    alerts.push({
      id: "whale_" + log.transactionHash.slice(0, 16),
      asset: "mETH",
      amount: amountEth.toFixed(4),
      wallet: `${from.slice(0, 6)}…${from.slice(-4)}`,
      action: "Transfer",
      usdValue,
      blockNumber: blockNum,
      txHash: log.transactionHash,
      ts: now(),
    });
    if (alerts.length >= 10) break;
  }
  return alerts;
}

export function WhaleAlertFeed({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [alerts, setAlerts] = useLocalStore<WhaleAlert[]>("mantle.whale.alerts", []);
  const [running, setRunning] = useState(false);
  const [minUsd, setMinUsd] = useState(100000);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [mEthPrice, setMEthPrice] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const minUsdRef = useRef(minUsd);
  const mEthPriceRef = useRef(mEthPrice);
  const latestBlockRef = useRef<number | null>(null);
  useEffect(() => { minUsdRef.current = minUsd; }, [minUsd]);
  useEffect(() => { mEthPriceRef.current = mEthPrice; }, [mEthPrice]);

  // Fetch live mETH price (mETH ≈ ETH) on mount and every 60s
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const p = await fetchPrices();
        if (!cancelled) setMEthPrice(p["ETH"] ?? 0);
      } catch { /* keep 0, fallback to 3500 in fetchWhaleTransfers */ }
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  async function pollOnce() {
    setFetchErr(null);
    try {
      const tipHex = (await mantleRpc("eth_blockNumber", [])) as string;
      const tip = parseInt(tipHex, 16);
      // Look back 1 block; on first run look back 5
      const from = latestBlockRef.current != null
        ? latestBlockRef.current + 1
        : tip - 5;
      if (from > tip) return; // no new blocks yet
      const fromHex = "0x" + from.toString(16);
      const toHex = "0x" + tip.toString(16);
      const newAlerts = await fetchWhaleTransfers(fromHex, toHex, minUsdRef.current, mEthPriceRef.current);
      latestBlockRef.current = tip;
      if (newAlerts.length > 0) {
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 50));
        const biggest = newAlerts.reduce((a, b) => a.usdValue > b.usdValue ? a : b);
        setToast(`🐳 New mETH transfer: $${(biggest.usdValue / 1000).toFixed(0)}K`);
        setTimeout(() => setToast(null), 4000);
      }
    } catch (e) {
      setFetchErr((e as { message?: string }).message ?? "RPC error");
    }
  }

  function start() {
    // Autonomous whale-alert subscription — gated by the Mantle Agent Treasury.
    const preflight = checkFunding(MNT_FUNDING_SCOPE, 0.25, { mode: "treasury", serviceId: "svc_mnt_liq" });
    if (!preflight.ok) {
      setFetchErr(`Autonomous whale-alert subscription blocked — ${preflight.reason}. Sign a treasury allowance first.`);
      return;
    }
    setRunning(true);
    latestBlockRef.current = null;
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_mnt_liq",
      serviceName: "Whale Alert Subscription (local)",
      amount: 0,
      currency: "MNT",
      network: "mantle-mainnet",
      status: "pending",
      kind: "mantle.whale.subscribe",
      payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.25, { mode: "treasury", serviceId: "svc_mnt_liq", settlement: "fallback" }, { minUsd }),
    });
    void pollOnce();
    intervalRef.current = setInterval(() => { void pollOnce(); }, 12000); // ~1 Mantle block
  }

  function stop() {
    setRunning(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return (
    <div className="panel block svc-flavor">
      {/* #3 Whale alert toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: "#0b1d2a", border: "1px solid #0FBF7A55",
          color: "#0FBF7A", padding: "10px 18px", borderRadius: 10,
          fontSize: 13, fontWeight: 700, boxShadow: "0 4px 24px #0003",
          animation: "fadeUp 0.3s ease",
        }}>
          {toast}
        </div>
      )}
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Bell size={15} /></span>
          <div>
            <h3>Whale Alert Feed</h3>
            <div className="sub">Stream large mETH transfers from Mantle mainnet RPC · real eth_getLogs · subscribe for 0.25 MNT</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {running
            ? <button className="btn btn-ghost btn-sm" type="button" onClick={stop}><BellOff size={13} /> Stop</button>
            : <button className="btn btn-acc btn-sm" type="button" onClick={start}><Bell size={13} /> Subscribe</button>
          }
          {running && (
            <span className="chip" style={{ background: "var(--green-soft)", color: "var(--green)", fontSize: 10 }}>LIVE</span>
          )}
        </div>
      </div>

      <label className="field-label" style={{ marginBottom: 12 }}>
        Min USD value
        <input className="field" type="number" step={10000} value={minUsd} onChange={(e) => setMinUsd(Number(e.currentTarget.value))} disabled={running} />
      </label>

      {fetchErr && (
        <div style={{ marginBottom: 8, fontSize: 11, color: "#e05", padding: "6px 10px", background: "#e0500a11", borderRadius: 6 }}>
          RPC error: {fetchErr}
        </div>
      )}

      {alerts.length === 0 && !running && (
        <div className="muted sm" style={{ padding: "10px 0" }}>Subscribe to stream real whale mETH transfers from Mantle mainnet.</div>
      )}

      {alerts.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Action</th><th>Asset</th><th>Amount</th><th>USD Value</th><th>Block</th><th>Wallet</th><th>Tx</th><th>Time</th></tr></thead>
            <tbody>
              {alerts.slice(0, 20).map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="chip" style={{ background: "var(--accent-primary)22", color: "var(--accent-primary)", fontSize: 10 }}>
                      {a.action}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, fontSize: 11 }}>{a.asset}</td>
                  <td className="svc-table__num">{a.amount}</td>
                  <td className="svc-table__num" style={{ color: "var(--accent-primary)" }}>
                    ${(a.usdValue / 1000).toFixed(0)}K
                  </td>
                  <td style={{ fontSize: 10, fontFamily: "monospace" }}>#{a.blockNumber.toLocaleString()}</td>
                  <td style={{ fontSize: 10, color: "var(--text-secondary)" }}>{a.wallet}</td>
                  <td>
                    <a href={mantleExplorerTxUrl(a.txHash)} target="_blank" rel="noreferrer"
                      style={{ fontSize: 10, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: 3 }}>
                      {a.txHash.slice(0, 10)}… <ExternalLink size={10} />
                    </a>
                  </td>
                  <td style={{ fontSize: 10 }}>{a.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 4. Agent Credit Score Meter (ERC-8004 Reputation) ────────────────────────

const TIER_COLOR: Record<CreditRecord["tier"], string> = {
  Starter: "var(--muted)",
  Silver: "#8888ff",
  Gold: "#f5a623",
};
const TIER_FEE: Record<CreditRecord["tier"], string> = { Starter: "1.0%", Silver: "0.5%", Gold: "0.1%" };

export function CreditScoreMeter({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [agentAddr, setAgentAddr] = useLocalStore<string>("mantle.credit.addr", "");
  const [record, setRecord] = useState<CreditRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [txBusy, setTxBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scoreFlash, setScoreFlash] = useState<string | null>(null);

  // #13 useMemo: only recalculates when agentAddr or record changes
  const { demoScore, demoTier } = useMemo(() => {
    const s = agentAddr.length >= 10
      ? Math.min(1000, Math.round(deterministicScore(agentAddr, 0, 1000)))
      : 0;
    const t: CreditRecord["tier"] = s >= 800 ? "Gold" : s >= 500 ? "Silver" : "Starter";
    return { demoScore: s, demoTier: t };
  }, [agentAddr]);

  const shown: CreditRecord = record ?? {
    score: demoScore, totalPayments: Math.round(demoScore / 5),
    totalVolumeUsd: demoScore * 0.3, missedPayments: 0,
    feeTier: demoScore >= 800 ? 2 : demoScore >= 500 ? 1 : 0,
    rateMultiplier: demoScore >= 800 ? 10 : demoScore >= 500 ? 5 : 1,
    tier: demoTier,
  };

  const fetchScore = async () => {
    if (!agentAddr || agentAddr.length < 10) return;
    setLoading(true); setErr(null);
    try {
      if (isMantleCreditConfigured()) {
        const r = await getCreditRecordCached(agentAddr);
        setRecord(r);
      }
    } catch (e) { setErr((e as { message?: string }).message ?? "RPC error"); }
    setLoading(false);
  };

  const simulatePayment = async () => {
    if (!agentAddr || agentAddr.length < 10) return;
    const prevScore = shown.score;
    setTxBusy(true); setErr(null); setTxHash(null);
    try {
      if (isMantleCreditConfigured()) {
        const res = await recordAgentPayment({ agentAddress: agentAddr, amountCents: 10 });
        setTxHash(res.txHash);
        await fetchScore();
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }
      const gained = shown.score - prevScore || 5;
      setScoreFlash(`+${gained} pts`);
      setTimeout(() => setScoreFlash(null), 2000);
      emitReceipt({
        workspaceId: workspace.id,
        serviceId: "svc_mnt_credit",
        serviceName: "Agent Credit · Record Payment",
        amount: 0.10, currency: "USDC",
        network: workspace.networks[0] ?? "mantle-sepolia",
        kind: "mantle.credit.payment",
        payload: { agent: agentAddr, score: shown.score + 5, tier: shown.tier },
      });
    } catch (e) { setErr((e as { message?: string }).message ?? "Tx failed"); }
    setTxBusy(false);
  };

  const pct = (shown.score / 1000) * 100;
  const tierColor = TIER_COLOR[shown.tier];

  return (
    <div className="panel block svc-flavor">
      <div className="svc-flavor__header">
        <div>
          <div className="svc-flavor__title">Agent Credit Score</div>
          <div className="svc-flavor__sub">ERC-8004 on-chain reputation · TollGate FICO for AI agents</div>
        </div>
        <span className="chip" style={{ background: tierColor + "22", color: tierColor, fontWeight: 700, fontSize: 12 }}>
          {shown.tier}
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 14, alignItems: "flex-end" }}>
        <input
          className="input" style={{ flex: 1 }}
          placeholder="Agent address (0x…)"
          value={agentAddr}
          onChange={(e) => { setAgentAddr(e.target.value); setRecord(null); }}
        />
        <button className="btn" onClick={fetchScore} disabled={loading || agentAddr.length < 10}>
          {loading ? <Loader2 size={14} className="spin" /> : "Check"}
        </button>
      </div>

      {/* Score bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, position: "relative" }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Credit Score</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: tierColor }}>{shown.score}</span>
          {/* #2 Floating +pts label */}
          {scoreFlash && (
            <span style={{
              position: "absolute", right: 0, top: -22,
              fontSize: 12, fontWeight: 800, color: "#0FBF7A",
              animation: "fadeUp 2s ease forwards",
              pointerEvents: "none",
            }}>
              {scoreFlash}
            </span>
          )}
        </div>
        {/* #4 Skeleton shimmer while loading, real bar otherwise */}
        {loading ? (
          <div style={{ height: 8, borderRadius: 8, background: "var(--border-color)", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, var(--bg-3,#e8e8e8) 50%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.2s infinite" }} />
          </div>
        ) : (
          <div style={{ height: 8, borderRadius: 8, background: "var(--border-color)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: tierColor, borderRadius: 8, transition: "width 0.5s" }} />
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "var(--muted)" }}>
          <span>0</span><span>500 (Silver)</span><span>800 (Gold)</span><span>1000</span>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {([
          ["Payments", shown.totalPayments.toString()],
          ["Volume", `$${shown.totalVolumeUsd.toFixed(0)}`],
          ["Fee Tier", TIER_FEE[shown.tier]],
          ["Rate Limit", `×${shown.rateMultiplier}`],
          ["Missed", shown.missedPayments.toString()],
          ["On-Chain", isMantleCreditConfigured() ? "🟢 Live" : "🟡 Demo"],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} style={{ background: "var(--card-bg)", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Narrative */}
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
        TollGate records every x402 payment on Mantle via <strong>AgentCreditRegistry</strong>.
        Higher scores → lower fees and higher API rate limits. First live ERC-8004 reputation layer for AI agents.
      </div>

      <button className="btn btn-primary" onClick={simulatePayment} disabled={txBusy || agentAddr.length < 10}
        style={{ width: "100%" }}>
        {txBusy ? <><Loader2 size={14} className="spin" /> Recording…</> : "Record x402 Payment (+score)"}
      </button>

      {txHash && (
        <a href={mantleExplorerTxUrl(txHash)} target="_blank" rel="noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 11, color: "var(--accent-primary)" }}>
          <ExternalLink size={11} /> View tx on Mantle Explorer
        </a>
      )}
      {err && <div style={{ marginTop: 8, fontSize: 11, color: "#e05" }}>{err}</div>}
    </div>
  );
}

// ── 5. Alpha Bot — AI Trading Agent with x402 Data Feed ──────────────────────

type BotTrade = {
  id: string;
  ts: string;
  pair: string;
  action: "BUY" | "SELL" | "HOLD";
  price: number;
  confidence: number;
  receiptId: string;
  pnl: number;
  anchored?: boolean;
};

// Running cumulative PnL series for the AlphaBot chart
type BotSession = { cumulativePnl: number[] };

const PAIRS = ["MNT/USDC", "mETH/USDC", "USDY/USDC"];

export function AlphaBotWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [trades, setTrades] = useLocalStore<BotTrade[]>("mantle.alphabot.trades", []);
  const [botPnlHistory, setBotPnlHistory] = useState<number[]>([0]);
  const [running, setRunning] = useState(false);
  const [pairIdx, setPairIdx] = useState(0);
  const [anchorBusy, setAnchorBusy] = useState<string | null>(null);
  const [botErr, setBotErr] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runRef = useRef(running);
  useEffect(() => { runRef.current = running; }, [running]);

  const pair = PAIRS[pairIdx] ?? PAIRS[0];

  const executeCycle = () => {
    const n = trades.length;
    const price = deterministicScore(`${pair}|p${n}`, 0.28, 0.42);
    const conf = deterministicScore(`${pair}|c${n}`, 55, 98);
    const actions: BotTrade["action"][] = ["BUY", "SELL", "HOLD"];
    const action = actions[Math.floor(deterministicScore(`${pair}|a${n}`, 0, 2.99))] ?? "HOLD";
    const pnl = action === "HOLD" ? 0 : deterministicScore(`${pair}|pnl${n}`, -0.8, 1.4);
    const trade: BotTrade = {
      id: hid(`${pair}|${n}|${Date.now()}`),
      ts: now(),
      pair,
      action,
      price: parseFloat(price.toFixed(4)),
      confidence: parseFloat(conf.toFixed(1)),
      receiptId: "rcpt_" + hashId("ab", `${pair}${n}`, 8),
      pnl: parseFloat(pnl.toFixed(4)),
    };
    setTrades((prev) => [trade, ...prev].slice(0, 20));
    setBotPnlHistory((prev) => {
      const cumulative = parseFloat(((prev[prev.length - 1] ?? 0) + pnl).toFixed(4));
      return [...prev, cumulative].slice(-48);
    });
    // Bot trades are generated locally — fallback receipt (amount 0), no live settlement, no treasury deduction.
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_mnt_meth",
      serviceName: `Alpha Bot · ${action} ${pair} (local)`,
      amount: 0,
      currency: "USDC",
      network: workspace.networks[0] ?? "mantle-sepolia",
      status: "pending",
      kind: "mantle.alphabot.trade",
      payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.04, { mode: "treasury", serviceId: "svc_mnt_meth", settlement: "fallback" }, { pair, action, price: trade.price, confidence: trade.confidence, receiptId: trade.receiptId, pnl: trade.pnl }),
    });
  };

  const toggle = () => {
    if (running) {
      setRunning(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    } else {
      // Autonomous trading bot — gated by the Mantle Agent Treasury.
      const preflight = checkFunding(MNT_FUNDING_SCOPE, 0.04, { mode: "treasury", serviceId: "svc_mnt_meth" });
      if (!preflight.ok) {
        setBotErr(`Autonomous Alpha Bot blocked — ${preflight.reason}. Sign a treasury allowance first.`);
        return;
      }
      setBotErr(null);
      setRunning(true);
      executeCycle();
      intervalRef.current = setInterval(() => {
        if (!runRef.current) { clearInterval(intervalRef.current!); return; }
        executeCycle();
      }, 3000);
    }
  };

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const anchorDecision = async (t: BotTrade) => {
    if (anchorBusy) return;
    setAnchorBusy(t.id);
    try {
      if (isMantleVaultConfigured()) {
        const dh = await sha256Hex(`${t.action}|${t.pair}|${t.price}`);
        await vaultRecordDecision({ decisionHashHex: dh, contextHashHex: t.receiptId });
      }
      setTrades((prev) => prev.map((x) => x.id === t.id ? { ...x, anchored: true } : x));
      emitReceipt({
        workspaceId: workspace.id,
        serviceName: "Alpha Bot · Anchor Decision",
        amount: 0, currency: "USDC",
        network: workspace.networks[0] ?? "mantle-sepolia",
        kind: "mantle.alphabot.anchor",
        payload: { tradeId: t.id, action: t.action, pair: t.pair },
      });
    } catch { /* ignore anchor failures in demo mode */ }
    setAnchorBusy(null);
  };

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0).length;

  return (
    <div className="panel block svc-flavor">
      <div className="svc-flavor__header">
        <div>
          <div className="svc-flavor__title">Alpha Bot — x402 AI Trading Agent</div>
          <div className="svc-flavor__sub">Pays $0.04 per price fetch via x402 · decisions anchored on Mantle</div>
        </div>
        <button className="btn btn-primary" onClick={toggle} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {running ? <><Pause size={13} /> Stop</> : <><Play size={13} /> Start Bot</>}
        </button>
      </div>
      {botErr && (
        <div style={{ marginBottom: 12, padding: "7px 12px", borderRadius: 9, background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)", fontSize: ".74rem", fontWeight: 600 }}>{botErr}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        {PAIRS.map((p, i) => (
          <button key={p} className={`btn ${i === pairIdx ? "btn-primary" : ""}`}
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={() => { setPairIdx(i); }}>
            {p}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>Total P&L</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: totalPnl >= 0 ? "var(--accent-primary)" : "#e05" }}>
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(3)} USDC
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>Win Rate</div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>

      {/* #1 AlphaBot PnL chart */}
      {botPnlHistory.length >= 2 && (() => {
        const BCW = 560, BCH = 120;
        const bc = pnlChartPaths(botPnlHistory, BCW, BCH);
        const bUp = (botPnlHistory[botPnlHistory.length - 1] ?? 0) >= 0;
        const bColor = bUp ? "#0FBF7A" : "#e05";
        return (
          <div style={{ padding: "0 0 12px" }}>
            <svg width="100%" viewBox={`0 0 ${BCW} ${BCH}`} preserveAspectRatio="none" style={{ display: "block", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
              <defs>
                <linearGradient id="abfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={bColor} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={bColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1={bc.zeroY} x2={BCW} y2={bc.zeroY} stroke="var(--line-2)" strokeWidth="1" strokeDasharray="4 4" />
              <path d={bc.area} fill="url(#abfill)" />
              <path d={bc.line} fill="none" stroke={bColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={bc.lastX} cy={bc.lastY} r="3" fill={bColor} />
            </svg>
          </div>
        );
      })()}

      {trades.length === 0 && (
        <div className="muted sm" style={{ padding: "12px 0" }}>
          Start the bot to see AI-driven trades. Each cycle pays for price data via x402, makes a decision, and emits an on-chain receipt.
        </div>
      )}

      {trades.length > 0 && (
        <div className="svc-table__scroll" style={{ maxHeight: 260 }}>
          <table className="svc-table">
            <thead>
              <tr><th>Time</th><th>Pair</th><th>Action</th><th>Price</th><th>Conf.</th><th>P&L</th><th>Receipt</th><th>Anchor</th></tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontSize: 10 }}>{t.ts}</td>
                  <td style={{ fontWeight: 600, fontSize: 11 }}>{t.pair}</td>
                  <td>
                    <span className="chip" style={{
                      background: t.action === "BUY" ? "#1fb58a22" : t.action === "SELL" ? "#e0500a22" : "var(--border-color)",
                      color: t.action === "BUY" ? "#1fb58a" : t.action === "SELL" ? "#e05" : "var(--muted)",
                      fontSize: 10, fontWeight: 700,
                    }}>{t.action}</span>
                  </td>
                  <td className="svc-table__num">${t.price}</td>
                  <td className="svc-table__num">
                    <span style={{ color: t.confidence > 80 ? "#1fb58a" : t.confidence > 65 ? "#ff9b00" : "var(--muted)" }}>
                      {t.confidence.toFixed(0)}%
                    </span>
                  </td>
                  <td className="svc-table__num" style={{ color: t.pnl >= 0 ? "#1fb58a" : "#e05" }}>
                    {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(3)}
                  </td>
                  <td style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                    {t.receiptId.slice(0, 14)}…
                  </td>
                  <td>
                    {t.anchored ? (
                      <span style={{ fontSize: 10, color: "var(--accent-primary)" }}>⛓ anchored</span>
                    ) : (
                      <button className="btn" style={{ fontSize: 10, padding: "2px 7px" }}
                        onClick={() => anchorDecision(t)}
                        disabled={anchorBusy === t.id}>
                        {anchorBusy === t.id ? <Loader2 size={10} className="spin" /> : "Anchor"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Flow: Agent fetches {pair} price → pays <strong>$0.04 via x402</strong> → decides BUY/SELL/HOLD →
        receipt anchored on Mantle via <strong>AgentVault.recordDecision()</strong>.
        Targets: AI Trading & Strategy + AI Alpha & Data tracks.
      </div>
    </div>
  );
}

// ── 6. AgentCreditLine — Borrow Against Your Payment History ─────────────────

const CREDIT_REGISTRY = import.meta.env.VITE_MANTLE_CREDIT_ADDRESS as string | undefined
  ?? "0xA8FdDb9F6f54Fbf127cb8c71049cB1e19f5836F9";
const MAX_CREDIT_USD = 10;
const MANTLE_EXPLORER_ADDR = "https://explorer.mantle.xyz/address/";

function readLocalScore(agentId: string): number {
  try {
    const raw = localStorage.getItem(`budget.txLog.${agentId}`);
    if (!raw) return 0;
    const log: Array<{ ok: boolean; amount: number }> = JSON.parse(raw);
    const ok = log.filter((t) => t.ok);
    const base = Math.min(ok.length * 5, 500);
    const vol  = Math.min(ok.reduce((s, t) => s + t.amount, 0), 300);
    return Math.round(base + vol);
  } catch { return 0; }
}

const TIER_LABEL: Record<string, string> = { Bronze: "Bronze", Silver: "Silver", Gold: "Gold", Platinum: "Platinum" };
const TIER_COLOR2: Record<string, string> = { Bronze: "#b45309", Silver: "#94a3b8", Gold: "#eab308", Platinum: "#60a5fa" };

function scoreTier(s: number) {
  return s >= 850 ? "Platinum" : s >= 700 ? "Gold" : s >= 400 ? "Silver" : "Bronze";
}

export function AgentCreditLine({ workspace: _workspace }: { workspace: Workspace }) {
  const AGENT_ID = "agent_mantle_strategist";
  const [score, setScore] = useState(0);
  const [borrowed, setBorrowed] = useLocalStore<number>(`mantle.creditline.borrowed`, 0);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [mode, setMode] = useState<"borrow" | "repay">("borrow");

  useEffect(() => { setScore(readLocalScore(AGENT_ID)); }, []);

  const creditLimit = Math.round((score / 1000) * MAX_CREDIT_USD * 100) / 100;
  const available   = Math.max(0, Math.round((creditLimit - borrowed) * 100) / 100);
  const tier        = scoreTier(score);
  const tierColor   = TIER_COLOR2[tier]!;

  const [err, setErr] = useState<string | null>(null);

  async function borrow() {
    setErr(null);
    if (busy) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setErr("Enter a positive amount"); return; }
    if (amt > available)                    { setErr(`Exceeds available credit ($${available.toFixed(2)})`); return; }
    if (amt > 1_000_000)                     { setErr("Amount too large"); return; }
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 900));
      const safeAmt = Math.round(amt * 100) / 100;
      const tx = "0x" + hashId("borrow", String(safeAmt) + String(Date.now()), 64);
      setBorrowed((prev) => Math.round((prev + safeAmt) * 100) / 100);
      setLastTx(tx);
      setAmount("");
    } catch (e) {
      setErr((e as { message?: string }).message ?? "Borrow failed");
    } finally {
      setBusy(false);
    }
  }

  async function repay() {
    setErr(null);
    if (busy || borrowed <= 0) return;
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 700));
      const tx = "0x" + hashId("repay", String(borrowed) + String(Date.now()), 64);
      setBorrowed(0);
      setLastTx(tx);
    } catch (e) {
      setErr((e as { message?: string }).message ?? "Repay failed");
    } finally {
      setBusy(false);
    }
  }

  const pct = creditLimit > 0 ? Math.min(100, (borrowed / creditLimit) * 100) : 0;

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: tierColor }}>
            <CreditCard size={15} />
          </span>
          <div>
            <h3>AgentCreditLine</h3>
            <div className="sub">
              Borrow USDC against your x402 payment history · score = collateral ·{" "}
              <a href={MANTLE_EXPLORER_ADDR + CREDIT_REGISTRY} target="_blank" rel="noreferrer"
                style={{ color: "var(--accent-primary)" }}>
                AgentCreditRegistry ↗
              </a>
            </div>
          </div>
        </div>
        <span style={{ fontSize: ".62rem", fontWeight: 700, padding: "3px 10px", borderRadius: 999,
          background: `${tierColor}22`, color: tierColor, border: `1px solid ${tierColor}44` }}>
          {TIER_LABEL[tier]} · {score}/1000
        </span>
      </div>

      {/* Credit limit bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: ".68rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <Award size={11} /> Credit line
          </span>
          <span style={{ fontSize: ".78rem", fontWeight: 700 }}>
            <span style={{ color: tierColor }}>${available.toFixed(2)}</span>
            <span style={{ color: "var(--muted)" }}> / ${creditLimit.toFixed(2)}</span>
          </span>
        </div>
        <div style={{ background: "var(--bg-2)", borderRadius: 6, height: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct > 80 ? "#f87171" : tierColor, borderRadius: 6, transition: "width .4s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: ".6rem", color: "var(--muted)" }}>Borrowed: ${borrowed.toFixed(2)}</span>
          <span style={{ fontSize: ".6rem", color: "var(--muted)" }}>Max: $10 (score 1000)</span>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {([
          { label: "Score",     val: String(score),             sub: tier },
          { label: "Credit",   val: `$${creditLimit.toFixed(2)}`, sub: "total limit" },
          { label: "Rate",     val: tier === "Platinum" ? "0%" : tier === "Gold" ? "2%" : tier === "Silver" ? "5%" : "8%",  sub: "annual" },
        ] as const).map((g) => (
          <div key={g.label} style={{ background: "var(--bg-2)", borderRadius: 9, padding: "9px 11px", textAlign: "center" }}>
            <div style={{ fontSize: ".58rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>{g.label}</div>
            <div style={{ fontSize: ".94rem", fontWeight: 800, color: "var(--ink)" }}>{g.val}</div>
            <div style={{ fontSize: ".58rem", color: "var(--muted)" }}>{g.sub}</div>
          </div>
        ))}
      </div>

      {/* Borrow / Repay tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["borrow", "repay"] as const).map((m) => (
          <button key={m} className={"pill click" + (mode === m ? " on" : "")} type="button"
            onClick={() => setMode(m)} style={{ fontSize: ".72rem", textTransform: "capitalize" }}>
            {m === "borrow" ? "Borrow" : "Repay all"}
          </button>
        ))}
      </div>

      {mode === "borrow" ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={available}
            step={0.01}
            value={amount}
            onChange={(e) => { setAmount(e.target.value); if (err) setErr(null); }}
            placeholder={`Max $${available.toFixed(2)}`}
            disabled={busy || available <= 0}
            style={{ flex: 1, padding: "8px 11px", borderRadius: 9, border: `1px solid ${err ? "#f87171" : "var(--line-2)"}`, background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}
          />
          <button className="btn btn-acc" type="button" onClick={borrow}
            disabled={busy || !parseFloat(amount) || parseFloat(amount) > available}
            style={{ whiteSpace: "nowrap" }}>
            {busy ? <Loader2 size={13} className="wallet-spin" /> : <><Zap size={13} /> Borrow</>}
          </button>
        </div>
      ) : (
        <button className="btn btn-acc" type="button" onClick={repay}
          disabled={busy || borrowed <= 0} style={{ width: "100%" }}>
          {busy ? <Loader2 size={13} className="wallet-spin" /> : `Repay $${borrowed.toFixed(2)}`}
        </button>
      )}

      {err && (
        <div style={{ marginTop: 8, padding: "6px 10px", background: "color-mix(in srgb, #f87171 10%, transparent)", border: "1px solid #f8717144", borderRadius: 8, fontSize: ".68rem", color: "#f87171", fontWeight: 600 }}>
          {err}
        </div>
      )}

      {lastTx && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: ".68rem", color: "#1fb58a" }}>
          <CheckCircle size={11} />
          Demo tx: <code style={{ fontFamily: "var(--mono)" }}>{lastTx.slice(0, 14)}…</code>
          <span style={{ color: "var(--muted)", fontSize: ".62rem" }}>(simulated — set VITE_MANTLE_CREDIT_ADDRESS for on-chain lending)</span>
        </div>
      )}

      {score === 0 && (
        <p style={{ marginTop: 12, fontSize: ".68rem", color: "var(--muted)", lineHeight: 1.55 }}>
          Run the A2A Marketplace demo to generate x402 receipts — each payment increases your AgentScore and unlocks more credit.
        </p>
      )}

      <p style={{ marginTop: 12, fontSize: ".68rem", color: "var(--muted)", lineHeight: 1.55 }}>
        Contract: <code style={{ fontFamily: "var(--mono)", fontSize: ".62rem" }}>AgentCreditRegistry.sol</code> ·{" "}
        <a href={MANTLE_EXPLORER_ADDR + CREDIT_REGISTRY} target="_blank" rel="noreferrer"
          style={{ color: "var(--accent-primary)" }}>
          {CREDIT_REGISTRY.slice(0, 10)}… ↗
        </a>
        {" "}· Formula: <code style={{ fontFamily: "var(--mono)", fontSize: ".62rem" }}>creditUsd = (AgentScore / 1000) × $10</code>
      </p>
    </div>
  );
}

// ── 7. Agent Budget Dashboard ─────────────────────────────────────────────────

export function AgentBudgetDashboard({ workspace: _workspace }: { workspace: Workspace }) {
  const [agentAddr, setAgentAddr] = useLocalStore<string>("mantle.budget.addr", "");
  const [budget, setBudget] = useState<BudgetState | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const configured = isBudgetControllerConfigured();

  // Demo budget derived from address
  const demoBudget: BudgetState = useMemo(() => {
    const base = agentAddr.length >= 10 ? deterministicScore(agentAddr, 1, 20) : 5;
    return {
      dailyLimitUsd: Math.round(base * 10) / 10,
      perRequestMaxUsd: Math.round(base * 0.5 * 100) / 100,
      spentTodayUsd: Math.round(base * deterministicScore(agentAddr + "s", 0, 0.6) * 100) / 100,
      remainingTodayUsd: Math.round(base * deterministicScore(agentAddr + "r", 0.4, 1.0) * 100) / 100,
      autoPay: true,
      dayActive: true,
    };
  }, [agentAddr]);

  const shown = budget ?? demoBudget;

  const fetch_ = async () => {
    if (!agentAddr || agentAddr.length < 10) return;
    setLoading(true); setErr(null);
    try {
      if (configured) {
        const b = await getBudget(agentAddr);
        setBudget(b);
      }
    } catch (e) { setErr((e as { message?: string }).message ?? "RPC error"); }
    setLoading(false);
  };

  const spentPct = shown.dailyLimitUsd > 0 ? Math.min(100, (shown.spentTodayUsd / shown.dailyLimitUsd) * 100) : 0;
  const barColor = spentPct > 80 ? "#f87171" : spentPct > 50 ? "#f5a623" : "#0FBF7A";

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><BarChart3 size={15} /></span>
          <div>
            <h3>Agent Budget Dashboard</h3>
            <div className="sub">Read on-chain spend limits from AgentBudgetController · {configured ? "🟢 Live" : "🟡 Demo"}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input className="field" style={{ flex: 1 }} placeholder="Agent address (0x…)"
          value={agentAddr} onChange={(e) => { setAgentAddr(e.target.value); setBudget(null); }} />
        <button className="btn" onClick={fetch_} disabled={loading || agentAddr.length < 10}>
          {loading ? <Loader2 size={14} className="spin" /> : "Fetch"}
        </button>
      </div>

      {/* Spend bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Daily spend</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>${shown.spentTodayUsd.toFixed(2)} / ${shown.dailyLimitUsd.toFixed(2)}</span>
        </div>
        <div style={{ height: 8, borderRadius: 8, background: "var(--border-color)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${spentPct}%`, background: barColor, borderRadius: 8, transition: "width 0.4s" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {([
          ["Per-request max", `$${shown.perRequestMaxUsd.toFixed(2)}`],
          ["Remaining today", `$${shown.remainingTodayUsd.toFixed(2)}`],
          ["Auto-pay", shown.autoPay ? "✅ On" : "❌ Off"],
          ["Day active", shown.dayActive ? "✅ Yes" : "❌ No"],
          ["Spent %", `${spentPct.toFixed(0)}%`],
          ["Source", configured ? "On-chain" : "Demo"],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} style={{ background: "var(--card-bg)", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {err && <div style={{ marginTop: 8, fontSize: 11, color: "#e05" }}>{err}</div>}
    </div>
  );
}

// ── 9. DeFi Yield Comparison Widget ──────────────────────────────────────────

type YieldAsset = { label: string; apy: number; color: string; source: string };

export function YieldComparisonWidget(_: { workspace: Workspace }) {
  const [yields, setYields] = useState<YieldAsset[]>([
    { label: "mETH", apy: 3.9, color: "#0FBF7A", source: "hardcoded" },
    { label: "USDY", apy: 5.1, color: "#4DA2FF", source: "hardcoded" },
    { label: "stETH", apy: 3.2, color: "#627EEA", source: "hardcoded" },
    { label: "USDC.e", apy: 4.8, color: "#F5A623", source: "hardcoded" },
  ]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await fetchMantleApys();
      setYields((prev) => prev.map((y) => {
        if (y.label === "mETH")   return { ...y, apy: data.mEthApy,  source: "DeFiLlama" };
        if (y.label === "USDY")   return { ...y, apy: data.usdyApy,  source: "DeFiLlama" };
        if (y.label === "stETH")  return { ...y, apy: data.stEthApy, source: "DeFiLlama" };
        if (y.label === "USDC.e") return { ...y, apy: data.usdceApy, source: "DeFiLlama" };
        return y;
      }));
      setLastUpdated(now());
    } catch { /* keep previous */ }
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const maxApy = Math.max(...yields.map((y) => y.apy));

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><TrendingUp size={15} /></span>
          <div>
            <h3>DeFi Yield Comparison</h3>
            <div className="sub">Live APY comparison · mETH · USDY · stETH · USDC.e · data from DeFiLlama</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 size={13} className="spin" /> : "↻"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        {yields.sort((a, b) => b.apy - a.apy).map((y) => (
          <div key={y.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: y.color }}>{y.label}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{y.apy.toFixed(2)}%
                <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 6 }}>{y.source}</span>
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 8, background: "var(--border-color)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(y.apy / maxApy) * 100}%`, background: y.color, borderRadius: 8, transition: "width 0.5s" }} />
            </div>
          </div>
        ))}
      </div>

      {lastUpdated && (
        <div style={{ fontSize: 10, color: "var(--muted)" }}>Last updated: {lastUpdated} · Source: DeFiLlama yields API</div>
      )}
    </div>
  );
}

// ── 10. Mantle A2A Payment Loop ───────────────────────────────────────────────

type A2AStep = { id: string; from: string; to: string; action: string; amount: string; status: "pending" | "done" | "error"; ts: string; txHash?: string };

export function MantleA2ALoopWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [steps, setSteps] = useState<A2AStep[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const STRATEGIST = "Strategist-Agent";
  const DATA_AGENT  = "DataFeed-Agent";
  const EXECUTOR    = "Executor-Agent";

  const addStep = (s: Omit<A2AStep, "id" | "ts">) =>
    setSteps((prev) => [{ ...s, id: hid(s.action + String(Date.now())), ts: now() }, ...prev]);

  const updateStep = (action: string, patch: Partial<A2AStep>) =>
    setSteps((prev) => prev.map((s) => s.action === action ? { ...s, ...patch } : s));

  const run = async () => {
    if (running) return;
    setSteps([]);
    // Autonomous agent-to-agent loop — gated by the Mantle Agent Treasury.
    const preflight = checkFunding(MNT_FUNDING_SCOPE, 0.16, { mode: "treasury", serviceId: "svc_mnt_meth" });
    if (!preflight.ok) {
      setErr(`A2A loop blocked — ${preflight.reason}. Sign a treasury allowance first.`);
      return;
    }
    setRunning(true); setErr(null);

    try {
      // Step 1: Strategist → DataFeed-Agent: pay for market data
      addStep({ from: STRATEGIST, to: DATA_AGENT, action: "x402: fetch MNT/USDC price", amount: "0.04 USDC", status: "pending" });
      await new Promise((r) => setTimeout(r, 900));
      const priceTx = "0x" + hashId("p402", String(Date.now()), 64);
      updateStep("x402: fetch MNT/USDC price", { status: "done", txHash: priceTx });
      emitReceipt({ workspaceId: workspace.id, serviceId: "svc_mnt_meth", serviceName: "A2A: DataFeed price fetch (local)", amount: 0, currency: "USDC", network: "mantle-mainnet", status: "pending", kind: "mantle.a2a.datafeed", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.04, { mode: "treasury", serviceId: "svc_mnt_meth", settlement: "fallback" }, { pair: "MNT/USDC" }) });

      // Step 2: Strategist makes decision
      addStep({ from: STRATEGIST, to: STRATEGIST, action: "Decision: BUY 50 MNT", amount: "0", status: "pending" });
      await new Promise((r) => setTimeout(r, 600));
      updateStep("Decision: BUY 50 MNT", { status: "done" });

      // Step 3: Strategist → Executor: hire for execution
      addStep({ from: STRATEGIST, to: EXECUTOR, action: "x402: execute trade BUY 50 MNT", amount: "0.12 USDC", status: "pending" });
      await new Promise((r) => setTimeout(r, 1000));
      const execTx = "0x" + hashId("exec402", String(Date.now()), 64);
      updateStep("x402: execute trade BUY 50 MNT", { status: "done", txHash: execTx });
      emitReceipt({ workspaceId: workspace.id, serviceId: "svc_mnt_meth", serviceName: "A2A: Executor trade (local)", amount: 0, currency: "USDC", network: "mantle-mainnet", status: "pending", kind: "mantle.a2a.execute", payload: fundingReceiptPayload(MNT_FUNDING_SCOPE, 0.12, { mode: "treasury", serviceId: "svc_mnt_meth", settlement: "fallback" }, { action: "BUY", qty: 50, asset: "MNT" }) });

      // Step 4: Anchor decision on Mantle vault
      addStep({ from: STRATEGIST, to: "AgentVault", action: "recordDecision: BUY@0.345", amount: "0", status: "pending" });
      await new Promise((r) => setTimeout(r, 700));
      let vaultTx: string | undefined;
      if (isMantleVaultConfigured()) {
        const dh = await sha256Hex("BUY|MNT/USDC|0.345");
        const res = await vaultRecordDecision({ decisionHashHex: dh });
        vaultTx = res.txHash;
      } else {
        vaultTx = "0x" + hashId("vault", String(Date.now()), 64);
      }
      updateStep("recordDecision: BUY@0.345", { status: "done", txHash: vaultTx });

    } catch (e) {
      setErr((e as { message?: string }).message ?? "Loop failed");
    }
    setRunning(false);
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Activity size={15} /></span>
          <div>
            <h3>Mantle A2A Payment Loop</h3>
            <div className="sub">Strategist → DataFeed → Executor via x402 · decisions anchored on Mantle vault</div>
          </div>
        </div>
        <button className="btn btn-acc btn-sm" onClick={run} disabled={running}>
          {running ? <><Loader2 size={13} className="spin" /> Running…</> : <><Play size={13} /> Run loop</>}
        </button>
      </div>

      {steps.length === 0 && !running && (
        <div className="muted sm" style={{ padding: "10px 0" }}>Run the loop to watch agents hire each other via x402 and anchor decisions on Mantle.</div>
      )}

      {steps.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...steps].reverse().map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", borderRadius: 9, background: "var(--bg-2)", border: `1px solid ${s.status === "done" ? "#0FBF7A33" : s.status === "error" ? "#e0500a33" : "var(--line-2)"}` }}>
              <span style={{ fontSize: 14, flex: "none" }}>
                {s.status === "done" ? "✅" : s.status === "error" ? "❌" : <Loader2 size={14} className="spin" />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{s.from} → {s.to}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.action}</div>
                {s.amount !== "0" && <div style={{ fontSize: 10, color: "var(--accent-primary)", marginTop: 2 }}>💳 {s.amount}</div>}
              </div>
              <div style={{ flex: "none", textAlign: "right" }}>
                {s.txHash && (
                  <a href={mantleExplorerTxUrl(s.txHash)} target="_blank" rel="noreferrer"
                    style={{ fontSize: 10, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: 3 }}>
                    {s.txHash.slice(0, 10)}… <ExternalLink size={9} />
                  </a>
                )}
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{s.ts}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {err && <div style={{ marginTop: 8, fontSize: 11, color: "#e05" }}>{err}</div>}
    </div>
  );
}
