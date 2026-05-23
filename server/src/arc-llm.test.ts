import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { isLlmConfigured, routeLlmCall, __testing } from "./llm.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_OPENROUTER = process.env.OPENROUTER_API_KEY;
const ORIGINAL_ANTHROPIC = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_HERMES_URL = process.env.HERMES_URL;
const ORIGINAL_HERMES_KEY = process.env.HERMES_API_KEY;

function restoreEnv(): void {
  if (ORIGINAL_OPENROUTER === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_OPENROUTER;
  if (ORIGINAL_ANTHROPIC === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC;
  if (ORIGINAL_HERMES_URL === undefined) delete process.env.HERMES_URL;
  else process.env.HERMES_URL = ORIGINAL_HERMES_URL;
  if (ORIGINAL_HERMES_KEY === undefined) delete process.env.HERMES_API_KEY;
  else process.env.HERMES_API_KEY = ORIGINAL_HERMES_KEY;
}

describe("LLM proxy — input clamps", () => {
  it("clampMaxTokens defaults to 1024 and caps at 4096", () => {
    assert.equal(__testing.clampMaxTokens(undefined), 1024);
    assert.equal(__testing.clampMaxTokens(0), 1024);
    assert.equal(__testing.clampMaxTokens(-50), 1024);
    assert.equal(__testing.clampMaxTokens(123.7), 123);
    assert.equal(__testing.clampMaxTokens(100_000), 4096);
  });

  it("clampTemperature defaults to 0.4 and stays in [0, 2]", () => {
    assert.equal(__testing.clampTemperature(undefined), 0.4);
    assert.equal(__testing.clampTemperature(-1), 0);
    assert.equal(__testing.clampTemperature(2.5), 2);
    assert.equal(__testing.clampTemperature(0.9), 0.9);
  });

  it("FREE_DEFAULT_MODEL is a recognisable no-cost OpenRouter ID", () => {
    assert.match(__testing.FREE_DEFAULT_MODEL, /:free$/);
  });
});

describe("LLM proxy — provider routing", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.HERMES_URL;
    delete process.env.HERMES_API_KEY;
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreEnv();
  });

  it("returns ok=false reason=empty_prompt when prompt is blank", async () => {
    const r = await routeLlmCall({ prompt: "" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "empty_prompt");
    assert.equal(r.text, "");
  });

  it("returns ok=false reason=prompt_too_long when prompt exceeds limit", async () => {
    const r = await routeLlmCall({ prompt: "x".repeat(16_001) });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "prompt_too_long");
  });

  it("returns ok=false reason=no_provider_configured when no keys are set", async () => {
    const r = await routeLlmCall({ prompt: "hello" });
    assert.equal(r.ok, false);
    assert.equal(r.provider, "none");
    assert.match(r.reason ?? "", /no_provider_configured/);
  });

  it("isLlmConfigured returns false when no keys, true when any key present", () => {
    assert.equal(isLlmConfigured(), false);
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    assert.equal(isLlmConfigured(), true);
    delete process.env.OPENROUTER_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    assert.equal(isLlmConfigured(), true);
  });

  it("calls OpenRouter when OPENROUTER_API_KEY is set and returns parsed completion", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    const calls: { url: string; body: string }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "BULL regime — funding positive, OI rising." } }],
        usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const r = await routeLlmCall({ prompt: "Describe ETH regime." });
    assert.equal(r.ok, true);
    assert.equal(r.provider, "openrouter");
    assert.match(r.text, /BULL regime/);
    assert.equal(r.usage?.total_tokens, 20);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]);
    assert.match(calls[0]!.url, /openrouter\.ai\/api\/v1\/chat\/completions/);
    assert.match(calls[0]!.body, /Describe ETH regime/);
  });

  it("respects OPENROUTER_MODEL env override", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    process.env.OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";
    let observedModel = "";
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      observedModel = body.model ?? "";
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;

    const r = await routeLlmCall({ prompt: "ping" });
    assert.equal(r.ok, true);
    assert.equal(observedModel, "anthropic/claude-3.5-sonnet");
    delete process.env.OPENROUTER_MODEL;
  });

  it("falls through to Anthropic when OpenRouter is missing and ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    let calledUrl = "";
    globalThis.fetch = (async (url: string) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "BEAR regime." }],
        usage: { input_tokens: 5, output_tokens: 7 },
      }), { status: 200 });
    }) as typeof fetch;

    const r = await routeLlmCall({ prompt: "regime?" });
    assert.equal(r.ok, true);
    assert.equal(r.provider, "anthropic");
    assert.equal(r.text, "BEAR regime.");
    assert.equal(r.usage?.total_tokens, 12);
    assert.match(calledUrl, /api\.anthropic\.com\/v1\/messages/);
  });

  it("surfaces upstream HTTP errors as ok=false with reason", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    globalThis.fetch = (async () => new Response("rate limit", { status: 429 })) as typeof fetch;

    const r = await routeLlmCall({ prompt: "stress" });
    assert.equal(r.ok, false);
    assert.equal(r.provider, "openrouter");
    assert.match(r.reason ?? "", /openrouter_http_429/);
    assert.equal(r.text, "");
  });

  it("never returns fabricated text — empty completion is a failure", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })) as typeof fetch;

    const r = await routeLlmCall({ prompt: "ping" });
    assert.equal(r.ok, false);
    assert.equal(r.text, "");
    assert.match(r.reason ?? "", /empty_completion/);
  });

  it("isLlmConfigured includes HERMES_URL", () => {
    assert.equal(isLlmConfigured(), false);
    process.env.HERMES_URL = "http://localhost:8080";
    assert.equal(isLlmConfigured(), true);
  });

  it("routes to Hermes when only HERMES_URL is set", async () => {
    process.env.HERMES_URL = "http://localhost:8080";
    let observedUrl = "";
    let observedAuth = "";
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      observedUrl = String(url);
      observedAuth = String((init?.headers as Record<string, string>)?.["Authorization"] ?? "");
      return new Response(JSON.stringify({
        choices: [{ message: { content: "CHOPPY — funding flat, OI mean-reverting." } }],
        usage: { prompt_tokens: 4, completion_tokens: 9, total_tokens: 13 },
      }), { status: 200 });
    }) as typeof fetch;

    const r = await routeLlmCall({ prompt: "regime?" });
    assert.equal(r.ok, true);
    assert.equal(r.provider, "nous");
    assert.match(r.text, /CHOPPY/);
    assert.equal(observedUrl, "http://localhost:8080/v1/chat/completions");
    assert.equal(observedAuth, "", "no API key set → no Authorization header");
  });

  it("Hermes sends Authorization when HERMES_API_KEY is set", async () => {
    process.env.HERMES_URL = "https://hermes.internal";
    process.env.HERMES_API_KEY = "hk-test";
    let observedAuth = "";
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      observedAuth = String((init?.headers as Record<string, string>)?.["Authorization"] ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;
    const r = await routeLlmCall({ prompt: "ping" });
    assert.equal(r.ok, true);
    assert.equal(observedAuth, "Bearer hk-test");
  });

  it("Hermes returns ok=false on upstream HTTP error", async () => {
    process.env.HERMES_URL = "http://localhost:8080";
    globalThis.fetch = (async () => new Response("crashed", { status: 503 })) as typeof fetch;
    const r = await routeLlmCall({ prompt: "ping" });
    assert.equal(r.ok, false);
    assert.equal(r.provider, "nous");
    assert.match(r.reason ?? "", /hermes_http_503/);
  });
});
