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
  detectRegimeAction,
  predictionBetAction,
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

describe("detectRegimeAction", () => {
  it("rule-based: classifies strong down + negative funding as RISK_OFF", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3000, ethChange24h: -4.5, hlOiUsd: 300_000_000, hlFundingRate: -0.0005 };
    const result = await detectRegimeAction.handler(runtime, undefined, state);
    expect(result.success).toBe(true);
    expect(result.data?.["regime"]).toBe("RISK_OFF");
    expect(state.values["regime"]).toBe("RISK_OFF");
  });

  it("rule-based: classifies strong up + positive funding as BULL", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3500, ethChange24h: 4.0, hlOiUsd: 1_500_000_000, hlFundingRate: 0.0008 };
    const result = await detectRegimeAction.handler(runtime, undefined, state);
    expect(result.data?.["regime"]).toBe("BULL");
  });

  it("rule-based: mild down + negative funding → BEAR", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3400, ethChange24h: -1.5, hlOiUsd: 800_000_000, hlFundingRate: -0.00005 };
    const result = await detectRegimeAction.handler(runtime, undefined, state);
    expect(result.data?.["regime"]).toBe("BEAR");
  });

  it("rule-based: noise + flat funding → CHOPPY", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3400, ethChange24h: 0.2, hlOiUsd: 700_000_000, hlFundingRate: 0 };
    const result = await detectRegimeAction.handler(runtime, undefined, state);
    expect(result.data?.["regime"]).toBe("CHOPPY");
    expect(result.data?.["source"]).toBe("rule");
  });

  it("persists regime memory with metadata", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3000, ethChange24h: -5, hlOiUsd: 200_000_000, hlFundingRate: -0.001 };
    await detectRegimeAction.handler(runtime, undefined, state);
    const memories = await runtime.getMemories({ roomId: runtime.agentId, count: 5 });
    const regimeMemo = memories.find((m) => m.content.action === "DETECT_REGIME");
    expect(regimeMemo).toBeTruthy();
    expect(regimeMemo?.content.metadata).toMatchObject({ regime: "RISK_OFF", source: "rule" });
  });

  it("validate rejects when ethPrice is missing", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { ethPrice: 0 };
    expect(await detectRegimeAction.validate(runtime, undefined, state)).toBe(false);
  });

  it("LLM second-opinion bumps confidence when agreeing with rule", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      ok: true, text: "RISK_OFF\nReasoning: capital flight confirmed.",
    }), { status: 200 })) as typeof fetch;

    const runtime = createMinimalRuntime({
      character: arcMindCharacter,
      settings: { LLM_ROUTE_URL: "http://mock-llm/route" },
    });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3000, ethChange24h: -4.5, hlOiUsd: 300_000_000, hlFundingRate: -0.0005 };
    const result = await detectRegimeAction.handler(runtime, undefined, state);
    expect(result.data?.["regime"]).toBe("RISK_OFF");
    expect(result.data?.["source"]).toBe("llm_agreed");
    expect(Number(result.data?.["confidence"])).toBeGreaterThan(0.75);

    globalThis.fetch = originalFetch;
  });

  it("LLM override: when LLM picks different regime, source=llm with lower confidence", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      ok: true, text: "BEAR\nReasoning: LLM disagrees and sees broader downtrend.",
    }), { status: 200 })) as typeof fetch;

    const runtime = createMinimalRuntime({
      character: arcMindCharacter,
      settings: { LLM_ROUTE_URL: "http://mock-llm/route" },
    });
    const state = await runtime.composeState();
    // Rule would say BULL (change > 1 + funding > 0)
    state.values = { ethPrice: 3400, ethChange24h: 2.0, hlOiUsd: 1_000_000_000, hlFundingRate: 0.0003 };
    const result = await detectRegimeAction.handler(runtime, undefined, state);
    expect(result.data?.["regime"]).toBe("BEAR");
    expect(result.data?.["source"]).toBe("llm");
    expect(Number(result.data?.["confidence"])).toBeLessThan(0.7);

    globalThis.fetch = originalFetch;
  });

  it("LLM failure falls back silently to rule-based", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;

    const runtime = createMinimalRuntime({
      character: arcMindCharacter,
      settings: { LLM_ROUTE_URL: "http://mock-llm/route" },
    });
    const state = await runtime.composeState();
    state.values = { ethPrice: 3000, ethChange24h: -5, hlOiUsd: 200_000_000, hlFundingRate: -0.001 };
    const result = await detectRegimeAction.handler(runtime, undefined, state);
    expect(result.data?.["source"]).toBe("rule");
    expect(result.data?.["regime"]).toBe("RISK_OFF");

    globalThis.fetch = originalFetch;
  });
});

