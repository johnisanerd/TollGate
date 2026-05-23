import type { ReactNode } from "react";
import type { Service, Workspace } from "../../types";
import type { Receipt } from "../../types";
import { SuiDemoFlow, SuiLiveContractsPanel } from "./inline-widgets";
import { useNetworkMode } from "../../hooks/useNetworkMode";
import { EcosystemLinksPanel } from "../../components/ui/EcosystemLinksPanel";
import type { SigBlock, CardDef, CardCtx, TabMeta, TabCtx } from "../_types";
import { Bolt, Code, Star, Robot, Shield, Receipt as RIco } from "../../icons402";
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
} from "../../components/widgets/sui/SuiWidgets";

export {
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
};

export const signature: SigBlock = {
  title: "Sui agent economy",
  sub: "Walrus storage, Move contracts, NFT passes and zkLogin on Sui mainnet",
  headers: ["Layer", "Role", "Volume 24h", "Status"],
  rows: [
    ["Walrus Storage", "blob pinning & retrieval", "2,840 blobs", "healthy"],
    ["Move VM", "PTB execution & dry-run", "1,120 txs", "healthy"],
    ["Kiosk / NFT", "agent passes & access NFTs", "620 mints", "healthy"],
    ["zkLogin", "OAuth-to-Sui proofs", "1,100 proofs", "healthy"],
  ],
  accentCol: 3,
};

