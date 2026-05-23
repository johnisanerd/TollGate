import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, ArrowUpDown, Star, Zap, Cpu, Pause as PauseIcon } from "lucide-react";
import type { Workspace } from "../../../types";
import {
  getVaultSummaries,
  hyperliquidVaultUrl,
  type VaultSummary,
} from "../../../lib/hyperliquid";
import {
  fetchAllMarkets,
  fmtUsdc,
  isMarketFactoryConfigured,
  type OnChainMarket,
} from "../../../lib/marketFactory";
import { arcExplorerAddrUrl } from "../../../lib/agora";

const SERVER = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

interface ArcDecisionRaw { decision: string; ethPrice: number; ts: string; txHash?: string }
interface AgoraReceipt { id: string; payerWallet?: string; kind?: string; createdAt: string; amount: number }

interface AgentRow {
  id: string;
  name: string;
  chain: "Arc" | "Hyperliquid";
  apr: number;
  aum: number;
  mdd: number;
  followers: number;
  ageDays: number;
  leaderStakeUsd: number;
  feePct: number;
  native: boolean;
  externalUrl?: string;
  leader?: string;
}

type SortKey = "apr" | "aum" | "mdd" | "followers" | "ageDays";
type SortDir = "asc" | "desc";

interface ArcMindRow extends AgentRow {
  chain: "Arc";
  native: true;
}

function useArcMindRow(): ArcMindRow | null {
  const [row, setRow] = useState<ArcMindRow | null>(null);
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [decRes, rcptRes] = await Promise.all([
          fetch(`${SERVER}/api/arc-decisions`, { signal: AbortSignal.timeout(6_000) }),
          fetch(`${SERVER}/api/receipts?workspace=agora`, { signal: AbortSignal.timeout(6_000) }),
        ]);
        let decisions: ArcDecisionRaw[] = [];
        if (decRes.ok) {
          const d = await decRes.json() as { decisions?: ArcDecisionRaw[] };
          decisions = d.decisions ?? [];
        }
        let receipts: AgoraReceipt[] = [];
        if (rcptRes.ok) {
          const r = await rcptRes.json() as { receipts?: AgoraReceipt[] };
          receipts = r.receipts ?? [];
        }
        let aum = 0;
        const followerSet = new Set<string>();
        for (const r of receipts) {
          if (r.kind === "arcmind.copy.start") {
            aum += r.amount;
            if (r.payerWallet) followerSet.add(r.payerWallet);
          }
        }
        let apr = 0;
        let mdd = 0;
        let ageDays = 0;
        if (decisions.length >= 2) {
          const last = decisions[0];
          const first = decisions[decisions.length - 1];
          if (first.ethPrice > 0) {
            apr = ((last.ethPrice - first.ethPrice) / first.ethPrice) * 100;
          }
          const prices = decisions.map((d) => d.ethPrice).filter((p) => p > 0);
          if (prices.length > 1) {
            const peak = Math.max(...prices);
            const trough = Math.min(...prices);
            mdd = peak > 0 ? ((peak - trough) / peak) * 100 : 0;
          }
          ageDays = Math.max(0, Math.floor((Date.now() - new Date(first.ts).getTime()) / 86_400_000));
        }
        if (mounted) {
          setRow({
            id: "arcmind",
            name: "ArcMind",
            chain: "Arc",
            apr,
            aum,
            mdd,
            followers: followerSet.size,
            ageDays,
            leaderStakeUsd: 0,
            feePct: 5,
            native: true,
            leader: "ArcMind autonomous agent",
          });
        }
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);
  return row;
}

