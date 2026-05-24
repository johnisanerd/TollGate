import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export type AgentAction =
  | "READ_SOURCE"
  | "BUILD_DECISION"
  | "COPY"
  | "HOLD"
  | "REDUCE"
  | "STOP"
  | "MOVE_TO_USDC"
  | "RUN_ARB_CHECK"
  | "UNLOCK_REASONING";

export type FundingMode = "agent_treasury" | "user_wallet" | "user_strategy_vault" | "free_public" | "fallback_local";
export type GateState = "passed" | "blocked" | "not_required";
export type SourceStatus = "live" | "stale" | "unavailable" | "needs_key" | "blocked";

export type AgentBudget = {
  workspaceId: "agora";
  agentId: string;
  balanceUsd: number;
  dailyCapUsd: number;
  maxPerCallUsd: number;
  maxExposureUsd: number;
  spendTodayUsd: number;
  status: "active" | "paused" | "empty";
};

export type AgentPolicy = {
  allowedSources: string[];
  blockedSources: string[];
  allowedActions: AgentAction[];
  requireApprovalAboveUsd: number;
  autoExecute: boolean;
  staleSourceTimeoutMinutes: number;
  sourceDivergenceLimit: number;
};

export type ControlSource = {
  id: string;
  group: "market_price" | "oi_funding" | "prediction_context" | "social_news" | "leader_feed" | "developer_paid";
  label: string;
  status: SourceStatus;
  costUsd: number;
  payer: FundingMode;
  signal: string;
  contribution: number;
  lastUpdated: string;
};

export type ControlStrategy = {
  id: "copyguard" | "signalguard" | "riskoff" | "arbwatcher";
  name: string;
  status: "enabled" | "disabled" | "paused";
  requiredSources: string[];
  expectedCostUsd: number;
  riskLevel: "low" | "medium" | "high";
  lastAction: string;
  autoRun: boolean;
};

export type AgentDecision = {
  action: AgentAction;
  strategyId: string;
  confidence: number;
  riskScore: number;
  reason: string;
  budgetGate: GateState;
  policyGate: GateState;
  riskGate: GateState;
  stale: boolean;
  sources: Array<{ sourceId: string; label: string; contribution: number; signal: string; status: SourceStatus }>;
};

export type ControlExecution = {
  id: string;
  action: AgentAction;
  amountUsd: number;
  fundingMode: FundingMode;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "blocked";
  liveStatus: "live" | "local" | "fallback" | "blocked";
  strategyId?: string;
  sourceId?: string;
  receiptId?: string;
  failureReason?: string;
  createdAt: string;
};

export type ControlPosition = {
  id: string;
  strategyId: string;
  stakeUsd: number;
  exposureUsd: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  withdrawableUsd: number;
  riskStatus: "safe" | "watch" | "exit_pending" | "closed";
  lastAction: string;
};

export type ControlReceipt = {
  id: string;
  action: AgentAction
    | "BUDGET_TOP_UP"
    | "BUDGET_WITHDRAW"
    | "POLICY_UPDATE"
    | "STRATEGY_ENABLE"
    | "STRATEGY_DISABLE"
    | "DECISION_REJECT"
    | "EXECUTION_CANCEL"
    | "POSITION_OPEN"
    | "POSITION_REDUCE"
    | "POSITION_CLOSE"
    | "POSITION_SETTLE"
    | "POSITION_WITHDRAW"
    | "RISK_UPDATE"
    | "RISK_EXIT";
  payer: "Agent Treasury" | "User wallet" | "User Strategy Vault" | "Free public" | "Legacy local path";
  amountUsd: number;
  fundingMode: FundingMode;
  strategyId?: string;
  sourceId?: string;
  policyTarget?: string;
  liveStatus: "live" | "local" | "fallback" | "blocked";
  txHash?: string;
  policySnapshot: AgentPolicy;
  createdAt: string;
};

export type LiveTxContext = {
  txHash?: string;
  walletAddress?: string;
};

