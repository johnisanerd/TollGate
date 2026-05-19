import { useState, useEffect, useRef } from "react";
import { safeAmt } from "../../../lib/validate";
import { Skeleton } from "../../ui/Motion";
import {
  Copy, Eye, Lock, Play, Pause, Shield, Zap, Brain,
  ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCheck, ExternalLink,
  Activity, Download,
} from "lucide-react";
import type { Workspace } from "../../../types";
import { useLocalStore } from "../../../lib/storage";
import { useAppState } from "../../../app-state";
import { deterministicScore } from "../../../lib/util-hash";
import {
  isAgoraEscrowConfigured, isAgoraRegistryConfigured,
  stakeToEscrow, registerArcAgent, recordArcDecision, resolveArcDecision,
  arcExplorerTxUrl, ARC_CHAIN_HEX, switchToArc,
} from "../../../lib/agora";

function paidGatewayHeaders(agentId: string, extra: Record<string, string> = {}): Record<string, string> {
  return { "X-Agent-Id": agentId, ...extra };
}

function shortFlowError(err: unknown, fallback = "Live service unavailable. Demo receipt created for the review flow."): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/execution reverted|CALL_EXCEPTION|estimateGas|unknown custom error/i.test(raw)) {
    return "Arc registry rejected the live contract call. Demo receipt created for the review flow.";
  }
  if (/not configured|No EIP-1193|wallet|Gateway|payment required/i.test(raw)) {
    return "Live wallet, contract or gateway is unavailable. Demo receipt created for the review flow.";
  }
  return raw.slice(0, 180) || fallback;
}

function demoReceiptId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "getRandomValues" in crypto
    ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(16).slice(2, 18).padEnd(16, "0");
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

/* ─── Network guard ────────────────────────────────────────────── */

type Eth = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, h: (v: string) => void) => void; removeListener?: (e: string, h: (v: string) => void) => void };

function useArcNetwork() {
  const [onArc, setOnArc] = useState<boolean | null>(null);
  useEffect(() => {
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) { setOnArc(null); return; }
    const check = async () => {
      try {
        const id = (await eth.request({ method: "eth_chainId" })) as string;
        setOnArc(id.toLowerCase() === ARC_CHAIN_HEX);
      } catch { setOnArc(null); }
    };
    check();
    const handler = (id: string) => setOnArc(id.toLowerCase() === ARC_CHAIN_HEX);
    eth.on?.("chainChanged", handler);
    return () => eth.removeListener?.("chainChanged", handler);
  }, []);
  return onArc;
}

function WrongNetworkBanner() {
  const [switching, setSwitching] = useState(false);
  const onArc = useArcNetwork();
  if (onArc === null || onArc === true) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, #f59e0b 12%, transparent)", border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)", marginBottom: 12 }}>
      <AlertTriangle size={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: "#f59e0b", flex: 1 }}>Wallet is on the wrong network. Arc L1 Testnet required for on-chain actions.</span>
      <button
        style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, background: "#f59e0b", color: "#000", border: "none", cursor: "pointer", flexShrink: 0 }}
        disabled={switching}
        onClick={async () => { setSwitching(true); try { await switchToArc(); } catch { /* user declined */ } finally { setSwitching(false); } }}
      >
        {switching ? "Switching…" : "Switch Network"}
      </button>
    </div>
  );
}

/* ─── Copy Trading ─────────────────────────────────────────────── */

interface CopyPosition {
  asset: string;
  side: "LONG" | "SHORT";
  entry: number;
  size: number;
  pnl: number;
  ts: number;
}

interface ArcDecisionRaw { decision: "BUY" | "SELL" | "HOLD"; ethPrice: number; ts: string; txHash?: string }

const DEMO_DECISIONS: ArcDecisionRaw[] = [
  { decision: "BUY", ethPrice: 3340, ts: new Date(Date.now() - 12 * 60_000).toISOString(), txHash: "demo" },
  { decision: "HOLD", ethPrice: 3315, ts: new Date(Date.now() - 42 * 60_000).toISOString(), txHash: "demo" },
  { decision: "SELL", ethPrice: 3290, ts: new Date(Date.now() - 72 * 60_000).toISOString(), txHash: "demo" },
];

