/**
 * Polymarket prediction bet Action — Kelly-sized intent generator.
 *
 * Reads state.values.predictionOpportunity = { tokenId, marketSlug,
 * fairProb, marketPrice, bankrollUsdc }. Computes the Kelly-optimal stake
 * (fractional Kelly, default 0.5) capped by:
 *   - MAX_BET_USDC ($5 default)
 *   - configured fraction of bankroll
 *   - edge threshold (skip if |fairProb - marketPrice| < minEdge)
 *
 * Returns a structured intent payload. NEVER submits an order — that's the
 * job of server/src/polymarket-exec.ts which itself defaults to dry-run.
 *
 * Math (binary outcome, payout = 1 if win):
 *   edge       = fairProb - marketPrice
 *   b          = 1/price - 1
 *   kelly_frac = (b·p - q) / b
 *   stake      = clamp(kelly_frac, 0, 1) · bankroll · kellyMultiplier
 *   capped to MAX_BET_USDC
 */

import type { Action, ActionResult, IAgentRuntime, Memory, State } from "../types.js";

export interface PredictionOpportunity {
  tokenId: string;
  marketSlug?: string;
  fairProb: number;
  marketPrice: number;
  bankrollUsdc: number;
}

export interface PredictionBetIntent {
  decision: "BET_YES" | "BET_NO" | "PASS";
  reason: string;
  tokenId: string;
  marketSlug?: string;
  side: "BUY" | "SELL" | null;
  fairProb: number;
  marketPrice: number;
  edge: number;
  kellyFraction: number;
  stakeUsdc: number;
  bankrollUsdc: number;
  ts: string;
}

const MAX_BET_USDC = 5;
const MIN_EDGE = 0.05;
const DEFAULT_KELLY_MULT = 0.5;
const MIN_PRICE = 0.02;
const MAX_PRICE = 0.98;

function computeIntent(opp: PredictionOpportunity, kellyMultiplier: number): PredictionBetIntent {
  const ts = new Date().toISOString();
  const empty: PredictionBetIntent = {
    decision: "PASS",
    reason: "",
    tokenId: opp.tokenId,
    side: null,
    fairProb: opp.fairProb,
    marketPrice: opp.marketPrice,
    edge: 0,
    kellyFraction: 0,
    stakeUsdc: 0,
    bankrollUsdc: opp.bankrollUsdc,
    ts,
  };
  if (opp.marketSlug) empty.marketSlug = opp.marketSlug;

  if (!Number.isFinite(opp.fairProb) || opp.fairProb < 0 || opp.fairProb > 1) {
    empty.reason = "invalid_fair_prob"; return empty;
  }
  if (!Number.isFinite(opp.marketPrice) || opp.marketPrice < MIN_PRICE || opp.marketPrice > MAX_PRICE) {
    empty.reason = "market_price_out_of_band"; return empty;
  }
  if (!Number.isFinite(opp.bankrollUsdc) || opp.bankrollUsdc <= 0) {
    empty.reason = "no_bankroll"; return empty;
  }

  const yesEdge = opp.fairProb - opp.marketPrice;
  const noEdge  = -yesEdge;
  const absEdge = Math.abs(yesEdge);

  if (absEdge < MIN_EDGE) {
    empty.edge = yesEdge;
    empty.reason = `edge_${absEdge.toFixed(4)}_below_min_${MIN_EDGE}`;
    return empty;
  }

  const betYes = yesEdge > 0;
  const price = betYes ? opp.marketPrice : (1 - opp.marketPrice);
  const fair = betYes ? opp.fairProb : (1 - opp.fairProb);

  const b = (1 / price) - 1;
  const p = fair;
  const q = 1 - p;
  const kellyFrac = (b * p - q) / b;
  const clamped = Math.max(0, Math.min(1, kellyFrac));
  const sized = clamped * opp.bankrollUsdc * kellyMultiplier;
  const stakeUsdc = Math.min(sized, MAX_BET_USDC);

  if (stakeUsdc < 0.5) {
    return {
      ...empty,
      decision: "PASS",
      edge: betYes ? yesEdge : noEdge,
      kellyFraction: kellyFrac,
      reason: "stake_under_half_dollar",
    };
  }

  return {
    ...empty,
    decision: betYes ? "BET_YES" : "BET_NO",
    side: "BUY",
    edge: betYes ? yesEdge : noEdge,
    kellyFraction: kellyFrac,
    stakeUsdc: Number(stakeUsdc.toFixed(2)),
    reason: `${(absEdge * 100).toFixed(1)}pp edge, kelly=${(kellyFrac * 100).toFixed(1)}% × ${kellyMultiplier.toFixed(2)}, sized $${stakeUsdc.toFixed(2)}`,
  };
}

function readOpportunity(state: State | undefined): PredictionOpportunity | null {
  const raw = state?.values?.["predictionOpportunity"];
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj["tokenId"] !== "string") return null;
  const opp: PredictionOpportunity = {
    tokenId: obj["tokenId"] as string,
    fairProb: Number(obj["fairProb"] ?? NaN),
    marketPrice: Number(obj["marketPrice"] ?? NaN),
    bankrollUsdc: Number(obj["bankrollUsdc"] ?? 0),
  };
  if (typeof obj["marketSlug"] === "string") opp.marketSlug = obj["marketSlug"] as string;
  return opp;
}

export const predictionBetAction: Action = {
  name: "PREDICTION_BET",
  description: "Computes a Kelly-sized prediction-market bet intent from state.values.predictionOpportunity.",
  similes: ["BET_PREDICTION", "POLYMARKET_BET", "KELLY_BET"],
  examples: [
    [
      { user: "scheduler", content: { text: "Polymarket opportunity surfaced — size a bet.", action: "PREDICTION_BET" } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, _message?: Memory, state?: State): Promise<boolean> {
    return readOpportunity(state) !== null;
  },

  async handler(runtime: IAgentRuntime, _message?: Memory, state?: State): Promise<ActionResult> {
    const opp = readOpportunity(state);
    if (!opp) return { success: false, error: "no_prediction_opportunity_in_state" };

    const rawMultiplier = runtime.getSetting("PREDICTION_KELLY_MULTIPLIER");
    const kellyMultiplier = rawMultiplier !== null && rawMultiplier !== undefined
      ? Math.max(0, Math.min(1, Number(rawMultiplier)))
      : DEFAULT_KELLY_MULT;

    const intent = computeIntent(opp, kellyMultiplier);
    runtime.logger.info(`[arcmind] prediction ${intent.decision}: ${intent.reason}`);

    await runtime.createMemory({
      userId:    runtime.agentId,
      agentId:   runtime.agentId,
      roomId:    runtime.agentId,
      content: { text: intent.reason, action: "PREDICTION_BET", metadata: intent as unknown as Record<string, unknown> },
      createdAt: Date.now(),
    });

    return {
      success: true,
      text: `${intent.decision}: ${intent.reason}`,
      data: intent as unknown as Record<string, unknown>,
    };
  },
};

export const __testing = { computeIntent, MAX_BET_USDC, MIN_EDGE, DEFAULT_KELLY_MULT };
