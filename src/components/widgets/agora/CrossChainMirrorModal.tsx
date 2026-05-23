import { useMemo, useState } from "react";
import { X, ExternalLink, AlertTriangle, Info, ArrowRight, Copy, Check } from "lucide-react";
import { useAppState } from "../../../app-state";
import {
  createMirrorIntent,
  estimateMirrorFees,
  preflightMirror,
  vaultPublicUrl,
  type CctpSupportedChain,
} from "../../../lib/cctp";
import type { VaultSummary } from "../../../lib/hyperliquid";

const SOURCE_CHAINS: { id: CctpSupportedChain; label: string }[] = [
  { id: "arbitrum", label: "Arbitrum" },
  { id: "base", label: "Base" },
  { id: "ethereum", label: "Ethereum" },
  { id: "optimism", label: "Optimism" },
  { id: "polygon", label: "Polygon" },
];

interface Props {
  vault: VaultSummary;
  onClose: () => void;
}

export function CrossChainMirrorModal({ vault, onClose }: Props) {
  const { emitReceipt } = useAppState();
  const [sourceChain, setSourceChain] = useState<CctpSupportedChain>("arbitrum");
  const [amount, setAmount] = useState("10");
  const [slippage, setSlippage] = useState("1");
  const [submitted, setSubmitted] = useState<{ intentId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const amt = Math.max(0, parseFloat(amount) || 0);
  const slipBps = Math.max(10, Math.round((parseFloat(slippage) || 1) * 100));

  const fees = useMemo(() => estimateMirrorFees(amt), [amt]);
  const preflight = useMemo(() => preflightMirror({ vault, amountUsd: amt }), [vault, amt]);

  function submit() {
    const intent = createMirrorIntent({
      vault,
      sourceChain,
      amountUsd: amt,
      slippageBps: slipBps,
    });
    emitReceipt({
      workspaceId: "agora",
      serviceName: `Mirror intent — ${vault.name} (${sourceChain})`,
      amount: 0,
      currency: "USDC",
      network: sourceChain,
      kind: "arcmind.mirror.intent",
      payload: { ...intent } as unknown as Record<string, unknown>,
    });
    setSubmitted({ intentId: intent.intentId });
  }

  function copyIntentId() {
    if (!submitted) return;
    void navigator.clipboard?.writeText(submitted.intentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0, 0, 0, 0.65)",
        display: "grid", placeItems: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "min(90vh, 760px)",
          overflowY: "auto",
          background: "linear-gradient(145deg, rgba(15,23,42,0.98), rgba(10,18,32,0.95))",
          border: "1px solid rgba(96,165,250,0.30)",
          borderRadius: 18,
          padding: 22,
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 800 }}>
              Mirror this Hyperliquid trader on Arc
            </h3>
            <p style={{ margin: "4px 0 0", color: "#9fb0c8", fontSize: ".75rem", lineHeight: 1.5 }}>
              Experimental cross-chain copy via Circle CCTP. Burn USDC on a CCTP-supported chain, mint on Arc, mirror leader trades.
            </p>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}
            title="Close">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "10px 14px", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 11, marginBottom: 14 }}>
          <div style={{ fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700 }}>You are mirroring</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: ".88rem", fontWeight: 800, color: "#fff" }}>{vault.name}</div>
              <div style={{ fontSize: ".66rem", color: "#9fb0c8", fontFamily: "monospace" }}>
                {vault.vaultAddress.slice(0, 8)}…{vault.vaultAddress.slice(-6)} · AUM ${vault.aum.toLocaleString()} · APR {vault.apr.toFixed(1)}%
              </div>
            </div>
            <a href={vaultPublicUrl(vault)} target="_blank" rel="noreferrer"
              style={{ color: "#a78bfa", fontSize: ".62rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
              <ExternalLink size={11} /> view
            </a>
          </div>
        </div>

        {!submitted && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 6 }}>
                Source chain (USDC will burn from here)
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SOURCE_CHAINS.map((ch) => (
                  <button key={ch.id} onClick={() => setSourceChain(ch.id)}
                    style={{
                      padding: "7px 13px", borderRadius: 8,
                      border: sourceChain === ch.id ? "1.5px solid #a78bfa" : "1px solid rgba(255,255,255,0.10)",
                      background: sourceChain === ch.id ? "rgba(167,139,250,0.16)" : "rgba(255,255,255,0.04)",
                      color: sourceChain === ch.id ? "#fff" : "#cbd5e1",
                      fontSize: ".75rem", fontWeight: 700, cursor: "pointer",
                    }}>
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 6 }}>
                  Amount (USDC)
                </label>
                <input type="number" min="1" step="0.5" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: "100%", padding: "8px 12px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 8, color: "#fff", fontSize: ".88rem",
                    outline: "none",
                  }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 6 }}>
                  Slippage %
                </label>
                <input type="number" min="0.1" max="5" step="0.1" value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  style={{
                    width: "100%", padding: "8px 12px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 8, color: "#fff", fontSize: ".88rem",
                    outline: "none",
                  }} />
              </div>
            </div>

            <div style={{ padding: "10px 14px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 10, marginBottom: 12 }}>
              <div style={{ fontSize: ".62rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginBottom: 5 }}>Estimated fees</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, fontSize: ".68rem" }}>
                <FeeRow label="CCTP burn fee" value={`$${fees.cctpFeeUsd.toFixed(4)}`} />
                <FeeRow label="Arc gas" value={`$${fees.arcGasUsd.toFixed(2)}`} />
                <FeeRow label="Perf fee (on profit)" value={`${fees.performanceFeeBps / 100}%`} />
              </div>
            </div>

            {(preflight.warnings.length > 0 || preflight.blockers.length > 0) && (
              <div style={{ marginBottom: 14 }}>
                {preflight.blockers.map((b, i) => (
                  <div key={`b-${i}`} style={{ display: "flex", gap: 8, padding: "9px 12px", marginBottom: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 9, color: "#fde68a", fontSize: ".7rem", lineHeight: 1.45 }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{b}</span>
                  </div>
                ))}
                {preflight.warnings.map((w, i) => (
                  <div key={`w-${i}`} style={{ display: "flex", gap: 8, padding: "9px 12px", marginBottom: 6, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 9, color: "#cbd5e1", fontSize: ".7rem", lineHeight: 1.45 }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: 1, color: "#60a5fa" }} />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={submit} disabled={amt < 1}
              style={{
                width: "100%", padding: "12px 16px",
                borderRadius: 11, border: "none",
                background: amt < 1 ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #a78bfa, #60a5fa)",
                color: amt < 1 ? "#64748b" : "#fff",
                fontSize: ".88rem", fontWeight: 800,
                cursor: amt < 1 ? "default" : "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
              Record Mirror Intent <ArrowRight size={13} />
            </button>
            <p style={{ margin: "10px 0 0", fontSize: ".62rem", color: "#64748b", textAlign: "center" }}>
              No funds move yet. Intent is recorded as a receipt with full disclosures and can be replayed when Arc joins CCTP officially.
            </p>
          </>
        )}

        {submitted && (
          <div style={{ padding: "16px 18px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.30)", borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Check size={16} style={{ color: "#22c55e" }} />
              <span style={{ color: "#22c55e", fontSize: ".88rem", fontWeight: 800 }}>Mirror intent recorded</span>
            </div>
            <p style={{ margin: "0 0 10px", color: "#cbd5e1", fontSize: ".72rem", lineHeight: 1.5 }}>
              A receipt was created with full disclosures. When Circle adds Arc L1 to CCTP, this intent can be replayed automatically.
              You can review and revoke it from the Receipts tab.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 7, fontSize: ".68rem", color: "#94a3b8", fontFamily: "monospace" }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{submitted.intentId}</span>
              <button onClick={copyIntentId}
                style={{ background: "none", border: "none", color: copied ? "#22c55e" : "#94a3b8", cursor: "pointer" }}>
                {copied ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </div>
            <button onClick={onClose}
              style={{
                width: "100%", marginTop: 14, padding: "10px 14px",
                borderRadius: 9, border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)", color: "#cbd5e1",
                fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
              }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: ".55rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#cbd5e1", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