export type ControlState = {
  budget: AgentBudget;
  policy: AgentPolicy;
  sources: ControlSource[];
  strategies: ControlStrategy[];
  latestDecision: AgentDecision;
  executions: ControlExecution[];
  positions: ControlPosition[];
  receipts: ControlReceipt[];
};

const AGENT_ID = "arcmind-control-agent";
const SCOPE_KEY = "agora:default:arcmind-control-agent";
const isTestRunner = process.env.NODE_ENV === "test"
  || process.argv.some((arg) => arg === "--test" || arg.includes(".test."));
const DB_PATH = process.env.DB_PATH ?? join(
  dirname(fileURLToPath(import.meta.url)),
  isTestRunner ? "../../data/arc-control-test.db" : "../../data/receipts.db",
);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS arc_control_states (
    scopeKey TEXT PRIMARY KEY,
    stateJson TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function usd(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 10_000) / 10_000) : fallback;
}

function now(): string {
  return new Date().toISOString();
}

function payerFor(mode: FundingMode): ControlReceipt["payer"] {
  if (mode === "agent_treasury") return "Agent Treasury";
  if (mode === "user_wallet") return "User wallet";
  if (mode === "user_strategy_vault") return "User Strategy Vault";
  if (mode === "free_public") return "Free public";
  return "Legacy local path";
}

function isLiveTx(input?: LiveTxContext): input is Required<LiveTxContext> {
  return Boolean(input?.walletAddress && /^0x[a-fA-F0-9]{40}$/.test(input.walletAddress) && input?.txHash && /^0x[a-fA-F0-9]{64}$/.test(input.txHash));
}

function defaultSources(): ControlSource[] {
  return [
    { id: "market_price", group: "market_price", label: "Market Price", status: "unavailable", costUsd: 0, payer: "free_public", signal: "Awaiting live ETH/USDC public market quote.", contribution: 0, lastUpdated: "not loaded" },
    { id: "oi_funding", group: "oi_funding", label: "OI / Funding", status: "unavailable", costUsd: 0, payer: "free_public", signal: "Awaiting Hyperliquid OI and funding data.", contribution: 0, lastUpdated: "not loaded" },
    { id: "prediction_context", group: "prediction_context", label: "Prediction Context", status: "unavailable", costUsd: 0, payer: "free_public", signal: "Awaiting prediction-market context.", contribution: 0, lastUpdated: "not loaded" },
    { id: "social_news", group: "social_news", label: "Social / News", status: "needs_key", costUsd: 0.003, payer: "agent_treasury", signal: "Needs APIFY_TOKEN for live social/news source layer.", contribution: 0, lastUpdated: "not loaded" },
    { id: "leader_feed", group: "leader_feed", label: "Verified Leader Feed", status: "unavailable", costUsd: 0, payer: "free_public", signal: "No verified leader feed configured; SignalGuard mode stays active.", contribution: 0, lastUpdated: "not loaded" },
    { id: "developer_paid", group: "developer_paid", label: "Developer Paid Sources", status: "unavailable", costUsd: 0.01, payer: "agent_treasury", signal: "Optional x402 source calls require a live endpoint before use.", contribution: 0, lastUpdated: "not loaded" },
  ];
}

function defaultStrategies(): ControlStrategy[] {
  return [
    { id: "copyguard", name: "CopyGuard", status: "disabled", requiredSources: ["market_price", "leader_feed"], expectedCostUsd: 0.002, riskLevel: "medium", lastAction: "Needs verified leader feed or explicit SignalGuard decision.", autoRun: false },
    { id: "signalguard", name: "SignalGuard", status: "enabled", requiredSources: ["market_price", "oi_funding", "prediction_context"], expectedCostUsd: 0.001, riskLevel: "low", lastAction: "Active when no leader feed exists.", autoRun: false },
    { id: "riskoff", name: "Risk-Off Router", status: "enabled", requiredSources: ["market_price", "oi_funding"], expectedCostUsd: 0.001, riskLevel: "low", lastAction: "Moves exposure toward USDC-style safe state when risk rises.", autoRun: false },
    { id: "arbwatcher", name: "Arb Watcher", status: "disabled", requiredSources: ["market_price", "developer_paid"], expectedCostUsd: 0.05, riskLevel: "high", lastAction: "Route checks only; execution needs policy approval.", autoRun: false },
  ];
}

