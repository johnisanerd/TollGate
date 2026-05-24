import test from "node:test";
import assert from "node:assert/strict";
import {
  allowControlSource,
  cancelControlExecution,
  getArcControlState,
  mutateControlPosition,
  refreshControlSources,
  resetArcControlState,
  retryControlExecution,
  runControlAction,
  setControlActionAllowed,
  setControlStrategy,
  approveLatestControlDecision,
  setRiskGuardMode,
  triggerRiskEmergencyExit,
  topUpAgentBudget,
  updateAgentPolicy,
  withdrawAgentBudget,
} from "./arc-control.js";

test("Arc control starts with empty treasury and SignalGuard mode", () => {
  const state = resetArcControlState();
  assert.equal(state.budget.workspaceId, "agora");
  assert.equal(state.budget.balanceUsd, 0);
  assert.equal(state.latestDecision.strategyId, "signalguard");
  assert.equal(state.latestDecision.action, "STOP");
});

test("paid autonomous action is blocked without Agent Budget", () => {
  resetArcControlState();
  const state = runControlAction("READ_SOURCE", { amountUsd: 0.01, fundingMode: "agent_treasury", sourceId: "social_news" });
  assert.equal(state.executions[0]?.status, "failed");
  assert.match(state.executions[0]?.failureReason ?? "", /Agent Budget/);
  assert.equal(state.budget.spendTodayUsd, 0);
});

test("blocked source creates a blocked execution receipt and never spends treasury", () => {
  resetArcControlState();
  topUpAgentBudget(1);
  allowControlSource("social_news", false);
  const state = runControlAction("READ_SOURCE", { amountUsd: 0.01, fundingMode: "agent_treasury", sourceId: "social_news" });
  assert.equal(state.executions[0]?.status, "blocked");
  assert.match(state.executions[0]?.failureReason ?? "", /Source social_news is blocked/);
  assert.equal(state.receipts[0]?.liveStatus, "blocked");
  assert.equal(state.receipts[0]?.sourceId, "social_news");
  assert.equal(state.budget.spendTodayUsd, 0);
});

