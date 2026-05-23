/**
 * Smoke tests for @arcmind/agent — verify the ElizaOS-compatible runtime,
 * actions, and evaluator wire together correctly with deterministic state.
 */

import { describe, expect, it } from "vitest";
import {
  arcMindCharacter,
  createMinimalRuntime,
  decideEthDirectionAction,
  decisionAccuracyEvaluator,
  strategyDegradationEvaluator,
  computeDegradation,
} from "../../packages/arcmind-agent/src/index";
import type { Memory } from "../../packages/arcmind-agent/src/index";

describe("@arcmind/agent runtime", () => {
  it("creates a runtime with the bundled character", () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    expect(runtime.character.name).toBe("ArcMind");
    expect(typeof runtime.agentId).toBe("string");
    expect(runtime.character.settings?.["decisionIntervalMs"]).toBeGreaterThan(0);
  });

  it("decideEthDirection picks BUY on positive ETH change + positive funding", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3500, ethChange24h: 1.5, hlOiUsd: 1_200_000_000, hlFundingRate: 0.0005, leaderFeedStatus: "missing" };

    expect(await decideEthDirectionAction.validate(runtime, undefined, state)).toBe(true);
    const result = await decideEthDirectionAction.handler(runtime, undefined, state);
    expect(result.success).toBe(true);
    expect(result.data?.["decision"]).toBe("BUY");
    expect(result.text).toMatch(/BUY:/);
  });

  it("decideEthDirection picks SELL on negative ETH change + negative funding", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3300, ethChange24h: -2.0, hlOiUsd: 1_100_000_000, hlFundingRate: -0.0005, leaderFeedStatus: "missing" };
    const result = await decideEthDirectionAction.handler(runtime, undefined, state);
    expect(result.data?.["decision"]).toBe("SELL");
  });

  it("decideEthDirection picks HOLD when signals conflict", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3400, ethChange24h: 0.01, hlOiUsd: 0, hlFundingRate: 0, leaderFeedStatus: "missing" };
    const result = await decideEthDirectionAction.handler(runtime, undefined, state);
    expect(result.data?.["decision"]).toBe("HOLD");
  });

  it("rejects validation when price is missing", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 0 };
    expect(await decideEthDirectionAction.validate(runtime, undefined, state)).toBe(false);
  });

  it("persists decision memory and surfaces via getMemories", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3500, ethChange24h: 1.5, hlFundingRate: 0.0005 };
    await decideEthDirectionAction.handler(runtime, undefined, state);
    const memories = await runtime.getMemories({ roomId: runtime.agentId, count: 1 });
    expect(memories).toHaveLength(1);
    expect(memories[0].content.action).toBe("DECIDE_ETH_DIRECTION");
  });

  it("evaluator scores 100 when BUY was followed by price up-tick", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const buyState = await runtime.composeState();
    buyState.values = { ethPrice: 3500, ethChange24h: 1.5, hlFundingRate: 0.0005 };
    await decideEthDirectionAction.handler(runtime, undefined, buyState);

    const followState = await runtime.composeState();
    followState.values = { ethPrice: 3600, ethChange24h: 2.8, hlFundingRate: 0.0006 };
    await decideEthDirectionAction.handler(runtime, undefined, followState);

    const result = await decisionAccuracyEvaluator.handler(runtime, undefined, followState);
    expect(result.score).toBe(100);
  });

  it("evaluator scores 0 when SELL was followed by price up-tick", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const sellState = await runtime.composeState();
    sellState.values = { ethPrice: 3500, ethChange24h: -1.5, hlFundingRate: -0.0005 };
    await decideEthDirectionAction.handler(runtime, undefined, sellState);

    const followState = await runtime.composeState();
    followState.values = { ethPrice: 3600, ethChange24h: 0.5, hlFundingRate: 0.0001 };
    await decideEthDirectionAction.handler(runtime, undefined, followState);

    const result = await decisionAccuracyEvaluator.handler(runtime, undefined, followState);
    expect(result.score).toBe(0);
  });

  it("getSetting reads from injected settings before process.env", () => {
    const runtime = createMinimalRuntime({
      character: arcMindCharacter,
      settings: { CUSTOM_KEY: "test-value" },
    });
    expect(runtime.getSetting("CUSTOM_KEY")).toBe("test-value");
    expect(runtime.getSetting("ABSOLUTELY_UNSET_KEY_xyz123")).toBeNull();
  });
});

function mkDecision(decision: "BUY" | "SELL" | "HOLD", ethPrice: number, ts: string): Memory {
  return {
    id: `${ts}-${decision}`,
    userId: "agent",
    agentId: "agent",
    roomId: "agent",
    content: { text: `${decision} @ ${ethPrice}`, action: "DECIDE_ETH_DIRECTION", metadata: { decision, ethPrice, ts } },
    createdAt: new Date(ts).getTime(),
  } as unknown as Memory;
}