function defaultPolicy(): AgentPolicy {
  return {
    allowedSources: ["market_price", "oi_funding", "prediction_context", "social_news", "leader_feed"],
    blockedSources: [],
    allowedActions: ["READ_SOURCE", "BUILD_DECISION", "COPY", "HOLD", "REDUCE", "STOP", "MOVE_TO_USDC", "RUN_ARB_CHECK", "UNLOCK_REASONING"],
    requireApprovalAboveUsd: 0.05,
    autoExecute: false,
    staleSourceTimeoutMinutes: 15,
    sourceDivergenceLimit: 35,
  };
}

function emptyBudget(): AgentBudget {
  return { workspaceId: "agora", agentId: AGENT_ID, balanceUsd: 0, dailyCapUsd: 1, maxPerCallUsd: 0.5, maxExposureUsd: 100, spendTodayUsd: 0, status: "empty" };
}

function makeDecision(state: Pick<ControlState, "budget" | "policy" | "sources">): AgentDecision {
  const live = state.sources.filter((s) => s.status === "live" && !state.policy.blockedSources.includes(s.id));
  const hasStaleSource = state.sources.some((s) => s.status === "stale" && !state.policy.blockedSources.includes(s.id));
  const hasLeader = live.some((s) => s.id === "leader_feed");
  const hasMarket = live.some((s) => s.id === "market_price");
  const socialNeedsKey = state.sources.some((s) => s.id === "social_news" && s.status === "needs_key");
  const action: AgentAction = hasLeader && hasMarket ? "COPY" : hasMarket ? "HOLD" : "STOP";
  const riskScore = hasStaleSource ? 88 : hasMarket ? (socialNeedsKey ? 52 : 38) : 95;
  const confidence = Math.max(18, Math.min(91, live.reduce((sum, s) => sum + s.contribution, 0) - (hasStaleSource ? 18 : 0)));
  const budgetFreeActions: AgentAction[] = ["COPY", "HOLD", "REDUCE", "STOP", "MOVE_TO_USDC"];
  const budgetGate: GateState = budgetFreeActions.includes(action)
    ? "not_required"
    : state.budget.status === "active" && state.budget.balanceUsd - state.budget.spendTodayUsd > 0 ? "passed" : "blocked";
  return {
    action,
    strategyId: hasLeader ? "copyguard" : "signalguard",
    confidence,
    riskScore,
    reason: hasLeader
      ? "Verified leader feed and live market price allow CopyGuard to propose copy exposure."
      : hasMarket
        ? "No verified leader feed is live, so SignalGuard uses public market/source evidence and avoids invented copy targets."
        : "Live market price is unavailable, so the agent blocks exposure instead of fabricating a decision.",
    budgetGate,
    policyGate: state.policy.allowedActions.includes(action) ? "passed" : "blocked",
    riskGate: riskScore >= 85 || hasStaleSource ? "blocked" : "passed",
    stale: live.length === 0 || hasStaleSource,
    sources: state.sources.map((s) => ({ sourceId: s.id, label: s.label, contribution: s.contribution, signal: s.signal, status: state.policy.blockedSources.includes(s.id) ? "blocked" : s.status })),
  };
}

function initialState(): ControlState {
  const budget = emptyBudget();
  const policy = defaultPolicy();
  const sources = defaultSources();
  return {
    budget,
    policy,
    sources,
    strategies: defaultStrategies(),
    latestDecision: makeDecision({ budget, policy, sources }),
    executions: [],
    positions: [],
    receipts: [],
  };
}

function loadState(): ControlState {
  const row = db.prepare("SELECT stateJson FROM arc_control_states WHERE scopeKey = ?").get(SCOPE_KEY) as { stateJson: string } | undefined;
  if (!row?.stateJson) return initialState();
  try {
    return JSON.parse(row.stateJson) as ControlState;
  } catch {
    return initialState();
  }
}