describe("predictionBetAction (Kelly sizing)", () => {
  it("passes when edge < 5pp", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = {
      predictionOpportunity: {
        tokenId: "12345678901234567890",
        fairProb: 0.52,
        marketPrice: 0.50,
        bankrollUsdc: 100,
      },
    };
    expect(await predictionBetAction.validate(runtime, undefined, state)).toBe(true);
    const r = await predictionBetAction.handler(runtime, undefined, state);
    expect(r.data?.["decision"]).toBe("PASS");
    expect(String(r.data?.["reason"] ?? "")).toMatch(/below_min/);
  });

  it("BET_YES when fairProb materially higher than market price", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = {
      predictionOpportunity: {
        tokenId: "tok-1234567890",
        fairProb: 0.70,
        marketPrice: 0.55,
        bankrollUsdc: 100,
        marketSlug: "fed-cut",
      },
    };
    const r = await predictionBetAction.handler(runtime, undefined, state);
    expect(r.data?.["decision"]).toBe("BET_YES");
    expect(r.data?.["side"]).toBe("BUY");
    expect(Number(r.data?.["stakeUsdc"])).toBeGreaterThan(0);
    expect(Number(r.data?.["stakeUsdc"])).toBeLessThanOrEqual(5);
  });

  it("BET_NO when fairProb materially lower than market price", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = {
      predictionOpportunity: {
        tokenId: "tok-9999999999",
        fairProb: 0.30,
        marketPrice: 0.55,
        bankrollUsdc: 100,
      },
    };
    const r = await predictionBetAction.handler(runtime, undefined, state);
    expect(r.data?.["decision"]).toBe("BET_NO");
    // edge field on BET_NO records the agent's positive edge on the NO side
    expect(Number(r.data?.["edge"])).toBeGreaterThan(0);
    expect(Number(r.data?.["stakeUsdc"])).toBeGreaterThan(0);
  });

  it("hard caps stake at $5 even with huge bankroll + edge", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = {
      predictionOpportunity: {
        tokenId: "tok-1",
        fairProb: 0.90,
        marketPrice: 0.40,
        bankrollUsdc: 1_000_000,
      },
    };
    const r = await predictionBetAction.handler(runtime, undefined, state);
    expect(r.data?.["decision"]).toBe("BET_YES");
    expect(Number(r.data?.["stakeUsdc"])).toBeLessThanOrEqual(5);
  });

  it("rejects market_price_out_of_band (price >= 0.98)", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = {
      predictionOpportunity: {
        tokenId: "tok-1",
        fairProb: 0.99,
        marketPrice: 0.99,
        bankrollUsdc: 100,
      },
    };
    const r = await predictionBetAction.handler(runtime, undefined, state);
    expect(r.data?.["decision"]).toBe("PASS");
    expect(r.data?.["reason"]).toBe("market_price_out_of_band");
  });

  it("validate returns false when no opportunity in state", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = {};
    expect(await predictionBetAction.validate(runtime, undefined, state)).toBe(false);
  });

  it("rejects invalid token id (no field) at validate stage", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { predictionOpportunity: { fairProb: 0.6, marketPrice: 0.4, bankrollUsdc: 100 } };
    expect(await predictionBetAction.validate(runtime, undefined, state)).toBe(false);
  });

  it("env PREDICTION_KELLY_MULTIPLIER scales stake", async () => {
    const runtimeHalf = createMinimalRuntime({ character: arcMindCharacter, settings: { PREDICTION_KELLY_MULTIPLIER: "0.5" } });
    const runtimeQuarter = createMinimalRuntime({ character: arcMindCharacter, settings: { PREDICTION_KELLY_MULTIPLIER: "0.25" } });
    // Small bankroll so we stay below the $5 cap and the multiplier dominates
    const opp = {
      predictionOpportunity: { tokenId: "tok-1", fairProb: 0.65, marketPrice: 0.50, bankrollUsdc: 10 },
    };
    const sHalf = await runtimeHalf.composeState();    sHalf.values = opp;
    const sQuart = await runtimeQuarter.composeState(); sQuart.values = opp;
    const rHalf = await predictionBetAction.handler(runtimeHalf, undefined, sHalf);
    const rQuart = await predictionBetAction.handler(runtimeQuarter, undefined, sQuart);
    expect(Number(rHalf.data?.["stakeUsdc"])).toBeGreaterThan(Number(rQuart.data?.["stakeUsdc"]));
  });

  it("passes when computed stake < $0.5 (dust filter)", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter, settings: { PREDICTION_KELLY_MULTIPLIER: "0.1" } });
    const state = await runtime.composeState();
    state.values = {
      predictionOpportunity: {
        tokenId: "tok-dust",
        fairProb: 0.56,
        marketPrice: 0.50,
        bankrollUsdc: 5,
      },
    };
    const r = await predictionBetAction.handler(runtime, undefined, state);
    expect(r.data?.["decision"]).toBe("PASS");
    expect(r.data?.["reason"]).toBe("stake_under_half_dollar");
  });

  it("persists PREDICTION_BET memory with full intent metadata", async () => {
    const runtime = createMinimalRuntime({ character: arcMindCharacter });
    const state = await runtime.composeState();
    state.values = { predictionOpportunity: { tokenId: "tok-x", fairProb: 0.70, marketPrice: 0.50, bankrollUsdc: 100 } };
    await predictionBetAction.handler(runtime, undefined, state);
    const memories = await runtime.getMemories({ roomId: runtime.agentId, count: 5 });
    const bet = memories.find((m) => m.content.action === "PREDICTION_BET");
    expect(bet?.content.metadata).toMatchObject({ decision: "BET_YES", tokenId: "tok-x" });
  });
});
