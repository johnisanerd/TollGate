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
import { dispatchAlert } from "./alerts.js";
import { confirmEthPrice } from "./pyth.js";

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
  pyth?: { price: number; deviationBps: number; agrees: boolean; ts: number };
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

  // Pyth confirmation (best-effort — never blocks the snapshot).
  let pyth: ArbSnapshot["pyth"] | undefined;
  try {
    const liveMids = tickers.filter((t) => t.ok && t.mid > 0).map((t) => t.mid);
    if (liveMids.length > 0) {
      const consensus = liveMids.reduce((a, b) => a + b, 0) / liveMids.length;
      const confirm = await confirmEthPrice(consensus, 50);
      if (confirm.pyth.ok) {
        pyth = {
          price: confirm.pyth.price,
          deviationBps: confirm.deviationBps,
          agrees: confirm.agrees,
          ts: confirm.pyth.ts,
        };
      }
    }
  } catch { /* Pyth fail is non-fatal; snapshot returns without it */ }

  return {
    symbol,
    ts: Date.now(),
    tickers,
    opportunities,
    thresholdBps: ARB_THRESHOLD_BPS,
    pyth,
  };
}

const ALERT_NET_BPS_THRESHOLD = Number(process.env.ARB_ALERT_NET_BPS ?? 100);

async function maybeAlertOnSnapshot(snap: ArbSnapshot): Promise<void> {
  const best = snap.opportunities[0];
  if (!best) return;
  if (best.netBps < ALERT_NET_BPS_THRESHOLD) return;
  // Skip if Pyth disagrees — we don't want to broadcast stale spreads.
  if (snap.pyth && !snap.pyth.agrees) return;

  const dedupeKey = `arb:${best.buyVenue}->${best.sellVenue}:${Math.floor(best.netBps / 10)}`;
  await dispatchAlert({
    title: `ArcMind arbitrage — net ${best.netBps.toFixed(1)} bps`,
    body: [
      `Buy ${best.buyVenue} @ $${best.buyPrice.toFixed(2)} → Sell ${best.sellVenue} @ $${best.sellPrice.toFixed(2)}`,
      `Gross ${best.spreadBps.toFixed(1)} bps · Fees ${best.feeBps.toFixed(1)} bps · Net ${best.netBps.toFixed(1)} bps`,
      `Est. profit per $100: $${best.profitUsdPer100.toFixed(4)}`,
      snap.pyth ? `Pyth ETH/USD: $${snap.pyth.price.toFixed(2)} (Δ ${snap.pyth.deviationBps.toFixed(1)} bps)` : "Pyth confirmation unavailable",
    ].join("\n"),
    level: "alert",
    dedupeKey,
  }).catch(() => { /* swallow — alerts are best-effort */ });
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
      await maybeAlertOnSnapshot(snap);
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