let state: ControlState = loadState();

function commit(next: ControlState): ControlState {
  state = { ...next, latestDecision: makeDecision(next) };
  db.prepare(`
    INSERT INTO arc_control_states (scopeKey, stateJson, updatedAt)
    VALUES (@scopeKey, @stateJson, @updatedAt)
    ON CONFLICT(scopeKey) DO UPDATE SET stateJson = excluded.stateJson, updatedAt = excluded.updatedAt
  `).run({ scopeKey: SCOPE_KEY, stateJson: JSON.stringify(state), updatedAt: now() });
  return state;
}

function receipt(action: ControlReceipt["action"], amountUsd: number, fundingMode: FundingMode, liveStatus: ControlReceipt["liveStatus"], extra: Partial<ControlReceipt> = {}): ControlReceipt {
  return {
    id: id("rcpt"),
    action,
    payer: payerFor(fundingMode),
    amountUsd: usd(amountUsd),
    fundingMode,
    liveStatus,
    policySnapshot: state.policy,
    createdAt: now(),
    ...extra,
  };
}

function execution(action: AgentAction, amountUsd: number, fundingMode: FundingMode, status: ControlExecution["status"], extra: Partial<ControlExecution> = {}): ControlExecution {
  return {
    id: id("exec"),
    action,
    amountUsd: usd(amountUsd),
    fundingMode,
    status,
    liveStatus: status === "failed" || status === "blocked" || status === "cancelled" ? "blocked" : fundingMode === "fallback_local" ? "blocked" : "live",
    createdAt: now(),
    ...extra,
  };
}

function sourceAllowed(sourceId?: string): boolean {
  if (!sourceId) return true;
  if (state.policy.blockedSources.includes(sourceId)) return false;
  return state.policy.allowedSources.length === 0 || state.policy.allowedSources.includes(sourceId);
}

function blockAction(
  action: AgentAction,
  amountUsd: number,
  fundingMode: FundingMode,
  failureReason: string,
  extra: Pick<ControlExecution, "strategyId" | "sourceId"> = {},
  status: "blocked" | "failed" = "blocked",
): ControlState {
  return commit({
    ...state,
    executions: [execution(action, amountUsd, fundingMode, status, { failureReason, ...extra }), ...state.executions],
    receipts: [receipt(action, amountUsd, fundingMode, "blocked", extra), ...state.receipts],
  });
}

export function resetArcControlState(): ControlState {
  state = initialState();
  db.prepare("DELETE FROM arc_control_states WHERE scopeKey = ?").run(SCOPE_KEY);
  return commit(state);
}

export function getArcControlState(): ControlState {
  return state;
}

export function topUpAgentBudget(amountUsd: unknown, liveTx?: LiveTxContext): ControlState {
  const amount = usd(amountUsd);
  if (amount <= 0) return state;
  if (!isLiveTx(liveTx)) {
    return commit({
      ...state,
      receipts: [receipt("BUDGET_TOP_UP", amount, "user_wallet", "blocked"), ...state.receipts],
    });
  }
  const tx = liveTx;
  const nextBudget = { ...state.budget, balanceUsd: usd(state.budget.balanceUsd + amount), status: "active" as const };
  return commit({
    ...state,
    budget: nextBudget,
    receipts: [receipt("BUDGET_TOP_UP", amount, "user_wallet", "live", { txHash: tx.txHash }), ...state.receipts],
  });
}

