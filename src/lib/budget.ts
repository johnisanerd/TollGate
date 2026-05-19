/** AgentBudget client — per-agent spending policy enforcement.
 *
 * Mirrors AgentBudget.sol on-chain logic client-side for demo purposes.
 * When VITE_AGENT_BUDGET_ADDRESS is set, calls are forwarded to the contract.
 * Otherwise, policy + log live in localStorage (same keys as BudgetWidget.tsx).
 */

export type BudgetPolicy = {
  dailyLimitUsd: number;
  maxPerTxUsd: number;
  paused: boolean;
};

export type TreasuryTopUp = {
  id: string;
  amount: number;
  ts: string;
  source: "wallet_signature" | "local_admin";
  signature?: string;
};

export type TreasuryState = {
  fundedUsd: number;
  spentUsd: number;
  availableUsd: number;
  topUps: TreasuryTopUp[];
};

export type BudgetTx = {
  id: string;
  amount: number;
  ts: string;
  ok: boolean;
  reason?: string;
};

function policyKey(agentId: string)  { return `budget.policy.${agentId}`; }
function logKey(agentId: string)     { return `budget.txLog.${agentId}`; }
function treasuryKey(agentId: string) { return `budget.treasury.${agentId}`; }

const DEFAULT_POLICY: BudgetPolicy = { dailyLimitUsd: 1.0, maxPerTxUsd: 0.5, paused: false };

export function getPolicy(agentId: string): BudgetPolicy {
  try {
    const raw = localStorage.getItem(policyKey(agentId));
    return raw ? (JSON.parse(raw) as BudgetPolicy) : { ...DEFAULT_POLICY };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export function setLimit(agentId: string, dailyLimitUsd: number, maxPerTxUsd: number): void {
  const policy = getPolicy(agentId);
  const updated: BudgetPolicy = {
    ...policy,
    dailyLimitUsd: Math.max(0, dailyLimitUsd),
    maxPerTxUsd: Math.max(0, maxPerTxUsd),
  };
  localStorage.setItem(policyKey(agentId), JSON.stringify(updated));
}

export function setPaused(agentId: string, paused: boolean): void {
  const policy = getPolicy(agentId);
  localStorage.setItem(policyKey(agentId), JSON.stringify({ ...policy, paused }));
}

export function getTxLog(agentId: string): BudgetTx[] {
  try {
    const raw = localStorage.getItem(logKey(agentId));
    return raw ? (JSON.parse(raw) as BudgetTx[]) : [];
  } catch {
    return [];
  }
}

export function getTreasuryTopUps(agentId: string): TreasuryTopUp[] {
  try {
    const raw = localStorage.getItem(treasuryKey(agentId));
    return raw ? (JSON.parse(raw) as TreasuryTopUp[]) : [];
  } catch {
    return [];
  }
}

export function getTreasuryState(agentId: string): TreasuryState {
  const topUps = getTreasuryTopUps(agentId);
  const fundedUsd = topUps.reduce((sum, item) => sum + item.amount, 0);
  const spentUsd = spentToday(getTxLog(agentId));
  return {
    fundedUsd,
    spentUsd,
    availableUsd: Math.max(0, fundedUsd - spentUsd),
    topUps,
  };
}

export function fundTreasury(agentId: string, amountUsd: number, signature?: string): TreasuryTopUp {
  const topUp: TreasuryTopUp = {
    id: "topup_" + Math.random().toString(36).slice(2, 10),
    amount: Math.max(0, amountUsd),
    ts: new Date().toISOString(),
    source: signature ? "wallet_signature" : "local_admin",
    signature,
  };
  try {
    const updated = [topUp, ...getTreasuryTopUps(agentId)].slice(0, 20);
    localStorage.setItem(treasuryKey(agentId), JSON.stringify(updated));
  } catch { /* storage unavailable */ }
  return topUp;
}

function spentToday(log: BudgetTx[]): number {
  const cutoff = Date.now() - 86_400_000;
  return log
    .filter((t) => t.ok && new Date(t.ts).getTime() > cutoff)
    .reduce((s, t) => s + t.amount, 0);
}

/** Check whether a payment of `amountUsd` would be allowed under the current policy.
 *  Returns { ok: true } or { ok: false, reason: string }. */
export function checkBudget(agentId: string, amountUsd: number): { ok: boolean; reason?: string } {
  const policy = getPolicy(agentId);
  if (policy.paused) return { ok: false, reason: "agent_paused" };
  const treasury = getTreasuryState(agentId);
  if (amountUsd > treasury.availableUsd) {
    return { ok: false, reason: `treasury_insufficient (available $${treasury.availableUsd.toFixed(2)}, needs $${amountUsd.toFixed(2)})` };
  }
  if (policy.maxPerTxUsd > 0 && amountUsd > policy.maxPerTxUsd) {
    return { ok: false, reason: `exceeds_max_per_tx ($${amountUsd.toFixed(2)} > $${policy.maxPerTxUsd.toFixed(2)})` };
  }
  const log = getTxLog(agentId);
  const spent = spentToday(log);
  const remaining = Math.max(0, policy.dailyLimitUsd - spent);
  if (policy.dailyLimitUsd > 0 && amountUsd > remaining) {
    return { ok: false, reason: `exceeds_daily_limit (remaining $${remaining.toFixed(2)})` };
  }
  return { ok: true };
}

/** Record a simulated spend. Returns the tx entry. */
export function spend(agentId: string, amountUsd: number): BudgetTx {
  const check = checkBudget(agentId, amountUsd);
  const tx: BudgetTx = {
    id: "sim_" + Math.random().toString(36).slice(2, 10),
    amount: amountUsd,
    ts: new Date().toISOString(),
    ok: check.ok,
    reason: check.reason,
  };
  try {
    const log = getTxLog(agentId);
    const updated = [tx, ...log].slice(0, 20);
    localStorage.setItem(logKey(agentId), JSON.stringify(updated));
  } catch { /* storage unavailable */ }
  return tx;
}

/** How much is remaining for `agentId` today. */
export function getRemainingToday(agentId: string): number {
  const policy = getPolicy(agentId);
  const log = getTxLog(agentId);
  return Math.max(0, policy.dailyLimitUsd - spentToday(log));
}
