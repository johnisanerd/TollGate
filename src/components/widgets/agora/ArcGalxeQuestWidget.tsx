import { useState } from "react";
import { Gift, ExternalLink, CheckCircle2, Circle } from "lucide-react";

const GALXE_CAMPAIGN_ID = (import.meta.env as Record<string, string | undefined>)["VITE_GALXE_CAMPAIGN_ID"];
const GALXE_BASE = "https://app.galxe.com/quest";

const QUEST_STEPS = [
  { id: "connect", label: "Connect wallet to ArcMind", detail: "Connect your EVM wallet on the Overview tab." },
  { id: "register", label: "Register as an ArcMind agent", detail: "Hit 'Register Agent' in the Signal Feed tab — writes your address to AgentRegistry on Arc Testnet." },
  { id: "stake", label: "Stake ≥ $1 USDC", detail: "Copy & Position tab → enter ≥ 1 USDC → 'Start Copying'. On-chain escrow on Arc Testnet." },
  { id: "receipt", label: "Collect a decision receipt", detail: "After the agent runs (30-min loop) your receipt appears in the Receipts tab with a tx hash." },
  { id: "claim", label: "Claim the ArcMind Pioneer badge", detail: "Go to the Galxe campaign, verify on-chain proof, mint your soulbound NFT badge." },
];

export function ArcGalxeQuestWidget() {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allDone = checked.size >= QUEST_STEPS.length;
  const campaignUrl = GALXE_CAMPAIGN_ID
    ? `${GALXE_BASE}/arcmind-${GALXE_CAMPAIGN_ID}`
    : GALXE_BASE;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(168,85,247,0.08), rgba(168,85,247,0.04))",
        border: "1px solid rgba(168,85,247,0.22)",
        borderRadius: 12,
      }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(168,85,247,0.18)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Gift size={16} style={{ color: "#a855f7" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: ".88rem", fontWeight: 800, color: "#fff", marginBottom: 4 }}>
            ArcMind Pioneer Quest
          </div>
          <div style={{ fontSize: ".72rem", color: "#9fb0c8", lineHeight: 1.5 }}>
            Complete all 5 steps on Arc Testnet, then claim your soulbound <b style={{ color: "#fff" }}>ArcMind Pioneer</b> NFT badge on Galxe.
            Badge proves on-chain participation in the first ArcMind social-copy season.
          </div>
        </div>
        {!GALXE_CAMPAIGN_ID && (
          <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#a855f7", background: "rgba(168,85,247,0.12)", padding: "3px 7px", borderRadius: 5, flexShrink: 0 }}>
            campaign pending
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {QUEST_STEPS.map((step, i) => {
          const done = checked.has(step.id);
          return (
            <div
              key={step.id}
              onClick={() => toggle(step.id)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                border: done ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(255,255,255,0.07)",
                background: done ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)",
                cursor: "pointer",
                transition: "all .15s",
              }}
            >
              <div style={{ paddingTop: 1 }}>
                {done
                  ? <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
                  : <Circle size={16} style={{ color: "#6b7280" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: ".8rem", fontWeight: 600, color: done ? "#86efac" : "#fff", marginBottom: 2 }}>
                  <span style={{ color: done ? "#22c55e" : "#6b7280", marginRight: 6 }}>{i + 1}.</span>
                  {step.label}
                </div>
                <div style={{ fontSize: ".68rem", color: "#9fb0c8", lineHeight: 1.4 }}>{step.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      <a
        href={campaignUrl}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "11px 18px",
          borderRadius: 10,
          background: allDone
            ? "linear-gradient(135deg, #a855f7, #7c3aed)"
            : "rgba(168,85,247,0.10)",
          border: `1px solid ${allDone ? "rgba(168,85,247,0.5)" : "rgba(168,85,247,0.25)"}`,
          color: allDone ? "#fff" : "#a855f7",
          fontSize: ".82rem",
          fontWeight: 700,
          textDecoration: "none",
          transition: "all .15s",
        }}
      >
        <Gift size={14} />
        {allDone ? "Claim Badge on Galxe ↗" : "Open Galxe Campaign ↗"}
        <ExternalLink size={12} />
      </a>

      <div style={{ fontSize: ".65rem", color: "#6b7280", textAlign: "center" }}>
        Checkboxes are local only — on-chain verification happens on Galxe via wallet proof.
        {!GALXE_CAMPAIGN_ID && " Campaign ID not set — set VITE_GALXE_CAMPAIGN_ID to activate direct link."}
      </div>
    </div>
  );
}
