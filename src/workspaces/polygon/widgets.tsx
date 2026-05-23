import type { ReactNode } from "react";
import type { Service, Workspace } from "../../types";
import type { Receipt } from "../../types";
import type { SigBlock, CardDef, CardCtx, TabMeta, TabCtx } from "../_types";
import { Bolt, Link as LinkIco, Send, Robot, Shield, Receipt as RIco } from "../../icons402";
import { fmtUsd, badgeFor } from "../../lib/ws-helpers";
import { useNetworkMode } from "../../hooks/useNetworkMode";
import { EcosystemLinksPanel } from "../../components/ui/EcosystemLinksPanel";
import { TreasuryPanel } from "./TreasuryPanel";
import { POLY_FUNDING_SCOPE, POLY_TREASURY_TOPUP_USD } from "./funding";
import {
  PolygonTradeFinanceWidget,
  PolygonUsdcPaymentsWidget,
  PolygonAgentMarketplaceWidget,
  PolygonStatsWidget,
  PolygonMerchantOnboardingWidget,
} from "../../components/widgets/polygon/PolygonWidgets";

export {
  PolygonTradeFinanceWidget,
  PolygonUsdcPaymentsWidget,
  PolygonAgentMarketplaceWidget,
  PolygonStatsWidget,
  PolygonMerchantOnboardingWidget,
};

export const signature: SigBlock = {
  title: "Polygon zkEVM commerce",
  sub: "UAE trade finance & merchant micropayments settled in USDC on Polygon",
  headers: ["Corridor", "Volume 24h", "Fee", "Status"],
  rows: [
    ["AED → USDC", "$142,000", "$0.05/call", "active"],
    ["SME trade invoices", "18 tokenised", "0.1%", "active"],
    ["Merchant checkouts", "3,410 calls", "$0.01/call", "active"],
    ["Cross-border remittance", "$38,200", "0.2%", "active"],
  ],
  accentCol: 3,
};

export function cards({
  onGoTab,
  onOpenPayment,
  wsReceipts,
  def,
  onGoReceipts,
}: CardCtx & { onGoReceipts: () => void }): CardDef[] {
  return [
    {
      light: true,
      ico: Bolt,
      title: "Publish a paid API in 30 sec",
      sub: "paste endpoint · get TollGate URL · earn USDC",
      onClick: () => { onGoTab("merchant"); },
    },
    {
      ico: LinkIco,
      title: "Tokenise a trade invoice",
      sub: "90% advance · USDC on Polygon zkEVM",
      onClick: () => { onGoTab("trade") || onGoTab("finance"); },
    },
    {
      ico: Send,
      title: "Cross-border remittance",
      sub: "AED ↔ USDC · UAE corridors · $0.05/call",
      onClick: () => { if (def) onOpenPayment(def); },
    },
    {
      ico: Robot,
      title: "Polygon Merchant Agent settings",
      sub: "daily limit $15 · auto-pay on",
      onClick: () => { onGoTab("agent"); },
    },
    {
      ico: Shield,
      title: "Agent marketplace discovery",
      sub: "find & pay Polygon services via x402",
      onClick: () => { onGoTab("marketplace") || onGoTab("discovery"); },
    },
    {
      ico: RIco,
      title: "View all receipts",
      sub: `${wsReceipts.length} Polygon payments`,
      onClick: () => onGoReceipts(),
    },
  ];
}

export function renderTab(
  t: string,
  workspace: Workspace,
  _receipts: Receipt[],
  _onOpenPayment: (s: Service) => void,
): ReactNode | null {
  const nodes: ReactNode[] = [];
  if (t.includes("merchant") || t.includes("mode")) {
    nodes.push(<div key="merchant-treasury" style={{ marginBottom: 14 }}><TreasuryPanel scope={POLY_FUNDING_SCOPE} label="Merchant automation treasury" defaultTopUpUsd={POLY_TREASURY_TOPUP_USD} /></div>);
    nodes.push(<PolygonMerchantOnboardingWidget key="merchant" workspace={workspace} />);
  }
  if (t.includes("trade") || t.includes("finance")) {
    nodes.push(<PolygonTradeFinanceWidget key="trade" workspace={workspace} />);
  }
  if (t.includes("marketplace") || t.includes("agent")) {
    nodes.push(<div key="marketplace-treasury" style={{ marginBottom: 14 }}><TreasuryPanel scope={POLY_FUNDING_SCOPE} label="Merchant bot autonomous calls" defaultTopUpUsd={POLY_TREASURY_TOPUP_USD} /></div>);
    nodes.push(<PolygonAgentMarketplaceWidget key="marketplace" workspace={workspace} />);
  }
  if (t.includes("usdc") || t.includes("payment") || t.includes("remittance")) {
    nodes.push(<PolygonUsdcPaymentsWidget key="usdc" workspace={workspace} />);
  }
  if (t.includes("overview")) {
    nodes.push(<PolygonStatsWidget key="stats" workspace={workspace} />);
  }
  return nodes.length > 0 ? <>{nodes}</> : null;
}

