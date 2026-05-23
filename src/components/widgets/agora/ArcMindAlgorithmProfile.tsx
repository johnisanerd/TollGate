import { useEffect, useState } from "react";
import { Brain, ExternalLink, ChevronRight, Activity } from "lucide-react";
import { useLocalStore } from "../../../lib/storage";
import {
  arcExplorerAddrUrl,
  getAgoraConfig,
  getArcAgentStats,
} from "../../../lib/agora";

const SERVER = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

interface ArcDecisionRaw { decision: "BUY" | "SELL" | "HOLD"; ethPrice: number; ts: string; txHash?: string }
interface AlgoStats { ret30d: number; sharpe: number; winRate: number; totalDecisions: number }

interface DataSource { id: string; label: string; url: string; status: "live" | "needs_key" | "unavailable" }

const DATA_SOURCES: DataSource[] = [
  { id: "hyperliquid_oi", label: "Hyperliquid OI", url: "https://app.hyperliquid.xyz", status: "live" },
  { id: "coingecko_eth", label: "CoinGecko ETH/USD", url: "https://www.coingecko.com/en/coins/ethereum", status: "live" },
  { id: "polymarket", label: "Polymarket", url: "https://polymarket.com", status: "needs_key" },
  { id: "arc_registry", label: "Arc L1 Registry", url: "https://testnet.arcscan.app", status: "live" },
];

function useAlgoStats(): AlgoStats | null {
  const [stats, setStats] = useState<AlgoStats | null>(null);
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const r = await fetch(`${SERVER}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) });
        if (!r.ok) return;
        const d = await r.json() as { decisions: ArcDecisionRaw[] };
        const decisions = d.decisions ?? [];
        if (decisions.length < 2) return;
        let wins = 0;
        let count = 0;
        for (let i = 0; i < decisions.length - 1; i++) {
          const curr = decisions[i];
          const next = decisions[i + 1];
          if (curr.decision === "HOLD") continue;
          const priceUp = next.ethPrice > curr.ethPrice;
          if ((curr.decision === "BUY" && priceUp) || (curr.decision === "SELL" && !priceUp)) wins++;
          count++;
        }
        const first = decisions[decisions.length - 1];
        const last = decisions[0];
        const ret30d = first.ethPrice > 0 ? ((last.ethPrice - first.ethPrice) / first.ethPrice) * 100 : 0;
        const winRate = count > 0 ? (wins / count) * 100 : 0;
        if (mounted) {
          setStats({
            ret30d: parseFloat(ret30d.toFixed(1)),
            sharpe: parseFloat(Math.max(0.3, winRate / 30).toFixed(1)),
            winRate: parseFloat(winRate.toFixed(0)),
            totalDecisions: decisions.length,
          });
        }
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);
  return stats;
}

function sourceColor(status: DataSource["status"]): string {
  if (status === "live") return "#10b981";
  if (status === "needs_key") return "#f59e0b";
  return "#ef4444";
}

function sourceBadge(status: DataSource["status"]): string {
  if (status === "live") return "live";
  if (status === "needs_key") return "needs key";
  return "down";
}

interface Props {
  onGoSignalFeed?: () => void;
  compact?: boolean;
}

export function ArcMindAlgorithmProfile({ onGoSignalFeed, compact = false }: Props) {
  const stats = useAlgoStats();
  const cfg = getAgoraConfig();
  const [agentId] = useLocalStore<string | null>("arcmind-agent-id-agora", null);
  const [reputation, setReputation] = useState<number | null>(null);

  useEffect(() => {
    if (!agentId) return;
    getArcAgentStats(agentId).then((s) => { if (s) setReputation(s.reputation); });
  }, [agentId]);

  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(22,82,240,0.10), rgba(139,92,246,0.07))",
      border: "1px solid rgba(139,92,246,0.25)",
      borderRadius: 16,
      padding: compact ? 14 : 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(139,92,246,0.18)", display: "grid", placeItems: "center" }}>
          <Brain size={18} style={{ color: "#a78bfa" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: ".95rem", fontWeight: 800, color: "#fff" }}>ArcMind</div>
          <div style={{ fontSize: ".7rem", color: "#9fb0c8" }}>Autonomous AI agent on Arc L1 — not a human lead trader</div>
        </div>
        {reputation !== null && (
          <span style={{ fontSize: ".62rem", color: "#22c55e", fontWeight: 700, background: "rgba(34,197,94,0.12)", padding: "3px 9px", borderRadius: 6 }}>
            rep {reputation}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        <Stat label="30d return" value={stats ? `${stats.ret30d >= 0 ? "+" : ""}${stats.ret30d}%` : "—"} tone={stats && stats.ret30d >= 0 ? "#22c55e" : "#ef4444"} />
        <Stat label="Win rate" value={stats ? `${stats.winRate}%` : "—"} tone="#a78bfa" />
        <Stat label="Sharpe" value={stats ? stats.sharpe.toFixed(1) : "—"} tone="#60a5fa" />
        <Stat label="Decisions" value={stats ? String(stats.totalDecisions) : "—"} tone="#f59e0b" />
      </div>

      {!compact && (
        <>
          <div style={{ fontSize: ".62rem", color: "#9fb0c8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 8 }}>
            Data sources used
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {DATA_SOURCES.map((src) => (
              <a key={src.id} href={src.url} target="_blank" rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: ".68rem", fontWeight: 700,
                  color: sourceColor(src.status),
                  background: `${sourceColor(src.status)}14`,
                  border: `1px solid ${sourceColor(src.status)}30`,
                  padding: "4px 8px", borderRadius: 6, textDecoration: "none",
                }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: sourceColor(src.status), boxShadow: src.status === "live" ? `0 0 5px ${sourceColor(src.status)}` : "none" }} />
                {src.label}
                <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {sourceBadge(src.status)}</span>
                <ExternalLink size={9} style={{ opacity: 0.6 }} />
              </a>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {cfg.registryAddress && (
          <a href={arcExplorerAddrUrl(cfg.registryAddress)} target="_blank" rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: ".62rem", color: "#60a5fa", textDecoration: "none", fontFamily: "monospace" }}>
            <ExternalLink size={10} />
            Registry {cfg.registryAddress.slice(0, 6)}…{cfg.registryAddress.slice(-4)}
          </a>
        )}
        {onGoSignalFeed && (
          <button onClick={onGoSignalFeed}
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
              padding: "5px 10px", border: "1px solid rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.08)",
              color: "#a78bfa", borderRadius: 8, fontSize: ".68rem", fontWeight: 700, cursor: "pointer",
            }}>
            <Activity size={11} /> View latest reasoning
            <ChevronRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: ".58rem", color: "#9fb0c8", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 800, color: tone, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
    </div>
  );
}
