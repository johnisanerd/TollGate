// src/workspaces/arbitrum/docs.ts
import type { DocsModule } from "../_docs";

export const docs: DocsModule = {
  sections: [
    {
      id: "overview",
      label: "Overview",
      blocks: [
        { kind: "heading", text: "Arbitrum USDC & Escrow" },
        { kind: "prose", text: "The Arbitrum workspace is the settlement layer for USDC payments and agent escrow. It provides low-cost ERC-20 USDC transfers on Arbitrum One, delivery-gated escrow contracts, real-time Orbit chain monitoring, Stylus (Rust) smart contracts, and ERC-7683 cross-chain intent settlement." },
        { kind: "list", items: [
          "USDC transfers — ERC-20 transfers on Arbitrum One and Sepolia.",
          "Escrow — hold funds until delivery, then release or refund.",
          "Orbit chains — monitor sequencer and bridge health for downstream chains.",
          "Stylus contracts — Rust-compiled smart contracts running on Arbitrum.",
          "Intent settlement — ERC-7683 cross-chain intents via the AgentIntentSettler.",
        ] },
        { kind: "callout", tone: "info", text: "Connect your wallet and switch to Arbitrum One or Sepolia to use all features." },
      ],
    },
    {
      id: "quickstart",
      label: "Quickstart",
      blocks: [
        { kind: "heading", text: "Send USDC and create an escrow" },
        { kind: "prose", text: "Fund an address on Arbitrum and use the USDC transfer widget to send, then open the Escrow tab to lock funds until delivery is confirmed." },
        { kind: "code", lang: "bash", caption: "Send USDC via the widget", code: "# Use the USDC Transfer tab — fill recipient, amount, confirm in MetaMask" },
        { kind: "code", lang: "bash", caption: "Create an escrow", code: "# Use the Escrow tab — set amount, counterparty, deadline, then Deploy" },
        { kind: "callout", tone: "success", text: "The escrow address is shown after deployment. Share it with the counterparty." },
      ],
    },
    {
      id: "core-concepts",
      label: "Core Concepts",
      blocks: [
        { kind: "heading", text: "Core concepts" },
        { kind: "heading", level: 3, text: "USDC on Arbitrum" },
        { kind: "prose", text: "ERC-20 USDC transfers settled on Arbitrum One (42161) or Sepolia (421614). Fees are a fraction of Ethereum mainnet." },
        { kind: "heading", level: 3, text: "Agent escrow" },
        { kind: "prose", text: "The AgentEscrow contract holds USDC until the deployer confirms delivery or the deadline expires. A dispute window allows either side to flag disagreement." },
        { kind: "heading", level: 3, text: "Orbit chains" },
        { kind: "prose", text: "Arbitrum Orbit lets teams launch application-specific L3s. The monitoring panel tracks sequencer lag, bridge health, and batch submission timing." },
        { kind: "heading", level: 3, text: "Stylus (Rust contracts)" },
        { kind: "prose", text: "Stylus compiles Rust (and other WASM-compatible languages) to contracts that run natively on Arbitrum. The snippet viewer shows payment-handling patterns." },
      ],
    },
    {
      id: "api-reference",
      label: "API Reference",
      blocks: [
        { kind: "heading", text: "Contracts & RPC" },
        { kind: "prose", text: "Arbitrum uses on-chain contracts rather than a dedicated HTTP API. Interact via ethers.js or the widgets." },
        { kind: "table", headers: ["Contract", "Network", "Address"], rows: [
          ["AgentEscrow", "Sepolia", "0x990Fe8e3f7d59148593D9B174a70F2Cd79C7bBc7"],
          ["AgentEscrow", "One", "0x1dF5382BDb63537cd731A8e3Ee09eF10EA4179a3"],
          ["ServiceRegistry", "One", "0x8403F655Cb8750012D443c135840185691039236"],
          ["AgentBudget", "One", "0x68c17e2e69DD79651457D440B5f5DCE77B9ad732"],
          ["IntentSettler", "Sepolia", "0x5E870A75059AfEF6D310bcCD8EdC7BaAa2535620"],
        ] },
        { kind: "callout", tone: "warn", text: "Always verify contract addresses against src/workspaces/arbitrum/widgets.tsx before mainnet use." },
      ],
    },
    {
      id: "architecture",
      label: "Architecture",
      blocks: [
        { kind: "heading", text: "Architecture" },
        { kind: "table", headers: ["Layer", "Responsibility"], rows: [
          ["Frontend widgets", "USDC transfer, escrow panel, Orbit monitor, Stylus viewer, intent widget."],
          ["Arbitrum One", "Production USDC settlement, ServiceRegistry, AgentBudget."],
          ["Arbitrum Sepolia", "Testnet — AgentEscrow and IntentSettler for development."],
          ["Orbit L3s", "App-specific chains feeding into Arbitrum's sequencer and bridge."],
        ] },
        { kind: "code", lang: "text", caption: "Escrow flow", code: "deploy escrow -> counterparty delivers\n              -> deployer confirms -> USDC released\n              -> or deadline passes -> refund\n              -> or either side disputes -> manual resolution" },
      ],
    },
    {
      id: "security",
      label: "Security",
      blocks: [
        { kind: "heading", text: "Security model" },
        { kind: "list", items: [
          "Non-custodial escrow — funds stay in the contract; neither party can withdraw unilaterally before resolution.",
          "Deadline enforcement — the contract enforces release or refund timing on-chain; no server trust needed.",
          "Spend rules — per-agent allowlists and daily caps enforced by AgentBudget before any payment.",
          "Dispute window — a configurable period allows either side to raise a dispute before auto-release.",
          "Testnet isolation — Sepolia contracts are separate; testnet keys cannot touch mainnet funds.",
        ] },
      ],
    },
    {
      id: "troubleshooting",
      label: "Troubleshooting",
      blocks: [
        { kind: "heading", text: "Troubleshooting" },
        { kind: "table", headers: ["Symptom", "Cause & fix"], rows: [
          ["Escrow deploy fails", "Insufficient USDC allowance — approve the escrow contract first in your wallet."],
          ["Transfer rejected by wallet", "Wrong network — switch to Arbitrum One or Sepolia in MetaMask."],
          ["Orbit bridge shows degraded", "Sequencer lag or L1 congestion — check Arbiscan for recent batch submissions."],
          ["Stylus snippet not loading", "RPC endpoint rate-limited — the snippet viewer falls back to static code after 3 retries."],
          ["Intent settlement pending", "Cross-chain message delay — ERC-7683 intents settle after L1 finality, typically 15-30 min."],
        ] },
      ],
    },
  ],
};
