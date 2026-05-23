import { useEffect, useState } from "react";
import { Users, DollarSign, Layers, TrendingUp, ExternalLink } from "lucide-react";
import { fetchAllMarkets, fmtUsdc, isMarketFactoryConfigured, type OnChainMarket } from "../../../lib/marketFactory";
import { arcExplorerAddrUrl, fetchEscrowJobLifecycle } from "../../../lib/agora";

interface Stat {
  totalMarkets: number;
  totalTVL: bigint;
  totalFeesPaid: bigint;
  totalSettlements: number;
  liveMarkets: number;
  pausedMarkets: number;
}

function emptyStat(): Stat {
  return {
    totalMarkets: 0,
    totalTVL: 0n,
    totalFeesPaid: 0n,
    totalSettlements: 0,
    liveMarkets: 0,
    pausedMarkets: 0,
  };
}

function aggregate(markets: OnChainMarket[]): Stat {
  const out = emptyStat();
  out.totalMarkets = markets.length;
  for (const m of markets) {
    out.totalTVL += m.totalStaked;
    out.totalFeesPaid += m.totalFeesPaid;
    out.totalSettlements += m.settlementCount;
    if (m.paused) out.pausedMarkets += 1;
    else out.liveMarkets += 1;
  }
  return out;
}

interface UserActivity {
  hasPosition: boolean;
  jobsCount: number;
  loaded: boolean;
}

interface EthLike { request: (a: { method: string }) => Promise<unknown> }