function useHyperliquidRows(): VaultSummary[] {
  const [rows, setRows] = useState<VaultSummary[]>([]);
  useEffect(() => {
    let mounted = true;
    async function load() {
      const data = await getVaultSummaries();
      if (mounted) setRows(data);
    }
    load();
    const id = setInterval(load, 120_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);
  return rows;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number, signed = false): string {
  if (!Number.isFinite(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

interface Props {
  workspace: Workspace;
  onSelectAgent?: (agentId: string) => void;
  onMirror?: (vault: VaultSummary) => void;
}

export function ArcDiscoverWidget({ workspace: _workspace, onSelectAgent, onMirror }: Props) {
  const arcmind = useArcMindRow();
  const hlVaults = useHyperliquidRows();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("aum");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [chainFilter, setChainFilter] = useState<"all" | "Arc" | "Hyperliquid">("all");
  const [minAum, setMinAum] = useState(0);

  const rows: AgentRow[] = useMemo(() => {
    const list: AgentRow[] = [];
    if (arcmind) list.push(arcmind);
    for (const v of hlVaults) {
      list.push({
        id: `hl-${v.vaultAddress}`,
        name: v.name,
        chain: "Hyperliquid",
        apr: v.apr,
        aum: v.aum,
        mdd: v.mdd,
        followers: v.followers,
        ageDays: v.ageDays,
        leaderStakeUsd: 0,
        feePct: 10,
        native: false,
        externalUrl: hyperliquidVaultUrl(v.vaultAddress),
        leader: v.leader,
      });
    }
    return list;
  }, [arcmind, hlVaults]);

  const filtered = useMemo(() => {
    let out = rows;
    if (chainFilter !== "all") out = out.filter((r) => r.chain === chainFilter);
    if (minAum > 0) out = out.filter((r) => r.aum >= minAum);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q) || (r.leader?.toLowerCase().includes(q) ?? false));
    }
    out = [...out].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = av === bv ? 0 : av < bv ? -1 : 1;
      return sortDir === "desc" ? -cmp : cmp;
    });
    return out.sort((a, b) => (a.native ? -1 : 0) - (b.native ? -1 : 0));
  }, [rows, chainFilter, minAum, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <NativeMarketsSection />
      <div style={{
        background: "linear-gradient(145deg, rgba(8,13,25,0.94), rgba(10,18,32,0.82))",
        border: "1px solid rgba(96,165,250,0.20)",
        borderRadius: 18,
        padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(96,165,250,0.18)", display: "grid", placeItems: "center" }}>
            <Star size={18} style={{ color: "#60a5fa" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 800 }}>Discover Agents</h2>
            <p style={{ margin: "3px 0 0", color: "#9fb0c8", fontSize: ".75rem" }}>
              ArcMind + Hyperliquid vaults — pick an agent to copy. Native Arc agents settle in USDC via CopyTradeEscrow; Hyperliquid vaults are read-only here (click to open hyperliquid.xyz).
            </p>
          </div>
          <span style={{ fontSize: ".62rem", color: "#94a3b8" }}>{filtered.length} agents</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9, background: "rgba(255,255,255,0.04)", flex: 1, minWidth: 200 }}>
            <Search size={13} style={{ color: "#94a3b8" }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or leader…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontSize: ".75rem" }}
            />
          </div>
          <select
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value as typeof chainFilter)}
            style={{ padding: "7px 10px", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9, background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: ".7rem", cursor: "pointer" }}
          >
            <option value="all">All chains</option>
            <option value="Arc">Arc only</option>
            <option value="Hyperliquid">Hyperliquid only</option>
          </select>
          <select
            value={minAum}
            onChange={(e) => setMinAum(Number(e.target.value))}
            style={{ padding: "7px 10px", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9, background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: ".7rem", cursor: "pointer" }}
          >
            <option value={0}>Any AUM</option>
            <option value={1_000}>≥ $1K</option>
            <option value={10_000}>≥ $10K</option>
            <option value={100_000}>≥ $100K</option>
            <option value={1_000_000}>≥ $1M</option>
          </select>
        </div>

        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".75rem" }}>
            <thead>
              <tr style={{ background: "rgba(96,165,250,0.06)" }}>
                <th style={thStyle()}>Agent</th>
                <th style={thStyle()}>Chain</th>
                <ThSort label="APR" k="apr" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <ThSort label="AUM" k="aum" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <ThSort label="MDD" k="mdd" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <ThSort label="Followers" k="followers" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <ThSort label="Age" k="ageDays" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th style={thStyle()}>Fee</th>
                <th style={thStyle()}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: "16px 12px", textAlign: "center", color: "#94a3b8" }}>No agents match these filters.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={tdStyle()}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {r.native ? <Star size={12} style={{ color: "#facc15", flexShrink: 0 }} /> : <span style={{ width: 12, display: "inline-block" }} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#fff" }}>{r.name}</div>
                        {r.leader && <div style={{ fontSize: ".62rem", color: "#94a3b8", fontFamily: r.native ? "inherit" : "monospace" }}>{r.native ? r.leader : `${r.leader.slice(0, 6)}…${r.leader.slice(-4)}`}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={tdStyle()}>
                    <span style={{
                      fontSize: ".62rem", fontWeight: 700, padding: "3px 7px", borderRadius: 5,
                      color: r.chain === "Arc" ? "#22c55e" : "#a78bfa",
                      background: r.chain === "Arc" ? "rgba(34,197,94,0.12)" : "rgba(167,139,250,0.12)",
                    }}>
                      {r.chain}
                    </span>
                  </td>
                  <td style={{ ...tdStyle(), color: r.apr >= 0 ? "#22c55e" : "#ef4444", fontVariantNumeric: "tabular-nums" }}>{fmtPct(r.apr, true)}</td>
                  <td style={{ ...tdStyle(), fontVariantNumeric: "tabular-nums" }}>{fmtUsd(r.aum)}</td>
                  <td style={{ ...tdStyle(), color: "#fb7185", fontVariantNumeric: "tabular-nums" }}>{fmtPct(r.mdd)}</td>
                  <td style={{ ...tdStyle(), fontVariantNumeric: "tabular-nums" }}>{r.followers}</td>
                  <td style={{ ...tdStyle(), fontVariantNumeric: "tabular-nums" }}>{r.ageDays > 0 ? `${r.ageDays}d` : "—"}</td>
                  <td style={{ ...tdStyle(), fontVariantNumeric: "tabular-nums" }}>{r.feePct}%</td>
                  <td style={tdStyle()}>
                    {r.native ? (
                      <button onClick={() => onSelectAgent?.(r.id)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "5px 9px", borderRadius: 7,
                          border: "1px solid rgba(34,197,94,0.35)",
                          background: "rgba(34,197,94,0.10)",
                          color: "#22c55e", fontSize: ".68rem", fontWeight: 700, cursor: "pointer",
                        }}>
                        <Zap size={11} /> View · copy
                      </button>
                    ) : (
                      <div style={{ display: "flex", gap: 4 }}>
                        <a href={r.externalUrl} target="_blank" rel="noreferrer"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "5px 9px", borderRadius: 7,
                            border: "1px solid rgba(167,139,250,0.35)",
                            background: "rgba(167,139,250,0.10)",
                            color: "#a78bfa", fontSize: ".68rem", fontWeight: 700, textDecoration: "none",
                          }}>
                          <ExternalLink size={11} /> Open
                        </a>
                        {onMirror && (
                          <button onClick={() => {
                            const v = hlVaults.find((x) => `hl-${x.vaultAddress}` === r.id);
                            if (v) onMirror(v);
                          }}
                            title="Cross-chain mirror via CCTP (experimental)"
                            style={{
                              padding: "5px 9px", borderRadius: 7,
                              border: "1px solid rgba(245,158,11,0.30)",
                              background: "rgba(245,158,11,0.08)",
                              color: "#f59e0b", fontSize: ".68rem", fontWeight: 700, cursor: "pointer",
                            }}>
                            Mirror
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: ".62rem", color: "#64748b" }}>
          Data: Hyperliquid Info API · refreshed every 60s · cache 60s · Mirror is experimental and uses Circle CCTP (5-15 min latency, 1-3% price drift possible)
        </div>
      </div>
    </div>
  );
}

