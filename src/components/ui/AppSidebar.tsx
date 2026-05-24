import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowLeftRight, RefreshCw, Settings, X } from "lucide-react";
import { SettingsPanel } from "./SettingsPanel";
import { WhatsNew } from "./WhatsNew";
import type { Workspace } from "../../types";
import { agentFor } from "../../data";
import { useAppState } from "../../app-state";
import { useWallet, useErc20Balances, chainLabel, shortAddr, nativeSymbolForChain, tokensForChain } from "../../wallet";
import { getChain, isSingleChain } from "../../lib/chains";
import { useNetworkMode } from "../../hooks/useNetworkMode";
import { NetworkToggle } from "./NetworkToggle";
import { SectionLabel } from "../visual/SectionLabel";
import {
  buildRail,
  type RailItem,
  type RailKind,
} from "../WorkspaceDashboard";
import { CHAIN_LOGOS } from "../../lib/chain-logos";

type NavSection = "Dashboard" | "Management" | "Content";
const SECTIONS: readonly NavSection[] = ["Dashboard", "Management", "Content"];

function sectionFor(kind: RailKind, label: string): NavSection {
  const t = label.toLowerCase();
  if (/(life os|alerts?|posts?|pages?|content|playground|terminal)/.test(t)) return "Content";
  if (kind === "overview" || kind === "gateway" || kind === "verify") return "Dashboard";
  return "Management";
}

export function slugifyTab(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function BalanceRow({ symbol, value, accent }: { symbol: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px] py-0.5">
      <span className={`uppercase tracking-wider ${accent ? "font-extrabold" : "text-text-muted font-bold"}`} style={accent ? { color: "var(--accent-primary)" } : undefined}>{symbol}</span>
      <span className="font-bold tabular-nums text-text-primary">{value}</span>
    </div>
  );
}

function BalanceDisplay({ workspace }: { workspace: Workspace }) {
  const w = useWallet();
  const erc20 = useErc20Balances(w.address, w.chainId);
  const [refreshing, setRefreshing] = useState(false);
  const { mode, toggle } = useNetworkMode(workspace.id);
  const target = getChain(workspace.id, mode);
  const singleChain = isSingleChain(workspace.id);

  const refreshAll = async () => {
    if (!w.address) { await w.connect(); return; }
    setRefreshing(true);
    try { await Promise.all([w.refresh(), erc20.refresh()]); }
    finally { setTimeout(() => setRefreshing(false), 450); }
  };

  if (!w.available) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 bg-surface-2 rounded-xl border border-border-default text-xs">
        <span className="text-text-muted">No wallet detected</span>
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-primary font-bold hover:underline">Get one</a>
      </div>
    );
  }

  if (!w.address) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <NetworkToggle mode={mode} onToggle={toggle} hidden={singleChain} />
        </div>
        <button
          type="button"
          onClick={() => void w.connect()}
          disabled={w.connecting}
          className="flex items-center justify-center w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-60"
          style={{
            background: "color-mix(in srgb, var(--accent-primary) 14%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-primary) 38%, transparent)",
            color: "var(--accent-primary)",
          }}
        >
          {w.connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      </div>
    );
  }

  const nativeSym = nativeSymbolForChain(w.chainId);
  const all = tokensForChain(w.chainId);
  const stables = [...all].sort((a, b) => {
    const rank = (s: string) => (s === "USDC" ? 0 : s === "USDT" ? 1 : 2);
    return rank(a.symbol) - rank(b.symbol);
  });
  const hasUsdcToken = all.some((t) => t.symbol === "USDC");
  const balOf = (sym: string) => erc20.balances.find((b) => b.symbol === sym)?.display ?? (erc20.loading ? "…" : "0");
  const onTarget = !target.isNonEvm && w.chainId?.toLowerCase() === target.hex.toLowerCase();
  const isAgoraWrongNetwork = workspace.id === "agora" && !onTarget && !target.isNonEvm;
  const currentChainLabel = w.chainId ? chainLabel(w.chainId) : "Unknown network";

  return (
    <div
      className="px-3 py-2.5 bg-surface-2 rounded-xl border transition-all duration-300"
      style={{ borderColor: "color-mix(in srgb, var(--accent-primary) 18%, var(--border-default))" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent-primary)", boxShadow: "0 0 7px color-mix(in srgb, var(--accent-primary) 60%, transparent)" }} />
          <span
            className="text-[10px] text-text-muted uppercase tracking-wider truncate"
            title={isAgoraWrongNetwork ? `Wallet currently on ${currentChainLabel}` : undefined}
          >
            {isAgoraWrongNetwork ? target.name : currentChainLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <NetworkToggle mode={mode} onToggle={toggle} hidden={singleChain} />
          <button
            type="button"
            onClick={refreshAll}
            aria-label="Refresh all balances"
            title="Refresh all balances"
            disabled={refreshing}
            className="p-1 rounded-lg hover:bg-surface-3 text-text-muted hover:text-primary transition-all duration-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 transition-transform duration-500 ${refreshing || erc20.loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {isAgoraWrongNetwork ? (
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-snug text-amber-200">
          Wallet currently on {currentChainLabel}. Arc has no mainnet here; switch to Arc Testnet to use these testnet USDC funds.
        </div>
      ) : (
        <div className="space-y-px">
          <BalanceRow symbol={nativeSym} value={w.balanceEth ?? (refreshing ? "…" : "—")} accent />
          {hasUsdcToken && nativeSym !== "USDC" && <BalanceRow symbol="USDC" value={balOf("USDC")} />}
          {stables.filter((t) => t.symbol !== "USDC" && balOf(t.symbol) !== "0").map((t) => (
            <BalanceRow key={t.symbol} symbol={t.symbol} value={balOf(t.symbol)} />
          ))}
        </div>
      )}
      {!onTarget && !target.isNonEvm && (
        <button
          type="button"
          onClick={() => void w.switchChain(target.hex)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
          style={{ background: "color-mix(in srgb, var(--accent-primary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-primary) 34%, transparent)", color: "var(--accent-primary)" }}
          title={`Switch wallet to ${target.name}`}
        >
          <ArrowLeftRight className="w-3 h-3" /> Switch to {target.name}
        </button>
      )}
    </div>
  );
}

