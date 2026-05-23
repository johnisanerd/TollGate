// src/workspaces/mantle/docs.ts
import type { DocsModule } from "../_docs";

export const docs: DocsModule = {
  sections: [
    {
      id: "overview",
      label: "Overview",
      blocks: [
        { kind: "heading", text: "Mantle yield & agent economy" },
        { kind: "prose", text: "The Mantle workspace gives an AI agent a ring-fenced budget on Mantle's EVM-compatible L2. The agent reads yield signals (mETH, USDY, T-Bill), backtests strategies, and routes capital through the alpha desk — all paid for via x402 micro-payments." },
        { kind: "list", items: [
          "mETH/USDY yield allocation — compare and rotate between yield-bearing assets.",
          "Alpha desk — whale alerts, AI-scored signals and A2A loop.",
          "RWA registry — tokenised real-world assets with risk grades.",
          "Agent credit line — on-chain credit score and borrow limit for the agent.",
          "Strategy backtests — simulation before capital is deployed.",
        ] },
        { kind: "callout", tone: "info", text: "Connect a Mantle-compatible wallet (MetaMask or WalletConnect) and top up the agent treasury before running strategies." },
      ],
    },
    {
      id: "quickstart",
      label: "Quickstart",
      blocks: [
        { kind: "heading", text: "Run the alpha desk" },
        { kind: "prose", text: "Fund the treasury, browse the alpha feed, then run a strategy backtest." },
        { kind: "code", lang: "bash", caption: "1 - Top up the agent treasury", code: "curl -X POST /api/mantle/treasury/top-up \\\n  -d '{\"amountUsd\": 10}'" },
        { kind: "code", lang: "bash", caption: "2 - Fetch the alpha feed", code: "curl /api/mantle/alpha-feed" },
        { kind: "code", lang: "bash", caption: "3 - Run a strategy backtest", code: "curl -X POST /api/mantle/strategy/backtest \\\n  -d '{\"instrument\":\"mETH\",\"windowDays\":30}'" },
        { kind: "callout", tone: "success", text: "Each backtest returns a simulated PnL and a receipt you can pin to 0G Storage." },
      ],
    },
    {
      id: "core-concepts",
      label: "Core Concepts",
      blocks: [
        { kind: "heading", text: "Core concepts" },
        { kind: "heading", level: 3, text: "mETH / USDY yield allocation" },
        { kind: "prose", text: "The yield console compares mETH (3.9% APY), USDY (5.1%), and T-Bill instruments. The rebalancer suggests rotation bands when yields diverge." },
        { kind: "heading", level: 3, text: "Alpha intelligence desk" },
        { kind: "prose", text: "The alpha desk combines whale flow data, AI-scored market signals and the AlphaBot's trade suggestions into a single decision surface." },
        { kind: "heading", level: 3, text: "Agent credit registry" },
        { kind: "prose", text: "AgentCreditRegistry is deployed on Mantle mainnet. Each agent gets a FICO-style credit score based on payment history and collateral; the credit line adjusts accordingly." },
        { kind: "heading", level: 3, text: "A2A economy loop" },
        { kind: "prose", text: "The agent-to-agent loop shows how a Mantle agent discovers services, pays via x402, and records the result on-chain — closing the autonomous economic loop." },
      ],
    },
    {
      id: "api-reference",
      label: "API Reference",
      blocks: [
        { kind: "heading", text: "API Reference" },
        { kind: "prose", text: "Mantle endpoints are served via server/src/feeds.ts. Most are x402-gated." },
        { kind: "endpoint", method: "GET", path: "/api/mantle/alpha-feed", desc: "Latest AI-scored market signals for mETH, USDY and macro conditions.", resp: "[{\"asset\":\"mETH\",\"signal\":\"ACCUMULATE\",\"confidence\":0.82}]" },
        { kind: "endpoint", method: "GET", path: "/api/mantle/whale-alerts", desc: "Recent large-wallet activity on Mantle mainnet.", resp: "[{\"wallet\":\"0x...\",\"action\":\"swap\",\"valueUsd\":420000}]" },
        { kind: "endpoint", method: "POST", path: "/api/mantle/strategy/backtest", desc: "Simulate a strategy over a historical window.", req: "{\"instrument\":\"mETH\",\"windowDays\":30}", resp: "{\"pnlPct\":4.2,\"sharpe\":1.7,\"maxDrawdown\":-2.1}" },
        { kind: "endpoint", method: "GET", path: "/api/mantle/rwa-registry", desc: "Tokenised RWA instruments with risk grade and APY.", resp: "[{\"id\":\"tbill-90d\",\"grade\":\"AAA\",\"apy\":4.83}]" },
        { kind: "endpoint", method: "GET", path: "/api/arc-readiness", desc: "Pre-flight readiness check for the Mantle agent.", resp: "{\"ready\":true,\"checks\":[]}" },
        { kind: "callout", tone: "warn", text: "Re-confirm paths against server/src/feeds.ts before relying on them." },
      ],
    },
    {
      id: "architecture",
      label: "Architecture",
      blocks: [
        { kind: "heading", text: "Architecture" },
        { kind: "table", headers: ["Layer", "Responsibility"], rows: [
          ["Frontend", "React yield console, alpha desk, RWA registry, A2A loop, credit meter."],
          ["Mantle L2", "AgentVault, AgentCreditRegistry, AgentIdentityRegistry on mainnet."],
          ["Server", "x402-gated alpha feed and strategy backtest endpoints."],
          ["0G Storage", "Optional — pin backtest receipts for verifiable proof of strategy history."],
        ] },
        { kind: "code", lang: "text", caption: "Alpha desk flow", code: "agent reads alpha feed (x402 pay)\n            -> scores signals, sizes position\n            -> backtests strategy\n            -> submits to Mantle vault -> receipt" },
      ],
    },
    {
      id: "security",
      label: "Security",
      blocks: [
        { kind: "heading", text: "Security model" },
        { kind: "list", items: [
          "Ring-fenced budget — agent treasury is separate from user wallet; spend is capped per-day.",
          "Credit score enforcement — the credit registry limits the agent's borrow based on on-chain history.",
          "Source allowlist — only allowlisted signal feeds are consumed; each carries a provider reference.",
          "Kill switch — configurable drawdown threshold halts all agent activity automatically.",
          "Mainnet contracts verified — AgentVault and AgentCreditRegistry are verified on Mantlescan.",
        ] },
      ],
    },
    {
      id: "troubleshooting",
      label: "Troubleshooting",
      blocks: [
        { kind: "heading", text: "Troubleshooting" },
        { kind: "table", headers: ["Symptom", "Cause & fix"], rows: [
          ["Alpha feed returns stale data", "Price oracle TTL expired — refresh will trigger on next call."],
          ["Backtest returns error", "Invalid instrument ID — use one of: mETH, USDY, tbill-90d."],
          ["Credit score shows zero", "Agent has no payment history — make at least one paid x402 call to seed the score."],
          ["Treasury depleted", "Daily cap reached — top up via the treasury widget or increase the cap."],
          ["Kill switch tripped", "Drawdown threshold crossed — review the Yield tab and re-arm from the agent panel."],
        ] },
      ],
    },
  ],
};
