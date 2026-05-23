/**
 * Cross-venue arbitrage scanner.
 *
 * Scans OKX, Coinbase, Binance, Hyperliquid every N seconds and computes the
 * pairwise spread between the lowest ask (buy) and highest bid (sell). When
 * the spread net of estimated fees exceeds the configured threshold, an
 * `Opportunity` is emitted to all SSE subscribers.
 *
 * Fees and costs modelled (all in basis points unless noted):
 *   - CCTP burn fee: $0.05 fixed (per Circle docs)
 *   - Arc gas:      $0.01 fixed
 *   - Maker fee:    ~5 bps (combined buy + sell)
 *
 * Threshold for emission: net spread ≥ ARB_THRESHOLD_BPS (default 30 = 0.30%).
 */

import { fetchAllTickers, type Ticker, type VenueId } from "./exchanges.js";

export interface ArbOpportunity {
  id: string;
  symbol: string;
  buyVenue: VenueId;
  sellVenue: VenueId;
  buyPrice: number;
  sellPrice: number;
  spreadBps: number;
  feeBps: number;
  netBps: number;
  profitUsdPer100: number;
  ts: number;
}

export interface ArbSnapshot {
  symbol: string;
  ts: number;
  tickers: Ticker[];
  opportunities: ArbOpportunity[];
  thresholdBps: number;
}

const SYMBOL = "ETH/USDC";
const ARB_THRESHOLD_BPS = Number(process.env.ARB_THRESHOLD_BPS ?? 30);
const COMBINED_MAKER_FEE_BPS = Number(process.env.ARB_MAKER_FEE_BPS ?? 5);

function bps(num: number, denom: number): number {
  if (denom <= 0) return 0;
  return ((num - denom) / denom) * 10_000;
}

function feeBpsFor(buyPrice: number): number {
  const fixedCostsUsd = 0.05 + 0.01;
  const fixedCostsBps = (fixedCostsUsd / buyPrice) * 10_000;
  return COMBINED_MAKER_FEE_BPS + fixedCostsBps;
}

export function computeOpportunities(tickers: Ticker[], symbol = SYMBOL): ArbOpportunity[] {
  const live = tickers.filter((t) => t.ok && t.bid > 0 && t.ask > 0);
  if (live.length < 2) return [];

  const out: ArbOpportunity[] = [];
  for (const buy of live) {
    for (const sell of live) {
      if (buy.venue === sell.venue) continue;
      if (sell.bid <= buy.ask) continue;
      const spread = bps(sell.bid, buy.ask);
      const fee = feeBpsFor(buy.ask);
      const net = spread - fee;
      if (net < ARB_THRESHOLD_BPS) continue;
      const profitUsdPer100 = (net / 10_000) * 100;
      out.push({
        id: `${buy.venue}->${sell.venue}@${Math.floor(buy.ts / 1000)}`,
        symbol,
        buyVenue: buy.venue,
        sellVenue: sell.venue,
        buyPrice: buy.ask,
        sellPrice: sell.bid,
        spreadBps: Number(spread.toFixed(2)),
        feeBps: Number(fee.toFixed(2)),
        netBps: Number(net.toFixed(2)),
        profitUsdPer100: Number(profitUsdPer100.toFixed(4)),
        ts: Math.max(buy.ts, sell.ts),
      });
    }
  }
  out.sort((a, b) => b.netBps - a.netBps);
  return out;
}

export async function buildSnapshot(symbol = SYMBOL): Promise<ArbSnapshot> {
  const tickers = await fetchAllTickers(symbol);
  const opportunities = computeOpportunities(tickers, symbol);
  return {
    symbol,
    ts: Date.now(),
    tickers,
    opportunities,
    thresholdBps: ARB_THRESHOLD_BPS,
  };
}

type Listener = (snap: ArbSnapshot) => void;
const listeners = new Set<Listener>();

export function onArbSnapshot(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let schedulerStop: (() => void) | null = null;
const SCAN_INTERVAL_MS = Number(process.env.ARB_SCAN_INTERVAL_MS ?? 10_000);

export function startArbScanner(): () => void {
  if (schedulerStop) return schedulerStop;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const snap = await buildSnapshot();
      for (const cb of listeners) {
        try { cb(snap); } catch { /* swallow per-listener errors */ }
      }
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, SCAN_INTERVAL_MS);
  const stop = () => clearInterval(timer);
  schedulerStop = stop;
  return stop;
}

export const __testing = { bps, feeBpsFor, ARB_THRESHOLD_BPS };
