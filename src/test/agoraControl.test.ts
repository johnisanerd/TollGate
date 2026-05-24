import { beforeEach, describe, expect, it } from "vitest";

import {
  buildActionDisclosure,
  buildControlSnapshot,
  createInitialControlState,
  decideFromSources,
  executeControlAction,
  togglePolicyItem,
  type AgentAction,
  type ControlSource,
} from "../workspaces/agora/control";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

function freshStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
}

const liveSources: ControlSource[] = [
  { id: "market_price", label: "Market Price", group: "market", status: "live", costUsd: 0, payer: "free_public", contribution: 30, signal: "ETH price stable", lastUpdated: "now" },
  { id: "oi_funding", label: "OI / Funding", group: "derivatives", status: "live", costUsd: 0.002, payer: "agent_treasury", contribution: 24, signal: "OI expanding without extreme funding", lastUpdated: "now" },
  { id: "leader_feed", label: "Leader Feed", group: "leader", status: "unavailable", costUsd: 0, payer: "free_public", contribution: 0, signal: "No verified leader feed configured", lastUpdated: "not configured" },
];

describe("Agora ArcMind Control Layer", () => {
  beforeEach(freshStorage);

  it("starts as a user-first control layer with empty agent budget and enabled core strategies", () => {
    const state = createInitialControlState("agora");

    expect(state.budget.balanceUsd).toBe(0);
    expect(state.budget.status).toBe("empty");
    expect(state.strategies.find((s) => s.id === "copyguard")?.enabled).toBe(true);
    expect(state.policy.allowedActions).toContain("BUILD_DECISION");
    expect(state.policy.allowedActions).toContain("COPY");
  });

  it("builds SignalGuard decisions without inventing copy leaders when leader feed is unavailable", () => {
    const state = createInitialControlState("agora");
    const decision = decideFromSources(state, liveSources);

    expect(decision.strategyId).toBe("signalguard");
    expect(decision.action).toBe("COPY");
    expect(decision.reason).toContain("SignalGuard");
    expect(decision.sources.find((s) => s.id === "leader_feed")?.status).toBe("unavailable");
  });

  it("blocks a paid autonomous action when the agent budget is empty", () => {
    const state = createInitialControlState("agora");
    const next = executeControlAction(state, {
      action: "READ_SOURCE",
      amountUsd: 0.002,
      fundingMode: "agent_treasury",
      sourceId: "oi_funding",
    });

    expect(next.executionQueue[0].status).toBe("blocked");
    expect(next.executionQueue[0].failureReason).toContain("budget");
    expect(next.budget.spendTodayUsd).toBe(0);
  });

  it("writes an audit receipt when a paid source is blocked by policy", () => {
    const state = createInitialControlState("agora", { balanceUsd: 1 });
    const blocked = togglePolicyItem(state, "blockedSources", "oi_funding", true);
    const next = executeControlAction(blocked, {
      action: "READ_SOURCE",
      amountUsd: 0.002,
      fundingMode: "agent_treasury",
      sourceId: "oi_funding",
    });

    expect(next.executionQueue[0].status).toBe("blocked");
    expect(next.executionQueue[0].failureReason).toContain("Source oi_funding is blocked");
    expect(next.receipts[0].liveStatus).toBe("blocked");
    expect(next.receipts[0].sourceId).toBe("oi_funding");
    expect(next.budget.spendTodayUsd).toBe(0);
  });

  it("blocks user vault exposure above the max exposure rule without spending Agent Budget", () => {
    const state = createInitialControlState("agora", { balanceUsd: 1, maxExposureUsd: 50 });
    const next = executeControlAction(state, {
      action: "COPY",
      amountUsd: 75,
      fundingMode: "user_strategy_vault",
      strategyId: "copyguard",
    });

    expect(next.executionQueue[0].status).toBe("blocked");
    expect(next.executionQueue[0].failureReason).toContain("max exposure");
    expect(next.receipts[0].fundingMode).toBe("user_strategy_vault");
    expect(next.budget.spendTodayUsd).toBe(0);
  });

  it("blocks fallback_local actions instead of creating local receipts", () => {
    const state = createInitialControlState("agora", { balanceUsd: 1 });
    const next = executeControlAction(state, {
      action: "RUN_ARB_CHECK",
      amountUsd: 0.05,
      fundingMode: "fallback_local",
      strategyId: "arbwatcher",
    });

    expect(next.executionQueue[0].status).toBe("blocked");
    expect(next.executionQueue[0].liveStatus).toBe("blocked");
    expect(next.executionQueue[0].failureReason).toContain("fallback_local");
    expect(next.budget.spendTodayUsd).toBe(0);
    expect(next.budget.balanceUsd).toBe(1);
  });

  it("lets policy block an otherwise valid action", () => {
    const state = createInitialControlState("agora", { balanceUsd: 1 });
    const blocked = togglePolicyItem(state, "allowedActions", "COPY" satisfies AgentAction, false);
    const disclosure = buildActionDisclosure(blocked, {
      action: "COPY",
      amountUsd: 0,
      fundingMode: "user_strategy_vault",
      strategyId: "copyguard",
    });

    expect(disclosure.liveStatus).toBe("blocked");
    expect(disclosure.onFail).toContain("Policy blocks");
  });

  it("builds a complete snapshot for user tabs without developer endpoint dependency", () => {
    const state = createInitialControlState("agora", { balanceUsd: 2 });
    const snapshot = buildControlSnapshot(state, liveSources);

    expect(snapshot.nextStep).toContain("Review");
    expect(snapshot.decision.sources.length).toBeGreaterThan(0);
    expect(snapshot.budget.remainingTodayUsd).toBeGreaterThan(0);
    expect(snapshot.developerOnly.serviceCatalogVisible).toBe(false);
  });
});