export function updateAgentPolicy(input: Partial<AgentBudget & AgentPolicy>): ControlState {
  const nextBudget: AgentBudget = {
    ...state.budget,
    dailyCapUsd: input.dailyCapUsd == null ? state.budget.dailyCapUsd : usd(input.dailyCapUsd, state.budget.dailyCapUsd),
    maxPerCallUsd: input.maxPerCallUsd == null ? state.budget.maxPerCallUsd : usd(input.maxPerCallUsd, state.budget.maxPerCallUsd),
    maxExposureUsd: input.maxExposureUsd == null ? state.budget.maxExposureUsd : usd(input.maxExposureUsd, state.budget.maxExposureUsd),
    status: input.status === "active" || input.status === "paused" || input.status === "empty" ? input.status : state.budget.status,
  };
  const nextPolicy: AgentPolicy = {
    ...state.policy,
    allowedSources: Array.isArray(input.allowedSources) ? input.allowedSources.map(String) : state.policy.allowedSources,
    blockedSources: Array.isArray(input.blockedSources) ? input.blockedSources.map(String) : state.policy.blockedSources,
    allowedActions: Array.isArray(input.allowedActions) ? input.allowedActions.filter((a): a is AgentAction => state.policy.allowedActions.includes(a as AgentAction)) : state.policy.allowedActions,
    requireApprovalAboveUsd: input.requireApprovalAboveUsd == null ? state.policy.requireApprovalAboveUsd : usd(input.requireApprovalAboveUsd, state.policy.requireApprovalAboveUsd),
    autoExecute: typeof input.autoExecute === "boolean" ? input.autoExecute : state.policy.autoExecute,
    staleSourceTimeoutMinutes: input.staleSourceTimeoutMinutes == null ? state.policy.staleSourceTimeoutMinutes : usd(input.staleSourceTimeoutMinutes, state.policy.staleSourceTimeoutMinutes),
    sourceDivergenceLimit: input.sourceDivergenceLimit == null ? state.policy.sourceDivergenceLimit : usd(input.sourceDivergenceLimit, state.policy.sourceDivergenceLimit),
  };
  return commit({
    ...state,
    budget: nextBudget,
    policy: nextPolicy,
    receipts: [receipt("POLICY_UPDATE", 0, "user_wallet", "live"), ...state.receipts],
  });
}

export function withdrawAgentBudget(amountUsd: unknown, liveTx?: LiveTxContext): ControlState {
  const amount = Math.min(usd(amountUsd), Math.max(0, state.budget.balanceUsd - state.budget.spendTodayUsd));
  if (amount <= 0) return state;
  if (!isLiveTx(liveTx)) {
    return commit({
      ...state,
      receipts: [receipt("BUDGET_WITHDRAW", amount, "user_wallet", "blocked"), ...state.receipts],
    });
  }
  const tx = liveTx;
  const nextBalance = usd(state.budget.balanceUsd - amount);
  return commit({
    ...state,
    budget: { ...state.budget, balanceUsd: nextBalance, status: nextBalance > state.budget.spendTodayUsd ? "active" : "empty" },
    receipts: [receipt("BUDGET_WITHDRAW", amount, "user_wallet", "live", { txHash: tx.txHash }), ...state.receipts],
  });
}

export function refreshControlSources(sourceUpdates: Partial<ControlSource>[] = []): ControlState {
  const stamp = new Date().toISOString();
  const updates = new Map(sourceUpdates.map((source) => [source.id, source]));
  const sources = state.sources.map((source) => {
    const update = updates.get(source.id);
    if (!update) return source;
    return { ...source, ...update, id: source.id, lastUpdated: stamp };
  });
  let next = commit({ ...state, sources });
  for (const source of sources) {
    if (source.status === "live" && source.payer === "agent_treasury" && source.costUsd > 0) {
      next = runControlAction("READ_SOURCE", { amountUsd: source.costUsd, fundingMode: "agent_treasury", sourceId: source.id });
    }
  }
  return next;
}

export function allowControlSource(sourceId: string, allowed: boolean): ControlState {
  const blockedSources = allowed
    ? state.policy.blockedSources.filter((id) => id !== sourceId)
    : Array.from(new Set([...state.policy.blockedSources, sourceId]));
  const nextPolicy = { ...state.policy, blockedSources };
  return commit({
    ...state,
    policy: nextPolicy,
    receipts: [receipt("POLICY_UPDATE", 0, "user_wallet", "live", { sourceId }), ...state.receipts],
  });
}

