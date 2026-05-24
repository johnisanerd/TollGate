import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { confirmEthPrice, getEthUsdPrice, _resetPythCache, __testing } from "./pyth.js";

const ORIGINAL_FETCH = globalThis.fetch;

function mock(body: unknown, status = 200): void {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}

describe("Pyth decoder", () => {
  it("decodes i64 price * 10^expo correctly", () => {
    const decoded = __testing.decodePythPrice("352051234567", -8);
    assert.ok(Math.abs(decoded - 3520.51234567) < 1e-7, `expected ~3520.51234567, got ${decoded}`);
    assert.equal(__testing.decodePythPrice(0, -8), 0);
  });

  it("returns 0 on invalid input", () => {
    assert.equal(__testing.decodePythPrice("not_a_number", -8), 0);
    assert.equal(__testing.decodePythPrice("100", "abc"), 0);
  });
});

describe("getEthUsdPrice", () => {
  beforeEach(() => { _resetPythCache(); });
  afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

  it("parses a healthy Hermes response", async () => {
    mock({
      parsed: [{
        id: __testing.ETH_USD_FEED,
        price: { price: "352051234567", conf: "1500000000", expo: -8, publish_time: 1779600000 },
      }],
    });
    const r = await getEthUsdPrice();
    assert.equal(r.ok, true);
    assert.ok(Math.abs(r.price - 3520.51234567) < 1e-7, `expected ~3520.51234567, got ${r.price}`);
    assert.ok(r.conf > 0);
    assert.equal(r.feedId, __testing.ETH_USD_FEED);
  });

  it("returns ok=false on HTTP error — no fabricated price", async () => {
    globalThis.fetch = (async () => new Response("err", { status: 503 })) as typeof fetch;
    const r = await getEthUsdPrice();
    assert.equal(r.ok, false);
    assert.equal(r.price, 0);
  });

  it("returns ok=false on empty parsed feed", async () => {
    mock({ parsed: [] });
    const r = await getEthUsdPrice();
    assert.equal(r.ok, false);
    assert.equal(r.reason, "no_parsed_feed");
  });

  it("returns ok=false when decoded price is zero", async () => {
    mock({
      parsed: [{
        id: __testing.ETH_USD_FEED,
        price: { price: "0", conf: "0", expo: -8, publish_time: 1779600000 },
      }],
    });
    const r = await getEthUsdPrice();
    assert.equal(r.ok, false);
    assert.equal(r.reason, "zero_price");
  });

  it("caches successive identical calls within TTL", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({
        parsed: [{ id: __testing.ETH_USD_FEED, price: { price: "100", conf: "1", expo: 0, publish_time: 1 } }],
      }), { status: 200 });
    }) as typeof fetch;
    await getEthUsdPrice();
    await getEthUsdPrice();
    assert.equal(calls, 1);
  });
});

describe("confirmEthPrice", () => {
  beforeEach(() => { _resetPythCache(); });
  afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

  it("agrees when observed mid is within toleranceBps of Pyth", async () => {
    mock({ parsed: [{ id: __testing.ETH_USD_FEED, price: { price: "350000000000", conf: "1", expo: -8, publish_time: 1 } }] });
    const r = await confirmEthPrice(3500.5, 50);
    assert.equal(r.pyth.ok, true);
    assert.ok(r.agrees, `should agree, deviationBps=${r.deviationBps}`);
    assert.ok(r.deviationBps < 50);
  });

  it("disagrees when deviation exceeds toleranceBps", async () => {
    mock({ parsed: [{ id: __testing.ETH_USD_FEED, price: { price: "350000000000", conf: "1", expo: -8, publish_time: 1 } }] });
    const r = await confirmEthPrice(3600, 50);
    assert.equal(r.agrees, false);
    assert.ok(r.deviationBps > 50);
  });

  it("agrees=false when Pyth fails — caller should not act on bad data", async () => {
    globalThis.fetch = (async () => new Response("err", { status: 502 })) as typeof fetch;
    const r = await confirmEthPrice(3500, 50);
    assert.equal(r.agrees, false);
    assert.equal(r.pyth.ok, false);
  });
});
