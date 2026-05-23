import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getCircleStatus, createProgrammableWallet, _testing } from "./circle.js";

const ORIGINAL_FETCH = globalThis.fetch;
const KEYS = ["CIRCLE_API_KEY", "CIRCLE_PAYMASTER_POLICY_ID", "CIRCLE_USYC_ROUTER_ADDRESS", "CIRCLE_WALLET_SET_ID"] as const;
const SAVED: Record<string, string | undefined> = {};

function saveEnv(): void { for (const k of KEYS) SAVED[k] = process.env[k]; }
function clearEnv(): void { for (const k of KEYS) delete process.env[k]; }
function restoreEnv(): void {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
}

describe("Circle status", () => {
  beforeEach(() => { saveEnv(); clearEnv(); });
  afterEach(() => { restoreEnv(); globalThis.fetch = ORIGINAL_FETCH; });

  it("reports all-false when no env keys are present", () => {
    const s = getCircleStatus();
    assert.equal(s.any, false);
    assert.equal(s.paymaster.configured, false);
    assert.equal(s.wallets.configured, false);
    assert.equal(s.usyc.configured, false);
  });

  it("paymaster needs both api key and policy id", () => {
    process.env.CIRCLE_API_KEY = "TEST_KEY:secret";
    let s = getCircleStatus();
    assert.equal(s.paymaster.configured, false, "no policy id yet");
    assert.equal(s.wallets.configured, true);
    process.env.CIRCLE_PAYMASTER_POLICY_ID = "policy_abc";
    s = getCircleStatus();
    assert.equal(s.paymaster.configured, true);
    assert.equal(s.paymaster.policyId, "policy_abc");
  });

  it("USYC standalone configured when router env set", () => {
    process.env.CIRCLE_USYC_ROUTER_ADDRESS = "0xabc";
    const s = getCircleStatus();
    assert.equal(s.usyc.configured, true);
    assert.equal(s.usyc.router, "0xabc");
    assert.equal(s.any, true);
  });

  it("masks api key in status (never leaks full secret)", () => {
    process.env.CIRCLE_API_KEY = "TEST_KEY:abcdef1234567890";
    const s = getCircleStatus();
    assert.ok(s.wallets.apiKeyMasked, "should set masked key");
    assert.notEqual(s.wallets.apiKeyMasked, process.env.CIRCLE_API_KEY);
    assert.match(s.wallets.apiKeyMasked!, /…/);
  });

  it("maskKey utility — short key shows ***", () => {
    assert.equal(_testing.maskKey(undefined), undefined);
    assert.equal(_testing.maskKey("short"), "***");
    assert.equal(_testing.maskKey("longerkey12345"), "long…2345");
  });
});

describe("createProgrammableWallet", () => {
  beforeEach(() => { saveEnv(); clearEnv(); });
  afterEach(() => { restoreEnv(); globalThis.fetch = ORIGINAL_FETCH; });

  it("returns ok=false reason=not_configured without API key", async () => {
    const r = await createProgrammableWallet("agent-1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not_configured");
  });

  it("returns ok=false reason=wallet_set_id_missing when only API key set", async () => {
    process.env.CIRCLE_API_KEY = "TEST_KEY";
    const r = await createProgrammableWallet("agent-1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "wallet_set_id_missing");
  });

  it("calls Circle API when fully configured and parses success response", async () => {
    process.env.CIRCLE_API_KEY = "TEST_KEY";
    process.env.CIRCLE_WALLET_SET_ID = "set_123";
    let captured: { url: string; auth: string; body: string } | null = null;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      captured = {
        url: String(url),
        auth: String((init?.headers as Record<string, string>)["Authorization"] ?? ""),
        body: String(init?.body ?? ""),
      };
      return new Response(JSON.stringify({ data: { wallets: [{ id: "wallet_xyz", address: "0xWalletAddress" }] } }), { status: 200 });
    }) as typeof fetch;

    const r = await createProgrammableWallet("agent-arc-eth-usdc");
    assert.equal(r.ok, true);
    assert.equal(r.walletId, "wallet_xyz");
    assert.equal(r.address, "0xWalletAddress");
    if (!captured) throw new Error("fetch should have been called");
    const cap = captured as { url: string; auth: string; body: string };
    assert.match(cap.url, /circle\.com\/v1\/w3s\/developer\/wallets/);
    assert.match(cap.auth, /Bearer TEST_KEY/);
    assert.match(cap.body, /agent-arc-eth-usdc/);
  });

  it("returns ok=false on HTTP non-2xx — never fabricates a wallet", async () => {
    process.env.CIRCLE_API_KEY = "TEST_KEY";
    process.env.CIRCLE_WALLET_SET_ID = "set_123";
    globalThis.fetch = (async () => new Response("rate limited", { status: 429 })) as typeof fetch;
    const r = await createProgrammableWallet("agent-1");
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /http_429/);
  });

  it("returns ok=false when response has no wallet payload", async () => {
    process.env.CIRCLE_API_KEY = "TEST_KEY";
    process.env.CIRCLE_WALLET_SET_ID = "set_123";
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: { wallets: [] } }), { status: 200 })) as typeof fetch;
    const r = await createProgrammableWallet("agent-1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "no_wallet_returned");
  });
});
