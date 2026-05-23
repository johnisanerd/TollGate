// src/workspaces/polygon/docs.ts
import type { DocsModule } from "../_docs";

export const docs: DocsModule = {
  sections: [
    {
      id: "overview",
      label: "Overview",
      blocks: [
        { kind: "heading", text: "Polygon zkEVM commerce" },
        { kind: "prose", text: "The Polygon workspace is built for high-throughput merchant payments and UAE trade-finance flows settled in USDC on Polygon zkEVM. Agents act as merchant bots — making micro-payments, tokenising invoices, and routing cross-border remittances with sub-cent fees." },
        { kind: "list", items: [
          "Merchant onboarding — publish a paid API endpoint in under 30 seconds.",
          "Trade finance — tokenise SME invoices and receive a 90% USDC advance.",
          "Cross-border remittance — AED ↔ USDC corridors at $0.05/call.",
          "Agent marketplace — discover and pay Polygon-native services via x402.",
          "USDC settlement — all payments settle on-chain via Polygon zkEVM.",
        ] },
        { kind: "callout", tone: "info", text: "Switch to Polygon zkEVM Mainnet (chainId 1101) or Cardona Testnet (chainId 2442) in your wallet." },
      ],
    },
    {
      id: "quickstart",
      label: "Quickstart",
      blocks: [
        { kind: "heading", text: "Publish a paid API and make your first call" },
        { kind: "prose", text: "Register your endpoint as a TollGate service, then call it — the x402 handshake handles payment automatically." },
        { kind: "code", lang: "bash", caption: "1 - Register a service endpoint", code: "curl -X POST /api/services \\\n  -d '{\"name\":\"My API\",\"endpoint\":\"https://api.example.com/v1\",\"priceUsd\":0.01,\"network\":\"polygon\"}'" },
        { kind: "code", lang: "bash", caption: "2 - Call the service (x402 auto-pay)", code: "curl -H 'X-Payment-Token: <wallet-sig>' \\\n  https://tollgate.example.com/api/my-api" },
        { kind: "callout", tone: "success", text: "Payment is deducted from the agent treasury and a receipt is produced automatically." },
      ],
    },
    {
      id: "core-concepts",
      label: "Core Concepts",
      blocks: [
        { kind: "heading", text: "Core concepts" },
        { kind: "heading", level: 3, text: "TollGate merchant mode" },
        { kind: "prose", text: "Any HTTP endpoint can become a paid API: paste the URL, set a price in USDC, and TollGate generates a proxied URL that enforces payment before forwarding the request." },
        { kind: "heading", level: 3, text: "Trade finance desk" },
        { kind: "prose", text: "SME invoices are tokenised as on-chain claims. The platform advances 90% of the invoice value in USDC — the remaining 10% is held until the buyer settles." },
        { kind: "heading", level: 3, text: "Cross-border remittance" },
        { kind: "prose", text: "UAE corridors convert AED to USDC at a fixed $0.05/call rate using Polygon's low-cost settlement. Volume thresholds reduce the per-call fee." },
        { kind: "heading", level: 3, text: "x402 agent marketplace" },
        { kind: "prose", text: "Agents discover services via the marketplace registry, check reputation scores, and pay via x402 — all in a single signed request." },
      ],
    },
    {
      id: "api-reference",
      label: "API Reference",
      blocks: [
        { kind: "heading", text: "API Reference" },
        { kind: "prose", text: "Polygon uses the shared TollGate gateway and on-chain contracts. No dedicated server routes — all settlement is on-chain." },
        { kind: "table", headers: ["Contract", "Network", "Purpose"], rows: [
          ["TollGate Proxy", "zkEVM Mainnet", "Routes paid API calls and enforces x402 payment."],
          ["USDC (Bridged)", "zkEVM Mainnet", "Settlement token for all payments."],
          ["Merchant Registry", "zkEVM Mainnet", "Stores merchant profiles and service listings."],
        ] },
        { kind: "callout", tone: "warn", text: "Contact addresses are in src/workspaces/polygon/widgets.tsx. Verify before mainnet use." },
      ],
    },
    {
      id: "architecture",
      label: "Architecture",
      blocks: [
        { kind: "heading", text: "Architecture" },
        { kind: "table", headers: ["Layer", "Responsibility"], rows: [
          ["Frontend", "Merchant onboarding, trade finance desk, USDC remittance, marketplace discovery."],
          ["Polygon zkEVM", "USDC settlement, merchant registry, x402 payment enforcement."],
          ["TollGate gateway", "Proxy layer — validates payment token and forwards request."],
          ["Agent bot", "Autonomous merchant — discovers services, pays, records receipts."],
        ] },
        { kind: "code", lang: "text", caption: "Merchant payment flow", code: "client calls TollGate URL\n  -> gateway checks payment token\n  -> forwards to merchant endpoint\n  -> deducts USDC from agent treasury\n  -> issues receipt" },
      ],
    },
    {
      id: "security",
      label: "Security",
      blocks: [
        { kind: "heading", text: "Security model" },
        { kind: "list", items: [
          "Payment-before-forward — the gateway never forwards a request unless a valid payment token is attached.",
          "Agent treasury isolation — the agent spends only its allocated budget; user funds are never touched directly.",
          "Daily spend cap — configured per agent; enforced server-side before any forwarding.",
          "Invoice NFT locking — tokenised invoices are locked in the contract until the buyer settles.",
          "zkEVM validity proofs — all state transitions on Polygon zkEVM are proven on Ethereum L1.",
        ] },
      ],
    },
    {
      id: "troubleshooting",
      label: "Troubleshooting",
      blocks: [
        { kind: "heading", text: "Troubleshooting" },
        { kind: "table", headers: ["Symptom", "Cause & fix"], rows: [
          ["Payment token rejected", "Signature expired — regenerate the payment token (TTL is 60 s)."],
          ["Service not found", "Service not registered — add it via the Merchant tab."],
          ["Invoice advance failed", "Invoice amount below minimum threshold ($500 equivalent) — increase the invoice value."],
          ["Remittance corridor unavailable", "AED/USDC corridor offline — check Polygon bridge status."],
          ["Agent treasury empty", "Daily cap reached or treasury not funded — top up via the treasury widget."],
        ] },
      ],
    },
  ],
};
