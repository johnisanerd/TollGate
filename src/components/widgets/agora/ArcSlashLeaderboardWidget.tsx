import { useEffect, useState } from "react";
import { Shield, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import type { Workspace } from "../../../types";
import { fetchAgentSnapshots, isAgentRegistryConfigured, type AgentSnapshot } from "../../../lib/agentRegistry";

interface Props {
  workspace: Workspace;
}

const ARC_EXPLORER = "https://testnet.arcscan.app";

function short(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function safeMetadata(metadata: string): { name?: string; description?: string } {
  try {
    if (!metadata) return {};
    const j = JSON.parse(metadata) as { name?: string; description?: string };
    return { name: j.name, description: j.description };
  } catch {
    return {};
  }
}

export function ArcSlashLeaderboardWidget({ workspace: _workspace }: Props) {
  const [agents, setAgents] = useState<AgentSnapshot[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const snapshots = await fetchAgentSnapshots();
      snapshots.sort((a, b) => b.reputation - a.reputation);
      setAgents(snapshots);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const configured = isAgentRegistryConfigured();
  const slashed = agents?.filter((a) => a.slashed) ?? [];
  const healthy = agents?.filter((a) => !a.slashed) ?? [];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{
        background: "linear-gradient(145deg, rgba(167,139,250,0.06), rgba(8,13,25,0.92))",
        border: "1px solid rgba(167,139,250,0.22)",
        borderRadius: 18, padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(167,139,250,0.18)", display: "grid", placeItems: "center" }}>
            <Shield size={18} style={{ color: "#a78bfa" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 800 }}>Slash-Bonded Leaderboard</h2>
            <p style={{ margin: "3px 0 0", color: "#9fb0c8", fontSize: ".75rem" }}>
              Live ERC-8004 reputation from <code>AgentRegistry</code>. Agents that fall below the strategy-degradation threshold are
              paused by the runtime and may be slashed on-chain by the governor — surfaced here for accountability.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{
              padding: "7px 11px", borderRadius: 9,
              background: "rgba(167,139,250,0.18)", color: "#c4b5fd",
              border: "1px solid rgba(167,139,250,0.32)",
              cursor: loading ? "default" : "pointer", fontWeight: 700, fontSize: ".7rem",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            <RefreshCw size={11} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {!configured && (
        <div style={{
          padding: "10px 14px", borderRadius: 12,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.24)",
          color: "#fde68a", fontSize: ".75rem",
        }}>
          <AlertTriangle size={12} style={{ verticalAlign: "middle", marginRight: 6 }} />
          <code>VITE_ARC_AGENT_REGISTRY</code> not set. Configure the deployed AgentRegistry address to see live agents.
        </div>
      )}

      {configured && (
        <>
          <Section
            tone="#22c55e"
            label={`Healthy agents (${healthy.length})`}
            empty="No healthy agents indexed in the recent block range."
            loading={loading && !agents}
          >
            {healthy.map((a) => <AgentRow key={a.agentId} a={a} />)}
          </Section>

          <Section
            tone="#fb7185"
            label={`Slashed agents (${slashed.length})`}
            empty="No slashed agents — registry is clean."
            loading={loading && !agents}
          >
            {slashed.map((a) => <AgentRow key={a.agentId} a={a} />)}
          </Section>
        </>
      )}

      <div style={{ fontSize: ".62rem", color: "#64748b", textAlign: "center" }}>
        Indexed live from <code>AgentRegistered</code> + <code>AgentSlashed</code> logs · empty states never fabricated.
      </div>
    </div>
  );
}

function Section({ tone, label, empty, loading, children }: {
  tone: string; label: string; empty: string; loading: boolean; children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div style={{
      background: "rgba(8,13,25,0.94)",
      border: `1px solid ${tone}33`,
      borderRadius: 14, padding: 14,
    }}>
      <div style={{
        fontSize: ".62rem", color: tone, textTransform: "uppercase",
        letterSpacing: ".07em", fontWeight: 700, marginBottom: 10,
      }}>
        {label}
      </div>
      {loading && (
        <div style={{ color: "#94a3b8", fontSize: ".75rem", padding: "16px 0", textAlign: "center" }}>
          Indexing on-chain events…
        </div>
      )}
      {!loading && !hasChildren && (
        <div style={{ color: "#94a3b8", fontSize: ".75rem", padding: "16px 0", textAlign: "center" }}>
          {empty}
        </div>
      )}
      {!loading && hasChildren && (
        <div style={{ display: "grid", gap: 8 }}>{children}</div>
      )}
    </div>
  );
}

function AgentRow({ a }: { a: AgentSnapshot }) {
  const meta = safeMetadata(a.metadata);
  const tone = a.slashed ? "#fb7185" : "#22c55e";
  return (
    <div style={{
      padding: 12, borderRadius: 11,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${tone}22`,
      display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center",
    }}>
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: ".82rem" }}>
            {meta.name ?? short(a.agentId)}
          </span>
          {a.slashed && (
            <span style={{
              padding: "2px 6px", borderRadius: 5, fontSize: ".6rem", fontWeight: 700,
              background: "rgba(251,113,133,0.18)", color: "#fb7185",
              border: "1px solid rgba(251,113,133,0.32)",
            }}>
              SLASHED
            </span>
          )}
          <span style={{ fontSize: ".62rem", color: "#64748b" }}>
            owner <a
              href={`${ARC_EXPLORER}/address/${a.owner}`}
              target="_blank" rel="noreferrer"
              style={{ color: "#60a5fa", textDecoration: "none", fontFamily: "monospace" }}
            >
              {short(a.owner)} <ExternalLink size={9} style={{ display: "inline" }} />
            </a>
          </span>
        </div>
        {meta.description && (
          <div style={{ color: "#9fb0c8", fontSize: ".7rem" }}>{meta.description}</div>
        )}
        {a.slashed && a.slashReason && (
          <div style={{ color: "#fda4af", fontSize: ".68rem" }}>Reason: {a.slashReason}</div>
        )}
      </div>
      <div style={{ display: "grid", gridAutoFlow: "column", gap: 14, fontVariantNumeric: "tabular-nums" }}>
        <Mini label="Rep" value={String(a.reputation)} tone={tone} />
        <Mini label="Decisions" value={String(a.decisions)} tone="#a78bfa" />
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: ".58rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontSize: ".95rem", fontWeight: 800, color: tone }}>{value}</div>
    </div>
  );
}
