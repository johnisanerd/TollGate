import { MantleLogo } from "../../components/logos/ProjectLogos";
import type { Workspace } from "../../types";
import type { AgentRaw, SeedRow, SRaw } from "../_types";

const W = "0x4cA80A3af6e0a4E0c85AB31E3B4a86C6BffF17CB";
const W2 = "0xA8FdDb9F6f54Fbf127cb8c71049cB1e19f5836F9";

export const workspace: Workspace = {
  id: "mantle",
  shortName: "Mantle",
  name: "Mantle Agent Wallet Economy",
  route: "/mantle",
  pitch: "Agent wallets with spend policy buy Mantle alpha, mETH/USDY yield signals and RWA risk reports per call.",
  tags: ["Agent Wallets", "Yield Signals", "RWA Data", "Credit Scoring", "A2A Loop"],
  networks: ["mantle-mainnet", "mantle-sepolia"],
  tabs: ["Overview", "Agent Economy", "Alpha Data", "Yield Compare", "Yield Optimizer", "RWA Data", "Trading Strategies", "AI DevTools", "Agent Credit Score", "Budget Dashboard", "A2A Loop"],
  accent: "#0FBF7A",
  darkAccent: "#2BE39C",
  overviewClass: "mantle",
  overviewAccents: ["#0fbf7a","#f4c542","#22d3ee","#a3e635","#fb923c","#34d399","#84cc16"],
  Icon: MantleLogo,
};

export const rawServices: SRaw[] = [
  { id: "svc_mnt_rwa", workspaceId: "mantle", name: "Mantle RWA Risk API", category: "data",
    description: "Risk and yield metrics for tokenised RWA baskets on Mantle, with collateral and duration breakdown.",
    priceUsd: 0.06, currency: "USDC", network: "mantle-sepolia", provider: "Mantle Alpha Desk", providerWallet: W,
    sampleIn: '{ "basket": "T-BILL-90D" }', response: '{ "apy": "4.83%", "durationD": 84, "riskGrade": "A-" }', status: "active", calls: 660 },
  { id: "svc_mnt_meth", workspaceId: "mantle", name: "mETH / USDY Yield Signal", category: "trading",
    description: "Yield + rotation signal across mETH and USDY positions with a suggested rebalance band.",
    priceUsd: 0.10, currency: "USDC", network: "mantle-sepolia", provider: "Mantle Alpha Desk", providerWallet: W,
    sampleIn: '{ "size": "100k" }', response: '{ "rotate": "30% → USDY", "expEdge": "+0.7%", "horizonD": 14 }', status: "active", calls: 415 },
  { id: "svc_mnt_backtest", workspaceId: "mantle", name: "Strategy Backtest API", category: "inference",
    description: "Runs a backtest of a supplied strategy spec on Mantle market data. Billed per backtest run.",
    priceUsd: 0.15, currency: "USDC", network: "mantle-sepolia", provider: "Strategy Sandbox", providerWallet: W2,
    sampleIn: '{ "spec": { "rule": "…" } }', response: '{ "sharpe": 1.4, "maxDD": "-9.2%", "trades": 184 }', status: "active", calls: 122 },
  { id: "svc_mnt_liq", workspaceId: "mantle", name: "Mantle Liquidity Map", category: "data",
    description: "Liquidity depth and concentration across Mantle DEX pools, with a routing suggestion for a given size.",
    priceUsd: 0.04, currency: "USDC", network: "mantle-sepolia", provider: "Mantle Alpha Desk", providerWallet: W2,
    sampleIn: '{ "asset": "mETH", "size": "50k" }', response: '{ "topPool": "mETH/USDC", "depth1pctUsd": 880000, "route": "split 2" }', status: "active", calls: 540 },
  { id: "svc_mnt_stress", workspaceId: "mantle", name: "RWA Stress Test API", category: "inference",
    description: "Runs a rate / liquidity stress scenario on a tokenised RWA basket and returns the projected drawdown.",
    priceUsd: 0.12, currency: "USDC", network: "mantle-sepolia", provider: "Mantle Alpha Desk", providerWallet: W,
    sampleIn: '{ "basket": "T-BILL-90D", "scenario": "+200bps" }', response: '{ "navDrawdown": "-1.8%", "breachProb": 0.04 }', status: "active", calls: 96 },
];

export const agentRaw: AgentRaw = {
  id: "agent_mnt_strategist", workspaceId: "mantle", name: "Alpha Strategist", wallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
  autoPay: true, dailyLimitUsd: 15, maxPerRequestUsd: 0.30, spentTodayUsd: 0.96,
  allowlist: ["svc_mnt_rwa", "svc_mnt_meth", "svc_mnt_backtest", "svc_mnt_liq", "svc_mnt_stress"],
};

export const seedRows: SeedRow[] = [
  { ws: "mantle", svc: "svc_mnt_rwa", agent: "agent_mnt_strategist", mins: 120, status: "verified" },
  { ws: "mantle", svc: "svc_mnt_backtest", agent: "agent_mnt_strategist", mins: 180, status: "verified",
    kind: "mantle.backtest", name: "Strategy Backtest · mETH-USDY 90d", payload: { asset: "mETH/USDY", window: "90d", ret: "+12.4%", maxDD: "-6.1%", sharpe: 1.4, runId: "sim_4a1c" } },
  { ws: "mantle", svc: "svc_mnt_meth", agent: "agent_mnt_strategist", mins: 240, status: "verified" },
  { ws: "mantle", svc: "svc_mnt_backtest", agent: "agent_mnt_strategist", mins: 300, status: "verified",
    kind: "mantle.backtest", name: "Strategy Backtest · RWA-rotate 180d", payload: { asset: "T-BILL / USDY", window: "180d", ret: "+27.9%", maxDD: "-14.2%", sharpe: 1.1, runId: "sim_2b07" } },
  { ws: "mantle", svc: "svc_mnt_liq", agent: "agent_mnt_strategist", mins: 360, status: "verified" },
];
