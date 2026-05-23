import type { WorkspaceId } from "../../types";

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

export type ControlFundingMode =
  | "agent_treasury"
  | "user_wallet"
  | "user_strategy_vault"
  | "free_public"
  | "fallback_local";

export type SourceStatus = "live" | "stale" | "needs_key" | "unavailable" | "fallback" | "blocked";
export type StrategyRisk = "low" | "medium" | "high";
export type ExecutionStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "blocked";

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

export type ControlStrategy = {
  id: "copyguard" | "signalguard" | "riskoff" | "arbwatcher";
  name: string;
  summary: string;
  enabled: boolean;
  requiredSources: string[];
  expectedCostUsd: number;
  risk: StrategyRisk;
  lastAction: string;
};

export type ControlSource = {
  id: string;
  label: string;
  group: "market" | "derivatives" | "prediction" | "social" | "leader" | "developer";
  status: SourceStatus;
  costUsd: number;
  payer: ControlFundingMode;
  contribution: number;
  signal: string;
  lastUpdated: string;
};

export type SourceContribution = ControlSource & {
  policyAllowed: boolean;
};

export type AgentDecision = {
  action: AgentAction;
  strategyId: string;
  confidence: number;
  riskScore: number;
  reason: string;
  sources: SourceContribution[];
  budgetGate: "passed" | "blocked" | "not_required";
  policyGate: "passed" | "blocked";
  riskGate: "passed" | "blocked";
  stale: boolean;
};

export type ControlExecution = {
  id: string;
  action: AgentAction;
  strategyId?: string;
  sourceId?: string;
  amountUsd: number;
  fundingMode: ControlFundingMode;
  status: ExecutionStatus;
  liveStatus: "live" | "local" | "fallback" | "blocked";
  receiptId?: string;
  failureReason?: string;
  createdAt: string;
};

export type ControlPosition = {
  id: string;
  strategyId: string;
  stakeUsd: number;
  exposureUsd: number;
  entryPrice?: number;
  currentPrice?: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  withdrawableUsd: number;
  riskStatus: "safe" | "watch" | "exit" | "exit_pending" | "closed";
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
  amountUsd: number;
  fundingMode: ControlFundingMode;
  strategyId?: string;
  sourceId?: string;
  policyTarget?: string;
  liveStatus: "live" | "local" | "fallback" | "blocked";
  policySnapshot: AgentPolicy;
  createdAt: string;
};

export type ControlState = {
  workspaceId: "agora";
  agentId: string;
  budget: AgentBudget;
  policy: AgentPolicy;
  strategies: ControlStrategy[];
  executionQueue: ControlExecution[];
  positions: ControlPosition[];
  receipts: ControlReceipt[];
};

export type ControlActionInput = {
  action: AgentAction;
  amountUsd: number;
  fundingMode: ControlFundingMode;
  strategyId?: string;
  sourceId?: string;
};

export type UserActionDisclosure = {
  action: AgentAction;
  amountUsd: number;
  payer: ControlFundingMode;
  requiresSignature: boolean;
  liveStatus: "live" | "local" | "fallback" | "blocked";
  onCancel: string;
  onFail: string;
  refundPath?: string;
};

function usd(n: number): number {
  return Math.round(Math.max(0, Number.isFinite(n) ? n : 0) * 10000) / 10000;
}

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultStrategies(): ControlStrategy[] {
  return [
    {
      id: "copyguard",
      name: "CopyGuard",
      summary: "Copies ArcMind market decisions with user-controlled exposure, pause, reduce and withdraw.",
      enabled: true,
      requiredSources: ["market_price", "oi_funding"],
      expectedCostUsd: 0.002,
      risk: "medium",
      lastAction: "Ready. Waiting for user stake and current decision.",
    },
    {
      id: "signalguard",
      name: "SignalGuard",
      summary: "Builds COPY/HOLD/REDUCE/STOP decisions from public market and configured source layers.",
      enabled: true,
      requiredSources: ["market_price", "oi_funding"],
      expectedCostUsd: 0.002,
      risk: "low",
      lastAction: "Active when verified leader feed is unavailable.",
    },
    {
      id: "riskoff",
      name: "Risk-Off Router",
      summary: "Moves idle or unsafe exposure toward USDC/risk-off state when risk rules trigger.",
      enabled: false,
      requiredSources: ["market_price"],
      expectedCostUsd: 0,
      risk: "low",
      lastAction: "Disabled until user enables risk-off automation.",
    },
    {
      id: "arbwatcher",
      name: "Arb Watcher",
      summary: "Checks Arc/Base route only when budget and policy allow paid route inspection.",
      enabled: false,
      requiredSources: ["market_price"],
      expectedCostUsd: 0.05,
      risk: "high",
      lastAction: "Disabled by default; route execution is policy-gated.",
    },
  ];
}

