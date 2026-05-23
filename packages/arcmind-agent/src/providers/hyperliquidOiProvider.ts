/**
 * Hyperliquid Open Interest + funding rate provider.
 *
 * POST https://api.hyperliquid.xyz/info {"type":"metaAndAssetCtxs"} — returns a
 * tuple [meta, ctxArray]. ETH context yields the live OI and funding.
 */

import type { Provider, ProviderResult } from "../types.js";

const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

export const hyperliquidOiProvider: Provider = {
  name: "hyperliquid_oi",
  description: "ETH perp open interest + funding rate from Hyperliquid Info API.",

  async get(_runtime, _message, _state): Promise<ProviderResult> {
    try {
      const res = await fetch(HL_INFO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "metaAndAssetCtxs" }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        return {
          text: "Hyperliquid OI unavailable (HTTP " + res.status + ")",
          values: { hlOiUsd: 0, hlFundingRate: 0 },
          data: { sourceStatus: "unavailable", provider: "Hyperliquid" },
        };
      }
      const data = await res.json() as [{ universe: { name: string }[] }, { openInterest: string; funding: string }[]];
      const ethIdx = data[0]?.universe?.findIndex((u) => u.name === "ETH") ?? -1;
      const ctx = ethIdx >= 0 ? data[1]?.[ethIdx] : undefined;
      if (!ctx) {
        return {
          text: "Hyperliquid response missing ETH ctx",
          values: { hlOiUsd: 0, hlFundingRate: 0 },
          data: { sourceStatus: "unavailable", provider: "Hyperliquid" },
        };
      }
      const oiUsd = parseFloat(ctx.openInterest) || 0;
      const fundingRate = parseFloat(ctx.funding) || 0;
      return {
        text: `Hyperliquid ETH: OI ${(oiUsd / 1e6).toFixed(1)}M USD, funding ${fundingRate.toFixed(5)}`,
        values: { hlOiUsd: oiUsd, hlFundingRate: fundingRate },
        data: {
          sourceStatus: "live",
          provider: "Hyperliquid",
          sourceUrl: "https://app.hyperliquid.xyz",
          lastUpdated: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        text: "Hyperliquid OI fetch failed",
        values: { hlOiUsd: 0, hlFundingRate: 0 },
        data: { sourceStatus: "unavailable", provider: "Hyperliquid", error: (err as Error).message },
      };
    }
  },
};
