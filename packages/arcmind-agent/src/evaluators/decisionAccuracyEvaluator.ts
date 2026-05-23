/**
 * Decision accuracy evaluator.
 *
 * Runs AFTER an action chain. Compares the most recent decision against the
 * subsequent ETH price move (1 tick later). Awards 100 if direction matched,
 * 0 if it did not. Used to feed ERC-8004 reputation via resolveDecision().
 */

import type { Evaluator, EvaluatorResult, IAgentRuntime, Memory, State } from "../types.js";

export const decisionAccuracyEvaluator: Evaluator = {
  name: "DECISION_ACCURACY",
  description: "Grades the previous decision against the subsequent ETH price tick.",
  alwaysRun: false,

  async validate(runtime: IAgentRuntime, _m?: Memory, _s?: State): Promise<boolean> {
    const memories = await runtime.getMemories({ roomId: runtime.agentId, count: 2 });
    return memories.length >= 2;
  },

  async handler(runtime: IAgentRuntime, _m?: Memory, _s?: State): Promise<EvaluatorResult> {
    const [latest, previous] = await runtime.getMemories({ roomId: runtime.agentId, count: 2 });
    const latestMeta = (latest?.content?.metadata ?? {}) as Record<string, unknown>;
    const prevMeta = (previous?.content?.metadata ?? {}) as Record<string, unknown>;

    const prevDecision = String(prevMeta["decision"] ?? "HOLD");
    const prevPrice = Number(prevMeta["ethPrice"] ?? 0);
    const latestPrice = Number(latestMeta["ethPrice"] ?? 0);

    if (prevPrice <= 0 || latestPrice <= 0) {
      return { score: 0, text: "Insufficient price data to grade.", data: { reason: "no_prices" } };
    }

    const priceUp = latestPrice > prevPrice;
    let correct = false;
    if (prevDecision === "BUY" && priceUp) correct = true;
    if (prevDecision === "SELL" && !priceUp) correct = true;
    if (prevDecision === "HOLD") correct = Math.abs(latestPrice - prevPrice) / prevPrice < 0.005;

    const score = correct ? 100 : 0;
    const text = correct
      ? `${prevDecision} was correct — price ${prevPrice.toFixed(2)} → ${latestPrice.toFixed(2)}.`
      : `${prevDecision} was incorrect — price ${prevPrice.toFixed(2)} → ${latestPrice.toFixed(2)}.`;

    runtime.logger.info(`[arcmind] eval: ${text} (score ${score})`);
    return { score, text, data: { prevDecision, prevPrice, latestPrice, correct } };
  },
};