export function setControlActionAllowed(action: AgentAction, allowed: boolean): ControlState {
  const allowedActions = allowed
    ? Array.from(new Set([...state.policy.allowedActions, action]))
    : state.policy.allowedActions.filter((item) => item !== action);
  const nextPolicy = { ...state.policy, allowedActions };
  return commit({
    ...state,
    policy: nextPolicy,
    receipts: [receipt("POLICY_UPDATE", 0, "user_wallet", "live", { policyTarget: action }), ...state.receipts],
  });
}

export function setControlStrategy(strategyId: string, enabled: boolean, autoRun?: boolean): ControlState {
  const item = state.strategies.find((strategy) => strategy.id === strategyId);
  const nextStrategies = state.strategies.map((strategy) => strategy.id === strategyId
    ? { ...strategy, status: enabled ? "enabled" as const : "disabled" as const, autoRun: typeof autoRun === "boolean" ? autoRun : strategy.autoRun }
    : strategy);
  return commit({
    ...state,
    strategies: nextStrategies,
    receipts: item
      ? [receipt(enabled ? "STRATEGY_ENABLE" : "STRATEGY_DISABLE", 0, "free_public", "live", { strategyId }), ...state.receipts]
      : state.receipts,
  });
}

export function buildLatestControlDecision(): ControlState {
  return commit({
    ...state,
    executions: [execution("BUILD_DECISION", 0, "free_public", "completed"), ...state.executions],
    receipts: [receipt("BUILD_DECISION", 0, "free_public", "live"), ...state.receipts],
  });
}

export function runControlAction(action: AgentAction, input: { amountUsd?: unknown; fundingMode?: FundingMode; strategyId?: string; sourceId?: string } = {}): ControlState {
  const amount = usd(input.amountUsd);
  const fundingMode = input.fundingMode ?? (action === "READ_SOURCE" || action === "RUN_ARB_CHECK" ? "agent_treasury" : "user_strategy_vault");
  if (fundingMode === "fallback_local") {
    return blockAction(action, amount, fundingMode, "fallback_local is not allowed for new Arc actions; live path required.", { strategyId: input.strategyId, sourceId: input.sourceId });
  }
  if (!state.policy.allowedActions.includes(action)) {
    return blockAction(action, amount, fundingMode, "Policy blocks this action.", { strategyId: input.strategyId, sourceId: input.sourceId }, "failed");
  }
  if (!sourceAllowed(input.sourceId)) {
    return blockAction(action, amount, fundingMode, `Source ${input.sourceId} is blocked by policy.`, { strategyId: input.strategyId, sourceId: input.sourceId });
  }
  if (fundingMode === "user_strategy_vault" && action === "COPY" && amount > 0) {
    const openExposure = state.positions.reduce((sum, position) => sum + position.exposureUsd, 0);
    if (amount > state.budget.maxExposureUsd || openExposure + amount > state.budget.maxExposureUsd) {
      return blockAction(action, amount, fundingMode, `User strategy vault action exceeds max exposure ${state.budget.maxExposureUsd.toFixed(2)} USDC.`, { strategyId: input.strategyId, sourceId: input.sourceId });
    }
  }
  if (fundingMode === "agent_treasury") {
    const remaining = state.budget.balanceUsd - state.budget.spendTodayUsd;
    if (state.budget.status !== "active" || remaining < amount || amount > state.budget.maxPerCallUsd || state.budget.spendTodayUsd + amount > state.budget.dailyCapUsd) {
      return blockAction(action, amount, fundingMode, "Agent Budget blocks this spend.", { strategyId: input.strategyId, sourceId: input.sourceId }, "failed");
    }
  }
  const liveStatus: ControlExecution["liveStatus"] = "live";
  const exec = execution(action, amount, fundingMode, "completed", { liveStatus, strategyId: input.strategyId, sourceId: input.sourceId });
  const shouldDeduct = fundingMode === "agent_treasury" && liveStatus === "live";
  return commit({
    ...state,
    budget: shouldDeduct ? { ...state.budget, spendTodayUsd: usd(state.budget.spendTodayUsd + amount) } : state.budget,
    executions: [exec, ...state.executions],
    receipts: [receipt(action, amount, fundingMode, liveStatus, { strategyId: input.strategyId, sourceId: input.sourceId }), ...state.receipts],
  });
}

