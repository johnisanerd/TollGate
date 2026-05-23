import { useEffect, useState } from "react";
import { ExternalLink, Zap, AlertTriangle, Search } from "lucide-react";
import type { Workspace } from "../../../types";
import { getLeaderboard, getClearinghouseState, type LeaderboardEntry, type HlClearinghouseState } from "../../../lib/hyperliquid";

const SERVER = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

interface Props {
  workspace: Workspace;
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function ArcPerpTradingWidget({ workspace: _workspace }: Props) {
  const [leaders, setLeaders] = useState<LeaderboardEntry[] | null>(null);
  const [hlEth, setHlEth] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [addressInput, setAddressInput] = useState("");
  const [positionsState, setPositionsState] = useState<HlClearinghouseState | null>(null);
  const [positionsLoading, setPositionsLoading] = useState(false);

  async function lookupPositions(addr: string) {
    if (!addr) return;
    setPositionsLoading(true);
    try {
      const state = await getClearinghouseState(addr);
      setPositionsState(state);
    } finally {
      setPositionsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const top = await getLeaderboard();
        if (!cancelled) setLeaders(top.slice(0, 20));
      } catch { /* swallow */ }
      try {
        if (SERVER) {
          const res = await fetch(`${SERVER}/api/exchanges/tickers?symbol=ETH/USDC`, { signal: AbortSignal.timeout(8_000) });
          if (res.ok) {
            const data = await res.json() as { tickers?: Array<{ venue: string; mid: number; ok: boolean }> };
            const hl = data.tickers?.find((t) => t.venue === "hyperliquid" && t.ok);
            if (!cancelled && hl) setHlEth(hl.mid);
          }
        }
      } catch { /* leave 0 */ }
      if (!cancelled) setLoading(false);
    }
    void load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{
        background: "linear-gradient(145deg, rgba(245,158,11,0.06), rgba(8,13,25,0.92))",
        border: "1px solid rgba(245,158,11,0.22)",
        borderRadius: 18, padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(245,158,11,0.18)", display: "grid", placeItems: "center" }}>
            <Zap size={18} style={{ color: "#f59e0b" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 800 }}>Perpetual Futures Trading</h2>
            <p style={{ margin: "3px 0 0", color: "#9fb0c8", fontSize: ".75rem" }}>
              ArcMind monitors Hyperliquid perpetual futures for ETH and ranks top traders. Live order execution requires
              <code style={{ marginLeft: 4, marginRight: 4, padding: "1px 5px", background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>HYPERLIQUID_API_PRIVATE_KEY</code>
              on the server (Tier A — Wave 2 of the integrations plan).
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14 }}>
          <Stat label="ETH @ Hyperliquid" value={hlEth > 0 ? fmtUsd(hlEth) : "loading…"} tone="#22d3ee" />
          <Stat label="Top traders tracked" value={leaders ? String(leaders.length) : "…"} tone="#a78bfa" />
          <Stat label="ArcMind execution" value="advisory" tone="#f59e0b" />
        </div>

        <div style={{
          marginTop: 12, padding: "8px 12px",
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.22)",
          borderRadius: 9, fontSize: ".68rem", color: "#fde68a",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <AlertTriangle size={11} />
          <span>Tier A. Order execution arrives in Wave 2 once <code>HYPERLIQUID_API_PRIVATE_KEY</code> is configured. Until then this view is read-only.</span>
        </div>
      </div>

      <div style={{
        background: "rgba(8,13,25,0.94)",
        border: "1px solid rgba(34,211,238,0.20)",
        borderRadius: 14, padding: 14,
      }}>
        <div style={{ fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 10 }}>
          Look up Hyperliquid positions (read-only)
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="0x… Hyperliquid user address"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value.trim())}
            spellCheck={false}
            style={{
              flex: "1 1 320px", minWidth: 240,
              padding: "8px 12px", borderRadius: 9,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0", fontFamily: "monospace", fontSize: ".75rem",
            }}
          />
          <button
            type="button"
            onClick={() => void lookupPositions(addressInput)}
            disabled={!addressInput || positionsLoading}
            style={{
              padding: "8px 14px", borderRadius: 9,
              background: positionsLoading ? "rgba(34,211,238,0.15)" : "rgba(34,211,238,0.22)",
              color: "#22d3ee",
              border: "1px solid rgba(34,211,238,0.32)",
              cursor: positionsLoading || !addressInput ? "default" : "pointer",
              fontWeight: 700, fontSize: ".72rem",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Search size={12} />
            {positionsLoading ? "Fetching…" : "Fetch positions"}
          </button>
        </div>
        {positionsState && !positionsState.ok && (
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 9, background: "rgba(251,113,133,0.08)", border: "1px solid rgba(251,113,133,0.24)", color: "#fda4af", fontSize: ".72rem" }}>
            Hyperliquid returned no data — reason: <code>{positionsState.reason ?? "unknown"}</code>
          </div>
        )}
        {positionsState && positionsState.ok && (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <Stat label="Account value" value={fmtUsd(positionsState.accountValue)} tone="#22c55e" />
              <Stat label="Margin used" value={fmtUsd(positionsState.totalMarginUsed)} tone="#fb7185" />
              <Stat label="Notional pos" value={fmtUsd(positionsState.totalNtlPos)} tone="#a78bfa" />
              <Stat label="Withdrawable" value={fmtUsd(positionsState.withdrawable)} tone="#22d3ee" />
            </div>
            {positionsState.positions.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: ".72rem", padding: "10px 0", textAlign: "center" }}>
                No open positions for this address.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".72rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(34,211,238,0.06)" }}>
                      <th style={th()}>Coin</th>
                      <th style={th()}>Side</th>
                      <th style={th()}>Size</th>
                      <th style={th()}>Entry</th>
                      <th style={th()}>Value</th>
                      <th style={th()}>PnL</th>
                      <th style={th()}>Lev</th>
                      <th style={th()}>Liq px</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionsState.positions.map((p, idx) => (
                      <tr key={p.coin + idx} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={td()}>{p.coin}</td>
                        <td style={{ ...td(), color: p.szi >= 0 ? "#22c55e" : "#fb7185", fontWeight: 700 }}>{p.szi >= 0 ? "LONG" : "SHORT"}</td>
                        <td style={{ ...td(), fontVariantNumeric: "tabular-nums" }}>{Math.abs(p.szi).toFixed(4)}</td>
                        <td style={{ ...td(), fontVariantNumeric: "tabular-nums" }}>{p.entryPx > 0 ? fmtUsd(p.entryPx) : "—"}</td>
                        <td style={{ ...td(), fontVariantNumeric: "tabular-nums" }}>{fmtUsd(p.positionValue)}</td>
                        <td style={{ ...td(), color: p.unrealizedPnl >= 0 ? "#22c55e" : "#fb7185", fontVariantNumeric: "tabular-nums" }}>{fmtUsd(p.unrealizedPnl)}</td>
                        <td style={td()}>{p.leverage > 0 ? `${p.leverage}x ${p.leverageType}` : "—"}</td>
                        <td style={{ ...td(), color: "#fb7185", fontVariantNumeric: "tabular-nums" }}>{p.liquidationPx > 0 ? fmtUsd(p.liquidationPx) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{
        background: "rgba(8,13,25,0.94)",
        border: "1px solid rgba(96,165,250,0.20)",
        borderRadius: 14, padding: 14,
      }}>
        <div style={{ fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 10 }}>
          Top Hyperliquid traders (live)
        </div>
        {loading && (
          <div style={{ color: "#94a3b8", fontSize: ".75rem", padding: "16px 0", textAlign: "center" }}>
            Loading Hyperliquid leaderboard…
          </div>
        )}
        {!loading && leaders && leaders.length === 0 && (
          <div style={{ color: "#94a3b8", fontSize: ".75rem", padding: "16px 0", textAlign: "center" }}>
            Hyperliquid Info API returned no leaderboard rows.
          </div>
        )}
        {leaders && leaders.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".75rem" }}>
              <thead>
                <tr style={{ background: "rgba(96,165,250,0.06)" }}>
                  <th style={th()}>Trader</th>
                  <th style={th()}>Account value</th>
                  <th style={th()}>PnL</th>
                  <th style={th()}>ROI</th>
                  <th style={th()}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((l, idx) => (
                  <tr key={l.address + idx} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={td()}>
                      <a href={`https://app.hyperliquid.xyz/explorer/address/${l.address}`} target="_blank" rel="noreferrer"
                        style={{ color: "#60a5fa", textDecoration: "none", fontFamily: "monospace", fontSize: ".68rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {l.displayName ?? `${l.address.slice(0, 6)}…${l.address.slice(-4)}`}
                        <ExternalLink size={10} />
                      </a>
                    </td>
                    <td style={{ ...td(), fontVariantNumeric: "tabular-nums" }}>{fmtUsd(l.accountValue)}</td>
                    <td style={{ ...td(), color: l.pnl >= 0 ? "#22c55e" : "#fb7185", fontVariantNumeric: "tabular-nums" }}>{fmtUsd(l.pnl)}</td>
                    <td style={{ ...td(), color: l.roi >= 0 ? "#22c55e" : "#fb7185", fontVariantNumeric: "tabular-nums" }}>{l.roi.toFixed(2)}%</td>
                    <td style={{ ...td(), fontVariantNumeric: "tabular-nums" }}>{fmtUsd(l.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ fontSize: ".62rem", color: "#64748b", textAlign: "center" }}>
        Data: Hyperliquid Info API leaderboard + server ETH mid · refreshed every 60s · empty states never fabricated.
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: ".58rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 800, color: tone, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function th(): React.CSSProperties {
  return { padding: "10px 12px", textAlign: "left", fontSize: ".62rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em" };
}
function td(): React.CSSProperties {
  return { padding: "10px 12px", color: "#e2e8f0" };
}