export function createInitialControlState(
  workspaceId: WorkspaceId,
  budgetPatch: Partial<Pick<AgentBudget, "balanceUsd" | "dailyCapUsd" | "maxPerCallUsd" | "maxExposureUsd" | "spendTodayUsd" | "status">> = {},
): ControlState {
  if (workspaceId !== "agora") throw new Error(`unsupported_control_workspace:${workspaceId}`);
  const balanceUsd = usd(budgetPatch.balanceUsd ?? 0);
  const spendTodayUsd = usd(budgetPatch.spendTodayUsd ?? 0);
  const status = budgetPatch.status ?? (balanceUsd > 0 ? "active" : "empty");
  return {
    workspaceId: "agora",
    agentId: "agent_arc_arb",
    budget: {
      workspaceId: "agora",
      agentId: "agent_arc_arb",
      balanceUsd,
      dailyCapUsd: usd(budgetPatch.dailyCapUsd ?? 1),
      maxPerCallUsd: usd(budgetPatch.maxPerCallUsd ?? 0.5),
      maxExposureUsd: usd(budgetPatch.maxExposureUsd ?? 100),
      spendTodayUsd,
      status,
    },
    policy: {
      allowedSources: ["market_price", "oi_funding", "prediction_context", "social_news", "leader_feed"],
      blockedSources: [],
      allowedActions: ["READ_SOURCE", "BUILD_DECISION", "COPY", "HOLD", "REDUCE", "STOP", "MOVE_TO_USDC", "UNLOCK_REASONING"],
      requireApprovalAboveUsd: 0.05,
      autoExecute: false,
      staleSourceTimeoutMinutes: 15,
      sourceDivergenceLimit: 35,
    },
    strategies: defaultStrategies(),
    executionQueue: [],
    positions: [],
    receipts: [],
  };
}

function sourceAllowed(policy: AgentPolicy, sourceId: string): boolean {
  if (policy.blockedSources.includes(sourceId)) return false;
  return policy.allowedSources.length === 0 || policy.allowedSources.includes(sourceId);
}

function contributionSources(policy: AgentPolicy, sources: ControlSource[]): SourceContribution[] {
  return sources.map((source) => ({ ...source, policyAllowed: sourceAllowed(policy, source.id) && source.status !== "blocked" }));
}

export function decideFromSources(state: ControlState, sources: ControlSource[]): AgentDecision {
  const contributions = contributionSources(state.policy, sources);
  const usable = contributions.filter((source) => source.policyAllowed && source.status === "live");
  const leader = contributions.find((source) => source.group === "leader");
  const liveScore = usable.reduce((sum, source) => sum + source.contribution, 0);
  const stale = contributions.some((source) => source.status === "stale") || !usable.some((source) => source.group === "market");
  const risky = usable.some((source) => /stress|squeeze|diverg/i.test(source.signal));
  const hasLeader = leader?.status === "live" && leader.contribution > 0;
  const strategyId = hasLeader ? "copyguard" : "signalguard";
  const confidence = Math.min(94, Math.max(18, Math.round(liveScore)));
  const riskScore = Math.min(95, Math.max(8, Math.round(100 - liveScore + (risky ? 25 : 0))));
  const action: AgentAction = stale
    ? "STOP"
    : riskScore > 72
      ? "REDUCE"
      : confidence >= 48
        ? "COPY"
        : "MOVE_TO_USDC";
  const policyGate = state.policy.allowedActions.includes(action) ? "passed" : "blocked";
  const paidNeed = usable.reduce((sum, source) => source.payer === "agent_treasury" ? sum + source.costUsd : sum, 0);
  const remaining = Math.max(0, state.budget.dailyCapUsd - state.budget.spendTodayUsd);
  const budgetGate = paidNeed <= 0
    ? "not_required"
    : state.budget.status === "active" && state.budget.balanceUsd - state.budget.spendTodayUsd >= paidNeed && remaining >= paidNeed
      ? "passed"
      : "blocked";
  const riskGate = riskScore >= 85 ? "blocked" : "passed";
  const reason = hasLeader
    ? `CopyGuard found a verified leader feed and ${usable.length} live source layers.`
    : `SignalGuard mode: no verified leader feed is live, so ArcMind uses market/source evidence without inventing copy leaders.`;

  return {
    action,
    strategyId,
    confidence,
    riskScore,
    reason,
    sources: contributions,
    budgetGate,
    policyGate,
    riskGate,
    stale,
  };
}

