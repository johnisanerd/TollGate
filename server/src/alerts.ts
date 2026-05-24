/**
 * Server-side alert dispatcher.
 *
 * Two channels:
 *   - Discord webhook   (DISCORD_WEBHOOK_URL)
 *   - Telegram bot      (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
 *
 * If neither env is configured, alerts are swallowed (no-op). The dispatcher
 * never throws into the caller — it logs to console.warn on send failure.
 *
 * De-duplication: per-channel last-sent body cache with 10-minute TTL so the
 * arb scanner can call dispatch() on every snapshot without spamming.
 */

export type AlertLevel = "info" | "warn" | "alert" | "success";

export interface AlertPayload {
  title: string;
  body: string;
  level?: AlertLevel;
  href?: string;
  dedupeKey?: string;
}

const DEDUPE_TTL_MS = 10 * 60 * 1000;
const sentKeys = new Map<string, number>();

function shouldSend(key: string | undefined): boolean {
  if (!key) return true;
  const now = Date.now();
  const exp = sentKeys.get(key);
  if (exp && exp > now) return false;
  sentKeys.set(key, now + DEDUPE_TTL_MS);
  if (sentKeys.size > 500) {
    for (const [k, expiresAt] of sentKeys) {
      if (expiresAt < now) sentKeys.delete(k);
    }
  }
  return true;
}

function emoji(level: AlertLevel): string {
  if (level === "alert") return "🚨";
  if (level === "warn") return "⚠️";
  if (level === "success") return "✅";
  return "ℹ️";
}

async function sendDiscord(payload: AlertPayload): Promise<{ ok: boolean; reason?: string }> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, reason: "no_discord_webhook" };
  const lines = [
    `${emoji(payload.level ?? "info")}  **${payload.title}**`,
    payload.body,
  ];
  if (payload.href) lines.push(`<${payload.href}>`);
  const body = JSON.stringify({ content: lines.join("\n") });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ok: false, reason: `discord_http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `discord_exception: ${(err as Error).message?.slice(0, 80)}` };
  }
}

async function sendTelegram(payload: AlertPayload): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, reason: "no_telegram_token" };
  const text = [
    `${emoji(payload.level ?? "info")} ${payload.title}`,
    payload.body,
    payload.href ? `Link: ${payload.href}` : null,
  ].filter(Boolean).join("\n");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ok: false, reason: `telegram_http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `telegram_exception: ${(err as Error).message?.slice(0, 80)}` };
  }
}

export interface DispatchResult {
  attempted: number;
  delivered: number;
  results: Array<{ channel: "discord" | "telegram"; ok: boolean; reason?: string }>;
  deduped?: boolean;
}

export async function dispatchAlert(payload: AlertPayload): Promise<DispatchResult> {
  if (!shouldSend(payload.dedupeKey)) {
    return { attempted: 0, delivered: 0, results: [], deduped: true };
  }
  const results: DispatchResult["results"] = [];
  let attempted = 0;
  if (process.env.DISCORD_WEBHOOK_URL) {
    attempted++;
    const r = await sendDiscord(payload);
    results.push({ channel: "discord", ok: r.ok, reason: r.reason });
  }
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    attempted++;
    const r = await sendTelegram(payload);
    results.push({ channel: "telegram", ok: r.ok, reason: r.reason });
  }
  return {
    attempted,
    delivered: results.filter((r) => r.ok).length,
    results,
  };
}

export function isAlertsConfigured(): { discord: boolean; telegram: boolean; any: boolean } {
  const discord  = Boolean(process.env.DISCORD_WEBHOOK_URL);
  const telegram = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  return { discord, telegram, any: discord || telegram };
}

export function _resetAlertsDedupe(): void {
  sentKeys.clear();
}
