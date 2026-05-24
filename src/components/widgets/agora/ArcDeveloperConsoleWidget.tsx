import { useState, type ReactNode } from "react";
import { Code2, ChevronDown, AlertTriangle } from "lucide-react";
import type { Workspace } from "../../../types";
import {
  ArcControlBudgetWidget,
  ArcControlDecisionRoomWidget,
  ArcControlExecutionWidget,
  ArcControlPositionsWidget,
  ArcControlReceiptsWidget,
  ArcControlRiskGuardWidget,
  ArcControlSourcesWidget,
  ArcControlStrategiesWidget,
} from "./ArcControlWidgets";
import {
  AgoraCctpWidget,
  AgoraCircleToolsWidget,
  AgoraPortfolioWidget,
  AgoraX402Widget,
  ArcAppKitWidget,
} from "./AgoraExtraWidgets";
import { ArcMindDebateWidget } from "./ArcMindWidgets";
import { ArcSlashLeaderboardWidget } from "./ArcSlashLeaderboardWidget";
import { ArcGalxeQuestWidget } from "./ArcGalxeQuestWidget";
import { ArcMultiExchangeWidget } from "./ArcMultiExchangeWidget";

interface SectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function Section({ title, description, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(8,13,25,0.55)",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", border: "none", background: open ? "rgba(96,165,250,0.08)" : "transparent",
          cursor: "pointer", textAlign: "left",
        }}>
        <ChevronDown size={15} style={{ color: "#60a5fa", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#fff" }}>{title}</div>
          {description && <div style={{ fontSize: ".68rem", color: "#9fb0c8", marginTop: 2 }}>{description}</div>}
        </div>
      </button>
      {open && (
        <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface Props { workspace: Workspace }

export function ArcDeveloperConsoleWidget({ workspace }: Props) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.04))",
        border: "1px solid rgba(245,158,11,0.22)",
        borderRadius: 12,
      }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(245,158,11,0.18)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Code2 size={16} style={{ color: "#f59e0b" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: ".88rem", fontWeight: 800, color: "#fff", marginBottom: 4 }}>Developer Console</div>
          <div style={{ fontSize: ".72rem", color: "#9fb0c8", lineHeight: 1.5 }}>
            Full agent control plane: budget, strategies, sources, risk policy, execution queue, raw positions, x402 calls, App Kit, CCTP, Circle tools. Regular users normally don't need this — use <b style={{ color: "#fff" }}>Overview</b> and <b style={{ color: "#fff" }}>Copy &amp; Position</b> tabs instead.
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: ".62rem", fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.10)", padding: "4px 8px", borderRadius: 6, flexShrink: 0 }}>
          <AlertTriangle size={11} /> power user
        </span>
      </div>

      <Section title="Agent Budget" description="USDC budget the agent uses to pay for data/actions. Separate from user copy capital." defaultOpen>
        <ArcControlBudgetWidget workspace={workspace} />
      </Section>
      <Section title="Strategies" description="Enable/disable strategy behaviors (copyguard, arbwatcher, riskoff).">
        <ArcControlStrategiesWidget workspace={workspace} />
      </Section>
      <Section title="Data Sources" description="Block, allow, or refresh the market/signal sources used in decisions.">
        <ArcControlSourcesWidget workspace={workspace} />
      </Section>
      <Section title="Multi-Agent Debate" description="Bull LLM vs Bear LLM — ArcMind synthesizes a live BUY/SELL/HOLD verdict using real ETH price + Hyperliquid OI.">
        <ArcMindDebateWidget />
      </Section>
      <Section title="Slash-Bonded Leaderboard" description="ERC-8004 agent registry — bond at risk, reputation scores, slashed agents with reasons.">
        <ArcSlashLeaderboardWidget workspace={workspace} />
      </Section>
      <Section title="Galxe Pioneer Quest" description="Stake $1 on Arc Testnet → collect a receipt → claim your soulbound ArcMind Pioneer NFT badge.">
        <ArcGalxeQuestWidget />
      </Section>
      <Section title="Cross-Platform Positions" description="Read-only agent positions on dYdX v4 and GMX v2 (Arbitrum). Set VITE_DYDX_ADDRESS / VITE_GMX_AGENT_ADDRESS.">
        <ArcMultiExchangeWidget workspace={workspace} />
      </Section>
      <Section title="Decision Room" description="Current BUY/SELL/HOLD reasoning, gate status, approve/reject controls.">
        <ArcControlDecisionRoomWidget workspace={workspace} />
      </Section>
      <Section title="Execution Queue" description="Pending and recent actions with retry/cancel.">
        <ArcControlExecutionWidget workspace={workspace} />
      </Section>
      <Section title="Risk Guard" description="Drawdown limits, stale-source timeout, divergence ceilings, emergency stop.">
        <ArcControlRiskGuardWidget workspace={workspace} />
      </Section>
      <Section title="Positions (raw)" description="Raw exposure cards (different from user copy positions).">
        <ArcControlPositionsWidget workspace={workspace} />
      </Section>
      <Section title="Control Receipts" description="Audit trail of every budget/policy/source/decision change.">
        <ArcControlReceiptsWidget workspace={workspace} />
      </Section>
      <Section title="Portfolio Rebalancer" description="Multi-asset target allocation, regime detection, manual rebalance.">
        <AgoraPortfolioWidget workspace={workspace} />
      </Section>
      <Section title="App Kit — Balance / Bridge / Swap / Send" description="Circle App Kit unified utility surface.">
        <ArcAppKitWidget workspace={workspace} />
      </Section>
      <Section title="x402 Service Calls" description="Pay-per-call API consumption (OI, reasoning, advisor, alerts).">
        <AgoraX402Widget workspace={workspace} />
      </Section>
      <Section title="CCTP Bridge" description="Move USDC across Arc/Base/Arbitrum via Circle CCTP.">
        <AgoraCctpWidget workspace={workspace} />
      </Section>
      <Section title="Circle Tools" description="USDC, Programmable Wallets, Nanopayments, Gas Abstraction.">
        <AgoraCircleToolsWidget workspace={workspace} />
      </Section>
    </div>
  );
}
