import { ArbitrumLogo } from "../../components/logos/ProjectLogos";
import type { Workspace } from "../../types";
import type { AgentRaw, SeedRow, SRaw } from "../_types";

const W = "0x990Fe8e3f7d59148593D9B174a70F2Cd79C7bBc7";
const W2 = "0x1dF5382BDb63537cd731A8e3Ee09eF10EA4179a3";

export const workspace: Workspace = {
  id: "arbitrum",
  shortName: "Arbitrum",
  name: "Arbitrum Agent Services",
  route: "/arbitrum",
  pitch: "Agents pay USDC for API/services on Arbitrum with spend limits, receipts and optional escrowed delivery.",
  tags: ["USDC Payments", "Escrow", "Orbit Monitor", "Stylus Contracts", "Budget Control"],
  networks: ["arbitrum-one", "arbitrum-sepolia"],
  tabs: ["Overview", "Agent Marketplace", "USDC Payments", "Stylus Contracts", "Escrow", "Wallet Protection"],
  accent: "#1B4ADD",
  darkAccent: "#5C7CFF",
  overviewClass: "arbitrum",
  overviewAccents: ["#1b4add","#28a0f0","#f97316","#60a5fa","#22c55e","#818cf8","#38bdf8"],
  Icon: ArbitrumLogo,
};

export const rawServices: SRaw[] = [
  { id: "svc_arb_invoice", workspaceId: "arbitrum", name: "Stablecoin Invoice API", category: "payment",
    description: "Issues a USDC invoice on Arbitrum and returns a payable challenge; provider receives stablecoin directly.",
    priceUsd: 0.02, currency: "USDC", network: "arbitrum-sepolia", provider: "Arbitrum Agent Services", providerWallet: W,
    sampleIn: '{ "memo": "API access", "amount": "0.02" }', response: '{ "invoiceId": "inv_…", "payTo": "0x…", "network": "arbitrum-sepolia" }', status: "active", calls: 870 },
  { id: "svc_arb_orbit", workspaceId: "arbitrum", name: "Orbit Chain Monitor", category: "data",
    description: "Health + risk metrics for an Orbit chain: sequencer status, batch lag, bridge flow. Billed per poll.",
    priceUsd: 0.05, currency: "USDC", network: "arbitrum-sepolia", provider: "Orbit Watchtower", providerWallet: W2,
    sampleIn: '{ "chainId": 421614 }', response: '{ "sequencer": "ok", "batchLagS": 4, "bridgeNet1h": "+12.4 ETH" }', status: "active", calls: 540 },
  { id: "svc_arb_escrow", workspaceId: "arbitrum", name: "Agent Escrow API", category: "payment",
    description: "Holds payment in escrow until the service delivery proof is posted; releases or refunds automatically.",
    priceUsd: 0.04, currency: "USDC", network: "arbitrum-sepolia", provider: "Arbitrum Agent Services", providerWallet: W,
    sampleIn: '{ "deal": "deal_…", "amount": "0.04" }', response: '{ "escrowId": "esc_…", "state": "held", "releaseOn": "deliveryProof" }', status: "active", calls: 290 },
  { id: "svc_arb_bridge", workspaceId: "arbitrum", name: "Orbit Bridge Status API", category: "data",
    description: "Per-bridge health for Orbit chains: pending withdrawals, claim delay, net flow over the last hour.",
    priceUsd: 0.02, currency: "USDC", network: "arbitrum-sepolia", provider: "Orbit Watchtower", providerWallet: W,
    sampleIn: '{ "bridge": "0x…" }', response: '{ "pending": 4, "claimDelayMin": 12, "net1hEth": "+12.4" }', status: "active", calls: 760 },
  { id: "svc_arb_usdc", workspaceId: "arbitrum", name: "USDC Settlement API", category: "payment",
    description: "Builds and tracks a USDC settlement transfer on Arbitrum; returns the calldata and a settlement receipt.",
    priceUsd: 0.01, currency: "USDC", network: "arbitrum-sepolia", provider: "Arbitrum Agent Services", providerWallet: W2,
    sampleIn: '{ "to": "0x…", "amount": "5.00" }', response: '{ "settleId": "st_…", "txHash": "0x…", "state": "confirmed" }', status: "active", calls: 1040 },
];

export const agentRaw: AgentRaw = {
  id: "agent_arb_treasury", workspaceId: "arbitrum", name: "Treasury Agent", wallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
  autoPay: true, dailyLimitUsd: 12, maxPerRequestUsd: 0.20, spentTodayUsd: 0.88,
  allowlist: ["svc_arb_invoice", "svc_arb_orbit", "svc_arb_escrow", "svc_arb_bridge", "svc_arb_usdc"],
};

export const seedRows: SeedRow[] = [
  { ws: "arbitrum", svc: "svc_arb_invoice", agent: "agent_arb_treasury", mins: 14, status: "verified" },
  { ws: "arbitrum", svc: "svc_arb_usdc", agent: "agent_arb_treasury", mins: 27, status: "verified",
    kind: "arb.usdc.transfer", name: "USDC Settlement · 5.00 USDC", payload: { to: "0x7a3f…D2f", amount: "5.00", settleId: "st_27a1c", txHash: "0x3f8c…91" } },
  { ws: "arbitrum", svc: "svc_arb_orbit", agent: "agent_arb_treasury", mins: 52, status: "verified" },
  { ws: "arbitrum", svc: "svc_arb_usdc", agent: "agent_arb_treasury", mins: 73, status: "verified",
    kind: "arb.usdc.transfer", name: "USDC Settlement · 12.50 USDC", payload: { to: "0x0b12…ee71", amount: "12.50", settleId: "st_73b07", txHash: "0x9d3a…0f" } },
  { ws: "arbitrum", svc: "svc_arb_bridge", agent: "agent_arb_treasury", mins: 99, status: "verified" },
  { ws: "arbitrum", svc: "svc_arb_escrow", agent: "agent_arb_treasury", mins: 121, status: "paid",
    kind: "arb.escrow.release", name: "Agent Escrow · released", payload: { escrowId: "esc_4a1c2", amount: "0.12", state: "released", deal: "deal_91" } },
];
