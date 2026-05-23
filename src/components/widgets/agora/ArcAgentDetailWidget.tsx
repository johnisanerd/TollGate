import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, TrendingUp, Users, DollarSign, Calendar, Shield } from "lucide-react";
import type { Workspace } from "../../../types";
import { ArcMindOverviewWidget } from "./ArcMindOverviewWidget";
import { ArcMindReasoningWidget, ArcMindCopyTradingWidget } from "./ArcMindWidgets";
import {
  getVaultDetails,
  hyperliquidVaultUrl,
  type VaultDetails,
  type VaultPortfolioPoint,
} from "../../../lib/hyperliquid";

interface Props {
  workspace: Workspace;
  agentId?: string; // "arcmind" | "hl-<address>" | undefined → arcmind default
  onGoTab?: (tab: string) => boolean;
  onBack?: () => void;
}

export function ArcAgentDetailWidget({ workspace, agentId, onGoTab, onBack }: Props) {
  const resolvedId = agentId ?? "arcmind";
  if (resolvedId === "arcmind") {
    return <ArcMindDetailSections workspace={workspace} onGoTab={onGoTab} onBack={onBack} />;
  }
  if (resolvedId.startsWith("hl-")) {
    const vaultAddress = resolvedId.slice(3);
    return <HyperliquidVaultDetail workspace={workspace} vaultAddress={vaultAddress} onBack={onBack} />;
  }
  return <div style={{ padding: 16, color: "#94a3b8" }}>Unknown agent id: {resolvedId}</div>;
}

function ArcMindDetailSections({ workspace, onGoTab, onBack }: { workspace: Workspace; onGoTab?: (tab: string) => boolean; onBack?: () => void }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {onBack && (
        <button onClick={onBack}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid rgba(96,165,250,0.30)",
            background: "rgba(22,82,240,0.08)",
            color: "#60a5fa", fontSize: ".72rem", fontWeight: 700, cursor: "pointer",
            width: "fit-content",
          }}>
          <ArrowLeft size={12} /> Back to Discover
        </button>
      )}
      <ArcMindOverviewWidget workspace={workspace} onGoTab={onGoTab} />
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
        <h3 style={{ margin: "0 0 12px", color: "#fff", fontSize: ".88rem", fontWeight: 800 }}>Live Signal Feed — reasoning per decision</h3>
        <ArcMindReasoningWidget workspace={workspace} />
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
        <h3 style={{ margin: "0 0 12px", color: "#fff", fontSize: ".88rem", fontWeight: 800 }}>Copy ArcMind</h3>
        <ArcMindCopyTradingWidget workspace={workspace} />
      </div>
    </div>
  );
}

