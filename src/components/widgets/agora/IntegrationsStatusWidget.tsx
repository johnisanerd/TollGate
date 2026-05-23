import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";

const SERVER = (import.meta.env as Record<string, string | undefined>)["VITE_SERVER_URL"] ?? "";

interface Probe {
  id: string;
  label: string;
  category: "LLM" | "Data" | "Social" | "Circle" | "Markets";
  endpoint: string;
  readField: (json: unknown) => boolean;
}

const PROBES: Probe[] = [
  { id: "llm", label: "OpenRouter / Anthropic / Hermes", category: "LLM",
    endpoint: "/api/llm/status",
    readField: (j) => !!(j as { configured?: boolean })?.configured },
  { id: "alerts", label: "Discord + Telegram alerts", category: "Social",
    endpoint: "/api/alerts/status",
    readField: (j) => !!(j as { any?: boolean })?.any },
  { id: "circle", label: "Circle Paymaster / Wallets / USYC", category: "Circle",
    endpoint: "/api/circle/status",
    readField: (j) => !!(j as { any?: boolean })?.any },
  { id: "pinata", label: "Pinata IPFS pinning", category: "Data",
    endpoint: "/api/pinata/status",
    readField: (j) => !!(j as { configured?: boolean })?.configured },
  { id: "farcaster", label: "Farcaster cast bot (Neynar)", category: "Social",
    endpoint: "/api/farcaster/status",
    readField: (j) => !!(j as { configured?: boolean })?.configured },
  { id: "apify", label: "Apify news scraper", category: "Data",
    endpoint: "/api/apify/status",
    readField: (j) => !!(j as { configured?: boolean })?.configured },
  { id: "polymarket", label: "Polymarket CLOB execution", category: "Markets",
    endpoint: "/api/polymarket/status",
    readField: (j) => !!(j as { configured?: boolean })?.configured },
];

type ProbeState = "loading" | "configured" | "unconfigured" | "error";

export function IntegrationsStatusWidget() {
  const [states, setStates] = useState<Record<string, ProbeState>>(() =>
    Object.fromEntries(PROBES.map((p) => [p.id, "loading" as ProbeState])),
  );
  const [extras, setExtras] = useState<Record<string, Record<string, unknown>>>({});

  async function refresh() {
    if (!SERVER) {
      setStates(Object.fromEntries(PROBES.map((p) => [p.id, "error"])));
      return;
    }
    setStates(Object.fromEntries(PROBES.map((p) => [p.id, "loading"])));
    await Promise.all(
      PROBES.map(async (p) => {
        try {
          const res = await fetch(`${SERVER}${p.endpoint}`, { signal: AbortSignal.timeout(8_000) });
          if (!res.ok) {
            setStates((prev) => ({ ...prev, [p.id]: "error" }));
            return;
          }
          const json = await res.json() as unknown;
          setExtras((prev) => ({ ...prev, [p.id]: (json ?? {}) as Record<string, unknown> }));
          setStates((prev) => ({ ...prev, [p.id]: p.readField(json) ? "configured" : "unconfigured" }));
        } catch {
          setStates((prev) => ({ ...prev, [p.id]: "error" }));
        }
      }),
    );
  }

  useEffect(() => { void refresh(); }, []);

  const categories: Probe["category"][] = ["LLM", "Data", "Social", "Circle", "Markets"];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{
        background: "linear-gradient(145deg, rgba(34,211,238,0.06), rgba(8,13,25,0.92))",
        border: "1px solid rgba(34,211,238,0.22)",
        borderRadius: 18, padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 800 }}>Live integration status</h2>
            <p style={{ margin: "3px 0 0", color: "#9fb0c8", fontSize: ".75rem" }}>
              Every external service is env-gated. This board hits each <code>/api/*/status</code>
              endpoint and reflects what the server can reach right now — no key, no green check.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            style={{
              padding: "7px 11px", borderRadius: 9,
              background: "rgba(34,211,238,0.18)", color: "#22d3ee",
              border: "1px solid rgba(34,211,238,0.32)",
              cursor: "pointer", fontWeight: 700, fontSize: ".7rem",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </div>

      {categories.map((cat) => {
        const items = PROBES.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} style={{
            background: "rgba(8,13,25,0.94)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14, padding: 14,
          }}>
            <div style={{ fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 10 }}>
              {cat}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {items.map((p) => (
                <StatusRow
                  key={p.id}
                  label={p.label}
                  state={states[p.id] ?? "loading"}
                  endpoint={p.endpoint}
                  extra={extras[p.id]}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ fontSize: ".62rem", color: "#64748b", textAlign: "center" }}>
        Probes never block the rest of the UI. Setting the corresponding env
        on the server flips the row to green on next refresh.
      </div>
    </div>
  );
}

function StatusRow({ label, state, endpoint, extra }: {
  label: string; state: ProbeState; endpoint: string; extra: Record<string, unknown> | undefined;
}) {
  const Icon = state === "loading" ? Loader2 : state === "configured" ? CheckCircle2 : XCircle;
  const color = state === "loading" ? "#94a3b8"
              : state === "configured" ? "#22c55e"
              : state === "unconfigured" ? "#94a3b8"
              : "#fb7185";
  const text = state === "loading" ? "checking…"
             : state === "configured" ? "configured"
             : state === "unconfigured" ? "not configured"
             : "server unreachable";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 10,
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.05)",
    }}>
      <Icon size={14} style={{ color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#e2e8f0", fontSize: ".82rem", fontWeight: 600 }}>{label}</div>
        <div style={{ color: "#64748b", fontSize: ".64rem", fontFamily: "monospace" }}>{endpoint}</div>
      </div>
      <div style={{ color, fontSize: ".7rem", fontWeight: 700 }}>{text}</div>
      {extra && Object.keys(extra).length > 0 && state === "configured" && <ExtraTooltip extra={extra} />}
    </div>
  );
}

function ExtraTooltip({ extra }: { extra: Record<string, unknown> }) {
  const summary = Object.entries(extra)
    .filter(([k]) => !k.startsWith("_") && k !== "any")
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 24) : String(v).slice(0, 24)}`)
    .join(" · ");
  if (!summary) return null;
  return (
    <div title={JSON.stringify(extra, null, 2)} style={{
      fontSize: ".62rem", color: "#64748b", maxWidth: 180,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      {summary}
    </div>
  );
}
