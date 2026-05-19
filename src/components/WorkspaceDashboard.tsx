import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CircleDollarSign,
  Code as CodeIcon,
  Code2,
  CreditCard,
  Download,
  FileText,
  Globe,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  MessageCircle,
  Moon,
  Network,
  Pause,
  Play,
  Radio,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Trash2,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { ConnectWalletButton, WalletLiveStrip, useWallet, sendErc20Transfer, parseUnits } from "../wallet";
import { useAppState } from "../app-state";
import { useLocalStore } from "../lib/storage";
import { deterministicScore, hashId, sha256Hex, fnv1aHex } from "../lib/util-hash";
import type { Agent, Receipt, ReceiptStatus, Service, Theme, Workspace, WorkspaceId } from "../types";
import { serviceById, workspaceMetrics, makeServiceId, agents as allAgents, makeTxHash } from "../data";
import { BarSpark, WeekBars } from "../charts402";
import {
  ArrowRight,
  Bolt,
  CAT_ICON,
  Check,
  Code,
  Copy,
  Link as LinkIco,
  Plus,
  Receipt as RIco,
  Robot,
  Shield,
  X,
  catColor,
} from "../icons402";
import { InferenceJobRunner } from "./widgets/zero-g/InferenceJobRunner";
import { StoragePinWidget } from "./widgets/zero-g/StoragePinWidget";
import { ProofVerifier } from "./widgets/zero-g/ProofVerifier";
import { MantleAgentIdentity, MantleVaultPanel, MantleBudgetPanel } from "./widgets/mantle/MantleOnchain";
import { ArbitrumEscrowPanel } from "./widgets/arbitrum/ArbitrumEscrowPanel";
import {
  WalrusStorageWidget,
  MoveContractViewer,
  SuiNftMarket,
  ZkLoginPanel,
  SuiAgentWalletPanel,
  SuiAgentEconomyLoop,
  DeepBookYieldEscrow,
  AgentNftReputation,
  SuiPayButtonWidget,
  AgentMemoryNetwork,
  BattleArenaWidget,
  IntentEngineWidget,
} from "./widgets/sui/SuiWidgets";
import { OpenClawSkillConsole, TeeAttestationVerifier, DePinBulkPin } from "./widgets/og-extra/OgExtraWidgets";
import { OgIntegrationStatus } from "./widgets/og-extra/OgIntegrationStatus";
// #16 Lazy-load MantleExtraWidgets to split this heavy bundle out of the main chunk.
const _mew = () => import("./widgets/mantle-extra/MantleExtraWidgets");
const StrategyDeployPanel   = lazy(() => _mew().then((m) => ({ default: m.StrategyDeployPanel })));
const YieldProjectionCalc   = lazy(() => _mew().then((m) => ({ default: m.YieldProjectionCalc })));
const WhaleAlertFeed        = lazy(() => _mew().then((m) => ({ default: m.WhaleAlertFeed })));
const CreditScoreMeter      = lazy(() => _mew().then((m) => ({ default: m.CreditScoreMeter })));
const AlphaBotWidget        = lazy(() => _mew().then((m) => ({ default: m.AlphaBotWidget })));
const AgentCreditLine       = lazy(() => _mew().then((m) => ({ default: m.AgentCreditLine })));
const AgentBudgetDashboard  = lazy(() => _mew().then((m) => ({ default: m.AgentBudgetDashboard })));
const YieldComparisonWidget = lazy(() => _mew().then((m) => ({ default: m.YieldComparisonWidget })));
const MantleA2ALoopWidget   = lazy(() => _mew().then((m) => ({ default: m.MantleA2ALoopWidget })));
import { BatchPayoutConsole, StylusSnippetViewer, RobinhoodChainPanel } from "./widgets/arbitrum-extra/ArbitrumExtraWidgets";
import { AgentIntentWidget } from "./widgets/arbitrum-extra/AgentIntentWidget";
import { ArbAddressBook, ArbRecurringPayments, ArbAllowanceManager, ArbContractPaymentSim, ArbPaymentFlowDiagram, UsdcTransferWidget, AgentServiceRegistry, SpendRulesEditor, ArbitrumStylusDeployPanel, ArbBudgetPanel, ArbOnChainRegistry, ArbDisputePanel, ArbAgentReputation } from "../workspaces/arbitrum/inline-widgets";
import { EconomyDashboard, OgDemoFlow, OgStorageEstimator, OgComputeCostChart, OgSocialFeedWidget, OgComputeKanban, OgPrivacyStepper, OgAgentToAgentLoop, OgTradingArenaWidget, AgentIdRegistry, RevenueSplitConsole, OgAllowlistManager, OgMultiSigApprove, OgBudgetControllerWidget } from "../workspaces/0g/inline-widgets";
import { MantleEarnCalc, MantleAgentEconomyDashboard, MantlePortfolioRebalancer, MantleGasOptimizer, AlphaDesk, RwaRegistry, MantleEconomyLoop, YieldBoard, MantleDevToolsPanel } from "../workspaces/mantle/inline-widgets";
import { QieBillSplitter, QieRequestPay, QieWalletDashboard, QieCreatorSubscriptions, QieSalesAnalytics, QiePassIssuer, QieCreatorTipsWidget, AgentWalletConsole, QieCreditWidget, QieOracleFeedWidget } from "../workspaces/qie/widgets";
import { QiePosWidget, GameItemShop, MerchantPayoutsPanel } from "./widgets/qie-extra/QieExtraWidgets";
import { A2AMarketplaceWidget } from "./widgets/A2AMarketplaceWidget";
import { MerchantWidget } from "./widgets/MerchantWidget";
import { DiscoveryWidget } from "./widgets/DiscoveryWidget";
import { BudgetWidget } from "./widgets/BudgetWidget";
import { AgentScoreCard } from "./widgets/AgentScoreBadge";
import { AgoraTradingWidget } from "./widgets/agora/AgoraTradingWidget";
import { AgoraPortfolioWidget, AgoraCircleToolsWidget, AgoraX402Widget, AgoraLeaderboardWidget, AgoraCctpWidget, ArcAppKitWidget, ArcMindSwapWidget, ArcMindYieldWidget } from "./widgets/agora/AgoraExtraWidgets";
import { PolygonTradeFinanceWidget, PolygonUsdcPaymentsWidget, PolygonAgentMarketplaceWidget, PolygonStatsWidget, PolygonMerchantOnboardingWidget } from "./widgets/polygon/PolygonWidgets";
import { ArcMindCopyTradingWidget, ArcMindReasoningWidget, ArcMindSignalHubWidget, ArcMindKillSwitchWidget, ArcMindPnLWidget, ArcMindDebateWidget, ArcDecisionLogWidget } from "./widgets/agora/ArcMindWidgets";
import * as api from "../lib/api";
import { ErrorBoundary } from "./ErrorBoundary";
import { runOgInference, anchorReceiptOnChain, isOgRegistryConfigured, getOgConfig, ogExplorerTxUrl, ogExplorerAddrUrl, uploadToOgStorage } from "../lib/og";
import { explorerTxForNetwork } from "../lib/chains";
import { AgentScoreComparison } from "./widgets/AgentScoreBadge";
import { vaultRecordDecision, isMantleVaultConfigured, mantleExplorerTxUrl } from "../lib/mantle";

type WorkspaceDashboardProps = {
  agent: Agent;
  paidServiceIds: Record<string, string>;
  receipts: Receipt[];
  services: Service[];
  theme: Theme;
  tweakStyle?: React.CSSProperties;
  usageBump: number;
  workspace: Workspace;
  onAddService: (service: Service) => void;
  onAskAI: () => void;
  onBack: () => void;
  onOpenPayment: (service: Service) => void;
  onToggleTheme: () => void;
};

const FALLBACK_RAIL_ICONS = [LayoutDashboard, ReceiptText, CreditCard, CodeIcon, FileText, CircleDollarSign, SettingsIcon];

export type RailKind = "overview" | "agents" | "receipts" | "gateway" | "catalogue" | "service" | "verify";
export type RailItem = { label: string; kind: RailKind; Icon: typeof LayoutDashboard };

export function buildRail(workspace: Workspace): RailItem[] {
  const tabs = workspace.tabs.length > 0 ? workspace.tabs : ["Overview", "Marketplace", "Agents", "Receipts"];
  return tabs.map((label, index) => ({
    label,
    kind: pageKind(label, index),
    Icon: railIconFor(label, index),
  }));
}

type ProductRailIndex = number;

export function railIconFor(tab: string, index: number) {
  const t = tab.toLowerCase();
  if (index === 0 || t.includes("overview") || t.includes("dashboard")) return LayoutDashboard;
  if (t.includes("receipt") || t.includes("payment") || t.includes("approval") || t.includes("invoice")) return ReceiptText;
  if (t.includes("wallet") || t.includes("agent") || t.includes("budget") || t.includes("spend") || t.includes("companion")) return Wallet;
  if (t.includes("data") || t.includes("api") || t.includes("endpoint") || t.includes("service") || t.includes("catalog") || t.includes("market")) return Globe;
  if (t.includes("gateway") || t.includes("checkout") || t.includes("trading") || t.includes("defi")) return Zap;
  if (t.includes("doc") || t.includes("sdk") || t.includes("guide") || t.includes("learn")) return BookOpen;
  if (t.includes("policy") || t.includes("verify") || t.includes("proof") || t.includes("security") || t.includes("privacy")) return ShieldCheck;
  if (t.includes("compute") || t.includes("inference") || t.includes("network") || t.includes("node") || t.includes("chain")) return Network;
  if (t.includes("storage") || t.includes("vault") || t.includes("bucket")) return FileText;
  if (t.includes("credit") || t.includes("card") || t.includes("finance") || t.includes("fund")) return CreditCard;
  if (t.includes("code") || t.includes("contract") || t.includes("smart")) return CodeIcon;
  if (t.includes("file") || t.includes("report") || t.includes("log")) return FileText;
  return FALLBACK_RAIL_ICONS[index % FALLBACK_RAIL_ICONS.length];
}
const fmtUsd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function hashPct(seed: string, lo = 1.2, hi = 8.4) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return lo + ((h % 1000) / 1000) * (hi - lo);
}

function fnvHex(seed: string, len = 8) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return (h.toString(16) + "0".repeat(len)).slice(0, len);
}

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const SERVICE_TAB_KW = ["data", "trading", "arbitrage", "arb", "analysis", "tax", "compute", "storage", "signal", "analytic", "intel", "model", "oracle", "inference", "report", "endpoint", "query", "feed", "checkout"];

export function pageKind(tab: string, index: number): "overview" | "agents" | "receipts" | "gateway" | "catalogue" | "service" | "verify" {
  const t = tab.toLowerCase();
  if (index === 0 || t.includes("overview")) return "overview";
  if (t.includes("gateway") || t.includes("explainer") || t.includes("debugger") || t.includes("playground") || t.includes("sdk")) return "gateway";
  if (t.includes("ai services") || t.includes("agent services")) return "service";
  if (t.includes("agent identity") || t.includes("agent wallet") || t.includes("agent marketplace") || t.includes("agent economy") || t.includes("agent arena") || t.includes("agent credit") || t.includes("budget dashboard") || t.includes("qie wallet")) return "service";
  if (t.includes("wallet protection")) return "verify";
  if (t.includes("approval")) return "agents";
  if (t.includes("merchant dashboard") || t.includes("receipt") || t.includes("invoice") || t.includes("ledger") || t.includes("subscription")) return "receipts";
  if (t.includes("marketplace")) return "service";
  if (t.includes("catalog") || t.includes("my service") || t.includes("my paid") || t.includes("paid tool")) return "catalogue";
  if (t.includes("privacy") || t.includes("risk rules") || t.includes("compliance") || t.includes("verif") || t.includes("proof") || t.includes("audit")) return "verify";
  if (SERVICE_TAB_KW.some((k) => t.includes(k))) return "service";
  if (t.includes("agent") || t.includes("budget") || t.includes("policy") || t.includes("companion") || t.includes("wallet")) return "agents";
  if (t.includes("service")) return "catalogue";
  return "service";
}

// ---------------------------------------------------------------------------

function LedeHead({
  crumb,
  title,
  children,
  chips,
  withRings,
}: {
  crumb: string;
  title: string;
  children?: React.ReactNode;
  chips?: React.ReactNode;
  withRings?: boolean;
}) {
  return (
    <div className="lede-head">
      {withRings ? (
        <>
          <span className="rings-deco" style={{ width: 360, height: 360, right: -120, top: -160 }} />
          <span className="rings-deco" style={{ width: 220, height: 220, right: -60, top: -90 }} />
        </>
      ) : null}
      <div className="crumb">{crumb}</div>
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
      {chips ? <div className="row wrap mt" style={{ gap: 6 }}>{chips}</div> : null}
    </div>
  );
}

function badgeFor(status: ReceiptStatus | "active" | "paused") {
  return <span className={`badge ${status}`}><span className="b-dot" />{status}</span>;
}

// ---------------------------------------------------------------------------
// CREATE SERVICE MODAL
// ---------------------------------------------------------------------------

const CATEGORIES = ["data", "inference", "storage", "analytics", "payment", "trading", "tax", "game-intel"] as const;
const CURRENCIES = ["USDC", "USDT", "native", "mock"] as const;

