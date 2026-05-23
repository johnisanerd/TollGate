import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Brain, TrendingUp, Search } from "lucide-react";
import type { Workspace } from "../../../types";
import { getTopMarkets, polymarketUrl, type PolymarketMarket } from "../../../lib/polymarket";

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtProbability(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

interface Props {
  workspace: Workspace;
}

export function ArcPredictionsWidget({ workspace: _workspace }: Props) {
  const [markets, setMarkets] = useState<PolymarketMarket[] | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getTopMarkets(24);
        if (cancelled) return;
        setMarkets(data);
        setError(data.length === 0 ? "Polymarket Gamma API returned no markets." : null);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message ?? "Polymarket fetch failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 90_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const filtered = useMemo(() => {
    if (!markets) return [];
    const q = query.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((m) => m.question.toLowerCase().includes(q));
  }, [markets, query]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{
        background: "linear-gradient(145deg, rgba(167,139,250,0.06), rgba(8,13,25,0.92))",
        border: "1px solid rgba(167,139,250,0.22)",
        borderRadius: 18, padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(167,139,250,0.18)", display: "grid", placeItems: "center" }}>
            <Brain size={18} style={{ color: "#a78bfa" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 800 }}>Polymarket Prediction Intelligence</h2>
            <p style={{ margin: "3px 0 0", color: "#9fb0c8", fontSize: ".75rem" }}>
              Live markets from Polymarket Gamma API ordered by 24h volume.
              ArcMind synthesises sources (news, on-chain whales, Hyperliquid OI) to estimate fair probability and route paid trades. Settlement on Polygon USDC; bridged to Arc via CCTP intent.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "8px 12px", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
          <Search size={13} style={{ color: "#94a3b8" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by question…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontSize: ".8rem" }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.22)", color: "#fde68a", fontSize: ".72rem",
        }}>{error}</div>
      )}

      {loading && !markets && (
        <div style={{ color: "#94a3b8", fontSize: ".75rem", padding: "20px 0", textAlign: "center" }}>
          Loading live Polymarket data…
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        {filtered.map((m) => (
          <a key={m.id} href={polymarketUrl(m.slug)} target="_blank" rel="noreferrer"
            style={{
              display: "block", padding: 14, borderRadius: 12,
              background: "rgba(8,13,25,0.94)",
              border: "1px solid rgba(96,165,250,0.18)",
              color: "inherit", textDecoration: "none",
            }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{m.question}</div>
                {m.endDate && (
                  <div style={{ fontSize: ".62rem", color: "#94a3b8", marginTop: 4 }}>
                    Resolves: {new Date(m.endDate).toLocaleDateString()}
                  </div>
                )}
              </div>
              <ExternalLink size={12} style={{ color: "#94a3b8", flexShrink: 0, marginTop: 3 }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(m.outcomes.length, 4)}, 1fr)`, gap: 6, marginBottom: 10 }}>
              {m.outcomes.slice(0, 4).map((o) => {
                const tone = o.label.toLowerCase() === "yes" ? "#22c55e"
                  : o.label.toLowerCase() === "no" ? "#fb7185"
                  : "#60a5fa";
                return (
                  <div key={o.label} style={{ padding: "8px 10px", borderRadius: 8, background: `${tone}12`, border: `1px solid ${tone}30` }}>
                    <div style={{ fontSize: ".62rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{o.label}</div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 800, color: tone, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{fmtProbability(o.probability)}</div>
                    <div style={{ fontSize: ".58rem", color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{(o.priceUsdc).toFixed(3)} USDC</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".62rem", color: "#94a3b8", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span><TrendingUp size={9} style={{ display: "inline" }} /> 24h: {fmtUsd(m.volume24h)}</span>
              <span>Liquidity: {fmtUsd(m.liquidity)}</span>
              <span>Total: {fmtUsd(m.volumeAllTime)}</span>
            </div>
          </a>
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div style={{ color: "#94a3b8", fontSize: ".75rem", padding: "20px 0", textAlign: "center" }}>
          No markets match this filter.
        </div>
      )}

      <div style={{ fontSize: ".62rem", color: "#64748b", textAlign: "center" }}>
        Data: Polymarket Gamma API · cached 60s · refresh every 90s · no Polymarket data is fabricated.
      </div>
    </div>
  );
}
