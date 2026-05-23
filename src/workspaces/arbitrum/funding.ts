import type { WorkspaceId } from "../../types";

export type FundingMode = "treasury" | "wallet_per_call" | "escrow";
export type FundingProject = "arbitrum";
export type FundingSettlement = "live" | "fallback";

/** How a treasury allowance is signed. EVM workspaces use `personal_sign`;
 *  Sui has no EVM provider, so it records a clearly-labeled local demo allowance. */
export type FundingSignatureScheme = "evm-personal-sign" | "sui-demo";

export type FundingScope = {
  workspaceId: WorkspaceId;
  agentId: string;
  project: FundingProject;
};

export type FundingModelConfig = {
  project: FundingProject;
  workspaceId: WorkspaceId;
  label: string;
  settlementNetwork: string;
  defaultDailyLimitUsd: number;
  defaultMaxPerCallUsd: number;
  allowlistedServices: string[];
  /** Defaults to "evm-personal-sign" when omitted. */
  signatureScheme?: FundingSignatureScheme;
};

export type FundingPolicy = {
  dailyLimitUsd: number;
  maxPerCallUsd: number;
  paused: boolean;
  allowlistedServices: string[];
};

export type TreasuryTopUp = {
  id: string;
  amount: number;
  ts: string;
  source: "wallet_signature" | "local_admin";
  signature?: string;
};

export type FundingSpend = {
  id: string;
  amount: number;
  ts: string;
  ok: boolean;
  mode: FundingMode;
  serviceId?: string;
  settlement: FundingSettlement;
  reason?: string;
};

export type TreasuryState = {
  fundedUsd: number;
  spentUsd: number;
  availableUsd: number;
  topUps: TreasuryTopUp[];
};

export type FundingCheck = {
  ok: boolean;
  mode: FundingMode;
  reason?: string;
  availableUsd?: number;
  requiresSignature?: boolean;
  policySnapshot?: FundingPolicy;
};

export type FundingActionContext = {
  mode: FundingMode;
  serviceId?: string;
};

export type FundingSpendContext = FundingActionContext & {
  settlement: FundingSettlement;
};

export const FUNDING_CONFIGS: Record<FundingProject, FundingModelConfig> = {
  arbitrum: {
    project: "arbitrum",
    workspaceId: "arbitrum",
    label: "Arbitrum Agent Treasury",
    settlementNetwork: "arbitrum-sepolia",
    defaultDailyLimitUsd: 1,
    defaultMaxPerCallUsd: 0.5,
    allowlistedServices: [
      "svc_arb_invoice",
      "svc_arb_orbit",
      "svc_arb_escrow",
      "svc_arb_bridge",
      "svc_arb_usdc",
    ],
  },
};

function scopedKey(scope: FundingScope, suffix: string): string {
  return `funding.${scope.workspaceId}.${scope.agentId}.${suffix}`;
}

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function configFor(scope: FundingScope): FundingModelConfig {
  const cfg = FUNDING_CONFIGS[scope.project];
  if (cfg.workspaceId !== scope.workspaceId) {
    throw new Error(`funding_scope_mismatch:${scope.project}:${scope.workspaceId}`);
  }
  return cfg;
}

function safeAmount(amountUsd: number): number {
  return Number.isFinite(amountUsd) ? Math.max(0, amountUsd) : 0;
}

/** Stable short hash of a string, used to derive a deterministic Sui demo signature. */
function demoHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function getFundingPolicy(scope: FundingScope): FundingPolicy {
  const cfg = configFor(scope);
  const fallback: FundingPolicy = {
    dailyLimitUsd: cfg.defaultDailyLimitUsd,
    maxPerCallUsd: cfg.defaultMaxPerCallUsd,
    paused: false,
    allowlistedServices: [...cfg.allowlistedServices],
  };
  try {
    const raw = storage()?.getItem(scopedKey(scope, "policy"));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<FundingPolicy>;
    return {
      dailyLimitUsd: Number.isFinite(parsed.dailyLimitUsd) ? Math.max(0, Number(parsed.dailyLimitUsd)) : fallback.dailyLimitUsd,
      maxPerCallUsd: Number.isFinite(parsed.maxPerCallUsd) ? Math.max(0, Number(parsed.maxPerCallUsd)) : fallback.maxPerCallUsd,
      paused: Boolean(parsed.paused),
      allowlistedServices: Array.isArray(parsed.allowlistedServices) ? parsed.allowlistedServices.filter(Boolean) : fallback.allowlistedServices,
    };
  } catch {
    return fallback;
  }
}