function useWalletAddress(): string | null {
  const [addr, setAddr] = useState<string | null>(null);
  useEffect(() => {
    const eth = (window as unknown as { ethereum?: EthLike }).ethereum;
    if (!eth?.request) return;
    let cancelled = false;
    eth.request({ method: "eth_accounts" }).then((res) => {
      if (cancelled) return;
      const list = Array.isArray(res) ? res : [];
      if (list[0] && typeof list[0] === "string") setAddr(list[0]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return addr;
}

export function ArcTractionWidget() {
  const [markets, setMarkets] = useState<OnChainMarket[] | null>(null);
  const [stat, setStat] = useState<Stat>(emptyStat());
  const [loading, setLoading] = useState(true);
  const wallet = useWalletAddress();
  const [userActivity, setUserActivity] = useState<UserActivity>({ hasPosition: false, jobsCount: 0, loaded: false });
  const configured = isMarketFactoryConfigured();

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let cancelled = false;
    async function load() {
      const data = await fetchAllMarkets();
      if (cancelled) return;
      setMarkets(data);
      setStat(aggregate(data));
      setLoading(false);
    }
    void load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [configured]);

  useEffect(() => {
    if (!wallet || !configured) return;
    let cancelled = false;
    fetchEscrowJobLifecycle(wallet).then((jobs) => {
      if (cancelled) return;
      setUserActivity({
        hasPosition: jobs.some((j) => j.state !== "Terminal"),
        jobsCount: jobs.length,
        loaded: true,
      });
    });
    return () => { cancelled = true; };
  }, [wallet, configured]);

  if (!configured) {
    return (
      <div style={{
        padding: 14, borderRadius: 12,
        border: "1px solid rgba(245,158,11,0.22)",
        background: "rgba(245,158,11,0.06)",
        color: "#fde68a", fontSize: ".75rem",
      }}>
        Set <code>VITE_ARC_MARKET_FACTORY</code> in your env to surface live on-chain traction.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{
        background: "linear-gradient(145deg, rgba(34,197,94,0.06), rgba(8,13,25,0.92))",
        border: "1px solid rgba(34,197,94,0.22)",
        borderRadius: 18, padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(34,197,94,0.18)", display: "grid", placeItems: "center" }}>
            <TrendingUp size={18} style={{ color: "#22c55e" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 800 }}>Arc Traction — on-chain</h2>
            <p style={{ margin: "3px 0 0", color: "#9fb0c8", fontSize: ".75rem" }}>
              Live aggregates from the MarketFactory deployment. Every number is read directly from the contract — no analytics tool, no off-chain database.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 14 }}>
          <StatCard icon={<Layers size={14} />} label="Markets deployed" value={loading ? "…" : String(stat.totalMarkets)} tone="#a78bfa" detail={`${stat.liveMarkets} live · ${stat.pausedMarkets} paused`} />
          <StatCard icon={<DollarSign size={14} />} label="Total TVL" value={loading ? "…" : fmtUsdc(stat.totalTVL)} tone="#22d3ee" detail="USDC across all markets" />
          <StatCard icon={<DollarSign size={14} />} label="Fees paid out" value={loading ? "…" : fmtUsdc(stat.totalFeesPaid)} tone="#f59e0b" detail="cumulative perf fees" />
          <StatCard icon={<Users size={14} />} label="Settlements" value={loading ? "…" : String(stat.totalSettlements)} tone="#22c55e" detail="closed copy positions" />
        </div>
      </div>

      {wallet && userActivity.loaded && (
        <div style={{
          background: "rgba(139,92,246,0.06)",
          border: "1px solid rgba(139,92,246,0.20)",
          borderRadius: 14, padding: 14,
        }}>
          <div style={{ fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 6 }}>
            Your wallet
          </div>
          <div style={{ fontSize: ".82rem", color: "#fff", fontWeight: 700 }}>
            <a href={arcExplorerAddrUrl(wallet)} target="_blank" rel="noreferrer"
              style={{ color: "#a78bfa", textDecoration: "none", fontFamily: "monospace", fontSize: ".75rem" }}>
              {wallet.slice(0, 6)}…{wallet.slice(-4)} ↗
            </a>
            <span style={{ marginLeft: 12, color: "#cbd5e1", fontSize: ".72rem" }}>
              {userActivity.jobsCount > 0
                ? `${userActivity.jobsCount} ERC-8183 job${userActivity.jobsCount === 1 ? "" : "s"} · ${userActivity.hasPosition ? "open position" : "all settled"}`
                : "no on-chain activity yet"}
            </span>
          </div>
        </div>
      )}

      {markets && markets.length > 0 && (
        <div style={{
          background: "rgba(8,13,25,0.94)",
          border: "1px solid rgba(96,165,250,0.20)",
          borderRadius: 14, padding: 14,
        }}>
          <div style={{ fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 10 }}>
            Per-market breakdown
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".75rem" }}>
              <thead>
                <tr style={{ background: "rgba(96,165,250,0.06)" }}>
                  <th style={th()}>Symbol</th>
                  <th style={th()}>Market</th>
                  <th style={th()}>TVL</th>
                  <th style={th()}>Fees paid</th>
                  <th style={th()}>Settlements</th>
                  <th style={th()}>Status</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => (
                  <tr key={m.address} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={td()}><b style={{ color: "#fff" }}>{m.baseSymbol}</b></td>
                    <td style={td()}>
                      <a href={arcExplorerAddrUrl(m.address)} target="_blank" rel="noreferrer"
                        style={{ color: "#60a5fa", textDecoration: "none", fontFamily: "monospace", fontSize: ".68rem" }}>
                        {m.address.slice(0, 8)}…{m.address.slice(-4)} <ExternalLink size={10} />
                      </a>
                    </td>
                    <td style={{ ...td(), fontVariantNumeric: "tabular-nums" }}>{fmtUsdc(m.totalStaked)}</td>
                    <td style={{ ...td(), color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>{fmtUsdc(m.totalFeesPaid)}</td>
                    <td style={{ ...td(), fontVariantNumeric: "tabular-nums" }}>{m.settlementCount}</td>
                    <td style={td()}>
                      <span style={{
                        fontSize: ".62rem", fontWeight: 700, padding: "3px 7px", borderRadius: 5,
                        color: m.paused ? "#fb7185" : "#22c55e",
                        background: m.paused ? "rgba(251,113,133,0.10)" : "rgba(34,197,94,0.10)",
                      }}>{m.paused ? "paused" : "live"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ fontSize: ".62rem", color: "#64748b", textAlign: "center" }}>
        Source: MarketFactory.getMarketsPaged() + CopyTradeMarket views via Arc RPC · refreshed every 30s
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone, detail }: { icon: React.ReactNode; label: string; value: string; tone: string; detail: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, color: "#94a3b8" }}>
        {icon}
        <span style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.25rem", fontWeight: 800, color: tone, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: ".62rem", color: "#94a3b8", marginTop: 4 }}>{detail}</div>
    </div>
  );
}

function th(): React.CSSProperties {
  return { padding: "10px 12px", textAlign: "left", fontSize: ".62rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em" };
}
function td(): React.CSSProperties {
  return { padding: "10px 12px", color: "#e2e8f0" };
}
