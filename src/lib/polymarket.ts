/**
 * Polymarket Gamma API client (public, no auth needed for read endpoints).
 *
 * Docs: https://docs.polymarket.com/gamma-markets-api
 *
 * Endpoints used:
 *   GET https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=N&order=volume24hr&ascending=false
 *
 * 60-second in-memory cache. Returns [] on any error — never invented markets.
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const TTL_MS = 60_000;

interface CacheEntry<T> { value: T; ts: number }
const cache = new Map<string, CacheEntry<unknown>>();

export interface PolymarketOutcome {
  label: string;
  probability: number;
  priceUsdc: number;
}

export interface PolymarketMarket {
  id: string;
  slug: string;
  question: string;
  description?: string;
  endDate?: string;
  volume24h: number;
  volumeAllTime: number;
  liquidity: number;
  outcomes: PolymarketOutcome[];
  url: string;
  raw: Record<string, unknown>;
}

function n(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function s(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch { /* not JSON */ }
  }
  return [];
}

function adaptMarket(raw: Record<string, unknown>): PolymarketMarket | null {
  const id = s(raw["id"]) || s(raw["conditionId"]);
  const slug = s(raw["slug"]);
  const question = s(raw["question"]);
  if (!id || !question) return null;

  const outcomeLabels = parseJsonArray(raw["outcomes"]).filter((x): x is string => typeof x === "string");
  const outcomePrices = parseJsonArray(raw["outcomePrices"]).map((x) => n(x));

  const outcomes: PolymarketOutcome[] = outcomeLabels.map((label, i) => {
    const p = outcomePrices[i] ?? 0;
    return { label, probability: p, priceUsdc: p };
  });

  return {
    id,
    slug,
    question,
    description: s(raw["description"]) || undefined,
    endDate: s(raw["endDate"]) || s(raw["endDateIso"]) || undefined,
    volume24h: n(raw["volume24hr"]) || n(raw["volume24hrAmm"]),
    volumeAllTime: n(raw["volume"]) || n(raw["volumeAmm"]),
    liquidity: n(raw["liquidity"]),
    outcomes,
    url: slug ? `https://polymarket.com/event/${slug}` : "https://polymarket.com",
    raw,
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  const hit = cache.get(url) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json() as T;
    cache.set(url, { value: data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
}

export async function getTopMarkets(limit = 12): Promise<PolymarketMarket[]> {
  const clampedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const url = `${GAMMA_BASE}/markets?active=true&closed=false&limit=${clampedLimit}&order=volume24hr&ascending=false`;
  const data = await getJson<unknown[]>(url);
  if (!Array.isArray(data)) return [];
  return data
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map(adaptMarket)
    .filter((m): m is PolymarketMarket => m !== null)
    .filter((m) => m.outcomes.length >= 2);
}

export async function getMarketsByTag(tag: string, limit = 12): Promise<PolymarketMarket[]> {
  const tagClean = tag.trim().toLowerCase();
  if (!tagClean) return getTopMarkets(limit);
  const url = `${GAMMA_BASE}/markets?active=true&closed=false&tag=${encodeURIComponent(tagClean)}&limit=${limit}&order=volume24hr&ascending=false`;
  const data = await getJson<unknown[]>(url);
  if (!Array.isArray(data)) return [];
  return data
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map(adaptMarket)
    .filter((m): m is PolymarketMarket => m !== null);
}

export function polymarketUrl(slug: string): string {
  return `https://polymarket.com/event/${slug}`;
}

export function _resetPolymarketCache(): void {
  cache.clear();
}
