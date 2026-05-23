import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { isPinataConfigured, pinJson } from "./pinata.js";
import { isFarcasterConfigured, postCast } from "./farcaster.js";
import { isApifyConfigured, fetchNews, _resetApifyCache } from "./apify.js";

const ORIGINAL_FETCH = globalThis.fetch;
const KEYS = ["PINATA_JWT", "PINATA_GATEWAY", "NEYNAR_API_KEY", "NEYNAR_SIGNER_UUID", "APIFY_TOKEN"] as const;
const SAVED: Record<string, string | undefined> = {};

function saveEnv(): void { for (const k of KEYS) SAVED[k] = process.env[k]; }
function clearEnv(): void { for (const k of KEYS) delete process.env[k]; }
function restoreEnv(): void {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
}

describe("Pinata IPFS pinning", () => {
  beforeEach(() => { saveEnv(); clearEnv(); });
  afterEach(() => { restoreEnv(); globalThis.fetch = ORIGINAL_FETCH; });

  it("isPinataConfigured false without JWT", () => {
    assert.equal(isPinataConfigured(), false);
  });

  it("pinJson returns ok=false reason=not_configured without JWT", async () => {
    const r = await pinJson("test", { a: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not_configured");
  });

  it("pinJson rejects empty name", async () => {
    process.env.PINATA_JWT = "jwt-test";
    const r = await pinJson("   ", { a: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "name_required");
  });

  it("pinJson posts to Pinata and parses CID", async () => {
    process.env.PINATA_JWT = "jwt-test";
    let observed: { url: string; auth: string; body: string } | null = null;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      observed = {
        url: String(url),
        auth: String((init?.headers as Record<string, string>)["Authorization"] ?? ""),
        body: String(init?.body ?? ""),
      };
      return new Response(JSON.stringify({ IpfsHash: "QmTestCid", PinSize: 42, Timestamp: "2026-05-23T10:00:00Z" }), { status: 200 });
    }) as typeof fetch;

    const r = await pinJson("decision-001", { decision: "BUY" });
    assert.equal(r.ok, true);
    assert.equal(r.cid, "QmTestCid");
    assert.equal(r.pinSize, 42);
    assert.match(r.gatewayUrl ?? "", /\/QmTestCid$/);
    if (!observed) throw new Error("fetch should have been called");
    const obs = observed as { url: string; auth: string; body: string };
    assert.match(obs.url, /pinning\/pinJSONToIPFS/);
    assert.match(obs.auth, /Bearer jwt-test/);
    assert.match(obs.body, /decision-001/);
    assert.match(obs.body, /"BUY"/);
  });

  it("pinJson returns ok=false on HTTP error — never fabricates CID", async () => {
    process.env.PINATA_JWT = "jwt-test";
    globalThis.fetch = (async () => new Response("forbidden", { status: 403 })) as typeof fetch;
    const r = await pinJson("x", { a: 1 });
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /http_403/);
  });

  it("respects PINATA_GATEWAY override", async () => {
    process.env.PINATA_JWT = "jwt-test";
    process.env.PINATA_GATEWAY = "https://custom.gw/ipfs";
    globalThis.fetch = (async () => new Response(JSON.stringify({ IpfsHash: "QmX" }), { status: 200 })) as typeof fetch;
    const r = await pinJson("x", { a: 1 });
    assert.equal(r.gatewayUrl, "https://custom.gw/ipfs/QmX");
  });
});