export function setFundingPolicy(scope: FundingScope, patch: Partial<FundingPolicy>): FundingPolicy {
  const current = getFundingPolicy(scope);
  const updated: FundingPolicy = {
    ...current,
    ...patch,
    dailyLimitUsd: patch.dailyLimitUsd === undefined ? current.dailyLimitUsd : safeAmount(patch.dailyLimitUsd),
    maxPerCallUsd: patch.maxPerCallUsd === undefined ? current.maxPerCallUsd : safeAmount(patch.maxPerCallUsd),
    allowlistedServices: patch.allowlistedServices ?? current.allowlistedServices,
  };
  storage()?.setItem(scopedKey(scope, "policy"), JSON.stringify(updated));
  return updated;
}

export function getFundingSpendLog(scope: FundingScope): FundingSpend[] {
  try {
    const raw = storage()?.getItem(scopedKey(scope, "spendLog"));
    return raw ? (JSON.parse(raw) as FundingSpend[]) : [];
  } catch {
    return [];
  }
}

export function getTreasuryTopUps(scope: FundingScope): TreasuryTopUp[] {
  try {
    const raw = storage()?.getItem(scopedKey(scope, "treasury"));
    return raw ? (JSON.parse(raw) as TreasuryTopUp[]) : [];
  } catch {
    return [];
  }
}