function thStyle(): React.CSSProperties {
  return { padding: "10px 12px", textAlign: "left", fontSize: ".62rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em" };
}

function tdStyle(): React.CSSProperties {
  return { padding: "10px 12px", color: "#e2e8f0" };
}

function ThSort({ label, k, sortKey, sortDir, onClick }: { label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onClick: (k: SortKey) => void }) {
  const active = sortKey === k;
  return (
    <th style={thStyle()}>
      <button onClick={() => onClick(k)}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: active ? "#60a5fa" : "#94a3b8", fontSize: ".62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
        {label} <ArrowUpDown size={9} style={{ opacity: active ? 1 : 0.5 }} />
        {active && <span style={{ fontSize: 8 }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
}

// ─── On-chain native markets (from MarketFactory) ─────────────────────────────

function NativeMarketsSection() {
  const [markets, setMarkets] = useState<OnChainMarket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isMarketFactoryConfigured();

  useEffect(() => {
    let mounted = true;
    if (!configured) { setLoading(false); return; }
    fetchAllMarkets().then((data) => {
      if (mounted) { setMarkets(data); setLoading(false); }
    });
    return () => { mounted = false; };
  }, [configured]);

  if (!configured) return null;

  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(34,197,94,0.06), rgba(8,13,25,0.92))",
      border: "1px solid rgba(34,197,94,0.22)",
      borderRadius: 18,
      padding: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(34,197,94,0.18)", display: "grid", placeItems: "center" }}>
          <Cpu size={18} style={{ color: "#22c55e" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: "#fff", fontSize: ".95rem", fontWeight: 800 }}>Native Arc Markets — on-chain</h2>
          <p style={{ margin: "3px 0 0", color: "#9fb0c8", fontSize: ".72rem" }}>
            CopyTradeMarket instances deployed by MarketFactory. Each market lives in its own contract with its own pause switch, fee schedule, and per-trader stake bounds.
          </p>
        </div>
        <span style={{ fontSize: ".62rem", color: "#94a3b8" }}>{loading ? "loading…" : `${markets?.length ?? 0} markets`}</span>
      </div>

      {!loading && markets && markets.length === 0 && (
        <div style={{ padding: "10px 14px", color: "#94a3b8", fontSize: ".72rem", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9 }}>
          MarketFactory is configured but contains no markets yet. Deploy the first one with{" "}
          <code style={{ color: "#cbd5e1" }}>npm run deploy:arc-market-factory</code>.
        </div>
      )}

      {!loading && markets && markets.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".75rem" }}>
            <thead>
              <tr style={{ background: "rgba(34,197,94,0.06)" }}>
                <th style={thStyle()}>Symbol</th>
                <th style={thStyle()}>Market</th>
                <th style={thStyle()}>Operator</th>
                <th style={thStyle()}>TVL</th>
                <th style={thStyle()}>Fees paid</th>
                <th style={thStyle()}>Settlements</th>
                <th style={thStyle()}>Fee / Kill</th>
                <th style={thStyle()}>Status</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.address} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={tdStyle()}>
                    <span style={{ fontWeight: 800, color: "#fff" }}>{m.baseSymbol}</span>
                  </td>
                  <td style={tdStyle()}>
                    <a href={arcExplorerAddrUrl(m.address)} target="_blank" rel="noreferrer"
                       style={{ color: "#22c55e", textDecoration: "none", fontFamily: "monospace", fontSize: ".68rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {m.address.slice(0, 8)}…{m.address.slice(-4)} <ExternalLink size={10} />
                    </a>
                  </td>
                  <td style={tdStyle()}>
                    <a href={arcExplorerAddrUrl(m.operator)} target="_blank" rel="noreferrer"
                       style={{ color: "#94a3b8", textDecoration: "none", fontFamily: "monospace", fontSize: ".66rem" }}>
                      {m.operator.slice(0, 6)}…{m.operator.slice(-4)}
                    </a>
                  </td>
                  <td style={{ ...tdStyle(), fontVariantNumeric: "tabular-nums" }}>{fmtUsdc(m.totalStaked)}</td>
                  <td style={{ ...tdStyle(), fontVariantNumeric: "tabular-nums", color: "#f59e0b" }}>{fmtUsdc(m.totalFeesPaid)}</td>
                  <td style={{ ...tdStyle(), fontVariantNumeric: "tabular-nums" }}>{m.settlementCount}</td>
                  <td style={{ ...tdStyle(), fontVariantNumeric: "tabular-nums", fontSize: ".68rem" }}>
                    {(m.performanceFeeBps / 100).toFixed(1)}% / {(m.killThresholdBps / 100).toFixed(0)}%
                  </td>
                  <td style={tdStyle()}>
                    {m.paused ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: ".62rem", fontWeight: 700, color: "#fb7185", background: "rgba(251,113,133,0.10)", padding: "3px 7px", borderRadius: 5 }}>
                        <PauseIcon size={10} /> paused
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: ".62rem", fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.10)", padding: "3px 7px", borderRadius: 5 }}>
                        <Zap size={10} /> live
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: ".62rem", color: "#64748b" }}>
        Data: MarketFactory.getMarketsPaged() · Arc L1 RPC · live on every page load · each row clicks to ArcScan
      </div>
    </div>
  );
}
