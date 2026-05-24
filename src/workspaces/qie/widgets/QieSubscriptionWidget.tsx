import { useState } from "react";
import { Package, Star, CheckCircle2, Loader2, Crown, Zap } from "lucide-react";
import type { Workspace } from "../../../types";
import { useAppState } from "../../../app-state";
import { useLocalStore } from "../../../lib/storage";
import {
  checkFunding,
  fundingReceiptPayload,
  recordFundingSpend,
  QIE_FUNDING_SCOPE,
} from "../funding";

// QIE Pass-gated subscription bundles. Tier discount: Silver 10% / Gold 20% / Platinum 30%.
// Competes in QIE Ecosystem Champion track (6/6 components covered: Wallet+Pass+DEX+QUSDC+QIElend+Oracle).

type BundleId = "starter" | "pro" | "enterprise";

type Bundle = {
  id: BundleId;
  name: string;
  callsPerMonth: number;
  priceQie: number;
  features: string[];
  accent: string;
  minPassTier: "Bronze" | "Silver" | "Gold" | "Platinum";
};

const BUNDLES: Bundle[] = [
  {
    id: "starter",
    name: "Starter",
    callsPerMonth: 100,
    priceQie: 5,
    features: ["100 API calls/mo", "QIE Checkout access", "Basic receipts", "Community support"],
    accent: "#a0aec0",
    minPassTier: "Bronze",
  },
  {
    id: "pro",
    name: "Pro",
    callsPerMonth: 500,
    priceQie: 18,
    features: ["500 API calls/mo", "QIE Pass gating", "Oracle feed access", "Agent Credit unlock", "Priority gateway"],
    accent: "#f59e0b",
    minPassTier: "Silver",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    callsPerMonth: -1,
    priceQie: 60,
    features: ["Unlimited API calls", "All QIE ecosystem", "Platinum Pass included", "SLA 99.9%", "Dedicated gateway node"],
    accent: "#60a5fa",
    minPassTier: "Gold",
  },
];

type DemoStep = { id: string; label: string; detail: string; done: boolean };

function passDiscount(tier: string): number {
  if (tier === "Platinum") return 0.30;
  if (tier === "Gold")     return 0.20;
  if (tier === "Silver")   return 0.10;
  return 0;
}

function addDays(d: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toLocaleDateString();
}