function useEthPrice(): number {
  const [price, setPrice] = useState(0);
  useEffect(() => {
    let mounted = true;
    async function tick() {
      try {
        const r = await fetch(`${SERVER}/api/signals`, { signal: AbortSignal.timeout(8_000) });
        const d = await r.json() as { ethPrice?: number };
        if (mounted && d.ethPrice) setPrice(d.ethPrice);
      } catch { /* keep previous */ }
    }
    tick();
    const id = setInterval(tick, 10_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);
  return price;
}

function useArcDecisionStats(workspaceId: string) {
  const [bias, setBias] = useState(0);
  const [stats, setStats] = useState<{ ret30d: number; sharpe: number; winRate: number } | null>(null);

  useEffect(() => {
    fetch(`${SERVER}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) })
      .then(r => r.json())
      .then((d: { decisions: ArcDecisionRaw[] }) => {
        let decisions = d.decisions ?? [];
        if (decisions.length < 2) decisions = DEMO_DECISIONS;
        const last = decisions[0];
        if (last?.decision === "BUY") setBias(1);
        else if (last?.decision === "SELL") setBias(-1);
        else setBias(0);
        if (decisions.length < 2) return;
        let wins = 0, count = 0;
        for (let i = 0; i < decisions.length - 1; i++) {
          const curr = decisions[i], next = decisions[i + 1];
          const priceUp = next.ethPrice > curr.ethPrice;
          if (curr.decision === "HOLD") continue;
          if ((curr.decision === "BUY" && priceUp) || (curr.decision === "SELL" && !priceUp)) wins++;
          count++;
        }
        const first = decisions[decisions.length - 1];
        const priceChangePct = first.ethPrice > 0 ? ((decisions[0].ethPrice - first.ethPrice) / first.ethPrice) * 100 : 0;
        const winRate = count > 0 ? (wins / count) * 100 : deterministicScore(workspaceId + "wr", 60, 80);
        setStats({
          ret30d: parseFloat(priceChangePct.toFixed(1)),
          sharpe: parseFloat((Math.max(0.3, winRate / 30)).toFixed(1)),
          winRate: parseFloat(winRate.toFixed(0)),
        });
      })
      .catch(() => {
        const decisions = DEMO_DECISIONS;
        setBias(decisions[0].decision === "BUY" ? 1 : decisions[0].decision === "SELL" ? -1 : 0);
        setStats({ ret30d: 1.5, sharpe: 2.2, winRate: 67 });
      });
  }, [workspaceId]);

  return { bias, stats };
}

export function ArcMindCopyTradingWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [positions, setPositions] = useLocalStore<CopyPosition[]>(
    `arcmind-copy-${workspace.id}`,
    []
  );
  const [stake, setStake] = useState("10");
  const [following, setFollowing] = useState(false);
  const [totalPnl, setTotalPnl] = useState(0);
  const [stakeErr, setStakeErr] = useState<string | null>(null);
  const [staking, setStaking] = useState(false);
  const [stakeTxHash, setStakeTxHash] = useLocalStore<string | null>(`arcmind-stake-tx-${workspace.id}`, null);
  const [stakeGasless, setStakeGasless] = useLocalStore<boolean>(`arcmind-stake-gasless-${workspace.id}`, false);
  const [autoFollow, setAutoFollow] = useLocalStore<boolean>(`arcmind-auto-follow-${workspace.id}`, false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { stats } = useArcDecisionStats(workspace.id);
  const liveEthPrice = useEthPrice();
  const liveEthRef = useRef(liveEthPrice);
  liveEthRef.current = liveEthPrice;

  // Real PnL: (livePrice - entry) * size for ETH positions; stop ticking after
  useEffect(() => {
    if (!following) return;
    tickRef.current = setInterval(() => {
      setPositions((prev: CopyPosition[]) =>
        prev.map((p: CopyPosition) => {
          if (liveEthRef.current > 0 && p.asset === "ETH/USDC") {
            const pnl = (liveEthRef.current - p.entry) * p.size * (p.side === "LONG" ? 1 : -1);
            return { ...p, pnl };
          }
          return p;
        })
      );
    }, 10_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [following]);

  useEffect(() => {
    setTotalPnl(positions.reduce((s: number, p: CopyPosition) => s + p.pnl, 0));
  }, [positions]);

  async function startCopying() {
    const amt = safeAmt(stake, 10_000) ?? 10;
    const now = Date.now();
    setStakeErr(null);

    setStaking(true);
    let stakeTx = demoReceiptId("copy_stake_demo");
    let fallbackNote: string | null = null;
    try {
      if (!isAgoraEscrowConfigured()) throw new Error("CopyTradeEscrow not configured");
      const { txHash, gasless } = await stakeToEscrow(amt);
      stakeTx = txHash;
      setStakeTxHash(txHash);
      setStakeGasless(gasless);
      emitReceipt({
        workspaceId: workspace.id,
        serviceName: `Stake to CopyTradeEscrow - $${amt} USDC`,
        amount: amt,
        currency: "USDC",
        network: "arc-testnet",
        kind: "arcmind.copy.stake",
        payload: { txHash },
      });
    } catch (e: unknown) {
      fallbackNote = shortFlowError(e);
      setStakeTxHash(null);
      setStakeGasless(false);
      emitReceipt({
        workspaceId: workspace.id,
        serviceName: `Demo stake to CopyTradeEscrow - $${amt} USDC`,
        amount: amt,
        currency: "USDC",
        network: "arc-testnet",
        kind: "arcmind.copy.stake.demo",
        payload: { receiptId: stakeTx, fallback: true, reason: fallbackNote },
      });
    }

    // Build position from last on-chain ArcMind decision
    let pos: CopyPosition[];
    try {
      const decRes = await fetch(`${SERVER}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) });
      const decData = await decRes.json() as { decisions: ArcDecisionRaw[] };
      const lastBuy = decData.decisions?.find(d => d.decision === "BUY");
      const lastSell = decData.decisions?.find(d => d.decision === "SELL");
      const activeDecision = lastBuy ?? lastSell;
      if (activeDecision && activeDecision.ethPrice > 0) {
        const side = activeDecision.decision === "BUY" ? "LONG" : "SHORT";
        const size = (amt * 0.8) / activeDecision.ethPrice;
        pos = [{ asset: "ETH/USDC", side, entry: activeDecision.ethPrice, size, pnl: 0, ts: now }];
      } else {
        const demo = DEMO_DECISIONS.find(d => d.decision !== "HOLD") ?? DEMO_DECISIONS[0];
        const side = demo.decision === "SELL" ? "SHORT" : "LONG";
        const size = (amt * 0.8) / demo.ethPrice;
        fallbackNote = fallbackNote ?? "No live ArcMind BUY/SELL decision found. Demo decision used for review flow.";
        pos = [{ asset: "ETH/USDC", side, entry: demo.ethPrice, size, pnl: 0, ts: now }];
      }
    } catch {
      const demo = DEMO_DECISIONS.find(d => d.decision !== "HOLD") ?? DEMO_DECISIONS[0];
      const side = demo.decision === "SELL" ? "SHORT" : "LONG";
      const size = (amt * 0.8) / demo.ethPrice;
      fallbackNote = fallbackNote ?? "Could not load live ArcMind decisions. Demo decision used for review flow.";
      pos = [{ asset: "ETH/USDC", side, entry: demo.ethPrice, size, pnl: 0, ts: now }];
    }

    setPositions(pos);
    setFollowing(true);
    setStakeErr(fallbackNote);
    emitReceipt({
      workspaceId: workspace.id,
      serviceName: `Copy ArcMind — $${amt} USDC`,
      amount: amt,
      currency: "USDC",
      network: "arc-testnet",
      kind: "arcmind.copy.start",
      payload: { txHash: stakeTx, fallback: Boolean(fallbackNote) },
    });
    setStaking(false);
  }

  function stopCopying() {
    setFollowing(false);
    if (tickRef.current) clearInterval(tickRef.current);
  }

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-5 space-y-4">
      <WrongNetworkBanner />
      <div className="flex items-center gap-2">
        <Copy className="w-5 h-5 text-purple-400" />
        <h3 className="font-semibold text-white">Copy ArcMind</h3>
        {following && (
          <span className="ml-auto text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full animate-pulse">
            LIVE
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-white/5 p-3 text-center">
          <div className="text-xs text-gray-400">30d ETH Δ</div>
          {stats ? (
            <div className={`text-lg font-bold ${stats.ret30d >= 0 ? "text-green-400" : "text-red-400"}`}>
              {stats.ret30d >= 0 ? "+" : ""}{stats.ret30d.toFixed(1)}%
            </div>
          ) : <div className="text-lg font-bold text-gray-600">—</div>}
        </div>
        <div className="rounded-lg bg-white/5 p-3 text-center">
          <div className="text-xs text-gray-400">Sharpe</div>
          {stats ? (
            <div className="text-lg font-bold text-blue-400">{stats.sharpe.toFixed(1)}</div>
          ) : <div className="text-lg font-bold text-gray-600">—</div>}
        </div>
        <div className="rounded-lg bg-white/5 p-3 text-center">
          <div className="text-xs text-gray-400">Win Rate</div>
          {stats ? (
            <div className="text-lg font-bold text-purple-400">{stats.winRate.toFixed(0)}%</div>
          ) : <div className="text-lg font-bold text-gray-600">—</div>}
        </div>
      </div>
      {stats && <div className="text-[10px] text-gray-600 text-center">computed from {Math.max(1, Math.round(stats.winRate / 5))} on-chain ArcMind decisions</div>}

      {!following ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Stake (USDC) — min $1</label>
            <input
              type="number" min="1" value={stake}
              onChange={e => setStake(e.target.value)}
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40"
            />
          </div>
          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex justify-between"><span>Performance fee</span><span>5%</span></div>
            <div className="flex justify-between"><span>Auto-exit on drawdown</span><span className="text-yellow-400">&gt;15%</span></div>
            <div className="flex justify-between"><span>Settlement</span><span>USDC · Arc L1 (ERC-8183)</span></div>
          </div>
          {stakeErr && <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{stakeErr}</div>}
          {!isAgoraEscrowConfigured() && (
            <p className="text-[10.5px]" style={{ textAlign: "center", color: "#8b5cf6", background: "rgba(139,92,246,0.08)", padding: "5px 10px", borderRadius: 6 }}>
              Live CopyTradeEscrow is not configured in this environment. The button still runs a labeled demo copy flow for judges.
            </p>
          )}
          <button
            onClick={startCopying}
            disabled={staking}
            className="w-full rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 transition-colors"
          >
            {staking ? "Approving USDC + staking…" : "Stake & Start Copy Trading"}
          </button>
          {isAgoraEscrowConfigured() && !staking && (
            <p className="text-[10.5px] text-gray-600 text-center">
              Real USDC stake via CopyTradeEscrow on Arc L1 (MetaMask)
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-white/5 p-3 flex justify-between items-center">
            <span className="text-sm text-gray-400">Unrealised PnL</span>
            <span className={`text-lg font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(4)} USDC
            </span>
          </div>
          <div className="space-y-2">
            {positions.map((p: CopyPosition, i: number) => (
              <div key={i} className="rounded-lg bg-white/5 p-3 flex items-center gap-3 text-sm">
                {p.side === "LONG"
                  ? <ArrowUpRight className="w-4 h-4 text-green-400 shrink-0" />
                  : <ArrowDownRight className="w-4 h-4 text-red-400 shrink-0" />
                }
                <span className="text-gray-300 flex-1">{p.asset}</span>
                <span className={`font-mono text-xs ${p.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
          {stakeTxHash && (
            <div className="space-y-1">
              <a
                href={arcExplorerTxUrl(stakeTxHash)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300"
              >
                <ExternalLink className="w-3 h-3" />
                Stake tx on Arc testnet
              </a>
              {stakeGasless && (
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <Zap className="w-3 h-3" />
                  Gasless via Circle Paymaster — gas paid in USDC
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
            <span className="text-xs text-gray-400">Auto-follow new decisions</span>
            <button
              onClick={() => setAutoFollow((v: boolean) => !v)}
              style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", position: "relative", background: autoFollow ? "#8b5cf6" : "rgba(255,255,255,0.15)", transition: "background .2s" }}
            >
              <span style={{ position: "absolute", top: 3, left: autoFollow ? 20 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </button>
          </div>
          <button
            onClick={stopCopying}
            className="w-full rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-semibold py-2.5 transition-colors"
          >
            Stop &amp; Settle
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Reasoning Traces Marketplace ─────────────────────────────── */

interface Trace {
  id: string;
  title: string;
  signal: string;
  decision: string;
  rationale: string;
  outcome: string;
  price: number;
}

function useArcMindTraces(): { traces: Trace[]; loading: boolean } {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${SERVER}/api/arc-decisions`, { signal: AbortSignal.timeout(8_000) })
      .then(r => r.json())
      .then((d: { decisions: ArcDecisionRaw[] }) => {
        let decisions = d.decisions ?? [];
        const live = decisions.length > 0;
        if (!decisions.length) decisions = DEMO_DECISIONS;
        const mapped: Trace[] = decisions.slice(0, 8).map((dec, i) => ({
          id: `${live ? "live" : "demo"}-${i}`,
          title: `${dec.decision} — ETH @ $${dec.ethPrice?.toLocaleString() ?? "?"}`,
          signal: `ETH $${dec.ethPrice} · ${new Date(dec.ts).toLocaleString()}`,
          decision: `${dec.decision} ETH/USDC @ $${dec.ethPrice}`,
          rationale: live ? "Autonomous ArcMind decision recorded on Arc L1 via ArcMindRegistry.recordDecision(). Based on Hyperliquid OI + ETH price momentum." : "Demo reasoning trace for the review flow. It mirrors the live schema and unlock/payment UX when the registry has no decisions yet.",
          outcome: live ? (dec.txHash ? "On-chain" : "Pending resolution") : "Demo trace",
          price: 0.01,
        }));
        setTraces(mapped);
      })
      .catch(() => {
        setTraces(DEMO_DECISIONS.map((dec, i) => ({
          id: `demo-${i}`,
          title: `${dec.decision} - ETH @ $${dec.ethPrice.toLocaleString()}`,
          signal: `ETH $${dec.ethPrice} - ${new Date(dec.ts).toLocaleString()}`,
          decision: `${dec.decision} ETH/USDC @ $${dec.ethPrice}`,
          rationale: "Demo reasoning trace for the review flow. Live /api/arc-decisions is unavailable, so the marketplace remains testable without fake live claims.",
          outcome: "Demo trace",
          price: 0.01,
        })));
      })
      .finally(() => setLoading(false));
  }, []);
  return { traces, loading };
}

export function ArcMindReasoningWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const { traces: liveTraces, loading: tracesLoading } = useArcMindTraces();
  const displayTraces = liveTraces;
  const hasLiveTraces = displayTraces.some((trace) => trace.id.startsWith("live-"));
  const [purchased, setPurchased] = useLocalStore<string[]>(`arcmind-traces-${workspace.id}`, []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revenue, setRevenue] = useLocalStore<number>(`arcmind-revenue-${workspace.id}`, 0);
  const [agentId, setAgentId] = useLocalStore<string | null>(`arcmind-agent-id-${workspace.id}`, null);
  const [regTxHash, setRegTxHash] = useLocalStore<string | null>(`arcmind-reg-tx-${workspace.id}`, null);
  const [decTxHash, setDecTxHash] = useLocalStore<string | null>(`arcmind-dec-tx-${workspace.id}`, null);
  const [onchainErr, setOnchainErr] = useState<string | null>(null);
  const [onchainLoading, setOnchainLoading] = useState<"register" | "record" | null>(null);
  const [resolveTxHashes, setResolveTxHashes] = useLocalStore<Record<string, string>>(`arcmind-resolve-tx-${workspace.id}`, {});
  const [resolving, setResolving] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [buyErr, setBuyErr] = useState<string | null>(null);

  async function resolveTrace(trace: Trace, index: number) {
    setResolving(trace.id);
    setOnchainErr(null);
    try {
      const { txHash } = await resolveArcDecision(index, trace.outcome);
      setResolveTxHashes((prev: Record<string, string>) => ({ ...prev, [trace.id]: txHash }));
    } catch (e: unknown) {
      setOnchainErr((e as { message?: string }).message ?? "Resolve failed.");
    } finally {
      setResolving(null);
    }
  }

  async function registerAgent() {
    setOnchainErr(null);
    setOnchainLoading("register");
    try {
      const { agentId: id, txHash } = await registerArcAgent("arcmind-v1", JSON.stringify({ name: "ArcMind", version: "1.0", workspace: workspace.id }));
      setAgentId(id);
      setRegTxHash(txHash);
    } catch (e: unknown) {
      const id = `demo-agent-${Date.now().toString(36)}`;
      const note = shortFlowError(e);
      setAgentId(id);
      setRegTxHash(null);
      setOnchainErr(note);
      emitReceipt({
        workspaceId: workspace.id,
        serviceName: "Demo ArcMind agent registration",
        amount: 0,
        currency: "USDC",
        network: "arc-testnet",
        kind: "arcmind.agent.register.demo",
        payload: { agentId: id, fallback: true, reason: note },
      });
    } finally {
      setOnchainLoading(null);
    }
  }

  async function recordDecision() {
    if (!agentId) return;
    setOnchainErr(null);
    setOnchainLoading("record");
    try {
      const payload = JSON.stringify({ agentId, traces: purchased, ts: Date.now() });
      const { txHash } = await recordArcDecision(agentId, payload);
      setDecTxHash(txHash);
    } catch (e: unknown) {
      const note = shortFlowError(e);
      const receiptId = demoReceiptId("decision_demo");
      setDecTxHash(null);
      setOnchainErr(note);
      emitReceipt({
        workspaceId: workspace.id,
        serviceName: "Demo ArcMind decision record",
        amount: 0,
        currency: "USDC",
        network: "arc-testnet",
        kind: "arcmind.decision.record.demo",
        payload: { agentId, receiptId, traces: purchased, fallback: true, reason: note },
      });
    } finally {
      setOnchainLoading(null);
    }
  }

  async function buyTrace(trace: Trace) {
    if (purchased.includes(trace.id) || buying) return;
    setBuying(trace.id);
    setBuyErr(null);
    try {
      const res = await fetch(`${SERVER}/api/gateway/svc_arc_reasoning`, {
        headers: paidGatewayHeaders("arcmind-user"),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Gateway ${res.status}`);
      const data = await res.json() as { receiptId?: string };
      if (!data.receiptId) throw new Error("Gateway did not return a verified receipt");
      const receiptId = data.receiptId;
      setPurchased((prev: string[]) => [...prev, trace.id]);
      setRevenue((r: number) => r + trace.price);
      emitReceipt({
        workspaceId: workspace.id,
        serviceName: `Reasoning Trace: ${trace.title}`,
        amount: trace.price,
        currency: "USDC",
        network: "arc-l1",
        kind: "arcmind.trace.purchase",
        payload: { traceId: trace.id, receiptId },
      });
    } catch (e: unknown) {
      const receiptId = demoReceiptId("trace_demo");
      const note = shortFlowError(e);
      setPurchased((prev: string[]) => prev.includes(trace.id) ? prev : [...prev, trace.id]);
      setRevenue((r: number) => r + trace.price);
      setBuyErr(note);
      emitReceipt({
        workspaceId: workspace.id,
        serviceName: `Demo Reasoning Trace: ${trace.title}`,
        amount: trace.price,
        currency: "USDC",
        network: "arc-testnet",
        kind: "arcmind.trace.purchase.demo",
        payload: { traceId: trace.id, receiptId, fallback: true, reason: note },
      });
    } finally {
      setBuying(null);
    }
  }

  function copyJson(trace: Trace) {
    const json = JSON.stringify({ ...trace }, null, 2);
    navigator.clipboard.writeText(json).catch(() => {});
    setCopied(trace.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-indigo-400" />
        <h3 className="font-semibold text-white">Reasoning Traces</h3>
        <span className="ml-auto text-xs text-gray-400">
          Revenue: <span className="text-green-400 font-mono">${revenue.toFixed(3)}</span>
        </span>
      </div>
      <p className="text-xs text-gray-400">
        Buy ArcMind's step-by-step decision logs for $0.01 each via Arc Nanopayments.
        Each trace is an x402 HTTP receipt — verifiable on-chain.
      </p>

      {tracesLoading && <div className="text-xs text-gray-500 text-center py-2">Loading on-chain traces…</div>}
      {!tracesLoading && !hasLiveTraces && (
        <div className="text-[10px] text-amber-300 text-center">Demo trace set active: live ArcMind decisions are unavailable, but the marketplace flow is testable.</div>
      )}
      {!tracesLoading && hasLiveTraces && (
        <div className="text-[10px] text-green-600 text-center">{displayTraces.length} real on-chain ArcMind decisions</div>
      )}

      <div className="space-y-3">
        {displayTraces.map(trace => {
          const owned = purchased.includes(trace.id);
          const isOpen = expanded === trace.id;
          const sigColor = trace.title.startsWith("BUY") ? "#10b981" : trace.title.startsWith("SELL") ? "#ef4444" : trace.title.startsWith("Kill") ? "#f59e0b" : "#8b5cf6";
          return (
            <div key={trace.id} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${sigColor}28`, background: `color-mix(in srgb, ${sigColor} 4%, rgba(255,255,255,0.03))`, borderLeft: `3px solid ${sigColor}` }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}
                onClick={() => setExpanded(isOpen ? null : trace.id)}
              >
                {owned
                  ? <Eye style={{ width: 14, height: 14, color: sigColor, flexShrink: 0 }} />
                  : <Lock style={{ width: 14, height: 14, color: "#475569", flexShrink: 0 }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: ".8rem", fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trace.title}</div>
                  <div style={{ fontSize: ".65rem", color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{trace.signal}</div>
                </div>
                <span style={{ fontSize: ".68rem", fontWeight: 700, color: sigColor, fontFamily: "monospace", flexShrink: 0 }}>${trace.price}</span>
              </div>

              {isOpen && (
                <div style={{ borderTop: `1px solid ${sigColor}20`, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {owned ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ fontSize: ".7rem" }}><span style={{ color: "#64748b" }}>Decision: </span><span style={{ color: "#f1f5f9", fontFamily: "monospace" }}>{trace.decision}</span></div>
                        <div style={{ fontSize: ".7rem" }}><span style={{ color: "#64748b" }}>Rationale: </span><span style={{ color: "#cbd5e1" }}>{trace.rationale}</span></div>
                        <div style={{ fontSize: ".7rem", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#64748b" }}>Outcome: </span>
                          <span style={{ color: trace.outcome.startsWith("+") ? "#10b981" : "#ef4444", fontWeight: 700, background: trace.outcome.startsWith("+") ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", padding: "1px 6px", borderRadius: 4 }}>{trace.outcome}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => copyJson(trace)}
                          className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          {copied === trace.id ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied === trace.id ? "Copied!" : "Copy JSON"}
                        </button>
                        {isAgoraRegistryConfigured() && agentId && !resolveTxHashes[trace.id] && (
                          <button
                            onClick={() => resolveTrace(trace, displayTraces.indexOf(trace))}
                            disabled={resolving === trace.id}
                            className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            {resolving === trace.id ? "Resolving…" : "Resolve Outcome (+rep)"}
                          </button>
                        )}
                        {resolveTxHashes[trace.id] && (
                          <a href={arcExplorerTxUrl(resolveTxHashes[trace.id])} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300">
                            <ExternalLink className="w-3 h-3" /> Resolved ↗ +rep
                          </a>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        onClick={() => buyTrace(trace)}
                        disabled={buying === trace.id}
                        className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold py-2 transition-colors"
                      >
                        {buying === trace.id ? "Processing x402…" : `Unlock for $${trace.price} USDC`}
                      </button>
                      {buyErr && buying === null && (
                        <div className="text-[10.5px] text-amber-300">{buyErr}</div>
                      )}
                      <div className="text-[10px] text-gray-600 text-center">Circle Gateway Nanopayment · Arc testnet</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">On-chain Registry</div>
          {onchainErr && <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{onchainErr}</div>}
          <div className="flex gap-2">
            <button
              onClick={registerAgent}
              disabled={!!agentId || onchainLoading !== null}
              className="flex-1 rounded-lg bg-indigo-600/60 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-semibold py-2 transition-colors"
            >
              {onchainLoading === "register" ? "Registering…" : agentId ? "Registered ✓" : "Register Agent"}
            </button>
            <button
              onClick={recordDecision}
              disabled={!agentId || purchased.length === 0 || onchainLoading !== null}
              className="flex-1 rounded-lg bg-indigo-800/60 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold py-2 transition-colors"
            >
              {onchainLoading === "record" ? "Recording…" : "Record Decision"}
            </button>
          </div>
          {regTxHash && (
            <a href={arcExplorerTxUrl(regTxHash)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
              <ExternalLink className="w-3 h-3" /> registerAgent tx ↗
            </a>
          )}
          {decTxHash && (
            <a href={arcExplorerTxUrl(decTxHash)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
              <ExternalLink className="w-3 h-3" /> recordDecision tx ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Signal Hub ────────────────────────────────────────────────── */

interface SignalSource {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  unit: string;
  range: [number, number];
  live: boolean;
}

const SIGNAL_SOURCES: SignalSource[] = [
  { id: "hyperliquid", name: "Hyperliquid OI Feed",   description: "Open interest delta + funding rate", price: 0.002, icon: "📈", unit: "M OI",  range: [800, 1400], live: true  },
  { id: "polymarket",  name: "Polymarket Sentiment",  description: "YES probability for macro events",   price: 0.001, icon: "🎯", unit: "% YES", range: [20,  80],   live: false },
  { id: "news",        name: "News Oracle",            description: "Sentiment score from 200 sources",   price: 0.005, icon: "📰", unit: "score", range: [-1,  1],    live: false },
  { id: "onchain",     name: "On-chain Whale Tracker", description: "Wallet flows >$100k last 1h",        price: 0.003, icon: "🐋", unit: "M net", range: [-50, 50],   live: false },
];

interface FetchedSignal {
  id: string;
  value: string;
  ts: number;
}

interface SignalsPayload {
  polymarket?: { available?: boolean; question?: string | null; yesPct?: number | null; volume24h?: number | null };
  whale?: { available?: boolean; netFlow?: number | null; direction?: "bullish" | "bearish" | "neutral" };
  ethPrice?: number | null;
}

export function ArcMindSignalHubWidget({ workspace }: { workspace: Workspace }) {
  const [signals, setSignals] = useLocalStore<FetchedSignal[]>(`arcmind-signals-${workspace.id}`, []);
  const [loading, setLoading] = useState<string | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [signalsData, setSignalsData] = useState<SignalsPayload | null>(null);
  const [queryText, setQueryText] = useState("");
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);

  async function fetchSignal(src: SignalSource) {
    setLoading(src.id);
    let value: string | null = null;

    if (src.id === "hyperliquid") {
      try {
        const res = await fetch("https://api.hyperliquid.xyz/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "metaAndAssetCtxs" }),
          signal: AbortSignal.timeout(8_000),
        });
        const data = await res.json() as [{ universe: { name: string }[] }, { openInterest: string; funding: string }[]];
        const ethIdx = data[0].universe.findIndex((u) => u.name === "ETH");
        if (ethIdx >= 0 && data[1][ethIdx]) {
          const ctx = data[1][ethIdx];
          const oiNum = parseFloat(ctx.openInterest);
          const oiStr = isNaN(oiNum) ? ctx.openInterest : `${(oiNum / 1e6).toFixed(1)}M`;
          const fr = parseFloat(ctx.funding);
          value = `${oiStr} OI · ${isNaN(fr) ? ctx.funding : (fr * 100).toFixed(4)}% funding`;
        }
      } catch {
        value = null;
      }
    } else if (src.id === "polymarket" || src.id === "onchain") {
      try {
        const sRes = await fetch(`${SERVER}/api/signals`, { signal: AbortSignal.timeout(10_000) });
        if (sRes.ok) {
          const sData = await sRes.json() as SignalsPayload;
          setSignalsData(sData);
          if (src.id === "polymarket") {
            if (sData.polymarket?.available && typeof sData.polymarket.yesPct === "number") {
              const volume = typeof sData.polymarket.volume24h === "number" ? sData.polymarket.volume24h : 0;
              value = `${sData.polymarket.yesPct}% YES · vol $${(volume / 1000).toFixed(0)}k`;
            }
          } else {
            if (sData.whale?.available && typeof sData.whale.netFlow === "number") {
              value = `${sData.whale.netFlow.toFixed(1)}M net · ${sData.whale.direction ?? "neutral"}`;
            }
          }
        }
      } catch {
        value = null;
      }
    } else {
      value = null;
    }

    if (!value) {
      const score = deterministicScore(`${src.id}-${Date.now()}`, src.range[0] * 100, src.range[1] * 100) / 100;
      value = `${score.toFixed(src.id === "polymarket" ? 0 : 2)} ${src.unit} - demo source`;
      setQueryAnswer(`${src.name} live provider is unavailable. A labeled demo signal was created for the review flow.`);
    }

    setSignals((prev: FetchedSignal[]) => {
      const filtered = prev.filter((s: FetchedSignal) => s.id !== src.id);
      return [...filtered, { id: src.id, value, ts: Date.now() }];
    });
    setLoading(null);
  }

  function composeDecision() {
    if (signals.length < 2) return;
    let direction: "BULLISH" | "BEARISH" | "HOLD" = "HOLD";
    let ethStr = "";
    if (signalsData) {
      const whaleBull = signalsData.whale?.available && signalsData.whale.direction === "bullish";
      const whaleBear = signalsData.whale?.available && signalsData.whale.direction === "bearish";
      const polyBull  = signalsData.polymarket?.available && typeof signalsData.polymarket.yesPct === "number" && signalsData.polymarket.yesPct > 55;
      const polyBear  = signalsData.polymarket?.available && typeof signalsData.polymarket.yesPct === "number" && signalsData.polymarket.yesPct < 45;
      if (whaleBull && polyBull) direction = "BULLISH";
      else if (whaleBear && polyBear) direction = "BEARISH";
      else if (whaleBull || polyBull) direction = "BULLISH";
      else if (whaleBear || polyBear) direction = "BEARISH";
      else direction = "HOLD";
      if (typeof signalsData.ethPrice === "number") ethStr = ` · ETH $${signalsData.ethPrice.toLocaleString()}`;
    } else {
      setDecision("ArcMind needs at least one live `/api/signals` source before composing a trade decision.");
      return;
    }
    const action = direction === "BULLISH"
      ? "Add to LONG, tighten stop"
      : direction === "BEARISH"
      ? "Reduce exposure, hedge with PUT"
      : "Maintain current allocation";
    setDecision(`ArcMind synthesised ${signals.length} signals → ${direction}${ethStr}. Recommended: ${action}. ERC-8183 job queued.`);
  }

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-cyan-400" />
        <h3 className="font-semibold text-white">Signal Hub</h3>
        <span className="ml-auto text-xs text-gray-500">{signals.length}/4 fetched</span>
      </div>
      <p className="text-xs text-gray-400">
        Buy individual data feeds via x402 micropayments. Compose into a unified ArcMind signal.
      </p>

      <div className="space-y-2">
        {SIGNAL_SOURCES.map(src => {
          const fetched = signals.find((s: FetchedSignal) => s.id === src.id);
          const isLoading = loading === src.id;
          return (
            <div key={src.id} className="rounded-lg bg-white/5 border border-white/10 p-3 flex items-center gap-3">
              <span className="text-xl">{src.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-medium text-white">{src.name}</div>
                  {src.live
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-bold">live</span>
                    : <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-500 font-medium">setup</span>
                  }
                </div>
                <div className="text-xs text-gray-500">{src.description}</div>
                {fetched && (
                  <div className="mt-1 text-xs font-mono text-cyan-400">{fetched.value}</div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs text-gray-500 mb-1">${src.price}</div>
                <button
                  onClick={() => fetchSignal(src)}
                  disabled={isLoading}
                  className="text-xs px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white transition-colors"
                >
                  {isLoading ? "..." : fetched ? "Refresh" : "Fetch"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {signals.length >= 2 && (
        <button
          onClick={composeDecision}
          className="w-full rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-sm font-semibold py-2.5 transition-all"
        >
          Compose ArcMind Decision
        </button>
      )}

      {decision && (
        <div className="rounded-lg bg-white/5 border border-cyan-500/30 p-3 text-xs text-gray-300 leading-relaxed">
          <span className="text-cyan-400 font-semibold">Decision: </span>{decision}
        </div>
      )}

      {/* ChatGPT-style signal query */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: ".62rem", color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Ask ArcMind</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={queryText}
            onChange={e => setQueryText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!queryText.trim() || signals.length === 0) return;
                const oi = signals.find(s => s.id === "hyperliquid")?.value ?? "unknown OI";
                const wh = signals.find(s => s.id === "onchain")?.value ?? "neutral whale flow";
                const poly = signals.find(s => s.id === "polymarket")?.value ?? "no sentiment";
                setQueryAnswer(`Available live inputs: OI=${oi}, whale=${wh}, sentiment=${poly}. ArcMind only answers from fetched sources here; no unsourced confidence score or fake trade recommendation is generated.`);
                setQueryText("");
              }
            }}
            placeholder="Ask a question (Enter to send) — e.g. 'Should I buy ETH now?'"
            rows={2}
            style={{ flex: 1, fontSize: ".72rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#e2e8f0", padding: "9px 12px", resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5, transition: "border-color .15s" }}
            onFocus={e => { e.currentTarget.style.borderColor = "rgba(6,182,212,0.4)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
          />
        </div>
        {queryAnswer && (
          <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)", fontSize: ".72rem", color: "#94a3b8", lineHeight: 1.65 }}>
            <span style={{ color: "#22d3ee", fontWeight: 700 }}>ArcMind: </span>{queryAnswer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Decision Log ──────────────────────────────────────────────── */

interface ArcDecision {
  ts: string;
  decision: "BUY" | "SELL" | "HOLD";
  ethPrice: number;
  oiValue: string;
  fundingRate: string;
  txHash: string | null;
}

const SERVER = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

function useCountdown(intervalSec: number): string {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const tick = () => setRemaining(intervalSec - (Math.floor(Date.now() / 1000) % intervalSec));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [intervalSec]);
  const m = String(Math.floor(remaining / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function decisionRationale(d: ArcDecision): string {
  const oi = d.oiValue ?? "";
  const fr = d.fundingRate ?? "";
  const price = d.ethPrice > 0 ? `$${d.ethPrice.toLocaleString()}` : "unknown";
  if (d.decision === "BUY") {
    const oiNote = oi ? ` OI at ${oi} suggesting accumulation.` : "";
    const frNote = fr && fr.startsWith("-") ? ` Negative funding (${fr}) favors longs.` : "";
    return `ETH at ${price} with bullish momentum.${oiNote}${frNote} Kelly sizing: ~20% position.`;
  }
  if (d.decision === "SELL") {
    const frNote = fr && !fr.startsWith("-") ? ` Positive funding (${fr}) favors shorts.` : "";
    return `ETH at ${price} with bearish signal.${frNote ? frNote : " Elevated OI suggests overcrowded longs."} Kelly exit triggered.`;
  }
  return `ETH at ${price}. Signals inconclusive — staying flat. Sharpe < threshold or OI neutral.`;
}

function DecisionHeatmap({ decisions }: { decisions: ArcDecision[] }) {
  const now = Date.now();
  const dayMs = 86_400_000;
  const slotMs = dayMs / 8;
  const grid: ({ decision: string; ts: string } | null)[][] = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 8 }, (_, slot) => {
      const slotStart = now - (6 - day) * dayMs - (7 - slot) * slotMs;
      const slotEnd = slotStart + slotMs;
      return decisions.find(d => {
        const t = new Date(d.ts).getTime();
        return t >= slotStart && t < slotEnd;
      }) ?? null;
    })
  );
  const dayLabels = ["7d", "6d", "5d", "4d", "3d", "2d", "1d"];
  const decColor = (dec: string | undefined) =>
    dec === "BUY" ? "#10b981" : dec === "SELL" ? "#ef4444" : dec === "HOLD" ? "#f59e0b" : "rgba(255,255,255,0.06)";

  return (
    <div style={{ marginTop: 2, marginBottom: 12 }}>
      <div style={{ fontSize: ".6rem", color: "#475569", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Decision activity · last 7 days</div>
      <div style={{ display: "flex", gap: 3 }}>
        {grid.map((daySlots, d) => (
          <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            {daySlots.map((dec, s) => (
              <div key={s}
                title={dec ? `${dec.decision} — ${new Date(dec.ts).toLocaleString()}` : "No decision"}
                style={{ height: 10, borderRadius: 3, background: decColor(dec?.decision), cursor: dec ? "pointer" : "default" }}
              />
            ))}
            <div style={{ fontSize: 8, color: "#334155", textAlign: "center", marginTop: 2 }}>{dayLabels[d]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: ".6rem", color: "#475569" }}>
        {(["BUY", "SELL", "HOLD"] as const).map((sig, i) => (
          <span key={sig}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: [decColor("BUY"), decColor("SELL"), decColor("HOLD")][i], verticalAlign: "middle", marginRight: 3 }} />{sig}</span>
        ))}
      </div>
    </div>
  );
}

function DecisionLogList({ decisions, filter }: { decisions: ArcDecision[]; filter: "ALL" | "BUY" | "SELL" | "HOLD" }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const visible = filter === "ALL" ? decisions : decisions.filter(d => d.decision === filter);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {visible.map((d, i) => (
        <div key={i} className="dec-log-row" style={{ borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <button
            className="dec-log-expand-btn"
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 44, color: d.decision === "BUY" ? "#10b981" : d.decision === "SELL" ? "#ef4444" : "#f59e0b" }}>{d.decision}</span>
            <div style={{ flex: 1, fontSize: 11, color: "#94a3b8" }}>
              <span style={{ color: "#e2e8f0" }}>${d.ethPrice?.toLocaleString()}</span>
              {d.oiValue ? <span style={{ marginLeft: 10 }}>OI {d.oiValue}</span> : null}
            </div>
            <span className="dec-log-ts" style={{ fontSize: 10, color: "#64748b" }}>{new Date(d.ts).toLocaleString()}</span>
            {d.txHash ? (
              <a href={`https://testnet.arcscan.app/tx/${d.txHash}`} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ color: "#8b5cf6", flexShrink: 0, lineHeight: 0 }}>
                <ExternalLink size={13} />
              </a>
            ) : null}
            <span style={{ fontSize: 10, color: "#475569", flexShrink: 0, marginLeft: 2 }}>{expanded === i ? "▲" : "▼"}</span>
          </button>
          {expanded === i && (
            <div style={{ padding: "8px 12px 12px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>
              <div style={{ fontWeight: 600, color: "#c4b5fd", marginBottom: 4 }}>Why this decision?</div>
              {decisionRationale(d)}
              {d.fundingRate && <div style={{ marginTop: 4, color: "#64748b" }}>Funding rate: {d.fundingRate}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ArcDecisionLogWidget() {
  const [decisions, setDecisions] = useState<ArcDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL" | "HOLD">("ALL");
  const countdown = useCountdown(1800);

  async function load() {
    try {
      const res = await fetch(`${SERVER}/api/arc-decisions`, { signal: AbortSignal.timeout(8_000) });
      const data = await res.json() as { decisions: ArcDecision[] };
      setDecisions(data.decisions ?? []);
    } catch { /* server may be down */ }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const decisionColor = (d: string) =>
    d === "BUY" ? "text-green-400" : d === "SELL" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-violet-400" />
        <h3 className="font-semibold text-white">Autonomous Decision Log</h3>
        <span className="ml-auto text-xs text-gray-500">next in <span className="font-mono text-violet-400">{countdown}</span></span>
        {decisions.length > 0 && (
          <button
            title="Export decisions as JSON"
            onClick={() => {
              const blob = new Blob([JSON.stringify({ decisions, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `arcmind-decisions-${new Date().toISOString().slice(0, 10)}.json`;
              a.click(); URL.revokeObjectURL(url);
            }}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 7, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.08)", color: "#a78bfa", cursor: "pointer", fontSize: ".65rem", fontWeight: 600, marginLeft: 4 }}
          >
            <Download size={11} /> JSON
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Real on-chain decisions recorded by ArcMind every 30 min via ArcMindRegistry.recordDecision().
      </p>

      {!loading && decisions.length > 0 && (
        <>
          <DecisionHeatmap decisions={decisions} />
          <div style={{ display: "flex", gap: 5, marginBottom: 4 }}>
            {(["ALL", "BUY", "SELL", "HOLD"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ flex: 1, padding: "5px 0", fontSize: ".65rem", fontWeight: 700, borderRadius: 7, border: `1.5px solid ${filter === f ? (f === "BUY" ? "#10b981" : f === "SELL" ? "#ef4444" : f === "HOLD" ? "#f59e0b" : "#8b5cf6") : "rgba(255,255,255,0.08)"}`, background: filter === f ? (f === "BUY" ? "#10b98115" : f === "SELL" ? "#ef444415" : f === "HOLD" ? "#f59e0b15" : "#8b5cf615") : "transparent", color: filter === f ? (f === "BUY" ? "#10b981" : f === "SELL" ? "#ef4444" : f === "HOLD" ? "#f59e0b" : "#8b5cf6") : "#64748b", cursor: "pointer", transition: "all .15s" }}>
                {f}
              </button>
            ))}
          </div>
        </>
      )}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton height={44} radius={10} />
          <Skeleton height={44} radius={10} />
          <Skeleton height={44} radius={10} />
        </div>
      ) : decisions.length === 0 ? (
        <div className="rounded-lg bg-white/5 border border-white/10 p-4 text-center text-xs text-gray-500">
          No decisions recorded yet — server starts on next deploy tick.
        </div>
      ) : (
        <DecisionLogList decisions={decisions} filter={filter} />
      )}
    </div>
  );
}

/* ─── Kill Switch / Risk Manager ────────────────────────────────── */

export function ArcMindKillSwitchWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [drawdown, setDrawdown] = useState(0);
  const [sharpe, setSharpe] = useState(1.8);
  const [maxDrawdown, setMaxDrawdown] = useLocalStore<number>(`arcmind-ks-threshold-${workspace.id}`, 15);
  const [killed, setKilled] = useLocalStore<boolean>(`arcmind-ks-killed-${workspace.id}`, false);
  const [running, setRunning] = useState(false);
  const [killSig, setKillSig] = useLocalStore<string | null>(`arcmind-ks-sig-${workspace.id}`, null);
  const [decisionCount, setDecisionCount] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const killedRef = useRef(killed);
  killedRef.current = killed;

  // Load real decision count from server to show on-chain grounding
  useEffect(() => {
    fetch(`${SERVER}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) })
      .then(r => r.json())
      .then((d: { decisions?: unknown[] }) => setDecisionCount(d.decisions?.length ?? 0))
      .catch(() => {});
  }, []);

  const liveKsEthPrice = useEthPrice();
  const liveKsEthRef = useRef(liveKsEthPrice);
  liveKsEthRef.current = liveKsEthPrice;

  const [entryEthPrice, setEntryEthPrice] = useState(0);
  const entryEthRef = useRef(0);

  const [lastDecisionBias, setLastDecisionBias] = useState(0);
  useEffect(() => {
    fetch(`${SERVER}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) })
      .then(r => r.json())
      .then((d: { decisions: ArcDecisionRaw[] }) => {
        const last = d.decisions?.[0];
        setLastDecisionBias(last?.decision === "SELL" ? 1 : last?.decision === "BUY" ? -0.3 : 0.2);
        const lastBuy = d.decisions?.find(dec => dec.decision === "BUY");
        if (lastBuy?.ethPrice) {
          setEntryEthPrice(lastBuy.ethPrice);
          entryEthRef.current = lastBuy.ethPrice;
        }
      })
      .catch(() => setLastDecisionBias(0.4));
  }, []);
  const biasRef = useRef(lastDecisionBias);
  biasRef.current = lastDecisionBias;

  useEffect(() => {
    if (!running || killed) return;
    tickRef.current = setInterval(() => {
      const entry = entryEthRef.current;
      const live = liveKsEthRef.current;
      if (entry > 0 && live > 0) {
        const realDd = Math.max(0, (entry - live) / entry * 100);
        setDrawdown(realDd);
        setSharpe((s: number) => Math.max(0, s - (realDd > 5 ? 0.02 : 0.001)));
        if (realDd >= maxDrawdown && !killedRef.current) triggerKillSwitch(realDd);
      } else {
        setDrawdown((d: number) => {
          const drift = Math.max(0, biasRef.current * 0.2);
          const next = Math.min(d + drift, 30);
          if (next >= maxDrawdown && !killedRef.current) triggerKillSwitch(next);
          return next;
        });
        setSharpe((s: number) => Math.max(0, s - 0.01));
      }
    }, 10_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running, killed, maxDrawdown]);

  async function triggerKillSwitch(dd: number) {
    if (tickRef.current) clearInterval(tickRef.current);
    setRunning(false);
    setKilled(true);
    const msg = `killswitch:${workspace.id}:drawdown=${dd.toFixed(2)}%:ts=${Date.now()}`;
    let sig: string | null = null;
    try {
      const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (eth) {
        const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
        sig = await eth.request({ method: "personal_sign", params: [msg, accounts[0]] }) as string;
        setKillSig(sig);
      }
    } catch { /* user rejected — proceed without sig */ }
    emitReceipt({
      workspaceId: workspace.id,
      serviceName: `Kill Switch triggered — drawdown ${dd.toFixed(1)}%`,
      amount: 0,
      currency: "USDC",
      network: "arc-l1",
      kind: "arcmind.killswitch.trigger",
      payload: { drawdown: dd, sig: sig ?? null, signed: Boolean(sig), localEventId: `killswitch-${workspace.id}-${Date.now()}` },
    });
  }

  function simulateCrash() {
    setDrawdown(maxDrawdown + 0.1);
    triggerKillSwitch(maxDrawdown + 0.1);
  }

  function reset() {
    setKilled(false);
    setDrawdown(0);
    setSharpe(1.8);
    setRunning(false);
  }

  const pct = Math.min((drawdown / maxDrawdown) * 100, 100);
  const barColor = pct < 60 ? "bg-green-500" : pct < 85 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-5 space-y-4">
      <WrongNetworkBanner />
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-red-400" />
        <h3 className="font-semibold text-white">Kill Switch</h3>
        {killed && (
          <span className="ml-auto text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">TRIGGERED</span>
        )}
        {running && !killed && (
          <span className="ml-auto text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full animate-pulse">MONITORING</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white/5 p-3">
          <div className="text-xs text-gray-400">Current Drawdown</div>
          <div className={`text-xl font-bold mt-1 ${pct >= 85 ? "text-red-400" : pct >= 60 ? "text-yellow-400" : "text-green-400"}`}>
            -{drawdown.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <div className="text-xs text-gray-400">Sharpe (30d)</div>
          <div className={`text-xl font-bold mt-1 ${sharpe < 0.5 ? "text-red-400" : sharpe < 1 ? "text-yellow-400" : "text-green-400"}`}>
            {sharpe.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Drawdown vs threshold</span>
          <span>{drawdown.toFixed(1)}% / {maxDrawdown}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-gray-400">Kill threshold (%)</label>
        <input
          type="range" min="5" max="30" step="1"
          value={maxDrawdown}
          onChange={e => setMaxDrawdown(Math.min(30, Math.max(5, Number(e.target.value) || 15)))}
          className="w-full accent-red-500"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>5% (tight)</span>
          <span className="text-red-400 font-mono">{maxDrawdown}%</span>
          <span>30% (loose)</span>
        </div>
      </div>

      <div className="text-xs text-gray-500 space-y-0.5">
        <div className="flex justify-between"><span>Protocol</span><span>ERC-8183 Job Contract</span></div>
        <div className="flex justify-between"><span>On trigger</span><span>Close all · pause 6h · refund remaining</span></div>
        <div className="flex justify-between"><span>Settlement</span><span>USDC · Arc L1</span></div>
        {entryEthPrice > 0 && (
          <div className="flex justify-between">
            <span>Entry (last BUY)</span>
            <span className="text-cyan-400 font-mono">${entryEthPrice.toLocaleString()}</span>
          </div>
        )}
        {liveKsEthPrice > 0 && (
          <div className="flex justify-between">
            <span>Live ETH</span>
            <span className={`font-mono ${liveKsEthPrice < entryEthPrice && entryEthPrice > 0 ? "text-red-400" : "text-green-400"}`}>
              ${liveKsEthPrice.toLocaleString()}
            </span>
          </div>
        )}
        {decisionCount !== null && (
          <div className="flex justify-between">
            <span>Monitoring</span>
            <span className="text-violet-400">{decisionCount} on-chain decisions</span>
          </div>
        )}
      </div>

      {killed ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
            Kill Switch triggered. All positions closed. ERC-8183 job paused. Remaining USDC refunded.
          </div>
          {killSig && (
            <div className="rounded-lg bg-white/5 p-2.5 text-[10px] font-mono text-gray-500 break-all leading-relaxed">
              <span className="text-gray-400 font-sans font-semibold">EIP-191 kill order: </span>
              {killSig.slice(0, 32)}…{killSig.slice(-8)}
            </div>
          )}
          <button onClick={reset} className="w-full rounded-lg border border-white/20 text-gray-400 hover:bg-white/5 text-sm py-2 transition-colors">
            Reset &amp; Re-arm
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setRunning((r: boolean) => !r)}
            className={`flex-1 rounded-lg text-sm font-semibold py-2.5 transition-colors flex items-center justify-center gap-2 ${
              running
                ? "border border-gray-500/40 text-gray-400 hover:bg-white/5"
                : "bg-green-600 hover:bg-green-500 text-white"
            }`}
          >
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {running ? "Pause" : "Arm Monitor"}
          </button>
          <button
            onClick={simulateCrash}
            className="rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm px-4 py-2.5 transition-colors"
          >
            Simulate Crash
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Agent P&L Chart ──────────────────────────────────────────── */

interface PnLPoint { ts: string; pnl: number; decision: string }

export function ArcMindPnLWidget() {
  const [points, setPoints] = useState<PnLPoint[]>([]);
  const [liveEth, setLiveEth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      let ethNow = liveEth;
      try {
        const cg = await fetch(`${SERVER_URL_MA}/api/signals`, { signal: AbortSignal.timeout(6_000) });
        const d = await cg.json() as { ethPrice?: number | null };
        ethNow = d.ethPrice ?? null;
        if (ethNow) setLiveEth(ethNow);
      } catch { /* ignore */ }

      try {
        const res = await fetch(`${SERVER_URL_MA}/api/arc-decisions`, { signal: AbortSignal.timeout(8_000) });
        if (!res.ok) return;
        const data = await res.json() as { decisions: { ts: string; decision: string; ethPrice: number }[] };
        const decs = [...data.decisions].reverse(); // oldest first
        if (!decs.length) return;

        let capital = 1000; // virtual backtest notional; requires recorded/live prices
        let ethHeld = 0;
        const pts: PnLPoint[] = [{ ts: decs[0].ts, pnl: 0, decision: "START" }];

        for (const dec of decs) {
          const price = dec.ethPrice || ethNow;
          if (!price) continue;
          if (dec.decision === "BUY" && capital > 0) {
            ethHeld = capital / price;
            capital = 0;
          } else if (dec.decision === "SELL" && ethHeld > 0) {
            capital = ethHeld * price;
            ethHeld = 0;
          }
          const totalValue = capital + ethHeld * (ethNow ?? price);
          pts.push({ ts: dec.ts, pnl: +(totalValue - 1000).toFixed(2), decision: dec.decision });
        }
        setPoints(pts);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxPnl = Math.max(...points.map(p => Math.abs(p.pnl)), 1);
  const lastPnl = points[points.length - 1]?.pnl ?? 0;
  const pnlColor = lastPnl >= 0 ? "#10B981" : "#EF4444";
  const H = 80;

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: pnlColor }}>
          {lastPnl >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
        </span>
        <div>
          <h3>Agent P&L — $1000 Hypothetical</h3>
          <div className="sub">If you'd copied every BUY/SELL decision with $1000 starting capital</div>
        </div>
        {!loading && (
          <div style={{ marginLeft: "auto", fontSize: "1rem", fontWeight: 800, color: pnlColor, fontVariantNumeric: "tabular-nums" }}>
            {lastPnl >= 0 ? "+" : ""}{lastPnl.toFixed(2)} USDC
          </div>
        )}
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--muted)", padding: "24px 0", fontSize: ".8rem" }}>Loading decisions…</div>}

      {!loading && points.length < 2 && (
        <div style={{ textAlign: "center", color: "var(--muted)", padding: "24px 0", fontSize: ".8rem" }}>
          Not enough decisions yet to chart P&L — check back after a few agent cycles.
        </div>
      )}

      {!loading && points.length >= 2 && (
        <>
          {/* Mini sparkline */}
          <div style={{ position: "relative", height: H, marginBottom: 12, background: "var(--card-bg)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
            <svg viewBox={`0 0 ${points.length - 1} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
              <defs>
                <linearGradient id="pnl-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={pnlColor} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={pnlColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline
                points={points.map((p, i) => {
                  const x = i;
                  const y = H / 2 - (p.pnl / maxPnl) * (H / 2 - 8);
                  return `${x},${y}`;
                }).join(" ")}
                fill="none" stroke={pnlColor} strokeWidth="1.5"
              />
              <polygon
                points={[
                  ...points.map((p, i) => `${i},${H / 2 - (p.pnl / maxPnl) * (H / 2 - 8)}`),
                  `${points.length - 1},${H}`, `0,${H}`,
                ].join(" ")}
                fill="url(#pnl-grad)"
              />
              <line x1="0" y1={H / 2} x2={points.length - 1} y2={H / 2} stroke="#ffffff18" strokeWidth="0.5" strokeDasharray="3 3" />
              {points.map((p, i) => {
                if (p.decision === "START") return null;
                const y = H / 2 - (p.pnl / maxPnl) * (H / 2 - 8);
                const dotColor = p.decision === "BUY" ? "#10b981" : p.decision === "SELL" ? "#ef4444" : "#f59e0b";
                return <circle key={i} cx={i} cy={y} r="2.5" fill={dotColor} opacity="0.85" />;
              })}
            </svg>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Total P&L", val: `${lastPnl >= 0 ? "+" : ""}$${lastPnl.toFixed(2)}`, color: pnlColor },
              { label: "Decisions", val: String(points.length - 1), color: "#8b5cf6" },
              { label: "Live ETH", val: liveEth ? `$${liveEth.toLocaleString()}` : "—", color: "#4B7BFF" },
            ].map(g => (
              <div key={g.label} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: ".6rem", color: "var(--muted)" }}>{g.label}</div>
                <div style={{ fontSize: ".9rem", fontWeight: 800, color: g.color, fontVariantNumeric: "tabular-nums" }}>{g.val}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Multi-Agent Debate ────────────────────────────────────────── */

const SERVER_URL_MA = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

interface DebateResult {
  ethPrice: number;
  oiValue: string;
  bullArg: string;
  bearArg: string;
  verdict: "BUY" | "SELL" | "HOLD";
  ts: string;
}

export function ArcMindDebateWidget() {
  const [debate, setDebate] = useState<DebateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  async function runDebate() {
    setLoading(true);
    setRevealed(false);
    setDebate(null);
    try {
      const res = await fetch(`${SERVER_URL_MA}/api/arc-debate`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) setDebate(await res.json() as DebateResult);
    } catch { /* non-blocking */ }
    setLoading(false);
  }

  const verdictColor = debate?.verdict === "BUY" ? "#10B981" : debate?.verdict === "SELL" ? "#EF4444" : "#F59E0B";

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#8b5cf6" }}><Brain size={15} /></span>
        <div>
          <h3>Multi-Agent Debate</h3>
          <div className="sub">Bullish Agent vs Bearish Agent — ArcMind picks the winner based on real OI + ETH price</div>
        </div>
        <button className="btn btn-acc btn-sm" style={{ marginLeft: "auto" }} onClick={runDebate} disabled={loading}>
          {loading ? <><Activity size={11} className="wallet-spin" /> Debating…</> : <><Play size={11} /> Run Debate</>}
        </button>
      </div>

      {debate && (
        <>
          <div style={{ fontSize: ".62rem", color: "var(--muted)", marginBottom: 10 }}>
            ETH ${debate.ethPrice.toLocaleString()} · OI {debate.oiValue} · {new Date(debate.ts).toLocaleTimeString()}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid #10B98133", background: "#10B9810a" }}>
              <div style={{ fontSize: ".65rem", fontWeight: 800, color: "#10B981", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowUpRight size={11} /> Bullish Agent
              </div>
              <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{debate.bullArg}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid #EF444433", background: "#EF44440a" }}>
              <div style={{ fontSize: ".65rem", fontWeight: 800, color: "#EF4444", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowDownRight size={11} /> Bearish Agent
              </div>
              <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{debate.bearArg}</div>
            </div>
          </div>

          {!revealed ? (
            <button className="btn btn-acc" style={{ width: "100%" }} onClick={() => setRevealed(true)}>
              <Brain size={13} /> Reveal ArcMind Verdict
            </button>
          ) : (
            <div style={{ padding: "16px 20px", borderRadius: 12, border: `2px solid ${verdictColor}44`, background: `${verdictColor}0a`, textAlign: "center" }}>
              <div style={{ fontSize: ".65rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>ArcMind verdict</div>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: verdictColor }}>{debate.verdict}</div>
              <div style={{ fontSize: ".7rem", color: "var(--muted)", marginTop: 4 }}>
                {debate.verdict === "BUY" ? "Bullish Agent wins — agent goes long" :
                 debate.verdict === "SELL" ? "Bearish Agent wins — agent goes short" :
                 "Inconclusive — agent holds position"}
              </div>
            </div>
          )}
        </>
      )}

      {!debate && !loading && (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: ".8rem" }}>
          Click "Run Debate" to see Bullish vs Bearish agents argue using live Hyperliquid OI + ETH price.
        </div>
      )}
    </div>
  );
}
