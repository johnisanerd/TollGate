export { InferenceJobRunner } from "../../components/widgets/zero-g/InferenceJobRunner";
export { ProofVerifier } from "../../components/widgets/zero-g/ProofVerifier";
export { StoragePinWidget } from "../../components/widgets/zero-g/StoragePinWidget";
export { OpenClawSkillConsole, TeeAttestationVerifier, DePinBulkPin } from "../../components/widgets/og-extra/OgExtraWidgets";
export { OgIntegrationStatus } from "../../components/widgets/og-extra/OgIntegrationStatus";
export { SealedPayloadVault } from "./inline-widgets";

import type { ReactNode } from "react";
import type { Service, Workspace } from "../../types";
import type { Receipt } from "../../types";
import type { SigBlock, CardDef, CardCtx, TabMeta, TabCtx } from "../_types";
import { DiscoveryWidget } from "../../components/widgets/DiscoveryWidget";
import { MerchantWidget } from "../../components/widgets/MerchantWidget";
import { SealedPayloadVault } from "./inline-widgets";
import { Bolt, Database, Shield, Robot, Code, Receipt as RIco } from "../../icons402";
import { InferenceJobRunner } from "../../components/widgets/zero-g/InferenceJobRunner";
import { StoragePinWidget } from "../../components/widgets/zero-g/StoragePinWidget";
import { ProofVerifier } from "../../components/widgets/zero-g/ProofVerifier";
import { OpenClawSkillConsole, TeeAttestationVerifier, DePinBulkPin } from "../../components/widgets/og-extra/OgExtraWidgets";
import { OgIntegrationStatus } from "../../components/widgets/og-extra/OgIntegrationStatus";
import { useNetworkMode } from "../../hooks/useNetworkMode";
import { EcosystemLinksPanel } from "../../components/ui/EcosystemLinksPanel";
import {
  OgComputeCostChart,
  OgStorageEstimator,
  OgComputeKanban,
  OgPrivacyStepper,
  OgAgentToAgentLoop,
  OgTradingArenaWidget,
  OgSocialFeedWidget,
  AgentIdRegistry,
  RevenueSplitConsole,
  OgLiveContractsPanel,
  LiveWalletBalance,
  OgDaMonitor,
  OgGasFeeEstimator,
  OgAllowlistManager,
  OgComputeLeaderboard,
  OgJobScheduler,
  OgSlashingAlert,
  OgNetworkTopology,
  OgBlockExplorerEmbed,
  OgMultiSigApprove,
  OgBudgetControllerWidget,
  OgStorageHistory,
} from "./inline-widgets";

export const signature: SigBlock = {
  title: "0G network at a glance",
  sub: "the four layers your endpoints settle against",
  headers: ["Layer", "Role", "Throughput", "Status"],
  rows: [
    ["0G Compute", "inference jobs", "612 jobs/min", "healthy"],
    ["0G Storage", "memory & blobs", "2.1k pins/min", "healthy"],
    ["0G DA", "data availability", "44 MB/s", "healthy"],
    ["0G Chain", "receipts & settlement", "1.4s blocks", "healthy"],
  ],
  accentCol: 3,
};

export function cards({ onGoTab, onOpenPayment, wsReceipts, def, onGoReceipts }: CardCtx & { onGoReceipts: () => void }): CardDef[] {
  return [
    { light: true, ico: Bolt, title: "Run an inference job", sub: "pay per token · Risk Scorer · Llama 3 · Anomaly", onClick: () => { if (def) onOpenPayment(def); } },
    { ico: Database, title: "Pin a memory blob to 0G Storage", sub: "SHA-256 hash · verifiable reference", onClick: () => onGoTab("storage") },
    { ico: Shield, title: "Verify a receipt proof", sub: "single-use · replay-safe · sealed", onClick: () => onGoTab("privacy") },
    { ico: Robot, title: "Manage agent budgets & allowlist", sub: "0G Compute Agent · daily cap $8.00", onClick: () => onGoTab("agent") },
    { ico: Code, title: "0G x402 SDK & gateway docs", sub: "cURL · TypeScript · Python adapters", onClick: () => onGoTab("gateway") || onGoTab("privacy") },
    { ico: RIco, title: "View all receipts", sub: `${wsReceipts.length} paid jobs on record`, onClick: () => onGoReceipts() },
  ];
}

