import { getAddress } from "ethers";

export type ArcReadinessStatus = "ready_onchain" | "ready_paper" | "needs_decisions";
export type ArcReadinessSeverity = "required" | "launch" | "traction" | "onchain";

export type ArcReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  severity: ArcReadinessSeverity;
  weight: number;
  detail: string;
  fix?: string;
};

export type ArcReadinessReport = {
  status: ArcReadinessStatus;
  score: number;
  checks: ArcReadinessCheck[];
  missing: string[];
  recommendedActions: string[];
};

export type ArcReadinessInput = {
  env: Record<string, string | undefined>;
  x402PayoutAddress?: string;
  x402Network?: string;
  deployedContracts?: {
    registry?: string | null;
    escrow?: string | null;
    controlLayer?: {
      agentTreasury?: string | null;
      strategyVault?: string | null;
      riskGuard?: string | null;
      receiptRegistry?: string | null;
    } | null;
  };
  decisions: unknown[];
  receipts: Array<{ serviceId?: string }>;
  stats: { testers?: number; connectedWallets?: number; feedbackCount?: number };
  agoraServiceCount: number;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function isAddress(value?: string | null) {
  if (!value || value.toLowerCase() === ZERO_ADDRESS) return false;
  try {
    getAddress(value);
    return true;
  } catch {
    return false;
  }
}

function envSet(env: Record<string, string | undefined>, key: string) {
  return Boolean(env[key]?.trim());
}

function actionFor(check: ArcReadinessCheck) {
  if (check.ok) return null;
  return check.fix ?? `Configure ${check.label}.`;
}

export function buildArcReadinessReport(input: ArcReadinessInput): ArcReadinessReport {
  const hasPortfolioReceipt = input.receipts.some((receipt) => receipt.serviceId === "svc_arc_copytrade");
  const hasTraction = Boolean(
    (input.stats.testers ?? 0) > 0
    || (input.stats.connectedWallets ?? 0) > 0
    || (input.stats.feedbackCount ?? 0) > 0,
  );
  const x402Network = input.x402Network ?? "";
  const registryAddress = input.env["VITE_ARC_REGISTRY_ADDRESS"] || input.deployedContracts?.registry || "";
  const escrowAddress = input.env["VITE_ARC_ESCROW_ADDRESS"] || input.deployedContracts?.escrow || "";
  const controlLayer = input.deployedContracts?.controlLayer;
  const agentTreasuryAddress = input.env["VITE_ARC_AGENT_TREASURY_ADDRESS"] || controlLayer?.agentTreasury || "";
  const strategyVaultAddress = input.env["VITE_ARC_STRATEGY_VAULT_ADDRESS"] || controlLayer?.strategyVault || "";
  const riskGuardAddress = input.env["VITE_ARC_RISK_GUARD_ADDRESS"] || controlLayer?.riskGuard || "";
  const receiptRegistryAddress = input.env["VITE_ARC_RECEIPT_REGISTRY_ADDRESS"] || controlLayer?.receiptRegistry || "";

  const checks: ArcReadinessCheck[] = [
    {
      id: "agora_services",
      label: "Agora services",
      ok: input.agoraServiceCount > 0,
      severity: "required",
      weight: 12,
      detail: `${input.agoraServiceCount} Agora services exposed`,
      fix: "Ensure /api/services?workspace=agora returns the ArcMind services judges can inspect.",
    },
    {
      id: "decision_log",
      label: "Agent decisions",
      ok: input.decisions.length > 0,
      severity: "required",
      weight: 12,
      detail: `${input.decisions.length} Arc decisions recorded`,
      fix: "Run the Arc agent loop once before submitting so /live has a latest decision and replay.",
    },
    {
      id: "arc_rpc",
      label: "Arc RPC",
      ok: envSet(input.env, "ARC_RPC_URL"),
      severity: "required",
      weight: 10,
      detail: envSet(input.env, "ARC_RPC_URL") ? "configured" : "missing",
      fix: "Set ARC_RPC_URL to the Canteen/Arc RPC used for payment and decision verification.",
    },
    {
      id: "x402_payout",
      label: "USDC payout wallet",
      ok: isAddress(input.x402PayoutAddress),
      severity: "required",
      weight: 10,
      detail: isAddress(input.x402PayoutAddress) ? "configured" : "missing or zero address",
      fix: "Set X402_PAYOUT_ADDRESS to a funded non-zero Arc wallet controlled by the project.",
    },
    {
      id: "x402_network_arc",
      label: "x402 network",
      ok: /arc/i.test(x402Network),
      severity: "required",
      weight: 8,
      detail: x402Network || "missing",
      fix: "Set X402_NETWORK=arc-testnet so payment copy and receipts match the hackathon settlement layer.",
    },
    {
      id: "traction",
      label: "Visible traction",
      ok: hasTraction,
      severity: "traction",
      weight: 10,
      detail: `${input.stats.testers ?? 0} testers, ${input.stats.connectedWallets ?? 0} wallets, ${input.stats.feedbackCount ?? 0} feedback`,
      fix: "Collect at least one real tester, wallet connection, or feedback event before final submission.",
    },
    {
      id: "portfolio_receipts",
      label: "Portfolio receipt",
      ok: hasPortfolioReceipt,
      severity: "traction",
      weight: 8,
      detail: `${input.receipts.length} Agora receipts`,
      fix: "Create one verified protected portfolio receipt with testnet USDC before the final video.",
    },
    {
      id: "node_env_production",
      label: "Production mode",
      ok: input.env["NODE_ENV"] === "production",
      severity: "launch",
      weight: 8,
      detail: input.env["NODE_ENV"] ?? "development",
      fix: "Deploy backend with NODE_ENV=production to disable dev-bypass paths.",
    },
    {
      id: "arc_private_key",
      label: "Arc signer",
      ok: envSet(input.env, "ARC_PRIVATE_KEY"),
      severity: "onchain",
      weight: 8,
      detail: envSet(input.env, "ARC_PRIVATE_KEY") ? "configured" : "missing",
      fix: "Set ARC_PRIVATE_KEY for a dedicated funded hot wallet if the demo should write decisions on Arc.",
    },
    {
      id: "arc_agent_id",
      label: "Arc agent id",
      ok: envSet(input.env, "ARC_AGENT_ID"),
      severity: "onchain",
      weight: 8,
      detail: envSet(input.env, "ARC_AGENT_ID") ? "configured" : "missing",
      fix: "Register the agent and set ARC_AGENT_ID so audit rows point to the same on-chain identity.",
    },
    {
      id: "arc_registry_contract",
      label: "Registry contract",
      ok: isAddress(registryAddress),
      severity: "launch",
      weight: 6,
      detail: isAddress(registryAddress)
        ? input.env["VITE_ARC_REGISTRY_ADDRESS"] ? "configured" : "from deployment artifact"
        : "missing",
      fix: "Set VITE_ARC_REGISTRY_ADDRESS or update contracts/deployments/arcTestnet.json with the deployed ArcMindRegistry address.",
    },
    {
      id: "arc_escrow_contract",
      label: "Escrow contract",
      ok: isAddress(escrowAddress),
      severity: "launch",
      weight: 6,
      detail: isAddress(escrowAddress)
        ? input.env["VITE_ARC_ESCROW_ADDRESS"] ? "configured" : "from deployment artifact"
        : "missing",
      fix: "Set VITE_ARC_ESCROW_ADDRESS or update contracts/deployments/arcTestnet.json with the deployed CopyTradeEscrow address.",
    },
    {
      id: "arc_control_contracts",
      label: "Control layer contracts",
      ok: [agentTreasuryAddress, strategyVaultAddress, riskGuardAddress, receiptRegistryAddress].every(isAddress),
      severity: "launch",
      weight: 8,
      detail: [agentTreasuryAddress, strategyVaultAddress, riskGuardAddress, receiptRegistryAddress].every(isAddress)
        ? input.env["VITE_ARC_AGENT_TREASURY_ADDRESS"] ? "configured" : "from deployment artifact"
        : "missing one or more AgentTreasury/StrategyVault/RiskGuard/ReceiptRegistry addresses",
      fix: "Deploy Arc control contracts or set VITE_ARC_AGENT_TREASURY_ADDRESS, VITE_ARC_STRATEGY_VAULT_ADDRESS, VITE_ARC_RISK_GUARD_ADDRESS and VITE_ARC_RECEIPT_REGISTRY_ADDRESS.",
    },
  ];

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const passedWeight = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  const requiredReady = checks.filter((check) => check.severity === "required").every((check) => check.ok);
  const onchainReady = checks.every((check) => check.ok);
  const status: ArcReadinessStatus = onchainReady
    ? "ready_onchain"
    : requiredReady && input.decisions.length > 0
      ? "ready_paper"
      : "needs_decisions";

  return {
    status,
    score: Math.round((passedWeight / totalWeight) * 100),
    checks,
    missing: checks.filter((check) => !check.ok).map((check) => check.id),
    recommendedActions: checks
      .filter((check) => !check.ok)
      .sort((a, b) => b.weight - a.weight)
      .map(actionFor)
      .filter((action): action is string => Boolean(action))
      .slice(0, 5),
  };
}
