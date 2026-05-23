/**
 * Detect market regime Action.
 *
 * Reads State.values (ethPrice, ethChange24h, hlOiUsd, hlFundingRate) and
 * classifies the market into BULL / BEAR / RISK_OFF / CHOPPY plus a
 * confidence score. Used by RFB 04 (Adaptive Portfolio): a RISK_OFF regime
 * triggers the USYC router; a BULL regime allows full ETH allocation.
 *
 * Two-stage logic:
 *   1) Rule-based classifier — fast, deterministic, never hallucinates.
 *   2) Optional LLM second-opinion via runtime.getSetting("LLM_ROUTE_URL").
 *      If the LLM responds with a different regime AND a non-low confidence,
 *      its verdict wins. If the LLM is unreachable, rule-based stands.
 */

import type { Action, ActionResult, IAgentRuntime, Memory, State } from "../types.js";

export type MarketRegime = "BULL" | "BEAR" | "RISK_OFF" | "CHOPPY";

export interface RegimePayload {
  regime: MarketRegime;
  confidence: number;
  reasoning: string;
  ethPrice: number;
  ethChange24h: number;
  hlFundingRate: number;
  hlOiUsd: number;
  source: "rule" | "llm" | "llm_agreed";
  ts: string;
}

const CONFIDENCE_FROM_RULE: Record<MarketRegime, number> = {
  BULL:     0.65,
  BEAR:     0.65,
  RISK_OFF: 0.75,
  CHOPPY:   0.50,
};

function classifyFromSignals(values: Record<string, unknown>): { regime: MarketRegime; reasoning: string } {
  const change = Number(values["ethChange24h"] ?? 0);
  const funding = Number(values["hlFundingRate"] ?? 0);
  const oi = Number(values["hlOiUsd"] ?? 0);

  const strongDown = change < -3;
  const strongUp = change > 3;
  const negFunding = funding < -0.0002;
  const posFunding = funding > 0.0002;
  const lowOi = oi > 0 && oi < 500_000_000;

  if (strongDown && (negFunding || lowOi)) {
    return {
      regime: "RISK_OFF",
      reasoning: `ETH ${change.toFixed(2)}% with funding ${funding.toFixed(5)} and OI ${(oi / 1e6).toFixed(0)}M — capital flight signal, route to USYC.`,
    };
  }
  if (strongUp && posFunding) {
    return {
      regime: "BULL",
      reasoning: `ETH ${change.toFixed(2)}% with bullish funding ${funding.toFixed(5)} — trend confirmation, hold ETH allocation.`,
    };
  }
  if (change < -1 && funding < 0) {
    return {
      regime: "BEAR",
      reasoning: `ETH ${change.toFixed(2)}% with negative funding ${funding.toFixed(5)} — downtrend forming, scale down beta.`,
    };
  }
  if (change > 1 && funding > 0) {
    return {
      regime: "BULL",
      reasoning: `ETH ${change.toFixed(2)}% with positive funding ${funding.toFixed(5)} — uptrend, maintain risk-on stance.`,
    };
  }
  return {
    regime: "CHOPPY",
    reasoning: `ETH ${change.toFixed(2)}%, funding ${funding.toFixed(5)} — signals inconclusive, prefer cash + small grid.`,
  };
}

const REGIME_RE = /(BULL|BEAR|RISK_OFF|CHOPPY)/;

interface LlmRouteResponse {
  ok?: boolean;
  text?: string;
  reason?: string;
}

