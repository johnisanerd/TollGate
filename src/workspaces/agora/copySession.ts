export type CopySessionStatus =
  | "idle"
  | "wallet_connected"
  | "funding_required"
  | "active"
  | "paused"
  | "risk_exit_pending"
  | "settled"
  | "withdrawn"
  | "failed";

export type CopyRiskProfile = "safe" | "balanced" | "aggressive";

export type CopySession = {
  id: string;
  status: CopySessionStatus;
  stakeUsd: number;
  activeStakeUsd: number;
  withdrawableUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  riskProfile: CopyRiskProfile;
  maxDrawdownPct: number;
  autoExit: boolean;
  fundingMode: "wallet_per_call";
  userCapital: true;
  usesAgentTreasury: false;
  settlement: "live" | "fallback";
  source: "live" | "local";
  createdAt: string;
  updatedAt: string;
  lastAction: string;
};

export function copySessionKey(workspaceId: string): string {
  return `arcmind-copy-session-${workspaceId}`;
}

export type CreateCopySessionInput = {
  stakeUsd: number;
  riskProfile: CopyRiskProfile;
  maxDrawdownPct: number;
  autoExit: boolean;
  settlement: "live" | "fallback";
  source: "live" | "local";
  now?: Date;
};

function roundUsd(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

function iso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function nextId(now?: Date): string {
  const seed = (now ?? new Date()).getTime().toString(36);
  return `copy_${seed}_${Math.random().toString(36).slice(2, 8)}`;
}

function touch(session: CopySession, patch: Partial<CopySession>, action: string): CopySession {
  return {
    ...session,
    ...patch,
    updatedAt: iso(),
    lastAction: action,
  };
}

export function createCopySession(input: CreateCopySessionInput): CopySession {
  if (!Number.isFinite(input.stakeUsd) || input.stakeUsd < 1) {
    throw new Error("stake_below_minimum");
  }
  const stakeUsd = roundUsd(input.stakeUsd);
  const createdAt = iso(input.now);
  return {
    id: nextId(input.now),
    status: "active",
    stakeUsd,
    activeStakeUsd: stakeUsd,
    withdrawableUsd: stakeUsd,
    unrealizedPnlUsd: 0,
    realizedPnlUsd: 0,
    riskProfile: input.riskProfile,
    maxDrawdownPct: Math.max(1, Math.min(50, input.maxDrawdownPct)),
    autoExit: input.autoExit,
    fundingMode: "wallet_per_call",
    userCapital: true,
    usesAgentTreasury: false,
    settlement: input.settlement,
    source: input.source,
    createdAt,
    updatedAt: createdAt,
    lastAction: input.settlement === "live"
      ? "User wallet staked USDC into copy strategy."
      : "Local fallback session created. No live custody claim is made.",
  };
}

export function pauseCopySession(session: CopySession): CopySession {
  if (session.status !== "active") return session;
  return touch(session, { status: "paused" }, "Paused by user. New exposure is blocked; existing session remains withdrawable.");
}

export function resumeCopySession(session: CopySession): CopySession {
  if (session.status !== "paused") return session;
  return touch(session, { status: "active" }, "Resumed by user. Risk guard remains armed.");
}

export function reduceCopyAllocation(session: CopySession, reducePct: number): CopySession {
  if (session.status !== "active" && session.status !== "paused") return session;
  const pct = Math.max(0, Math.min(100, reducePct));
  const reduction = roundUsd(session.activeStakeUsd * (pct / 100));
  const activeStakeUsd = roundUsd(session.activeStakeUsd - reduction);
  const withdrawableUsd = roundUsd(session.stakeUsd - activeStakeUsd + session.realizedPnlUsd);
  return touch(
    session,
    { activeStakeUsd, withdrawableUsd },
    `Reduced active allocation by ${pct.toFixed(0)}%. Reduced capital moved to withdrawable USDC state.`,
  );
}

export function triggerRiskExit(session: CopySession, reason: string): CopySession {
  if (session.status !== "active" && session.status !== "paused") return session;
  return touch(
    session,
    {
      status: "risk_exit_pending",
      withdrawableUsd: roundUsd(session.activeStakeUsd + session.unrealizedPnlUsd),
      activeStakeUsd: 0,
    },
    `Risk exit triggered: ${reason}`,
  );
}

export function settleCopySession(session: CopySession, realizedPnlUsd: number): CopySession {
  if (session.status === "settled" || session.status === "withdrawn") return session;
  const realized = Math.round(realizedPnlUsd * 100) / 100;
  return touch(
    session,
    {
      status: "settled",
      activeStakeUsd: 0,
      unrealizedPnlUsd: 0,
      realizedPnlUsd: realized,
      withdrawableUsd: roundUsd(session.activeStakeUsd + realized),
    },
    "Session settled. Remaining user capital is withdrawable.",
  );
}

export function withdrawCopySession(session: CopySession): CopySession {
  if (session.status !== "settled" && session.status !== "risk_exit_pending") return session;
  return touch(
    session,
    {
      status: "withdrawn",
      activeStakeUsd: 0,
      withdrawableUsd: 0,
    },
    "Withdrawn by user. Local session closed.",
  );
}