export function approveLatestControlDecision(input: { action?: AgentAction; amountUsd?: unknown; fundingMode?: FundingMode } = {}): ControlState {
  const decision = state.latestDecision;
  const action = input.action ?? decision.action;
  const fundingMode = input.fundingMode ?? (["COPY", "HOLD", "REDUCE", "STOP", "MOVE_TO_USDC"].includes(action) ? "user_strategy_vault" : "agent_treasury");
  const amount = usd(input.amountUsd);
  const gateBlocked = decision.stale || decision.policyGate === "blocked" || decision.riskGate === "blocked" || decision.budgetGate === "blocked";
  if (action !== decision.action) {
    return blockAction(action, amount, fundingMode, "Requested action does not match the latest agent decision.", { strategyId: decision.strategyId });
  }
  if (gateBlocked) {
    return blockAction(action, amount, fundingMode, "Latest decision gates are blocked or stale; approval cannot execute.", { strategyId: decision.strategyId });
  }
  return runControlAction(action, { amountUsd: amount, fundingMode, strategyId: decision.strategyId });
}

export function rejectLatestControlDecision(): ControlState {
  return commit({
    ...state,
    executions: [execution("STOP", 0, "free_public", "cancelled", { failureReason: "Rejected by user." }), ...state.executions],
    receipts: [receipt("DECISION_REJECT", 0, "free_public", "blocked"), ...state.receipts],
  });
}

export function cancelControlExecution(executionId: string): ControlState {
  const item = state.executions.find((exec) => exec.id === executionId);
  return commit({
    ...state,
    executions: state.executions.map((item) => item.id === executionId ? { ...item, status: "cancelled", liveStatus: "blocked", failureReason: "Cancelled by user." } : item),
    receipts: item ? [receipt("EXECUTION_CANCEL", item.amountUsd, item.fundingMode, "blocked", { strategyId: item.strategyId, sourceId: item.sourceId }), ...state.receipts] : state.receipts,
  });
}

export function retryControlExecution(executionId: string): ControlState {
  const item = state.executions.find((exec) => exec.id === executionId);
  if (!item) return state;
  return runControlAction(item.action, { amountUsd: item.amountUsd, fundingMode: item.fundingMode, strategyId: item.strategyId, sourceId: item.sourceId });
}

export function mutateControlPosition(action: "open" | "reduce25" | "reduce50" | "close" | "settle" | "withdraw", positionId?: string, liveTx?: LiveTxContext): ControlState {
  if (!isLiveTx(liveTx)) {
    const receiptAction = action === "withdraw"
      ? "POSITION_WITHDRAW"
      : action === "settle"
        ? "POSITION_SETTLE"
        : action === "close"
          ? "POSITION_CLOSE"
          : action === "open"
            ? "POSITION_OPEN"
            : "POSITION_REDUCE";
    return commit({
      ...state,
      receipts: [receipt(receiptAction, 0, "user_strategy_vault", "blocked", { strategyId: "copyguard" }), ...state.receipts],
    });
  }
  if (action === "open") {
    const tx = liveTx;
    const position: ControlPosition = {
      id: id("pos"),
      strategyId: "copyguard",
      stakeUsd: 25,
      exposureUsd: 15,
      entryPrice: 3340,
      currentPrice: 3340,
      unrealizedPnlUsd: 0,
      realizedPnlUsd: 0,
      withdrawableUsd: 10,
      riskStatus: "safe",
      lastAction: "User opened CopyGuard position through StrategyVault.",
    };
    return commit({
      ...state,
      positions: [position, ...state.positions],
      receipts: [receipt("POSITION_OPEN", position.stakeUsd, "user_strategy_vault", "live", { strategyId: position.strategyId, txHash: tx.txHash }), ...state.receipts],
    });
  }
  const tx = liveTx;
  const positions = state.positions.map((position) => {
    if (position.id !== positionId) return position;
    if (action === "reduce25" || action === "reduce50") {
      const ratio = action === "reduce25" ? 0.25 : 0.5;
      const reduced = usd(position.exposureUsd * ratio);
      return { ...position, exposureUsd: usd(position.exposureUsd - reduced), withdrawableUsd: usd(position.withdrawableUsd + reduced), lastAction: `Reduced exposure by ${Math.round(ratio * 100)}%.` };
    }
    if (action === "close") return { ...position, exposureUsd: 0, riskStatus: "closed" as const, withdrawableUsd: usd(position.withdrawableUsd + position.exposureUsd), lastAction: "Closed exposure." };
    if (action === "settle") return { ...position, realizedPnlUsd: usd(position.realizedPnlUsd + position.unrealizedPnlUsd), unrealizedPnlUsd: 0, lastAction: "Settled visible PnL." };
    return { ...position, withdrawableUsd: 0, lastAction: "Withdrawn available live funds." };
  });
  return commit({
    ...state,
    positions,
    receipts: [receipt(
      action === "withdraw"
        ? "POSITION_WITHDRAW"
        : action === "settle"
          ? "POSITION_SETTLE"
          : action === "close"
            ? "POSITION_CLOSE"
            : "POSITION_REDUCE",
      0,
      "user_strategy_vault",
      "live",
      { strategyId: "copyguard", txHash: tx.txHash },
    ), ...state.receipts],
  });
}

