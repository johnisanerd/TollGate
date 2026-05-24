import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { dispatchAlert, isAlertsConfigured, _resetAlertsDedupe } from "./alerts.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_DISCORD = process.env.DISCORD_WEBHOOK_URL;
const ORIGINAL_TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ORIGINAL_TG_CHAT = process.env.TELEGRAM_CHAT_ID;

function restoreEnv(): void {
  if (ORIGINAL_DISCORD === undefined) delete process.env.DISCORD_WEBHOOK_URL;
  else process.env.DISCORD_WEBHOOK_URL = ORIGINAL_DISCORD;
  if (ORIGINAL_TG_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_TG_TOKEN;
  if (ORIGINAL_TG_CHAT === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = ORIGINAL_TG_CHAT;
}

describe("Alerts dispatcher", () => {
  beforeEach(() => {
    _resetAlertsDedupe();
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreEnv();
  });

  it("isAlertsConfigured returns all-false with no env", () => {
    const s = isAlertsConfigured();
    assert.equal(s.any, false);
    assert.equal(s.discord, false);
    assert.equal(s.telegram, false);
  });

  it("no-op dispatch when nothing configured — never crashes", async () => {
    const r = await dispatchAlert({ title: "x", body: "y" });
    assert.equal(r.attempted, 0);
    assert.equal(r.delivered, 0);
    assert.equal(r.results.length, 0);
  });

  it("sends to Discord webhook when configured", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.example/webhook";
    let observedUrl = "";
    let observedBody = "";
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      observedUrl = String(url);
      observedBody = String(init?.body ?? "");
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const r = await dispatchAlert({ title: "Arb!", body: "OKX→Binance 120 bps", level: "alert", href: "https://testnet.arcscan.app/tx/0xabc" });
    assert.equal(r.attempted, 1);
    assert.equal(r.delivered, 1);
    assert.equal(r.results[0]!.channel, "discord");
    assert.equal(r.results[0]!.ok, true);
    assert.match(observedUrl, /discord\.example\/webhook/);
    assert.match(observedBody, /\*\*Arb!\*\*/);
    assert.match(observedBody, /<https:\/\/testnet\.arcscan\.app\/tx\/0xabc>/);
  });

  it("sends to both Discord and Telegram when both configured", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.example/webhook";
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
    const seen: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const r = await dispatchAlert({ title: "T", body: "B" });
    assert.equal(r.attempted, 2);
    assert.equal(r.delivered, 2);
    assert.ok(seen.some((u) => u.includes("discord.example")), "should hit discord");
    assert.ok(seen.some((u) => u.includes("api.telegram.org/bot")), "should hit telegram");
  });

  it("dedupes identical dedupeKey within TTL", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.example/webhook";
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(null, { status: 204 }); }) as typeof fetch;

    await dispatchAlert({ title: "X", body: "1", dedupeKey: "arb-key-1" });
    const second = await dispatchAlert({ title: "X", body: "1", dedupeKey: "arb-key-1" });
    assert.equal(second.deduped, true);
    assert.equal(second.delivered, 0);
    assert.equal(calls, 1);
  });

  it("dedupeKey changes lets the next alert through", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.example/webhook";
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(null, { status: 204 }); }) as typeof fetch;

    await dispatchAlert({ title: "X", body: "1", dedupeKey: "k-a" });
    await dispatchAlert({ title: "X", body: "2", dedupeKey: "k-b" });
    assert.equal(calls, 2);
  });

  it("HTTP failure on one channel does not block the other", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.example/webhook";
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes("discord.example")) return new Response("err", { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const r = await dispatchAlert({ title: "T", body: "B" });
    assert.equal(r.attempted, 2);
    assert.equal(r.delivered, 1);
    const tgResult = r.results.find((x) => x.channel === "telegram");
    assert.equal(tgResult?.ok, true);
    const dResult = r.results.find((x) => x.channel === "discord");
    assert.equal(dResult?.ok, false);
    assert.match(dResult?.reason ?? "", /discord_http_500/);
  });
});
