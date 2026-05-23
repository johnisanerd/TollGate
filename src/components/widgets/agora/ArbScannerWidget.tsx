import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, AlertCircle, Activity, TrendingUp } from "lucide-react";
import type { Workspace } from "../../../types";

const SERVER = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

type VenueId = "okx" | "coinbase" | "binance" | "hyperliquid";

interface Ticker {
  venue: VenueId;
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  ts: number;
  ok: boolean;
  reason?: string;
}

interface ArbOpportunity {
  id: string;
  symbol: string;
  buyVenue: VenueId;
  sellVenue: VenueId;
  buyPrice: number;
  sellPrice: number;
  spreadBps: number;
  feeBps: number;
  netBps: number;
  profitUsdPer100: number;
  ts: number;
}

interface ArbSnapshot {
  symbol: string;
  ts: number;
  tickers: Ticker[];
  opportunities: ArbOpportunity[];
  thresholdBps: number;
}

const VENUE_LABEL: Record<VenueId, string> = {
  okx: "OKX",
  coinbase: "Coinbase",
  binance: "Binance",
  hyperliquid: "Hyperliquid",
};

const VENUE_LINK: Record<VenueId, string> = {
  okx: "https://www.okx.com/trade-spot/eth-usdt",
  coinbase: "https://www.coinbase.com/advanced-trade/spot/ETH-USD",
  binance: "https://www.binance.com/en/trade/ETH_USDT",
  hyperliquid: "https://app.hyperliquid.xyz/trade/ETH",
};