export function renderTab(t: string, workspace: Workspace, _receipts: Receipt[], _onOpenPayment: (s: Service) => void): ReactNode | null {
  const nodes: ReactNode[] = [];
  if (t.includes("compute") || t.includes("inference")) {
    nodes.push(<OgSocialFeedWidget key="social" workspace={workspace} />);
    nodes.push(<OgNetworkTopology key="topology" />);
    nodes.push(<OgGasFeeEstimator key="gas" />);
    nodes.push(<OgComputeCostChart key="costchart" workspace={workspace} />);
    nodes.push(<InferenceJobRunner key="inference" workspace={workspace} />);
    nodes.push(<OgComputeKanban key="kanban" workspace={workspace} />);
    nodes.push(<TeeAttestationVerifier key="tee" workspace={workspace} />);
    nodes.push(<OgDaMonitor key="da" />);
    nodes.push(<OgComputeLeaderboard key="leaderboard" />);
    nodes.push(<OgJobScheduler key="scheduler" workspace={workspace} />);
  }
  if (t.includes("storage")) {
    nodes.push(<OgStorageEstimator key="storagecalc" />);
    nodes.push(<StoragePinWidget key="storage" workspace={workspace} />);
    nodes.push(<DePinBulkPin key="depin" workspace={workspace} />);
    nodes.push(<OgStorageHistory key="history" workspace={workspace} />);
  }
  if (t.includes("privacy") || t.includes("tee") || t.includes("sovereign")) {
    nodes.push(<OgPrivacyStepper key="stepper" workspace={workspace} />);
    nodes.push(<ProofVerifier key="proof" workspace={workspace} />);
  }
  if (t.includes("trading")) {
    nodes.push(<OgAgentToAgentLoop key="a2a" workspace={workspace} />);
    nodes.push(<OgTradingArenaWidget key="arena" workspace={workspace} />);
  }
  if (t.includes("agent") || t.includes("identity")) {
    nodes.push(<LiveWalletBalance key="wallet" />);
    nodes.push(<OgBudgetControllerWidget key="budget" workspace={workspace} />);
    nodes.push(<AgentIdRegistry key="identity" workspace={workspace} />);
    nodes.push(<OgAllowlistManager key="allowlist" />);
  }
  if (t.includes("receipt")) {
    nodes.push(<ProofVerifier key="proof" workspace={workspace} />);
    nodes.push(<RevenueSplitConsole key="revenue" workspace={workspace} />);
    nodes.push(<OgMultiSigApprove key="multisig" workspace={workspace} />);
  }
  return nodes.length > 0 ? <>{nodes}</> : null;
}

export function renderAgentExtra(workspace: Workspace): ReactNode | null {
  return (
    <>
      <LiveWalletBalance />
      <OgMultiSigApprove workspace={workspace} />
      <OgAllowlistManager />

      <OpenClawSkillConsole workspace={workspace} />
      <AgentIdRegistry workspace={workspace} />
      <RevenueSplitConsole workspace={workspace} />
    </>
  );
}

function OgEcosystemLinks() {
  const { mode } = useNetworkMode("0g");
  const isTestnet = mode === "testnet";
  const groups = isTestnet ? [
    { title: "Explorer", items: [{ label: "Galileo Testnet Explorer", url: "https://chainscan-galileo.0g.ai" }] },
    { title: "Faucet", items: [{ label: "0G Testnet Faucet", url: "https://faucet.0g.ai" }] },
    { title: "Storage", items: [{ label: "Storage Indexer", url: "https://indexer-storage-turbo.0g.ai" }, { label: "StorageScan", url: "https://storagescan-galileo.0g.ai" }] },
    { title: "Compute", items: [{ label: "0G Compute Portal", url: "https://0g.ai" }, { label: "Docs", url: "https://docs.0g.ai" }] },
  ] : [
    { title: "Explorer", items: [{ label: "Galileo Testnet Explorer", url: "https://chainscan-galileo.0g.ai" }] },
    { title: "Storage", items: [{ label: "Storage Indexer", url: "https://indexer-storage-turbo.0g.ai" }, { label: "StorageScan", url: "https://storagescan.0g.ai" }] },
    { title: "Compute", items: [{ label: "0G Compute Portal", url: "https://0g.ai" }, { label: "Docs", url: "https://docs.0g.ai" }] },
    { title: "Bridge & Ecosystem", items: [{ label: "0G Bridge", url: "https://bridge.0g.ai" }, { label: "0G DApp Hub", url: "https://hub.0g.ai" }] },
  ];
  return <EcosystemLinksPanel groups={groups} network={isTestnet ? "0G Testnet · Galileo" : "0G Galileo · chainId 16602"} accent="#3b82f6" />;
}

