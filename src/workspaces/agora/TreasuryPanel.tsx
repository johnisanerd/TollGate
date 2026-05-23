/** Reusable workspace-scoped Agent Treasury panel.
 *
 * Drop this into any workspace's agent/economy tab to render the hybrid-funding
 * treasury UI: balance strip, signed-allowance button, policy snapshot and the
 * recent spend log. It renders treasury UI only — it never runs agent flows and
 * never calls recordFundingSpend; the calling widget keeps its own step state and
 * uses checkFunding / settleFundedCall directly.
 *
 * The Agora workspace keeps its original inline treasury UI; this component
 * serves the Arbitrum, Mantle, Polygon, 0G, QIE and Sui rollout.
 */
import { type CSSProperties, useCallback, useState } from "react";
import {
  fundTreasury,
  getFundingPolicy,
  getFundingSpendLog,
  getRemainingToday,
  getTreasuryState,
  requestTreasuryAllowanceSignature,
  type FundingScope,
  type FundingSpend,
  type TreasuryState,
} from "./funding";

export type TreasuryPanelProps = {
  /** Workspace-scoped funding identity. Drives every read/write key. */
  scope: FundingScope;
  /** Short label for the action this panel guards, e.g. "Orbit monitor poll". */
  label: string;
  /** Amount the "Sign treasury allowance" button funds. */
  defaultTopUpUsd: number;
  /** Optional spend the calling flow needs — renders a "Requested" cell + readiness line. */
  requiredSpendUsd?: number;
  /** Compact single-column layout for narrow side panels. */
  dense?: boolean;
  /** Max spend-log rows to render. Default 5. */
  spendLogLimit?: number;
  /** Fired after a successful top-up so the parent can refresh its own preflight. */
  onTreasuryChange?: (state: TreasuryState) => void;
};

const lbl: CSSProperties = {
  fontSize: ".6rem",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "var(--muted)",
  fontWeight: 700,
};