function fmtUsd(n: number, frac = 2): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${n.toFixed(frac)}`;
}

interface Props {
  workspace: Workspace;
}

export function ArbScannerWidget({ workspace: _workspace }: Props) {
  const [snap, setSnap] = useState<ArbSnapshot | null>(null);
  const [streamState, setStreamState] = useState<"connecting" | "live" | "polling" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const lastSeenAt = useRef<number>(0);

  useEffect(() => {
    if (!SERVER) {
      setError("VITE_SERVER_URL not configured — set it to the deployed backend URL.");
      setStreamState("error");
      return;
    }

    let cancelled = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function pollOnce() {
      try {
        const res = await fetch(`${SERVER}/api/arb/snapshot?symbol=ETH/USDC`, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as ArbSnapshot;
        if (!cancelled) {
          setSnap(data);
          lastSeenAt.current = Date.now();
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? "Snapshot fetch failed.");
      }
    }

    try {
      es = new EventSource(`${SERVER}/api/arb/stream`);
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as { type?: string; snap?: ArbSnapshot };
          if (payload?.type === "snapshot" && payload.snap) {
            if (cancelled) return;
            setSnap(payload.snap);
            lastSeenAt.current = Date.now();
            setStreamState("live");
            setError(null);
          }
        } catch { /* ignore parse */ }
      };
      es.onerror = () => {
        if (cancelled) return;
        setStreamState("polling");
        if (!pollTimer) {
          pollTimer = setInterval(pollOnce, 10_000);
          void pollOnce();
        }
      };
    } catch (err) {
      setError((err as Error).message ?? "Failed to open SSE stream.");
      setStreamState("polling");
      pollTimer = setInterval(pollOnce, 10_000);
      void pollOnce();
    }

    void pollOnce();

    return () => {
      cancelled = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  const liveTickers = useMemo(() => (snap?.tickers ?? []).filter((t) => t.ok), [snap]);
  const failedTickers = useMemo(() => (snap?.tickers ?? []).filter((t) => !t.ok), [snap]);
  const opportunities = snap?.opportunities ?? [];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{
        background: "linear-gradient(145deg, rgba(34,197,94,0.06), rgba(8,13,25,0.92))",
        border: "1px solid rgba(34,197,94,0.22)",
        borderRadius: 18,
        padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(34,197,94,0.18)", display: "grid", placeItems: "center" }}>
            <TrendingUp size={18} style={{ color: "#22c55e" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 800 }}>Cross-Platform Arbitrage Scanner</h2>
            <p style={{ margin: "3px 0 0", color: "#9fb0c8", fontSize: ".75rem" }}>
              Live spreads across OKX / Coinbase / Binance / Hyperliquid for ETH/USDC.
              When net spread (after CCTP $0.05 + Arc gas $0.01 + maker fees) ≥ {snap?.thresholdBps ?? 30} bps an opportunity is emitted.
            </p>
          </div>
          <span style={{
            fontSize: ".62rem", color: streamState === "live" ? "#22c55e" : streamState === "polling" ? "#f59e0b" : "#fb7185",
            background: streamState === "live" ? "rgba(34,197,94,0.12)" : streamState === "polling" ? "rgba(245,158,11,0.12)" : "rgba(251,113,133,0.12)",
            padding: "4px 9px", borderRadius: 6, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <Activity size={11} />
            {streamState === "live" ? "SSE live" : streamState === "polling" ? "polling fallback" : streamState === "connecting" ? "connecting…" : "error"}
          </span>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, background: "rgba(251,113,133,0.08)",
          border: "1px solid rgba(251,113,133,0.25)", color: "#fecdd3", fontSize: ".75rem",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div style={{
        background: "rgba(8,13,25,0.94)",
        border: "1px solid rgba(96,165,250,0.20)",
        borderRadius: 14, padding: 14,
      }}>
        <div style={{ fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 10 }}>
          Live tickers · ETH/USDC
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {liveTickers.length === 0 && (
            <div style={{ color: "#94a3b8", fontSize: ".75rem" }}>Waiting for first snapshot…</div>
          )}
          {liveTickers.map((t) => (
            <a key={t.venue} href={VENUE_LINK[t.venue]} target="_blank" rel="noreferrer"
              style={{
                display: "block", padding: 11, borderRadius: 10,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                color: "inherit", textDecoration: "none",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: ".78rem", fontWeight: 800, color: "#fff" }}>{VENUE_LABEL[t.venue]}</span>
                <ExternalLink size={11} style={{ color: "#94a3b8" }} />
              </div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#22d3ee", fontVariantNumeric: "tabular-nums" }}>{fmtUsd(t.mid)}</div>
              <div style={{ fontSize: ".62rem", color: "#94a3b8", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
                bid {fmtUsd(t.bid, 2)} · ask {fmtUsd(t.ask, 2)}
              </div>
            </a>
          ))}
        </div>
        {failedTickers.length > 0 && (
          <div style={{ marginTop: 10, fontSize: ".62rem", color: "#fb7185" }}>
            offline: {failedTickers.map((t) => `${VENUE_LABEL[t.venue]} (${t.reason ?? "down"})`).join(", ")}
          </div>
        )}
      </div>

      <div style={{
        background: "rgba(8,13,25,0.94)",
        border: "1px solid rgba(96,165,250,0.20)",
        borderRadius: 14, padding: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700 }}>
            Net opportunities (≥{snap?.thresholdBps ?? 30} bps after all fees)
          </span>
          <span style={{ fontSize: ".62rem", color: "#94a3b8" }}>
            {snap ? `last update: ${new Date(snap.ts).toLocaleTimeString()}` : "—"}
          </span>
        </div>
        {opportunities.length === 0 && (
          <div style={{ color: "#94a3b8", fontSize: ".75rem", padding: "20px 0", textAlign: "center" }}>
            No opportunities right now. Markets are converged within the configured fee threshold.
          </div>
        )}
        {opportunities.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".75rem" }}>
              <thead>
                <tr style={{ background: "rgba(96,165,250,0.06)" }}>
                  <th style={th()}>Buy</th>
                  <th style={th()}>Sell</th>
                  <th style={th()}>Buy ask</th>
                  <th style={th()}>Sell bid</th>
                  <th style={th()}>Gross</th>
                  <th style={th()}>Fees</th>
                  <th style={th()}>Net</th>
                  <th style={th()}>Profit / $100</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((o) => (
                  <tr key={o.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={td()}>
                      <a href={VENUE_LINK[o.buyVenue]} target="_blank" rel="noreferrer" style={{ color: "#22c55e", textDecoration: "none", fontWeight: 700 }}>
                        {VENUE_LABEL[o.buyVenue]} ↗
                      </a>
                    </td>
                    <td style={td()}>
                      <a href={VENUE_LINK[o.sellVenue]} target="_blank" rel="noreferrer" style={{ color: "#fb7185", textDecoration: "none", fontWeight: 700 }}>
                        {VENUE_LABEL[o.sellVenue]} ↗
                      </a>
                    </td>
                    <td style={{ ...td(), fontVariantNumeric: "tabular-nums" }}>{fmtUsd(o.buyPrice)}</td>
                    <td style={{ ...td(), fontVariantNumeric: "tabular-nums" }}>{fmtUsd(o.sellPrice)}</td>
                    <td style={{ ...td(), color: "#cbd5e1", fontVariantNumeric: "tabular-nums" }}>{o.spreadBps.toFixed(1)} bps</td>
                    <td style={{ ...td(), color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>−{o.feeBps.toFixed(1)} bps</td>
                    <td style={{ ...td(), color: "#22c55e", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{o.netBps.toFixed(1)} bps</td>
                    <td style={{ ...td(), color: "#22d3ee", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtUsd(o.profitUsdPer100, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ fontSize: ".62rem", color: "#64748b", textAlign: "center" }}>
        Data: OKX / Coinbase / Binance / Hyperliquid public REST · server-side cached 5s · scanner refresh 10s · empty states never fabricated.
      </div>
    </div>
  );
}

function th(): React.CSSProperties {
  return { padding: "10px 12px", textAlign: "left", fontSize: ".62rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em" };
}

function td(): React.CSSProperties {
  return { padding: "10px 12px", color: "#e2e8f0" };
}
