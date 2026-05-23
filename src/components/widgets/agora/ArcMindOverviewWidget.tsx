import { useEffect, useState } from "react";
import { Activity, TrendingUp, TrendingDown, Pause, Play, ArrowRight, Wallet, ExternalLink } from "lucide-react";
import type { Workspace } from "../../../types";
import { useLocalStore } from "../../../lib/storage";
import { copySessionKey, type CopySession } from "../../../workspaces/agora/copySession";
import { arcExplorerTxUrl } from "../../../lib/agora";
import { ArcMindAlgorithmProfile } from "./ArcMindAlgorithmProfile";

const SERVER = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

interface ArcDecision { decision: "BUY" | "SELL" | "HOLD"; ethPrice: number; ts: string; txHash?: string }

function useLatestDecision(): { decision: ArcDecision | null; total: number; serverOnline: boolean | null } {
  const [data, setData] = useState<{ decision: ArcDecision | null; total: number; serverOnline: boolean | null }>({ decision: null, total: 0, serverOnline: null });
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const r = await fetch(`${SERVER}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) });
        if (!r.ok) {
          if (mounted) setData((p) => ({ ...p, serverOnline: false }));
          return;
        }
        const d = await r.json() as { decisions: ArcDecision[] };
        const decisions = d.decisions ?? [];
        if (mounted) setData({ decision: decisions[0] ?? null, total: decisions.length, serverOnline: true });
      } catch {
        if (mounted) setData((p) => ({ ...p, serverOnline: false }));
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);
  return data;
}

function useLiveEth(): { price: number } {
  const [state, setState] = useState({ price: 0 });
  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { signal: AbortSignal.timeout(8_000) });
        if (!r.ok) return;
        const d = await r.json() as { ethereum?: { usd?: number } };
        if (mounted && d?.ethereum?.usd) setState({ price: d.ethereum.usd });
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);
  return state;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function decisionTone(d?: ArcDecision["decision"]): string {
  if (d === "BUY") return "#10b981";
  if (d === "SELL") return "#ef4444";
  return "#f59e0b";
}

interface Props {
  workspace: Workspace;
  onGoTab?: (tab: string) => boolean;
}

export function ArcMindOverviewWidget({ workspace, onGoTab }: Props) {
  const { decision, total, serverOnline } = useLatestDecision();
  const eth = useLiveEth();
  const [session] = useLocalStore<CopySession | null>(copySessionKey(workspace.id), null);

  const isFollowing = session && session.status !== "withdrawn" && session.status !== "idle";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Hero strip */}
      <div style={{
        background: "linear-gradient(145deg, rgba(8,13,25,0.94), rgba(10,18,32,0.82))",
        border: "1px solid rgba(96,165,250,0.20)",
        borderRadius: 18,
        padding: 20,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <HeroStat
            label="ETH / USD"
            value={eth.price > 0 ? `$${eth.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "loading…"}
            sub="CoinGecko · live"
            icon={eth.price > 0 ? <TrendingUp size={18} style={{ color: "#10b981" }} /> : <Activity size={18} style={{ color: "#9fb0c8" }} />}
            tone="#fff"
          />
          <HeroStat
            label="ArcMind status"
            value={serverOnline === false ? "offline" : serverOnline === null ? "loading…" : "running"}
            sub={`${total} on-chain decisions`}
            icon={serverOnline ? <Play size={18} style={{ color: "#10b981" }} /> : <Pause size={18} style={{ color: "#f59e0b" }} />}
            tone={serverOnline === false ? "#ef4444" : "#10b981"}
          />
          <HeroStat
            label="Last decision"
            value={decision ? decision.decision : "—"}
            sub={decision ? `ETH $${decision.ethPrice.toLocaleString()} · ${timeAgo(decision.ts)}` : "no decisions yet"}
            icon={decision?.decision === "SELL" ? <TrendingDown size={18} style={{ color: decisionTone(decision.decision) }} /> : <TrendingUp size={18} style={{ color: decisionTone(decision?.decision) }} />}
            tone={decisionTone(decision?.decision)}
          />
          <HeroStat
            label="Your position"
            value={isFollowing ? `$${session!.activeStakeUsd.toFixed(2)}` : "not started"}
            sub={isFollowing ? `${session!.status.replace(/_/g, " ")} · PnL ${session!.unrealizedPnlUsd >= 0 ? "+" : ""}$${session!.unrealizedPnlUsd.toFixed(2)}` : "click below to copy"}
            icon={<Wallet size={18} style={{ color: isFollowing ? "#a78bfa" : "#9fb0c8" }} />}
            tone={isFollowing ? "#a78bfa" : "#9fb0c8"}
          />
        </div>
      </div>

      {/* CTA */}
      {!isFollowing && (
        <button
          onClick={() => onGoTab?.("Copy & Position")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "14px 18px",
            background: "linear-gradient(135deg, #8b5cf6, #1652f0)",
            color: "#fff", border: "none", borderRadius: 14, cursor: "pointer",
            fontSize: ".95rem", fontWeight: 800,
            boxShadow: "0 12px 32px rgba(139,92,246,0.25)",
          }}>
          Copy ArcMind with $1 USDC <ArrowRight size={16} />
        </button>
      )}

      {/* My position card (if following) */}
      {isFollowing && session && (
        <div style={{
          background: "rgba(139,92,246,0.06)",
          border: "1px solid rgba(139,92,246,0.25)",
          borderRadius: 14,
          padding: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(139,92,246,0.18)", display: "grid", placeItems: "center" }}>
              <Wallet size={16} style={{ color: "#a78bfa" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#fff" }}>You are copying ArcMind</div>
              <div style={{ fontSize: ".68rem", color: "#9fb0c8" }}>Session: {session.status.replace(/_/g, " ")} · {session.riskProfile} profile · {session.maxDrawdownPct}% max DD</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
            <MiniStat label="Active stake" value={`$${session.activeStakeUsd.toFixed(2)}`} tone="#60a5fa" />
            <MiniStat label="Unrealized PnL" value={`${session.unrealizedPnlUsd >= 0 ? "+" : ""}$${session.unrealizedPnlUsd.toFixed(2)}`} tone={session.unrealizedPnlUsd >= 0 ? "#22c55e" : "#ef4444"} />
            <MiniStat label="Withdrawable" value={`$${session.withdrawableUsd.toFixed(2)}`} tone="#a78bfa" />
          </div>
          <button onClick={() => onGoTab?.("Copy & Position")}
            style={{
              width: "100%", padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(139,92,246,0.35)",
              background: "rgba(139,92,246,0.10)", color: "#a78bfa", fontWeight: 700, fontSize: ".78rem", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            Manage position <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Algorithm profile — answers "who am I copying?" */}
      <ArcMindAlgorithmProfile onGoSignalFeed={() => onGoTab?.("Signal Feed")} />

      {/* Latest decision link */}
      {decision?.txHash && decision.txHash.startsWith("0x") && (
        <a href={arcExplorerTxUrl(decision.txHash)} target="_blank" rel="noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 14px",
            border: "1px solid rgba(96,165,250,0.20)", background: "rgba(22,82,240,0.06)",
            borderRadius: 10, color: "#60a5fa", textDecoration: "none", fontSize: ".75rem", fontWeight: 700,
          }}>
          <ExternalLink size={13} /> View latest decision on ArcScan
          <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: ".68rem", opacity: 0.7 }}>
            {decision.txHash.slice(0, 10)}…{decision.txHash.slice(-6)}
          </span>
        </a>
      )}
    </div>
  );
}

function HeroStat({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: React.ReactNode; tone: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {icon}
        <span style={{ fontSize: ".62rem", color: "#9fb0c8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: tone, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: ".68rem", color: "#9fb0c8", marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: ".58rem", color: "#9fb0c8", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: ".95rem", fontWeight: 800, color: tone, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
    </div>
  );
}