function cell(title: string, value: string) {
  return (
    <div key={title} style={{ background: "var(--bg-2)", borderRadius: 9, padding: "8px 10px" }}>
      <div style={lbl}>{title}</div>
      <div style={{ fontWeight: 700, fontSize: ".82rem", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function SpendRow({ spend }: { spend: FundingSpend }) {
  const isFallback = spend.settlement === "fallback" || !spend.ok;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "5px 8px",
        borderRadius: 7,
        background: "rgba(255,255,255,0.03)",
        opacity: isFallback ? 0.6 : 1,
        fontSize: ".68rem",
      }}
    >
      <span style={{ fontWeight: 700, color: isFallback ? "var(--muted)" : "#dbeafe" }}>
        {spend.mode}
        {spend.serviceId ? ` · ${spend.serviceId}` : ""}
      </span>
      <span style={{ color: isFallback ? "var(--muted)" : "#86efac", fontWeight: 700 }}>
        {isFallback ? `$0.00 (${spend.settlement})` : `-$${spend.amount.toFixed(2)}`}
      </span>
    </div>
  );
}

export function TreasuryPanel({
  scope,
  label,
  defaultTopUpUsd,
  requiredSpendUsd,
  dense = false,
  spendLogLimit = 5,
  onTreasuryChange,
}: TreasuryPanelProps) {
  const [treasury, setTreasury] = useState<TreasuryState>(() => getTreasuryState(scope));
  const [policy, setPolicy] = useState(() => getFundingPolicy(scope));
  const [spendLog, setSpendLog] = useState<FundingSpend[]>(() => getFundingSpendLog(scope));
  const [remaining, setRemaining] = useState(() => getRemainingToday(scope));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const next = getTreasuryState(scope);
    setTreasury(next);
    setPolicy(getFundingPolicy(scope));
    setSpendLog(getFundingSpendLog(scope));
    setRemaining(getRemainingToday(scope));
    return next;
  }, [scope]);

  const approveAllowance = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const sig = await requestTreasuryAllowanceSignature(scope, defaultTopUpUsd);
      fundTreasury(scope, defaultTopUpUsd, sig);
      const next = refresh();
      const demo = sig.startsWith("sui_demo_sig:");
      setMsg(
        `Treasury funded with a signed $${defaultTopUpUsd.toFixed(2)} allowance${demo ? " (Sui demo signature)" : ""}.`,
      );
      onTreasuryChange?.(next);
    } catch {
      setMsg("Treasury allowance was not signed. Autonomous calls remain blocked.");
    } finally {
      setBusy(false);
    }
  }, [scope, defaultTopUpUsd, refresh, onTreasuryChange]);

  const ready =
    !policy.paused &&
    (requiredSpendUsd === undefined
      ? treasury.availableUsd > 0
      : treasury.availableUsd >= requiredSpendUsd);

  const rows = spendLog.slice(0, spendLogLimit);

  return (
    <div
      style={{
        border: "1px solid var(--line-2)",
        borderRadius: 12,
        padding: 12,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ ...lbl, marginBottom: 8 }}>Agent Treasury · {label}</div>

      {/* Balance strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: dense ? "1fr" : "repeat(auto-fit,minmax(145px,1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {cell("Treasury available", `$${treasury.availableUsd.toFixed(2)} USDC`)}
        {cell("Funded total", `$${treasury.fundedUsd.toFixed(2)} USDC`)}
        {cell("Spent today", `$${treasury.spentUsd.toFixed(2)} USDC`)}
        {requiredSpendUsd !== undefined && cell("Requested spend", `$${requiredSpendUsd.toFixed(2)} USDC`)}
      </div>

      {/* Allowance callout */}
      <div
        style={{
          marginBottom: 12,
          padding: "10px 12px",
          borderRadius: 11,
          border: ready ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(251,191,36,0.45)",
          background: ready ? "rgba(34,197,94,0.07)" : "rgba(251,191,36,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ minWidth: 200, flex: "1 1 240px" }}>
            <div style={{ fontSize: ".76rem", fontWeight: 900, color: ready ? "var(--green)" : "#fbbf24" }}>
              {policy.paused ? "Agent paused" : ready ? "Agent Treasury funded" : "Agent has no spendable funds"}
            </div>
            <div style={{ fontSize: ".7rem", color: "#dbeafe", lineHeight: 1.5, marginTop: 4 }}>
              The agent does not own your wallet. Autonomous x402 calls spend only this
              signed Treasury allowance — without a signed allowance, payment is blocked
              before any service call can charge funds.
            </div>
          </div>
          <button
            onClick={approveAllowance}
            disabled={busy}
            style={{
              border: "1px solid rgba(96,165,250,0.55)",
              borderRadius: 10,
              background: "linear-gradient(135deg, #2563eb 0%, #22d3ee 100%)",
              color: "#03121f",
              fontWeight: 900,
              fontSize: ".74rem",
              padding: "10px 12px",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Waiting for wallet..." : `Sign $${defaultTopUpUsd.toFixed(2)} treasury allowance`}
          </button>
        </div>
        {msg && (
          <div style={{ marginTop: 9, fontSize: ".69rem", color: msg.includes("not signed") ? "#fca5a5" : "#86efac" }}>
            {msg}
          </div>
        )}
      </div>

      {/* Policy snapshot */}
      <div style={{ fontSize: ".68rem", color: "var(--muted)", marginBottom: rows.length ? 10 : 0 }}>
        Policy: ${policy.dailyLimitUsd.toFixed(2)}/day · ${policy.maxPerCallUsd.toFixed(2)}/call ·
        ${remaining.toFixed(2)} remaining today · {policy.allowlistedServices.length} allowlisted service
        {policy.allowlistedServices.length === 1 ? "" : "s"}
        {policy.paused ? " · PAUSED" : ""}
      </div>

      {/* Recent spend log */}
      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={lbl}>Recent spend</div>
          {rows.map((s) => (
            <SpendRow key={s.id} spend={s} />
          ))}
        </div>
      )}
    </div>
  );
}