export function buildActionDisclosure(state: ControlState, input: ControlActionInput): UserActionDisclosure {
  const fallbackBlocked = input.fundingMode === "fallback_local";
  const policyBlocked = !state.policy.allowedActions.includes(input.action);
  const sourceBlocked = !fallbackBlocked && Boolean(input.sourceId) && !sourceAllowed(state.policy, input.sourceId!);
  const treasuryNeeded = input.fundingMode === "agent_treasury";
  const amount = usd(input.amountUsd);
  const openExposure = state.positions.reduce((sum, position) => sum + position.exposureUsd, 0);
  const exposureBlocked = input.fundingMode === "user_strategy_vault" && input.action === "COPY" && amount > 0 && (
    amount > state.budget.maxExposureUsd || openExposure + amount > state.budget.maxExposureUsd
  );
  const remaining = Math.max(0, state.budget.dailyCapUsd - state.budget.spendTodayUsd);
  const budgetBlocked = treasuryNeeded && (
    state.budget.status !== "active" ||
    amount > state.budget.maxPerCallUsd ||
    amount > remaining ||
    amount > Math.max(0, state.budget.balanceUsd - state.budget.spendTodayUsd)
  );
  const liveStatus = fallbackBlocked || policyBlocked || sourceBlocked || budgetBlocked || exposureBlocked
      ? "blocked"
      : "live";
  const requiresSignature = input.fundingMode === "user_wallet" || input.fundingMode === "user_strategy_vault";
  const payerLabel = input.fundingMode === "agent_treasury"
    ? "Agent Treasury"
    : input.fundingMode === "user_wallet"
      ? "User wallet"
      : input.fundingMode === "user_strategy_vault"
        ? "User strategy vault"
        : input.fundingMode === "free_public"
          ? "Free public source"
          : "Legacy local path";
  const failReason = fallbackBlocked
    ? "fallback_local is legacy-only and blocked for new Arc actions; use a live wallet, contract or API path."
    : policyBlocked
      ? `Policy blocks ${input.action}. Allow it in Agent Budget or choose a manual action.`
      : sourceBlocked
      ? `Source ${input.sourceId} is blocked by policy. Allow it before the agent can spend on this source.`
    : budgetBlocked
      ? "Agent budget is empty, paused, above cap, or over today's remaining spend."
      : exposureBlocked
        ? `User strategy vault action exceeds max exposure ${usd(state.budget.maxExposureUsd).toFixed(2)} USDC.`
        : `${payerLabel} payment failed or was rejected. No hidden retry is executed.`;

  return {
    action: input.action,
    amountUsd: amount,
    payer: input.fundingMode,
    requiresSignature,
    liveStatus,
    onCancel: requiresSignature ? "User cancels the wallet request; no action is executed." : "Action is cancelled before execution; no funds move.",
    onFail: failReason,
    refundPath: input.fundingMode === "agent_treasury" ? "Failed autonomous spend remains in the spend log for review." : "Manual user action can be retried or left cancelled.",
  };
}