export function renderTabContent(tab: string, ctx: TabCtx): ReactNode {
  const { workspace, receipts } = ctx;
  const t = tab.toLowerCase();
  const nodes: ReactNode[] = [];

  if (t.includes("merchant") || t.includes("mode")) nodes.push(<PolygonMerchantOnboardingWidget key="merchant" workspace={workspace} />);
  if (t.includes("trade") || t.includes("finance")) nodes.push(<PolygonTradeFinanceWidget key="trade" workspace={workspace} />);
  if (t.includes("marketplace") || t.includes("agent")) nodes.push(<PolygonAgentMarketplaceWidget key="marketplace" workspace={workspace} />);
  if (t.includes("usdc") || t.includes("payment") || t.includes("remittance")) nodes.push(<PolygonUsdcPaymentsWidget key="usdc" workspace={workspace} />);
  if (t.includes("overview")) nodes.push(<PolygonStatsWidget key="stats" workspace={workspace} />);
  if (t.includes("receipt")) {
    const wsReceipts = receipts.filter((r): r is Receipt => r.workspaceId === workspace.id);
    nodes.push(
      <div key="receipts" className="panel block svc-flavor">
        <div className="block-head"><div className="ttl"><span className="sq soft"><RIco width={15} height={15} /></span><div><h3>Payment receipts</h3><div className="sub">all Polygon payments settled via x402</div></div></div></div>
        {wsReceipts.length === 0 && <div className="muted sm" style={{ padding: "16px 20px" }}>No receipts yet — make a call to see payments here.</div>}
        <div className="svc-hist">
          {wsReceipts.slice(0, 20).map((r) => (
            <div className="svc-hist__row" key={r.id}>
              <span className="svc-hist__dot" style={{ background: "#1fb58a" }} />
              <div className="svc-hist__main"><b>{r.serviceName}</b><span>{r.network} · {new Date(r.createdAt).toLocaleString()}</span></div>
              {badgeFor(r.status)}
              <span className="svc-hist__amt">{fmtUsd(r.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return nodes.length > 0 ? <>{nodes}</> : null;
}

export function renderAgentExtra(_workspace: Workspace): ReactNode | null {
  return null;
}

function PolygonEcosystemLinks() {
  const { mode } = useNetworkMode("polygon");
  const isTestnet = mode === "testnet";
  const groups = isTestnet ? [
    { title: "Explorer", items: [{ label: "Cardona Testnet Explorer", url: "https://cardona-zkevm.polygonscan.com" }] },
    { title: "Faucet", items: [{ label: "Polygon zkEVM Faucet", url: "https://faucet.polygon.technology" }] },
    { title: "Bridge", items: [{ label: "zkEVM Bridge (Testnet)", url: "https://bridge-ui.zkevm-rpc.com" }] },
  ] : [
    { title: "Explorer", items: [{ label: "PolygonScan zkEVM", url: "https://zkevm.polygonscan.com" }] },
    { title: "Bridge", items: [{ label: "Polygon Bridge", url: "https://bridge.polygon.technology" }] },
    { title: "Swap", items: [{ label: "QuickSwap", url: "https://quickswap.exchange" }, { label: "Uniswap (Polygon)", url: "https://app.uniswap.org/#/swap?chain=polygon_zkevm" }] },
    { title: "Dev", items: [{ label: "Polygon Docs", url: "https://docs.polygon.technology/zkEVM" }, { label: "AggLayer", url: "https://agglayer.polygon.technology" }] },
  ];
  return <EcosystemLinksPanel groups={groups} network={isTestnet ? "Polygon zkEVM Cardona Testnet" : "Polygon zkEVM Mainnet · chainId 1101"} accent="#8247E5" />;
}

export function renderOverviewExtra(
  _workspace: Workspace,
  _onGoTab: (t: string) => boolean,
  _onGoReceipts: () => void,
): ReactNode | null {
  return <PolygonEcosystemLinks />;
}

// ── Tab metadata ──────────────────────────────────────────────────────────────
export function tabMeta(tab: string): TabMeta | null {
  const t = tab.toLowerCase();
  if (t.includes("merchant") || t.includes("mode"))
    return { title: "Merchant Mode onboarding", sub: "Guide a merchant from setup to first payment with Polygon-native settlement.", intent: "Merchant", proof: "onboarding state" };
  if (t.includes("trade") || t.includes("finance"))
    return { title: "Trade finance desk", sub: "Model invoices, financing and payment status for cross-border business flows.", intent: "Trade finance", proof: "invoice state" };
  if (t.includes("marketplace") || t.includes("agent"))
    return { title: "Agent marketplace", sub: "Browse paid agent services and inspect payment/reputation before calling them.", intent: "Marketplace", proof: "service profile" };
  if (t.includes("usdc") || t.includes("payment") || t.includes("remittance"))
    return { title: "USDC remittance flow", sub: "Send and track low-cost USDC payments with user-readable status.", intent: "Payments", proof: "payment receipt" };
  if (t.includes("overview"))
    return { title: "Polygon operating dashboard", sub: "See workspace-level traction, payments and agent activity without endpoint clutter.", intent: "Overview", proof: "live metrics" };
  if (t.includes("receipt"))
    return { title: "Polygon receipt ledger", sub: "Review settled Polygon payments and keep the proof trail clear for users.", intent: "Receipts", proof: "settlement list" };
  return null;
}
