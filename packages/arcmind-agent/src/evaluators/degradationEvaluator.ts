/**
 * Strategy degradation evaluator (Research Anchor #6 — slash-bonded leaderboard).
 *
 * Runs after each decision tick. Computes a rolling 7-day win-rate from
 * the agent's recent decision memories. When win-rate drops below
 * `pauseThreshold` (default 40%) the evaluator emits a `degraded` action
 * recommendation. The Service is responsible for calling AgentRegistry.pause()
 * or governor.slashAgent() — this evaluator is pure logic.
 */

import type { Evaluator, EvaluatorResult, IAgentRuntime, Memory, State } from "../types.js";

interface DecisionMemory {
  decision: "BUY" | "SELL" | "HOLD";
  ethPrice: number;
  ts: string;
}

const ROLLING_WINDOW_DAYS = 7;
const DEFAULT_PAUSE_THRESHOLD_PCT = 40;

function isDecisionPayload(meta: unknown): meta is DecisionMemory {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  return (
    (m.decision === "BUY" || m.decision === "SELL" || m.decision === "HOLD") &&
    typeof m.ethPrice === "number" &&
    typeof m.ts === "string"
  );
}

export interface DegradationStats {
  totalDecisions: number;
  graded: number;
  wins: number;
  winRatePct: number;
  recommendation: "ok" | "watch" | "degraded";
  windowDays: number;
  pauseThresholdPct: number;
}

export function computeDegradation(memories: Memory[], pauseThresholdPct = DEFAULT_PAUSE_THRESHOLD_PCT): DegradationStats {
  const cutoff = Date.now() - ROLLING_WINDOW_DAYS * 86_400_000;
  const decisions: DecisionMemory[] = [];
  for (const m of memories) {
    if (m.content.action !== "DECIDE_ETH_DIRECTION") continue;
    const meta = m.content.metadata;
    if (!isDecisionPayload(meta)) continue;
    const ts = new Date(meta.ts).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    decisions.push(meta);
  }
  decisions.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  let wins = 0;
  let graded = 0;
  for (let i = 0; i < decisions.length - 1; i++) {
    const curr = decisions[i]!;
    const next = decisions[i + 1]!;
    if (curr.decision === "HOLD") continue;
    const priceUp = next.ethPrice > curr.ethPrice;
    const won = (curr.decision === "BUY" && priceUp) || (curr.decision === "SELL" && !priceUp);
    if (won) wins++;
    graded++;
  }
  const winRatePct = graded > 0 ? (wins / graded) * 100 : 0;
  let recommendation: DegradationStats["recommendation"] = "ok";
  if (graded >= 3) {
    if (winRatePct < pauseThresholdPct) recommendation = "degraded";
    else if (winRatePct < pauseThresholdPct + 10) recommendation = "watch";
  }
  return {
    totalDecisions: decisions.length,
    graded,
    wins,
    winRatePct: Number(winRatePct.toFixed(1)),
    recommendation,
    windowDays: ROLLING_WINDOW_DAYS,
    pauseThresholdPct,
  };
}

export const strategyDegradationEvaluator: Evaluator = {
  name: "STRATEGY_DEGRADATION",
  description: "Rolling 7-day win-rate; recommends pause when below threshold.",
  alwaysRun: false,

  async validate(runtime: IAgentRuntime, _m?: Memory, _s?: State): Promise<boolean> {
    const recent = await runtime.getMemories({ roomId: runtime.agentId, count: 100 });
    return recent.length >= 3;
  },

  async handler(runtime: IAgentRuntime, _m?: Memory, _s?: State): Promise<EvaluatorResult> {
    const memories = await runtime.getMemories({ roomId: runtime.agentId, count: 500 });
    const pauseThresholdPct = Number(runtime.character.settings?.["pauseThresholdPct"] ?? DEFAULT_PAUSE_THRESHOLD_PCT);
    const stats = computeDegradation(memories, pauseThresholdPct);
    const score = Math.round(stats.winRatePct);

    let text: string;
    if (stats.recommendation === "degraded") {
      text = `Degraded: ${stats.wins}/${stats.graded} wins (${stats.winRatePct}%) in last ${stats.windowDays}d — below pause threshold ${pauseThresholdPct}%. Recommend AgentRegistry.pause() and consider governor slashAgent.`;
    } else if (stats.recommendation === "watch") {
      text = `Watch: ${stats.wins}/${stats.graded} wins (${stats.winRatePct}%) in last ${stats.windowDays}d — within 10% of pause threshold.`;
    } else {
      text = `Healthy: ${stats.wins}/${stats.graded} wins (${stats.winRatePct}%) over ${stats.windowDays}d.`;
    }

    runtime.logger.info(`[arcmind] degradation: ${text}`);

    if (stats.recommendation === "degraded") {
      await runtime.createMemory({
        userId: runtime.agentId,
        agentId: runtime.agentId,
        roomId: runtime.agentId,
        content: { text, action: "STRATEGY_DEGRADATION_ALERT", metadata: stats as unknown as Record<string, unknown> },
        createdAt: Date.now(),
      });
    }

    return { score, text, data: stats as unknown as Record<string, unknown> };
  },
};

export const __testing = { computeDegradation, ROLLING_WINDOW_DAYS, DEFAULT_PAUSE_THRESHOLD_PCT };
