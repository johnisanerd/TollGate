/**
 * CoinGecko ETH/USD price provider.
 *
 * ElizaOS Provider contract: returns `{ text, values, data }` slice that gets
 * merged into State by the runtime before Actions run. No on-chain side effects.
 */

import type { Provider, ProviderResult } from "../types.js";

const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true";

export const coingeckoPriceProvider: Provider = {
  name: "coingecko_eth_price",
  description: "Live ETH/USD spot price + 24h % change from CoinGecko public API.",

  async get(_runtime, _message, _state): Promise<ProviderResult> {
    try {
      const res = await fetch(COINGECKO_URL, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) {
        return {
          text: "CoinGecko ETH price unavailable (HTTP " + res.status + ")",
          values: { ethPrice: 0, ethChange24h: 0 },
          data: { sourceStatus: "unavailable", provider: "CoinGecko" },
        };
      }
      const data = await res.json() as { ethereum?: { usd?: number; usd_24h_change?: number } };
      const price = data?.ethereum?.usd ?? 0;
      const change = data?.ethereum?.usd_24h_change ?? 0;
      return {
        text: `ETH ${price.toFixed(2)} USD (${change >= 0 ? "+" : ""}${change.toFixed(2)}% 24h)`,
        values: { ethPrice: price, ethChange24h: change },
        data: {
          sourceStatus: "live",
          provider: "CoinGecko",
          sourceUrl: "https://www.coingecko.com/en/coins/ethereum",
          lastUpdated: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        text: "CoinGecko ETH price fetch failed",
        values: { ethPrice: 0, ethChange24h: 0 },
        data: { sourceStatus: "unavailable", provider: "CoinGecko", error: (err as Error).message },
      };
    }
  },
};
