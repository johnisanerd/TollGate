/**
 * Hyperliquid Info API client.
 *
 * Endpoint: POST https://api.hyperliquid.xyz/info
 * Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 *
 * 60-second in-memory cache per request type to avoid hammering the public API.
 */

const HL_INFO_URL = "https://api.hyperliquid.xyz/info";
const TTL_MS = 60_000;

interface CacheEntry<T> { value: T; ts: number }
const cache = new Map<string, CacheEntry<unknown>>();

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const key = JSON.stringify(body);
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value;
  const res = await fetch(HL_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Hyperliquid Info HTTP ${res.status}`);
  const data = await res.json() as T;
  cache.set(key, { value: data, ts: Date.now() });
  return data;
}

export interface VaultSummary {
  name: string;
  vaultAddress: string;
  leader: string;
  apr: number;
  aum: number;
  followers: number;
  mdd: number;
  ageDays: number;
  raw: Record<string, unknown>;
}

export interface VaultPortfolioPoint { ts: number; value: number; pnl: number }

export interface VaultDetails {
  name: string;
  vaultAddress: string;
  leader: string;
  description: string;
  apr: number;
  aum: number;
  followers: number;
  mdd: number;
  ageDays: number;
  feeBps: number;
  leaderStakeUsd: number;
  tradedAssets: string[];
  portfolio: VaultPortfolioPoint[];
  raw: Record<string, unknown>;
}

export interface LeaderboardEntry {
  address: string;
  displayName?: string;
  accountValue: number;
  pnl: number;
  roi: number;
  volume: number;
  raw: Record<string, unknown>;
}

function n(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function s(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function adaptVaultSummary(raw: Record<string, unknown>): VaultSummary {
  const name = s(raw["name"]) || s(raw["vaultName"]) || "Unnamed vault";
  const vaultAddress = s(raw["vaultAddress"]) || s(raw["address"]);
  const leader = s(raw["leader"]);
  const aprRaw = n(raw["apr"]);
  const apr = aprRaw < 5 ? aprRaw * 100 : aprRaw;
  const aum = n(raw["tvl"]) || n(raw["aum"]) || n(raw["totalNotionalValue"]);
  const followers = n(raw["followers"]) || n(raw["numFollowers"]);
  const mdd = n(raw["mdd"]) || n(raw["maxDrawdown"]);
  const createdAt = n(raw["createTimeMillis"]);
  const ageDays = createdAt > 0 ? Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000)) : 0;
  return { name, vaultAddress, leader, apr, aum, followers, mdd, ageDays, raw };
}

export async function getVaultSummaries(): Promise<VaultSummary[]> {
  try {
    const data = await postInfo<unknown[]>({ type: "vaultSummaries" });
    if (!Array.isArray(data)) return [];
    return data
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map(adaptVaultSummary)
      .filter((v) => v.vaultAddress !== "");
  } catch {
    return [];
  }
}

export async function getVaultDetails(vaultAddress: string): Promise<VaultDetails | null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(vaultAddress)) return null;
  try {
    const data = await postInfo<Record<string, unknown>>({ type: "vaultDetails", vaultAddress });
    if (!data || typeof data !== "object") return null;
    const portfolioRaw = Array.isArray(data["portfolio"]) ? data["portfolio"] as unknown[] : [];
    let portfolio: VaultPortfolioPoint[] = [];
    for (const row of portfolioRaw) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const window = row[0];
      const series = row[1] as Record<string, unknown> | undefined;
      if (window !== "allTime" || !series || typeof series !== "object") continue;
      const accountValue = Array.isArray(series["accountValueHistory"]) ? series["accountValueHistory"] as unknown[][] : [];
      const pnlHist = Array.isArray(series["pnlHistory"]) ? series["pnlHistory"] as unknown[][] : [];
      portfolio = accountValue.map((point, i) => ({
        ts: n(point[0]),
        value: n(point[1]),
        pnl: n(pnlHist[i]?.[1]),
      }));
      break;
    }

    const summary = adaptVaultSummary(data);
    const description = s(data["description"]);
    const feeBps = n(data["profitShareBps"]) || n(data["feeBps"]);
    const leaderStakeUsd = n(data["leaderFraction"]) * summary.aum;
    const tradedAssetsRaw = data["allowedAssets"] ?? data["assets"] ?? [];
    const tradedAssets = Array.isArray(tradedAssetsRaw)
      ? tradedAssetsRaw.filter((a): a is string => typeof a === "string")
      : [];

    return {
      ...summary,
      description,
      feeBps,
      leaderStakeUsd,
      tradedAssets,
      portfolio,
      raw: data,
    };
  } catch {
    return null;
  }
}

function adaptLeaderboardEntry(raw: Record<string, unknown>): LeaderboardEntry {
  return {
    address: s(raw["ethAddress"]) || s(raw["address"]),
    displayName: s(raw["displayName"]) || undefined,
    accountValue: n(raw["accountValue"]),
    pnl: n(raw["pnl"]),
    roi: n(raw["roi"]) * 100,
    volume: n(raw["volume"]),
    raw,
  };
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const data = await postInfo<{ leaderboardRows?: unknown[] } | unknown[]>({ type: "leaderboard" });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { leaderboardRows?: unknown[] }).leaderboardRows)
        ? (data as { leaderboardRows: unknown[] }).leaderboardRows
        : [];
    return rows
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map(adaptLeaderboardEntry)
      .filter((e) => e.address !== "");
  } catch {
    return [];
  }
}

/** Public Hyperliquid web URL for a vault page. */
export function hyperliquidVaultUrl(vaultAddress: string): string {
  return `https://app.hyperliquid.xyz/vaults/${vaultAddress}`;
}

/** Reset cache — used in tests. */
export function _resetHyperliquidCache(): void {
  cache.clear();
}
