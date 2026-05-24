/**
 * dYdX v4 read-only position adapter.
 *
 * Fetches perpetual positions for a given address from the dYdX Chain indexer
 * (Cosmos-based, no auth required for public reads).
 *
 * Docs: https://indexer.dydx.trade/v4
 */

export interface DydxPosition {
  market: string;
  side: "LONG" | "SHORT";
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  createdAt: string;
  status: "OPEN" | "CLOSED" | "LIQUIDATED";
}

export interface DydxPositionsResult {
  ok: boolean;
  positions: DydxPosition[];
  reason?: string;
}

const BASE = "https://indexer.dydx.trade/v4";

export function isDydxAddressConfigured(address?: string): boolean {
  return typeof address === "string" && /^dydx1[a-z0-9]{38}$/.test(address);
}

export async function getDydxPositions(address: string): Promise<DydxPositionsResult> {
  if (!isDydxAddressConfigured(address)) {
    return { ok: false, positions: [], reason: "not_configured" };
  }
  try {
    const res = await fetch(
      `${BASE}/addresses/${encodeURIComponent(address)}/perpetualPositions?status=OPEN&limit=20`,
      { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } },
    );
    if (!res.ok) return { ok: false, positions: [], reason: `HTTP ${res.status}` };
    const data = await res.json() as { positions?: unknown[] };
    const raw = Array.isArray(data.positions) ? data.positions : [];
    const positions: DydxPosition[] = raw.flatMap((p) => {
      if (!p || typeof p !== "object") return [];
      const r = p as Record<string, unknown>;
      return [{
        market: String(r["market"] ?? ""),
        side: String(r["side"] ?? "") === "SHORT" ? "SHORT" : "LONG",
        size: String(r["size"] ?? "0"),
        entryPrice: String(r["entryPrice"] ?? "0"),
        unrealizedPnl: String(r["unrealizedPnl"] ?? "0"),
        createdAt: String(r["createdAt"] ?? ""),
        status: String(r["status"] ?? "OPEN") as DydxPosition["status"],
      }];
    });
    return { ok: true, positions };
  } catch (err) {
    return { ok: false, positions: [], reason: err instanceof Error ? err.message : "fetch failed" };
  }
}