function spentToday(log: FundingSpend[]): number {
  const cutoff = Date.now() - 86_400_000;
  return log
    .filter((item) => item.ok && item.settlement === "live" && new Date(item.ts).getTime() > cutoff)
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getTreasuryState(scope: FundingScope): TreasuryState {
  const topUps = getTreasuryTopUps(scope);
  const fundedUsd = topUps.reduce((sum, item) => sum + safeAmount(item.amount), 0);
  const spentUsd = spentToday(getFundingSpendLog(scope));
  return {
    fundedUsd,
    spentUsd,
    availableUsd: Math.max(0, fundedUsd - spentUsd),
    topUps,
  };
}

export function fundTreasury(scope: FundingScope, amountUsd: number, signature?: string): TreasuryTopUp {
  configFor(scope);
  const topUp: TreasuryTopUp = {
    id: "topup_" + Math.random().toString(36).slice(2, 10),
    amount: safeAmount(amountUsd),
    ts: new Date().toISOString(),
    source: signature ? "wallet_signature" : "local_admin",
    signature,
  };
  const updated = [topUp, ...getTreasuryTopUps(scope)].slice(0, 50);
  storage()?.setItem(scopedKey(scope, "treasury"), JSON.stringify(updated));
  return topUp;
}

export function getRemainingToday(scope: FundingScope): number {
  const policy = getFundingPolicy(scope);
  return Math.max(0, policy.dailyLimitUsd - spentToday(getFundingSpendLog(scope)));
}

export function checkFunding(scope: FundingScope, amountUsd: number, context: FundingActionContext): FundingCheck {
  configFor(scope);
  const amount = safeAmount(amountUsd);
  const policy = getFundingPolicy(scope);

  if (context.mode === "wallet_per_call") {
    return {
      ok: false,
      mode: context.mode,
      reason: "wallet_signature_required",
      requiresSignature: true,
      policySnapshot: policy,
    };
  }

  if (context.mode === "escrow") {
    return {
      ok: false,
      mode: context.mode,
      reason: "escrow_not_configured",
      requiresSignature: true,
      policySnapshot: policy,
    };
  }

  if (policy.paused) return { ok: false, mode: context.mode, reason: "agent_paused", requiresSignature: false, policySnapshot: policy };
  if (context.serviceId && policy.allowlistedServices.length > 0 && !policy.allowlistedServices.includes(context.serviceId)) {
    return { ok: false, mode: context.mode, reason: `service_not_allowlisted:${context.serviceId}`, requiresSignature: false, policySnapshot: policy };
  }
  if (policy.maxPerCallUsd > 0 && amount > policy.maxPerCallUsd) {
    return {
      ok: false,
      mode: context.mode,
      reason: `exceeds_max_per_call ($${amount.toFixed(2)} > $${policy.maxPerCallUsd.toFixed(2)})`,
      requiresSignature: false,
      policySnapshot: policy,
    };
  }
  const remaining = getRemainingToday(scope);
  if (policy.dailyLimitUsd > 0 && amount > remaining) {
    return {
      ok: false,
      mode: context.mode,
      reason: `exceeds_daily_limit (remaining $${remaining.toFixed(2)})`,
      requiresSignature: false,
      policySnapshot: policy,
    };
  }
  const treasury = getTreasuryState(scope);
  if (amount > treasury.availableUsd) {
    return {
      ok: false,
      mode: context.mode,
      reason: `treasury_insufficient (available $${treasury.availableUsd.toFixed(2)}, needs $${amount.toFixed(2)})`,
      availableUsd: treasury.availableUsd,
      requiresSignature: true,
      policySnapshot: policy,
    };
  }
  return {
    ok: true,
    mode: context.mode,
    availableUsd: treasury.availableUsd,
    requiresSignature: false,
    policySnapshot: policy,
  };
}

export function recordFundingSpend(scope: FundingScope, amountUsd: number, context: FundingSpendContext): FundingSpend {
  const amount = safeAmount(amountUsd);
  const check = checkFunding(scope, amount, context);
  const isLiveTreasurySpend = context.mode === "treasury" && context.settlement === "live" && check.ok;
  const spend: FundingSpend = {
    id: (context.settlement === "live" ? "spend_" : "fallback_") + Math.random().toString(36).slice(2, 10),
    amount,
    ts: new Date().toISOString(),
    ok: isLiveTreasurySpend,
    mode: context.mode,
    serviceId: context.serviceId,
    settlement: context.settlement,
    reason: isLiveTreasurySpend ? undefined : context.settlement === "fallback" ? "fallback_no_live_settlement_no_treasury_spend" : check.reason,
  };
  const updated = [spend, ...getFundingSpendLog(scope)].slice(0, 50);
  storage()?.setItem(scopedKey(scope, "spendLog"), JSON.stringify(updated));
  return spend;
}

export function buildTreasuryAllowanceMessage(scope: FundingScope, amountUsd: number): string {
  const cfg = configFor(scope);
  const policy = getFundingPolicy(scope);
  const disclaimer =
    cfg.signatureScheme === "sui-demo"
      ? "This is a local demo allowance for Sui; production requires a Sui wallet adapter (e.g. @mysten/wallet-kit) — EVM personal_sign is not used."
      : "This is a demo allowance signature; production should use an on-chain AgentTreasury or Circle Wallets.";
  return [
    `Authorize ${cfg.label}`,
    `Workspace: ${scope.workspaceId}`,
    `Agent: ${scope.agentId}`,
    `Amount: ${safeAmount(amountUsd).toFixed(2)} USDC`,
    `Daily limit: ${policy.dailyLimitUsd.toFixed(2)} USDC`,
    `Per-call max: ${policy.maxPerCallUsd.toFixed(2)} USDC`,
    `Allowed services: ${policy.allowlistedServices.join(", ")}`,
    "Purpose: autonomous x402 service calls only",
    disclaimer,
  ].join("\n");
}

export async function requestTreasuryAllowanceSignature(scope: FundingScope, amountUsd: number): Promise<string> {
  const message = buildTreasuryAllowanceMessage(scope, amountUsd);
  // Sui has no EVM provider — record a clearly-labeled local demo allowance instead
  // of calling personal_sign. Still flows through fundTreasury as a "wallet_signature".
  if (configFor(scope).signatureScheme === "sui-demo") {
    return `sui_demo_sig:${demoHash(message)}`;
  }
  const eth = (globalThis as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!eth?.request) throw new Error("wallet_unavailable");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const account = accounts?.[0];
  if (!account) throw new Error("wallet_not_connected");
  const sig = await eth.request({
    method: "personal_sign",
    params: [message, account],
  });
  if (typeof sig !== "string" || !sig) throw new Error("signature_rejected");
  return sig;
}

export async function requestWalletPerCallSignature(scope: FundingScope, amountUsd: number, serviceId: string): Promise<string> {
  const eth = (globalThis as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!eth?.request) throw new Error("wallet_unavailable");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const account = accounts?.[0];
  if (!account) throw new Error("wallet_not_connected");
  const sig = await eth.request({
    method: "personal_sign",
    params: [
      [
        "Authorize wallet-per-call payment",
        `Workspace: ${scope.workspaceId}`,
        `Project: ${scope.project}`,
        `Service: ${serviceId}`,
        `Amount: ${safeAmount(amountUsd).toFixed(4)} USDC`,
        "Mode: manual user action",
        "Agent Treasury will not be used for this call.",
        `Timestamp: ${new Date().toISOString()}`,
      ].join("\n"),
      account,
    ],
  });
  if (typeof sig !== "string" || !sig) throw new Error("signature_rejected");
  return sig;
}

export function fundingReceiptPayload(scope: FundingScope, amountUsd: number, context: FundingSpendContext, extra?: Record<string, unknown>) {
  return {
    ...extra,
    fundingMode: context.mode,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    project: scope.project,
    requestedUsd: safeAmount(amountUsd),
    settlement: context.settlement,
    policySnapshot: getFundingPolicy(scope),
    treasury: getTreasuryState(scope),
    fallback: context.settlement === "fallback" ? true : extra?.fallback,
  };
}

export type SettleResult = {
  /** Result of the preflight check — always present. */
  preflight: FundingCheck;
  /** Spend log entry — absent only when a live treasury call is blocked before settlement. */
  spend?: FundingSpend;
  /** Receipt payload to attach to the emitted receipt — absent when blocked. */
  receipt?: ReturnType<typeof fundingReceiptPayload>;
};

/**
 * Compose a funded call: preflight, then (unless a live treasury call is blocked)
 * record the spend and build the receipt payload. Pure composition over existing
 * functions — `recordFundingSpend` still guarantees fallback calls never deduct.
 *
 * A live `treasury` call that fails preflight returns `{ preflight }` only, so the
 * caller can surface `preflight.reason` and stop. `wallet_per_call` / `escrow` modes
 * and `fallback` settlement always proceed to record + receipt (the caller owns the
 * wallet signature for manual modes).
 */
export function settleFundedCall(
  scope: FundingScope,
  amountUsd: number,
  context: FundingSpendContext,
  receiptExtra?: Record<string, unknown>,
): SettleResult {
  const preflight = checkFunding(scope, amountUsd, context);
  const treasuryBlocked = context.mode === "treasury" && context.settlement === "live" && !preflight.ok;
  if (treasuryBlocked) {
    return { preflight };
  }
  const spend = recordFundingSpend(scope, amountUsd, context);
  const receipt = fundingReceiptPayload(scope, amountUsd, context, receiptExtra);
  return { preflight, spend, receipt };
}

/** Workspace-scoped Agent Treasury identity for the Arbitrum workspace.
 *
 * Autonomous agent actions spend only from `funding.arbitrum.agent_arb_treasury.*`.
 * No other workspace may read or spend this scope (enforced by configFor()).
 */
export const ARB_FUNDING_SCOPE: FundingScope = {
  workspaceId: "arbitrum",
  agentId: "agent_arb_treasury",
  project: "arbitrum",
};

/** Default amount the "Sign treasury allowance" button funds. */
export const ARB_TREASURY_TOPUP_USD = 1;
