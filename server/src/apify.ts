/**
 * Apify news/social scraper — env-gated client.
 *
 * Uses Apify's run-sync endpoint to fetch dataset items in one HTTP call:
 *   POST https://api.apify.com/v2/acts/{actorId}/run-sync-get-dataset-items?token=$APIFY_TOKEN
 *
 * Default actor: `johnvc~GoogleNewsAPI` (Google News search, q="crypto", past day).
 * It returns one dataset item per results page; the articles are in `news_results`.
 * Returns ok=false / reason='not_configured' when APIFY_TOKEN is missing.
 * Cached 60s in-memory to avoid burning monthly free credits.
 */

const APIFY_TTL_MS = 60_000;
const DEFAULT_ACTOR = "johnvc~GoogleNewsAPI";
const DEFAULT_INPUT: Record<string, unknown> = { q: "crypto", time_range: "day", max_pages: 1 };

interface CacheEntry<T> { value: T; ts: number }
const cache = new Map<string, CacheEntry<unknown>>();

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
  raw: Record<string, unknown>;
}

export interface NewsResult {
  ok: boolean;
  reason?: string;
  items: NewsItem[];
  fetchedAt: number;
}

export function isApifyConfigured(): boolean {
  return Boolean(process.env["APIFY_TOKEN"]);
}

function s(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function adaptItem(raw: Record<string, unknown>): NewsItem | null {
  const title = s(raw["title"]) || s(raw["headline"]);
  const url = s(raw["url"]) || s(raw["link"]);
  if (!title || !url) return null;
  const out: NewsItem = {
    title,
    url,
    source: s(raw["source"]) || s(raw["domain"]) || "",
    publishedAt: s(raw["publishedAt"]) || s(raw["published_at"]).replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/, "$1T$2Z") || s(raw["date"]) || "",
    raw,
  };
  const summary = s(raw["summary"]) || s(raw["description"]) || s(raw["snippet"]);
  if (summary) out.summary = summary;
  return out;
}

export async function fetchNews(opts?: { actorId?: string; input?: Record<string, unknown>; limit?: number }): Promise<NewsResult> {
  const token = process.env["APIFY_TOKEN"];
  if (!token) return { ok: false, reason: "not_configured", items: [], fetchedAt: Date.now() };
  const actorId = opts?.actorId ?? DEFAULT_ACTOR;
  const input = opts?.input ?? (actorId === DEFAULT_ACTOR ? DEFAULT_INPUT : {});
  const limit = Math.max(1, Math.min(opts?.limit ?? 20, 100));
  const cacheKey = `${actorId}:${JSON.stringify(input)}:${limit}`;
  const hit = cache.get(cacheKey) as CacheEntry<NewsResult> | undefined;
  if (hit && Date.now() - hit.ts < APIFY_TTL_MS) return hit.value;

  try {
    const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&limit=${limit}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}`, items: [], fetchedAt: Date.now() };
    }
    const raw = await res.json() as unknown;
    if (!Array.isArray(raw)) {
      return { ok: false, reason: "non_array_response", items: [], fetchedAt: Date.now() };
    }
    const items: NewsItem[] = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const page = (r as Record<string, unknown>)["news_results"];
      for (const row of Array.isArray(page) ? page : [r]) {
        if (!row || typeof row !== "object") continue;
        const adapted = adaptItem(row as Record<string, unknown>);
        if (adapted) items.push(adapted);
      }
    }
    const result: NewsResult = { ok: true, items: items.slice(0, limit), fetchedAt: Date.now() };
    cache.set(cacheKey, { value: result, ts: Date.now() });
    return result;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch_failed", items: [], fetchedAt: Date.now() };
  }
}

export function _resetApifyCache(): void {
  cache.clear();
}
