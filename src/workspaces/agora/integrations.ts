// src/workspaces/agora/integrations.ts
import type { IntegrationsModule } from "../_docs";

export const integrations: IntegrationsModule = {
  intro: "Connect the ArcMind Control Layer to your stack — the ArcMind client helpers, the Arc testnet, Circle CCTP, the copy-trade escrow contract, and the live decision feed.",
  cards: [
    {
      id: "arc_client",
      title: "ArcMind Client",
      category: "SDK",
      status: "available",
      desc: "Typed helpers in src/lib/agora.ts to fund the treasury, register the agent, record decisions, and read budget — straight from the browser app.",
      code: { lang: "ts", code: "import { stakeToEscrow, registerArcAgent, recordArcDecision } from \"./lib/agora\";" },
    },
    {
      id: "arc_net",
      title: "Arc Testnet",
      category: "Chain",
      status: "available",
      desc: "ArcMind contracts run on Arc testnet. Use the RPC URL, chain id, and explorer from the Arc config in src/lib/agora.ts.",
      code: { lang: "ts", code: "// Arc testnet — see the Arc config helper in src/lib/agora.ts\n// { rpcUrl, chainId, explorer }" },
    },
    {
      id: "arc_cctp",
      title: "Circle CCTP",
      category: "API",
      status: "beta",
      desc: "Cross-Chain Transfer Protocol for moving USDC between Arc, Base, and Arbitrum — used by the arbitrage executor service.",
      link: { label: "CCTP docs", url: "https://developers.circle.com/stablecoins/docs/cctp-getting-started" },
    },
    {
      id: "arc_escrow",
      title: "CopyTradeEscrow",
      category: "API",
      status: "available",
      desc: "An ERC-8183 escrow contract. A user stakes USDC; the agent allocates and settles PnL automatically inside policy limits.",
      code: { lang: "ts", code: "import { stakeToEscrow } from \"./lib/agora\";\nawait stakeToEscrow({ stakeUsd: 10, strategy: \"ArcMind ETH/USDC\" });" },
    },
    {
      id: "arc_allowance",
      title: "Signed Treasury Allowance",
      category: "Wallet",
      status: "available",
      desc: "The agent treasury is funded by an EIP-191 signed allowance message — the agent can spend up to it and no further.",
      code: { lang: "bash", code: "curl -X POST /api/arc/control/budget/top-up -d '{ \"amountUsd\": 25, \"signature\": \"0x...\" }'" },
    },
    {
      id: "arc_feed",
      title: "Decision Feed API",
      category: "Webhook",
      status: "available",
      desc: "Poll /api/arc-decisions for the agent's latest decisions, signals, and outcomes — drive dashboards or copy-trading bots.",
      code: { lang: "ts", code: "const decisions = await fetch(\"/api/arc-decisions\").then((r) => r.json());" },
    },
  ],
};