function badgeForTab(item: RailItem): { text: string; tone: "neutral" | "alert" } | null {
  const t = item.label.toLowerCase();
  if (t.includes("approval")) return { text: "2", tone: "alert" };
  if (t.includes("alert")) return { text: "3", tone: "alert" };
  return null;
}

type AppSidebarProps = {
  workspace: Workspace;
  onClose?: () => void;
};

export function AppSidebar({ workspace, onClose }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const railItems = buildRail(workspace);
  const agent = agentFor(workspace.id);
  const w = useWallet();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const grouped = SECTIONS.map((sec) => ({
    section: sec,
    items: railItems
      .map((it, i) => ({ it, i, slug: slugifyTab(it.label) }))
      .filter(({ it }) => sectionFor(it.kind, it.label) === sec),
  })).filter((g) => g.items.length > 0);

  const activeSlug = location.pathname.split("/")[3] ?? "";

  return (
    <aside
      className="relative w-[220px] h-screen glass-panel border-r border-border-default flex flex-col"
      style={{ backgroundImage: "radial-gradient(150% 50% at 50% -8%, color-mix(in srgb, var(--accent-primary) 9%, transparent), transparent 64%)" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent-primary) 55%, transparent), transparent)" }}
      />
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border-default">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back to project launcher"
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        >
          <img
            src="/logo0g.png"
            alt="TollGate"
            aria-hidden="true"
            className="w-9 h-9 rounded-xl shrink-0 object-contain"
            style={{ boxShadow: "0 4px 18px -4px rgba(30,80,255,0.5)" }}
          />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {CHAIN_LOGOS[workspace.id] && (
                <img
                  src={CHAIN_LOGOS[workspace.id]}
                  alt={workspace.shortName}
                  width={16}
                  height={16}
                  className="rounded-sm object-contain shrink-0"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              <span className="text-[13px] font-extrabold tracking-tight leading-tight truncate">{workspace.shortName}</span>
            </div>
            <span className="text-[10px] text-text-muted uppercase tracking-wider truncate">TollGate · x402</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
          className="shrink-0 w-7 h-7 grid place-items-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        {onClose && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="md:hidden w-7 h-7 grid place-items-center rounded-md text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {grouped.map(({ section, items }) => (
          <div key={section} className="space-y-0.5">
            <div className="px-3.5 py-2">
              <SectionLabel color="text-text-dim">{section}</SectionLabel>
            </div>
            {items.map(({ it, i, slug }) => {
              const Icon = it.Icon;
              const isActive = activeSlug === slug;
              const badge = badgeForTab(it);
              return (
                <Link
                  key={`${section}-${i}`}
                  to={`/app/${workspace.id}/${slug}`}
                  className={`group relative flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-200 ${
                    isActive ? "font-bold" : "text-text-secondary hover:text-text-primary hover:bg-surface-2 hover:translate-x-0.5"
                  }`}
                  style={
                    isActive
                      ? {
                          background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                          color: "var(--accent-primary)",
                          boxShadow: "inset 2px 0 0 var(--accent-primary), 0 0 24px -8px color-mix(in srgb, var(--accent-primary) 35%, transparent)",
                        }
                      : undefined
                  }
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-bar"
                      className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                      style={{ background: "var(--accent-primary)" }}
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "" : "text-inherit group-hover:text-primary/80"}`}
                      style={isActive ? { color: "var(--accent-primary)" } : undefined}
                    />
                    <span className="text-[13px] truncate leading-none">{it.label}</span>
                  </div>
                  {badge && (
                    <span
                      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        badge.tone === "alert"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-surface-3 text-text-muted"
                      }`}
                    >
                      {badge.text}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-border-default space-y-2.5">
        <BalanceDisplay workspace={workspace} />
        <div className="flex items-center gap-2 px-1">
          <div className="relative shrink-0">
            <div
              className="w-8 h-8 rounded-xl grid place-items-center text-[11px] font-bold overflow-hidden"
              style={{
                background: "color-mix(in srgb, var(--accent-primary) 16%, var(--surface-2))",
                color: "var(--accent-primary)",
                border: "1px solid color-mix(in srgb, var(--accent-primary) 24%, transparent)",
              }}
            >
              {CHAIN_LOGOS[workspace.id] ? (
                <img
                  src={CHAIN_LOGOS[workspace.id]}
                  alt={workspace.shortName}
                  className="w-5 h-5 object-contain"
                  onError={(e) => { e.currentTarget.style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute("hidden"); }}
                />
              ) : null}
              <span hidden={!!CHAIN_LOGOS[workspace.id]}>
                {agent.name.split(" ").filter(s => /[a-zA-Z]/.test(s[0])).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "AG"}
              </span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-surface-1" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[12px] font-semibold truncate text-text-primary">{agent.name}</span>
            <span className="text-[10px] text-text-muted truncate font-mono">
              {w.address ? shortAddr(w.address) : "no wallet"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors uppercase tracking-wider"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            All
          </button>
          <div className="flex-1" />
          <WhatsNew />
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} workspace={workspace} />
    </aside>
  );
}