export function cards({ onGoTab, onOpenPayment: _onOpenPayment, wsReceipts, def: _def, onGoReceipts }: CardCtx): CardDef[] {
  return [
    { light: true, ico: Bolt, title: "Pin a blob to Walrus storage", sub: "decentralised · epoch-based · verifiable", onClick: () => { onGoTab("walrus") || onGoTab("storage"); } },
    { ico: Code, title: "Execute a Move PTB", sub: "dry-run or live · programmable tx blocks", onClick: () => { onGoTab("move") || onGoTab("contracts"); } },
    { ico: Star, title: "Mint an agent NFT pass", sub: "Kiosk-compatible · tier-gated access", onClick: () => { onGoTab("nft") || onGoTab("market"); } },
    { ico: Shield, title: "Generate a zkLogin proof", sub: "OAuth → Sui wallet · no seed phrase", onClick: () => { onGoTab("wallet") || onGoTab("agent"); } },
    { ico: Robot, title: "Sui Economy Agent settings", sub: "daily limit $10 · auto-pay on", onClick: () => { onGoTab("agent"); } },
    { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} Sui payments`, onClick: () => { onGoReceipts(); } },
  ];
}

export function renderTab(t: string, workspace: Workspace, _receipts: Receipt[], _onOpenPayment: (s: Service) => void): ReactNode | null {
  const tl = t.toLowerCase();
  if (tl.includes("walrus") || tl.includes("storage")) return <WalrusStorageWidget workspace={workspace} />;
  if (tl.includes("move") || tl.includes("contracts")) return <MoveContractViewer workspace={workspace} />;
  if (tl.includes("nft") || tl.includes("market")) return <SuiNftMarket workspace={workspace} />;
  if (tl.includes("wallet") || tl.includes("agent")) return <><SuiAgentWalletPanel workspace={workspace} /><ZkLoginPanel workspace={workspace} /><SuiAgentEconomyLoop workspace={workspace} /></>;
  if (tl.includes("yield") || tl.includes("escrow")) return <DeepBookYieldEscrow workspace={workspace} />;
  if (tl.includes("arena")) return <BattleArenaWidget workspace={workspace} />;
  if (tl.includes("pay widget") || tl.includes("pay button") || tl.includes("widget")) return <SuiPayButtonWidget workspace={workspace} />;
  if (tl.includes("memory") || tl.includes("memory network")) return <AgentMemoryNetwork workspace={workspace} />;
  if (tl.includes("intent")) return <IntentEngineWidget workspace={workspace} />;
  if (tl.includes("receipt")) return <AgentNftReputation workspace={workspace} />;
  return null;
}

export function renderTabContent(tab: string, ctx: TabCtx): ReactNode {
  const { workspace } = ctx;
  const t = tab.toLowerCase();
  const nodes: ReactNode[] = [];

  if (t.includes("walrus") || t.includes("storage")) nodes.push(<WalrusStorageWidget key="walrus" workspace={workspace} />);
  if (t.includes("move") || t.includes("contracts")) nodes.push(<MoveContractViewer key="move" workspace={workspace} />);
  if (t.includes("nft") || t.includes("market")) nodes.push(<SuiNftMarket key="nft" workspace={workspace} />);
  if (t.includes("wallet") || t.includes("agent")) {
    nodes.push(<SuiAgentWalletPanel key="wallet" workspace={workspace} />);
    nodes.push(<ZkLoginPanel key="zklogin" workspace={workspace} />);
    nodes.push(<SuiAgentEconomyLoop key="economy" workspace={workspace} />);
  }
  if (t.includes("yield") || t.includes("escrow")) nodes.push(<DeepBookYieldEscrow key="yield" workspace={workspace} />);
  if (t.includes("arena")) nodes.push(<BattleArenaWidget key="arena" workspace={workspace} />);
  if (t.includes("pay widget") || t.includes("pay button") || t.includes("widget")) nodes.push(<SuiPayButtonWidget key="pay" workspace={workspace} />);
  if (t.includes("memory") || t.includes("memory network")) nodes.push(<AgentMemoryNetwork key="memory" workspace={workspace} />);
  if (t.includes("intent")) nodes.push(<IntentEngineWidget key="intent" workspace={workspace} />);
  if (t.includes("receipt")) nodes.push(<AgentNftReputation key="nft-rep" workspace={workspace} />);

  return nodes.length > 0 ? <>{nodes}</> : null;
}

export function renderAgentExtra(_workspace: Workspace): ReactNode | null {
  return null;
}

function SuiEcosystemLinks() {
  const { mode } = useNetworkMode("sui");
  const isTestnet = mode === "testnet";
  const groups = isTestnet ? [
    { title: "Explorer", items: [{ label: "Sui Testnet Explorer", url: "https://suiscan.xyz/testnet" }, { label: "SuiVision Testnet", url: "https://testnet.suivision.xyz" }] },
    { title: "Faucet", items: [{ label: "Sui Testnet Faucet", url: "https://faucet.sui.io" }] },
    { title: "Walrus", items: [{ label: "Walrus Testnet", url: "https://walrus.space" }] },
  ] : [
    { title: "Explorer", items: [{ label: "Suiscan", url: "https://suiscan.xyz" }, { label: "SuiVision", url: "https://suivision.xyz" }] },
    { title: "Swap", items: [{ label: "Cetus DEX", url: "https://app.cetus.zone" }, { label: "Aftermath Finance", url: "https://aftermath.finance" }] },
    { title: "DeepBook", items: [{ label: "DeepBook v3 Docs", url: "https://docs.deepbook.tech" }] },
    { title: "Walrus & Seal", items: [{ label: "Walrus", url: "https://walrus.space" }, { label: "Sui Seal", url: "https://docs.sui.io/concepts/cryptography/seal" }] },
  ];
  return <EcosystemLinksPanel groups={groups} network={isTestnet ? "Sui Testnet" : "Sui Mainnet"} accent="#6FBCF0" />;
}

export function renderOverviewExtra(workspace: Workspace, onGoTab: (t: string) => boolean, onGoReceipts: () => void): ReactNode | null {
  return (
    <>
      <SuiDemoFlow workspace={workspace} onGoTab={onGoTab} onGoReceipts={onGoReceipts} />
      <SuiLiveContractsPanel />
      <SuiEcosystemLinks />
    </>
  );
}

// ── Tab metadata ──────────────────────────────────────────────────────────────
export function tabMeta(tab: string): TabMeta | null {
  const t = tab.toLowerCase();
  if (t.includes("walrus") || t.includes("storage"))
    return { title: "Walrus storage workflow", sub: "Store assets and agent memory, then verify object references and payment state.", intent: "Storage", proof: "object proof" };
  if (t.includes("move") || t.includes("contracts"))
    return { title: "Move contract workspace", sub: "Inspect Move contract flows and payment hooks in the context of agent actions.", intent: "Contracts", proof: "module view" };
  if (t.includes("nft") || t.includes("market"))
    return { title: "Sui NFT market flow", sub: "List, buy and evaluate NFT actions through agent-controlled payment and reputation.", intent: "Market", proof: "NFT action" };
  if (t.includes("wallet") || t.includes("agent"))
    return { title: "Sui agent wallet", sub: "Control agent wallet state, zkLogin, approvals and economy loop from one place.", intent: "Wallet", proof: "wallet policy" };
  if (t.includes("yield") || t.includes("escrow"))
    return { title: "DeepBook yield escrow", sub: "Preview yield and escrow actions before an agent commits funds.", intent: "Yield", proof: "escrow state" };
  if (t.includes("arena"))
    return { title: "Battle arena", sub: "Let agents compete, spend and earn with visible rules and result receipts.", intent: "Game economy", proof: "match result" };
  if (t.includes("pay widget") || t.includes("pay button") || t.includes("widget"))
    return { title: "Sui pay widget", sub: "Configure a payment widget as the entry point for user-facing agent commerce.", intent: "Payments", proof: "widget config" };
  if (t.includes("memory"))
    return { title: "Agent memory network", sub: "Connect memory records, ownership and retrieval to usable agent workflows.", intent: "Memory", proof: "memory graph" };
  if (t.includes("intent"))
    return { title: "Intent engine", sub: "Translate user intent into executable agent steps with explicit constraints.", intent: "Intent", proof: "intent plan" };
  if (t.includes("receipt"))
    return { title: "Reputation receipts", sub: "Turn completed actions into reputation evidence that users can inspect.", intent: "Reputation", proof: "NFT receipt" };
  return null;
}
