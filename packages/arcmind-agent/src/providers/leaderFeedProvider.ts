/**
 * External leader feed provider (optional).
 *
 * Reads from runtime.getSetting("ARC_LEADER_FEED_URL"). When unset, the provider
 * reports an honest "missing" state — ArcMind then keeps SignalGuard mode active
 * and refuses to invent copy-leaders.
 */

import type { Provider, ProviderResult } from "../types.js";

export const leaderFeedProvider: Provider = {
  name: "leader_feed",
  description: "Optional external copy-leader feed. When missing, ArcMind runs SignalGuard mode.",

  async get(runtime, _message, _state): Promise<ProviderResult> {
    const url = runtime.getSetting("ARC_LEADER_FEED_URL");
    if (!url) {
      return {
        text: "Leader feed: not configured (SignalGuard mode active).",
        values: { leaders: [], leaderFeedStatus: "missing" },
        data: { sourceStatus: "missing", provider: "External leader feed", requiredEnv: ["ARC_LEADER_FEED_URL"] },
      };
    }
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return {
          text: `Leader feed: HTTP ${res.status} (SignalGuard mode active).`,
          values: { leaders: [], leaderFeedStatus: "unavailable" },
          data: { sourceStatus: "unavailable", provider: "External leader feed", sourceUrl: url },
        };
      }
      const data = await res.json() as { leaders?: unknown[] } | unknown[];
      const rows = Array.isArray(data)
        ? data
        : Array.isArray((data as { leaders?: unknown[] }).leaders)
          ? (data as { leaders: unknown[] }).leaders
          : [];
      return {
        text: `Leader feed: ${rows.length} rows loaded.`,
        values: { leaders: rows, leaderFeedStatus: "configured" },
        data: {
          sourceStatus: "configured",
          provider: "External leader feed",
          sourceUrl: url,
          lastUpdated: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        text: `Leader feed: fetch failed (${(err as Error).message}). SignalGuard mode active.`,
        values: { leaders: [], leaderFeedStatus: "unavailable" },
        data: { sourceStatus: "unavailable", provider: "External leader feed", error: (err as Error).message },
      };
    }
  },
};
