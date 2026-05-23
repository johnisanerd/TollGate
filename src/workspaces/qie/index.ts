import { QieLogo } from "../../components/logos/ProjectLogos";
import type { Workspace } from "../../types";
import type { AgentRaw, SeedRow, SRaw } from "../_types";

const W = "0xF4BFd93061B160Fa376c7F66De207a00225B4e70";
const W2 = "0xA8302734081F26b8a3E42f90DCf07b3E063441de";

export const workspace: Workspace = {
  id: "qie",
  shortName: "QIE",
  name: "QIE Agent Payment Gateway",
  route: "/qie",
  pitch: "Merchants list paid AI/API services; agents settle through the QIE payment rail with QIE Pass gating.",
  tags: ["DeFi Payments", "AI + Web3", "Gaming", "Creator Hub", "Oracle Feed"],
  networks: ["qie-mainnet", "qie-testnet"],
  tabs: ["Overview", "Merchant Checkout", "QIE Wallet", "QIE Pass", "Oracle Feed", "Agent Credit", "Game Store", "Creator Hub"],
  accent: "#00C389",
  darkAccent: "#2EE3A8",
  overviewClass: "qie",
  overviewAccents: ["#00c389","#facc15","#38bdf8","#fb7185","#a3e635","#2dd4bf","#f97316"],
  Icon: QieLogo,
};

export const rawServices: SRaw[] = [
  { id: "svc_qie_checkout", workspaceId: "qie", name: "QIE Merchant Checkout API", category: "payment",
    description: "Creates a paid checkout intent for a merchant resource; agents settle through the QIE rail.",
    priceUsd: 0.01, currency: "native", network: "qie-testnet", provider: "QIE Merchant Tools", providerWallet: W,
    sampleIn: '{ "sku": "report-pro", "qty": 1 }', response: '{ "intent": "ci_…", "payTo": "0x…", "amount": "1.00" }', status: "active", calls: 2210 },
  { id: "svc_qie_dex", workspaceId: "qie", name: "QIEDEX Data API", category: "data",
    description: "Live QIEDEX pool data: depth, fees, recent trades, TWAP — billed per query.",
    priceUsd: 0.02, currency: "native", network: "qie-testnet", provider: "QIEDEX", providerWallet: W2,
    sampleIn: '{ "pair": "QIE/USDT" }', response: '{ "twap": "0.0421", "depth1pct": "84,200", "fee": "0.30%" }', status: "active", calls: 1502 },
  { id: "svc_qie_pass", workspaceId: "qie", name: "QIE Pass-Gated API", category: "data",
    description: "A premium endpoint that requires a valid QIE Pass to identify the merchant/user before serving data.",
    priceUsd: 0.03, currency: "native", network: "qie-testnet", provider: "QIE Pass", providerWallet: W,
    sampleIn: '{ "pass": "qp_…", "resource": "vip-feed" }', response: '{ "tier": "gold", "data": {} }', status: "paused", calls: 210 },
  { id: "svc_qie_payout", workspaceId: "qie", name: "QIE Merchant Payout API", category: "payment",
    description: "Settles accumulated checkout balances to a merchant wallet on the QIE rail; one receipt per payout run.",
    priceUsd: 0.005, currency: "native", network: "qie-testnet", provider: "QIE Merchant Tools", providerWallet: W2,
    sampleIn: '{ "merchant": "0x…", "min": "5.00" }', response: '{ "payoutId": "po_…", "amount": "42.10", "nextRun": "Fri 18:00" }', status: "active", calls: 612 },
  { id: "svc_qie_pos", workspaceId: "qie", name: "QIE POS Plugin Feed", category: "data",
    description: "Inventory + price feed the QIE POS plugin polls so storefronts stay in sync. Billed per poll.",
    priceUsd: 0.002, currency: "native", network: "qie-testnet", provider: "QIE Merchant Tools", providerWallet: W,
    sampleIn: '{ "store": "st_91" }', response: '{ "items": 142, "rev": "v8821", "updatedAt": "…" }', status: "active", calls: 3100 },
];

export const agentRaw: AgentRaw = {
  id: "agent_qie_merchant_bot", workspaceId: "qie", name: "Merchant Bot", wallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
  autoPay: true, dailyLimitUsd: 6, maxPerRequestUsd: 0.05, spentTodayUsd: 0.18,
  allowlist: ["svc_qie_checkout", "svc_qie_dex", "svc_qie_payout", "svc_qie_pos"],
};

export const seedRows: SeedRow[] = [
  { ws: "qie", svc: "svc_qie_checkout", agent: "agent_qie_merchant_bot", mins: 8, status: "verified",
    kind: "qie.checkout", name: "QIE Checkout · report-pro", payload: { sku: "report-pro", qty: 1, amount: "1.00", intent: "ci_8f21a", payTo: "0x44de…91" } },
  { ws: "qie", svc: "svc_qie_dex", agent: "agent_qie_merchant_bot", mins: 33, status: "verified" },
  { ws: "qie", svc: "svc_qie_checkout", agent: "agent_qie_merchant_bot", mins: 51, status: "verified",
    kind: "qie.checkout", name: "QIE Checkout · swap-bundle", payload: { sku: "swap-bundle", qty: 3, amount: "0.30", intent: "ci_3b07c", payTo: "0x44de…91" } },
  { ws: "qie", svc: "svc_qie_pass", agent: "agent_qie_merchant_bot", mins: 70, status: "verified",
    kind: "qie.pass", name: "QIE Pass · vip-feed", payload: { pass: "qp_gold_44de", resource: "vip-feed", tier: "gold" } },
  { ws: "qie", svc: "svc_qie_pos", agent: "agent_qie_merchant_bot", mins: 88, status: "verified" },
  { ws: "qie", svc: "svc_qie_checkout", agent: "agent_qie_merchant_bot", mins: 130, status: "verified",
    kind: "qie.checkout", name: "QIE Checkout · inference-job", payload: { sku: "inference-job", qty: 1, amount: "0.05", intent: "ci_1d4e9", payTo: "0x44de…91" } },
];