export function triggerRiskEmergencyExit(reason = "Risk Guard emergency exit", liveTx?: LiveTxContext): ControlState {
  if (!isLiveTx(liveTx)) {
    return commit({
      ...state,
      receipts: [receipt("RISK_EXIT", 0, "user_wallet", "blocked", { policyTarget: "RiskGuard" }), ...state.receipts],
    });
  }
  const tx = liveTx;
  const positions = state.positions.map((position) => ({
    ...position,
    exposureUsd: 0,
    withdrawableUsd: usd(position.withdrawableUsd + position.exposureUsd + position.unrealizedPnlUsd),
    unrealizedPnlUsd: 0,
    riskStatus: "exit_pending" as const,
    lastAction: `${reason}; exposure moved to withdrawable USDC state.`,
  }));
  return commit({
    ...state,
    budget: { ...state.budget, status: "paused" },
    positions,
    executions: [execution("STOP", 0, "user_strategy_vault", "completed", { liveStatus: "live", failureReason: reason }), ...state.executions],
    receipts: [receipt("RISK_EXIT", 0, "user_strategy_vault", "live", { txHash: tx.txHash }), ...state.receipts],
  });
}

export function setRiskGuardMode(mode: "arm" | "disarm" | "reset", liveTx?: LiveTxContext): ControlState {
  if (!isLiveTx(liveTx)) {
    return commit({
      ...state,
      receipts: [receipt("RISK_UPDATE", 0, "user_wallet", "blocked", { policyTarget: `RiskGuard:${mode}` }), ...state.receipts],
    });
  }
  const tx = liveTx;
  const status = mode === "disarm"
    ? "paused"
    : state.budget.balanceUsd > state.budget.spendTodayUsd
      ? "active"
      : "empty";
  const positions = mode === "reset"
    ? state.positions.map((position) => ({
      ...position,
      riskStatus: "safe" as const,
      lastAction: "Risk Guard reset by user.",
    }))
    : state.positions;
  return commit({
    ...state,
    budget: { ...state.budget, status },
    positions,
    receipts: [receipt("RISK_UPDATE", 0, "user_wallet", "live", { txHash: tx.txHash }), ...state.receipts],
  });
}

export function developerControlStatus() {
  return {
    x402Services: ["svc_arc_oracle", "svc_arc_signal_hl", "svc_arc_signal_poly", "svc_arc_reasoning"],
    policySchema: state.policy,
    treasuryModel: "live-only AgentTreasury/StrategyVault model; unavailable paths are blocked",
    contractReadiness: ["AgentTreasury", "StrategyVault", "RiskGuard", "ReceiptRegistry"],
    legacyRule: "legacy local execution is blocked for new Arc actions",
  };
}
