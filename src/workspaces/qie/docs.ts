// src/workspaces/qie/docs.ts
import type { DocsModule } from "../_docs";

export const docs: DocsModule = {
  sections: [
    {
      id: "overview",
      label: "Overview",
      blocks: [
        { kind: "heading", text: "QIE merchant & credit platform" },
        { kind: "prose", text: "The QIE workspace gives merchants and AI agents a complete payment stack: checkout widgets, subscription billing, price oracle feeds, and an on-chain credit registry. All payments settle via x402 micro-transactions." },
        { kind: "list", items: [
          "POS checkout — one-tap merchant payments via NFC or QR.",
          "Subscription billing — create plans and auto-charge in USDC.",
          "Oracle feeds — live token prices gated behind x402 micro-payments.",
          "Agent credit registry — on-chain credit score for autonomous agents.",
          "Wallet management — per-agent wallet with daily spend cap.",
        ] },
        { kind: "callout", tone: "info", text: "QIE contracts are deployed on QIE testnet (chainId 1983). Use the testnet faucet to fund your agent." },
      ],
    },
    {
      id: "quickstart",
      label: "Quickstart",
      blocks: [
        { kind: "heading", text: "Accept your first payment" },
        { kind: "prose", text: "Create a checkout session, present the QR code, and the customer pays via x402." },
        { kind: "code", lang: "bash", caption: "1 - Create a checkout session", code: "curl -X POST /api/qie/checkout \\\n  -d '{\"amountUsd\": 4.99, \"merchantId\": \"merch_01\", \"description\": \"Coffee\"}'" },
        { kind: "code", lang: "bash", caption: "2 - Fetch the oracle price", code: "curl -H 'X-Payment-Token: <sig>' /api/qie/oracle/ETH" },
        { kind: "callout", tone: "success", text: "Payment is settled on-chain and a receipt is returned immediately." },
      ],
    },
    {
      id: "core-concepts",
      label: "Core Concepts",
      blocks: [
        { kind: "heading", text: "Core concepts" },
        { kind: "heading", level: 3, text: "Checkout widget" },
        { kind: "prose", text: "The QIE POS widget generates a signed payment request. The customer scans the QR or taps NFC — the x402 client in their wallet completes the payment and the merchant receives a settlement receipt." },
        { kind: "heading", level: 3, text: "Subscription plans" },
        { kind: "prose", text: "Merchants define plans with a billing interval and USDC amount. The subscription engine auto-charges at each interval using the customer's stored signed approval." },
        { kind: "heading", level: 3, text: "Oracle feeds" },
        { kind: "prose", text: "Price feeds for ETH, BTC, and QIE-native tokens are served via x402-gated endpoints. Each call deducts a micro-payment and returns a signed price report." },
        { kind: "heading", level: 3, text: "Agent credit registry" },
        { kind: "prose", text: "QieAgentCredit is deployed on QIE testnet. Agents accumulate a credit score from payment history; the registry caps borrow limits accordingly." },
      ],
    },
    {
      id: "api-reference",
      label: "API Reference",
      blocks: [
        { kind: "heading", text: "API Reference" },
        { kind: "prose", text: "QIE endpoints are served via the shared server." },
        { kind: "endpoint", method: "POST", path: "/api/qie/checkout", desc: "Create a checkout session and return a signed payment request.", req: "{\"amountUsd\":4.99,\"merchantId\":\"merch_01\",\"description\":\"Coffee\"}", resp: "{\"sessionId\":\"sess_01\",\"qrData\":\"...\",\"expiresAt\":\"2026-06-01T00:00:00Z\"}" },
        { kind: "endpoint", method: "GET", path: "/api/qie/oracle/:token", desc: "Fetch a signed price report for a token (x402-gated).", resp: "{\"token\":\"ETH\",\"priceUsd\":3241.50,\"timestamp\":1748736000,\"sig\":\"0x...\"}" },
        { kind: "endpoint", method: "POST", path: "/api/qie/subscription", desc: "Create a subscription plan.", req: "{\"planName\":\"Pro\",\"intervalDays\":30,\"amountUsd\":9.99}", resp: "{\"planId\":\"plan_01\",\"status\":\"active\"}" },
        { kind: "endpoint", method: "GET", path: "/api/qie/credit/:agentId", desc: "Read an agent credit score and borrow limit.", resp: "{\"score\":720,\"borrowLimitUsd\":500}" },
        { kind: "callout", tone: "warn", text: "Confirm paths against server/src/routes.ts before use." },
      ],
    },
    {
      id: "architecture",
      label: "Architecture",
      blocks: [
        { kind: "heading", text: "Architecture" },
        { kind: "table", headers: ["Layer", "Responsibility"], rows: [
          ["Frontend", "POS checkout, subscription manager, oracle feed viewer, credit meter, wallet console."],
          ["QIE testnet", "QieCheckout, QiePass, QieAgentCredit, QieOracleFeed contracts (chainId 1983)."],
          ["Server", "x402-gated oracle feed, checkout session creation."],
          ["Agent wallet", "Per-agent USDC balance with daily cap — enforced before any payment."],
        ] },
        { kind: "code", lang: "text", caption: "Checkout flow", code: "merchant creates session\n  -> customer scans QR / taps NFC\n  -> x402 client pays from customer wallet\n  -> gateway verifies -> USDC settled\n  -> receipt returned to merchant" },
      ],
    },
    {
      id: "security",
      label: "Security",
      blocks: [
        { kind: "heading", text: "Security model" },
        { kind: "list", items: [
          "Signed checkout sessions — each session carries a merchant signature; replays are rejected.",
          "Oracle data integrity — price reports are signed by the oracle contract; unsigned data is rejected.",
          "Subscription approval — recurring charges require an upfront signed approval stored on-chain.",
          "Credit cap enforcement — the credit registry enforces borrow limits on-chain; no server override.",
          "Testnet isolation — QIE testnet (chainId 1983) is fully separate from mainnet assets.",
        ] },
      ],
    },
    {
      id: "troubleshooting",
      label: "Troubleshooting",
      blocks: [
        { kind: "heading", text: "Troubleshooting" },
        { kind: "table", headers: ["Symptom", "Cause & fix"], rows: [
          ["Checkout session expired", "Sessions expire after 60 s — create a new session."],
          ["Oracle feed returns stale", "Price TTL expired — the next call triggers a fresh fetch from the on-chain oracle."],
          ["Credit score not updating", "Agent credit registry hasn't processed the latest payment — wait for the next block."],
          ["Subscription charge fails", "Customer approval expired or revoked — ask the customer to re-sign."],
          ["Wallet balance zero", "Agent treasury not funded — use the testnet faucet or top up via the wallet console."],
        ] },
      ],
    },
  ],
};
