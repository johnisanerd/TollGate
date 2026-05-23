/**
 * Decide ETH direction Action.
 *
 * Reads providers' outputs from State.values (ethPrice, ethChange24h, hlOiUsd,
 * hlFundingRate, leaderFeedStatus) and produces a BUY / SELL / HOLD decision
 * plus a natural-language reasoning trace.
 *
 * Mirrors the heuristic in server/src/arc-agent-loop.ts → makeDecision().
 */

import type { Action, ActionResult, IAgentRuntime, Memory, State } from "../types.js";

export type EthDirection = "BUY" | "SELL" | "HOLD";

export interface DecisionPayload {
  decision: EthDirection;
  ethPrice: number;
  ethChange24h: number;
  hlOiUsd: number;
  hlFundingRate: number;
  reasoning: string;
  ts: string;
}

function decideFromSignals(values: Record<string, unknown>): EthDirection {
  const ethChange24h = Number(values["ethChange24h"] ?? 0);
  const fundingRate = Number(values["hlFundingRate"] ?? 0);
  const ethUp = ethChange24h > 0.1;
  const ethDown = ethChange24h < -0.1;
  const oiBullish = fundingRate > 0.0001;
  const oiBearish = fundingRate < -0.0001;
  if (ethUp && oiBullish) return "BUY";
  if (ethDown && oiBearish) return "SELL";
  return "HOLD";
}

function reasoning(values: Record<string, unknown>, decision: EthDirection): string {
  const price = Number(values["ethPrice"] ?? 0);
  const change = Number(values["ethChange24h"] ?? 0);
  const oi = Number(values["hlOiUsd"] ?? 0);
  const funding = Number(values["hlFundingRate"] ?? 0);
  const leaderStatus = String(values["leaderFeedStatus"] ?? "missing");

  const ethDesc = price > 0 ? `ETH $${price.toFixed(2)} (${change >= 0 ? "+" : ""}${change.toFixed(2)}% 24h)` : "ETH price unavailable";
  const oiDesc = oi > 0 ? `OI ${(oi / 1e6).toFixed(1)}M, funding ${funding.toFixed(5)}` : "Hyperliquid OI unavailable";
  const guard = leaderStatus === "missing" ? "SignalGuard active (no leader feed)" : `Leader feed: ${leaderStatus}`;

  if (decision === "BUY") return `BUY: ${ethDesc} trending up, positive funding ${funding.toFixed(5)} confirms bullish sentiment. ${oiDesc}. ${guard}.`;
  if (decision === "SELL") return `SELL: ${ethDesc} declining, negative funding ${funding.toFixed(5)} confirms bearish flow. ${oiDesc}. ${guard}.`;
  return `HOLD: ${ethDesc}, ${oiDesc}, signals inconclusive. ${guard}.`;
}

export const decideEthDirectionAction: Action = {
  name: "DECIDE_ETH_DIRECTION",
  description: "Reads market signals from State.values and produces a BUY/SELL/HOLD decision for ETH/USDC.",
  similes: ["DECIDE_TRADE", "BUILD_DECISION", "SIGNAL_DECISION"],
  examples: [
    [
      { user: "scheduler", content: { text: "30-min tick — assess market and decide.", action: "DECIDE_ETH_DIRECTION" } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, _message?: Memory, state?: State): Promise<boolean> {
    return !!state?.values && Number(state.values["ethPrice"]) > 0;
  },

  async handler(runtime: IAgentRuntime, _message?: Memory, state?: State): Promise<ActionResult> {
    if (!state?.values) {
      return { success: false, error: "No state.values — providers did not run" };
    }
    const decision = decideFromSignals(state.values);
    const trace = reasoning(state.values, decision);
    const payload: DecisionPayload = {
      decision,
      ethPrice: Number(state.values["ethPrice"] ?? 0),
      ethChange24h: Number(state.values["ethChange24h"] ?? 0),
      hlOiUsd: Number(state.values["hlOiUsd"] ?? 0),
      hlFundingRate: Number(state.values["hlFundingRate"] ?? 0),
      reasoning: trace,
      ts: new Date().toISOString(),
    };

    runtime.logger.info(`[arcmind] decision=${decision}`, payload);

    await runtime.createMemory({
      userId: runtime.agentId,
      agentId: runtime.agentId,
      roomId: runtime.agentId,
      content: { text: trace, action: "DECIDE_ETH_DIRECTION", metadata: payload as unknown as Record<string, unknown> },
      createdAt: Date.now(),
    });

    return { success: true, text: trace, data: payload as unknown as Record<string, unknown> };
  },
};