export function executeControlAction(state: ControlState, input: ControlActionInput): ControlState {
  const disclosure = buildActionDisclosure(state, input);
  const createdAt = nowIso();
  const status: ExecutionStatus = disclosure.liveStatus === "blocked" ? "blocked" : "completed";
  const receiptId = id("rcpt");
  const execution: ControlExecution = {
    id: id("exec"),
    action: input.action,
    strategyId: input.strategyId,
    sourceId: input.sourceId,
    amountUsd: disclosure.amountUsd,
    fundingMode: input.fundingMode,
    status,
    liveStatus: disclosure.liveStatus,
    receiptId,
    failureReason: status === "blocked" ? disclosure.onFail : undefined,
    createdAt,
  };
  const shouldSpend = status === "completed" && input.fundingMode === "agent_treasury" && disclosure.liveStatus === "live";
  const receipt: ControlReceipt = {
    id: receiptId,
    action: input.action,
    amountUsd: disclosure.amountUsd,
    fundingMode: input.fundingMode,
    strategyId: input.strategyId,
    sourceId: input.sourceId,
    liveStatus: disclosure.liveStatus,
    policySnapshot: state.policy,
    createdAt,
  };

  return {
    ...state,
    budget: shouldSpend
      ? {
        ...state.budget,
        spendTodayUsd: usd(state.budget.spendTodayUsd + disclosure.amountUsd),
        status: state.budget.balanceUsd - state.budget.spendTodayUsd - disclosure.amountUsd <= 0 ? "empty" : state.budget.status,
      }
      : state.budget,
    executionQueue: [execution, ...state.executionQueue].slice(0, 30),
    receipts: [receipt, ...state.receipts].slice(0, 50),
  };
}

export function appendControlReceipt(
  state: ControlState,
  action: ControlReceipt["action"],
  amountUsd: number,
  fundingMode: ControlFundingMode,
  liveStatus: ControlReceipt["liveStatus"],
  extra: Partial<Pick<ControlReceipt, "strategyId" | "sourceId" | "policyTarget">> = {},
): ControlState {
  const receipt: ControlReceipt = {
    id: id("rcpt"),
    action,
    amountUsd: usd(amountUsd),
    fundingMode,
    liveStatus,
    policySnapshot: state.policy,
    createdAt: nowIso(),
    ...extra,
  };
  return {
    ...state,
    receipts: [receipt, ...state.receipts].slice(0, 50),
  };
}

export function togglePolicyItem<T extends keyof Pick<AgentPolicy, "allowedSources" | "blockedSources" | "allowedActions">>(
  state: ControlState,
  key: T,
  value: AgentPolicy[T][number],
  enabled: boolean,
): ControlState {
  const list = state.policy[key] as string[];
  const nextList = enabled ? Array.from(new Set([...list, value as string])) : list.filter((item) => item !== value);
  return {
    ...state,
    policy: {
      ...state.policy,
      [key]: nextList,
    },
  };
}

export function updateBudget(state: ControlState, patch: Partial<AgentBudget>): ControlState {
  const balanceUsd = patch.balanceUsd === undefined ? state.budget.balanceUsd : usd(patch.balanceUsd);
  const spendTodayUsd = patch.spendTodayUsd === undefined ? state.budget.spendTodayUsd : usd(patch.spendTodayUsd);
  const status = patch.status ?? (balanceUsd <= spendTodayUsd ? "empty" : state.budget.status === "paused" ? "paused" : "active");
  return {
    ...state,
    budget: {
      ...state.budget,
      ...patch,
      balanceUsd,
      dailyCapUsd: patch.dailyCapUsd === undefined ? state.budget.dailyCapUsd : usd(patch.dailyCapUsd),
      maxPerCallUsd: patch.maxPerCallUsd === undefined ? state.budget.maxPerCallUsd : usd(patch.maxPerCallUsd),
      maxExposureUsd: patch.maxExposureUsd === undefined ? state.budget.maxExposureUsd : usd(patch.maxExposureUsd),
      spendTodayUsd,
      status,
    },
  };
}

export function updateStrategy(state: ControlState, strategyId: ControlStrategy["id"], patch: Partial<ControlStrategy>): ControlState {
  return {
    ...state,
    strategies: state.strategies.map((strategy) => strategy.id === strategyId ? { ...strategy, ...patch } : strategy),
  };
}

export function buildControlSnapshot(state: ControlState, sources: ControlSource[]) {
  const decision = decideFromSources(state, sources);
  const remainingTodayUsd = Math.max(0, state.budget.dailyCapUsd - state.budget.spendTodayUsd);
  const nextStep = state.budget.balanceUsd <= 0
    ? "Create Agent Budget before paid autonomous actions."
    : decision.policyGate === "blocked" || decision.riskGate === "blocked" || decision.budgetGate === "blocked"
      ? "Review blocked gates before approval."
      : "Review Decision Room, then approve once or enable strategy automation.";
  return {
    budget: {
      ...state.budget,
      remainingTodayUsd,
    },
    policy: state.policy,
    strategies: state.strategies,
    sources: contributionSources(state.policy, sources),
    decision,
    nextStep,
    developerOnly: {
      serviceCatalogVisible: false,
    },
  };
}
