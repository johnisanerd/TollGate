/**
 * Pyth Network price oracle client.
 *
 * Free public endpoint:
 *   GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feed_id>
 *
 * Used as a sub-second confirmation oracle for the arb scanner and as a
 * verifiable second source for the LLM regime detector.
 *
 * 3-second in-memory cache (Pyth ticks ~400 ms; we don't need to poll faster).
 */

const HERMES_BASE = "https://hermes.pyth.network";
const TTL_MS = 3_000;

// https://docs.pyth.network/price-feeds/price-feeds — canonical ETH/USD feed
const ETH_USD_FEED = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

interface CacheEntry<T> { value: T; ts: number }
const cache = new Map<string, CacheEntry<unknown>>();

export interface PythPrice {
  price: number;
  conf: number;
  ts: number;
  feedId: string;
  ok: boolean;
  reason?: string;
}

function failed(feedId: string, reason: string): PythPrice {
  return { price: 0, conf: 0, ts: Date.now(), feedId, ok: false, reason };
}

async function getJson<T>(url: string): Promise<T | null> {
  const hit = cache.get(url) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000), headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json() as T;
    cache.set(url, { value: data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
}

function decodePythPrice(price: unknown, expo: unknown): number {
  // Strict: if either input is a non-numeric string we treat it as invalid.
  function strictN(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  const p = strictN(price);
  const e = strictN(expo);
  if (p === null || e === null) return 0;
  return p * Math.pow(10, e);
}

interface HermesPriceFeed {
  id?: string;
  price?: { price?: string | number; conf?: string | number; expo?: number; publish_time?: number };
}

export async function getEthUsdPrice(): Promise<PythPrice> {
  const url = `${HERMES_BASE}/v2/updates/price/latest?ids[]=${ETH_USD_FEED}`;
  const data = await getJson<{ parsed?: HermesPriceFeed[] }>(url);
  if (!data?.parsed || !Array.isArray(data.parsed) || data.parsed.length === 0) {
    return failed(ETH_USD_FEED, "no_parsed_feed");
  }
  const feed = data.parsed[0];
  if (!feed?.price) return failed(ETH_USD_FEED, "no_price_payload");
  const price = decodePythPrice(feed.price.price, feed.price.expo);
  const conf  = decodePythPrice(feed.price.conf,  feed.price.expo);
  if (price <= 0) return failed(ETH_USD_FEED, "zero_price");
  return {
    price,
    conf,
    ts: typeof feed.price.publish_time === "number" ? feed.price.publish_time * 1000 : Date.now(),
    feedId: ETH_USD_FEED,
    ok: true,
  };
}

export async function confirmEthPrice(observedMid: number, toleranceBps = 50): Promise<{
  agrees: boolean;
  pyth: PythPrice;
  deviationBps: number;
}> {
  const pyth = await getEthUsdPrice();
  if (!pyth.ok || pyth.price <= 0 || observedMid <= 0) {
    return { agrees: false, pyth, deviationBps: 0 };
  }
  const deviationBps = Math.abs(((observedMid - pyth.price) / pyth.price) * 10_000);
  return { agrees: deviationBps <= toleranceBps, pyth, deviationBps };
}

export function _resetPythCache(): void {
  cache.clear();
}

export const __testing = { decodePythPrice, ETH_USD_FEED };
