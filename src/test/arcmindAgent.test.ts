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
} from "../../packages/arcmind-agent/src/index";

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