export function renderOverviewExtra(_workspace: Workspace, _onGoTab: (t: string) => boolean, _onGoReceipts: () => void): ReactNode | null {
  return (
    <>
      <OgSlashingAlert />
      <OgBlockExplorerEmbed />
      <OgLiveContractsPanel />
      <OgEcosystemLinks />
    </>
  );
}

// ── renderTabContent ──────────────────────────────────────────────────────────
export function renderTabContent(tab: string, ctx: TabCtx): ReactNode {
  const { workspace } = ctx;
  const t = tab.toLowerCase();
  const nodes: ReactNode[] = [];

  // privacy / sovereign / TEE
  if (t.includes("privacy") || t.includes("sovereign")) {
    nodes.push(<OgPrivacyStepper key="stepper" workspace={workspace} />);
    nodes.push(<SealedPayloadVault key="sealvault" workspace={workspace} />);
  }
  if (t.includes("privacy") || t.includes("tee") || t.includes("sovereign")) {
    nodes.push(<ProofVerifier key="proof" workspace={workspace} />);
  }

  // compute / inference
  if (t.includes("compute") || t.includes("inference")) {
    nodes.push(<OgComputeCostChart key="costchart" workspace={workspace} />);
    nodes.push(<OgComputeKanban key="kanban" workspace={workspace} />);
    nodes.push(<TeeAttestationVerifier key="tee" workspace={workspace} />);
  }

  // trading
  if (t.includes("trading")) {
    nodes.push(<OgAgentToAgentLoop key="a2a" workspace={workspace} />);
    nodes.push(<OgTradingArenaWidget key="arena" workspace={workspace} />);
  }

  // agent
  if (t.includes("agent")) {
    nodes.push(<DiscoveryWidget key="discovery" workspaceId={workspace.id} />);
    nodes.push(<MerchantWidget key="merchant" />);
  }

  // storage
  if (t.includes("storage")) {
    nodes.push(<DePinBulkPin key="depin" workspace={workspace} />);
    nodes.push(<OgAllowlistManager key="allowlist" />);
  }

  return nodes.length > 0 ? <>{nodes}</> : null;
}

// ── Tab metadata ──────────────────────────────────────────────────────────────
export function tabMeta(tab: string): TabMeta | null {
  const t = tab.toLowerCase();
  if (t.includes("identity") || t.includes("agent"))
    return { title: "Agent identity and authority", sub: "Register agent identity, set budget authority and connect it to paid compute/storage actions.", intent: "Identity", proof: "agent registry" };
  if (t.includes("compute") || t.includes("inference"))
    return { title: "0G compute job console", sub: "Run inference jobs, compare cost, track queue state and verify execution metadata.", intent: "Compute", proof: "job receipt" };
  if (t.includes("trading"))
    return { title: "0G trading arena", sub: "Use 0G compute as the arena where agents generate, compare and settle market signals.", intent: "Agent market", proof: "A2A loop" };
  if (t.includes("storage"))
    return { title: "0G storage memory layer", sub: "Pin agent memory, manage allowlists and prove which data was stored or retrieved.", intent: "Storage", proof: "content hash" };
  if (t.includes("privacy") || t.includes("tee") || t.includes("sovereign"))
    return { title: "TEE privacy proof flow", sub: "Seal payloads, run private execution and unseal only with matching receipt proof.", intent: "Privacy", proof: "attestation" };
  return null;
}