describe("Farcaster cast (Neynar)", () => {
  beforeEach(() => { saveEnv(); clearEnv(); });
  afterEach(() => { restoreEnv(); globalThis.fetch = ORIGINAL_FETCH; });

  it("isFarcasterConfigured needs both API key and signer", () => {
    assert.equal(isFarcasterConfigured(), false);
    process.env.NEYNAR_API_KEY = "k";
    assert.equal(isFarcasterConfigured(), false);
    process.env.NEYNAR_SIGNER_UUID = "uuid-1";
    assert.equal(isFarcasterConfigured(), true);
  });

  it("postCast returns ok=false reason=not_configured without env", async () => {
    const r = await postCast("hi");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not_configured");
  });

  it("postCast rejects empty text", async () => {
    process.env.NEYNAR_API_KEY = "k";
    process.env.NEYNAR_SIGNER_UUID = "uuid-1";
    const r = await postCast("   ");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "text_required");
  });

  it("postCast posts via Neynar and returns cast hash", async () => {
    process.env.NEYNAR_API_KEY = "test-key";
    process.env.NEYNAR_SIGNER_UUID = "uuid-bot";
    let observed: { url: string; key: string; body: string } | null = null;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      observed = {
        url: String(url),
        key: String((init?.headers as Record<string, string>)["x-api-key"] ?? ""),
        body: String(init?.body ?? ""),
      };
      return new Response(JSON.stringify({ cast: { hash: "0xCastHash", author: { username: "arcmind" } } }), { status: 200 });
    }) as typeof fetch;

    const r = await postCast("BUY ETH @ $3500 — reasoning ipfs://Qm…", { embedUrl: "https://testnet.arcscan.app/tx/0xabc" });
    assert.equal(r.ok, true);
    assert.equal(r.hash, "0xCastHash");
    assert.equal(r.author, "arcmind");
    if (!observed) throw new Error("fetch should have been called");
    const obs = observed as { url: string; key: string; body: string };
    assert.match(obs.url, /api\.neynar\.com\/v2\/farcaster\/cast/);
    assert.equal(obs.key, "test-key");
    assert.match(obs.body, /BUY ETH/);
    assert.match(obs.body, /embeds/);
  });

  it("postCast trims to 320 chars", async () => {
    process.env.NEYNAR_API_KEY = "k";
    process.env.NEYNAR_SIGNER_UUID = "uuid";
    let bodyText = "";
    globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
      bodyText = String(init?.body ?? "");
      return new Response(JSON.stringify({ cast: { hash: "0xH" } }), { status: 200 });
    }) as typeof fetch;
    const long = "a".repeat(400);
    await postCast(long);
    const parsed = JSON.parse(bodyText) as { text: string };
    assert.equal(parsed.text.length, 320);
  });
});

describe("Apify news fetcher", () => {
  beforeEach(() => { saveEnv(); clearEnv(); _resetApifyCache(); });
  afterEach(() => { restoreEnv(); globalThis.fetch = ORIGINAL_FETCH; });

  it("isApifyConfigured false without token", () => {
    assert.equal(isApifyConfigured(), false);
  });

  it("fetchNews returns ok=false not_configured without token", async () => {
    const r = await fetchNews();
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not_configured");
    assert.equal(r.items.length, 0);
  });

  it("fetchNews calls Apify run-sync and adapts items", async () => {
    process.env.APIFY_TOKEN = "tok";
    globalThis.fetch = (async (url: string | URL) => {
      assert.match(String(url), /run-sync-get-dataset-items/);
      assert.match(String(url), /token=tok/);
      return new Response(JSON.stringify([
        { title: "Fed cuts rates", url: "https://example/news/1", source: "Reuters", publishedAt: "2026-05-23T09:00:00Z" },
        { headline: "ETH ATH", link: "https://example/news/2", domain: "coindesk.com", date: "2026-05-23T09:30:00Z", summary: "ETH hits new all-time high" },
        { title: "no url" },
      ]), { status: 200 });
    }) as typeof fetch;

    const r = await fetchNews({ limit: 50 });
    assert.equal(r.ok, true);
    assert.equal(r.items.length, 2);
    assert.equal(r.items[0]!.title, "Fed cuts rates");
    assert.equal(r.items[1]!.title, "ETH ATH");
    assert.equal(r.items[1]!.source, "coindesk.com");
    assert.equal(r.items[1]!.summary, "ETH hits new all-time high");
  });

  it("fetchNews caches identical calls (single fetch)", async () => {
    process.env.APIFY_TOKEN = "tok";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify([{ title: "x", url: "https://x" }]), { status: 200 });
    }) as typeof fetch;
    await fetchNews();
    await fetchNews();
    assert.equal(calls, 1);
  });

  it("fetchNews returns ok=false on HTTP error", async () => {
    process.env.APIFY_TOKEN = "tok";
    globalThis.fetch = (async () => new Response("err", { status: 500 })) as typeof fetch;
    const r = await fetchNews();
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /http_500/);
  });

  it("fetchNews returns ok=false when actor returns non-array", async () => {
    process.env.APIFY_TOKEN = "tok";
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "x" }), { status: 200 })) as typeof fetch;
    const r = await fetchNews();
    assert.equal(r.ok, false);
    assert.equal(r.reason, "non_array_response");
  });
});
