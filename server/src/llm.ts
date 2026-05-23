/**
 * Server-side LLM proxy for the Arc workspace.
 *
 * Multi-model routing per the approved plan:
 *   1) OpenRouter (OpenAI-compatible) — default; supports Claude, GPT, Llama,
 *      Nous Hermes 3 405B, Mistral, etc. with one API key.
 *   2) Direct Anthropic — optional fallback if ANTHROPIC_API_KEY is set.
 *   3) Rule-based fallback — if no LLM key is configured at all, the route
 *      returns ok=false with a structured reason. NEVER returns fabricated text.
 *
 * All keys live on the server. The frontend never sees them — it calls
 * `POST /api/llm/route` and receives a `{ ok, model, text, usage }` payload.
 */

interface LlmRouteInput {
  prompt: string;
  system?: string;
  /** Format: "<provider>/<model-id>" (e.g. "nousresearch/hermes-3-llama-3.1-405b:free"). */
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmRouteOutput {
  ok: boolean;
  provider: "openrouter" | "anthropic" | "openai" | "nous" | "none";
  model: string;
  text: string;
  reason?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const FREE_DEFAULT_MODEL = "nousresearch/hermes-3-llama-3.1-405b:free";

function clampMaxTokens(input?: number): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) return 1024;
  return Math.min(4096, Math.floor(input));
}

function clampTemperature(input?: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) return 0.4;
  return Math.max(0, Math.min(2, input));
}

async function callOpenRouter(input: LlmRouteInput): Promise<LlmRouteOutput | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = input.model ?? process.env.OPENROUTER_MODEL ?? FREE_DEFAULT_MODEL;
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  messages.push({ role: "user", content: input.prompt });

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://toll-gatee.vercel.app",
        "X-Title": process.env.OPENROUTER_TITLE ?? "ArcMind",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: clampMaxTokens(input.maxTokens),
        temperature: clampTemperature(input.temperature),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        provider: "openrouter",
        model,
        text: "",
        reason: `openrouter_http_${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string };
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      return {
        ok: false,
        provider: "openrouter",
        model,
        text: "",
        reason: data.error?.message ?? "empty_completion",
      };
    }

    return { ok: true, provider: "openrouter", model, text, usage: data.usage };
  } catch (err) {
    return {
      ok: false,
      provider: "openrouter",
      model,
      text: "",
      reason: `openrouter_exception: ${(err as Error).message?.slice(0, 200) ?? "unknown"}`,
    };
  }
}

/**
 * Hermes — self-hosted Nous Research agent runtime.
 *
 * Hermes exposes an OpenAI-compatible `/v1/chat/completions` endpoint on
 * `HERMES_URL` (default: http://localhost:8080). Auth via optional bearer
 * `HERMES_API_KEY`. Used as a sovereign fallback when external APIs fail or
 * for sensitive prompts that should not leave the operator's infra.
 *
 * Docs: https://hermes-agent.nousresearch.com/docs/
 */
async function callHermes(input: LlmRouteInput): Promise<LlmRouteOutput | null> {
  const baseUrl = process.env.HERMES_URL;
  if (!baseUrl) return null;
  const model = input.model ?? process.env.HERMES_MODEL ?? "hermes-3-llama-3.1-8b";
  const apiKey = process.env.HERMES_API_KEY;
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  messages.push({ role: "user", content: input.prompt });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: clampMaxTokens(input.maxTokens),
        temperature: clampTemperature(input.temperature),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false, provider: "nous", model, text: "",
        reason: `hermes_http_${res.status}: ${errText.slice(0, 200)}`,
      };
    }
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      return {
        ok: false, provider: "nous", model, text: "",
        reason: data.error?.message ?? "empty_completion",
      };
    }
    return { ok: true, provider: "nous", model, text, usage: data.usage };
  } catch (err) {
    return {
      ok: false, provider: "nous", model, text: "",
      reason: `hermes_exception: ${(err as Error).message?.slice(0, 200) ?? "unknown"}`,
    };
  }
}

async function callAnthropic(input: LlmRouteInput): Promise<LlmRouteOutput | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = input.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: clampMaxTokens(input.maxTokens),
        temperature: clampTemperature(input.temperature),
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        provider: "anthropic",
        model,
        text: "",
        reason: `anthropic_http_${res.status}: ${errText.slice(0, 200)}`,
      };
    }
    const data = await res.json() as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    if (!text) {
      return { ok: false, provider: "anthropic", model, text: "", reason: "empty_completion" };
    }
    return {
      ok: true,
      provider: "anthropic",
      model,
      text,
      usage: {
        prompt_tokens: data.usage?.input_tokens,
        completion_tokens: data.usage?.output_tokens,
        total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    };
  } catch (err) {
    return {
      ok: false,
      provider: "anthropic",
      model,
      text: "",
      reason: `anthropic_exception: ${(err as Error).message?.slice(0, 200) ?? "unknown"}`,
    };
  }
}

/**
 * Route an LLM call through configured providers in order:
 *   OpenRouter → Anthropic direct.
 *
 * If a provider key is missing it's skipped silently. If a configured provider
 * fails, the next is tried. If nothing is configured at all the call returns
 * ok=false with reason=no_provider — never a fabricated completion.
 */
export async function routeLlmCall(input: LlmRouteInput): Promise<LlmRouteOutput> {
  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) {
    return { ok: false, provider: "none", model: "", text: "", reason: "empty_prompt" };
  }
  if (input.prompt.length > 16_000) {
    return { ok: false, provider: "none", model: "", text: "", reason: "prompt_too_long" };
  }

  const attempts: Array<() => Promise<LlmRouteOutput | null>> = [
    () => callOpenRouter(input),
    () => callAnthropic(input),
    () => callHermes(input),
  ];

  let lastFailure: LlmRouteOutput | null = null;
  for (const attempt of attempts) {
    const result = await attempt();
    if (!result) continue;
    if (result.ok) return result;
    lastFailure = result;
  }

  if (lastFailure) return lastFailure;
  return {
    ok: false,
    provider: "none",
    model: "",
    text: "",
    reason: "no_provider_configured — set OPENROUTER_API_KEY or ANTHROPIC_API_KEY",
  };
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.HERMES_URL);
}

export const __testing = { clampMaxTokens, clampTemperature, FREE_DEFAULT_MODEL };
