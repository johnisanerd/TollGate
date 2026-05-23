import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Layers } from "lucide-react";
import {
  arcExplorerTxUrl,
  fetchEscrowJobLifecycle,
  type JobLifecycleEntry,
  type JobState,
} from "../../../lib/agora";

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

function stateColor(state: JobState): string {
  if (state === "Open") return "#94a3b8";
  if (state === "Funded") return "#60a5fa";
  if (state === "Submitted") return "#f59e0b";
  return "#22c55e";
}

function fmtUsdcRaw(rawUsdc: string): string {
  try {
    const big = BigInt(rawUsdc);
    const whole = big / 1_000_000n;
    const frac = big % 1_000_000n;
    return `${whole}.${frac.toString().padStart(6, "0").slice(0, 2)} USDC`;
  } catch {
    return rawUsdc + " (raw)";
  }
}

function fmtTime(ms: number | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export function JobLifecycleViewer() {
  const wallet = useWalletAddress();
  const [jobs, setJobs] = useState<JobLifecycleEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEscrowJobLifecycle(wallet);
      setJobs(data);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Failed to read on-chain events");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (wallet) void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  if (!wallet) {
    return (
      <div style={{
        padding: 14, borderRadius: 12,
        border: "1px solid rgba(245,158,11,0.22)",
        background: "rgba(245,158,11,0.06)",
        color: "#fde68a", fontSize: ".75rem",
      }}>
        Connect a wallet to view your ERC-8183 Job lifecycle on Arc L1.
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(8,13,25,0.55)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(96,165,250,0.16)", display: "grid", placeItems: "center" }}>
          <Layers size={14} style={{ color: "#60a5fa" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 800, color: "#fff" }}>ERC-8183 Job lifecycle</div>
          <div style={{ fontSize: ".66rem", color: "#9fb0c8" }}>
            Open → Funded → Submitted → Terminal · standard Agentic Commerce events from CopyTradeEscrow on Arc L1
          </div>
        </div>
        <button onClick={load} disabled={loading}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 7,
            border: "1px solid rgba(96,165,250,0.30)",
            background: "rgba(22,82,240,0.08)",
            color: "#60a5fa", fontSize: ".68rem", fontWeight: 700, cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}>
          <RefreshCw size={11} /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "8px 12px", marginBottom: 10, borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", color: "#fb7185", fontSize: ".7rem" }}>
          {error}
        </div>
      )}

      {jobs === null && !loading && (
        <div style={{ padding: 12, color: "#94a3b8", fontSize: ".72rem", textAlign: "center" }}>
          Click Refresh to load your on-chain Jobs.
        </div>
      )}

      {jobs && jobs.length === 0 && !loading && (
        <div style={{ padding: 12, color: "#94a3b8", fontSize: ".72rem", textAlign: "center" }}>
          No ERC-8183 Jobs found for this wallet on Arc Testnet. Open a copy position on Copy & Position tab to create one.
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {jobs.map((j) => (
            <div key={j.jobId} style={{ padding: 12, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, background: "rgba(255,255,255,0.025)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{
                  fontSize: ".62rem", fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                  color: stateColor(j.state),
                  background: `${stateColor(j.state)}18`,
                  border: `1px solid ${stateColor(j.state)}38`,
                  textTransform: "uppercase", letterSpacing: ".06em",
                }}>{j.state}</span>
                <span style={{ fontSize: ".68rem", color: "#cbd5e1", fontFamily: "monospace" }}>
                  {j.jobId.slice(0, 10)}…{j.jobId.slice(-6)}
                </span>
                {j.reason && (
                  <span style={{ marginLeft: "auto", fontSize: ".62rem", color: "#fde68a", background: "rgba(245,158,11,0.10)", padding: "2px 7px", borderRadius: 5 }}>
                    {j.reason}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, fontSize: ".7rem", color: "#cbd5e1", marginBottom: 8 }}>
                <Field label="Budget" value={fmtUsdcRaw(j.budget)} tone="#60a5fa" />
                <Field label="Client" value={`${j.client.slice(0, 6)}…${j.client.slice(-4)}`} tone="#cbd5e1" mono />
                <Field label="Provider" value={`${j.provider.slice(0, 6)}…${j.provider.slice(-4)}`} tone="#a78bfa" mono />
                <Field label="Evaluator" value={`${j.evaluator.slice(0, 6)}…${j.evaluator.slice(-4)}`} tone="#a78bfa" mono />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6, fontSize: ".66rem" }}>
                <Timeline label="Created" ts={j.createdAt} tx={j.txHashes.created} />
                <Timeline label="Funded" ts={j.fundedAt} tx={j.txHashes.funded} />
                <Timeline label="Submitted" ts={j.submittedAt} tx={j.txHashes.submitted} />
                <Timeline label="Completed" ts={j.completedAt} tx={j.txHashes.completed} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, tone, mono }: { label: string; value: string; tone: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: ".55rem", color: "#9fb0c8", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: ".75rem", fontWeight: 700, color: tone, fontFamily: mono ? "monospace" : "inherit", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Timeline({ label, ts, tx }: { label: string; ts: number | undefined; tx?: string }) {
  const filled = !!ts;
  return (
    <div style={{ padding: "6px 9px", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, background: filled ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: filled ? "#22c55e" : "#475569" }} />
        <span style={{ fontSize: ".58rem", color: "#9fb0c8", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: ".66rem", color: filled ? "#cbd5e1" : "#475569", marginTop: 3 }}>{fmtTime(ts)}</div>
      {tx && (
        <a href={arcExplorerTxUrl(tx)} target="_blank" rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 4, fontSize: ".58rem", color: "#60a5fa", textDecoration: "none", fontFamily: "monospace" }}>
          <ExternalLink size={9} />
          {tx.slice(0, 8)}…
        </a>
      )}
    </div>
  );
}
