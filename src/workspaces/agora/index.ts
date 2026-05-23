import { CircleLogo } from "../../components/logos/ProjectLogos";
import type { Workspace } from "../../types";
import type { AgentRaw, SeedRow, SRaw } from "../_types";

const W = "0xF4BFd93061B160Fa376c7F66De207a00225B4e70";
const W2 = "0x24Cb6d1bE131006e8CB2cb7fBa5675725f9E6Da8";

export const workspace: Workspace = {
  id: "agora",
  shortName: "Agora",
  name: "ArcMind — Autonomous Trading Intelligence",
  route: "/agora",
  pitch: "ArcMind: the first autonomous trading agent that shows you its reasoning, lets you copy-trade with $1, and kills itself when it starts losing — all settled in USDC on Arc L1.",
  tags: ["Cross-Chain Arb", "Copy Strategy", "Reasoning Proofs", "Decision Guard", "Kill Switch"],
  networks: ["arc-testnet"],
  tabs: ["Discover", "Agent", "Copy & Position", "Receipts", "Developer Console", "Docs", "Integrations"],
  accent: "#1652F0",
  darkAccent: "#4B7BFF",
  overviewClass: "agora",
  overviewAccents: ["#1652f0","#22d3ee","#10b981","#f59e0b","#8b5cf6","#fb7185","#3b82f6"],
  Icon: CircleLogo,
};

export const rawServices: SRaw[] = [
  { id: "svc_arc_oracle", workspaceId: "agora", name: "Arc Price Oracle", category: "data",
    description: "Real-time USDC price feed across Arc, Arbitrum, and Base — used by arbitrage agents to spot cross-chain gaps.",
    priceUsd: 0.02, currency: "USDC", network: "arc-testnet", provider: "ArcArb Data", providerWallet: W,
    sampleIn: '{ "pairs": ["ETH/USDC","USDC/EURC"], "chains": ["arc","base","arbitrum"] }', response: '{ "arc": 1.0001, "base": 0.9998, "arb": 1.0000, "gap": 0.03 }', status: "active", calls: 0 },
  { id: "svc_arc_arb", workspaceId: "agora", name: "Cross-Chain Arb Executor", category: "trading",
    description: "Executes a cross-chain USDC arbitrage via CCTP: routes the optimal leg, monitors finality, returns net profit.",
    priceUsd: 0.05, currency: "USDC", network: "arc-testnet", provider: "ArcArb Executor", providerWallet: W2,
    sampleIn: '{ "buyChain": "arc", "sellChain": "base", "amount": "500" }', response: '{ "profit": "0.12", "ttl": "420ms", "cctpTx": "0x…" }', status: "active", calls: 0 },
  { id: "svc_arc_portfolio", workspaceId: "agora", name: "Portfolio Rebalance API", category: "inference",
    description: "Analyses multi-asset allocation against a target and emits rebalance instructions settled in USDC via Circle Paymaster.",
    priceUsd: 0.08, currency: "USDC", network: "arc-testnet", provider: "ArcPortfolio AI", providerWallet: W,
    sampleIn: '{ "assets": { "ETH": 0.6, "USDC": 0.4 }, "target": { "ETH": 0.5 } }', response: '{ "action": "sell 0.1 ETH → 310 USDC", "fee": "0.001 USDC", "via": "Paymaster" }', status: "active", calls: 0 },
  { id: "svc_arc_signal_hl", workspaceId: "agora", name: "Hyperliquid OI Feed", category: "data",
    description: "Real-time open interest delta and funding rate from Hyperliquid perps — sub-cent x402 Nanopayment.",
    priceUsd: 0.002, currency: "USDC", network: "arc-testnet", provider: "ArcMind Data", providerWallet: W,
    sampleIn: '{ "asset": "BTC" }', response: '{ "oi": "1241.3M", "fundingRate": "+0.032%/h", "trend": "expanding" }', status: "active", calls: 0 },
  { id: "svc_arc_signal_poly", workspaceId: "agora", name: "Polymarket Sentiment Feed", category: "data",
    description: "YES probability for top macro events on Polymarket — aggregated signal for ArcMind decision engine.",
    priceUsd: 0.001, currency: "USDC", network: "arc-testnet", provider: "ArcMind Data", providerWallet: W2,
    sampleIn: '{ "market": "fed-rate-cut-jun" }', response: '{ "yesPct": 62, "volume24h": "840000", "trend": "rising" }', status: "active", calls: 0 },
  { id: "svc_arc_signal_news", workspaceId: "agora", name: "News Sentiment Oracle", category: "data",
    description: "Aggregated sentiment score from 200+ crypto news sources — paid per-query via Arc Nanopayments.",
    priceUsd: 0.005, currency: "USDC", network: "arc-testnet", provider: "ArcMind Intel", providerWallet: W,
    sampleIn: '{ "asset": "BTC", "window": "1h" }', response: '{ "score": 0.42, "articles": 87, "topSignal": "ETF_inflows" }', status: "active", calls: 0 },
  { id: "svc_arc_signal_whale", workspaceId: "agora", name: "On-Chain Whale Tracker", category: "data",
    description: "Net wallet flows >$100k in the last hour across Arc, Base, and Arbitrum.",
    priceUsd: 0.003, currency: "USDC", network: "arc-testnet", provider: "ArcMind Intel", providerWallet: W2,
    sampleIn: '{ "asset": "ETH", "window": "1h" }', response: '{ "netFlow": "+24.3M", "wallets": 12, "direction": "accumulating" }', status: "active", calls: 0 },
  { id: "svc_arc_reasoning", workspaceId: "agora", name: "Reasoning Trace Marketplace", category: "inference",
    description: "Buy ArcMind step-by-step decision logs via Arc Nanopayments. Each trace includes signal inputs, Kelly sizing, and outcome.",
    priceUsd: 0.01, currency: "USDC", network: "arc-testnet", provider: "ArcMind Core", providerWallet: W,
    sampleIn: '{ "traceId": "trace-001" }', response: '{ "signal": "RSI(14)=28, OI spike", "decision": "LONG BTC 18%", "rationale": "Kelly f*=0.18, edge=0.62", "outcome": "+14.3%" }', status: "active", calls: 0 },
  { id: "svc_arc_copytrade", workspaceId: "agora", name: "Copy ArcMind — ERC-8183 Escrow", category: "trading",
    description: "Open a copy-trade position under ArcMind. Stake USDC into CopyTradeEscrow.sol; agent allocates and settles PnL automatically.",
    priceUsd: 1.00, currency: "USDC", network: "arc-testnet", provider: "ArcMind Escrow", providerWallet: W2,
    sampleIn: '{ "stake": "10.00", "strategy": "ArcMind ETH/USDC", "source": "/api/arc-decisions" }', response: '{ "positionId": "pos_…", "escrow": "0xArcMindEscrow", "killThreshold": "15%", "performanceFee": "5%" }', status: "active", calls: 0 },
];

export const agentRaw: AgentRaw = {
  id: "agent_arc_arb", workspaceId: "agora", name: "ArcMind Agent", wallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
  autoPay: true, dailyLimitUsd: 20, maxPerRequestUsd: 1.00, spentTodayUsd: 0,
  allowlist: ["svc_arc_oracle", "svc_arc_arb", "svc_arc_portfolio", "svc_arc_signal_hl", "svc_arc_signal_poly", "svc_arc_signal_news", "svc_arc_signal_whale", "svc_arc_reasoning", "svc_arc_copytrade"],
};

export const seedRows: SeedRow[] = [];