async function llmSecondOpinion(
  runtime: IAgentRuntime,
  rule: { regime: MarketRegime; reasoning: string },
  values: Record<string, unknown>,
): Promise<{ regime: MarketRegime; reasoning: string; usedLlm: boolean }> {
  const url = runtime.getSetting("LLM_ROUTE_URL") ?? runtime.getSetting("ARCMIND_LLM_URL");
  if (!url) return { ...rule, usedLlm: false };

  const prompt = `Market signals:\n- ETH price: $${Number(values["ethPrice"] ?? 0).toFixed(2)}\n- ETH 24h change: ${Number(values["ethChange24h"] ?? 0).toFixed(2)}%\n- Hyperliquid OI: ${(Number(values["hlOiUsd"] ?? 0) / 1e6).toFixed(1)}M USD\n- Funding rate: ${Number(values["hlFundingRate"] ?? 0).toFixed(5)}\n\nRule-based regime: ${rule.regime}\nRule reasoning: ${rule.reasoning}\n\nDo you agree? Respond in this exact format:\n<REGIME>\nReasoning: <one short sentence>\n\nWhere <REGIME> is exactly one of BULL, BEAR, RISK_OFF, CHOPPY.`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        system: "You classify crypto market regimes. Respond strictly with one of BULL, BEAR, RISK_OFF, CHOPPY as the first non-whitespace word, then a reasoning line.",
        maxTokens: 120,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ...rule, usedLlm: false };
    const data = await res.json() as LlmRouteResponse;
    if (!data.ok || typeof data.text !== "string") return { ...rule, usedLlm: false };
    const match = data.text.match(REGIME_RE);
    if (!match || !match[1]) return { ...rule, usedLlm: false };
    const llmRegime = match[1] as MarketRegime;
    return { regime: llmRegime, reasoning: data.text.trim().slice(0, 320), usedLlm: true };
  } catch {
    return { ...rule, usedLlm: false };
  }
}

export const detectRegimeAction: Action = {
  name: "DETECT_REGIME",
  description: "Classifies the current market into BULL/BEAR/RISK_OFF/CHOPPY using rule-based logic plus an optional LLM second opinion.",
  similes: ["MARKET_REGIME", "DETECT_MARKET_REGIME", "CLASSIFY_REGIME"],
  examples: [
    [
      { user: "scheduler", content: { text: "Tick — classify the market regime.", action: "DETECT_REGIME" } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, _message?: Memory, state?: State): Promise<boolean> {
    return !!state?.values && Number(state.values["ethPrice"]) > 0;
  },

  async handler(runtime: IAgentRuntime, _message?: Memory, state?: State): Promise<ActionResult> {
    if (!state?.values) {
      return { success: false, error: "No state.values — providers did not run" };
    }
    const rule = classifyFromSignals(state.values);
    const llm = await llmSecondOpinion(runtime, rule, state.values);
    const finalRegime = llm.regime;
    const baseConf = CONFIDENCE_FROM_RULE[finalRegime];
    const confidence = llm.usedLlm
      ? (finalRegime === rule.regime ? Math.min(0.95, baseConf + 0.20) : 0.55)
      : baseConf;
    const source: RegimePayload["source"] = llm.usedLlm
      ? (finalRegime === rule.regime ? "llm_agreed" : "llm")
      : "rule";

    const payload: RegimePayload = {
      regime:        finalRegime,
      confidence,
      reasoning:     llm.reasoning,
      ethPrice:      Number(state.values["ethPrice"] ?? 0),
      ethChange24h:  Number(state.values["ethChange24h"] ?? 0),
      hlFundingRate: Number(state.values["hlFundingRate"] ?? 0),
      hlOiUsd:       Number(state.values["hlOiUsd"] ?? 0),
      source,
      ts:            new Date().toISOString(),
    };

    runtime.logger.info(`[arcmind] regime=${finalRegime} (${source}, conf=${confidence.toFixed(2)})`);

    await runtime.createMemory({
      userId:    runtime.agentId,
      agentId:   runtime.agentId,
      roomId:    runtime.agentId,
      content: { text: payload.reasoning, action: "DETECT_REGIME", metadata: payload as unknown as Record<string, unknown> },
      createdAt: Date.now(),
    });

    state.values = { ...(state.values ?? {}), regime: finalRegime, regimeConfidence: confidence, regimeSource: source };

    return { success: true, text: payload.reasoning, data: payload as unknown as Record<string, unknown> };
  },
};

export const __testing = { classifyFromSignals, CONFIDENCE_FROM_RULE };
