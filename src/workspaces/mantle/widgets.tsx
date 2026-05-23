export { MantleAgentIdentity, MantleVaultPanel, MantleBudgetPanel } from "../../components/widgets/mantle/MantleOnchain";
export { StrategyDeployPanel, YieldProjectionCalc, WhaleAlertFeed, CreditScoreMeter, AlphaBotWidget, AgentCreditLine, AgentBudgetDashboard, YieldComparisonWidget, MantleA2ALoopWidget } from "../../components/widgets/mantle-extra/MantleExtraWidgets";
export { MantleEarnCalc, MantleAgentEconomyDashboard, MantlePortfolioRebalancer, MantleGasOptimizer, AlphaDesk, RwaRegistry, MantleEconomyLoop, YieldBoard, MantleDevToolsPanel } from "./inline-widgets";

import { useState, lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { useNetworkMode } from "../../hooks/useNetworkMode";
import { EcosystemLinksPanel } from "../../components/ui/EcosystemLinksPanel";
import { TreasuryPanel } from "./TreasuryPanel";
import { MNT_FUNDING_SCOPE, MNT_TREASURY_TOPUP_USD } from "./funding";
import type { Service, Workspace } from "../../types";
import type { Receipt } from "../../types";
import type { SigBlock, CardDef, CardCtx, TabMeta, TabCtx } from "../_types";
import { DiscoveryWidget } from "../../components/widgets/DiscoveryWidget";
import { MerchantWidget } from "../../components/widgets/MerchantWidget";
import { ArrowUpRight, Bell, Database, Robot, Bolt, Receipt as RIco } from "../../icons402";
import { MantleAgentIdentity, MantleVaultPanel, MantleBudgetPanel } from "../../components/widgets/mantle/MantleOnchain";
import { AgentCreditLine } from "../../components/widgets/mantle-extra/MantleExtraWidgets";
import { MantleEarnCalc, MantleAgentEconomyDashboard, MantlePortfolioRebalancer, MantleGasOptimizer, AlphaDesk, RwaRegistry, MantleEconomyLoop, YieldBoard, MantleDevToolsPanel } from "./inline-widgets";

const _mew = () => import("../../components/widgets/mantle-extra/MantleExtraWidgets");
const StrategyDeployPanel   = lazy(() => _mew().then((m) => ({ default: m.StrategyDeployPanel })));
const YieldProjectionCalc   = lazy(() => _mew().then((m) => ({ default: m.YieldProjectionCalc })));
const WhaleAlertFeed        = lazy(() => _mew().then((m) => ({ default: m.WhaleAlertFeed })));
const CreditScoreMeter      = lazy(() => _mew().then((m) => ({ default: m.CreditScoreMeter })));
const AlphaBotWidget        = lazy(() => _mew().then((m) => ({ default: m.AlphaBotWidget })));
const AgentBudgetDashboard  = lazy(() => _mew().then((m) => ({ default: m.AgentBudgetDashboard })));
const YieldComparisonWidget = lazy(() => _mew().then((m) => ({ default: m.YieldComparisonWidget })));
const MantleA2ALoopWidget   = lazy(() => _mew().then((m) => ({ default: m.MantleA2ALoopWidget })));

export const signature: SigBlock = {
  title: "Yield board",
  sub: "the instruments your alpha & RWA endpoints track",
  headers: ["Instrument", "APY", "Duration", "7d trend"],
  rows: [
    ["mETH", "3.9%", "perpetual", "+0.2%"],
    ["USDY", "5.1%", "perpetual", "+0.0%"],
    ["T-BILL 90D", "4.83%", "84 days", "+0.1%"],
    ["RWA basket A-", "6.2%", "120 days", "-0.3%"],
  ],
  accentCol: 3,
};

export function cards({ onGoTab, onOpenPayment: _onOpenPayment, wsReceipts, def: _def, onGoReceipts }: CardCtx & { onGoReceipts: () => void }): CardDef[] {
  return [
    { light: true, ico: ArrowUpRight, title: "Run a strategy backtest", sub: "mETH · USDY · T-BILL · $0.15 / run", onClick: () => onGoTab("strategy") || onGoTab("sandbox") },
    { ico: Bell, title: "Browse the alpha feed", sub: "AI-scored signals · confidence 68-91%", onClick: () => onGoTab("alpha") },
    { ico: Database, title: "Fetch RWA risk data", sub: "basket · grade · duration · APY", onClick: () => onGoTab("rwa") },
    { ico: Robot, title: "Manage Alpha Strategist agent", sub: "daily limit $15 · auto-pay on", onClick: () => onGoTab("wallet") || onGoTab("agent") },
    { ico: Bolt, title: "mETH / USDY yield signals", sub: "rotation suggestion · rebalance band", onClick: () => onGoTab("meth") || onGoTab("yield") },
    { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} paid strategy runs`, onClick: () => onGoReceipts() },
  ];
}

export function renderTab(t: string, workspace: Workspace, _receipts: Receipt[], _onOpenPayment: (s: Service) => void): ReactNode | null {
  const nodes: ReactNode[] = [];
  if (t.includes("strateg") || t.includes("sandbox")) nodes.push(<Suspense key="strategy" fallback={null}><StrategyDeployPanel workspace={workspace} /></Suspense>);
  if (t.includes("economy")) {
    nodes.push(<div key="economy-treasury" style={{ marginBottom: 14 }}><TreasuryPanel scope={MNT_FUNDING_SCOPE} label="Agent Economy autonomous spend" defaultTopUpUsd={MNT_TREASURY_TOPUP_USD} /></div>);
    nodes.push(<MantleAgentEconomyDashboard key="economy" workspace={workspace} />);
  }
  if (t.includes("alpha")) {
    nodes.push(<div key="alpha-treasury" style={{ marginBottom: 14 }}><TreasuryPanel scope={MNT_FUNDING_SCOPE} label="Alpha & RWA data calls" defaultTopUpUsd={MNT_TREASURY_TOPUP_USD} /></div>);
    nodes.push(<AlphaDesk key="alpha" workspace={workspace} />);
    nodes.push(<Suspense key="whale" fallback={null}><WhaleAlertFeed workspace={workspace} /></Suspense>);
    nodes.push(<Suspense key="alphabot" fallback={null}><AlphaBotWidget workspace={workspace} /></Suspense>);
  }
  if (t.includes("meth") || t.includes("usdy") || (t.includes("yield") && !t.includes("alpha"))) {
    nodes.push(<MantleEarnCalc key="earncalc" workspace={workspace} />);
    nodes.push(<MantlePortfolioRebalancer key="rebalancer" workspace={workspace} />);
    nodes.push(<YieldBoard key="yieldboard" workspace={workspace} />);
    nodes.push(<Suspense key="yield" fallback={null}><YieldProjectionCalc workspace={workspace} /></Suspense>);
  }
  if (t.includes("rwa")) nodes.push(<RwaRegistry key="rwa" workspace={workspace} />);
  if (t.includes("devtool") || t.includes("dev tool")) {
    nodes.push(<MantleGasOptimizer key="gas" workspace={workspace} />);
    nodes.push(<MantleDevToolsPanel key="devtools" workspace={workspace} />);
  }
  if (t.includes("credit")) nodes.push(<Suspense key="credit" fallback={null}><CreditScoreMeter workspace={workspace} /></Suspense>);
  if (t.includes("budget")) nodes.push(<Suspense key="budget" fallback={null}><AgentBudgetDashboard workspace={workspace} /></Suspense>);
  if (t.includes("compare")) nodes.push(<Suspense key="yieldcompare" fallback={null}><YieldComparisonWidget workspace={workspace} /></Suspense>);
  if (t.includes("a2a") || t.includes("loop")) {
    nodes.push(<div key="a2a-treasury" style={{ marginBottom: 14 }}><TreasuryPanel scope={MNT_FUNDING_SCOPE} label="A2A loop autonomous spend" defaultTopUpUsd={MNT_TREASURY_TOPUP_USD} /></div>);
    nodes.push(<Suspense key="a2aloop" fallback={null}><MantleA2ALoopWidget workspace={workspace} /></Suspense>);
  }
  return nodes.length > 0 ? <>{nodes}</> : null;
}

export function renderTabContent(tab: string, ctx: TabCtx): ReactNode {
  const { workspace } = ctx;
  const t = tab.toLowerCase();
  const nodes: ReactNode[] = [];

  if (t.includes("economy")) nodes.push(<MantleAgentEconomyDashboard key="economy" workspace={workspace} />);
  if (t.includes("agent") || t.includes("marketplace") || t.includes("economy")) nodes.push(<DiscoveryWidget key="discovery" workspaceId={workspace.id} />);
  if (t.includes("agent") || t.includes("marketplace")) nodes.push(<MerchantWidget key="merchant" />);
  if (t.includes("alpha")) {
    nodes.push(<AlphaDesk key="alpha" workspace={workspace} />);
    nodes.push(<Suspense key="whale" fallback={null}><WhaleAlertFeed workspace={workspace} /></Suspense>);
  }
  if (t.includes("meth") || t.includes("usdy") || (t.includes("yield") && !t.includes("alpha"))) {
    nodes.push(<MantleEarnCalc key="earncalc" workspace={workspace} />);
    nodes.push(<MantlePortfolioRebalancer key="rebalancer" workspace={workspace} />);
    nodes.push(<YieldBoard key="yieldboard" workspace={workspace} />);
    nodes.push(<Suspense key="yield" fallback={null}><YieldProjectionCalc workspace={workspace} /></Suspense>);
  }
  if (t.includes("strateg") || t.includes("sandbox")) nodes.push(<Suspense key="strategy" fallback={null}><StrategyDeployPanel workspace={workspace} /></Suspense>);
  if (t.includes("rwa")) nodes.push(<RwaRegistry key="rwa" workspace={workspace} />);
  if (t.includes("devtool") || t.includes("dev tool")) {
    nodes.push(<MantleGasOptimizer key="gas" workspace={workspace} />);
    nodes.push(<MantleDevToolsPanel key="devtools" workspace={workspace} />);
  }
  if (t.includes("credit")) nodes.push(<Suspense key="credit" fallback={null}><CreditScoreMeter workspace={workspace} /></Suspense>);
  if (t.includes("alpha")) nodes.push(<Suspense key="alphabot" fallback={null}><AlphaBotWidget workspace={workspace} /></Suspense>);
  if (t.includes("budget")) nodes.push(<Suspense key="budget" fallback={null}><AgentBudgetDashboard workspace={workspace} /></Suspense>);
  if (t.includes("yield") || t.includes("compare")) nodes.push(<Suspense key="yieldcompare" fallback={null}><YieldComparisonWidget workspace={workspace} /></Suspense>);
  if (t.includes("a2a") || t.includes("loop")) nodes.push(<Suspense key="a2aloop" fallback={null}><MantleA2ALoopWidget workspace={workspace} /></Suspense>);

  return nodes.length > 0 ? <>{nodes}</> : null;
}

export function renderAgentExtra(workspace: Workspace): ReactNode | null {
  return (
    <>
      <MantleAgentIdentity workspace={workspace} />
      <MantleVaultPanel workspace={workspace} />
      <MantleBudgetPanel workspace={workspace} />
      <MantleEconomyLoop workspace={workspace} />
      <AgentCreditLine workspace={workspace} />
    </>
  );
}

const MANTLE_CONTRACTS = [
  { label: "AgentVault (Mainnet)",         addr: (import.meta.env as Record<string,string|undefined>)["VITE_MANTLE_VAULT_ADDRESS"] ?? "0xCbBcFc657787Fef2702ae6E35CA5a809a68480da", explorer: "https://explorer.mantle.xyz" },
  { label: "AgentIdentityRegistry (Main)", addr: (import.meta.env as Record<string,string|undefined>)["VITE_MANTLE_IDENTITY_ADDRESS"] ?? "0x4cA80A3af6e0a4E0c85AB31E3B4a86C6BffF17CB", explorer: "https://explorer.mantle.xyz" },
  { label: "AgentCreditRegistry (Main)",   addr: (import.meta.env as Record<string,string|undefined>)["VITE_MANTLE_CREDIT_ADDRESS"] ?? "0xA8FdDb9F6f54Fbf127cb8c71049cB1e19f5836F9", explorer: "https://explorer.mantle.xyz" },
  { label: "ServiceRegistry (Mainnet)",    addr: (import.meta.env as Record<string,string|undefined>)["VITE_MANTLE_SERVICE_REGISTRY_ADDRESS"] ?? "0x441fE2B53A85a38572C94688b2344a096ECe50cc", explorer: "https://explorer.mantle.xyz" },
  { label: "IdentityRegistry (Sepolia)",   addr: (import.meta.env as Record<string,string|undefined>)["VITE_MANTLE_TESTNET_IDENTITY_ADDRESS"] ?? "0xAe3D4eEc2a49dcBeA1c39CB6987507fA2BF97142", explorer: "https://explorer.sepolia.mantle.xyz" },
  { label: "ServiceRegistry (Sepolia)",    addr: (import.meta.env as Record<string,string|undefined>)["VITE_MANTLE_TESTNET_SERVICE_REGISTRY_ADDRESS"] ?? "0x42a14858Da4B2f75DB5C581bA5579786A12d97b4", explorer: "https://explorer.sepolia.mantle.xyz" },
  { label: "CreditRegistry (Sepolia)",     addr: (import.meta.env as Record<string,string|undefined>)["VITE_MANTLE_TESTNET_CREDIT_ADDRESS"] ?? "0xA8302734081F26b8a3E42f90DCf07b3E063441de", explorer: "https://explorer.sepolia.mantle.xyz" },
] as const;

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#0FBF7A" : "var(--muted)", padding: "2px 4px", borderRadius: 4, fontSize: 11, display: "flex", alignItems: "center" }}
      title="Copy address"
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

function MantleEcosystemLinks() {
  const { mode } = useNetworkMode("mantle");
  const isTestnet = mode === "testnet";
  const groups = isTestnet ? [
    { title: "Explorer", items: [{ label: "Mantle Sepolia Explorer", url: "https://sepolia.mantlescan.xyz" }] },
    { title: "Faucet", items: [{ label: "Mantle Sepolia Faucet", url: "https://faucet.testnet.mantle.xyz" }] },
    { title: "Bridge", items: [{ label: "Mantle Testnet Bridge", url: "https://bridge.testnet.mantle.xyz" }] },
  ] : [
    { title: "Explorer", items: [{ label: "Mantlescan", url: "https://mantlescan.xyz" }] },
    { title: "Bridge", items: [{ label: "Mantle Bridge", url: "https://bridge.mantle.xyz" }] },
    { title: "Swap", items: [{ label: "Agni Finance", url: "https://agni.finance" }, { label: "Merchant Moe", url: "https://merchantmoe.com" }] },
    { title: "Yield", items: [{ label: "Mantle Earn (mETH)", url: "https://meth.mantle.xyz" }, { label: "Ondo USDY", url: "https://ondo.finance" }] },
  ];
  return <EcosystemLinksPanel groups={groups} network={isTestnet ? "Mantle Sepolia Testnet" : "Mantle Mainnet · chainId 5000"} accent="#1A9AFF" />;
}

export function renderOverviewExtra(_workspace: Workspace, _onGoTab: (t: string) => boolean, _onGoReceipts: () => void): ReactNode | null {
  return (
    <>
      <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: ".7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)" }}>Deployed Contracts</span>
        <span style={{ fontSize: ".63rem", color: "#1A9AFF", fontWeight: 700, background: "#1A9AFF18", padding: "2px 7px", borderRadius: 5 }}>Mantle Mainnet + Sepolia</span>
      </div>
      {MANTLE_CONTRACTS.map((c) => {
        const short = `${c.addr.slice(0, 8)}…${c.addr.slice(-6)}`;
        return (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid var(--line-2)" }}>
            <Database width={13} height={13} style={{ color: "#1A9AFF", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: ".77rem", fontWeight: 700, color: "var(--ink)" }}>{c.label}</div>
              <div style={{ fontSize: ".62rem", color: "var(--muted)", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
                {c.addr}
                <CopyBtn text={c.addr} />
              </div>
            </div>
            <a href={`${c.explorer}/address/${c.addr}`} target="_blank" rel="noreferrer"
              style={{ fontSize: ".6rem", color: "#1A9AFF", fontWeight: 700, textDecoration: "none", background: "#1A9AFF14", padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap" }}
            >{short} ↗</a>
          </div>
        );
      })}
    </div>
      <MantleEcosystemLinks />
    </>
  );
}

// ── Tab metadata ──────────────────────────────────────────────────────────────
export function tabMeta(tab: string): TabMeta | null {
  const t = tab.toLowerCase();
  if (t.includes("economy"))
    return { title: "Mantle agent economy", sub: "Track autonomous agent wallets, service demand and paid economic loops on Mantle.", intent: "Economy", proof: "agent activity" };
  if (t.includes("alpha"))
    return { title: "Alpha intelligence desk", sub: "Combine whale alerts, alpha feeds and bot decisions into a tradable signal workspace.", intent: "Alpha", proof: "signal feed" };
  if (t.includes("meth") || t.includes("usdy") || t.includes("yield") || t.includes("compare"))
    return { title: "Yield allocation console", sub: "Compare mETH, USDY and yield routes, then simulate rebalancing before capital moves.", intent: "Yield", proof: "projection" };
  if (t.includes("rwa"))
    return { title: "RWA registry and risk desk", sub: "Review RWA instruments, risk attributes and evidence before agent allocation.", intent: "RWA", proof: "registry" };
  if (t.includes("strateg") || t.includes("sandbox"))
    return { title: "Strategy simulation lab", sub: "Run backtests, deploy strategy candidates and keep receipts for each simulation.", intent: "Simulation", proof: "backtest result" };
  if (t.includes("devtool") || t.includes("dev tool"))
    return { title: "Mantle developer toolbench", sub: "Optimize gas, inspect chain settings and turn dev actions into product-ready flows.", intent: "Developer", proof: "tool output" };
  if (t.includes("credit") || t.includes("budget"))
    return { title: "Agent credit and budget desk", sub: "Score agents, approve credit lines and constrain daily spend before autonomous execution.", intent: "Credit", proof: "budget policy" };
  if (t.includes("a2a") || t.includes("loop"))
    return { title: "Agent-to-agent loop", sub: "Show how Mantle agents discover, pay and complete services with traceable state.", intent: "A2A", proof: "loop receipt" };
  return null;
}
