import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeOpportunities, __testing } from "./arb-scanner.js";
import type { Ticker } from "./exchanges.js";

function t(venue: Ticker["venue"], bid: number, ask: number): Ticker {
  return { venue, symbol: "ETH/USDC", bid, ask, mid: (bid + ask) / 2, ts: Date.now(), ok: true };
}

describe("Arb scanner — basic math", () => {
  it("bps helper returns 100 for a 1% increase", () => {
    assert.equal(Math.round(__testing.bps(101, 100)), 100);
  });

  it("bps returns 0 when denom <= 0", () => {
    assert.equal(__testing.bps(1, 0), 0);
  });

  it("feeBpsFor decreases as buyPrice grows (fixed costs amortise)", () => {
    const cheap = __testing.feeBpsFor(10);
    const dear  = __testing.feeBpsFor(10_000);
    assert.ok(cheap > dear, "fixed costs should weigh more on cheap notional");
  });
});

describe("Arb scanner — opportunity detection", () => {
  it("emits zero when no venue is live", () => {
    const ops = computeOpportunities([]);
    assert.equal(ops.length, 0);
  });

  it("emits zero when sell.bid does not exceed buy.ask", () => {
    const ops = computeOpportunities([
      t("okx", 3500.0, 3500.2),
      t("binance", 3499.9, 3500.1),
    ]);
    assert.equal(ops.length, 0);
  });

  it("emits ranked opportunities when spread exceeds threshold", () => {
    const ops = computeOpportunities([
      t("okx", 3500.0, 3500.0),
      t("binance", 3535.0, 3535.5),
    ]);
    assert.ok(ops.length >= 1, "should detect arb");
    const best = ops[0]!;
    assert.equal(best.buyVenue, "okx");
    assert.equal(best.sellVenue, "binance");
    assert.ok(best.netBps > __testing.ARB_THRESHOLD_BPS);
    assert.ok(best.profitUsdPer100 > 0);
  });

  it("excludes failed venues (ok=false)", () => {
    const okx: Ticker = { venue: "okx", symbol: "ETH/USDC", bid: 0, ask: 0, mid: 0, ts: Date.now(), ok: false, reason: "down" };
    const bin = t("binance", 3500, 3501);
    const ops = computeOpportunities([okx, bin]);
    assert.equal(ops.length, 0);
  });

  it("ranks best (highest netBps) first", () => {
    const ops = computeOpportunities([
      t("okx", 3000, 3000),
      t("binance", 3010, 3011),
      t("coinbase", 3050, 3051),
    ]);
    assert.ok(ops.length >= 2);
    for (let i = 1; i < ops.length; i++) {
      const prev = ops[i - 1]!;
      const curr = ops[i]!;
      assert.ok(prev.netBps >= curr.netBps, "must be sorted desc by netBps");
    }
    assert.equal(ops[0]!.buyVenue, "okx");
    assert.equal(ops[0]!.sellVenue, "coinbase");
  });
});
