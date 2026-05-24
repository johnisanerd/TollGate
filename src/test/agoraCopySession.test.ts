import { describe, expect, it } from "vitest";
import {
  createCopySession,
  pauseCopySession,
  reduceCopyAllocation,
  resumeCopySession,
  settleCopySession,
  triggerRiskExit,
} from "../workspaces/agora/copySession";

describe("Agora user-owned copy session", () => {
  it("creates a user-capital copy session without using Agent Treasury", () => {
    const session = createCopySession({
      stakeUsd: 25,
      riskProfile: "balanced",
      maxDrawdownPct: 12,
      autoExit: true,
      settlement: "fallback",
      source: "local",
    });

    expect(session.status).toBe("active");
    expect(session.fundingMode).toBe("wallet_per_call");
    expect(session.userCapital).toBe(true);
    expect(session.usesAgentTreasury).toBe(false);
    expect(session.withdrawableUsd).toBe(25);
  });

  it("pauses and resumes without changing withdrawable user capital", () => {
    const active = createCopySession({ stakeUsd: 10, riskProfile: "safe", maxDrawdownPct: 8, autoExit: true, settlement: "fallback", source: "local" });
    const paused = pauseCopySession(active);
    const resumed = resumeCopySession(paused);

    expect(paused.status).toBe("paused");
    expect(paused.withdrawableUsd).toBe(10);
    expect(resumed.status).toBe("active");
    expect(resumed.withdrawableUsd).toBe(10);
  });

  it("reduces allocation and moves reduced capital to withdrawable USDC", () => {
    const active = createCopySession({ stakeUsd: 100, riskProfile: "balanced", maxDrawdownPct: 15, autoExit: true, settlement: "fallback", source: "local" });
    const reduced = reduceCopyAllocation(active, 40);

    expect(reduced.status).toBe("active");
    expect(reduced.activeStakeUsd).toBe(60);
    expect(reduced.withdrawableUsd).toBe(40);
  });

  it("risk exit moves the session to pending settlement", () => {
    const active = createCopySession({ stakeUsd: 50, riskProfile: "safe", maxDrawdownPct: 10, autoExit: true, settlement: "fallback", source: "local" });
    const exited = triggerRiskExit(active, "drawdown 10.4% crossed user threshold");

    expect(exited.status).toBe("risk_exit_pending");
    expect(exited.lastAction).toContain("drawdown");
    expect(exited.withdrawableUsd).toBe(50);
  });

  it("settles and marks the full remaining amount withdrawable", () => {
    const active = createCopySession({ stakeUsd: 20, riskProfile: "aggressive", maxDrawdownPct: 20, autoExit: false, settlement: "fallback", source: "local" });
    const settled = settleCopySession(active, 1.25);

    expect(settled.status).toBe("settled");
    expect(settled.realizedPnlUsd).toBe(1.25);
    expect(settled.activeStakeUsd).toBe(0);
    expect(settled.withdrawableUsd).toBe(21.25);
  });

  it("rejects stake below the user-facing minimum", () => {
    expect(() => createCopySession({ stakeUsd: 0.5, riskProfile: "safe", maxDrawdownPct: 8, autoExit: true, settlement: "fallback", source: "local" })).toThrow("stake_below_minimum");
  });
});