function HyperliquidVaultDetail({ workspace: _workspace, vaultAddress, onBack }: { workspace: Workspace; vaultAddress: string; onBack?: () => void }) {
  const [details, setDetails] = useState<VaultDetails | null | "loading">("loading");
  useEffect(() => {
    let mounted = true;
    getVaultDetails(vaultAddress).then((d) => { if (mounted) setDetails(d); });
    return () => { mounted = false; };
  }, [vaultAddress]);

  if (details === "loading") {
    return <div style={{ padding: 16, color: "#94a3b8" }}>Loading Hyperliquid vault details…</div>;
  }
  if (!details) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "#fb7185" }}>Could not load vault details from Hyperliquid Info API.</p>
        <a href={hyperliquidVaultUrl(vaultAddress)} target="_blank" rel="noreferrer"
          style={{ color: "#60a5fa", fontSize: ".72rem" }}>Open on hyperliquid.xyz ↗</a>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {onBack && (
        <button onClick={onBack}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid rgba(96,165,250,0.30)",
            background: "rgba(22,82,240,0.08)",
            color: "#60a5fa", fontSize: ".72rem", fontWeight: 700, cursor: "pointer",
            width: "fit-content",
          }}>
          <ArrowLeft size={12} /> Back to Discover
        </button>
      )}

      <div style={{
        background: "linear-gradient(145deg, rgba(167,139,250,0.10), rgba(96,165,250,0.06))",
        border: "1px solid rgba(167,139,250,0.25)",
        borderRadius: 18,
        padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <h2 style={{ margin: 0, color: "#fff", fontSize: "1.15rem", fontWeight: 800 }}>{details.name}</h2>
              <span style={{ fontSize: ".62rem", fontWeight: 700, padding: "3px 7px", borderRadius: 5, color: "#a78bfa", background: "rgba(167,139,250,0.14)" }}>
                Hyperliquid · read-only
              </span>
            </div>
            <div style={{ fontSize: ".7rem", color: "#94a3b8", fontFamily: "monospace" }}>
              Leader: {details.leader.slice(0, 8)}…{details.leader.slice(-6)} ·
              Vault: {details.vaultAddress.slice(0, 8)}…{details.vaultAddress.slice(-6)}
            </div>
            {details.description && (
              <p style={{ margin: "10px 0 0", color: "#cbd5e1", fontSize: ".82rem", lineHeight: 1.5 }}>{details.description}</p>
            )}
          </div>
          <a href={hyperliquidVaultUrl(details.vaultAddress)} target="_blank" rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 9,
              border: "1px solid rgba(167,139,250,0.35)",
              background: "rgba(167,139,250,0.12)",
              color: "#a78bfa", fontSize: ".72rem", fontWeight: 700, textDecoration: "none",
            }}>
            <ExternalLink size={12} /> Open on hyperliquid.xyz
          </a>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Stat icon={<TrendingUp size={14} />} label="APR" value={Number.isFinite(details.apr) ? `${details.apr.toFixed(1)}%` : "—"} tone={details.apr >= 0 ? "#22c55e" : "#ef4444"} />
        <Stat icon={<DollarSign size={14} />} label="AUM" value={fmtUsd(details.aum)} tone="#60a5fa" />
        <Stat icon={<Shield size={14} />} label="MDD" value={`${details.mdd.toFixed(1)}%`} tone="#fb7185" />
        <Stat icon={<Users size={14} />} label="Followers" value={String(details.followers)} tone="#a78bfa" />
        <Stat icon={<Calendar size={14} />} label="Age" value={`${details.ageDays}d`} tone="#94a3b8" />
        <Stat icon={<DollarSign size={14} />} label="Leader stake" value={fmtUsd(details.leaderStakeUsd)} tone="#facc15" />
        <Stat icon={<TrendingUp size={14} />} label="Profit share" value={details.feeBps > 0 ? `${(details.feeBps / 100).toFixed(1)}%` : "—"} tone="#f59e0b" />
        <Stat icon={<TrendingUp size={14} />} label="Assets" value={details.tradedAssets.length > 0 ? details.tradedAssets.slice(0, 3).join(", ") : "—"} tone="#cbd5e1" />
      </div>

      {details.portfolio.length > 1 && (
        <div style={{
          background: "rgba(8,13,25,0.94)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 16,
        }}>
          <div style={{ fontSize: ".7rem", color: "#9fb0c8", fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".07em" }}>
            Account value · all time
          </div>
          <PortfolioSparkline points={details.portfolio} />
        </div>
      )}

      <div style={{ padding: "10px 14px", border: "1px solid rgba(245,158,11,0.22)", background: "rgba(245,158,11,0.06)", borderRadius: 10, fontSize: ".72rem", color: "#fde68a" }}>
        Hyperliquid vaults are not directly copyable from Arc. You can <b>open the vault on hyperliquid.xyz</b> and deposit USDC there, or use the experimental <b>Cross-chain Mirror</b> button on Discover (CCTP-based, ~5-15 min latency, 1-3% drift).
      </div>
    </div>
  );
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 11, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, color: "#94a3b8" }}>
        {icon}
        <span style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.05rem", fontWeight: 800, color: tone, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function PortfolioSparkline({ points }: { points: VaultPortfolioPoint[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 800;
  const H = 120;
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((p.value - min) / range) * (H - 8) - 4;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const fillPath = `${path} L ${W} ${H} L 0 ${H} Z`;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const trend = last >= first ? "#22c55e" : "#ef4444";
  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 120, display: "block" }}>
        <defs>
          <linearGradient id="hl-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trend} stopOpacity="0.3" />
            <stop offset="100%" stopColor={trend} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#hl-spark-fill)" />
        <path d={path} fill="none" stroke={trend} strokeWidth="1.5" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: ".62rem", color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
        <span>{fmtUsd(first)}</span>
        <span>{fmtUsd(last)} {last >= first ? "↑" : "↓"}</span>
      </div>
    </div>
  );
}
