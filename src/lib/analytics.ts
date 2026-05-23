/**
 * Frontend analytics — env-gated PostHog capture (zero deps).
 *
 * Posts events directly to PostHog's HTTP capture endpoint instead of pulling
 * in `posthog-js`. When VITE_POSTHOG_KEY is missing every call is a no-op and
 * never throws.
 *
 * Required env:
 *   VITE_POSTHOG_KEY  — project API key (phc_…)
 * Optional:
 *   VITE_POSTHOG_HOST — defaults to https://us.i.posthog.com
 */

const DEFAULT_HOST = "https://us.i.posthog.com";

function env(key: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.trim() ? v.trim() : undefined;
}

export function isAnalyticsConfigured(): boolean {
  return !!env("VITE_POSTHOG_KEY");
}

let distinctId: string | null = null;

function getDistinctId(): string {
  if (distinctId) return distinctId;
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("arc.analytics.id") : null;
    if (stored) { distinctId = stored; return stored; }
    const fresh = `anon-${crypto.randomUUID()}`;
    if (typeof localStorage !== "undefined") localStorage.setItem("arc.analytics.id", fresh);
    distinctId = fresh;
    return fresh;
  } catch {
    const fallback = `anon-${Math.random().toString(36).slice(2)}`;
    distinctId = fallback;
    return fallback;
  }
}

export function identify(id: string): void {
  if (!id || typeof id !== "string") return;
  distinctId = id;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem("arc.analytics.id", id);
  } catch { /* analytics is best-effort */ }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  const apiKey = env("VITE_POSTHOG_KEY");
  if (!apiKey || !event) return;
  const host = env("VITE_POSTHOG_HOST") ?? DEFAULT_HOST;
  const payload = {
    api_key: apiKey,
    event,
    distinct_id: getDistinctId(),
    properties: { ...(properties ?? {}), $lib: "arcmind-frontend" },
    timestamp: new Date().toISOString(),
  };
  try {
    void fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch { /* never block UI on analytics */ }
}

export const analyticsEvents = {
  pageView: (path: string) => track("$pageview", { path }),
  agentSelected: (agentId: string) => track("agent_selected", { agentId }),
  stakeStarted: (marketAddr: string, amountUsdc: number) => track("stake_started", { marketAddr, amountUsdc }),
  stakeCompleted: (marketAddr: string, txHash: string, amountUsdc: number) =>
    track("stake_completed", { marketAddr, txHash, amountUsdc }),
  copySessionStarted: (vaultAddr: string) => track("copy_session_started", { vaultAddr }),
  arbScannerOpenedExecute: (route: string, spreadBps: number) =>
    track("arb_scanner_execute_clicked", { route, spreadBps }),
};