export function QieSubscriptionWidget({ workspace }: { workspace: Workspace }) {
  const { receipts, emitReceipt } = useAppState();
  const [activeBundle, setActiveBundle] = useLocalStore<BundleId | null>("qie.subscription.active", null);
  const [expiry, setExpiry] = useLocalStore<string>("qie.subscription.expiry", "");
  const [running, setRunning] = useState<BundleId | null>(null);
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [done, setDone] = useState(false);
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const SUB_COST_USD = 0.02;

  const wsReceipts = receipts.filter((r) => r.workspaceId === workspace.id);
  const count = wsReceipts.length;
  const volume = wsReceipts.reduce((s, r) => s + (r.amount ?? 0), 0);
  const score = Math.min(Math.min(count * 5, 500) + Math.min(Math.floor(volume), 300), 1000);
  const passTier = score >= 850 ? "Platinum" : score >= 700 ? "Gold" : score >= 400 ? "Silver" : "Bronze";
  const discount = passDiscount(passTier);

  async function subscribe(bundle: Bundle) {
    if (running) return;
    // Treasury preflight — activating a subscription is an autonomous recurring
    // charge; block it unless the QIE Treasury has a signed allowance.
    const fc = checkFunding(QIE_FUNDING_SCOPE, SUB_COST_USD, { mode: "treasury", serviceId: "svc_qie_checkout" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the QIE Treasury first.`);
      return;
    }
    setFundingErr(null);
    setRunning(bundle.id);
    setDone(false);
    const finalPrice = +(bundle.priceQie * (1 - discount)).toFixed(2);
    const callsLabel = bundle.callsPerMonth === -1 ? "Unlimited" : bundle.callsPerMonth.toString();
    const STEPS: Omit<DemoStep, "done">[] = [
      { id: "s1", label: "Checking QIE Pass tier", detail: `Pass tier: ${passTier} · Discount: ${(discount * 100).toFixed(0)}%` },
      { id: "s2", label: "Verifying QIE wallet balance", detail: `Required: ${finalPrice} QIE · Deducting from wallet` },
      { id: "s3", label: "Activating subscription on QIE chain", detail: `QieSubscription.activate(${bundle.id}, 30 days) — simulated tx` },
      { id: "s4", label: "Minting access receipt", detail: `x402 receipt issued · ${callsLabel} calls/mo activated` },
    ];
    setSteps(STEPS.map((s) => ({ ...s, done: false })));
    for (let i = 0; i < STEPS.length; i++) {
      await new Promise((r) => setTimeout(r, 800));
      setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, done: true } : s));
    }
    setActiveBundle(bundle.id);
    setExpiry(addDays(30));
    recordFundingSpend(QIE_FUNDING_SCOPE, SUB_COST_USD, { mode: "treasury", serviceId: "svc_qie_checkout", settlement: "fallback" });
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_qie_subscription",
      serviceName: `QIE ${bundle.name} Bundle · 30 days`,
      amount: finalPrice,
      currency: "QIE" as const,
      network: workspace.networks[0] ?? "qie-testnet",
      kind: "qie.subscription.activate",
      payload: fundingReceiptPayload(QIE_FUNDING_SCOPE, SUB_COST_USD, { mode: "treasury", serviceId: "svc_qie_checkout", settlement: "fallback" }, { bundleId: bundle.id, callsPerMonth: bundle.callsPerMonth, passTier, discount, finalPrice, expiresAt: addDays(30) }),
    });
    setDone(true);
    setRunning(null);
  }

  async function cancel() {
    if (running) return;
    setActiveBundle(null);
    setExpiry("");
    setSteps([]);
    setDone(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: "#ec489922", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Package size={18} style={{ color: "#ec4899" }} />
        </span>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--ink)" }}>QIE Subscription Bundles</div>
          <div style={{ fontSize: ".73rem", color: "var(--muted)" }}>QIE Pass tier discount · all 6 ecosystem components · monthly billing</div>
        </div>
      </div>

      {discount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#f59e0b11", borderRadius: 10, border: "1px solid #f59e0b33" }}>
          <Crown size={14} style={{ color: "#f59e0b" }} />
          <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#f59e0b" }}>
            {passTier} Pass active — {(discount * 100).toFixed(0)}% discount applied automatically
          </span>
        </div>
      )}

      {fundingErr && (
        <div style={{ padding: "9px 12px", background: "#f59e0b12", borderRadius: 10, border: "1px solid #f59e0b44", fontSize: ".72rem", color: "#fbbf24", fontWeight: 600 }}>
          {fundingErr}
        </div>
      )}

      {activeBundle && (
        <div style={{ padding: "14px 16px", background: "#4ade8011", borderRadius: 12, border: "1px solid #4ade8033", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: ".85rem", fontWeight: 800, color: "#4ade80" }}>
              {BUNDLES.find((b) => b.id === activeBundle)?.name} Bundle · Active
            </div>
            <div style={{ fontSize: ".65rem", color: "var(--muted)" }}>Expires {expiry}</div>
          </div>
          <button type="button" onClick={cancel} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #4ade8055", background: "transparent", color: "#4ade80", fontWeight: 700, fontSize: ".75rem", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {BUNDLES.map((bundle) => {
          const finalPrice = +(bundle.priceQie * (1 - discount)).toFixed(2);
          const isActive = activeBundle === bundle.id;
          const isRunning = running === bundle.id;
          return (
            <div key={bundle.id} style={{ background: "var(--bg-2)", borderRadius: 14, border: `1px solid ${isActive ? bundle.accent + "66" : "var(--line-2)"}`, padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Star size={13} style={{ color: bundle.accent }} />
                    <span style={{ fontWeight: 800, fontSize: ".9rem", color: "var(--ink)" }}>{bundle.name}</span>
                    {isActive && <span style={{ fontSize: ".6rem", fontWeight: 800, background: bundle.accent + "22", color: bundle.accent, borderRadius: 4, padding: "2px 6px" }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: ".7rem", color: "var(--muted)", marginTop: 2 }}>
                    {bundle.callsPerMonth === -1 ? "Unlimited" : `${bundle.callsPerMonth.toLocaleString()} calls`}/month · min {bundle.minPassTier} Pass
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 900, color: bundle.accent }}>{finalPrice} QIE</div>
                  {discount > 0 && (
                    <div style={{ fontSize: ".65rem", color: "var(--muted)", textDecoration: "line-through" }}>{bundle.priceQie} QIE</div>
                  )}
                  <div style={{ fontSize: ".6rem", color: "var(--muted)" }}>/ month</div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {bundle.features.map((f) => (
                  <span key={f} style={{ fontSize: ".65rem", padding: "3px 8px", background: bundle.accent + "11", color: bundle.accent, borderRadius: 6, fontWeight: 600 }}>{f}</span>
                ))}
              </div>
              <button type="button" onClick={() => subscribe(bundle)} disabled={!!running || isActive} style={{ padding: "9px 0", borderRadius: 9, border: "none", background: isActive ? "var(--bg-3)" : isRunning ? "var(--bg-3)" : bundle.accent, color: isActive || isRunning ? "var(--muted)" : "#0a0a0b", fontWeight: 800, fontSize: ".82rem", cursor: (running || isActive) ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {isRunning ? <><Loader2 size={13} className="animate-spin" /> Activating…</> : isActive ? "Current plan" : <><Zap size={13} /> Subscribe</>}
              </button>
            </div>
          );
        })}
      </div>

      {steps.length > 0 && (
        <div style={{ background: "var(--bg-2)", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--line-2)", display: "flex", flexDirection: "column", gap: 8 }}>
          {steps.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ marginTop: 1, flexShrink: 0 }}>
                {s.done ? <CheckCircle2 size={14} style={{ color: "#4ade80" }} /> : <Loader2 size={14} className="animate-spin" style={{ color: "var(--muted)" }} />}
              </span>
              <div>
                <div style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--ink)" }}>{s.label}</div>
                <div style={{ fontSize: ".65rem", color: "var(--muted)" }}>{s.detail}</div>
              </div>
            </div>
          ))}
          {done && <div style={{ marginTop: 4, padding: "8px 10px", background: "#4ade8011", borderRadius: 8, fontSize: ".72rem", color: "#4ade80", fontWeight: 700 }}>Subscription active · Receipt issued · QIE ecosystem unlocked.</div>}
        </div>
      )}
    </div>
  );
}
