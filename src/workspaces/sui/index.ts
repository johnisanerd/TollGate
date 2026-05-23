import { SuiLogo } from "../../components/logos/ProjectLogos";
import type { Workspace } from "../../types";
import type { AgentRaw, SeedRow, SRaw } from "../_types";

const W = "0x0E437c109A4C1e15172c4dA557E77724D7243F71";
const W2 = "0xF4BFd93061B160Fa376c7F66De207a00225B4e70";

export const workspace: Workspace = {
  id: "sui",
  shortName: "Sui",
  name: "SuiAgent OS — Agent Economy",
  route: "/sui",
  pitch: "The first Agent Economy OS on Sui: agents hire agents via x402, escrow funds earn DeepBook yield, receipts live on Walrus, reputation is a living NFT, and any website gets AI payments with one script tag.",
  tags: ["DeepBook Escrow", "Walrus Storage", "Seal Encryption", "Intent Engine", "Pay Widget"],
  networks: ["sui-mainnet", "sui-testnet"],
  tabs: ["Overview", "Agent Wallet", "Walrus Storage", "Move Contracts", "NFT Market", "Yield Escrow", "Agent Arena", "Pay Widget", "Memory Network", "Intent Engine", "Receipts"],
  accent: "#4DA2FF",
  darkAccent: "#80BFFF",
  overviewClass: "sui",
  overviewAccents: ["#4da2ff","#7dd3fc","#a78bfa","#22d3ee","#f0abfc","#60a5fa","#38bdf8"],
  Icon: SuiLogo,
};

export const rawServices: SRaw[] = [
  { id: "svc_sui_walrus_pin", workspaceId: "sui", name: "Walrus Storage Pin", category: "storage",
    description: "Pins a blob to Walrus decentralised storage on Sui; returns the blob ID and storage epoch receipt.",
    priceUsd: 0.02, currency: "SUI", network: "sui-mainnet", provider: "Walrus Protocol", providerWallet: W,
    sampleIn: '{ "data": "base64…", "epochs": 3 }', response: '{ "blobId": "wl_4a1c2b07", "storageTx": "0x…", "expiresEpoch": 412 }', status: "active", calls: 1840 },
  { id: "svc_sui_move_exec", workspaceId: "sui", name: "Move Contract Executor", category: "inference",
    description: "Builds and dry-runs a Move PTB (programmable transaction block) on Sui mainnet, returns the effects without committing.",
    priceUsd: 0.015, currency: "SUI", network: "sui-mainnet", provider: "Sui Agent Economy", providerWallet: W2,
    sampleIn: '{ "module": "escrow", "fn": "open", "args": ["0x…","100"] }', response: '{ "status": "success", "gasCost": "1250000 MIST", "effects": "…" }', status: "active", calls: 970 },
  { id: "svc_sui_nft_mint", workspaceId: "sui", name: "NFT Mint API", category: "nft",
    description: "Mints a Sui Kiosk-compatible NFT for an agent identity or access-pass. One receipt per mint.",
    priceUsd: 0.03, currency: "SUI", network: "sui-mainnet", provider: "Sui Agent Economy", providerWallet: W,
    sampleIn: '{ "collection": "AgentPass", "meta": { "tier": "gold" } }', response: '{ "nftId": "0x91aa…", "kiosk": "0xee71…", "txDigest": "DkP…" }', status: "active", calls: 620 },
  { id: "svc_sui_agent_id", workspaceId: "sui", name: "Agent Identity Resolver", category: "data",
    description: "Resolves a Sui agent wallet address to its on-chain identity NFT, reputation score, and allowlist.",
    priceUsd: 0.005, currency: "SUI", network: "sui-mainnet", provider: "Sui Agent Economy", providerWallet: W2,
    sampleIn: '{ "address": "0x4da2…" }', response: '{ "agentId": "ap_gold_4da2", "tier": "gold", "rep": 92, "allowlist": ["svc_sui_walrus_pin"] }', status: "active", calls: 2300 },
  { id: "svc_sui_zkproof", workspaceId: "sui", name: "zkLogin Proof API", category: "inference",
    description: "Generates a zkLogin proof bundle for a Google/Apple OAuth token so agents can authenticate without a seed phrase.",
    priceUsd: 0.01, currency: "SUI", network: "sui-mainnet", provider: "Sui zkLogin Labs", providerWallet: W,
    sampleIn: '{ "jwt": "eyJ…", "salt": "0x…" }', response: '{ "proof": "…", "address": "0x4da2…", "maxEpoch": 420 }', status: "active", calls: 1100 },
  { id: "svc_sui_yield_escrow", workspaceId: "sui", name: "DeepBook Yield Escrow", category: "payment",
    description: "Locks payment in escrow, deploys funds to a DeepBook LP while the task runs, then releases principal + earned yield on delivery verification.",
    priceUsd: 0.025, currency: "SUI", network: "sui-mainnet", provider: "SuiAgent OS Escrow", providerWallet: W2,
    sampleIn: '{ "amount": "1.0", "taskId": "task_…", "lpPool": "SUI/USDC" }', response: '{ "escrowId": "esc_…", "lpPos": "lp_…", "yieldApy": "8.4%", "state": "earning" }', status: "active", calls: 480 },
  { id: "svc_sui_battle", workspaceId: "sui", name: "Agent Arena Challenge", category: "nft",
    description: "Registers an agent for an Arena challenge; judged by Nautilus TEE. Winners earn a Legendary AgentNFT and reward distribution.",
    priceUsd: 0.05, currency: "SUI", network: "sui-mainnet", provider: "SuiAgent Arena", providerWallet: W,
    sampleIn: '{ "agentId": "ap_gold_…", "challengeId": "ch_…", "solutionBlob": "wl_…" }', response: '{ "entryId": "en_…", "rank": null, "judgeAt": "epoch+12" }', status: "active", calls: 215 },
  { id: "svc_sui_pay_widget", workspaceId: "sui", name: "Sui Pay Button API", category: "payment",
    description: "One-tag drop-in payment widget for any website; handles zkLogin, gas sponsorship and x402 agent call in a single user interaction.",
    priceUsd: 0.001, currency: "SUI", network: "sui-mainnet", provider: "SuiAgent OS", providerWallet: W2,
    sampleIn: '{ "agent": "analyzer.sui", "price": "0.01", "asset": "USDC" }', response: '{ "widgetId": "wgt_…", "snippet": "<sui-pay …>", "sessionUrl": "https://…" }', status: "active", calls: 3750 },
  { id: "svc_sui_memory_write", workspaceId: "sui", name: "Agent Memory Write (Walrus)", category: "storage",
    description: "Encrypts an agent context blob with Seal and pins it to Walrus; returns the blob ID and Seal policy address.",
    priceUsd: 0.018, currency: "SUI", network: "sui-mainnet", provider: "SuiAgent Memory Network", providerWallet: W,
    sampleIn: '{ "agentId": "ag_…", "key": "client_ctx", "payload": { } }', response: '{ "blobId": "wl_mem_…", "sealPolicy": "0x…", "expiresEpoch": 820 }', status: "active", calls: 920 },
  { id: "svc_sui_intent", workspaceId: "sui", name: "Intent Engine — NL→PTB", category: "inference",
    description: "Parses a natural-language workflow description into a composable multi-agent PTB; deploys it as an autonomous on-chain job.",
    priceUsd: 0.04, currency: "SUI", network: "sui-mainnet", provider: "SuiAgent Intent Engine", providerWallet: W2,
    sampleIn: '{ "intent": "DCA $50 weekly into SUI, notify via email" }', response: '{ "jobId": "job_…", "agents": ["dca-agent.sui","notify-agent.sui"], "ptbSteps": 4, "nextRun": "epoch+168" }', status: "active", calls: 340 },
];

