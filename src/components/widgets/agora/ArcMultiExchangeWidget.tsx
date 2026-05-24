import { useEffect, useState } from "react";
import { BarChart3, RefreshCw, ExternalLink } from "lucide-react";
import type { Workspace } from "../../../types";
import { getDydxPositions, type DydxPosition } from "../../../lib/exchanges/dydx";
import { getGmxPositions, type GmxPosition } from "../../../lib/exchanges/gmx";

const DYDX_ADDRESS = (import.meta.env as Record<string, string | undefined>)["VITE_DYDX_ADDRESS"] ?? "";
const GMX_ADDRESS = (import.meta.env as Record<string, string | undefined>)["VITE_GMX_AGENT_ADDRESS"] ?? "";

function PnlBadge({ value }: { value: string }) {
  const n = parseFloat(value);
  const color = Number.isNaN(n) ? "#9fb0c8" : n >= 0 ? "#22c55e" : "#ef4444";
  return <span style={{ color, fontWeight: 700, fontFamily: "monospace" }}>{Number.isNaN(n) ? value : (n >= 0 ? "+" : "") + n.toFixed(2)}</span>;
}

function PositionRow({ side, market, size, pnl, price }: { side: "LONG" | "SHORT"; market: string; size: string; pnl: string; price: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontSize: ".65rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: side === "LONG" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", color: side === "LONG" ? "#22c55e" : "#ef4444" }}>{side}</span>
      <span style={{ flex: 1, fontSize: ".75rem", color: "#fff", fontWeight: 600 }}>{market}</span>
      <span style={{ fontSize: ".7rem", color: "#9fb0c8", fontFamily: "monospace" }}>${parseFloat(size).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
      <span style={{ fontSize: ".7rem", color: "#9fb0c8", fontFamily: "monospace" }}>@{parseFloat(price).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
      <PnlBadge value={pnl} />
    </div>
  );
}

interface Props { workspace: Workspace }

export function ArcMultiExchangeWidget({ workspace: _workspace }: Props) {
  const [dydx, setDydx] = useState<DydxPosition[] | null>(null);
  const [gmx, setGmx] = useState<GmxPosition[] | null>(null);
  const [dydxErr, setDydxErr] = useState<string | null>(null);
  const [gmxErr, setGmxErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [dr, gr] = await Promise.all([
      DYDX_ADDRESS ? getDydxPositions(DYDX_ADDRESS) : Promise.resolve(null),
      GMX_ADDRESS ? getGmxPositions(GMX_ADDRESS) : Promise.resolve(null),
    ]);
    if (dr) { setDydx(dr.ok ? dr.positions : []); setDydxErr(dr.ok ? null : (dr.reason ?? "unavailable")); }
    else { setDydxErr("VITE_DYDX_ADDRESS not set"); }
    if (gr) { setGmx(gr.ok ? gr.positions : []); setGmxErr(gr.ok ? null : (gr.reason ?? "unavailable")); }
    else { setGmxErr("VITE_GMX_AGENT_ADDRESS not set"); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={14} style={{ color: "#60a5fa" }} />
          <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#fff" }}>Cross-Platform Positions</span>
        </div>
        <button onClick={() => void load()} disabled={loading} style={{ background: "none", border: "none", cursor: "pointer", color: "#60a5fa", opacity: loading ? 0.5 : 1 }}>
          <RefreshCw size={13} />
        </button>
      </div>

      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#a855f7" }}>dYdX v4</span>
          <a href="https://dydx.trade" target="_blank" rel="noreferrer" style={{ color: "#6b7280" }}><ExternalLink size={10} /></a>
        </div>
        {dydxErr ? (
          <div style={{ fontSize: ".68rem", color: "#6b7280" }}>Unavailable: {dydxErr}</div>
        ) : dydx === null ? (
          <div style={{ fontSize: ".68rem", color: "#6b7280" }}>Loading…</div>
        ) : dydx.length === 0 ? (
          <div style={{ fontSize: ".68rem", color: "#6b7280" }}>No open positions. Set VITE_DYDX_ADDRESS (dydx1… format) to track an agent wallet.</div>
        ) : dydx.map((p, i) => (
          <PositionRow key={i} side={p.side} market={p.market} size={p.size} pnl={p.unrealizedPnl} price={p.entryPrice} />
        ))}
      </div>

      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#3b82f6" }}>GMX v2 (Arbitrum)</span>
          <a href="https://gmx.io" target="_blank" rel="noreferrer" style={{ color: "#6b7280" }}><ExternalLink size={10} /></a>
        </div>
        {gmxErr ? (
          <div style={{ fontSize: ".68rem", color: "#6b7280" }}>Unavailable: {gmxErr}</div>
        ) : gmx === null ? (
          <div style={{ fontSize: ".68rem", color: "#6b7280" }}>Loading…</div>
        ) : gmx.length === 0 ? (
          <div style={{ fontSize: ".68rem", color: "#6b7280" }}>No open positions. Set VITE_GMX_AGENT_ADDRESS (0x… EVM) to track an agent wallet.</div>
        ) : gmx.map((p, i) => (
          <PositionRow key={i} side={p.side} market={p.market} size={p.sizeUsd} pnl={p.pnl} price={p.entryPrice} />
        ))}
      </div>
    </div>
  );
}
