import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  getPolymarketStatus,
  recordPolymarketIntent,
  isPolymarketConfigured,
  _testing,
} from "./polymarket-exec.js";

const KEYS = ["POLYMARKET_PRIVATE_KEY", "POLYMARKET_DRY_RUN", "POLYMARKET_CLOB_BASE"] as const;
const SAVED: Record<string, string | undefined> = {};

function saveEnv(): void { for (const k of KEYS) SAVED[k] = process.env[k]; }
function clearEnv(): void { for (const k of KEYS) delete process.env[k]; }
function restoreEnv(): void {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
}

const VALID_TOKEN = "12345678901234567890";

describe("Polymarket status", () => {
  beforeEach(() => { saveEnv(); clearEnv(); });
  afterEach(() => { restoreEnv(); });

  it("defaults to dry-run + unconfigured", () => {
    const s = getPolymarketStatus();
    assert.equal(s.configured, false);
    assert.equal(s.dryRun, true);
    assert.equal(s.maxBetUsdc, 5);
    assert.equal(s.hasPrivateKey, false);
  });

  it("dryRun honours POLYMARKET_DRY_RUN=false", () => {
    process.env.POLYMARKET_DRY_RUN = "false";
    assert.equal(getPolymarketStatus().dryRun, false);
    process.env.POLYMARKET_DRY_RUN = "true";
    assert.equal(getPolymarketStatus().dryRun, true);
    process.env.POLYMARKET_DRY_RUN = "0";
    assert.equal(getPolymarketStatus().dryRun, false);
  });

  it("isPolymarketConfigured true when private key set", () => {
    process.env.POLYMARKET_PRIVATE_KEY = "0xabc";
    assert.equal(isPolymarketConfigured(), true);
  });

  it("CLOB base overridable", () => {
    process.env.POLYMARKET_CLOB_BASE = "https://staging.clob.polymarket.com";
    assert.equal(getPolymarketStatus().clobBase, "https://staging.clob.polymarket.com");
  });
});

describe("recordPolymarketIntent — input validation", () => {
  beforeEach(() => { saveEnv(); clearEnv(); });
  afterEach(() => { restoreEnv(); });

  it("rejects invalid token id", async () => {
    const r = await recordPolymarketIntent({ tokenId: "bad-id", side: "BUY", sizeUsdc: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "invalid_token_id");
  });

  it("rejects invalid side", async () => {
    const r = await recordPolymarketIntent({ tokenId: VALID_TOKEN, side: "LONG" as "BUY", sizeUsdc: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "invalid_side");
  });

  it("rejects non-positive size", async () => {
    const r = await recordPolymarketIntent({ tokenId: VALID_TOKEN, side: "BUY", sizeUsdc: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "invalid_size");
  });

  it("rejects size over hard cap", async () => {
    const r = await recordPolymarketIntent({ tokenId: VALID_TOKEN, side: "BUY", sizeUsdc: _testing.MAX_BET_USDC + 0.01 });
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /over_max_bet_5/);
  });

  it("rejects price outside [0,1]", async () => {
    const r = await recordPolymarketIntent({ tokenId: VALID_TOKEN, side: "BUY", sizeUsdc: 1, price: 1.5 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "invalid_price");
  });

  it("records valid intent in dry-run mode (default)", async () => {
    const r = await recordPolymarketIntent({
      tokenId: VALID_TOKEN,
      side: "BUY",
      sizeUsdc: 1.5,
      price: 0.62,
      marketSlug: "fed-rate-cut-jun",
    });
    assert.equal(r.ok, true);
    assert.equal(r.status, "intent_recorded");
    assert.equal(r.payload?.tokenId, VALID_TOKEN);
    assert.equal(r.payload?.side, "BUY");
    assert.equal(r.payload?.sizeUsdc, 1.5);
    assert.equal(r.payload?.price, 0.62);
    assert.equal(r.payload?.marketSlug, "fed-rate-cut-jun");
    assert.match(r.intentId ?? "", /^pm-intent-/);
    assert.ok(r.payload?.createdAt && new Date(r.payload.createdAt).toString() !== "Invalid Date");
  });

  it("rejects live mode with not_implemented when keys + dryRun=false (safety gate)", async () => {
    process.env.POLYMARKET_PRIVATE_KEY = "0xkey";
    process.env.POLYMARKET_DRY_RUN = "false";
    const r = await recordPolymarketIntent({ tokenId: VALID_TOKEN, side: "BUY", sizeUsdc: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "live_signer_not_implemented");
    assert.equal(r.intentId !== undefined, true, "intentId still returned for audit");
    assert.equal(r.payload?.sizeUsdc, 1);
  });
});