export function CreateServiceModal({
  workspace,
  onClose,
  onAdd,
}: {
  workspace: Workspace;
  onClose: () => void;
  onAdd: (s: Service) => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [price, setPrice] = useState("0.05");
  const [currency, setCurrency] = useState<string>(CURRENCIES[0]);
  const [network, setNetwork] = useState(workspace.networks[0]);
  const [provider, setProvider] = useState("");
  const [wallet, setWallet] = useState("");
  const [response, setResponse] = useState('{ "data": "…" }');
  const [done, setDone] = useState(false);

  const submit = () => {
    if (!name.trim()) return;
    const priceUsd = Math.max(0.001, parseFloat(price) || 0.05);
    const service: Service = {
      id: makeServiceId(),
      workspaceIds: [workspace.id],
      name: name.trim(),
      provider: provider.trim() || "Custom Provider",
      providerWallet: wallet.trim() || "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
      category,
      price: `${priceUsd.toFixed(2)} ${currency}`,
      priceUsd,
      currency,
      network,
      description: desc.trim() || `A paid ${category} endpoint.`,
      sampleIn: '{ "query": "…" }',
      response: response.trim() || '{ "data": "…" }',
      latency: "320ms",
      calls: 0,
      status: "active",
    };
    onAdd(service);
    setDone(true);
    setTimeout(onClose, 900);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="create-modal" role="dialog" aria-modal="true" aria-label="Create paid service" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cm-head">
          <div>
            <div className="eyebrow">Provider Dashboard</div>
            <h2>{done ? "Service created!" : "Create Paid API"}</h2>
          </div>
          <button className="round-icon" type="button" onClick={onClose}><X width={17} height={17} /></button>
        </div>

        {done ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 24px" }}>
            <span className="orb-core" style={{ width: 56, height: 56, background: "var(--acc-grad)", borderRadius: "50%", display: "grid", placeItems: "center" }}>
              <Check width={26} height={26} />
            </span>
            <p style={{ color: "var(--muted)", fontSize: 14, textAlign: "center" }}>Your service is live in the catalogue. Unpaid calls return 402; paid calls return the protected response.</p>
          </div>
        ) : (
          <div className="ap402 cm-body">
            <div className="fm-row">
              <div className="fm-group">
                <label className="fm-label">Service name</label>
                <div className="field-box fill"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wallet Risk API" maxLength={80} /></div>
              </div>
              <div className="fm-group">
                <label className="fm-label">Category</label>
                <div className="field-box fill">
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="fm-group">
              <label className="fm-label">Description</label>
              <div className="field-box fill fm-ta"><textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What this endpoint does…" maxLength={300} /></div>
            </div>

            <div className="fm-row">
              <div className="fm-group">
                <label className="fm-label">Price per request (USD)</label>
                <div className="field-box fill">
                  <input type="number" min="0.001" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                  <span className="suffix">USD</span>
                </div>
              </div>
              <div className="fm-group">
                <label className="fm-label">Currency</label>
                <div className="field-box fill">
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="fm-group">
                <label className="fm-label">Network</label>
                <div className="field-box fill">
                  <select value={network} onChange={(e) => setNetwork(e.target.value)}>
                    {workspace.networks.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="fm-row">
              <div className="fm-group">
                <label className="fm-label">Provider name</label>
                <div className="field-box fill"><input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Your company / project" maxLength={60} /></div>
              </div>
              <div className="fm-group">
                <label className="fm-label">Settlement wallet</label>
                <div className="field-box fill"><input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" maxLength={80} /></div>
              </div>
            </div>

            <div className="fm-group">
              <label className="fm-label">Response preview (sample JSON)</label>
              <div className="field-box fill fm-ta"><textarea rows={2} value={response} onChange={(e) => setResponse(e.target.value)} placeholder='{ "result": "…" }' maxLength={300} /></div>
            </div>

            <div className="cm-note">
              <Shield width={13} height={13} />
              Unpaid calls → <code>402 Payment Required</code>. Gateway enforces price, wallet and network server-side.
            </div>

            <button className="btn btn-acc" style={{ width: "100%", justifyContent: "center" }} type="button" onClick={submit} disabled={!name.trim()}>
              <Bolt width={15} height={15} /> Create Service
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


const OVERVIEW_CLASS: Record<WorkspaceId, string> = {
  "0g": "zero-g",
  qie: "qie",
  arbitrum: "arbitrum",
  mantle: "mantle",
  sui: "sui",
  agora: "agora",
  polygon: "polygon",
};

const OVERVIEW_ACCENTS: Record<WorkspaceId, string[]> = {
  "0g": ["#8b5cf6", "#22d3ee", "#f59e0b", "#34d399", "#f472b6", "#a78bfa", "#38bdf8"],
  qie: ["#00c389", "#facc15", "#38bdf8", "#fb7185", "#a3e635", "#2dd4bf", "#f97316"],
  arbitrum: ["#1b4add", "#28a0f0", "#f97316", "#60a5fa", "#22c55e", "#818cf8", "#38bdf8"],
  mantle: ["#0fbf7a", "#f4c542", "#22d3ee", "#a3e635", "#fb923c", "#34d399", "#84cc16"],
  sui: ["#4da2ff", "#7dd3fc", "#a78bfa", "#22d3ee", "#f0abfc", "#60a5fa", "#38bdf8"],
  agora: ["#1652f0", "#22d3ee", "#10b981", "#f59e0b", "#8b5cf6", "#fb7185", "#3b82f6"],
  polygon: ["#7b3fe4", "#ec4899", "#f59e0b", "#22c55e", "#60a5fa", "#a855f7", "#14b8a6"],
};

export function OverviewPage({
  agent,
  receipts,
  services,
  workspace,
  onGoTab,
  onOpenPayment,
  onGoReceipts,
}: {
  agent: Agent;
  receipts: Receipt[];
  services: Service[];
  workspace: Workspace;
  onGoTab: (m: string) => boolean;
  onOpenPayment: (s: Service) => void;
  onGoReceipts: () => void;
}) {
  const m = workspaceMetrics(workspace.id, receipts);
  const wsReceipts = receipts.filter((r) => r.workspaceId === workspace.id);
  const recent = wsReceipts.slice(0, 6);
  const def = services.find((s) => s.status === "active") ?? services[0];

  // Real 7-day revenue bucketed by calendar day
  const _7dAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const wsReceipts7d = wsReceipts.filter((r) => new Date(r.createdAt).getTime() >= _7dAgo);
  const week = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i;
    const ds = new Date(); ds.setHours(0, 0, 0, 0); ds.setDate(ds.getDate() - daysAgo);
    const de = new Date(ds); de.setDate(de.getDate() + 1);
    const value = wsReceipts7d
      .filter((r) => { const t = new Date(r.createdAt).getTime(); return t >= ds.getTime() && t < de.getTime(); })
      .reduce((s, r) => s + r.amount, 0);
    return { label: ds.toLocaleDateString("en-US", { weekday: "short" }), value };
  });
  const weekAvg = week.reduce((s, x) => s + x.value, 0) / 7;

  // Top services ranked by actual receipt revenue
  const svcRevMap = useMemo(() => {
    const map = new Map<string, number>();
    wsReceipts.forEach((r) => map.set(r.serviceId, (map.get(r.serviceId) ?? 0) + r.amount));
    return map;
  }, [wsReceipts]);
  const topServices = useMemo(() => [...services].sort((a, b) => (svcRevMap.get(b.id) ?? 0) - (svcRevMap.get(a.id) ?? 0)).slice(0, 4), [services, svcRevMap]);

  type CardDef = {
    ico: React.ElementType<{ width?: number; height?: number }>;
    title: string;
    sub?: string;
    light?: boolean;
    link?: string;
    onLink?: () => void;
    onClick: () => void;
    accent?: string;
    metric?: string;
    detail?: string;
  };
  const WS_CARDS: Partial<Record<WorkspaceId, CardDef[]>> = {
    "0g": [
      { light: true, ico: Bolt, title: "Run an inference job", sub: "pay per token · Risk Scorer · Llama 3 · Anomaly", onClick: () => def && onOpenPayment(def) },
      { ico: FileText, title: "Pin a memory blob to 0G Storage", sub: "SHA-256 hash · verifiable reference", onClick: () => onGoTab("storage") },
      { ico: Shield, title: "Verify a receipt proof", sub: "single-use · replay-safe · sealed", onClick: () => onGoTab("privacy") },
      { ico: Robot, title: "Manage agent budgets & allowlist", sub: "0G Compute Agent · daily cap $8.00", onClick: () => onGoTab("agent") },
      { ico: Code, title: "0G x402 SDK & gateway docs", sub: "cURL · TypeScript · Python adapters", onClick: () => onGoTab("gateway") || onGoTab("privacy") },
      { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} paid jobs on record`, onClick: () => onGoReceipts() },
    ],
    qie: [
      { light: true, ico: Bolt, title: "Create a payment link", sub: "hosted 402 endpoint agents can pay", onClick: () => onGoTab("checkout") },
      { ico: FileText, title: "Query QIEDEX pool data", sub: "depth · fees · TWAP · per-query pricing", onClick: () => onGoTab("qiedex") || onGoTab("dex") },
      { ico: Shield, title: "Issue & verify QIE Pass", sub: "gated access · gold / silver tiers", onClick: () => onGoTab("pass") },
      { ico: Robot, title: "Manage Merchant Bot agent", sub: "daily limit $6 · auto-pay on", onClick: () => onGoTab("wallet") || onGoTab("agent") },
      { ico: Code, title: "QIE x402 integration docs", sub: "cURL · SDK · rail adapters", onClick: () => onGoTab("gateway") },
      { ico: RIco, title: "Merchant dashboard & payouts", sub: `${wsReceipts.length} receipts · next payout Fri`, onClick: () => onGoTab("merchant") || onGoReceipts() },
    ],
    arbitrum: [
      { light: true, ico: Send, title: "Send USDC on Arbitrum", sub: "live ERC-20 transfer · testnet USDC", onClick: () => onGoTab("stablecoin") || onGoTab("payment") },
      { ico: Shield, title: "Create & manage escrow", sub: "release or refund on delivery proof", onClick: () => onGoTab("escrow") },
      { ico: Network, title: "Monitor Orbit chains", sub: "sequencer · bridge health · batch lag", onClick: () => onGoTab("orbit") },
      { ico: Robot, title: "Treasury Agent budget policy", sub: "daily limit $12 · spend caps", onClick: () => onGoTab("agent") },
      { ico: ShieldCheck, title: "Configure risk rules", sub: "spend caps · allowlists · enforced server-side", onClick: () => onGoTab("risk") },
      { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} settled payments`, onClick: () => onGoReceipts() },
    ],
    mantle: [
      { light: true, ico: TrendingUp, title: "Run a strategy backtest", sub: "mETH · USDY · T-BILL · $0.15 / run", onClick: () => onGoTab("strategy") || onGoTab("sandbox") },
      { ico: Radio, title: "Browse the alpha feed", sub: "AI-scored signals · confidence 68-91%", onClick: () => onGoTab("alpha") },
      { ico: FileText, title: "Fetch RWA risk data", sub: "basket · grade · duration · APY", onClick: () => onGoTab("rwa") },
      { ico: Robot, title: "Manage Alpha Strategist agent", sub: "daily limit $15 · auto-pay on", onClick: () => onGoTab("wallet") || onGoTab("agent") },
      { ico: Zap, title: "mETH / USDY yield signals", sub: "rotation suggestion · rebalance band", onClick: () => onGoTab("meth") || onGoTab("yield") },
      { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} paid strategy runs`, onClick: () => onGoReceipts() },
    ],
    sui: [
      { light: true, ico: Bolt, title: "Pin a blob to Walrus storage", sub: "decentralised · epoch-based · verifiable", onClick: () => onGoTab("walrus") || onGoTab("storage") },
      { ico: Code, title: "Execute a Move PTB", sub: "dry-run or live · programmable tx blocks", onClick: () => onGoTab("move") || onGoTab("contracts") },
      { ico: FileText, title: "Mint an agent NFT pass", sub: "Kiosk-compatible · tier-gated access", onClick: () => onGoTab("nft") || onGoTab("market") },
      { ico: Shield, title: "Generate a zkLogin proof", sub: "OAuth → Sui wallet · no seed phrase", onClick: () => onGoTab("wallet") || onGoTab("agent") },
      { ico: Robot, title: "Sui Economy Agent settings", sub: "daily limit $10 · auto-pay on", onClick: () => onGoTab("agent") },
      { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} Sui payments`, onClick: () => onGoReceipts() },
    ],
    agora: [
      { light: true, ico: TrendingUp, title: "Run cross-chain arb demo", sub: "ETH/USDC gap Arc vs Base · $0.05 · CCTP", metric: "CCTP route", detail: "Arc vs Base", accent: "#22d3ee", onClick: () => onGoTab("arbitrage") || onGoTab("arb") },
      { ico: CircleDollarSign, title: "Adaptive portfolio rebalancer", sub: "multi-asset · USDC settlement · Paymaster", metric: "Risk-off", detail: "USDC/USYC", accent: "#10b981", onClick: () => onGoTab("portfolio") },
      { ico: Zap, title: "Pay-per-inference on Arc", sub: "x402 → USDC → instant settlement", metric: "$0.002", detail: "priced call", accent: "#f59e0b", onClick: () => def && onOpenPayment(def) },
      { ico: Robot, title: "ArcArb Agent settings", sub: "daily limit $20 · auto-pay on · CCTP", metric: "Auto-pay", detail: "$20 cap", accent: "#8b5cf6", onClick: () => onGoTab("agent") },
      { ico: Code, title: "Circle Tools — CCTP & Nanopayments", sub: "CCTP bridge · Gateway · Paymaster", metric: "Circle stack", detail: "4 tools", accent: "#3b82f6", onClick: () => onGoTab("circle") || onGoTab("gateway") },
      { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} Arc payments`, metric: `${wsReceipts.length}`, detail: "receipts", accent: "#fb7185", onClick: () => onGoReceipts() },
    ],
    polygon: [
      { light: true, ico: Zap, title: "Publish a paid API in 30 sec", sub: "paste endpoint · get TollGate URL · earn USDC", onClick: () => onGoTab("merchant") },
      { ico: FileText, title: "Tokenise a trade invoice", sub: "90% advance · USDC on Polygon zkEVM", onClick: () => onGoTab("trade") || onGoTab("finance") },
      { ico: Send, title: "Cross-border remittance", sub: "AED ↔ USDC · UAE corridors · $0.05/call", onClick: () => def && onOpenPayment(def) },
      { ico: Robot, title: "Polygon Merchant Agent settings", sub: "daily limit $15 · auto-pay on", onClick: () => onGoTab("agent") },
      { ico: ShieldCheck, title: "Agent marketplace discovery", sub: "find & pay Polygon services via x402", onClick: () => onGoTab("marketplace") || onGoTab("discovery") },
      { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} Polygon payments`, onClick: () => onGoReceipts() },
    ],
  };
  // "Try the demo agent" — the one-click 402 → pay → unlock action judges look for.
  // Prepended to every workspace's tile set; the per-workspace first card loses its
  // `light` accent so there's a single clear primary CTA.
  const demoAgentCard: CardDef = {
    light: true,
    ico: Bolt,
    title: "▶ Try the demo agent",
    sub: def ? `pays for ${def.name} · 402 → pay → unlock + receipt` : "402 → pay → unlock + receipt",
    link: "x402 Gateway →",
    metric: workspace.id === "agora" ? "Live demo" : undefined,
    detail: workspace.id === "agora" ? "402 receipt" : undefined,
    accent: workspace.id === "agora" ? "#1652F0" : undefined,
    onLink: () => onGoTab("gateway"),
    onClick: () => def && onOpenPayment(def),
  };
  const wsCards = (WS_CARDS[workspace.id] ?? [
    { ico: Plus, title: "Create a paid API endpoint", sub: `${services.length} services live in this workspace`, onClick: () => onGoTab("data") || onGoTab("checkout") || onGoTab("trading") },
    { ico: RIco, title: "Pay & manage receipts", sub: `${wsReceipts.length} on record`, onClick: () => onGoTab("payment") || onGoTab("receipt") },
    { ico: Robot, title: "Manage agent budgets", sub: `1 agent · daily & per-request caps`, onClick: () => onGoTab("wallet") || onGoTab("agent") },
    { ico: Code, title: "x402 Gateway & SDK", sub: "Docs · middleware · adapters", onClick: () => onGoTab("gateway") || onGoTab("data") },
    { ico: Shield, title: "Verify a payment proof", sub: "Replay-safe · single-use", onClick: () => onGoTab("gateway") || onGoTab("data") },
  ]).map((c, i) => (i === 0 ? { ...c, light: false } : c));
  const cards: CardDef[] = [demoAgentCard, ...wsCards];
  const overviewClass = OVERVIEW_CLASS[workspace.id];
  const overviewAccents = OVERVIEW_ACCENTS[workspace.id];

  return (
    <div className={`overview-window overview-window--${overviewClass}`}>
      <LedeHead
        crumb={`${workspace.id} workspace · ${workspace.networks[0] ?? ""}`}
        title={workspace.name}
        withRings
        chips={
          <>
            {workspace.tags.map((t) => <span key={t} className="chip grey">{t}</span>)}
            {workspace.networks.map((n) => <span key={n} className="chip acc">{n}</span>)}
          </>
        }
      >
        {workspace.pitch}
      </LedeHead>

      {workspace.id === "0g" && <EconomyDashboard />}
      {workspace.id === "0g" && <OgDemoFlow workspace={workspace} onGoTab={onGoTab} onGoReceipts={onGoReceipts} />}

      <div className={`action-grid workspace-action-grid workspace-action-grid--${overviewClass} mb`}>
        {cards.map((c, i) => {
          const Ico = c.ico;
          const cardAccent = c.accent ?? overviewAccents[i % overviewAccents.length];
          const cardAccent2 = overviewAccents[(i + 2) % overviewAccents.length];
          return (
            <button
              key={i}
              className={`act ws-act ws-act--${i + 1}`}
              onClick={c.onClick}
              type="button"
              style={{
                "--card-accent": cardAccent,
                "--card-accent-2": cardAccent2,
                "--card-index": i,
              } as React.CSSProperties}
            >
              <span className="gico"><Ico width={20} height={20} /></span>
              <span className="act-info">i</span>
              {c.metric ? (
                <span className="act-metric">
                  <b>{c.metric}</b>
                  {c.detail ? <em>{c.detail}</em> : null}
                </span>
              ) : null}
              <span className="act-title">{c.title}</span>
              {c.sub ? <span className="act-sub">{c.sub}</span> : null}
              {c.link ? (
                <span className="act-link" onClick={(e) => { e.stopPropagation(); c.onLink?.(); }}>
                  {c.link} <ArrowRight width={12} height={12} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="act-foot mb">
        <a href="https://www.circle.com/en/legal/privacy-policy" target="_blank" rel="noreferrer">Privacy</a>
        <a href="https://www.circle.com/en/legal/usdc-terms" target="_blank" rel="noreferrer">Terms</a>
        <a href="https://developers.circle.com/cctp" target="_blank" rel="noreferrer">Fees &amp; verification</a>
      </div>

      <div className="grid-bento mb">
        <div className="panel block">
          <div className="block-head">
            <div className="ttl"><div><h3>This week · confirmed volume</h3><div className="sub">receipt revenue by day · USDC</div></div></div>
            <div className="num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.03em" }}>{fmtUsd(week.reduce((s, x) => s + x.value, 0))}</div>
          </div>
          <WeekBars data={week} avgLabel={`${fmtUsd(weekAvg)}/day avg`} />
        </div>
        <div className="balcard">
          <div className="bc-top"><span className="orb" style={{ width: 22, height: 22, margin: 0 }} /><span style={{ fontWeight: 700, fontSize: 12.5 }}>Provider revenue</span></div>
          <div className="bc-amt">{fmtUsd(m.revenue)}</div>
          <div className="bc-sub">from {m.paid} verified payments · {m.failed} failed</div>
          <div className="curtabs"><span className="on">USDC</span><span>USDT</span><span>native</span></div>
          <div style={{ marginTop: 16 }}><BarSpark seed={workspace.id} color="rgba(255,140,26,.85)" filled={18} count={24} /></div>
        </div>
      </div>

      <div className="kpis mb">
        {topServices.map((s) => {
          const Ico = CAT_ICON[s.category] ?? CAT_ICON.data;
          return (
            <div key={s.id} className="kpi">
              <div className="kt">
                <span className="sq" style={{ background: catColor(s.category) }}><Ico width={16} height={16} /></span>
                <div><div className="nm">{s.name}</div><div className="tk">{s.category}</div></div>
              </div>
              <div className="kv">{fmtUsd(svcRevMap.get(s.id) ?? 0)}</div>
              <div className="ks"><span className="ch">{wsReceipts.filter((r) => r.serviceId === s.id).length}</span><span className="lbl">confirmed calls</span></div>
              <BarSpark seed={s.id} color={catColor(s.category)} filled={13} />
            </div>
          );
        })}
      </div>

      <div className="panel block">
        <div className="block-head">
          <div className="ttl"><span className="sq soft"><Bolt width={15} height={15} /></span><div><h3>Last paid calls</h3><div className="sub">Live receipts ledger</div></div></div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onGoReceipts}>View all</button>
        </div>
        {recent.length === 0 ? <div className="empty">No receipts yet — run the demo.</div> : (
          <div className="log">{recent.slice(0, 4).map((r) => <ReceiptRow key={r.id} r={r} onClick={onGoReceipts} />)}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MARKETPLACE / CATALOGUE
// ---------------------------------------------------------------------------

function ServiceCard({ s, allowed, paidAt, onPay }: { s: Service; allowed: boolean; paidAt?: string; onPay: () => void }) {
  const [copied, setCopied] = useState(false);
  const Ico = CAT_ICON[s.category] ?? CAT_ICON.data;
  function copy() {
    navigator.clipboard?.writeText(`${location.origin}/api/gateway/${s.id}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="svc">
      <div className="svc-top">
        <div className="left">
          <span className="sq lg" style={{ background: catColor(s.category) }}><Ico width={18} height={18} /></span>
          <div><h4>{s.name}</h4><div className="svc-cat">{s.category} · {s.network}</div></div>
        </div>
        {badgeFor(s.status)}
      </div>
      <div className="svc-desc">{s.description}</div>
      <div className="io"><span className="k">in </span>{s.sampleIn}</div>
      <div className="io"><span className="k">out</span> {s.response}</div>
      <div className="endpoint-bar">
        <span className="method">GET</span><span className="url">/api/gateway/{s.id}</span>
        <button className="icon-btn sm" onClick={copy} aria-label="Copy gateway URL" style={{ flex: "none" }} type="button">
          {copied ? <Check width={13} height={13} style={{ color: "var(--green)" }} /> : <Copy width={13} height={13} />}
        </button>
      </div>
      <div className="svc-foot">
        <div>
          <div className="price">{s.priceUsd.toFixed(2)} <small>{s.currency} / call</small></div>
          <div className="svc-cat" style={{ marginTop: 3 }}>
            {paidAt ? <span style={{ color: "var(--green)" }}>✓ paid {paidAt}</span> : allowed ? <span style={{ color: "var(--green)" }}>✓ on allowlist</span> : <span style={{ color: "var(--red)" }}>✗ not on allowlist</span>} · {s.calls.toLocaleString()} calls
          </div>
        </div>
        {s.status === "active" ? (
          <button className={`btn btn-sm ${paidAt ? "btn-ghost" : "btn-acc"}`} onClick={onPay} type="button">
            {paidAt ? <><Check width={13} height={13} /> Paid</> : <><Bolt width={14} height={14} /> Try with agent</>}
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" disabled type="button"><X width={13} height={13} /> Paused</button>
        )}
      </div>
    </div>
  );
}

export function CataloguePage({
  agent,
  paidServiceIds,
  services,
  workspace,
  tabLabel,
  onOpenPayment,
  onCreateOpen,
}: {
  agent: Agent;
  paidServiceIds: Record<string, string>;
  services: Service[];
  workspace: Workspace;
  tabLabel: string;
  onOpenPayment: (s: Service) => void;
  onCreateOpen: () => void;
}) {
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const isProviderView = tabLabel.toLowerCase().includes("my");
  const catalogServices = services;
  const cats = ["all", ...Array.from(new Set(catalogServices.map((s) => s.category)))];
  const list = (cat === "all" ? catalogServices : catalogServices.filter((s) => s.category === cat)).filter((service) =>
    `${service.name} ${service.provider} ${service.category} ${service.network}`.toLowerCase().includes(query.toLowerCase()),
  );
  if (catalogServices.length > 0) {
    return (
      <section className="pay-marketplace-view">
        <div className="pay-market-hero">
          <small>{isProviderView ? "My Services" : "Marketplace"}</small>
          <h2>{isProviderView ? "Services you publish." : "Paid endpoints, on tap."}</h2>
          <p>
            {isProviderView
              ? "Manage paid APIs available to agents. Each endpoint can return a 402 challenge, settle payment and unlock a response."
              : "Browse paid services, trigger 402, pay in stablecoin and unlock a real response."}
          </p>
          <label>
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search services, providers, networks..."
            />
          </label>
        </div>

        <div className="pay-filter-row">
          <div>
            {cats.map((c) => (
              <button key={c} className={cat === c ? "is-active" : ""} onClick={() => setCat(c)} type="button">
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
          <button className="pay-create-service" type="button" onClick={onCreateOpen}>
            <Plus width={14} height={14} /> New paid service
          </button>
        </div>

        <div className="pay-market-grid">
          {list.map((s) => (
            <article className={paidServiceIds[s.id] ? "pay-market-card is-paid" : "pay-market-card"} key={s.id}>
              <div className="pay-market-card__top">
                <span>{s.category}</span>
                <small>{s.network}</small>
              </div>
              <strong>{s.name}</strong>
              <p>by {s.provider}</p>
              <div className="pay-market-card__bottom">
                <span>${s.priceUsd.toFixed(3)} <small>{s.currency} / req</small></span>
                {s.status === "active" ? (
                  <button type="button" onClick={() => onOpenPayment(s)}>
                    {paidServiceIds[s.id] ? "Paid" : "Try with agent"}
                  </button>
                ) : (
                  <button type="button" disabled>Paused</button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }
  if (services.length === 0) {
    return (
      <>
        <LedeHead crumb={`${workspace.id} workspace · ${tabLabel.toLowerCase()}`} title="Paid endpoints" />
        <div className="empty"><div className="ttl">No services yet</div><div>Add a paid service to this workspace to get started.</div></div>
      </>
    );
  }
  return (
    <>
      <LedeHead crumb={`${workspace.id} workspace · ${tabLabel.toLowerCase()}`} title="Paid endpoints">
        A catalogue of services in this workspace. Each one is wrapped by the x402 gateway: an unpaid call returns{" "}
        <b>402 Payment Required</b>; a paid call returns the protected response plus a receipt. Try one with <b>{agent.name}</b>.
      </LedeHead>
      <div className="spread mb" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="row wrap" style={{ gap: 7 }}>
          {cats.map((c) => (
            <button key={c} className={"pill click" + (cat === c ? " on" : "")} onClick={() => setCat(c)} type="button">{c.toUpperCase()}</button>
          ))}
        </div>
        <button className="btn btn-acc btn-sm" type="button" onClick={onCreateOpen}><Plus width={14} height={14} /> New paid service</button>
      </div>
      <div className="svc-grid">
        {list.map((s) => (
          <ServiceCard key={s.id} s={s} allowed={agent.allowlist.includes(s.id)} paidAt={paidServiceIds[s.id]} onPay={() => onOpenPayment(s)} />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SERVICE / DATA / COMPUTE / STORAGE / TRADING / ANALYSIS / TAX / PRIVACY TAB
// ---------------------------------------------------------------------------

const SVC_METHODS = ["GET", "POST", "POST", "GET", "POST"] as const;
const SVC_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function endpointPath(s: Service): string {
  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `/v1/${s.category}/${slug || s.id}`;
}

const TAB_COPY: Record<string, [string, string]> = {
  "trading data": ["Trading data feeds", "Per-call market data, signals and orderflow — agents pay only for what they pull."],
  "wallet analysis": ["Wallet analysis", "Risk scoring, clustering and address labels — billed per lookup over the x402 handshake."],
  "tax reports": ["Tax classification", "Cost-basis, realised P&L and jurisdiction tags — generated on demand, paid per report."],
  "signals": ["Purchased signals", "Trading and risk insights you've bought — refresh any of them per call to get the latest read."],
  "compute": ["Compute & inference", "Run inference jobs and pay per token / per job; receipts link to verifiable job metadata."],
  "storage": ["Storage writes", "Pin, store and retrieve blobs — every write settles a micro-payment and returns a content hash."],
  "privacy": ["Privacy & verification", "Confidential request routing and payment-proof verification — replay-safe and single-use."],
  "checkout": ["Checkout & payment links", "Hosted payment endpoints merchants expose to agents — generate a link, get paid in QIE-rail stablecoins."],
  "qie pass": ["QIE Pass — identity & access", "Gate paid endpoints behind verified QIE Pass identity; every access check is recorded as a receipt."],
  "qiedex data": ["QIEDEX market data", "Paid swap quotes, liquidity depth and pair stats from QIEDEX — priced per query."],
  "merchant dashboard": ["Merchant dashboard", "Revenue, invoices and receipts for everything agents have paid you on the QIE rail."],
  "ai services": ["AI services on Arbitrum", "Paid AI / API endpoints settled in USDC on Arbitrum, with spend limits and receipts."],
  "agent services": ["Agent services on Arbitrum", "Paid AI / API endpoints settled in USDC on Arbitrum, with spend limits and receipts."],
  "escrow": ["Escrowed delivery", "Hold an agent's payment in escrow until the service confirms delivery — then release or refund."],
  "orbit monitor": ["Orbit chain monitor", "Live data from Orbit chains feeding the gateway — block height, settlement status and bridge health."],
  "risk rules": ["Risk rules & limits", "Spend caps, allowlists and contract-safety checks the gateway enforces before any payment clears."],
  "alpha data": ["Mantle alpha & data", "Paid trading, RWA and yield intelligence — agents pull it per call inside their wallet policy."],
  "meth / usdy": ["mETH / USDY signals", "Yield and risk reads on Mantle-native assets — billed per query, settled from the agent wallet."],
  "rwa data": ["RWA data & reports", "Paid real-world-asset insights and risk reports — generated on demand for the requesting agent."],
  "strategy sandbox": ["Strategy sandbox", "Agents pay per backtest / simulation run; each run returns metrics plus a receipt you can audit."],
  "ai companion": ["AI companion", "Your companion runs paid tools and subscriptions on your behalf — inside the budget and approvals you set."],
  "subscriptions": ["Subscriptions", "Recurring payments for the AI / API tools your companion keeps active — pause or cancel any of them."],
  "personal budget": ["Personal budget", "How much your AI has spent today and this week, broken down by tool — with the cap it can't cross."],
  "life os": ["Life OS", "Daily tools, reminders and finance automations your companion can trigger — each paid action is logged."],
  "approvals": ["Approvals", "Exactly what your agent is allowed to buy, from whom and for how much — the gateway enforces it server-side."],
  "playground": ["402 playground", "Fire a paid tool call and watch every step of the 402 → pay → unlock flow in real time."],
  "paid tools": ["Paid tools", "The catalogue of tools an agent can call here — each one returns 402 until the micro-payment settles."],
  "agent debugger": ["Agent debugger", "Replay an agent's last run step by step: the request, the 402 challenge, the proof and the settled receipt."],
  "transaction explainer": ["Transaction explainer", "Decode a pending wallet action: what it does, what it touches and whether it's safe, caution or danger."],
  "alerts": ["Alerts", "Subscriptions to events — each alert delivery is metered."],
};

type ProductTabCopy = {
  title: string;
  sub: string;
  intent: string;
  proof: string;
};

function productTabCopy(workspace: Workspace, tabLabel: string, fallbackTitle: string, fallbackSub: string): ProductTabCopy {
  const t = tabLabel.toLowerCase();
  const base = {
    title: fallbackTitle,
    sub: fallbackSub,
    intent: "Workflow",
    proof: `${workspace.shortName} settlement`,
  };

  if (workspace.id === "agora") {
    if (t.includes("signal") || t.includes("hub")) return { title: "SignalGuard decision cockpit", sub: "Live market sources, debate, PnL and decision logs for HOLD, REDUCE or ALLOW actions on Arc.", intent: "RFB 02 / 03", proof: "sourced signals + Arc receipts" };
    if (t.includes("reasoning") || t.includes("trace")) return { title: "Reasoning trace marketplace", sub: "Inspect the evidence, confidence shift and source contribution behind each agent decision.", intent: "RFB 06", proof: "trace hash + paid unlock" };
    if (t.includes("copy")) return { title: "Copy trading lifecycle", sub: "Set stake, monitor decay, pause, stop or reduce allocation before blind copy-trading can hurt the user.", intent: "RFB 06", proof: "copy controls + risk rules" };
    if (t.includes("kill") || t.includes("risk")) return { title: "Autonomous risk kill switch", sub: "Configure drawdown, liquidation and source-divergence protections before the agent keeps trading.", intent: "RFB 01", proof: "Telegram + Arc action trail" };
    if (t.includes("usyc") || t.includes("yield") || t.includes("swap")) return { title: "Risk-off capital router", sub: "Move idle capital between USDC, USYC and swap routes when the agent detects hostile conditions.", intent: "RFB 04", proof: "USDC denominated settlement" };
    if (t.includes("arbitrage") || t.includes("arb")) return { title: "Cross-platform arbitrage route", sub: "Detect price gaps, choose route, estimate slippage and show the CCTP/Gateway path before execution.", intent: "RFB 05", proof: "route + receipt" };
    if (t.includes("portfolio")) return { title: "Adaptive portfolio manager", sub: "Detect market regime, rebalance exposure and park capital in risk-off assets when needed.", intent: "RFB 04", proof: "allocation plan" };
    if (t.includes("circle") || t.includes("x402") || t.includes("kit") || t.includes("merchant")) return { title: "Circle and Arc tool console", sub: "Use App Kit, CCTP, Gateway, x402 and nanopayment flows as the product's settlement layer.", intent: "Circle stack", proof: "USDC payments on Arc" };
    if (t.includes("receipt")) return { title: "Arc settlement ledger", sub: "Review paid agent actions and receipts that prove which product flows actually settled.", intent: "Proof layer", proof: "receipt history" };
  }

  if (workspace.id === "0g") {
    if (t.includes("identity") || t.includes("agent")) return { title: "Agent identity and authority", sub: "Register agent identity, set budget authority and connect it to paid compute/storage actions.", intent: "Identity", proof: "agent registry" };
    if (t.includes("compute") || t.includes("inference")) return { title: "0G compute job console", sub: "Run inference jobs, compare cost, track queue state and verify execution metadata.", intent: "Compute", proof: "job receipt" };
    if (t.includes("trading")) return { title: "0G trading arena", sub: "Use 0G compute as the arena where agents generate, compare and settle market signals.", intent: "Agent market", proof: "A2A loop" };
    if (t.includes("storage")) return { title: "0G storage memory layer", sub: "Pin agent memory, manage allowlists and prove which data was stored or retrieved.", intent: "Storage", proof: "content hash" };
    if (t.includes("privacy") || t.includes("tee") || t.includes("sovereign")) return { title: "TEE privacy proof flow", sub: "Seal payloads, run private execution and unseal only with matching receipt proof.", intent: "Privacy", proof: "attestation" };
  }

  if (workspace.id === "arbitrum") {
    if (t.includes("stablecoin") || t.includes("payment") || t.includes("usdc")) return { title: "USDC payment operations", sub: "Send, schedule and batch Arbitrum USDC payments through agent-safe controls.", intent: "Payments", proof: "USDC transfer flow" };
    if (t.includes("escrow")) return { title: "Agent escrow release flow", sub: "Hold funds until delivery is verified, then release, refund or dispute with clear audit state.", intent: "Escrow", proof: "release/refund state" };
    if (t.includes("orbit") || t.includes("monitor")) return { title: "Orbit chain health monitor", sub: "Track settlement health, bridge status and operational readiness for Orbit-based products.", intent: "Monitoring", proof: "chain status" };
    if (t.includes("agent") || t.includes("marketplace")) return { title: "Agent service marketplace", sub: "Register services, enforce budgets and route agent intents through onchain-safe rails.", intent: "Marketplace", proof: "registry + budget" };
    if (t.includes("risk") || t.includes("rule") || t.includes("protection")) return { title: "Spend protection rules", sub: "Define allowlists, max spend and contract safety checks before payments are approved.", intent: "Risk control", proof: "policy enforcement" };
    if (t.includes("stylus") || t.includes("rust")) return { title: "Stylus contract workspace", sub: "Review and simulate Rust/Stylus contract payment flows before shipping them.", intent: "Contracts", proof: "contract sim" };
  }

  if (workspace.id === "mantle") {
    if (t.includes("economy")) return { title: "Mantle agent economy", sub: "Track autonomous agent wallets, service demand and paid economic loops on Mantle.", intent: "Economy", proof: "agent activity" };
    if (t.includes("alpha")) return { title: "Alpha intelligence desk", sub: "Combine whale alerts, alpha feeds and bot decisions into a tradable signal workspace.", intent: "Alpha", proof: "signal feed" };
    if (t.includes("meth") || t.includes("usdy") || t.includes("yield") || t.includes("compare")) return { title: "Yield allocation console", sub: "Compare mETH, USDY and yield routes, then simulate rebalancing before capital moves.", intent: "Yield", proof: "projection" };
    if (t.includes("rwa")) return { title: "RWA registry and risk desk", sub: "Review RWA instruments, risk attributes and evidence before agent allocation.", intent: "RWA", proof: "registry" };
    if (t.includes("strateg") || t.includes("sandbox")) return { title: "Strategy simulation lab", sub: "Run backtests, deploy strategy candidates and keep receipts for each simulation.", intent: "Simulation", proof: "backtest result" };
    if (t.includes("devtool") || t.includes("dev tool")) return { title: "Mantle developer toolbench", sub: "Optimize gas, inspect chain settings and turn dev actions into product-ready flows.", intent: "Developer", proof: "tool output" };
    if (t.includes("credit") || t.includes("budget")) return { title: "Agent credit and budget desk", sub: "Score agents, approve credit lines and constrain daily spend before autonomous execution.", intent: "Credit", proof: "budget policy" };
    if (t.includes("a2a") || t.includes("loop")) return { title: "Agent-to-agent loop", sub: "Show how Mantle agents discover, pay and complete services with traceable state.", intent: "A2A", proof: "loop receipt" };
  }

  if (workspace.id === "sui") {
    if (t.includes("walrus") || t.includes("storage")) return { title: "Walrus storage workflow", sub: "Store assets and agent memory, then verify object references and payment state.", intent: "Storage", proof: "object proof" };
    if (t.includes("move") || t.includes("contracts")) return { title: "Move contract workspace", sub: "Inspect Move contract flows and payment hooks in the context of agent actions.", intent: "Contracts", proof: "module view" };
    if (t.includes("nft") || t.includes("market")) return { title: "Sui NFT market flow", sub: "List, buy and evaluate NFT actions through agent-controlled payment and reputation.", intent: "Market", proof: "NFT action" };
    if (t.includes("wallet") || t.includes("agent")) return { title: "Sui agent wallet", sub: "Control agent wallet state, zkLogin, approvals and economy loop from one place.", intent: "Wallet", proof: "wallet policy" };
    if (t.includes("yield") || t.includes("escrow")) return { title: "DeepBook yield escrow", sub: "Preview yield and escrow actions before an agent commits funds.", intent: "Yield", proof: "escrow state" };
    if (t.includes("arena")) return { title: "Battle arena", sub: "Let agents compete, spend and earn with visible rules and result receipts.", intent: "Game economy", proof: "match result" };
    if (t.includes("pay widget") || t.includes("pay button") || t.includes("widget")) return { title: "Sui pay widget", sub: "Configure a payment widget as the entry point for user-facing agent commerce.", intent: "Payments", proof: "widget config" };
    if (t.includes("memory")) return { title: "Agent memory network", sub: "Connect memory records, ownership and retrieval to usable agent workflows.", intent: "Memory", proof: "memory graph" };
    if (t.includes("intent")) return { title: "Intent engine", sub: "Translate user intent into executable agent steps with explicit constraints.", intent: "Intent", proof: "intent plan" };
    if (t.includes("receipt")) return { title: "Reputation receipts", sub: "Turn completed actions into reputation evidence that users can inspect.", intent: "Reputation", proof: "NFT receipt" };
  }

  if (workspace.id === "qie") {
    if (t.includes("checkout") || t.includes("merchant")) return { title: "Merchant checkout workspace", sub: "Create payment links, split settlement and track POS requests for real merchants.", intent: "Commerce", proof: "checkout receipt" };
    if (t.includes("qiedex") || t.includes("dex")) return { title: "QIEDEX swap desk", sub: "Quote swaps, inspect liquidity and execute only after the route is understandable.", intent: "DEX", proof: "quote result" };
    if (t.includes("gaming") || t.includes("game")) return { title: "Game item economy", sub: "Sell items, route payments and track creator/game receipts inside one flow.", intent: "Gaming", proof: "item receipt" };
    if (t.includes("social") || t.includes("creator")) return { title: "Creator monetization flow", sub: "Handle tips, subscriptions and social payments with clear settlement state.", intent: "Creator", proof: "subscription/tip" };
    if (t.includes("wallet")) return { title: "QIE wallet control room", sub: "Review wallet balances, actions and agent spending from the user's perspective.", intent: "Wallet", proof: "wallet activity" };
    if (t.includes("oracle")) return { title: "Oracle feed workspace", sub: "Inspect feed values, freshness and downstream product impact before agents use them.", intent: "Oracle", proof: "feed freshness" };
    if (t.includes("credit")) return { title: "Credit decision workspace", sub: "Score credit, preview limits and record decisions as auditable agent actions.", intent: "Credit", proof: "score output" };
    if (t.includes("pass")) return { title: "QIE Pass identity gate", sub: "Issue access passes and enforce identity-gated commerce without exposing private data.", intent: "Identity", proof: "access proof" };
  }

  if (workspace.id === "polygon") {
    if (t.includes("merchant") || t.includes("mode")) return { title: "Merchant Mode onboarding", sub: "Guide a merchant from setup to first payment with Polygon-native settlement.", intent: "Merchant", proof: "onboarding state" };
    if (t.includes("trade") || t.includes("finance")) return { title: "Trade finance desk", sub: "Model invoices, financing and payment status for cross-border business flows.", intent: "Trade finance", proof: "invoice state" };
    if (t.includes("marketplace") || t.includes("agent")) return { title: "Agent marketplace", sub: "Browse paid agent services and inspect payment/reputation before calling them.", intent: "Marketplace", proof: "service profile" };
    if (t.includes("usdc") || t.includes("payment") || t.includes("remittance")) return { title: "USDC remittance flow", sub: "Send and track low-cost USDC payments with user-readable status.", intent: "Payments", proof: "payment receipt" };
    if (t.includes("overview")) return { title: "Polygon operating dashboard", sub: "See workspace-level traction, payments and agent activity without endpoint clutter.", intent: "Overview", proof: "live metrics" };
    if (t.includes("receipt")) return { title: "Polygon receipt ledger", sub: "Review settled Polygon payments and keep the proof trail clear for users.", intent: "Receipts", proof: "settlement list" };
  }

  return base;
}

function ProductTabHeader({ workspace, tabLabel, copy }: { workspace: Workspace; tabLabel: string; copy: ProductTabCopy }) {
  return (
    <div className="product-tab-head">
      <div className="product-tab-head__main">
        <small>{workspace.shortName} product flow · {tabLabel}</small>
        <h2>{copy.title}</h2>
        <p>{copy.sub}</p>
      </div>
      <div className="product-tab-head__rail">
        <span>{copy.intent}</span>
        <b>{copy.proof}</b>
      </div>
    </div>
  );
}

function ProductProofStrip({ workspace, scopedCount, receiptCount, revenue }: { workspace: Workspace; scopedCount: number; receiptCount: number; revenue: number }) {
  const primaryNetwork = workspace.networks[0] ?? workspace.shortName;
  return (
    <div className="product-proof-strip">
      <div><b>{receiptCount}</b><span>receipts from this flow</span></div>
      <div><b>{primaryNetwork}</b><span>settlement rail</span></div>
      <div><b>{scopedCount}</b><span>paid primitives behind it</span></div>
      <div><b>{revenue > 0 ? fmtUsd(revenue) : "ready"}</b><span>user-visible payment proof</span></div>
    </div>
  );
}

// ── Bespoke per-workspace flavor panels ──────────────────────────────────────

function CopyLine({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className={className ?? "btn btn-ghost btn-sm"} type="button" onClick={() => {
      navigator.clipboard?.writeText(text).catch(() => {});
      setDone(true); setTimeout(() => setDone(false), 1300);
    }}>
      {done ? <><Check width={12} height={12} /> Copied</> : <><Copy width={12} height={12} /> Copy</>}
    </button>
  );
}

// 402 Playground — fire a paid tool call and watch the handshake.
const PLAYGROUND_TOOLS = [
  { id: "wallet-risk", name: "Wallet Risk API", method: "GET", path: "/api/wallet-risk?address=0x9f…ba1", price: 0.05, out: '{\n  "riskScore": 82,\n  "labels": ["mixer-adjacent", "high-velocity"],\n  "lastSeen": "2026-05-10T22:14:03Z"\n}' },
  { id: "yield-signal", name: "Yield Signal API", method: "GET", path: "/api/yield-signal?asset=mETH", price: 0.02, out: '{\n  "apyForecast7d": 4.7,\n  "confidence": 0.81,\n  "trend": "up"\n}' },
  { id: "tx-simulate", name: "Tx Simulate", method: "POST", path: "/api/tx/simulate", price: 0.03, out: '{\n  "ok": true,\n  "gasUsed": 142000,\n  "balanceDelta": "-0.012 ETH"\n}' },
] as const;

const PLAYGROUND_STEPS = [
  { label: "Agent sends the request", note: "no payment attached yet — just the call" },
  { label: "402 Payment Required", note: "gateway returns a signed challenge: serviceId · amount · network · expiry" },
  { label: "Agent signs the payment", note: "wallet authorises ≤ maxPerRequestUsd, inside the daily budget" },
  { label: "Gateway verifies the proof", note: "amount ≥ required · recipient matches · single-use · network matches" },
  { label: "200 OK + receipt", note: "data returned together with a verifiable receipt id and tx hash" },
] as const;

function PlaygroundInspector() {
  const [toolId, setToolId] = useState<string>(PLAYGROUND_TOOLS[0].id);
  const tool = PLAYGROUND_TOOLS.find((t) => t.id === toolId) ?? PLAYGROUND_TOOLS[0];
  const [step, setStep] = useState(0); // 0 idle, 1..5 progress
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);

  const run = () => {
    if (running) return;
    if (timer.current) window.clearTimeout(timer.current);
    setRunning(true); setStep(1);
    let i = 1;
    const tick = () => {
      i += 1;
      if (i <= PLAYGROUND_STEPS.length) { setStep(i); timer.current = window.setTimeout(tick, 640); }
      else { setRunning(false); }
    };
    timer.current = window.setTimeout(tick, 640);
  };
  const reset = () => { if (timer.current) window.clearTimeout(timer.current); setRunning(false); setStep(0); };

  const done = !running && step >= PLAYGROUND_STEPS.length;
  return (
    <div className="panel block svc-flavor pg">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Zap width={15} height={15} /></span><div><h3>Run a paid tool call</h3><div className="sub">watch the 402 → pay → verify → unlock cycle in real time</div></div></div>
        <div className="row sm" style={{ gap: 6 }}>
          {step > 0 && <button className="btn btn-sm" type="button" onClick={reset}>Reset</button>}
          <button className="btn btn-acc btn-sm" type="button" onClick={run} disabled={running}>{running ? "Running…" : step > 0 ? "Run again" : "Run call"}</button>
        </div>
      </div>
      <div className="pg-tools">
        {PLAYGROUND_TOOLS.map((t) => (
          <button key={t.id} type="button" className={"pg-tool" + (t.id === toolId ? " on" : "")} onClick={() => { setToolId(t.id); reset(); }}>
            <b>{t.name}</b><span>{t.method} · ${t.price.toFixed(2)} {t.method === "GET" ? "USDC/call" : "USDC/run"}</span>
          </button>
        ))}
      </div>
      <div className="pg-req"><span className={`mth mth--${tool.method.toLowerCase()}`}>{tool.method}</span><code>{tool.path}</code></div>
      <ol className="pg-steps">
        {PLAYGROUND_STEPS.map((s, i) => {
          const n = i + 1;
          const state = step > n ? "done" : step === n ? (running ? "active" : "done") : "pending";
          return (
            <li key={s.label} className={`pg-step pg-step--${state}`}>
              <span className="pg-step__dot">{state === "done" ? <Check width={11} height={11} /> : n}</span>
              <div className="pg-step__body"><b>{s.label}</b><span>{s.note}</span></div>
              {n === 2 && step >= 2 && <span className="pg-tag pg-tag--402">402</span>}
              {n === 5 && step >= 5 && <span className="pg-tag pg-tag--200">200</span>}
            </li>
          );
        })}
      </ol>
      {done && (
        <div className="pg-out">
          <div className="pg-out__head"><Check width={13} height={13} /> Response unlocked · receipt <code>rcpt_{tool.id.replace(/-/g, "")}_{(step * 137).toString(36)}</code></div>
          <pre className="code-block">{tool.out}</pre>
        </div>
      )}
    </div>
  );
}

// Arbitrum · Orbit chain monitor — chains feeding the gateway.
const ORBIT_CHAINS = [
  { name: "Arbitrum One", id: "42161", block: 271_004_882, settle: "verified", bridge: "healthy", batch: "8s ago" },
  { name: "Arbitrum Nova", id: "42170", block: 64_812_771, settle: "verified", bridge: "healthy", batch: "11s ago" },
  { name: "Orbit · GameChain", id: "660279", block: 9_441_207, settle: "pending", bridge: "healthy", batch: "31s ago" },
  { name: "Orbit · PaymentsL3", id: "421614", block: 12_004_512, settle: "verified", bridge: "degraded", batch: "2m ago" },
];
const ORBIT_METRICS = ["latest block", "batch lag", "bridge health", "sequencer uptime", "gas"] as const;
function OrbitMonitorPanel({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [subs, setSubs] = useLocalStore<Record<string, boolean>>("arb.orbit.subs", { "660279": true });
  const [metric, setMetric] = useState<Record<string, typeof ORBIT_METRICS[number]>>({});
  const [open, setOpen] = useState<Record<string, { metric: string; value: string; queryId: string } | null>>({});
  const queries = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "arb.orbit.query").slice(0, 8), [receipts, workspace.id]);

  const metricValue = (chainId: string, m: string): string => {
    const seed = chainId + "|" + m;
    if (m === "latest block") return "#" + Math.round(deterministicScore(seed, 1e6, 3e8)).toLocaleString();
    if (m === "batch lag") return Math.round(deterministicScore(seed, 4, 180)) + "s";
    if (m === "bridge health") return deterministicScore(seed, 0, 1) > 0.18 ? "healthy" : "degraded";
    if (m === "sequencer uptime") return (99 + deterministicScore(seed, 0, 0.99)).toFixed(2) + "%";
    return deterministicScore(seed, 0.01, 0.4).toFixed(3) + " gwei";
  };

  const query = (c: typeof ORBIT_CHAINS[number]) => {
    const m = metric[c.id] ?? ORBIT_METRICS[0];
    const value = metricValue(c.id, m);
    const queryId = "orb_" + hashId("orb", c.id + m + Date.now(), 8);
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_arb_orbit", serviceName: "Orbit Monitor API · " + c.name, amount: 0.004, currency: "USDC", network: "arbitrum-sepolia", kind: "arb.orbit.query", payload: { chain: c.name, chainId: c.id, metric: m, value, queryId } });
    setOpen((o) => ({ ...o, [c.id]: { metric: m, value, queryId } }));
  };
  const toggleSub = (c: typeof ORBIT_CHAINS[number]) => {
    const next = !subs[c.id];
    setSubs((s) => ({ ...s, [c.id]: next }));
    if (next) emitReceipt({ workspaceId: workspace.id, serviceName: "Orbit Alerts · " + c.name, amount: 0, currency: "USDC", network: "arbitrum-sepolia", kind: "arb.orbit.alert", payload: { chain: c.name, chainId: c.id, event: "subscription_active" } });
  };
  const simulateAlert = (c: typeof ORBIT_CHAINS[number]) => emitReceipt({ workspaceId: workspace.id, serviceName: "Orbit Alert · " + c.name, amount: 0, currency: "USDC", network: "arbitrum-sepolia", kind: "arb.orbit.alert", payload: { chain: c.name, chainId: c.id, event: "batch_lag_spike", value: Math.round(deterministicScore(c.id + Date.now(), 60, 300)) + "s" } });

  const activeSubs = ORBIT_CHAINS.filter((c) => subs[c.id]);

  return (
    <div className="panel block svc-flavor">
      <div className="block-head"><div className="ttl"><span className="sq soft"><Network width={15} height={15} /></span><div><h3>Orbit chain monitor</h3><div className="sub">pick a metric, run a paid query, or subscribe to alerts — each query is metered ($0.004) and leaves a receipt</div></div></div></div>
      <div className="svc-table__scroll"><table className="svc-table">
        <thead><tr><th>Chain</th><th>Chain ID</th><th>Block height</th><th>Bridge</th><th>Metric</th><th aria-label="actions" /></tr></thead>
        <tbody>
          {ORBIT_CHAINS.map((c) => (
            <Fragment key={c.id}>
              <tr>
                <td><b>{c.name}</b></td>
                <td><code>{c.id}</code></td>
                <td className="svc-table__num">#{c.block.toLocaleString()}</td>
                <td><span className={`pill ${c.bridge === "healthy" ? "ok" : "warn"}`} style={{ textTransform: "capitalize" }}>{c.bridge}</span></td>
                <td>
                  <select value={metric[c.id] ?? ORBIT_METRICS[0]} onChange={(e) => setMetric((m) => ({ ...m, [c.id]: e.currentTarget.value as typeof ORBIT_METRICS[number] }))} style={{ padding: "5px 7px", borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".74rem" }}>{ORBIT_METRICS.map((m) => <option key={m}>{m}</option>)}</select>
                </td>
                <td>
                  <span className="row sm" style={{ gap: 6 }}>
                    <button className="btn btn-acc btn-sm" type="button" onClick={() => query(c)}><Bolt width={11} height={11} /> Query</button>
                    <button className={"btn btn-sm" + (subs[c.id] ? " btn-ghost" : "")} type="button" onClick={() => toggleSub(c)}>{subs[c.id] ? "Unsubscribe" : "Subscribe"}</button>
                    {subs[c.id] && <button className="btn btn-ghost btn-sm" type="button" onClick={() => simulateAlert(c)} title="simulate an alert delivery"><Radio width={11} height={11} /></button>}
                  </span>
                </td>
              </tr>
              {open[c.id] && (
                <tr>
                  <td colSpan={6} style={{ background: "var(--field)", padding: "8px 14px" }}>
                    <span style={{ fontSize: ".78rem", fontFamily: "var(--mono)" }}><b>{open[c.id]!.metric}</b> = <b style={{ color: "var(--accent-primary)" }}>{open[c.id]!.value}</b> · query <code>{open[c.id]!.queryId}</code></span>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table></div>
      {(queries.length > 0 || activeSubs.length > 0) && (
        <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent queries · {queries.length}</div>
            <div className="svc-hist">{queries.length === 0 && <div className="muted sm">No queries yet.</div>}{queries.map((r) => { const p = (r.payload ?? {}) as { chain?: string; metric?: string; value?: string }; return (
              <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} /><div className="svc-hist__main"><b>{p.chain}</b><span>{p.metric}: {p.value} · {new Date(r.createdAt).toLocaleTimeString()}</span></div><span className="svc-hist__amt">{r.amount.toFixed(3)}</span></div>
            ); })}</div>
          </div>
          <div>
            <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Active subscriptions · {activeSubs.length}</div>
            <div className="svc-hist">{activeSubs.length === 0 && <div className="muted sm">No subscriptions.</div>}{activeSubs.map((c) => (
              <div className="svc-hist__row" key={c.id}><span className="svc-hist__dot" style={{ background: "#1fb58a" }} /><div className="svc-hist__main"><b>{c.name}</b><span>chain {c.id} · alerts on</span></div><span className="pill ok">live</span></div>
            ))}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// QIE · Checkout — build a hosted payment link agents can pay, then settle it.
const QIE_LINK_PURPOSES = ["Wallet risk lookup", "Tax export bundle", "Swap quote bundle", "Inference job", "Custom"];
type BuiltLink = { id: string; purpose: string; amount: string; url: string; state: "pending" | "paid"; txHash?: string };
type SplitConfig = { merchant: number; platform: number; referrer: number; referrerWallet: string };
function CheckoutLinkBuilder({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [split] = useLocalStore<SplitConfig>("qie.settlement.split", { merchant: 90, platform: 8, referrer: 2, referrerWallet: "0xref9a2c1e0bf3" });
  const [purpose, setPurpose] = useState(QIE_LINK_PURPOSES[0]);
  const [amount, setAmount] = useState("0.05");
  const [links, setLinks] = useLocalStore<BuiltLink[]>("qie.links", []);
  const make = () => {
    const a = (parseFloat(amount) || 0).toFixed(3);
    const id = "lnk_" + hashId("lnk", purpose + a + Date.now(), 6);
    setLinks((ls) => [{ id, purpose, amount: a, url: `https://qie.pay/${id}`, state: "pending" as const }, ...ls].slice(0, 12));
  };
  const settle = (l: BuiltLink) => {
    if (l.state === "paid") return;
    const amt = parseFloat(l.amount) || 0;
    const txHash = makeTxHash();
    setLinks((ls) => ls.map((x) => x.id === l.id ? { ...x, state: "paid", txHash } : x));
    const parent = emitReceipt({ workspaceId: workspace.id, serviceId: "svc_qie_checkout", serviceName: "QIE Checkout · " + l.purpose, amount: amt, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.checkout.settle", payload: { linkId: l.id, purpose: l.purpose, url: l.url, txHash } });
    // fan out the split
    ([["merchant", split.merchant, ""], ["platform", split.platform, ""], ["referrer", split.referrer, split.referrerWallet]] as [string, number, string][]).forEach(([party, pct, wallet]) => {
      if (pct <= 0) return;
      emitReceipt({ workspaceId: workspace.id, serviceId: "svc_qie_checkout", serviceName: `QIE Settlement · ${party}`, amount: Number((amt * pct / 100).toFixed(4)), currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.settlement.split", payload: { party, pct, wallet, parentTx: txHash, parentReceipt: parent.id } });
    });
  };
  const paid = links.filter((l) => l.state === "paid");
  const collected = paid.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const amtNum = parseFloat(amount) || 0;
  return (
    <div className="panel block svc-flavor clb">
      <div className="block-head"><div className="ttl"><span className="sq soft"><LinkIco width={15} height={15} /></span><div><h3>Build a payment link</h3><div className="sub">hosted 402-gated endpoint agents can pay — create it, share it, settle it, get a receipt + split fan-out</div></div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 175px", gap: 16, padding: "0 16px 10px", alignItems: "start" }}>
        <div className="clb-form" style={{ padding: 0 }}>
          <label className="clb-field"><span>Purpose</span>
            <select value={purpose} onChange={(e) => setPurpose(e.currentTarget.value)}>{QIE_LINK_PURPOSES.map((p) => <option key={p}>{p}</option>)}</select>
          </label>
          <label className="clb-field"><span>Amount (USDC)</span>
            <input value={amount} onChange={(e) => setAmount(e.currentTarget.value)} inputMode="decimal" placeholder="0.05" />
          </label>
          <button className="btn btn-acc btn-sm" type="button" onClick={make}><Plus width={13} height={13} /> Create link</button>
        </div>
        {/* Live phone mockup */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ width: 155, background: "var(--bg-2)", border: "5px solid var(--ink)", borderRadius: 28, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
            <div style={{ height: 22, background: "var(--ink)", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <div style={{ width: 44, height: 7, background: "var(--bg-2)", borderRadius: 4 }} />
            </div>
            <div style={{ padding: "14px 12px 18px", minHeight: 190, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: ".6rem", fontWeight: 800, letterSpacing: ".06em", color: "var(--muted)", textTransform: "uppercase" }}>QIE Pay</div>
              <div style={{ textAlign: "center", margin: "6px 0 2px" }}>
                <div style={{ fontSize: "1.7rem", fontWeight: 900, color: "var(--accent-primary)", lineHeight: 1 }}>${amtNum.toFixed(2)}</div>
                <div style={{ fontSize: ".58rem", color: "var(--muted)", marginTop: 2 }}>USDC</div>
              </div>
              <div style={{ fontSize: ".62rem", color: "var(--ink)", textAlign: "center", fontWeight: 600, padding: "0 4px" }}>{purpose || "Payment"}</div>
              <div style={{ width: "100%", marginTop: 8, background: "var(--accent-primary)", borderRadius: 10, padding: "9px 0", textAlign: "center", fontSize: ".7rem", fontWeight: 800, color: "#fff", cursor: "pointer" }}>Pay Now</div>
              <div style={{ width: "100%", padding: "6px 8px", background: "var(--bg-3)", borderRadius: 8, fontSize: ".52rem", color: "var(--muted)", textAlign: "center", wordBreak: "break-all", marginTop: 2 }}>qie.pay/lnk_preview</div>
            </div>
          </div>
        </div>
      </div>
      {paid.length > 0 && (
        <div style={{ margin: "0 16px 10px", padding: "7px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--green) 12%, transparent)", color: "var(--green)", fontSize: ".78rem", fontWeight: 700 }}>
          Collected: ${collected.toFixed(3)} USDC across {paid.length} paid link{paid.length === 1 ? "" : "s"} · split {split.merchant}/{split.platform}/{split.referrer}%
        </div>
      )}
      {links.length === 0 ? (
        <p className="clb-empty">No links yet — create one above. Every link is a real 402-gated endpoint stub; click "Simulate payment" to settle it.</p>
      ) : (
        <div className="svc-table__scroll"><table className="svc-table">
          <thead><tr><th>Link</th><th>For</th><th>Amount</th><th>State</th><th aria-label="actions" /></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id}>
                <td><code>{l.url.replace("https://", "")}</code></td>
                <td>{l.purpose}</td>
                <td className="svc-table__num">${l.amount} <span className="muted">USDC</span></td>
                <td>{badgeFor(l.state === "paid" ? "verified" : "pending")}</td>
                <td>
                  <span className="row sm" style={{ gap: 6 }}>
                    <CopyLine text={l.url} className="btn btn-ghost btn-sm" />
                    {l.state === "paid" ? <span className="muted" style={{ fontSize: ".7rem", fontFamily: "var(--mono)" }}>{l.txHash?.slice(0, 12)}…</span> : <button className="btn btn-acc btn-sm" type="button" onClick={() => settle(l)}><Check width={11} height={11} /> Simulate payment</button>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

function SettlementSplitConfig({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [split, setSplit] = useLocalStore<SplitConfig>("qie.settlement.split", { merchant: 90, platform: 8, referrer: 2, referrerWallet: "0xref9a2c1e0bf3" });
  const [saved, setSaved] = useState(false);
  const sum = split.merchant + split.platform + split.referrer;
  const lastPaid = useMemo(() => { const r = receipts.find((x) => x.workspaceId === workspace.id && x.kind === "qie.checkout.settle"); return r?.amount ?? 1; }, [receipts, workspace.id]);
  const configs = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "qie.settlement.config").slice(0, 5), [receipts, workspace.id]);
  const set = (k: keyof SplitConfig, v: number | string) => { setSplit((s) => ({ ...s, [k]: v })); setSaved(false); };
  const save = () => { emitReceipt({ workspaceId: workspace.id, serviceName: "QIE Settlement Config", amount: 0, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.settlement.config", payload: { ...split } }); setSaved(true); };
  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><CircleDollarSign width={15} height={15} /></span><div><h3>Settlement split</h3><div className="sub">how each settled checkout payment is routed · applied by every "Simulate payment" above</div></div></div>
        <button className="btn btn-acc btn-sm" type="button" onClick={save} disabled={Math.abs(sum - 100) > 0.01}><Check width={13} height={13} /> Save split config</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.6fr", gap: 10, padding: "0 16px 10px" }}>
        {(["merchant", "platform", "referrer"] as const).map((k) => (
          <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>{k} %</span>
            <input value={String(split[k])} onChange={(e) => set(k, parseFloat(e.currentTarget.value) || 0)} inputMode="decimal" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }} />
          </label>
        ))}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Referrer wallet</span>
          <input value={split.referrerWallet} onChange={(e) => set("referrerWallet", e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem", fontFamily: "var(--mono)" }} />
        </label>
      </div>
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: ".78rem", color: "var(--muted)" }}>On a <b style={{ color: "var(--ink)" }}>${lastPaid.toFixed(2)}</b> payment → merchant <b style={{ color: "var(--ink)" }}>${(lastPaid * split.merchant / 100).toFixed(3)}</b> · platform <b style={{ color: "var(--ink)" }}>${(lastPaid * split.platform / 100).toFixed(3)}</b> · referrer <b style={{ color: "var(--ink)" }}>${(lastPaid * split.referrer / 100).toFixed(3)}</b></span>
        <span style={{ fontSize: ".74rem", fontWeight: 700, color: Math.abs(sum - 100) > 0.01 ? "var(--red)" : "var(--green)" }}>total {sum}% {Math.abs(sum - 100) > 0.01 ? "(must equal 100)" : "✓"}</span>
        {saved && <span style={{ fontSize: ".74rem", color: "var(--green)", fontWeight: 700 }}><Check width={12} height={12} /> saved</span>}
      </div>
      {configs.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent config changes · {configs.length}</div>
          <div className="svc-hist">{configs.map((r) => { const p = (r.payload ?? {}) as SplitConfig; return (
            <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} /><div className="svc-hist__main"><b>{p.merchant}/{p.platform}/{p.referrer}%</b><span>referrer {String(p.referrerWallet ?? "").slice(0, 12)}… · {new Date(r.createdAt).toLocaleTimeString()}</span></div></div>
          ); })}</div>
        </div>
      )}
    </div>
  );
}





// ---------------------------------------------------------------------------
// MANTLE — Agent Economy Dashboard (Agent Economy tab — replaces empty QuickCallPanel)
// ---------------------------------------------------------------------------
type EconomyAgent = { id: string; name: string; erc8004Id: string; balance: number; spentToday: number; cap: number; status: "active" | "paused" };
const SEED_ECON_AGENTS: EconomyAgent[] = [
  { id: "ea_01", name: "Yield Optimizer", erc8004Id: "0x8004a1f3", balance: 12.4, spentToday: 3.2, cap: 10, status: "active" },
  { id: "ea_02", name: "Alpha Tracker", erc8004Id: "0x8004b7c2", balance: 5.1, spentToday: 1.0, cap: 5, status: "active" },
  { id: "ea_03", name: "RWA Monitor", erc8004Id: "0x8004c9d0", balance: 8.8, spentToday: 0.6, cap: 8, status: "paused" },
];

// ---------------------------------------------------------------------------
// 0G — Agent Memory Checkpoints (Storage & Memory tab)
// ---------------------------------------------------------------------------
type AgentCheckpoint = { id: string; hash: string; size: string; agentId: string; label: string; ts: string };
function AgentCheckpointWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [checkpoints, setCheckpoints] = useLocalStore<AgentCheckpoint[]>("0g.checkpoints", []);
  const [label, setLabel] = useState("session-1");
  const [agentId, setAgentId] = useState("agid_0g_a1f3");
  const [restored, setRestored] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saveCheckpoint = async () => {
    setSaving(true);
    const payload = JSON.stringify({ agentId, label, timestamp: Date.now(), memory: { lastJob: "inference-job-42", policy: { cap: 8 }, contextTokens: 4096 } });
    const hash = await sha256Hex(payload);
    const id = "ckpt_" + hash.slice(0, 8);
    const size = (payload.length / 1024).toFixed(1) + " KB";
    const ckpt: AgentCheckpoint = { id, hash, size, agentId, label, ts: new Date().toISOString() };
    setCheckpoints((p) => [ckpt, ...p].slice(0, 10));
    emitReceipt({ workspaceId: workspace.id, serviceName: "0G Memory Checkpoint · Save", amount: 0.001, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.checkpoint.save", payload: { hash, label, agentId, size } });
    setSaving(false);
  };
  const restore = (ckpt: AgentCheckpoint) => {
    setRestored(ckpt.id);
    emitReceipt({ workspaceId: workspace.id, serviceName: "0G Memory Checkpoint · Restore", amount: 0.001, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.checkpoint.restore", payload: { hash: ckpt.hash, label: ckpt.label, agentId: ckpt.agentId } });
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft">🧠</span><div><h3>Agent Memory Checkpoints</h3><div className="sub">save agent state to 0G Storage · get a permanent restore link · agents never lose context again</div></div></div>
        <button className="btn btn-acc btn-sm" type="button" onClick={saveCheckpoint} disabled={saving}>{saving ? <Loader2 width={13} height={13} className="wallet-spin" /> : <Plus width={13} height={13} />} Save checkpoint</button>
      </div>
      <div style={{ padding: "0 16px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Agent ID</span>
          <input value={agentId} onChange={(e) => setAgentId(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem", fontFamily: "var(--mono)" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Label</span>
          <input value={label} onChange={(e) => setLabel(e.currentTarget.value)} placeholder="session-1" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }} />
        </label>
      </div>
      {checkpoints.length === 0 && <div style={{ padding: "0 16px 14px", color: "var(--muted)", fontSize: ".8rem" }}>No checkpoints yet — save one above to pin agent state to 0G Storage.</div>}
      <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {checkpoints.map((ckpt) => (
          <div key={ckpt.id} style={{ padding: "10px 14px", borderRadius: 12, background: restored === ckpt.id ? "color-mix(in srgb, var(--green) 8%, var(--bg-2))" : "var(--bg-2)", border: `1px solid ${restored === ckpt.id ? "color-mix(in srgb, var(--green) 30%, transparent)" : "var(--line-2)"}` }}>
            <div className="row sm" style={{ gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 800, flex: 1 }}>{ckpt.label}</span>
              <span style={{ fontSize: ".68rem", color: "var(--muted)" }}>{ckpt.size}</span>
              <span style={{ fontSize: ".68rem", color: "var(--muted)" }}>{new Date(ckpt.ts).toLocaleTimeString()}</span>
            </div>
            <div className="row sm" style={{ gap: 6 }}>
              <code style={{ fontSize: ".66rem", color: "var(--muted)", flex: 1 }}>0g://ckpt/{ckpt.hash.slice(0, 16)}…</code>
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: ".68rem" }} onClick={() => navigator.clipboard?.writeText(`0g://ckpt/${ckpt.hash}`)}><Copy width={10} height={10} /> Copy</button>
              <button type="button" className="btn btn-acc btn-sm" style={{ fontSize: ".68rem" }} onClick={() => restore(ckpt)}>{restored === ckpt.id ? <><Check width={10} height={10} /> Restored</> : "Restore"}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}






// ---------------------------------------------------------------------------
// ARBITRUM — Interactive Escrow manager
// ---------------------------------------------------------------------------
type EscrowState = { id: string; service: string; agent: string; amount: number; condition: string; state: "held" | "released" | "refunded"; openedAt: string };
const INITIAL_ESCROWS: EscrowState[] = [
  { id: "esc_4a1c2", service: "Stablecoin Invoice API", agent: "agent_f1…", amount: 0.04, condition: "delivery proof", state: "held", openedAt: new Date(Date.now() - 2 * 36e5).toISOString() },
  { id: "esc_9b07d", service: "Agent Escrow API", agent: "agent_d9…", amount: 0.08, condition: "timeout 24h", state: "held", openedAt: new Date(Date.now() - 6 * 36e5).toISOString() },
  { id: "esc_2e3c1", service: "USDC Settlement API", agent: "agent_1a…", amount: 0.1, condition: "delivery proof", state: "released", openedAt: new Date(Date.now() - 26 * 36e5).toISOString() },
  { id: "esc_7f01a", service: "Stablecoin Invoice API", agent: "agent_77…", amount: 0.04, condition: "manual", state: "held", openedAt: new Date(Date.now() - 9 * 36e5).toISOString() },
];
const ESCROW_CONDITIONS = ["delivery proof", "timeout 24h", "manual"] as const;
function InteractiveEscrow({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [escrows, setEscrows] = useLocalStore<EscrowState[]>("arb.escrows", INITIAL_ESCROWS);
  const [svc, setSvc] = useState("Agent Escrow API");
  const [agent, setAgent] = useState("agent_treasury");
  const [amount, setAmount] = useState("0.05");
  const [condition, setCondition] = useState<typeof ESCROW_CONDITIONS[number]>("delivery proof");

  const net = workspace.networks[0] ?? "arbitrum-sepolia";
  const open = () => {
    const a = parseFloat(amount) || 0; if (a <= 0) return;
    const id = "esc_" + hashId("esc", svc + agent + Date.now(), 5);
    setEscrows((prev) => [{ id, service: svc.trim() || "Service", agent: agent.trim() || "agent", amount: a, condition, state: "held" as const, openedAt: new Date().toISOString() }, ...prev].slice(0, 20));
    emitReceipt({ workspaceId: workspace.id, serviceName: "Agent Escrow · Open", amount: a, currency: "USDC", network: net, kind: "arb.escrow.open", payload: { escId: id, service: svc.trim(), agent: agent.trim(), condition } });
  };
  const resolve = (e: EscrowState, newState: "released" | "refunded") => {
    setEscrows((prev) => prev.map((x) => x.id === e.id ? { ...x, state: newState } : x));
    emitReceipt({ workspaceId: workspace.id, serviceName: `Agent Escrow · ${newState === "released" ? "Release" : "Refund"}`, amount: e.amount, currency: "USDC", network: net, kind: newState === "released" ? "arb.escrow.release" : "arb.escrow.refund", payload: { escId: e.id, service: e.service, agent: e.agent } });
  };
  const held = escrows.filter((e) => e.state === "held").reduce((s, e) => s + e.amount, 0);
  const released = escrows.filter((e) => e.state === "released").reduce((s, e) => s + e.amount, 0);
  const refunded = escrows.filter((e) => e.state === "refunded").reduce((s, e) => s + e.amount, 0);

  const SM_STATES: { key: EscrowState["state"] | "open"; label: string; color: string }[] = [
    { key: "open", label: "Open", color: "#94a3b8" },
    { key: "held", label: "Funded", color: "#3aa0e6" },
    { key: "released", label: "Released", color: "#1fb58a" },
    { key: "refunded", label: "Refunded", color: "#e63946" },
  ];

  const EscrowCard = ({ e }: { e: EscrowState }) => {
    const activeIdx = e.state === "held" ? 1 : e.state === "released" ? 2 : 3;
    return (
      <div style={{ borderRadius: 14, border: "1px solid var(--line-2)", background: "var(--bg-2)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Mini state machine */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 2 }}>
          {SM_STATES.filter((s) => s.key !== "open").map((s, i) => {
            const isActive = (i === 0 && e.state === "held") || (i === 1 && e.state === "released") || (i === 2 && e.state === "refunded");
            const isPast = (i === 0 && (e.state === "released" || e.state === "refunded"));
            const col = isActive ? s.color : isPast ? s.color : "var(--line-2)";
            return (
              <Fragment key={s.key}>
                {i > 0 && <div style={{ flex: 1, height: 1, background: isPast || isActive ? col : "var(--line-2)", minWidth: 12 }} />}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${col}`, background: isActive ? col : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {(isActive || isPast) && <Check width={10} height={10} style={{ color: isActive ? "#fff" : col }} />}
                  </div>
                  <span style={{ fontSize: ".55rem", fontWeight: 700, color: col, whiteSpace: "nowrap" }}>{s.label}</span>
                </div>
              </Fragment>
            );
          })}
        </div>
        {/* Escrow details */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: ".82rem" }}>{e.service}</div>
            <div style={{ fontSize: ".68rem", color: "var(--muted)" }}>{e.agent} · {e.condition}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontWeight: 900, fontSize: ".92rem", color: SM_STATES[activeIdx]!.color }}>${e.amount.toFixed(3)}</div>
            <div style={{ fontSize: ".62rem", color: "var(--muted)" }}>USDC</div>
          </div>
        </div>
        {e.state === "held" && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-acc btn-sm" style={{ flex: 1, fontSize: ".7rem" }} type="button" onClick={() => resolve(e, "released")}><Check width={11} height={11} /> Release</button>
            <button className="btn btn-sm btn-ghost" style={{ flex: 1, fontSize: ".7rem" }} type="button" onClick={() => resolve(e, "refunded")}>Refund</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head" style={{ borderBottom: "1px solid var(--line-2)", paddingBottom: 12 }}>
        <div className="ttl"><span className="sq soft"><Shield width={15} height={15} /></span><div><h3>Escrow state machine</h3><div className="sub">each escrow moves through Open → Funded → Released (or Refunded) · every transition is a receipt</div></div></div>
        <span style={{ fontSize: ".72rem", color: "var(--muted)" }}>Held <b style={{ color: "var(--ink)" }}>${held.toFixed(3)}</b> · Released <b style={{ color: "#1fb58a" }}>${released.toFixed(3)}</b></span>
      </div>

      {/* Global state machine diagram */}
      <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 0, overflowX: "auto" }}>
        {["Open", "Funded", "Released"].map((label, i) => {
          const colors = ["#94a3b8", "#3aa0e6", "#1fb58a"];
          const col = colors[i]!;
          return (
            <Fragment key={label}>
              {i > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, ${colors[i-1]!}, ${col})` }} />
                  <span style={{ fontSize: ".55rem", color: "var(--muted)", marginTop: 2 }}>{i === 1 ? "fund" : "verify"}</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", border: `2.5px solid ${col}`, background: `color-mix(in srgb, ${col} 12%, var(--bg-2))`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: ".68rem", fontWeight: 800, color: col }}>{label.slice(0, 3)}</span>
                </div>
                <span style={{ fontSize: ".65rem", fontWeight: 700, color: col }}>{label}</span>
              </div>
            </Fragment>
          );
        })}
        {/* Refund branch */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginLeft: 16, paddingLeft: 16, borderLeft: "1px dashed var(--line-2)" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px dashed #e63946", background: "color-mix(in srgb, #e63946 8%, var(--bg-2))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: ".62rem", fontWeight: 800, color: "#e63946" }}>Ref</span>
          </div>
          <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#e63946", marginTop: 4 }}>Refunded</span>
        </div>
      </div>

      {/* Escrow cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, padding: "0 16px 12px" }}>
        {escrows.map((e) => <EscrowCard key={e.id} e={e} />)}
      </div>

      {/* New escrow form */}
      <div style={{ margin: "0 16px 14px", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--field)" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>Open new escrow</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr 1.4fr", gap: 8, marginBottom: 8 }}>
          <input value={svc} onChange={(e) => setSvc(e.currentTarget.value)} placeholder="Service / counterparty" style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem" }} />
          <input value={agent} onChange={(e) => setAgent(e.currentTarget.value)} placeholder="Agent ID" style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "var(--mono)" }} />
          <input value={amount} onChange={(e) => setAmount(e.currentTarget.value)} placeholder="USDC" inputMode="decimal" style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem" }} />
          <select value={condition} onChange={(e) => setCondition(e.currentTarget.value as typeof condition)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem" }}>{ESCROW_CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <button className="btn btn-acc btn-sm" type="button" onClick={open}><Plus width={13} height={13} /> Open escrow → Funded state</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANTLE — Live Backtest Runner
// ---------------------------------------------------------------------------
const BACKTEST_ASSETS = ["mETH / USDY", "T-BILL 90D / mETH", "RWA-A / USDC", "mETH / USDC"] as const;
const BACKTEST_WINDOWS = ["30d", "90d", "180d", "1y"] as const;

function BacktestRunner({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const { receipts } = useAppState();
  const [assetIdx, setAssetIdx] = useState(0);
  const [windowIdx, setWindowIdx] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ret: string; maxDD: string; sharpe: number; trades: number; runId: string } | null>(null);

  const asset = BACKTEST_ASSETS[assetIdx] ?? BACKTEST_ASSETS[0];
  const window_ = BACKTEST_WINDOWS[windowIdx] ?? BACKTEST_WINDOWS[1];
  const history = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "mantle.backtest").slice(0, 8), [receipts, workspace.id]);

  const curveData = useMemo(() => {
    const seed = `${asset}|${window_}`;
    const retFloat = result ? parseFloat(result.ret) : deterministicScore(seed + "pre", -3, 12);
    const pts: number[] = [50];
    for (let i = 1; i <= 30; i++) {
      const delta = deterministicScore(seed + i, -3, 4.5) + (retFloat > 0 ? 0.55 : retFloat < 0 ? -0.35 : 0.1);
      pts.push(Math.max(2, Math.min(98, (pts[pts.length - 1] ?? 50) + delta)));
    }
    return pts;
  }, [asset, window_, result]);

  const run = async () => {
    setRunning(true);
    await new Promise((r) => setTimeout(r, 600));
    const seed = `${asset}|${window_}`;
    const retRaw = deterministicScore(seed + "|ret", -5, 38);
    const ret = (retRaw >= 0 ? "+" : "") + retRaw.toFixed(1) + "%";
    const dd = "-" + deterministicScore(seed + "|dd", 2, 18).toFixed(1) + "%";
    const sharpe = parseFloat(deterministicScore(seed + "|sr", 0.4, 2.4).toFixed(2));
    const trades = Math.round(deterministicScore(seed + "|tr", 40, 300));
    const runId = "sim_" + hashId("bt", seed, 6);
    emitReceipt({ workspaceId: workspace.id, serviceName: "Strategy Backtest API", amount: 0.15, currency: "USDC", network: workspace.networks[0] ?? "mantle-sepolia", kind: "mantle.backtest", payload: { asset, window: window_, ret, maxDD: dd, sharpe, trades, runId } });
    setResult({ ret, maxDD: dd, sharpe, trades, runId });
    setRunning(false);
  };

  const CW = 460, CH = 130;
  const svgPoints = curveData.map((p, i) => [Math.round((i / 30) * CW), Math.round(CH - (p / 100) * (CH - 12) - 6)] as [number, number]);
  const lineD = svgPoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const fillD = `${lineD} L${CW},${CH + 6} L0,${CH + 6} Z`;
  const curveUp = (curveData[curveData.length - 1] ?? 50) > (curveData[0] ?? 50);
  const curveColor = curveUp ? "#1fb58a" : "#e63946";

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><TrendingUp width={15} height={15} /></span><div><h3>Trading Strategies</h3><div className="sub">$0.15 USDC / run · deterministic simulation · receipt issued</div></div></div>
        <button className="btn btn-acc btn-sm" type="button" onClick={run} disabled={running}>{running ? <><Loader2 size={13} className="wallet-spin" /> Running…</> : <><Play size={13} /> Run backtest</>}</button>
      </div>

      {/* Equity curve — chart-first */}
      <div style={{ padding: "0 16px 4px", position: "relative" }}>
        <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: "100%", height: CH, display: "block", borderRadius: 8, background: "var(--bg-3)", overflow: "hidden" }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="btFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={curveColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={curveColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={fillD} fill="url(#btFill)" />
          <path d={lineD} fill="none" stroke={curveColor} strokeWidth="2" strokeLinejoin="round" />
          {/* Baseline */}
          <line x1={0} y1={Math.round(CH - (50 / 100) * (CH - 12) - 6)} x2={CW} y2={Math.round(CH - (50 / 100) * (CH - 12) - 6)} stroke="var(--line-2)" strokeWidth="1" strokeDasharray="4 4" />
        </svg>
        <div style={{ position: "absolute", top: 8, left: 24, fontSize: ".68rem", fontWeight: 800, color: curveColor }}>{curveUp ? "▲" : "▼"} {asset} · {window_}</div>
        {result && (
          <div style={{ position: "absolute", top: 8, right: 24, fontSize: ".76rem", fontWeight: 800, color: curveUp ? "#1fb58a" : "#e63946" }}>{result.ret}</div>
        )}
      </div>

      {/* Param sliders */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: "12px 16px 12px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Asset pair · <b style={{ color: "var(--ink)" }}>{asset}</b></span>
          <input type="range" min={0} max={BACKTEST_ASSETS.length - 1} value={assetIdx} onChange={(e) => setAssetIdx(Number(e.currentTarget.value))} style={{ width: "100%", accentColor: "var(--accent-primary)" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Window · <b style={{ color: "var(--ink)" }}>{window_}</b></span>
          <input type="range" min={0} max={BACKTEST_WINDOWS.length - 1} value={windowIdx} onChange={(e) => setWindowIdx(Number(e.currentTarget.value))} style={{ width: "100%", accentColor: "var(--accent-primary)" }} />
        </label>
      </div>

      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, padding: "4px 16px 12px" }}>
          {[["Return", result.ret, "#1fb58a"], ["Max DD", result.maxDD, "#e63946"], ["Sharpe", result.sharpe, "var(--accent-primary)"], ["Trades", result.trades, "var(--ink)"]].map(([k, v, c]) => (
            <div key={String(k)} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>{k}</span>
              <span style={{ fontSize: "1.1rem", fontWeight: 800, color: String(c), letterSpacing: "-.03em" }}>{v}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent runs · {history.length}</div>
        <div className="svc-table__scroll"><table className="svc-table">
          <thead><tr><th>Run ID</th><th>Asset</th><th>Window</th><th>Return</th><th>Sharpe</th><th>Cost</th></tr></thead>
          <tbody>
            {history.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)", padding: 12 }}>No runs yet — try one above.</td></tr>}
            {history.map((r) => {
              const p = (r.payload ?? {}) as { asset?: string; window?: string; ret?: string; sharpe?: number };
              return (
                <tr key={r.id}>
                  <td><code>#{hashId("bt", r.id, 6)}</code></td>
                  <td>{p.asset ?? "—"}</td>
                  <td>{p.window ?? "—"}</td>
                  <td style={{ color: "#1fb58a", fontWeight: 700 }}>{p.ret ?? "—"}</td>
                  <td className="svc-table__num">{p.sharpe ?? "—"}</td>
                  <td className="svc-table__num">${r.amount.toFixed(2)} <span className="muted">{r.currency}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}





type SigBlock = { title: string; sub: string; headers: string[]; rows: (string | number)[][]; accentCol?: number };
const WS_SIGNATURE: Record<WorkspaceId, SigBlock> = {
  "0g": {
    title: "0G network at a glance", sub: "the four layers your endpoints settle against",
    headers: ["Layer", "Role", "Throughput", "Status"],
    rows: [
      ["0G Compute", "inference jobs", "612 jobs/min", "healthy"],
      ["0G Storage", "memory & blobs", "2.1k pins/min", "healthy"],
      ["0G DA", "data availability", "44 MB/s", "healthy"],
      ["0G Chain", "receipts & settlement", "1.4s blocks", "healthy"],
    ], accentCol: 3,
  },
  qie: {
    title: "QIE rail health", sub: "checkout, passes and merchant payouts on the QIE network",
    headers: ["Metric", "Value", "Window", "Trend"],
    rows: [
      ["Active merchants", "142", "this week", "+8"],
      ["Checkouts settled", "2,210", "7 days", "+12%"],
      ["QIE Pass holders", "1,884", "all-time", "+63"],
      ["Next payout run", "Fri 18:00", "scheduled", "42.10 QIE"],
    ], accentCol: 3,
  },
  arbitrum: {
    title: "Orbit & USDC settlement", sub: "chains feeding the gateway and the stablecoin flowing through them",
    headers: ["Chain", "USDC settled 24h", "Bridge", "Status"],
    rows: [
      ["Arbitrum One", "$184,200", "healthy", "verified"],
      ["Arbitrum Nova", "$31,040", "healthy", "verified"],
      ["Orbit · PaymentsL3", "$12,510", "degraded", "pending"],
      ["Orbit · GameChain", "$4,180", "healthy", "verified"],
    ], accentCol: 3,
  },
  mantle: {
    title: "Yield board", sub: "the instruments your alpha & RWA endpoints track",
    headers: ["Instrument", "APY", "Duration", "7d trend"],
    rows: [
      ["mETH", "3.9%", "perpetual", "+0.2%"],
      ["USDY", "5.1%", "perpetual", "+0.0%"],
      ["T-BILL 90D", "4.83%", "84 days", "+0.1%"],
      ["RWA basket A-", "6.2%", "120 days", "-0.3%"],
    ], accentCol: 3,
  },
  sui: {
    title: "Sui agent economy", sub: "Walrus storage, Move contracts, NFT passes and zkLogin on Sui mainnet",
    headers: ["Layer", "Role", "Volume 24h", "Status"],
    rows: [
      ["Walrus Storage", "blob pinning & retrieval", "2,840 blobs", "healthy"],
      ["Move VM", "PTB execution & dry-run", "1,120 txs", "healthy"],
      ["Kiosk / NFT", "agent passes & access NFTs", "620 mints", "healthy"],
      ["zkLogin", "OAuth-to-Sui proofs", "1,100 proofs", "healthy"],
    ], accentCol: 3,
  },
  agora: {
    title: "Arc L1 agent commerce", sub: "Circle tools powering autonomous cross-chain arbitrage on Arc testnet",
    headers: ["Tool", "Role", "Latency", "Status"],
    rows: [
      ["USDC", "settlement currency", "<1s", "active"],
      ["CCTP", "Arc ↔ Base cross-chain", "<500ms", "active"],
      ["Paymaster", "gas sponsorship", "free", "active"],
      ["Nanopayments", "streaming receipts", "real-time", "active"],
    ], accentCol: 3,
  },
  polygon: {
    title: "Polygon zkEVM commerce", sub: "UAE trade finance & merchant micropayments settled in USDC on Polygon",
    headers: ["Corridor", "Volume 24h", "Fee", "Status"],
    rows: [
      ["AED → USDC", "$142,000", "$0.05/call", "active"],
      ["SME trade invoices", "18 tokenised", "0.1%", "active"],
      ["Merchant checkouts", "3,410 calls", "$0.01/call", "active"],
      ["Cross-border remittance", "$38,200", "0.2%", "active"],
    ], accentCol: 3,
  },
};

function WorkspaceSignature({ workspace }: { workspace: Workspace }) {
  const sig = WS_SIGNATURE[workspace.id];
  if (!sig) return null;
  return (
    <div className="panel block svc-flavor">
      <div className="block-head"><div className="ttl"><span className="sq soft" style={{ color: "var(--accent-primary)" }}><workspace.Icon size={15} /></span><div><h3>{sig.title}</h3><div className="sub">{sig.sub}</div></div></div></div>
      <div className="svc-table__scroll"><table className="svc-table">
        <thead><tr>{sig.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {sig.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => {
                const isFirst = ci === 0;
                const isAccent = ci === sig.accentCol;
                const known = ["verified", "pending", "active", "paused"].includes(String(cell));
                return (
                  <td key={ci} className={!isFirst ? "svc-table__num" : undefined}>
                    {isFirst ? <b>{cell}</b>
                      : known ? badgeFor(String(cell) as ReceiptStatus | "active" | "paused")
                      : isAccent ? <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>{cell}</span>
                      : cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

// Fallback functional block for any service tab that doesn't already have a
// bespoke widget — pick an endpoint, see the request/response shape, pay & call.
function QuickCallPanel({ workspace, services, primary, onOpenPayment, receipts }: { workspace: Workspace; services: Service[]; primary: Service; onOpenPayment: (s: Service) => void; receipts: Receipt[] }) {
  const active = services.filter((s) => s.status === "active");
  const [selId, setSelId] = useState(primary.id);
  const sel = active.find((s) => s.id === selId) ?? primary;
  const ids = useMemo(() => new Set(services.map((s) => s.id)), [services]);
  const recent = receipts.filter((r) => r.workspaceId === workspace.id && ids.has(r.serviceId)).slice(0, 6);
  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Bolt width={15} height={15} /></span><div><h3>Run a paid call</h3><div className="sub">pick an endpoint → 402 → pay → unlocked response + receipt</div></div></div>
        <button className="btn btn-acc btn-sm" type="button" onClick={() => onOpenPayment(sel)} disabled={sel.status !== "active"}><Bolt width={13} height={13} /> Pay &amp; call · ${sel.priceUsd.toFixed(3)} {sel.currency}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, padding: "0 16px 12px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Endpoint</span>
          <select value={selId} onChange={(e) => setSelId(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>
            {active.map((s) => <option key={s.id} value={s.id}>{s.name} — ${s.priceUsd.toFixed(3)} {s.currency}</option>)}
          </select>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Request</span>
            <pre className="code-block" style={{ margin: 0 }}>{`GET ${endpointPath(sel)}\n${sel.sampleIn}`}</pre>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Response · unlocks after payment</span>
            <pre className="code-block" style={{ margin: 0, opacity: 0.72 }}>{sel.response}</pre>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent calls · {recent.length}</div>
        <div className="svc-hist">
          {recent.length === 0 && <div className="muted sm">No calls yet — pay &amp; call above.</div>}
          {recent.map((r) => (
            <div className="svc-hist__row" key={r.id}>
              <span className="svc-hist__dot" style={{ background: catColor(serviceById(r.serviceId)?.category ?? "data") }} />
              <div className="svc-hist__main"><b>{r.serviceName}</b><span>{r.agentName} · {ago(r.createdAt)}</span></div>
              {badgeFor(r.status)}
              <span className="svc-hist__amt">{r.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QIE — Swap Quote Desk (QIEDEX Data tab) — replaces the old static pairs table
// ---------------------------------------------------------------------------
const DEX_TOKENS = ["QIE", "USDC", "ETH", "mQIE", "USDT"] as const;
const DEX_PX: Record<string, number> = { QIE: 0.0412, mQIE: 1.003, ETH: 3120, USDC: 1, USDT: 1 };

function SwapQuoteDesk({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [tokenIn, setTokenIn] = useState<string>("USDC");
  const [tokenOut, setTokenOut] = useState<string>("QIE");
  const [amountIn, setAmountIn] = useState("100");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<{ out: number; impact: number; minOut: number; route: string[]; quoteId: string; fee: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [settled, setSettled] = useState<string | null>(null);

  const quotes = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "qie.dex.quote").slice(0, 8), [receipts, workspace.id]);
  const swaps = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "qie.dex.swap").slice(0, 5), [receipts, workspace.id]);

  const getQuote = async () => {
    if (tokenIn === tokenOut) return;
    setRunning(true); setSettled(null);
    await new Promise((r) => setTimeout(r, 420));
    const amt = parseFloat(amountIn) || 0;
    const seed = `${tokenIn}|${tokenOut}|${amt}`;
    const rate = (DEX_PX[tokenIn] ?? 1) / (DEX_PX[tokenOut] ?? 1) * (1 - deterministicScore(seed + "|spread", 0.001, 0.006));
    const out = Number((amt * rate).toPrecision(6));
    const impact = Number(deterministicScore(seed + "|imp", 0.02, 1.7).toFixed(2));
    const slip = parseFloat(slippage) || 0.5;
    const minOut = Number((out * (1 - slip / 100)).toPrecision(6));
    const route = tokenIn === "USDC" || tokenOut === "USDC" ? [tokenIn, tokenOut] : [tokenIn, "QIE", tokenOut];
    const fee = 0.003;
    const quoteId = "q_" + hashId("q", seed + Date.now(), 8);
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_qie_dex", serviceName: "QIEDEX Quote API", amount: fee, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.dex.quote", payload: { tokenIn, tokenOut, amountIn: amt, out, impact, minOut, route, quoteId } });
    setQuote({ out, impact, minOut, route, quoteId, fee });
    setRunning(false);
  };

  const acceptSwap = () => {
    if (!quote) return;
    const notionalFee = Math.max(0.002, (parseFloat(amountIn) || 0) * 0.0008);
    const rid = emitReceipt({ workspaceId: workspace.id, serviceId: "svc_qie_dex", serviceName: "QIEDEX Swap Settlement", amount: Number(notionalFee.toFixed(4)), currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.dex.swap", payload: { quoteId: quote.quoteId, tokenIn, tokenOut, amountIn: parseFloat(amountIn) || 0, out: quote.out } });
    setSettled(rid.id);
  };

  const pairRows = useMemo(() => ([
    ["QIE / USDC", DEX_PX.QIE!, deterministicScore("QIE/USDC|tvl", 0.8, 2.4)],
    ["mQIE / USDC", DEX_PX.mQIE!, deterministicScore("mQIE/USDC|tvl", 1.4, 3.2)],
    ["QIE / ETH", DEX_PX.QIE! / DEX_PX.ETH!, deterministicScore("QIE/ETH|tvl", 0.4, 1.2)],
  ] as [string, number, number][]), []);

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Bolt width={15} height={15} /></span><div><h3>Swap quote desk</h3><div className="sub">paid QIEDEX quote · expected out · price impact · min-received · $0.003 USDC / quote</div></div></div>
        <button className="btn btn-acc btn-sm" type="button" onClick={getQuote} disabled={running || tokenIn === tokenOut}>{running ? <><Loader2 size={13} className="wallet-spin" /> Quoting…</> : <><Bolt width={13} height={13} /> Pay &amp; quote</>}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, padding: "0 16px 12px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>From</span>
          <select value={tokenIn} onChange={(e) => setTokenIn(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>{DEX_TOKENS.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>To</span>
          <select value={tokenOut} onChange={(e) => setTokenOut(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: `1px solid ${tokenIn === tokenOut ? "var(--red)" : "var(--line-2)"}`, background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>{DEX_TOKENS.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Amount in</span>
          <input value={amountIn} onChange={(e) => setAmountIn(e.currentTarget.value)} inputMode="decimal" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem", fontVariantNumeric: "tabular-nums" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Slippage %</span>
          <select value={slippage} onChange={(e) => setSlippage(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>{["0.1", "0.5", "1.0"].map((x) => <option key={x}>{x}</option>)}</select>
        </label>
      </div>
      {quote && (
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--bg-2)" }}>
            {[["Expected out", `${quote.out} ${tokenOut}`], ["Price impact", `${quote.impact}%`], ["Min received", `${quote.minOut} ${tokenOut}`], ["Route", quote.route.join(" → ")], ["Fee", `$${quote.fee.toFixed(3)}`]].map(([k, v]) => (
              <div key={String(k)} style={{ display: "flex", flexDirection: "column", gap: 1 }}><span style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>{k}</span><span style={{ fontSize: ".95rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{v}</span></div>
            ))}
            <div style={{ flex: 1, minWidth: 120, textAlign: "right" }}><button className="btn btn-acc btn-sm" type="button" onClick={acceptSwap}><Check width={12} height={12} /> Accept &amp; settle swap</button></div>
          </div>
          {settled && <div style={{ marginTop: 8, padding: "7px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--green) 12%, transparent)", color: "var(--green)", fontSize: ".76rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}><Check width={13} height={13} /> Swap settled — receipt <code style={{ background: "rgba(0,0,0,.14)", padding: "1px 5px", borderRadius: 5 }}>{settled}</code></div>}
        </div>
      )}
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Pool snapshot</div>
        <div className="svc-table__scroll"><table className="svc-table">
          <thead><tr><th>Pair</th><th>Mid price</th><th>TVL</th><th>Depth ±2%</th><th>Quote cost</th></tr></thead>
          <tbody>{pairRows.map(([p, px, tvl]) => (
            <tr key={p}><td><b>{p}</b></td><td className="svc-table__num">{px < 1 ? px.toFixed(5) : px.toLocaleString()}</td><td className="svc-table__num">${tvl.toFixed(1)}M</td><td className="svc-table__num">${(tvl * deterministicScore(p + "|d", 0.04, 0.12) * 1000).toFixed(0)}k</td><td className="svc-table__num">${(0.003).toFixed(3)}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
      <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent quotes · {quotes.length}</div>
          <div className="svc-hist">
            {quotes.length === 0 && <div className="muted sm">No quotes yet.</div>}
            {quotes.map((r) => { const p = (r.payload ?? {}) as { tokenIn?: string; tokenOut?: string; out?: number; quoteId?: string }; return (
              <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} /><div className="svc-hist__main"><b>{p.tokenIn} → {p.tokenOut}</b><span>out {p.out} · {p.quoteId}</span></div><span className="svc-hist__amt">{r.amount.toFixed(3)}</span></div>
            ); })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Settled swaps · {swaps.length}</div>
          <div className="svc-hist">
            {swaps.length === 0 && <div className="muted sm">No swaps settled yet.</div>}
            {swaps.map((r) => { const p = (r.payload ?? {}) as { tokenIn?: string; tokenOut?: string; amountIn?: number; out?: number }; return (
              <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "#1fb58a" }} /><div className="svc-hist__main"><b>{p.amountIn} {p.tokenIn} → {p.out} {p.tokenOut}</b><span>{new Date(r.createdAt).toLocaleTimeString()}</span></div>{badgeFor(r.status)}<span className="svc-hist__amt">{r.amount.toFixed(3)}</span></div>
            ); })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0G — Sealed Payload Vault (Privacy tab, replaces the static access-rules list)
// ---------------------------------------------------------------------------
type SealedRecord = { sealId: string; recipient: string; digest: string; createdAt: string };
function SealedPayloadVault({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [seals, setSeals] = useLocalStore<SealedRecord[]>("0g.seals", []);
  const [recipient, setRecipient] = useState("agid_0g_a1f3");
  const [payload, setPayload] = useState('{ "strategy": "rotate 40% mETH→USDY when spread<0.04%", "params": { "band": 0.6 } }');
  const [unsealId, setUnsealId] = useState("");
  const [unsealReceipt, setUnsealReceipt] = useState("");
  const [unsealRes, setUnsealRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [sealing, setSealing] = useState(false);
  const recent = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "0g.seal").slice(0, 6), [receipts, workspace.id]);

  const seal = async () => {
    if (!payload.trim() || sealing) return;
    setSealing(true);
    const nonce = Math.random().toString(36).slice(2);
    const hash = await sha256Hex(payload + recipient + nonce);
    const sealId = "seal_" + hashId("seal", hash, 8);
    const digest = hash.slice(0, 32);
    setSeals((prev) => [{ sealId, recipient: recipient.trim() || "(unset)", digest, createdAt: new Date().toISOString() }, ...prev].slice(0, 20));
    emitReceipt({ workspaceId: workspace.id, serviceName: "0G Sealed Payload", amount: 0.008, currency: "USDC", network: workspace.networks[0] ?? "0g-galileo", kind: "0g.seal", payload: { sealId, recipient: recipient.trim(), digest } });
    setUnsealId(sealId);
    setSealing(false);
  };
  const unseal = () => {
    const s = seals.find((x) => x.sealId === unsealId.trim());
    if (!s) { setUnsealRes({ ok: false, text: "no such seal id" }); return; }
    const r = receipts.find((x) => x.id === unsealReceipt.trim());
    if (!r) { setUnsealRes({ ok: false, text: "receipt not found — paste the receipt id from the seal payment" }); return; }
    const okMatch = ((r.payload ?? {}) as { sealId?: string }).sealId === s.sealId;
    setUnsealRes(okMatch ? { ok: true, text: `unsealed for ${s.recipient} — digest ${s.digest}…` } : { ok: false, text: "proof does not match this seal — that receipt is for a different sealed payload" });
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head"><div className="ttl"><span className="sq soft"><ShieldCheck width={15} height={15} /></span><div><h3>Sealed payload vault</h3><div className="sub">encrypt a request payload for a recipient Agent ID · the vault stores only the ciphertext digest · unseal only with a matching receipt</div></div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, padding: "0 16px 10px", alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Recipient Agent ID</span>
          <input value={recipient} onChange={(e) => setRecipient(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".82rem", fontFamily: "var(--mono)" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Payload (encrypted before submit)</span>
          <input value={payload} onChange={(e) => setPayload(e.currentTarget.value)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "var(--mono)" }} />
        </label>
        <button className="btn btn-acc btn-sm" type="button" onClick={seal} disabled={sealing || !payload.trim()}>{sealing ? <><Loader2 size={12} className="wallet-spin" /> Sealing…</> : <><ShieldCheck width={12} height={12} /> Seal payload ($0.008)</>}</button>
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Sealed payloads · {seals.length}</div>
        <div className="svc-table__scroll"><table className="svc-table">
          <thead><tr><th>Seal ID</th><th>Recipient</th><th>Digest</th><th>When</th></tr></thead>
          <tbody>
            {seals.length === 0 && <tr><td colSpan={4} style={{ color: "var(--muted)", padding: 12 }}>No sealed payloads — seal one above.</td></tr>}
            {seals.map((s) => (<tr key={s.sealId}><td><code>{s.sealId}</code></td><td style={{ fontFamily: "var(--mono)", fontSize: ".74rem" }}>{s.recipient}</td><td style={{ fontFamily: "var(--mono)", fontSize: ".7rem", color: "var(--muted)" }}>{s.digest}…</td><td className="muted svc-table__num">{new Date(s.createdAt).toLocaleTimeString()}</td></tr>))}
          </tbody>
        </table></div>
      </div>
      <div style={{ margin: "0 16px 12px", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--field)" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>Unseal — requires a matching receipt id</div>
        <div className="row sm" style={{ gap: 8, flexWrap: "wrap" }}>
          <input value={unsealId} onChange={(e) => setUnsealId(e.currentTarget.value)} placeholder="seal id" style={{ flex: 1, minWidth: 160, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "var(--mono)" }} />
          <input value={unsealReceipt} onChange={(e) => setUnsealReceipt(e.currentTarget.value)} placeholder="receipt id (rcpt_…)" style={{ flex: 1, minWidth: 160, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "var(--mono)" }} />
          <button className="btn btn-sm" type="button" onClick={unseal}>Unseal</button>
        </div>
        {unsealRes && <div style={{ marginTop: 8, padding: "7px 12px", borderRadius: 10, background: `color-mix(in srgb, ${unsealRes.ok ? "var(--green)" : "var(--red)"} 12%, transparent)`, color: unsealRes.ok ? "var(--green)" : "var(--red)", fontSize: ".78rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>{unsealRes.ok ? <Check width={13} height={13} /> : <X width={13} height={13} />} {unsealRes.text}</div>}
      </div>
      {recent.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent seals · {recent.length}</div>
          <div className="svc-hist">{recent.map((r) => { const p = (r.payload ?? {}) as { sealId?: string; recipient?: string }; return (
            <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} /><div className="svc-hist__main"><b>{p.sealId}</b><span>→ {p.recipient} · receipt {r.id} · {new Date(r.createdAt).toLocaleTimeString()}</span></div><span className="svc-hist__amt">{r.amount.toFixed(3)}</span></div>
          ); })}</div>
        </div>
      )}
    </div>
  );
}







export function ServiceTabPage({
  services,
  workspace,
  tabLabel,
  receipts,
  variant,
  onOpenPayment,
}: {
  services: Service[];
  workspace: Workspace;
  tabLabel: string;
  receipts: Receipt[];
  variant: "service" | "verify";
  onOpenPayment: (s: Service) => void;
}) {
  const [q, setQ] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const t = tabLabel.toLowerCase();

  const tabCat =
    t.includes("trading") ? "trading"
    : t.includes("tax") ? "tax"
    : t.includes("storage") ? "storage"
    : (t.includes("compute") || t.includes("inference")) ? "inference"
    : (t.includes("analy") || t.includes("wallet")) ? "analytics"
    : t.includes("intel") ? "game-intel"
    : null;

  // Always show every endpoint in the workspace — but float the tab's own category to the top.
  const base = [...services].sort((a, b) => {
    const ax = tabCat && a.category === tabCat ? 0 : 1;
    const bx = tabCat && b.category === tabCat ? 0 : 1;
    if (ax !== bx) return ax - bx;
    return b.calls - a.calls;
  });
  const primary = base[0];
  const rows = base
    .map((s, i) => ({ s, method: SVC_METHODS[i % SVC_METHODS.length] as string }))
    .filter(({ s }) => `${s.name} ${s.provider} ${s.network} ${s.category}`.toLowerCase().includes(q.toLowerCase()))
    .filter(({ method }) => methodFilter === "all" || method === methodFilter);

  // Tab-scoped slice — so KPIs / activity / callers differ between tabs of the
  // same workspace instead of repeating the same workspace-wide block everywhere.
  const tabServices = tabCat ? base.filter((s) => s.category === tabCat) : [];
  const scoped = tabServices.length ? tabServices : base;
  const scopedIds = new Set(scoped.map((s) => s.id));
  const tabReceipts = receipts.filter((r) => r.workspaceId === workspace.id && scopedIds.has(r.serviceId));
  const tabRecent = (tabReceipts.length ? tabReceipts : receipts.filter((r) => r.workspaceId === workspace.id)).slice(0, 7);

  const wsAgents = allAgents.filter((a) => a.workspaceId === workspace.id);
  const topCallers = wsAgents
    .map((a) => {
      const rs = tabReceipts.filter((r) => r.agentName === a.name);
      const calls = rs.length;
      const spend = rs.reduce((s, r) => s + r.amount, 0);
      return { name: a.name, calls, spend };
    })
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 4);

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const wsReceipts7d = receipts.filter((r) => r.workspaceId === workspace.id && new Date(r.createdAt).getTime() >= sevenDaysAgo);
  const scopedAvg = scoped.length ? scoped.reduce((a, s) => a + s.priceUsd, 0) / scoped.length : 0;
  const scopedRevenue = tabReceipts.reduce((a, r) => a + r.amount, 0);
  const avgPrice = base.length ? base.reduce((a, s) => a + s.priceUsd, 0) / base.length : 0;
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - daysAgo);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const label = dayStart.toLocaleDateString("en-US", { weekday: "short" });
    const value = wsReceipts7d.filter((r) => { const t = new Date(r.createdAt).getTime(); return t >= dayStart.getTime() && t < dayEnd.getTime(); }).length;
    return { label, value };
  });

  const [ttl, sub] = TAB_COPY[t] ?? [tabLabel, `Paid ${tabLabel.toLowerCase()} endpoints in the ${workspace.shortName} workspace — every call is wrapped by the x402 gateway.`];

  // True if any bespoke functional widget below already covers this tab; if not,
  // the generic QuickCallPanel is shown so every tab has a working call surface.
  const isVerifyFlavor = t.includes("pass") || (variant === "verify" && !t.includes("rule") && !t.includes("risk") && !t.includes("protection"));
  const hasFlavor =
    t.includes("escrow") || t.includes("alert") || t.includes("strateg") || t.includes("sandbox") ||
    isVerifyFlavor || t.includes("compute") || t.includes("inference") || t.includes("storage") ||
    t.includes("checkout") || t.includes("orbit") || t.includes("monitor") || t.includes("qiedex") || t.includes("dex") ||
    // Arbitrum: "Stylus Contracts" is the API reference tab — excluded so grid shows there
    (workspace.id === "arbitrum" && (t.includes("stablecoin") || t.includes("payment") || t.includes("usdc") || t.includes("agent") || t.includes("marketplace") || t.includes("risk") || t.includes("rule") || t.includes("protection") || t.includes("rust"))) ||
    (workspace.id === "mantle" && (t.includes("alpha") || t.includes("meth") || t.includes("usdy") || t.includes("yield") || t.includes("compare") || t.includes("rwa") || t.includes("economy") || t.includes("credit") || t.includes("budget") || t.includes("a2a") || t.includes("loop") || t.includes("devtool") || t.includes("dev tool"))) ||
    (workspace.id === "sui" && (t.includes("walrus") || t.includes("storage") || t.includes("move") || t.includes("contracts") || t.includes("nft") || t.includes("market") || t.includes("wallet") || t.includes("agent") || t.includes("yield") || t.includes("escrow") || t.includes("arena") || t.includes("memory") || t.includes("intent") || t.includes("receipt") || t.includes("pay widget") || t.includes("pay button") || t.includes("widget"))) ||
    (workspace.id === "qie" && (t.includes("merchant") || t.includes("gaming") || t.includes("game") || t.includes("social") || t.includes("creator") || t.includes("wallet") || t.includes("credit") || t.includes("oracle") || t.includes("pass"))) ||
    // 0G: "Receipts" is the API reference tab — excluded so grid shows there
    (workspace.id === "0g" && (t.includes("compute") || t.includes("inference") || t.includes("storage") || t.includes("trading") || t.includes("privacy") || t.includes("sovereign") || t.includes("tee") || t.includes("identity") || t.includes("agent"))) ||
    (workspace.id === "agora" && (t.includes("arbitrage") || t.includes("arb") || t.includes("portfolio") || t.includes("x402") || t.includes("circle") || t.includes("merchant") || t.includes("receipt") || t.includes("copy") || t.includes("reasoning") || t.includes("trace") || t.includes("signal") || t.includes("hub") || t.includes("kill") || t.includes("risk") || t.includes("usyc") || t.includes("yield") || t.includes("swap") || t.includes("app kit") || t.includes("kit"))) ||
    (workspace.id === "polygon" && (t.includes("merchant") || t.includes("mode") || t.includes("trade") || t.includes("finance") || t.includes("usdc") || t.includes("payment") || t.includes("remittance") || t.includes("overview") || t.includes("receipt") || t.includes("marketplace") || t.includes("agent")));

  const productCopy = productTabCopy(workspace, tabLabel, ttl, sub);

  return (
    <section className={"svc-tab" + (hasFlavor ? " svc-tab--product" : " svc-tab--api")}>
      {hasFlavor ? (
        <ProductTabHeader workspace={workspace} tabLabel={tabLabel} copy={productCopy} />
      ) : (
        <>
          <div className="pay-market-hero">
            <small>{workspace.shortName} · {tabLabel}</small>
            <h2>{ttl}</h2>
            <p>{sub}</p>
            <label>
              <Search size={17} />
              <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder={`Search ${tabLabel.toLowerCase()}…`} />
            </label>
          </div>

          <div className="svc-kpis">
            <div className="svc-kpi"><span className="svc-kpi__k">Endpoints</span><span className="svc-kpi__v">{scoped.length}</span><span className="svc-kpi__d">{tabCat ? `${tabCat} category` : `across ${workspace.shortName}`}</span></div>
            <div className="svc-kpi"><span className="svc-kpi__k">Calls · 7d</span><span className="svc-kpi__v">{wsReceipts7d.length.toLocaleString()}</span><span className="svc-kpi__d">confirmed · {workspace.shortName}</span></div>
            <div className="svc-kpi"><span className="svc-kpi__k">Avg price</span><span className="svc-kpi__v">${scopedAvg.toFixed(3)}</span><span className="svc-kpi__d">per request here</span></div>
            <div className="svc-kpi"><span className="svc-kpi__k">Settled here</span><span className="svc-kpi__v">{tabReceipts.length}</span><span className="svc-kpi__d">{scopedRevenue > 0 ? fmtUsd(scopedRevenue) + " total" : "no receipts yet"}</span></div>
          </div>
        </>
      )}

      {/* ── FUNCTIONAL ZONE — the page is built around what you can DO here ── */}

      {t.includes("escrow") && <InteractiveEscrow workspace={workspace} />}
      {workspace.id === "arbitrum" && t.includes("escrow") && <ArbitrumEscrowPanel workspace={workspace} />}
      {workspace.id === "arbitrum" && t.includes("escrow") && <ArbDisputePanel workspace={workspace} />}

      {(t.includes("strateg") || t.includes("sandbox")) && <BacktestRunner workspace={workspace} />}

      {workspace.id === "0g" && (t.includes("privacy") || t.includes("sovereign") || (variant === "verify" && !t.includes("pass") && !t.includes("rule") && !t.includes("risk"))) && (
        <OgPrivacyStepper workspace={workspace} />
      )}
      {workspace.id === "0g" && (t.includes("privacy") || t.includes("sovereign") || (variant === "verify" && !t.includes("pass") && !t.includes("rule") && !t.includes("risk"))) && (
        <SealedPayloadVault workspace={workspace} />
      )}
      {workspace.id === "0g" && (t.includes("privacy") || t.includes("tee") || t.includes("sovereign")) && (
        <ProofVerifier workspace={workspace} />
      )}

      {(t.includes("pass") || (variant === "verify" && !t.includes("rule") && !t.includes("risk") && !t.includes("privacy") && !t.includes("sovereign"))) && (
        <>
          <ProofVerifier workspace={workspace} />
          {workspace.id === "qie" ? <QiePassIssuer workspace={workspace} services={base} />
            : workspace.id === "0g" ? null
            : (
              <div className="panel block svc-flavor">
                <div className="block-head"><div className="ttl"><span className="sq soft"><Shield width={15} height={15} /></span><div><h3>Access rules</h3><div className="sub">who can call what, and the proof attached to each access</div></div></div></div>
                <ul className="svc-guarantees">
                  <li><Check width={13} height={13} /> Only addresses holding a valid pass / verified identity may call gated endpoints</li>
                  <li><Check width={13} height={13} /> Each access check is recorded as a single-use receipt with caller, endpoint and timestamp</li>
                  <li><Check width={13} height={13} /> Sealed request payloads are unsealed only for the matching receipt holder</li>
                  <li><Check width={13} height={13} /> Spend caps and allowlists are evaluated server-side before any payment clears</li>
                </ul>
              </div>
            )}
        </>
      )}

      {workspace.id === "0g" && (t.includes("compute") || t.includes("inference")) && <OgComputeCostChart workspace={workspace} />}
      {workspace.id === "0g" && (t.includes("compute") || t.includes("inference")) && <OgComputeKanban workspace={workspace} />}
      {(t.includes("compute") || t.includes("inference")) && <InferenceJobRunner workspace={workspace} />}
      {workspace.id === "0g" && (t.includes("compute") || t.includes("inference")) && <TeeAttestationVerifier workspace={workspace} />}

      {workspace.id === "0g" && t.includes("trading") && <OgAgentToAgentLoop workspace={workspace} />}
      {workspace.id === "0g" && t.includes("trading") && <OgTradingArenaWidget workspace={workspace} />}
      {workspace.id === "0g" && t.includes("agent") && <DiscoveryWidget />}
      {workspace.id === "0g" && t.includes("agent") && <MerchantWidget />}

      {t.includes("storage") && <StoragePinWidget workspace={workspace} />}
      {workspace.id === "0g" && t.includes("storage") && <DePinBulkPin workspace={workspace} />}
      {workspace.id === "0g" && t.includes("storage") && <OgAllowlistManager />}

      {t.includes("checkout") && <><CheckoutLinkBuilder workspace={workspace} /><SettlementSplitConfig workspace={workspace} /></>}
      {workspace.id === "qie" && t.includes("checkout") && <QiePosWidget workspace={workspace} />}
      {workspace.id === "qie" && t.includes("checkout") && <QieBillSplitter workspace={workspace} />}
      {workspace.id === "qie" && t.includes("checkout") && <QieRequestPay workspace={workspace} />}
      {workspace.id === "qie" && (t.includes("checkout") || t.includes("merchant")) && <QieSalesAnalytics workspace={workspace} />}

      {(t.includes("orbit") || t.includes("monitor")) && <OrbitMonitorPanel workspace={workspace} />}
      {workspace.id === "arbitrum" && (t.includes("orbit") || t.includes("monitor")) && <RobinhoodChainPanel workspace={workspace} />}

      {(t.includes("qiedex") || t.includes("dex")) && <SwapQuoteDesk workspace={workspace} />}

      {workspace.id === "qie" && (t.includes("gaming") || t.includes("game")) && <GameItemShop workspace={workspace} />}
      {workspace.id === "qie" && (t.includes("social") || t.includes("creator")) && <QieCreatorTipsWidget workspace={workspace} />}
      {workspace.id === "qie" && (t.includes("social") || t.includes("creator")) && <QieCreatorSubscriptions workspace={workspace} />}
      {workspace.id === "qie" && t.includes("wallet") && <QieWalletDashboard workspace={workspace} />}
      {workspace.id === "qie" && t.includes("merchant") && <><MerchantPayoutsPanel workspace={workspace} /></>}
      {workspace.id === "qie" && t.includes("oracle") && <QieOracleFeedWidget workspace={workspace} />}
      {workspace.id === "qie" && t.includes("credit") && <QieCreditWidget workspace={workspace} />}

      {workspace.id === "arbitrum" && (t.includes("stablecoin") || t.includes("payment") || t.includes("usdc")) && <ArbPaymentFlowDiagram />}
      {workspace.id === "arbitrum" && (t.includes("stablecoin") || t.includes("payment") || t.includes("usdc")) && <ArbAddressBook />}
      {workspace.id === "arbitrum" && (t.includes("stablecoin") || t.includes("payment") || t.includes("usdc")) && <UsdcTransferWidget workspace={workspace} />}
      {workspace.id === "arbitrum" && (t.includes("stablecoin") || t.includes("payment") || t.includes("usdc")) && <BatchPayoutConsole workspace={workspace} />}
      {workspace.id === "arbitrum" && (t.includes("stablecoin") || t.includes("payment") || t.includes("usdc")) && <ArbRecurringPayments workspace={workspace} />}
      {workspace.id === "arbitrum" && t.includes("agent") && <AgentServiceRegistry workspace={workspace} onOpenPayment={onOpenPayment} />}
      {workspace.id === "arbitrum" && (t.includes("agent") || t.includes("marketplace")) && <ArbBudgetPanel workspace={workspace} />}
      {workspace.id === "arbitrum" && (t.includes("agent") || t.includes("marketplace")) && <ArbOnChainRegistry workspace={workspace} />}
      {workspace.id === "arbitrum" && (t.includes("agent") || t.includes("marketplace")) && <DiscoveryWidget />}
      {workspace.id === "arbitrum" && t.includes("marketplace") && <MerchantWidget />}
      {workspace.id === "arbitrum" && (t.includes("stylus") || t.includes("rust") || t.includes("agent")) && <StylusSnippetViewer workspace={workspace} />}
      {workspace.id === "arbitrum" && (t.includes("intent") || t.includes("cross") || t.includes("agent") || t.includes("marketplace")) && <ErrorBoundary label="AgentIntent (ERC-7683)"><AgentIntentWidget /></ErrorBoundary>}
      {workspace.id === "arbitrum" && t.includes("stylus") && <ArbitrumStylusDeployPanel workspace={workspace} />}
      {workspace.id === "arbitrum" && t.includes("stylus") && <ArbContractPaymentSim workspace={workspace} />}
      {workspace.id === "arbitrum" && (t.includes("risk") || t.includes("rule") || t.includes("protection")) && <ArbAllowanceManager workspace={workspace} />}
      {workspace.id === "arbitrum" && (t.includes("risk") || t.includes("rule") || t.includes("protection")) && <SpendRulesEditor workspace={workspace} services={base} />}
      {workspace.id === "arbitrum" && (t.includes("risk") || t.includes("rule") || t.includes("protection") || t.includes("wallet")) && <ArbAgentReputation workspace={workspace} />}
      {workspace.id === "mantle" && t.includes("economy") && <MantleAgentEconomyDashboard workspace={workspace} />}
      {workspace.id === "mantle" && (t.includes("agent") || t.includes("marketplace") || t.includes("economy")) && <DiscoveryWidget />}
      {workspace.id === "mantle" && (t.includes("agent") || t.includes("marketplace")) && <MerchantWidget />}
      {workspace.id === "mantle" && t.includes("alpha") && <AlphaDesk workspace={workspace} />}
      {workspace.id === "mantle" && t.includes("alpha") && <Suspense fallback={null}><WhaleAlertFeed workspace={workspace} /></Suspense>}
      {workspace.id === "mantle" && (t.includes("meth") || t.includes("usdy") || (t.includes("yield") && !t.includes("alpha"))) && <MantleEarnCalc workspace={workspace} />}
      {workspace.id === "mantle" && (t.includes("meth") || t.includes("usdy") || (t.includes("yield") && !t.includes("alpha"))) && <MantlePortfolioRebalancer workspace={workspace} />}
      {workspace.id === "mantle" && (t.includes("meth") || t.includes("usdy") || (t.includes("yield") && !t.includes("alpha"))) && <YieldBoard workspace={workspace} />}
      {workspace.id === "mantle" && (t.includes("meth") || t.includes("usdy") || (t.includes("yield") && !t.includes("alpha"))) && <Suspense fallback={null}><YieldProjectionCalc workspace={workspace} /></Suspense>}
      {workspace.id === "mantle" && (t.includes("strateg") || t.includes("sandbox")) && <Suspense fallback={null}><StrategyDeployPanel workspace={workspace} /></Suspense>}
      {workspace.id === "mantle" && t.includes("rwa") && <RwaRegistry workspace={workspace} />}
      {workspace.id === "mantle" && (t.includes("devtool") || t.includes("dev tool")) && <MantleGasOptimizer workspace={workspace} />}
      {workspace.id === "mantle" && (t.includes("devtool") || t.includes("dev tool")) && <MantleDevToolsPanel workspace={workspace} />}
      {workspace.id === "mantle" && t.includes("credit") && <Suspense fallback={null}><CreditScoreMeter workspace={workspace} /></Suspense>}
      {workspace.id === "mantle" && t.includes("alpha") && <Suspense fallback={null}><AlphaBotWidget workspace={workspace} /></Suspense>}
      {workspace.id === "mantle" && t.includes("budget") && <Suspense fallback={null}><AgentBudgetDashboard workspace={workspace} /></Suspense>}
      {workspace.id === "mantle" && (t.includes("yield") || t.includes("compare")) && <Suspense fallback={null}><YieldComparisonWidget workspace={workspace} /></Suspense>}
      {workspace.id === "mantle" && (t.includes("a2a") || t.includes("loop")) && <Suspense fallback={null}><MantleA2ALoopWidget workspace={workspace} /></Suspense>}
      {workspace.id === "sui" && (t.includes("walrus") || t.includes("storage")) && <WalrusStorageWidget workspace={workspace} />}
      {workspace.id === "sui" && (t.includes("move") || t.includes("contracts")) && <MoveContractViewer workspace={workspace} />}
      {workspace.id === "sui" && (t.includes("nft") || t.includes("market")) && <SuiNftMarket workspace={workspace} />}
      {workspace.id === "sui" && (t.includes("wallet") || t.includes("agent")) && <><SuiAgentWalletPanel workspace={workspace} /><ZkLoginPanel workspace={workspace} /><SuiAgentEconomyLoop workspace={workspace} /></>}
      {workspace.id === "sui" && (t.includes("yield") || t.includes("escrow")) && <DeepBookYieldEscrow workspace={workspace} />}
      {workspace.id === "sui" && t.includes("arena") && <BattleArenaWidget workspace={workspace} />}
      {workspace.id === "sui" && (t.includes("pay widget") || t.includes("pay button") || t.includes("widget")) && <SuiPayButtonWidget workspace={workspace} />}
      {workspace.id === "sui" && (t.includes("memory") || t.includes("memory network")) && <AgentMemoryNetwork workspace={workspace} />}
      {workspace.id === "sui" && t.includes("intent") && <IntentEngineWidget workspace={workspace} />}
      {workspace.id === "sui" && t.includes("receipt") && <AgentNftReputation workspace={workspace} />}

      {workspace.id === "agora" && (t.includes("arbitrage") || t.includes("arb")) && <AgoraTradingWidget />}
      {workspace.id === "agora" && t.includes("portfolio") && <AgoraPortfolioWidget workspace={workspace} />}
      {workspace.id === "agora" && (t.includes("x402") && !t.includes("portfolio")) && <AgoraX402Widget workspace={workspace} />}
      {workspace.id === "agora" && t.includes("circle") && <><AgoraCircleToolsWidget workspace={workspace} /><AgoraCctpWidget workspace={workspace} /></>}
      {workspace.id === "agora" && t.includes("receipt") && (
        <div className="panel block svc-flavor">
          <div className="block-head"><div className="ttl"><span className="sq soft"><RIco width={15} height={15} /></span><div><h3>Payment receipts</h3><div className="sub">Arc payments settled via x402 · leaderboard below</div></div></div></div>
          {receipts.filter(r => r.workspaceId === workspace.id).length === 0 && <div className="muted sm" style={{ padding: "16px 20px" }}>No receipts yet — make a call to see payments here.</div>}
          <div className="svc-hist">
            {receipts.filter((r): r is Receipt => r.workspaceId === workspace.id).slice(0, 10).map((r) => (
              <div className="svc-hist__row" key={r.id}>
                <span className="svc-hist__dot" style={{ background: "#1fb58a" }} />
                <div className="svc-hist__main"><b>{r.serviceName}</b><span>{r.network} · {new Date(r.createdAt).toLocaleString()}</span></div>
                {badgeFor(r.status)}
                <span className="svc-hist__amt">{fmtUsd(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {workspace.id === "agora" && t.includes("receipt") && <AgoraLeaderboardWidget workspace={workspace} />}
      {workspace.id === "agora" && (t.includes("copy") || t.includes("copy trading")) && <ArcMindCopyTradingWidget workspace={workspace} />}
      {workspace.id === "agora" && (t.includes("reasoning") || t.includes("trace")) && <ArcMindReasoningWidget workspace={workspace} />}
      {workspace.id === "agora" && (t.includes("signal") || t.includes("hub")) && <ArcMindSignalHubWidget workspace={workspace} />}
      {workspace.id === "agora" && (t.includes("kill") || t.includes("risk")) && <ArcMindKillSwitchWidget workspace={workspace} />}
      {workspace.id === "agora" && (t.includes("signal") || t.includes("hub")) && (
        <div className="widget-card-grid-2">
          <ArcMindPnLWidget />
          <ArcMindDebateWidget />
        </div>
      )}
      {workspace.id === "agora" && (t.includes("signal") || t.includes("hub")) && <ArcDecisionLogWidget />}
      {workspace.id === "agora" && (t.includes("app kit") || t.includes("kit")) && <ArcAppKitWidget workspace={workspace} />}
      {workspace.id === "agora" && (t.includes("usyc") || t.includes("yield") || t.includes("swap")) && <ArcMindYieldWidget workspace={workspace} />}
      {workspace.id === "agora" && (t.includes("usyc") || t.includes("yield") || t.includes("swap")) && <ArcMindSwapWidget workspace={workspace} />}

      {workspace.id === "polygon" && (t.includes("merchant") || t.includes("mode")) && <PolygonMerchantOnboardingWidget workspace={workspace} />}
      {workspace.id === "polygon" && (t.includes("trade") || t.includes("finance")) && <PolygonTradeFinanceWidget workspace={workspace} />}
      {workspace.id === "polygon" && (t.includes("marketplace") || t.includes("agent")) && <PolygonAgentMarketplaceWidget workspace={workspace} />}
      {workspace.id === "polygon" && (t.includes("usdc") || t.includes("payment") || t.includes("remittance")) && <PolygonUsdcPaymentsWidget workspace={workspace} />}
      {workspace.id === "polygon" && t.includes("overview") && <PolygonStatsWidget workspace={workspace} />}
      {workspace.id === "polygon" && t.includes("receipt") && (
        <div className="panel block svc-flavor">
          <div className="block-head"><div className="ttl"><span className="sq soft"><RIco width={15} height={15} /></span><div><h3>Payment receipts</h3><div className="sub">all Polygon payments settled via x402</div></div></div></div>
          {receipts.filter(r => r.workspaceId === workspace.id).length === 0 && <div className="muted sm" style={{ padding: "16px 20px" }}>No receipts yet — make a call to see payments here.</div>}
          <div className="svc-hist">
            {receipts.filter((r): r is Receipt => r.workspaceId === workspace.id).slice(0, 20).map((r) => (
              <div className="svc-hist__row" key={r.id}>
                <span className="svc-hist__dot" style={{ background: "#1fb58a" }} />
                <div className="svc-hist__main"><b>{r.serviceName}</b><span>{r.network} · {new Date(r.createdAt).toLocaleString()}</span></div>
                {badgeFor(r.status)}
                <span className="svc-hist__amt">{fmtUsd(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasFlavor && <QuickCallPanel workspace={workspace} services={base} primary={base.find((s) => s.status === "active") ?? primary} onOpenPayment={onOpenPayment} receipts={receipts} />}

      {/* Endpoints grid — only on the designated API reference tab per workspace */}
      {!hasFlavor && (
        <div className="panel block" style={{ marginBottom: 18 }}>
          <div className="block-head">
            <div className="ttl"><span className="sq soft"><Bolt width={15} height={15} /></span><div><h3>{tabLabel} endpoints</h3><div className="sub">{tabCat ? `${tabCat} endpoints first` : "all endpoints"} · click Try to run the 402 → pay → unlock flow</div></div></div>
            <div className="row sm" style={{ gap: 6 }}>
              {["all", "GET", "POST"].map((mth) => (
                <button key={mth} className={"pill click" + (methodFilter === mth ? " on" : "")} type="button" onClick={() => setMethodFilter(mth)}>{mth === "all" ? "All" : mth}</button>
              ))}
            </div>
          </div>
          <div className="svc-ep-grid">
            {rows.map(({ s, method }) => {
              const Ico = CAT_ICON[s.category] ?? CAT_ICON.data;
              return (
                <div key={s.id} className="svc-ep-card">
                  <div className="svc-ep-card__top">
                    <span className="sq sm" style={{ background: catColor(s.category) }}><Ico width={13} height={13} /></span>
                    <div className="svc-ep-card__id"><b>{s.name}</b><code>{endpointPath(s)}</code></div>
                    <span className={`mth mth--${method.toLowerCase()}`}>{method}</span>
                  </div>
                  <div className="svc-ep-card__meta">
                    <span><b>${s.priceUsd.toFixed(3)}</b> {s.currency}</span>
                    <span>p95 {s.latency}</span>
                    <span>{s.calls.toLocaleString()} / 7d</span>
                    {badgeFor(s.status)}
                  </div>
                  <button
                    className={`btn btn-sm ${s.status === "active" ? "btn-acc" : ""}`}
                    type="button"
                    disabled={s.status !== "active"}
                    onClick={() => { if (s.status === "active") onOpenPayment(s); }}
                  >
                    {s.status === "active" ? <><Bolt width={12} height={12} /> Try · pay &amp; call</> : "Paused"}
                  </button>
                </div>
              );
            })}
            {rows.length === 0 && <div className="muted sm" style={{ padding: "10px 4px" }}>No endpoints match this filter.</div>}
          </div>
        </div>
      )}

      {hasFlavor ? (
        <ProductProofStrip workspace={workspace} scopedCount={scoped.length} receiptCount={tabReceipts.length} revenue={scopedRevenue} />
      ) : (
        <>
          {/* ── REFERENCE ── integrate / pricing / networks ── */}
          <div className="svc-tab__foot">
            <div className="panel block">
              <div className="block-head"><div className="ttl"><span className="sq soft"><Code width={15} height={15} /></span><div><h3>Integrate this endpoint</h3><div className="sub">{primary.name}</div></div></div></div>
              <div className="svc-foot__snip">
                <div className="svc-foot__snip-head"><span>cURL</span><CopyLine text={`curl -s https://gateway.tollgate.dev/${workspace.id}/${endpointPath(primary).split("/").pop()} \\\n  -H "X-Payment: $(tollgate pay ${primary.id})"`} /></div>
                <pre className="code-block">{`curl -s https://gateway.tollgate.dev/${workspace.id}/${endpointPath(primary).split("/").pop()} \\\n  -H "X-Payment: $(tollgate pay ${primary.id})"`}</pre>
              </div>
              <div className="svc-foot__snip">
                <div className="svc-foot__snip-head"><span>SDK</span><CopyLine text={`import { TollGate } from "@tollgate/sdk";\nconst ap = new TollGate({ wallet });\nconst res = await ap.call("${primary.id}", ${primary.sampleIn});`} /></div>
                <pre className="code-block">{`import { TollGate } from "@tollgate/sdk";\nconst ap = new TollGate({ wallet });\nconst res = await ap.call("${primary.id}", ${primary.sampleIn});`}</pre>
              </div>
            </div>

            <div className="panel block">
              <div className="block-head"><div className="ttl"><span className="sq soft"><CircleDollarSign width={15} height={15} /></span><div><h3>Pricing tiers</h3><div className="sub">per-call, billed against the agent budget</div></div></div></div>
              <div className="svc-table__scroll"><table className="svc-table">
                <thead><tr><th>Tier</th><th>Rate</th><th>Best for</th></tr></thead>
                <tbody>
                  <tr><td><b>Free</b></td><td className="svc-table__num">100 calls / mo</td><td className="muted">trying it out</td></tr>
                  <tr><td><b>Pro</b></td><td className="svc-table__num">${avgPrice.toFixed(3)} <span className="muted">/ call</span></td><td className="muted">pooled monthly billing</td></tr>
                  <tr><td><b>Scale</b></td><td className="svc-table__num">${(avgPrice * 0.7).toFixed(3)} <span className="muted">/ call</span></td><td className="muted">volume -30% · invoiced</td></tr>
                </tbody>
              </table></div>
            </div>

            <div className="panel block">
              <div className="block-head"><div className="ttl"><span className="sq soft"><Network width={15} height={15} /></span><div><h3>Networks &amp; contracts</h3><div className="sub">where settlement happens</div></div></div></div>
              <div className="svc-hist">
                {workspace.networks.map((n) => (
                  <div className="svc-hist__row" key={n}>
                    <span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} />
                    <div className="svc-hist__main"><b>{n}</b><span>x402 gateway live</span></div>
                    <span className="pill ok">active</span>
                  </div>
                ))}
                <div className="svc-hist__row">
                  <span className="svc-hist__dot" style={{ background: "var(--muted)" }} />
                  <div className="svc-hist__main"><b>Gateway</b><span><code>0x{fnvHex(`${workspace.id}-gw`)}…{fnvHex(`${workspace.id}-gw2`).slice(0, 4)}</code></span></div>
                </div>
                <div className="svc-hist__row">
                  <span className="svc-hist__dot" style={{ background: "var(--muted)" }} />
                  <div className="svc-hist__main"><b>Settlement</b><span><code>0x{fnvHex(`${workspace.id}-settle`)}…{fnvHex(`${workspace.id}-st2`).slice(0, 4)}</code></span></div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── INSIGHTS — collapsed by default so functional surfaces dominate; scoped to this tab ── */}
      {!hasFlavor && <details className="svc-insights">
        <summary>{tabLabel} insights — usage chart · {variant === "verify" ? "guarantees" : "recent activity"} · top callers (scoped to this tab)</summary>
        <div style={{ marginTop: 14 }}>
          <div className="svc-tab__foot">
            <div className="panel block">
              <div className="block-head"><div className="ttl"><span className="sq soft"><Bolt width={15} height={15} /></span><div><h3>Call volume — {tabLabel}</h3><div className="sub">last 7 days{tabCat ? ` · ${tabCat} endpoints` : ""}</div></div></div></div>
              <WeekBars data={weekData} avgLabel={`${(wsReceipts7d.length / 7).toFixed(1)}/day avg`} />
            </div>
            {variant === "verify" ? (
              <div className="panel block">
                <div className="block-head"><div className="ttl"><span className="sq soft"><Shield width={15} height={15} /></span><div><h3>Guarantees</h3><div className="sub">enforced server-side on every request</div></div></div></div>
                <ul className="svc-guarantees">{ENFORCED.map((r) => (<li key={r}><Check width={13} height={13} /> {r}</li>))}</ul>
              </div>
            ) : (
              <div className="panel block">
                <div className="block-head"><div className="ttl"><span className="sq soft"><RIco width={15} height={15} /></span><div><h3>Recent activity — {tabLabel}</h3><div className="sub">{tabReceipts.length > 0 ? `latest ${tabCat ?? ""} receipts` : "latest receipts in this workspace"}</div></div></div></div>
                <div className="svc-hist">
                  {tabRecent.length === 0 && <div className="muted sm">No activity yet — try an endpoint.</div>}
                  {tabRecent.map((r) => (
                    <div className="svc-hist__row" key={r.id}>
                      <span className="svc-hist__dot" style={{ background: catColor(serviceById(r.serviceId)?.category ?? "data") }} />
                      <div className="svc-hist__main"><b>{r.serviceName}</b><span>{r.agentName} · {ago(r.createdAt)}</span></div>
                      {badgeFor(r.status)}
                      <span className="svc-hist__amt">{r.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="panel block">
              <div className="block-head"><div className="ttl"><span className="sq soft"><Robot width={15} height={15} /></span><div><h3>Top callers — {tabLabel}</h3><div className="sub">agents driving traffic to these endpoints</div></div></div></div>
              <div className="svc-hist">
                {topCallers.map((c) => (
                  <div className="svc-hist__row" key={c.name}>
                    <span className="svc-hist__dot" style={{ background: "var(--accent-primary)" }} />
                    <div className="svc-hist__main"><b>{c.name}</b><span>{c.calls.toLocaleString()} calls</span></div>
                    <span className="svc-hist__amt">{fmtUsd(c.spend)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </details>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AGENTS
// ---------------------------------------------------------------------------

function AgentCard({ a, onTogglePause }: { a: Agent; onTogglePause: () => void }) {
  const status = a.status === "Ready" ? "active" : "paused";
  const pct = Math.min(100, (a.spentTodayUsd / a.dailyLimitUsd) * 100);
  return (
    <div className="svc">
      <div className="svc-top">
        <div className="left">
          <span className="sq lg" style={{ background: "var(--ink)" }}><Robot width={18} height={18} /></span>
          <div><h4>{a.name}</h4><div className="svc-cat">{a.wallet}</div></div>
        </div>
        {badgeFor(status)}
      </div>
      <div>
        <div className="spread" style={{ fontSize: 11.5, fontWeight: 600 }}><span className="muted">DAILY BUDGET</span><span className="num">${a.spentTodayUsd.toFixed(2)} / ${a.dailyLimitUsd.toFixed(2)}</span></div>
        <div className="pbar" style={{ marginTop: 6 }}><i style={{ width: `${pct}%`, background: pct > 80 ? "var(--red)" : "var(--acc-grad)" }} /></div>
      </div>
      <div className="io" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, whiteSpace: "normal" }}>
        <div><span className="k">max/req </span>${a.maxPerRequestUsd.toFixed(2)}</div>
        <div><span className="k">auto-pay </span>{a.autoPay ? "on" : "off"}</div>
        <div style={{ gridColumn: "1 / -1" }}><span className="k">allowlist </span>{a.allowlist.map((id) => serviceById(id)?.name ?? id).join(", ")}</div>
      </div>
      <div className="svc-foot">
        <div className="row sm muted" style={{ fontSize: 11, fontWeight: 600 }}>
          {a.autoPay ? <><Check width={12} height={12} style={{ color: "var(--green)" }} /> AUTO-SIGNS ≤ ${a.maxPerRequestUsd.toFixed(2)}</> : <><X width={12} height={12} style={{ color: "var(--red)" }} /> APPROVAL REQUIRED</>}
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onTogglePause}><Shield width={13} height={13} /> {a.status === "Ready" ? "Pause agent" : "Resume agent"}</button>
      </div>
    </div>
  );
}

function SpendWeekCard({ agent, workspace }: { agent: Agent; workspace: Workspace }) {
  const data = SVC_WEEK.map((label, i) => ({
    label,
    value: Math.round(hashPct(`${workspace.id}|${agent.id}|spend|${i}`, 0.05, 1) * agent.dailyLimitUsd * 100) / 100,
  }));
  const total = data.reduce((s, x) => s + x.value, 0);
  return (
    <div className="svc">
      <div className="svc-top">
        <div className="left">
          <span className="sq lg" style={{ background: "var(--accent-primary)" }}><Bolt width={18} height={18} /></span>
          <div><h4>Spend this week</h4><div className="svc-cat">{agent.name}</div></div>
        </div>
        <span className="pill ok">{fmtUsd(total)}</span>
      </div>
      <WeekBars data={data} avgLabel={`${fmtUsd(total / 7)}/day avg · cap ${fmtUsd(agent.dailyLimitUsd)}`} />
      <div className="io" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, whiteSpace: "normal" }}>
        <div><span className="k">today </span>{fmtUsd(agent.spentTodayUsd)}</div>
        <div><span className="k">weekly cap </span>{fmtUsd(agent.dailyLimitUsd * 7)}</div>
      </div>
    </div>
  );
}

function NewAgentCard({ workspace }: { workspace: Workspace }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="svc svc--ghost"
      onClick={() => { setDone(true); setTimeout(() => setDone(false), 2200); }}
      style={{ textAlign: "left", cursor: "pointer" }}
    >
      <span className="sq lg" style={{ background: "var(--surface-3)", color: "var(--accent-primary)" }}>
        {done ? <Check width={18} height={18} /> : <Plus width={18} height={18} />}
      </span>
      <h4 style={{ marginTop: 10 }}>{done ? "Agent draft created" : "New agent"}</h4>
      <p className="muted sm" style={{ margin: "4px 0 0" }}>
        {done
          ? `A new agent for ${workspace.shortName} was queued — set its budget, allowlist and auto-pay cap to activate it.`
          : "Spin up another agent with its own budget, allowlist and per-request cap."}
      </p>
      <span className="row sm muted" style={{ marginTop: "auto", fontSize: 11, fontWeight: 700 }}>
        <Plus width={12} height={12} /> {done ? "OPEN DRAFT" : "ADD AGENT"}
      </span>
    </button>
  );
}

const ENFORCED = [
  "price ≤ maxPerRequestUsd",
  "spentToday + price ≤ dailyLimitUsd",
  "serviceId ∈ allowedServiceIds",
  "agent.status === active",
  "challenge not expired",
  "network matches service network",
  "payment proof is single-use",
  "recipient matches provider wallet",
];




export function AgentsPage({ agent, workspace, tabLabel, onTogglePause }: { agent: Agent; workspace: Workspace; tabLabel: string; onTogglePause: () => void }) {
  return (
    <>
      <LedeHead crumb={`${workspace.id} workspace · ${tabLabel.toLowerCase()}`} title="Agents & budget policy">
        An agent can never spend more than its policy allows: a per-request cap, a daily budget, an allowlist of services and an
        emergency pause. The gateway enforces all of it server-side — the client is never trusted.
      </LedeHead>
      <WalletLiveStrip />
      <div className="svc-grid svc-grid--3 mb">
        <AgentCard a={agent} onTogglePause={onTogglePause} />
        <SpendWeekCard agent={agent} workspace={workspace} />
        <NewAgentCard workspace={workspace} />
      </div>
      {workspace.id === "0g" && <OgBudgetControllerWidget workspace={workspace} />}
      {workspace.id === "0g" && <AgentIdRegistry workspace={workspace} />}
      {workspace.id === "0g" && <RevenueSplitConsole workspace={workspace} />}

      {workspace.id === "0g" && <OpenClawSkillConsole workspace={workspace} />}
      {workspace.id === "0g" && <ErrorBoundary label="A2A Marketplace"><A2AMarketplaceWidget /></ErrorBoundary>}
      {workspace.id === "0g" && <BudgetWidget />}
      {workspace.id === "0g" && <AgentScoreCard agentId="agent_0g_strategist" />}
      {workspace.id === "arbitrum" && <BudgetWidget agentId="agent_arb_worker" />}
      {workspace.id === "qie" && <AgentWalletConsole workspace={workspace} />}
      {workspace.id === "mantle" && <MantleAgentIdentity workspace={workspace} />}
      {workspace.id === "mantle" && <MantleVaultPanel workspace={workspace} />}
      {workspace.id === "mantle" && <MantleBudgetPanel workspace={workspace} />}
      {workspace.id === "mantle" && <MantleEconomyLoop workspace={workspace} />}
      {workspace.id === "mantle" && <ErrorBoundary label="AgentCreditLine"><Suspense fallback={null}><AgentCreditLine workspace={workspace} /></Suspense></ErrorBoundary>}
      {workspace.id === "mantle" && <AgentScoreCard agentId="agent_mantle_strategist" />}
      <div className="panel block" style={{ marginTop: 16 }}>
        <div className="block-head"><div className="ttl"><span className="sq soft"><Shield width={15} height={15} /></span><div><h3>Enforced on every paid request</h3><div className="sub">server-side — frontend is never the source of truth</div></div></div></div>
        <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10 }}>
          {ENFORCED.map((r) => (
            <li key={r} className="row sm" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
              <Check width={13} height={13} style={{ color: "var(--acc)", flex: "none" }} /> {r}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// RECEIPTS
// ---------------------------------------------------------------------------

function ReceiptRow({ r, onClick, active }: { r: Receipt; onClick?: () => void; active?: boolean }) {
  const cat = serviceById(r.serviceId)?.category ?? "data";
  const Ico = CAT_ICON[cat] ?? CAT_ICON.data;
  return (
    <div
      className="log-row"
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : undefined,
        background: active ? "var(--blue-100)" : undefined,
        paddingLeft: active ? 8 : undefined,
        paddingRight: active ? 8 : undefined,
        borderRadius: active ? 9 : undefined,
      }}
    >
      <span className="sq sm" style={{ background: catColor(cat) }}><Ico width={12} height={12} /></span>
      <div className="lr-main">
        <b>{r.serviceName}</b>
        <div className="lr-sub">{r.agentName} → {r.providerWallet} · {r.network} · {ago(r.createdAt)}</div>
      </div>
      {badgeFor(r.status)}
      <span className="lr-amt">{r.amount.toFixed(2)} <span className="muted" style={{ fontWeight: 500, fontSize: 11 }}>{r.currency}</span></span>
    </div>
  );
}

const RECEIPT_FILTERS: (ReceiptStatus | "all")[] = ["all", "verified", "paid", "failed", "replayed", "expired"];

const W1 = "0x0E437c109A4C1e15172c4dA557E77724D7243F71";
const W2 = "0xF4BFd93061B160Fa376c7F66De207a00225B4e70";
const t = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const h = () => "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
const OG_DEMO_RECEIPTS: Receipt[] = [
  { id: "rcpt_0g_d01", workspaceId: "0g", serviceId: "svc_0g_inference", serviceName: "0G Inference Risk Report",    agentName: "0G Compute Agent", payerWallet: W1, providerWallet: W2,  amount: 0.030, currency: "USDC", network: "0g-galileo", txHash: h(), status: "verified", createdAt: t(3),   kind: "0g.inference",    payload: { model: "risk-scorer-v2", attestationId: "att_0g_3f9c2a", response: '{"riskScore":41,"label":"low"}' } },
  { id: "rcpt_0g_d02", workspaceId: "0g", serviceId: "svc_0g_storage",   serviceName: "0G Storage Memory Write",    agentName: "0G Compute Agent", payerWallet: W1, providerWallet: W1,  amount: 0.020, currency: "USDC", network: "0g-galileo", txHash: h(), status: "verified", createdAt: t(11),  kind: "0g.storage.pin",  payload: { root: "0x9f2c8b4e1d3a7f60aa91bc54de2081cf44e3d0b", size: 3072, merkleComputed: true, onChain: true } },
  { id: "rcpt_0g_d03", workspaceId: "0g", serviceId: "svc_0g_inference", serviceName: "Trading Arena · ETH/USDC",   agentName: "0G Compute Agent", payerWallet: W1, providerWallet: W2,  amount: 0.030, currency: "USDC", network: "0g-galileo", txHash: h(), status: "verified", createdAt: t(24),  kind: "0g.trading.signal", payload: { pair: "ETH/USDC", signal: "BUY", confidence: 87, sealed: true } },
  { id: "rcpt_0g_d04", workspaceId: "0g", serviceId: "svc_0g_dav",       serviceName: "0G DA Verify",               agentName: "0G Compute Agent", payerWallet: W1, providerWallet: W2,  amount: 0.015, currency: "USDC", network: "0g-galileo", txHash: h(), status: "verified", createdAt: t(38),  kind: "0g.da.verify",    payload: { segment: 7, ok: true, root: "0x77da11c2e4a3f90b" } },
  { id: "rcpt_0g_d05", workspaceId: "0g", serviceId: "svc_0g_context",   serviceName: "0G Privacy · TEE Execution", agentName: "0G Compute Agent", payerWallet: W1, providerWallet: W2,  amount: 0.018, currency: "USDC", network: "0g-galileo", txHash: h(), status: "verified", createdAt: t(55),  kind: "0g.privacy.tee",  payload: { attestationId: "att_0g_e20f91", teeQuote: "SGX_QUOTE:v3·E20F91·verified" } },
  { id: "rcpt_0g_d06", workspaceId: "0g", serviceId: "svc_0g_batch",     serviceName: "0G Compute Batch Job",       agentName: "0G Compute Agent", payerWallet: W1, providerWallet: W1,  amount: 0.090, currency: "USDC", network: "0g-galileo", txHash: h(), status: "paid",     createdAt: t(72),  kind: "0g.inference",    payload: { model: "risk-scorer-v2", prompts: 24, batchId: "batch_0g_31a", avgMs: 608 } },
  { id: "rcpt_0g_d07", workspaceId: "0g", serviceId: "svc_0g_storage",   serviceName: "0G Storage Memory Write",    agentName: "0G Compute Agent", payerWallet: W1, providerWallet: W1,  amount: 0.020, currency: "USDC", network: "0g-galileo", txHash: h(), status: "verified", createdAt: t(94),  kind: "0g.storage.pin",  payload: { root: "0x2d9e4c1b8a7f3e06c55d1b09ea4720fc1a2b3c4d", size: 8192 } },
  { id: "rcpt_0g_d08", workspaceId: "0g", serviceId: "svc_0g_inference", serviceName: "0G Inference Risk Report",   agentName: "0G Compute Agent", payerWallet: W1, providerWallet: W2,  amount: 0.030, currency: "USDC", network: "0g-galileo", txHash: h(), status: "verified", createdAt: t(130), kind: "0g.inference",    payload: { model: "wallet-labeler", attestationId: "att_0g_7d4c01", response: '{"label":"defi-power-user","score":91}' } },
];

export function ReceiptsPage({ receipts, workspace, tabLabel }: { receipts: Receipt[]; workspace: Workspace; tabLabel: string }) {
  const [filter, setFilter] = useState<ReceiptStatus | "all">("all");
  const [sel, setSel] = useState<Receipt | null>(null);
  const all = useMemo(() => {
    const ws = receipts.filter((r) => r.workspaceId === workspace.id);
    if (ws.length === 0 && workspace.id === "0g") return OG_DEMO_RECEIPTS;
    return ws;
  }, [receipts, workspace.id]);
  const rows = useMemo(() => all.filter((r) => filter === "all" || r.status === filter), [all, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [all]);
  const revenue = all.filter((r) => r.status === "verified" || r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const failed = (counts.failed ?? 0) + (counts.replayed ?? 0) + (counts.expired ?? 0);

  return (
    <>
      <LedeHead crumb={`${workspace.id} workspace · ${tabLabel.toLowerCase()}`} title="Receipts & usage">
        Every paid request leaves an immutable receipt: payer, provider, amount, network, tx hash and verification status.
        Failed payments stay visible; replay attempts are logged.
      </LedeHead>

      <div className="metrics mb">
        <div className="metric"><div className="label">Revenue (verified)</div><div className="v">${revenue.toFixed(2)}</div><div className="sub">{(counts.verified ?? 0) + (counts.paid ?? 0)} verified payments</div></div>
        <div className="metric"><div className="label">Receipts</div><div className="v">{all.length}</div><div className="sub">all statuses</div></div>
        <div className="metric"><div className="label">Failed</div><div className="v" style={{ color: failed ? "var(--red)" : undefined }}>{failed}</div><div className="sub">funds / expiry / replay</div></div>
        <div className="metric"><div className="label">Replay attempts</div><div className="v">{counts.replayed ?? 0}</div><div className="sub">blocked at gateway</div></div>
      </div>

      <div className="row wrap mb" style={{ gap: 8 }}>
        {RECEIPT_FILTERS.map((f) => (
          <button key={f} className={"pill click" + (filter === f ? " on" : "")} onClick={() => setFilter(f)} type="button">
            {f === "all" ? "ALL" : f.toUpperCase()} <span style={{ opacity: 0.6 }}>{f === "all" ? all.length : counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid-2">
        <div className="panel block">
          <div className="block-head"><div className="ttl"><span className="sq soft"><RIco width={15} height={15} /></span><div><h3>Ledger</h3><div className="sub">{rows.length} receipts</div></div></div></div>
          {rows.length === 0 ? (
            <div className="empty"><div className="ttl">Nothing here</div><div>No receipts match this filter.</div></div>
          ) : (
            <div className="log">{rows.map((r) => <ReceiptRow key={r.id} r={r} onClick={() => setSel(r)} active={sel?.id === r.id} />)}</div>
          )}
        </div>

        <div className="panel block">
          <div className="block-head"><div className="ttl"><span className="sq soft"><LinkIco width={15} height={15} /></span><h3>Receipt</h3></div>{sel ? badgeFor(sel.status) : null}</div>
          {!sel ? (
            <div className="empty">Select a receipt to inspect it.</div>
          ) : (
            <div className="receipt-paper zig">
              <div className="spread"><span className="label">TOLLGATE · RECEIPT</span><span className="num muted" style={{ fontSize: 12 }}>{sel.id}</span></div>
              <hr className="line" />
              <div className="kv"><span className="k">Service</span><span className="v">{sel.serviceName}</span></div>
              <div className="kv"><span className="k">Workspace</span><span className="v">{sel.workspaceId}</span></div>
              <div className="kv"><span className="k">Agent</span><span className="v">{sel.agentName}</span></div>
              <div className="kv"><span className="k">Payer</span><span className="v" title={sel.payerWallet} style={{ display: "flex", alignItems: "center", gap: 5 }}>{sel.payerWallet.length > 20 ? sel.payerWallet.slice(0, 10) + "…" + sel.payerWallet.slice(-6) : sel.payerWallet}<button type="button" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0, color: "inherit", opacity: .5 }} title="Copy address" onClick={() => navigator.clipboard?.writeText(sel.payerWallet).catch(() => {})}><Copy width={11} height={11} /></button></span></div>
              <div className="kv"><span className="k">Provider</span><span className="v" title={sel.providerWallet} style={{ display: "flex", alignItems: "center", gap: 5 }}>{sel.providerWallet.length > 20 ? sel.providerWallet.slice(0, 10) + "…" + sel.providerWallet.slice(-6) : sel.providerWallet}<button type="button" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0, color: "inherit", opacity: .5 }} title="Copy address" onClick={() => navigator.clipboard?.writeText(sel.providerWallet).catch(() => {})}><Copy width={11} height={11} /></button></span></div>
              <div className="kv"><span className="k">Network</span><span className="v">{sel.network}</span></div>
              {(() => {
                const payload = sel.payload as Record<string, unknown> | undefined;
                const onchainTx = payload?.["onchainTxHash"] ?? payload?.["anchorTx"] ?? payload?.["txHash"];
                const realTx = typeof onchainTx === "string" && onchainTx.startsWith("0x") ? onchainTx : null;
                const txUrl = typeof payload?.["explorerUrl"] === "string" ? payload["explorerUrl"] : realTx ? explorerTxForNetwork(sel.network, realTx) : null;
                return realTx ? (
                  <div className="kv"><span className="k">Anchor tx</span>{txUrl ? <a className="v" href={txUrl} target="_blank" rel="noreferrer" style={{ color: "#2f6bff", textDecoration: "underline" }}>{realTx.slice(0, 10)}…{realTx.slice(-4)} ↗</a> : <span className="v">{realTx.slice(0, 10)}…{realTx.slice(-4)}</span>}</div>
                ) : sel.txHash ? (
                  <div className="kv"><span className="k">Tx hash</span><span className="v" title={sel.txHash} style={{ color: "#9a9a9a", fontWeight: 600 }}>{sel.txHash.length > 20 ? sel.txHash.slice(0, 14) + "…" : sel.txHash} · demo</span></div>
                ) : null;
              })()}
              {sel.errorCode ? <div className="kv"><span className="k">Error</span><span className="v" style={{ color: "var(--red)" }}>{sel.errorCode}</span></div> : null}
              <div className="kv"><span className="k">Created</span><span className="v">{new Date(sel.createdAt).toLocaleString()}</span></div>
              <hr className="line" />
              <div className="spread" style={{ alignItems: "baseline" }}><span className="label">Amount</span><span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{sel.amount.toFixed(2)} <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{sel.currency}</span></span></div>
              <hr className="line" />
              <div className="row sm" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".03em", color: "#7a7a7a", lineHeight: 1.5 }}>
                {(() => {
                  const payload = sel.payload as Record<string, unknown> | undefined;
                  const onchainTx = payload?.["onchainTxHash"] ?? payload?.["anchorTx"] ?? payload?.["txHash"];
                  const realTx = typeof onchainTx === "string" && onchainTx.startsWith("0x");
                  return realTx
                    ? <><Check width={12} height={12} style={{ color: "var(--green)" }} /> ANCHORED ON {sel.network.toUpperCase()} · PROOF SINGLE-USE</>
                    : <><Check width={12} height={12} style={{ color: "#d98f1c" }} /> DEMO RECEIPT · SIMULATED x402 HANDSHAKE — anchor it on-chain with the “Anchor on 0G” button on the Storage / Compute widgets</>;
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
      {workspace.id === "0g" && <OgMultiSigApprove workspace={workspace} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// GATEWAY / SDK PAGE
// ---------------------------------------------------------------------------

const SDK_SNIPPET = `import { TollGateClient } from "tollgate-sdk";

const client = new TollGateClient({
  agentId: "agent_yield_researcher",
  wallet: agentWallet,
  policy: {
    maxPerRequestUsd: 0.25,
    dailyLimitUsd: 10,
    allowedServiceIds: ["svc_wallet_risk"],
  },
});

// 1. Agent calls the paid endpoint
// 2. Gateway returns 402 Payment Required + challenge
// 3. SDK checks policy, pays if price ≤ maxPerRequestUsd
// 4. Gateway verifies proof → returns protected response + receiptId

const result = await client.fetchPaid(
  "https://tollgate.app/api/gateway/svc_wallet_risk",
  { query: { address: "0x91…", chain: "arbitrum" } },
);

console.log(result.data);      // { riskScore: 82, summary: "…" }
console.log(result.receiptId); // "rcpt_abc123"`;

const CHALLENGE_EXAMPLE = `HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": "payment_required",
  "challenge": {
    "challengeId": "ch_8f2a1b",
    "serviceId": "svc_wallet_risk",
    "amount": "0.05",
    "currency": "USDC",
    "network": "base-sepolia",
    "payTo": "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
    "expiresAt": "2026-05-11T14:00:00Z",
    "requestHash": "0x3f8c…"
  }
}`;

const PAID_REQUEST_EXAMPLE = `GET /api/gateway/svc_wallet_risk HTTP/1.1
X-Agent-Id: agent_yield_researcher
X-Payment-Challenge: ch_8f2a1b
X-Payment-Proof: 0xSig…

→ 200 OK
{
  "data": { "riskScore": 82, "summary": "…" },
  "receiptId": "rcpt_abc123"
}`;

const FLOW_STEPS = [
  { n: "1", label: "Agent calls paid endpoint", note: "No special headers — agent doesn't know price yet" },
  { n: "402", label: "Gateway returns Payment Required", note: "Challenge includes amount, network, provider wallet, expiry, request hash" },
  { n: "2", label: "SDK checks agent policy", note: "price ≤ maxPerRequestUsd? serviceId ∈ allowlist? budget left?" },
  { n: "3", label: "Agent pays via stablecoin / x402", note: "On-chain or facilitator-routed; proof is single-use" },
  { n: "4", label: "Agent retries with payment proof", note: "X-Payment-Challenge + X-Payment-Proof headers" },
  { n: "5", label: "Gateway verifies proof", note: "Checks recipient, amount, network, challenge binding, replay" },
  { n: "6", label: "Protected response + receipt", note: "Data unlocked. Receipt saved. Usage dashboard updated." },
];

// ---------------------------------------------------------------------------
// LIVE GATEWAY — talks to the real ../server (x402 over HTTP). Falls back to a
// note when the server isn't running; the in-app PaymentModal stays the demo path.
// ---------------------------------------------------------------------------

type LiveStep = "idle" | "pinging" | "loading-services" | "ready" | "unpaid" | "paying" | "unlocked" | "offline";

function LiveGatewayPanel({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [step, setStep] = useState<LiveStep>("pinging");
  const [services, setServices] = useState<api.ServerService[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [challenge, setChallenge] = useState<api.X402Challenge | null>(null);
  const [unlocked, setUnlocked] = useState<api.UnlockedResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selected = services.find((s) => s.id === selectedId) ?? null;

  const reload = useCallback(async () => {
    setErr(null); setChallenge(null); setUnlocked(null);
    setStep("pinging");
    const up = await api.ping();
    if (!up) { setStep("offline"); return; }
    setStep("loading-services");
    try {
      const r = await api.listServices(workspace.id);
      setServices(r.services);
      setSelectedId((prev) => (r.services.some((s) => s.id === prev) ? prev : r.services[0]?.id ?? ""));
      setStep("ready");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed to load services");
      setStep("offline");
    }
  }, [workspace.id]);

  useEffect(() => { void reload(); }, [reload]);

  const sendUnpaid = async () => {
    if (!selectedId) return;
    setErr(null); setUnlocked(null);
    setStep("unpaid");
    try {
      const r = await api.gatewayUnpaid(selectedId);
      setChallenge(r.challenge);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "request failed");
      setStep("ready");
    }
  };

  const payAndRetry = async () => {
    if (!selectedId) return;
    setErr(null);
    setStep("paying");
    try {
      const r = await api.gatewayPay(selectedId);
      setUnlocked(r);
      setStep("unlocked");
      // Mirror the server receipt into the in-app ledger so it shows in Payments/Receipts.
      emitReceipt({
        workspaceId: workspace.id,
        serviceId: r.serviceId,
        serviceName: r.name,
        amount: r.receipt.amount,
        currency: r.receipt.currency,
        network: r.receipt.network,
        agentName: r.receipt.agentId,
        payerWallet: r.receipt.payerWallet,
        providerWallet: r.receipt.providerWallet,
        kind: "x402.live",
        status: (r.receipt.status as Receipt["status"]) ?? "verified",
        payload: { challengeId: r.receipt.challengeId, requestHash: r.receipt.requestHash, serverReceiptId: r.receiptId, data: r.data },
      });
    } catch (e) {
      const ex = e as { status?: number; body?: unknown };
      setErr(ex?.body ? JSON.stringify(ex.body) : e instanceof Error ? e.message : "payment failed");
      setStep("unpaid");
    }
  };

  const reset = () => { setChallenge(null); setUnlocked(null); setErr(null); setStep("ready"); };

  if (step === "offline" || (!api.API_ENABLED)) {
    return (
      <div className="panel block mb">
        <div className="block-head"><div className="ttl"><span className="sq soft"><Zap width={15} height={15} /></span><div><h3>Live gateway</h3><div className="sub">real x402 over HTTP — server offline</div></div></div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void reload()}>Retry</button></div>
        <div className="gw-note">
          <Shield width={14} height={14} />
          <span>
            The local <code>server/</code> isn't reachable{api.API_ENABLED ? <> at <code>{api.API_BASE}</code></> : <> (<code>VITE_API_BASE</code> is empty)</>}. Start it with{" "}
            <code>cd server &amp;&amp; npm install &amp;&amp; npm run dev</code> to see a real <code>402 Payment Required</code> handshake.
            Until then the in-app PaymentModal simulation below is used.
          </span>
        </div>
        {err && <pre className="code-block" style={{ marginTop: 10, color: "var(--red)" }}>{err}</pre>}
      </div>
    );
  }

  const busy = step === "pinging" || step === "loading-services" || step === "paying";

  return (
    <div className="panel block mb">
      <div className="block-head"><div className="ttl"><span className="sq soft"><Zap width={15} height={15} /></span><div><h3>Live gateway</h3><div className="sub">real x402 over HTTP · <code>{api.API_BASE}</code></div></div></div>
        <span className="row sm" style={{ gap: 6 }}>
          <span className="badge ok" style={{ fontSize: 11 }}>server up</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void reload()}>Reload</button>
        </span>
      </div>

      <div className="row sm" style={{ gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <label className="row sm" style={{ gap: 6, fontSize: 12 }}>
          <span style={{ color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", fontSize: 10 }}>Service</span>
          <select value={selectedId} onChange={(e) => { setSelectedId(e.currentTarget.value); reset(); }} disabled={busy}
            style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: 12, maxWidth: 320 }}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} — ${s.priceUsd} {s.currency}</option>)}
          </select>
        </label>
        <button className="btn btn-ghost btn-sm" type="button" onClick={sendUnpaid} disabled={busy || !selectedId}>
          <X width={12} height={12} /> Send unpaid request
        </button>
        <button className="btn btn-acc btn-sm" type="button" onClick={payAndRetry} disabled={busy || !selectedId}>
          {step === "paying" ? <><Loader2 width={12} height={12} className="wallet-spin" /> Paying…</> : <><Check width={12} height={12} /> Pay &amp; retry (dev-bypass)</>}
        </button>
      </div>

      {selected && (
        <div className="row sm" style={{ gap: 8, fontSize: 12, color: "var(--muted)", marginBottom: 10, flexWrap: "wrap" }}>
          <code>GET {api.API_BASE}{selected.gatewayUrl}</code> · {selected.category} · {selected.network} · {selected.description}
        </div>
      )}

      {challenge && !unlocked && (
        <div className="panel block" style={{ marginBottom: 10 }}>
          <div className="block-head"><div className="ttl"><span className="sq soft"><X width={14} height={14} /></span><div><h4 style={{ margin: 0 }}>HTTP 402 Payment Required</h4><div className="sub">the gateway's unpaid response — copy the challenge, pay, retry with <code>X-PAYMENT</code></div></div></div></div>
          <pre className="code-block">{JSON.stringify({ x402Version: 1, error: "payment_required", challenge }, null, 2)}</pre>
        </div>
      )}

      {unlocked && (
        <div className="panel block" style={{ marginBottom: 10 }}>
          <div className="block-head"><div className="ttl"><span className="sq soft" style={{ color: "var(--green)" }}><Check width={14} height={14} /></span><div><h4 style={{ margin: 0 }}>200 OK · unlocked</h4><div className="sub">receipt <code>{unlocked.receiptId}</code> · mirrored into the receipts ledger</div></div></div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(unlocked, null, 2)).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>
              {copied ? <><Check width={12} height={12} /> Copied</> : <><Copy width={12} height={12} /> Copy</>}
            </button>
          </div>
          <pre className="code-block">{JSON.stringify({ data: unlocked.data, receiptId: unlocked.receiptId, receipt: unlocked.receipt, note: unlocked.note }, null, 2)}</pre>
        </div>
      )}

      {err && <pre className="code-block" style={{ color: "var(--red)" }}>{err}</pre>}

      <div className="gw-note">
        <Shield width={14} height={14} />
        <span>
          This calls the real <code>server/</code> — <code>{api.API_BASE}/api/gateway/&lt;id&gt;</code>. The challenge is single-use, bound to a request hash, and expires in 5&nbsp;min;
          replays return <code>402 challenge_invalid</code>. <code>dev-bypass</code> stands in for a settled stablecoin payment in dev — production verifies a real on-chain proof.
        </span>
      </div>
    </div>
  );
}

export function GatewayPage({ workspace, tabLabel }: { workspace: Workspace; tabLabel: string }) {
  const [tab, setTab] = useState<"flow" | "sdk">("flow");
  const tl = tabLabel.toLowerCase();
  const bespoke =
    tl.includes("playground") ? <PlaygroundInspector />
    : null;
  const head = bespoke
    ? { t: "402 Playground", d: <>Fire a paid tool call and watch every step of the <b>402 → pay → verify → unlock</b> flow — the same handshake every endpoint in this product uses.</> }
    : { t: "x402 Gateway", d: <>The gateway is the heart of TollGate. Every paid API call goes through the same handshake:{" "}<b>402 Payment Required → agent pays → gateway verifies → data unlocks</b>. The core flow is identical across all workspaces; only the network adapter changes.</> };
  return (
    <>
      <LedeHead crumb={`${workspace.id} workspace · ${tabLabel.toLowerCase()}`} title={head.t}>
        {head.d}
      </LedeHead>

      {bespoke}

      {bespoke && <div className="gw-divider"><span>Reference: the protocol underneath</span></div>}

      <LiveGatewayPanel workspace={workspace} />

      <div className="seg mb" style={{ display: "inline-flex" }}>
        <button type="button" className={tab === "flow" ? "on" : ""} onClick={() => setTab("flow")}>Protocol flow</button>
        <button type="button" className={tab === "sdk" ? "on" : ""} onClick={() => setTab("sdk")}>SDK</button>
      </div>

      {tab === "flow" ? (
        <>
          <div className="panel block mb">
            <div className="block-head"><div className="ttl"><span className="sq soft"><Zap width={15} height={15} /></span><div><h3>Request / payment cycle</h3><div className="sub">same flow for every workspace and network</div></div></div></div>
            <div className="gw-steps">
              {FLOW_STEPS.map((s) => (
                <div key={s.n} className="gw-step">
                  <div className="gw-step__num">{s.n}</div>
                  <div>
                    <div className="gw-step__label">{s.label}</div>
                    <div className="gw-step__note">{s.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid-2 mb">
            <div className="panel block">
              <div className="block-head"><div className="ttl"><span className="sq soft"><X width={15} height={15} /></span><div><h3>402 challenge</h3><div className="sub">unpaid request response</div></div></div></div>
              <pre className="code-block">{CHALLENGE_EXAMPLE}</pre>
            </div>
            <div className="panel block">
              <div className="block-head"><div className="ttl"><span className="sq soft"><Check width={15} height={15} /></span><div><h3>Paid request</h3><div className="sub">agent retries with proof</div></div></div></div>
              <pre className="code-block">{PAID_REQUEST_EXAMPLE}</pre>
            </div>
          </div>

          <div className="panel block mb">
            <div className="block-head"><div className="ttl"><span className="sq soft"><Shield width={15} height={15} /></span><div><h3>Security guarantees</h3><div className="sub">gateway enforces all of these</div></div></div></div>
            <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
              {[
                "Challenge expires after a short window",
                "Challenge is bound to the request hash",
                "Challenge bound to service ID + amount",
                "Payment amount ≥ required amount",
                "Recipient must match provider wallet",
                "Network must match service network",
                "Proof cannot be replayed (single-use)",
                "Frontend is never the source of truth",
              ].map((r) => (
                <li key={r} className="row sm" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  <Check width={13} height={13} style={{ color: "var(--acc)", flex: "none" }} /> {r}
                </li>
              ))}
            </ul>
          </div>

          <div className="gw-note mb">
            <Shield width={14} height={14} />
            <span><b>Demo facilitator mode:</b> this workspace simulates the 402 handshake. The production path is designed for x402 facilitator verification.</span>
          </div>
        </>
      ) : (
        <>
          <div className="panel block mb">
            <div className="block-head"><div className="ttl"><span className="sq soft"><Code width={15} height={15} /></span><div><h3>TypeScript SDK</h3><div className="sub">install: npm i tollgate-sdk</div></div></div>
              <CopyButton text={SDK_SNIPPET} /></div>
            <pre className="code-block">{SDK_SNIPPET}</pre>
          </div>

          <div className="panel block mb">
            <div className="block-head"><div className="ttl"><span className="sq soft"><Globe width={15} height={15} /></span><div><h3>Middleware (Express / Hono)</h3><div className="sub">protect any existing endpoint</div></div></div></div>
            <pre className="code-block">{`import { x402Middleware } from "tollgate-sdk/middleware";

app.use("/api/premium", x402Middleware({
  serviceId: "svc_wallet_risk",
  priceUsd: 0.05,
  currency: "USDC",
  network: "base-sepolia",
  settleTo: process.env.PROVIDER_WALLET,
}));

app.get("/api/premium/wallet-risk", (req, res) => {
  // only reached after verified payment
  res.json({ riskScore: 82, summary: "…" });
});`}</pre>
          </div>

          <div className="grid-2 mb">
            <div className="panel block">
              <div className="block-head"><div className="ttl"><span className="sq soft"><Shield width={15} height={15} /></span><h3>Policy config</h3></div></div>
              <pre className="code-block">{`{
  "agentId": "agent_yield_researcher",
  "dailyLimitUsd": 10,
  "maxPerRequestUsd": 0.25,
  "allowedServiceIds": [
    "svc_wallet_risk",
    "svc_yield_signal"
  ],
  "networks": ["base-sepolia"],
  "autoPay": true
}`}</pre>
            </div>
            <div className="panel block">
              <div className="block-head"><div className="ttl"><span className="sq soft"><RIco width={15} height={15} /></span><h3>Receipt response</h3></div></div>
              <pre className="code-block">{`{
  "data": {
    "riskScore": 82,
    "summary": "High exposure…"
  },
  "receiptId": "rcpt_abc123",
  "verifiedAt": "2026-05-11T13:45:01Z",
  "network": "base-sepolia",
  "txHash": "0x3f8c…"
}`}</pre>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="btn btn-ghost btn-sm" type="button" onClick={() => {
      navigator.clipboard?.writeText(text).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }}>
      {copied ? <><Check width={12} height={12} /> Copied</> : <><Copy width={12} height={12} /> Copy</>}
    </button>
  );
}

// ---------------------------------------------------------------------------

export function WorkspaceDashboard({
  agent,
  paidServiceIds,
  receipts,
  services,
  theme,
  tweakStyle,
  workspace,
  onAddService,
  onAskAI,
  onBack,
  onOpenPayment,
  onToggleTheme,
}: WorkspaceDashboardProps) {
  const railItems = useMemo(() => buildRail(workspace), [workspace]);
  const defaultIndex = useMemo(() => {
    const cat = railItems.findIndex((it) => it.kind === "catalogue" || it.kind === "service");
    return cat >= 0 ? cat : 0;
  }, [railItems]);
  const [activeIndex, setActiveIndex] = useState<ProductRailIndex>(defaultIndex);
  const [agentPaused, setAgentPaused] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const safeIndex = activeIndex < railItems.length ? activeIndex : 0;
  const activeRailItem = railItems[safeIndex] ?? railItems[0];
  const activeTab = activeRailItem.label;
  const kind: RailKind = activeRailItem.kind;
  const initials = agent.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const effectiveAgent = agentPaused ? { ...agent, status: "Paused" as const } : agent;
  const workspaceReceiptCount = receipts.filter((receipt) => workspace.id === receipt.workspaceId).length;

  const goByKind = (...kinds: RailKind[]): boolean => {
    for (const k of kinds) {
      const i = railItems.findIndex((it) => it.kind === k);
      if (i >= 0) { setActiveIndex(i); return true; }
    }
    return false;
  };

  const goToReceipts = () => { goByKind("receipts", "overview"); };

  const goTab = (matcher: string): boolean => {
    const needle = matcher.toLowerCase();
    const idx = railItems.findIndex((item, i) => i !== safeIndex && item.label.toLowerCase().includes(needle));
    if (idx >= 0) { setActiveIndex(idx); return true; }
    if (["wallet", "agent", "budget", "policy", "companion"].some((w) => needle.includes(w))) return goByKind("agents");
    if (["payment", "receipt", "approval"].some((w) => needle.includes(w))) return goByKind("receipts");
    if (["gateway", "explainer", "debugger", "playground", "sdk"].some((w) => needle.includes(w))) return goByKind("gateway", "service", "catalogue");
    if (["privacy", "verif", "compliance", "proof"].some((w) => needle.includes(w))) return goByKind("verify", "service");
    if (["market", "catalog"].some((w) => needle.includes(w))) return goByKind("catalogue", "service");
    if (["data", "checkout", "trading", "compute", "storage", "analy", "tax", "service", "report"].some((w) => needle.includes(w))) return goByKind("service", "catalogue");
    return false;
  };

  return (
    <section className="dashboard-screen pay-stage">
      <aside className="ws-nav" aria-label="Workspace navigation">
        <button className="ws-rail__brand" type="button" onClick={onBack} aria-label="All workspaces">
          <span className="ws-mark" aria-hidden="true"><span /></span>
          <span className="ws-rail__tip">All workspaces</span>
        </button>
        <nav className="ws-rail__nav" aria-label="Workspace tabs">
          {railItems.map(({ label, Icon }, index) => (
            <button
              key={`r-${label}-${index}`}
              type="button"
              aria-label={label}
              className={"ws-rail__item" + (index === safeIndex ? " is-active" : "")}
              onClick={() => setActiveIndex(index)}
            >
              <Icon size={20} />
              <span className="ws-rail__tip">{label}</span>
            </button>
          ))}
        </nav>
        <button
          className="ws-rail__item ws-rail__theme"
          type="button"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          <span className="ws-rail__tip">{theme === "dark" ? "Light theme" : "Dark theme"}</span>
        </button>
        <button className="ws-rail__avatar" type="button" aria-label={agent.name} onClick={onAskAI}>
          <span>{initials || "AP"}</span><i />
          <span className="ws-rail__tip">{agent.name}</span>
        </button>
      </aside>

      <main className="dashboard-main pay-panel">
        <header className="dashboard-topbar pay-topbar">
          <div className="pay-page-heading">
            <small>{activeTab}</small>
            <h1>Welcome back, builder.</h1>
          </div>
          <div className="pay-topbar__actions">
            <button className="pay-gateway-pill" type="button" onClick={onAskAI}>
              <span />
              Gateway online · {workspaceReceiptCount.toLocaleString()} paid
            </button>
            <ConnectWalletButton compact />
            <button className="pay-avatar" type="button" aria-label={agent.name}><span>{initials || "AP"}</span></button>
          </div>
        </header>

        <div className="ap402" style={tweakStyle}>
          {kind === "overview" ? (
            <OverviewPage agent={effectiveAgent} receipts={receipts} services={services} workspace={workspace} onGoTab={goTab} onOpenPayment={onOpenPayment} onGoReceipts={goToReceipts} />
          ) : kind === "receipts" ? (
            <ReceiptsPage receipts={receipts} workspace={workspace} tabLabel={activeTab} />
          ) : kind === "agents" ? (
            <AgentsPage agent={effectiveAgent} workspace={workspace} tabLabel={activeTab} onTogglePause={() => setAgentPaused((p) => !p)} />
          ) : kind === "gateway" ? (
            <GatewayPage workspace={workspace} tabLabel={activeTab} />
          ) : kind === "service" || kind === "verify" ? (
            <ServiceTabPage services={services} workspace={workspace} tabLabel={activeTab} receipts={receipts} variant={kind === "verify" ? "verify" : "service"} onOpenPayment={onOpenPayment} />
          ) : (
            <CataloguePage agent={effectiveAgent} paidServiceIds={paidServiceIds} services={services} workspace={workspace} tabLabel={activeTab} onOpenPayment={onOpenPayment} onCreateOpen={() => setCreateOpen(true)} />
          )}
          <div className="act-foot" style={{ marginTop: 30 }}>
            <a href="https://help.circle.com" target="_blank" rel="noreferrer"><HelpCircle size={14} style={{ verticalAlign: "-2px" }} /> Help</a>
            <a href="https://www.circle.com/en/legal/privacy-policy" target="_blank" rel="noreferrer">Privacy</a>
            <a href="https://www.circle.com/en/legal/usdc-terms" target="_blank" rel="noreferrer">Terms</a>
            <a href="https://developers.circle.com/cctp" target="_blank" rel="noreferrer">Fees</a>
          </div>
        </div>
      </main>

      {createOpen ? (
        <CreateServiceModal
          workspace={workspace}
          onClose={() => setCreateOpen(false)}
          onAdd={(s) => { onAddService(s); }}
        />
      ) : null}
    </section>
  );
}
