// src/workspaces/sui/docs.ts
import type { DocsModule } from "../_docs";

export const docs: DocsModule = {
  sections: [
    {
      id: "overview",
      label: "Overview",
      blocks: [
        { kind: "heading", text: "Sui agent payments & storage" },
        { kind: "prose", text: "The Sui workspace gives an AI agent a complete toolkit on Sui: Walrus decentralised storage, Seal threshold encryption, zkLogin privacy, DeepBook yield escrow, and a drag-and-drop PTB (Programmable Transaction Block) builder." },
        { kind: "list", items: [
          "Walrus storage — pin agent memory blobs with Walrus, content-addressed and verifiable.",
          "Seal encryption — threshold-encrypt payloads; decrypt only with the matching receipt key.",
          "zkLogin — privacy-preserving login using OAuth credentials anchored to a Sui address.",
          "DeepBook escrow — lock yield until delivery is confirmed, with real epoch-based settlement.",
          "PTB builder — drag-and-drop compose multi-step Sui transactions without writing Move code.",
        ] },
        { kind: "callout", tone: "info", text: "The Sui workspace targets Sui Mainnet. Use the Sui faucet for testnet tokens." },
      ],
    },
    {
      id: "quickstart",
      label: "Quickstart",
      blocks: [
        { kind: "heading", text: "Pin a memory blob and create an escrow" },
        { kind: "prose", text: "Pin agent memory to Walrus, then lock USDC in a DeepBook escrow pending delivery." },
        { kind: "code", lang: "bash", caption: "1 - Pin a blob to Walrus", code: "curl -X POST /api/sui/storage/pin \\\n  -d '{\"data\":\"base64...\",\"mimeType\":\"application/json\"}'" },
        { kind: "code", lang: "bash", caption: "2 - Create a yield escrow", code: "# Use the DeepBook Yield Escrow widget — fill counterparty, SUI amount, epoch deadline" },
        { kind: "callout", tone: "success", text: "The blob hash and escrow object ID are returned — share them with the counterparty as proof." },
      ],
    },
    {
      id: "core-concepts",
      label: "Core Concepts",
      blocks: [
        { kind: "heading", text: "Core concepts" },
        { kind: "heading", level: 3, text: "Walrus decentralised storage" },
        { kind: "prose", text: "Walrus stores blobs across a network of storage nodes using erasure coding. Each blob gets a content hash — the same data always hashes to the same blob ID." },
        { kind: "heading", level: 3, text: "Seal threshold encryption" },
        { kind: "prose", text: "Seal splits a decryption key into shares held by multiple nodes. A payload is decryptable only when a quorum provides their share — useful for access-gated agent memory." },
        { kind: "heading", level: 3, text: "zkLogin" },
        { kind: "prose", text: "zkLogin lets users authenticate with an OAuth provider (Google, Twitch) and receive a Sui address without exposing private keys. The current epoch and a salt bind the login to Sui's clock." },
        { kind: "heading", level: 3, text: "DeepBook yield escrow" },
        { kind: "prose", text: "DeepBook's escrow locks SUI or USDC for a fixed epoch period. Interest accumulates on-chain; the principal plus yield is released when both parties confirm delivery." },
        { kind: "heading", level: 3, text: "PTB builder" },
        { kind: "prose", text: "Programmable Transaction Blocks let you compose multiple Move calls, object transfers, and coin merges into a single atomic transaction. The builder UI converts drag-and-drop blocks into a ready-to-sign PTB." },
      ],
    },
    {
      id: "api-reference",
      label: "API Reference",
      blocks: [
        { kind: "heading", text: "Contracts & RPC" },
        { kind: "prose", text: "Sui uses on-chain contracts and Move modules. No dedicated HTTP API — interactions go through the Sui RPC or the PTB builder." },
        { kind: "table", headers: ["Contract/Module", "Purpose"], rows: [
          ["AgentNFT (Move)", "Agent identity and reputation NFT minted on Sui."],
          ["DeepBookEscrow (Move)", "Epoch-based yield escrow for SUI and USDC."],
          ["WalrusStorage (off-chain)", "Content-addressed blob storage via the Walrus network."],
          ["SealEncryption (Move)", "Threshold-key encryption for sealed agent payloads."],
          ["zkLogin (Sui system)", "OAuth-anchored privacy login without exposing private keys."],
        ] },
        { kind: "callout", tone: "warn", text: "Move package IDs change on each deploy. Always resolve the current ID from the Sui explorer before interacting." },
      ],
    },
    {
      id: "architecture",
      label: "Architecture",
      blocks: [
        { kind: "heading", text: "Architecture" },
        { kind: "table", headers: ["Layer", "Responsibility"], rows: [
          ["Frontend", "Walrus pin, Seal vault, zkLogin panel, DeepBook escrow, PTB builder, NFT reputation."],
          ["Sui L1", "Move contracts — NFT mint, escrow logic, zkLogin epoch check."],
          ["Walrus network", "Distributed blob storage — erasure-coded, content-addressed."],
          ["Seal nodes", "Threshold key shares — quorum required to decrypt sealed payloads."],
        ] },
        { kind: "code", lang: "text", caption: "Memory pin + escrow flow", code: "agent pins memory blob to Walrus\n  -> blob hash stored in AgentNFT metadata\n  -> counterparty verifies hash\n  -> DeepBook escrow releases yield on confirmation" },
      ],
    },
    {
      id: "security",
      label: "Security",
      blocks: [
        { kind: "heading", text: "Security model" },
        { kind: "list", items: [
          "Walrus content addressing — the blob hash is the identity; tampered data produces a different hash.",
          "Seal quorum — decryption requires a quorum of nodes; no single node can decrypt alone.",
          "zkLogin epoch binding — login proofs expire after each Sui epoch (~24 h); stale proofs are rejected.",
          "NFT-gated reputation — agent reputation is stored on-chain in an NFT; off-chain overrides are impossible.",
          "PTB atomicity — a PTB either fully executes or fully reverts; partial state is never committed.",
        ] },
      ],
    },
    {
      id: "troubleshooting",
      label: "Troubleshooting",
      blocks: [
        { kind: "heading", text: "Troubleshooting" },
        { kind: "table", headers: ["Symptom", "Cause & fix"], rows: [
          ["Walrus pin fails", "Blob size exceeds limit or storage node offline — retry with smaller payload."],
          ["Seal decrypt fails", "Quorum not reached — not enough Seal nodes responded; retry after a few seconds."],
          ["zkLogin proof rejected", "Epoch has advanced — regenerate the zkLogin proof with the current epoch."],
          ["Escrow not releasing", "Epoch deadline not reached — check the current Sui epoch in the explorer."],
          ["PTB simulation fails", "A Move call in the block failed — check the error message on the individual step."],
        ] },
      ],
    },
  ],
};
