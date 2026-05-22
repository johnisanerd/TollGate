// src/workspaces/agora/docs.ts
import type { DocsModule } from "../_docs";

export const docs: DocsModule = {
  sections: [
    {
      id: "overview",
      label: "Overview",
      blocks: [
        { kind: "heading", text: "ArcMind Control Layer" },
        { kind: "prose", text: "The Arc workspace gives an AI market agent a ring-fenced USDC budget, hard risk limits, an approved set of data sources, and proof-backed execution on the Arc network. User capital stays in the user's wallet; the agent can only spend what was explicitly allocated to its treasury." },
        { kind: "list", items: [
          "Agent Budget — a signed treasury allowance, separate from user funds.",
          "Risk Policy — per-trade and daily caps plus an automatic kill switch.",
          "Sources — only allowlisted, proof-checked signal feeds.",
          "Execution — every decision and trade produces a verifiable receipt.",
        ] },
        { kind: "callout", tone: "info", text: "Start at the Quickstart to allocate a budget and run the agent's first decision tick." },
      ],
    },
    {
      id: "quickstart",
      label: "Quickstart",
      blocks: [
        { kind: "heading", text: "Run the agent" },
        { kind: "prose", text: "Fund the agent treasury with a signed allowance, set the risk policy, then drive the decision loop. The agent reads sources, sizes a position, and settles — staying inside the policy." },
        { kind: "code", lang: "bash", caption: "1 - Allocate a signed budget", code: "curl -X POST /api/arc/control/budget/top-up \\\n  -d '{ \"amountUsd\": 25, \"signature\": \"0x...\" }'" },
        { kind: "code", lang: "bash", caption: "2 - Set the risk policy", code: "curl -X POST /api/arc/control/policy \\\n  -d '{ \"maxPerTradeUsd\": 1, \"dailyCapUsd\": 20, \"killDrawdownPct\": 15 }'" },
        { kind: "code", lang: "bash", caption: "3 - Run a decision tick", code: "curl -X POST /api/arc-agent/tick" },
        { kind: "callout", tone: "success", text: "Each tick appends a reasoning trace and, if it trades, a receipt — see the Decision Room and Receipts tabs." },
      ],
    },
    {
      id: "core-concepts",
      label: "Core Concepts",
      blocks: [
        { kind: "heading", text: "Core concepts" },
        { kind: "heading", level: 3, text: "Agent budget & treasury" },
        { kind: "prose", text: "The agent treasury is funded by a signed allowance. The agent can spend up to the allowance and no more; the user's wallet balance is never touched directly." },
        { kind: "heading", level: 3, text: "Risk policy & kill switch" },
        { kind: "prose", text: "The policy sets a max per trade, a daily cap, and a drawdown threshold. If cumulative drawdown crosses the threshold, the kill switch halts all execution until a human re-arms it." },
        { kind: "heading", level: 3, text: "Sources & decision room" },
        { kind: "prose", text: "Sources are allowlisted signal feeds — price oracles, open interest, sentiment, whale flows. The decision room records, per tick, which signals were read and how they were weighed." },
        { kind: "heading", level: 3, text: "Reasoning traces & copy trading" },
        { kind: "prose", text: "A reasoning trace is the step-by-step log of one decision: inputs, Kelly sizing, rationale, outcome. Copy trading lets a user stake USDC into a CopyTradeEscrow contract that mirrors the agent's positions." },
      ],
    },
    {
      id: "api-reference",
      label: "API Reference",
      blocks: [
        { kind: "heading", text: "API Reference" },
        { kind: "prose", text: "The control layer is driven over HTTP. Budget and policy writes change agent behaviour immediately." },
        { kind: "endpoint", method: "GET", path: "/api/arc/control/status", desc: "Current control-layer state: budget, policy, and agent status.", resp: "{ \"agent\": \"armed\", \"budgetUsd\": 25 }" },
        { kind: "endpoint", method: "GET", path: "/api/arc/control/budget", desc: "Read the agent treasury balance and allowance.", resp: "{ \"availableUsd\": 18.4, \"allowanceUsd\": 25 }" },
        { kind: "endpoint", method: "POST", path: "/api/arc/control/budget/top-up", desc: "Add a signed USDC allowance to the agent treasury.", req: "{ \"amountUsd\": 25, \"signature\": \"0x...\" }", resp: "{ \"availableUsd\": 43.4 }" },
        { kind: "endpoint", method: "POST", path: "/api/arc/control/policy", desc: "Update the risk policy — per-trade cap, daily cap, kill threshold.", req: "{ \"maxPerTradeUsd\": 1, \"dailyCapUsd\": 20, \"killDrawdownPct\": 15 }", resp: "{ \"ok\": true }" },
        { kind: "endpoint", method: "POST", path: "/api/arc-agent/tick", desc: "Run one decision tick: read sources, decide, and settle if warranted.", resp: "{ \"decision\": \"LONG BTC 18%\", \"traceId\": \"trace-014\" }" },
        { kind: "endpoint", method: "GET", path: "/api/arc-decisions", desc: "Recent decisions with their signals and outcomes.", resp: "[{ \"traceId\": \"trace-014\", \"outcome\": \"+14.3%\" }]" },
        { kind: "endpoint", method: "POST", path: "/api/arc-trace/unlock", desc: "Pay via x402 to unlock a full reasoning trace.", req: "{ \"traceId\": \"trace-014\" }", resp: "{ \"signal\": \"...\", \"rationale\": \"...\" }" },
        { kind: "endpoint", method: "GET", path: "/api/arc-readiness", desc: "A pre-flight readiness check before arming the agent.", resp: "{ \"ready\": true, \"checks\": [] }" },
        { kind: "callout", tone: "warn", text: "Paths are taken from server/src/routes.ts and server/src/feeds.ts. Re-confirm against those files before relying on them." },
      ],
    },
    {
      id: "architecture",
      label: "Architecture",
      blocks: [
        { kind: "heading", text: "Architecture" },
        { kind: "table", headers: ["Layer", "Responsibility"], rows: [
          ["Frontend", "React control panels — budget, strategies, sources, decision room, risk guard."],
          ["Control server", "Express server — holds budget & policy, runs decision ticks, exposes /api/arc/* endpoints."],
          ["Arc network", "ArcMind registry and CopyTradeEscrow contracts on Arc testnet; USDC settlement."],
        ] },
        { kind: "code", lang: "text", caption: "Decision tick", code: "tick -> read allowlisted sources\n     -> score signals, size with Kelly\n     -> check risk policy + kill switch\n     -> settle on Arc -> receipt + reasoning trace" },
      ],
    },
    {
      id: "security",
      label: "Security",
      blocks: [
        { kind: "heading", text: "Security model" },
        { kind: "list", items: [
          "Signed treasury allowance — the agent spends only an explicitly signed budget; user capital stays in the user's wallet.",
          "Hard risk caps — max-per-trade and daily caps are enforced server-side before any execution.",
          "Kill switch — a drawdown threshold halts the agent automatically; only a human can re-arm it.",
          "Source proofs — only allowlisted feeds are accepted; each signal carries a source reference.",
          "Verifiable receipts — every trade and decision is receipted, so performance cannot be fabricated.",
        ] },
        { kind: "callout", tone: "warn", text: "The agent can never withdraw to an arbitrary address — withdrawals go back to the funding wallet only." },
      ],
    },
    {
      id: "troubleshooting",
      label: "Troubleshooting",
      blocks: [
        { kind: "heading", text: "Troubleshooting" },
        { kind: "table", headers: ["Symptom", "Cause & fix"], rows: [
          ["Tick does nothing", "Agent not armed or budget empty — top up the treasury and check /api/arc-readiness."],
          ["\"requires signature\"", "A budget top-up needs a signed allowance — sign the allowance message and resend."],
          ["Agent halted unexpectedly", "The kill switch tripped on drawdown — review the Risk Guard tab and re-arm manually."],
          ["Trade rejected", "The request exceeds max-per-trade or the daily cap — adjust the policy or wait for the daily reset."],
          ["Source ignored", "The feed is not allowlisted — add it under the Sources tab."],
        ] },
      ],
    },
  ],
};
