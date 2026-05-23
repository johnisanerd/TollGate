import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fetchTicker, fetchAllTickers, _resetExchangesCache } from "./exchanges.js";

const ORIGINAL_FETCH = globalThis.fetch;

function mockResponseByUrl(map: Record<string, { status?: number; body: unknown }>): void {
  globalThis.fetch = (async (url: string | URL, _init?: RequestInit) => {
    const u = String(url);
    for (const [pattern, resp] of Object.entries(map)) {
      if (u.includes(pattern)) {
        return new Response(JSON.stringify(resp.body), {
          status: resp.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("not mocked", { status: 404 });
  }) as typeof fetch;
}

describe("Exchange tickers — happy path per venue", () => {
  beforeEach(() => {
    _resetExchangesCache();
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("OKX parses bidPx/askPx and computes mid", async () => {
    mockResponseByUrl({
      "okx.com/api/v5/market/ticker": {
        body: { data: [{ bidPx: "3500.10", askPx: "3500.30" }] },
      },
    });
    const t = await fetchTicker("okx", "ETH/USDC");
    assert.equal(t.ok, true);
    assert.equal(t.venue, "okx");
    assert.equal(t.bid, 3500.1);
    assert.equal(t.ask, 3500.3);
    assert.equal(t.mid, 3500.2);
    assert.equal(t.symbol, "ETH/USDC");
  });

  it("Coinbase parses bid/ask from ticker endpoint and maps USDC→USD", async () => {
    let calledUrl = "";
    globalThis.fetch = (async (url: string | URL) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({ bid: "3499.95", ask: "3500.15" }), { status: 200 });
    }) as typeof fetch;
    const t = await fetchTicker("coinbase", "ETH/USDC");
    assert.equal(t.ok, true);
    assert.equal(t.bid, 3499.95);
    assert.equal(t.ask, 3500.15);
    assert.match(calledUrl, /ETH-USD\/ticker/);
  });

  it("Binance parses bidPrice/askPrice from bookTicker", async () => {
    mockResponseByUrl({
      "binance.com/api/v3/ticker/bookTicker": {
        body: { bidPrice: "3499.80", askPrice: "3499.90" },
      },
    });
    const t = await fetchTicker("binance", "ETH/USDT");
    assert.equal(t.ok, true);
    assert.equal(t.mid, (3499.8 + 3499.9) / 2);
  });

  it("Hyperliquid parses allMids and synthesises tight bid/ask around mid", async () => {
    mockResponseByUrl({
      "api.hyperliquid.xyz/info": { body: { ETH: "3500", BTC: "65000" } },
    });
    const t = await fetchTicker("hyperliquid", "ETH/USDC");
    assert.equal(t.ok, true);
    assert.equal(t.mid, 3500);
    assert.ok(t.ask > t.bid, "ask must exceed bid");
  });
});

describe("Exchange tickers — failure modes never fabricate numbers", () => {
  beforeEach(() => {
    _resetExchangesCache();
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("HTTP 5xx returns ok=false with http_<status> reason and zero values", async () => {
    globalThis.fetch = (async () => new Response("upstream down", { status: 503 })) as typeof fetch;
    const t = await fetchTicker("okx", "ETH/USDC");
    assert.equal(t.ok, false);
    assert.equal(t.bid, 0);
    assert.equal(t.ask, 0);
    assert.match(t.reason ?? "", /http_503/);
  });

  it("Empty quote (bid=0) is rejected, not coerced", async () => {
    mockResponseByUrl({
      "okx.com/api/v5/market/ticker": { body: { data: [{ bidPx: "0", askPx: "0" }] } },
    });
    const t = await fetchTicker("okx", "ETH/USDC");
    assert.equal(t.ok, false);
    assert.equal(t.reason, "zero_quote");
  });

  it("Coinbase HTTP error returns ok=false; no leakage of prior cached value", async () => {
    mockResponseByUrl({
      "exchange.coinbase.com/products/ETH-USD/ticker": { body: { bid: "3000", ask: "3001" } },
    });
    const ok = await fetchTicker("coinbase", "ETH/USDC");
    assert.equal(ok.ok, true);

    _resetExchangesCache();

    globalThis.fetch = (async () => new Response("nope", { status: 502 })) as typeof fetch;
    const fail = await fetchTicker("coinbase", "ETH/USDC");
    assert.equal(fail.ok, false);
    assert.equal(fail.bid, 0);
    assert.equal(fail.ask, 0);
  });
});

describe("Exchange tickers — cache + aggregation", () => {
  beforeEach(() => {
    _resetExchangesCache();
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("Caches successful response for 5s — second call does not hit network", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ data: [{ bidPx: "10", askPx: "11" }] }), { status: 200 });
    }) as typeof fetch;
    await fetchTicker("okx", "ETH/USDC");
    await fetchTicker("okx", "ETH/USDC");
    assert.equal(calls, 1);
  });

  it("fetchAllTickers returns 4 entries — one per venue — and tolerates partial failure", async () => {
    let counter = 0;
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      counter++;
      if (u.includes("exchange.coinbase.com")) {
        return new Response("err", { status: 500 });
      }
      if (u.includes("okx.com")) {
        return new Response(JSON.stringify({ data: [{ bidPx: "10", askPx: "11" }] }), { status: 200 });
      }
      if (u.includes("binance.com")) {
        return new Response(JSON.stringify({ bidPrice: "9.9", askPrice: "10.1" }), { status: 200 });
      }
      if (u.includes("hyperliquid.xyz")) {
        return new Response(JSON.stringify({ ETH: "10.05" }), { status: 200 });
      }
      return new Response("404", { status: 404 });
    }) as typeof fetch;

    const all = await fetchAllTickers("ETH/USDC");
    assert.equal(all.length, 4);
    const venues = all.map((t) => t.venue).sort();
    assert.deepEqual(venues, ["binance", "coinbase", "hyperliquid", "okx"]);
    const ok = all.filter((t) => t.ok);
    const fail = all.filter((t) => !t.ok);
    assert.equal(ok.length, 3);
    assert.equal(fail.length, 1);
    assert.ok(fail[0]);
    assert.equal(fail[0]!.venue, "coinbase");
    assert.ok(counter >= 4);
  });
});
