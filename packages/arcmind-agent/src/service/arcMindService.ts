/**
 * ArcMind Service — 30-minute decision loop wired as an ElizaOS Service.
 *
 * Each tick:
 *   1. composeState() runs all Providers (CoinGecko / Hyperliquid / leader feed)
 *   2. decideEthDirectionAction.handler() builds the BUY/SELL/HOLD decision
 *   3. recordOnChainAction.handler() anchors the hash on ArcMindRegistry
 *   4. decisionAccuracyEvaluator scores the previous decision (for ERC-8004 rep)
 *
 * Replace this Service body with `@elizaos/core`'s built-in Service runtime once
 * the package is installed — the contract is identical.
 */

import type { IAgentRuntime, Service } from "../types.js";
import { coingeckoPriceProvider } from "../providers/coingeckoPriceProvider.js";
import { hyperliquidOiProvider } from "../providers/hyperliquidOiProvider.js";
import { leaderFeedProvider } from "../providers/leaderFeedProvider.js";
import { decideEthDirectionAction } from "../actions/decideEthDirection.js";
import { detectRegimeAction } from "../actions/regimeAction.js";
import { recordOnChainAction } from "../actions/recordOnChain.js";
import { decisionAccuracyEvaluator } from "../evaluators/decisionAccuracyEvaluator.js";
import { strategyDegradationEvaluator } from "../evaluators/degradationEvaluator.js";

const DEFAULT_INTERVAL_MS = 30 * 60_000;

export const arcMindService: Service = {
  name: "arcmind_decision_loop",
  description: "30-minute autonomous ETH/USDC decision loop with on-chain anchoring.",

  async start(runtime: IAgentRuntime): Promise<() => Promise<void>> {
    const intervalMs = Number(runtime.character.settings?.["decisionIntervalMs"] ?? DEFAULT_INTERVAL_MS);
    let stopped = false;

    async function tick(): Promise<void> {
      if (stopped) return;
      const state = await runtime.composeState();

      // Run providers concurrently and merge into state.
      const [price, oi, feed] = await Promise.all([
        coingeckoPriceProvider.get(runtime, undefined, state),
        hyperliquidOiProvider.get(runtime, undefined, state),
        leaderFeedProvider.get(runtime, undefined, state),
      ]);
      state.values = {
        ...(state.values ?? {}),
        ...(price.values ?? {}),
        ...(oi.values ?? {}),
        ...(feed.values ?? {}),
      };
      state.providers = [price.text, oi.text, feed.text].filter(Boolean).join("\n");

      // Classify regime first (RFB 04). Mutates state.values with `regime`.
      if (await detectRegimeAction.validate(runtime, undefined, state)) {
        await detectRegimeAction.handler(runtime, undefined, state);
      }

      // Decide.
      if (!(await decideEthDirectionAction.validate(runtime, undefined, state))) {
        runtime.logger.warn("[arcmind] skip tick — provider data insufficient");
        return;
      }
      const decisionResult = await decideEthDirectionAction.handler(runtime, undefined, state);
      if (!decisionResult.success) {
        runtime.logger.error(`[arcmind] decision action failed: ${decisionResult.error ?? "unknown"}`);
        return;
      }

      // Anchor on-chain (best effort — paper mode when keys missing).
      if (await recordOnChainAction.validate(runtime, undefined, state)) {
        await recordOnChainAction.handler(runtime, undefined, state);
      }

      // Grade the previous decision (best-effort).
      if (await decisionAccuracyEvaluator.validate(runtime, undefined, state)) {
        await decisionAccuracyEvaluator.handler(runtime, undefined, state);
      }

      // Strategy degradation — rolling 7d win-rate; recommends pause when below threshold.
      if (await strategyDegradationEvaluator.validate(runtime, undefined, state)) {
        await strategyDegradationEvaluator.handler(runtime, undefined, state);
      }
    }

    void tick();
    const timer = setInterval(() => { void tick(); }, intervalMs);

    return async () => {
      stopped = true;
      clearInterval(timer);
    };
  },
};
