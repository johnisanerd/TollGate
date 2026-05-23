/**
 * Public REST tickers from major venues: OKX, Coinbase, Binance, Hyperliquid.
 *
 * All endpoints are unauthenticated and free. Each call is cached in-process
 * for 5 seconds to stay well under each venue's rate limit (600/min default).
 *
 * Exposed shape per venue: { bid, ask, mid, ts, ok }. If a venue fails the
 * record returns ok=false with `reason` — we never invent numbers.
 *
 *   OKX:        https://www.okx.com/api/v5/market/ticker
 *   Coinbase:   https://api.exchange.coinbase.com/products/<id>/ticker
 *   Binance:    https://api.binance.com/api/v3/ticker/bookTicker
 *   Hyperliquid: POST https://api.hyperliquid.xyz/info { type: "allMids" }
 */

export type VenueId = "okx" | "coinbase" | "binance" | "hyperliquid";

export interface Ticker {
  venue: VenueId;
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  ts: number;
  ok: boolean;
  reason?: string;
}

const TTL_MS = 5_000;
const cache = new Map<string, { value: Ticker; expires: number }>();

function key(venue: VenueId, symbol: string): string {
  return `${venue}:${symbol}`;
}

function readCache(venue: VenueId, symbol: string): Ticker | null {
  const hit = cache.get(key(venue, symbol));
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key(venue, symbol));
    return null;
  }
  return hit.value;
}

function writeCache(t: Ticker): void {
  cache.set(key(t.venue, t.symbol), { value: t, expires: Date.now() + TTL_MS });
}

function n(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function failed(venue: VenueId, symbol: string, reason: string): Ticker {
  return { venue, symbol, bid: 0, ask: 0, mid: 0, ts: Date.now(), ok: false, reason };
}

async function fetchOkx(symbol: string): Promise<Ticker> {
  const instId = symbol.replace("/", "-").toUpperCase();
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return failed("okx", symbol, `http_${res.status}`);
    const data = await res.json() as { data?: Array<{ bidPx?: string; askPx?: string; last?: string }> };
    const row = data?.data?.[0];
    if (!row) return failed("okx", symbol, "empty_response");
    const bid = n(row.bidPx);
    const ask = n(row.askPx);
    if (bid <= 0 || ask <= 0) return failed("okx", symbol, "zero_quote");
    return { venue: "okx", symbol, bid, ask, mid: (bid + ask) / 2, ts: Date.now(), ok: true };
  } catch (err) {
    return failed("okx", symbol, `exception: ${(err as Error).message?.slice(0, 80)}`);
  }
}

async function fetchCoinbase(symbol: string): Promise<Ticker> {
  const product = symbol.replace("/", "-").toUpperCase();
  try {
    const res = await fetch(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: "application/json", "User-Agent": "ArcMind/1.0" },
    });
    if (!res.ok) return failed("coinbase", symbol, `http_${res.status}`);
    const data = await res.json() as { bid?: string; ask?: string; price?: string };
    const bid = n(data.bid);
    const ask = n(data.ask);
    if (bid <= 0 || ask <= 0) return failed("coinbase", symbol, "zero_quote");
    return { venue: "coinbase", symbol, bid, ask, mid: (bid + ask) / 2, ts: Date.now(), ok: true };
  } catch (err) {
    return failed("coinbase", symbol, `exception: ${(err as Error).message?.slice(0, 80)}`);
  }
}

async function fetchBinance(symbol: string): Promise<Ticker> {
  const binanceSymbol = symbol.replace("/", "").toUpperCase();
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(binanceSymbol)}`, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return failed("binance", symbol, `http_${res.status}`);
    const data = await res.json() as { bidPrice?: string; askPrice?: string };
    const bid = n(data.bidPrice);
    const ask = n(data.askPrice);
    if (bid <= 0 || ask <= 0) return failed("binance", symbol, "zero_quote");
    return { venue: "binance", symbol, bid, ask, mid: (bid + ask) / 2, ts: Date.now(), ok: true };
  } catch (err) {
    return failed("binance", symbol, `exception: ${(err as Error).message?.slice(0, 80)}`);
  }
}

async function fetchHyperliquid(symbol: string): Promise<Ticker> {
  const base = (symbol.split("/")[0] ?? symbol).toUpperCase();
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ type: "allMids" }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return failed("hyperliquid", symbol, `http_${res.status}`);
    const data = await res.json() as Record<string, string>;
    const mid = n(data?.[base]);
    if (mid <= 0) return failed("hyperliquid", symbol, "no_symbol");
    const spread = mid * 0.0001;
    return {
      venue: "hyperliquid",
      symbol,
      bid: mid - spread / 2,
      ask: mid + spread / 2,
      mid,
      ts: Date.now(),
      ok: true,
    };
  } catch (err) {
    return failed("hyperliquid", symbol, `exception: ${(err as Error).message?.slice(0, 80)}`);
  }
}

const FETCHERS: Record<VenueId, (symbol: string) => Promise<Ticker>> = {
  okx: fetchOkx,
  coinbase: fetchCoinbase,
  binance: fetchBinance,
  hyperliquid: fetchHyperliquid,
};

function normalizeSymbolForVenue(venue: VenueId, symbol: string): string {
  if (venue === "coinbase" && symbol.toUpperCase().endsWith("/USDC")) {
    return symbol.replace(/\/USDC$/i, "/USD");
  }
  if ((venue === "okx" || venue === "binance") && symbol.toUpperCase().endsWith("/USDC")) {
    return symbol.replace(/\/USDC$/i, "/USDT");
  }
  return symbol;
}

export async function fetchTicker(venue: VenueId, symbol: string): Promise<Ticker> {
  const normSymbol = normalizeSymbolForVenue(venue, symbol);
  const cached = readCache(venue, normSymbol);
  if (cached) return { ...cached, symbol };
  const result = await FETCHERS[venue](normSymbol);
  const out: Ticker = { ...result, symbol };
  if (out.ok) writeCache({ ...result });
  return out;
}

export async function fetchAllTickers(symbol = "ETH/USDC"): Promise<Ticker[]> {
  const venues: VenueId[] = ["okx", "coinbase", "binance", "hyperliquid"];
  return Promise.all(venues.map((v) => fetchTicker(v, symbol)));
}

export function _resetExchangesCache(): void {
  cache.clear();
}