describe("strategyDegradationEvaluator / computeDegradation", () => {
  it("returns ok when wins dominate within window", () => {
    const now = Date.now();
    const memories: Memory[] = [
      mkDecision("BUY", 3000, new Date(now - 6 * 86_400_000).toISOString()),
      mkDecision("BUY", 3100, new Date(now - 5 * 86_400_000).toISOString()),
      mkDecision("BUY", 3200, new Date(now - 4 * 86_400_000).toISOString()),
      mkDecision("BUY", 3300, new Date(now - 3 * 86_400_000).toISOString()),
    ];
    const stats = computeDegradation(memories, 40);
    expect(stats.graded).toBe(3);
    expect(stats.wins).toBe(3);
    expect(stats.winRatePct).toBe(100);
    expect(stats.recommendation).toBe("ok");
  });

  it("returns degraded when win-rate drops below pause threshold", () => {
    const now = Date.now();
    const memories: Memory[] = [
      mkDecision("BUY", 3300, new Date(now - 6 * 86_400_000).toISOString()),
      mkDecision("BUY", 3200, new Date(now - 5 * 86_400_000).toISOString()),
      mkDecision("BUY", 3100, new Date(now - 4 * 86_400_000).toISOString()),
      mkDecision("BUY", 3000, new Date(now - 3 * 86_400_000).toISOString()),
    ];
    const stats = computeDegradation(memories, 40);
    expect(stats.graded).toBe(3);
    expect(stats.wins).toBe(0);
    expect(stats.winRatePct).toBe(0);
    expect(stats.recommendation).toBe("degraded");
  });

  it("returns watch when within 10% of pause threshold", () => {
    const now = Date.now();
    // 3 wins / 7 graded ≈ 42.9% → between 40% (degraded) and 50% (ok) = watch
    const memories: Memory[] = [
      mkDecision("BUY", 3000, new Date(now - 7 * 86_400_000 + 60_000).toISOString()),
      mkDecision("BUY", 3100, new Date(now - 6 * 86_400_000).toISOString()), // pair0 win
      mkDecision("BUY", 3000, new Date(now - 5 * 86_400_000).toISOString()), // pair1 loss
      mkDecision("BUY", 3100, new Date(now - 4 * 86_400_000).toISOString()), // pair2 win
      mkDecision("BUY", 3000, new Date(now - 3 * 86_400_000).toISOString()), // pair3 loss
      mkDecision("BUY", 3100, new Date(now - 2 * 86_400_000).toISOString()), // pair4 win
      mkDecision("BUY", 3000, new Date(now - 1 * 86_400_000).toISOString()), // pair5 loss
      mkDecision("BUY", 3000, new Date(now - 0.5 * 86_400_000).toISOString()), // pair6 loss (3000=3000 → !priceUp)
    ];
    const stats = computeDegradation(memories, 40);
    expect(stats.graded).toBe(7);
    expect(stats.wins).toBe(3);
    expect(stats.recommendation).toBe("watch");
  });

  it("ignores decisions older than 7d window", () => {
    const now = Date.now();
    const memories: Memory[] = [
      mkDecision("BUY", 3000, new Date(now - 30 * 86_400_000).toISOString()),
      mkDecision("BUY", 3500, new Date(now - 29 * 86_400_000).toISOString()),
    ];
    const stats = computeDegradation(memories, 40);
    expect(stats.totalDecisions).toBe(0);
    expect(stats.recommendation).toBe("ok"); // insufficient data
  });

  it("HOLD decisions are not graded", () => {
    const now = Date.now();
    const memories: Memory[] = [
      mkDecision("HOLD", 3000, new Date(now - 5 * 86_400_000).toISOString()),
      mkDecision("HOLD", 3200, new Date(now - 4 * 86_400_000).toISOString()),
      mkDecision("HOLD", 3400, new Date(now - 3 * 86_400_000).toISOString()),
    ];
    const stats = computeDegradation(memories, 40);
    expect(stats.totalDecisions).toBe(3);
    expect(stats.graded).toBe(0);
    expect(stats.recommendation).toBe("ok");
  });

  it("evaluator validate returns false with <3 memories", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    expect(await strategyDegradationEvaluator.validate(runtime, undefined)).toBe(false);
  });

  it("evaluator handler emits a recommendation message using stored decisions", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const now = Date.now();
    // Use createMemory directly so each decision carries a distinct ts (the
    // production tick fires every 30min, so this only matters in tests).
    for (let i = 0; i < 4; i++) {
      await runtime.createMemory({
        userId: runtime.agentId,
        agentId: runtime.agentId,
        roomId: runtime.agentId,
        content: {
          text: `BUY @ ${3000 + i * 100}`,
          action: "DECIDE_ETH_DIRECTION",
          metadata: {
            decision: "BUY",
            ethPrice: 3000 + i * 100,
            ts: new Date(now - (4 - i) * 3_600_000).toISOString(),
          },
        },
        createdAt: now - (4 - i) * 3_600_000,
      });
    }

    const ok = await strategyDegradationEvaluator.validate(runtime, undefined);
    expect(ok).toBe(true);
    const result = await strategyDegradationEvaluator.handler(runtime, undefined);
    expect(result.score).toBe(100);
    expect(result.text).toMatch(/Healthy/);
  });
});