export const agentRaw: AgentRaw = {
  id: "agent_sui_economy", workspaceId: "sui", name: "Sui Economy Agent", wallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
  autoPay: true, dailyLimitUsd: 10, maxPerRequestUsd: 0.15, spentTodayUsd: 0.74,
  allowlist: ["svc_sui_walrus_pin", "svc_sui_move_exec", "svc_sui_nft_mint", "svc_sui_agent_id", "svc_sui_zkproof"],
};

export const seedRows: SeedRow[] = [
  { ws: "sui", svc: "svc_sui_walrus_pin", agent: "agent_sui_economy", mins: 7, status: "verified",
    kind: "sui.walrus.pin", name: "Walrus Storage · agent-snapshot.json", payload: { blobId: "wl_4a1c2b07d93f", name: "agent-snapshot.json", size: 184, epochs: 3, tx: "DkPxyz1234567890abcde" } },
  { ws: "sui", svc: "svc_sui_move_exec", agent: "agent_sui_economy", mins: 24, status: "verified",
    kind: "sui.move.exec", name: "Move PTB · escrow::open", payload: { module: "escrow", fn: "open", args: '["0x7a3f…D2f","100000000"]', gas: "1250000 MIST", effects: '{"status":"success"}' } },
  { ws: "sui", svc: "svc_sui_nft_mint", agent: "agent_sui_economy", mins: 48, status: "verified",
    kind: "sui.nft.mint", name: "NFT Mint · Silver Agent Pass", payload: { nftId: "0xee7191aa4da2", tier: "silver", collection: "AgentPass", to: "0x0E437c109A4C1e15172c4dA557E77724D7243F71" } },
  { ws: "sui", svc: "svc_sui_zkproof", agent: "agent_sui_economy", mins: 75, status: "verified",
    kind: "sui.zklogin", name: "zkLogin Proof · Google", payload: { provider: "Google", address: "0x4da2f91a3b7c…", maxEpoch: 428 } },
  { ws: "sui", svc: "svc_sui_agent_id", agent: "agent_sui_economy", mins: 130, status: "verified" },
  { ws: "sui", svc: "svc_sui_walrus_pin", agent: "agent_sui_economy", mins: 200, status: "expired", err: "challenge_expired" },
];