test("max exposure blocks user vault copy without touching agent treasury", () => {
  resetArcControlState();
  topUpAgentBudget(1, { txHash: "0x" + "1".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  updateAgentPolicy({ maxExposureUsd: 50 });
  const state = runControlAction("COPY", { amountUsd: 75, fundingMode: "user_strategy_vault", strategyId: "copyguard" });
  assert.equal(state.executions[0]?.status, "blocked");
  assert.match(state.executions[0]?.failureReason ?? "", /max exposure/);
  assert.equal(state.receipts[0]?.fundingMode, "user_strategy_vault");
  assert.equal(state.budget.spendTodayUsd, 0);
});

test("top up without a live tx hash is blocked and does not fund treasury", () => {
  resetArcControlState();
  const blocked = topUpAgentBudget(1);
  assert.equal(blocked.budget.balanceUsd, 0);
  assert.equal(blocked.receipts[0]?.liveStatus, "blocked");
  assert.equal(blocked.receipts[0]?.action, "BUDGET_TOP_UP");
});

test("live top up enables treasury spend and withdraw requires a live tx hash", () => {
  resetArcControlState();
  topUpAgentBudget(1, { txHash: "0x" + "1".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  const afterSpend = runControlAction("READ_SOURCE", { amountUsd: 0.01, fundingMode: "agent_treasury", sourceId: "social_news" });
  assert.equal(afterSpend.executions[0]?.status, "completed");
  assert.equal(afterSpend.budget.spendTodayUsd, 0.01);
  const blockedWithdraw = withdrawAgentBudget(0.5);
  assert.equal(blockedWithdraw.budget.balanceUsd, 1);
  assert.equal(blockedWithdraw.receipts[0]?.liveStatus, "blocked");
  const afterWithdraw = withdrawAgentBudget(0.5, { txHash: "0x" + "2".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  assert.equal(afterWithdraw.budget.balanceUsd, 0.5);
  assert.equal(afterWithdraw.receipts[0]?.action, "BUDGET_WITHDRAW");
  assert.equal(afterWithdraw.receipts[0]?.liveStatus, "live");
});

test("fallback_local is rejected for new Arc actions and never creates a fallback receipt", () => {
  resetArcControlState();
  topUpAgentBudget(1, { txHash: "0x" + "1".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  const state = runControlAction("RUN_ARB_CHECK", { amountUsd: 0.05, fundingMode: "fallback_local", sourceId: "developer_paid" });
  assert.equal(state.executions[0]?.status, "blocked");
  assert.equal(state.executions[0]?.liveStatus, "blocked");
  assert.match(state.executions[0]?.failureReason ?? "", /fallback_local/);
  assert.notEqual(state.receipts[0]?.liveStatus, "fallback");
  assert.equal(state.budget.spendTodayUsd, 0);
});

test("policy can block sources, actions and strategy automation", () => {
  resetArcControlState();
  let state = allowControlSource("social_news", false);
  assert.ok(state.policy.blockedSources.includes("social_news"));
  assert.equal(state.receipts[0]?.action, "POLICY_UPDATE");
  assert.equal(state.receipts[0]?.sourceId, "social_news");
  state = setControlActionAllowed("RUN_ARB_CHECK", false);
  assert.equal(state.receipts[0]?.action, "POLICY_UPDATE");
  assert.equal(state.receipts[0]?.policyTarget, "RUN_ARB_CHECK");
  state = runControlAction("RUN_ARB_CHECK", { amountUsd: 0.05, fundingMode: "agent_treasury" });
  assert.equal(state.executions[0]?.status, "failed");
  state = setControlStrategy("arbwatcher", true, true);
  assert.equal(state.strategies.find((s) => s.id === "arbwatcher")?.autoRun, true);
  assert.equal(state.receipts[0]?.action, "STRATEGY_ENABLE");
  state = setControlStrategy("arbwatcher", false);
  assert.equal(state.receipts[0]?.action, "STRATEGY_DISABLE");
});

test("source refresh updates decision and positions stay user-vault funded", () => {
  resetArcControlState();
  let state = refreshControlSources([
    { id: "market_price", status: "live", contribution: 35, signal: "ETH quote live." },
    { id: "oi_funding", status: "live", contribution: 22, signal: "OI funding live." },
  ]);
  assert.equal(state.latestDecision.action, "HOLD");
  state = mutateControlPosition("open");
  assert.equal(state.positions.length, 0);
  assert.equal(state.receipts[0]?.liveStatus, "blocked");
  assert.equal(state.receipts[0]?.action, "POSITION_OPEN");
});

test("failed execution can be retried after funding", () => {
  resetArcControlState();
  let state = runControlAction("READ_SOURCE", { amountUsd: 0.01, fundingMode: "agent_treasury", sourceId: "social_news" });
  const failedId = state.executions[0]?.id;
  assert.ok(failedId);
  topUpAgentBudget(1, { txHash: "0x" + "1".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  state = retryControlExecution(failedId);
  assert.equal(getArcControlState(), state);
  assert.equal(state.executions[0]?.status, "completed");
});

test("cancelled executions create an audit receipt", () => {
  resetArcControlState();
  let state = runControlAction("READ_SOURCE", { amountUsd: 0.01, fundingMode: "agent_treasury", sourceId: "social_news" });
  const executionId = state.executions[0]?.id;
  assert.ok(executionId);
  state = cancelControlExecution(executionId);
  assert.equal(state.executions.find((exec) => exec.id === executionId)?.status, "cancelled");
  assert.equal(state.receipts[0]?.action, "EXECUTION_CANCEL");
  assert.equal(state.receipts[0]?.liveStatus, "blocked");
});

test("stale or blocked decision cannot be approved into execution", () => {
  resetArcControlState();
  topUpAgentBudget(1, { txHash: "0x" + "1".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  refreshControlSources([{ id: "market_price", status: "stale" as never, contribution: 0, signal: "Market price is stale." }]);
  const state = approveLatestControlDecision({ amountUsd: 0, fundingMode: "user_strategy_vault" });
  assert.equal(state.executions[0]?.status, "blocked");
  assert.match(state.executions[0]?.failureReason ?? "", /decision gates/i);
  assert.equal(state.receipts[0]?.liveStatus, "blocked");
  assert.equal(state.budget.spendTodayUsd, 0);
});

test("risk emergency exit pauses Agent Budget and moves positions to withdrawable state", () => {
  resetArcControlState();
  topUpAgentBudget(2, { txHash: "0x" + "1".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  mutateControlPosition("open", undefined, { txHash: "0x" + "3".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  const state = triggerRiskEmergencyExit("test emergency", { txHash: "0x" + "4".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  assert.equal(state.budget.status, "paused");
  assert.equal(state.positions[0]?.exposureUsd, 0);
  assert.equal(state.positions[0]?.riskStatus, "exit_pending");
  assert.equal(state.receipts[0]?.action, "RISK_EXIT");
  assert.equal(state.receipts[0]?.fundingMode, "user_strategy_vault");
});

test("risk guard arm, disarm and reset create audit receipts", () => {
  resetArcControlState();
  topUpAgentBudget(2, { txHash: "0x" + "1".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  mutateControlPosition("open", undefined, { txHash: "0x" + "3".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  let state = setRiskGuardMode("disarm", { txHash: "0x" + "4".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  assert.equal(state.budget.status, "paused");
  assert.equal(state.receipts[0]?.action, "RISK_UPDATE");
  state = setRiskGuardMode("arm", { txHash: "0x" + "5".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  assert.equal(state.budget.status, "active");
  assert.equal(state.receipts[0]?.action, "RISK_UPDATE");
  triggerRiskEmergencyExit("test reset", { txHash: "0x" + "6".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  state = setRiskGuardMode("reset", { txHash: "0x" + "7".repeat(64), walletAddress: "0x1111111111111111111111111111111111111111" });
  assert.equal(state.budget.status, "active");
  assert.equal(state.positions[0]?.riskStatus, "safe");
  assert.equal(state.receipts[0]?.action, "RISK_UPDATE");
});
