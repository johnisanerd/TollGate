import { PolygonLogo } from "../../components/logos/ProjectLogos";
import type { Workspace } from "../../types";
import type { AgentRaw, SeedRow, SRaw } from "../_types";

const W = "0x0E437c109A4C1e15172c4dA557E77724D7243F71";
const W2 = "0xF4BFd93061B160Fa376c7F66De207a00225B4e70";

export const workspace: Workspace = {
  id: "polygon",
  shortName: "Polygon",
  name: "Polygon Agent Commerce",
  route: "/polygon",
  pitch: "SME merchants publish paid APIs in 30 seconds; agents and buyers settle per call in USDC on Polygon zkEVM — UAE commerce infrastructure.",
  tags: ["Trade Finance", "Merchant Payments", "Cross-Border", "Agent Infrastructure"],
  networks: ["polygon-zkevm", "polygon-pos"],
  tabs: ["Overview", "Merchant Mode", "Trade Finance", "Agent Marketplace", "USDC Payments", "Receipts"],
  accent: "#7B3FE4",
  darkAccent: "#9F6FF8",
  overviewClass: "polygon",
  overviewAccents: ["#7b3fe4","#ec4899","#f59e0b","#22c55e","#60a5fa","#a855f7","#14b8a6"],
  Icon: PolygonLogo,
};

export const rawServices: SRaw[] = [
  { id: "svc_poly_invoice", workspaceId: "polygon", name: "Invoice Finance API", category: "data",
    description: "Tokenises a trade invoice on Polygon and advances 90% of face value in USDC for UAE SME cash flow.",
    priceUsd: 0.10, currency: "USDC", network: "polygon-zkevm", provider: "PolyTrade Finance", providerWallet: W2,
    sampleIn: '{ "invoice": "INV-4921", "amount": "5000", "due": "2026-06-30" }', response: '{ "advance": "4500", "tokenId": "inv_4921", "tx": "0x…" }', status: "active", calls: 640 },
  { id: "svc_poly_merchant", workspaceId: "polygon", name: "Merchant Checkout API", category: "payment",
    description: "Hosted x402 checkout endpoint; buyer or agent pays USDC per call, merchant receives instantly on Polygon.",
    priceUsd: 0.01, currency: "USDC", network: "polygon-zkevm", provider: "PolyMerchant", providerWallet: W,
    sampleIn: '{ "merchant": "0x…", "amount": "0.01" }', response: '{ "receipt": "rcpt_…", "settled": true, "txHash": "0x…" }', status: "active", calls: 3100 },
  { id: "svc_poly_cross", workspaceId: "polygon", name: "Cross-Border Remittance API", category: "payment",
    description: "Settles stablecoin remittances between UAE and global corridors, converting AED stablecoin ↔ USDC via Polygon bridge.",
    priceUsd: 0.05, currency: "USDC", network: "polygon-pos", provider: "PolyRemit", providerWallet: W2,
    sampleIn: '{ "from": "AED", "to": "USDC", "amount": "1000" }', response: '{ "usdcReceived": "272.40", "fee": "0.05%", "bridgeTx": "0x…" }', status: "active", calls: 1280 },
];

export const agentRaw: AgentRaw = {
  id: "agent_poly_merchant", workspaceId: "polygon", name: "Polygon Merchant Agent", wallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
  autoPay: true, dailyLimitUsd: 15, maxPerRequestUsd: 0.25, spentTodayUsd: 0.85,
  allowlist: ["svc_poly_invoice", "svc_poly_merchant", "svc_poly_cross"],
};

export const seedRows: SeedRow[] = [
  { ws: "polygon", svc: "svc_poly_merchant", agent: "agent_poly_merchant", mins: 11, status: "verified",
    kind: "polygon.merchant", name: "Merchant Checkout · SaaS API call", payload: { endpoint: "/api/report", price: "0.01", buyer: "0x7a3f…", merchantId: "merch_4a1c" } },
  { ws: "polygon", svc: "svc_poly_invoice", agent: "agent_poly_merchant", mins: 34, status: "verified",
    kind: "polygon.invoice", name: "Trade Invoice · tokenised AED 50,000", payload: { invoiceId: "inv_2b07", amount: "50000 AED", usdcAdvance: "45000", fee: "0.1%", zkEVM: true } },
  { ws: "polygon", svc: "svc_poly_cross", agent: "agent_poly_merchant", mins: 58, status: "verified",
    kind: "polygon.remittance", name: "Cross-Border · AED → USDC", payload: { from: "AED", to: "USDC", amount: "10000", fee: "0.2%", corridor: "UAE↔Base", txHash: "0xpoly3c…" } },
  { ws: "polygon", svc: "svc_poly_merchant", agent: "agent_poly_merchant", mins: 90, status: "verified",
    kind: "polygon.merchant", name: "Merchant Checkout · 3 API calls", payload: { endpoint: "/api/data", price: "0.03", buyer: "0x0b12…", merchantId: "merch_4a1c" } },
];
