/**
 * GMX v2 read-only position adapter (Arbitrum).
 *
 * Reads open perpetual positions for an EVM address via the GMX Arbitrum
 * stats API. No auth required for public reads.
 *
 * Docs: https://gmx-io.gitbook.io/gmx/api
 */

export interface GmxPosition {
  market: string;
  side: "LONG" | "SHORT";
  sizeUsd: string;
  collateralUsd: string;
  entryPrice: string;
  pnl: string;
  netValue: string;
}

export interface GmxPositionsResult {
  ok: boolean;
  positions: GmxPosition[];
  reason?: string;
}

const BASE = "https://arbitrum-api.gmxinfra.io";

export function isEvmAddress(address?: string): boolean {
  return typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address);
}

export async function getGmxPositions(address: string): Promise<GmxPositionsResult> {
  if (!isEvmAddress(address)) {
    return { ok: false, positions: [], reason: "not_configured" };
  }
  try {
    const res = await fetch(
      `${BASE}/positions?account=${address.toLowerCase()}`,
      { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } },
    );
    if (!res.ok) return { ok: false, positions: [], reason: `HTTP ${res.status}` };
    const data = await res.json() as unknown;
    const raw = Array.isArray(data) ? data : ((data as Record<string, unknown>)["positions"] as unknown[]) ?? [];
    const positions: GmxPosition[] = raw.flatMap((p) => {
      if (!p || typeof p !== "object") return [];
      const r = p as Record<string, unknown>;
      return [{
        market: String(r["market"] ?? r["indexToken"] ?? ""),
        side: String(r["isLong"] ?? "true") === "false" ? "SHORT" : "LONG",
        sizeUsd: String(r["sizeInUsd"] ?? r["size"] ?? "0"),
        collateralUsd: String(r["collateralAmount"] ?? "0"),
        entryPrice: String(r["entryPrice"] ?? "0"),
        pnl: String(r["pnl"] ?? "0"),
        netValue: String(r["netValue"] ?? "0"),
      }];
    });
    return { ok: true, positions };
  } catch (err) {
    return { ok: false, positions: [], reason: err instanceof Error ? err.message : "fetch failed" };
  }
}
