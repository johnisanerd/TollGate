// src/workspaces/0g/docs.ts
import type { DocsModule } from "../_docs";

export const docs: DocsModule = {
  sections: [
    {
      id: "overview",
      label: "Overview",
      blocks: [
        { kind: "heading", text: "0G Agent Payment Router" },
        { kind: "prose", text: "The 0G workspace turns AI agents into paying customers. An agent pays per inference job and per storage write over the x402 protocol, and every payment produces a verifiable receipt linked to job metadata stored in 0G Storage." },
        { kind: "prose", text: "It is built for autonomous agents that need to buy compute, persist memory, and prove what they did — without a human approving each transaction." },
        { kind: "list", items: [
          "x402 Gateway — an HTTP 402 paywall in front of every priced service.",
          "0G Compute — pay-per-inference jobs on 0G compute nodes.",
          "0G Storage & DA — verifiable memory writes and data-availability proofs.",
          "TEE & Privacy — sealed inputs and attestation-backed execution.",
        ] },
        { kind: "callout", tone: "info", text: "New here? Jump to Quickstart to make your first paid inference call in under five minutes." },
      ],
    },
    {
      id: "quickstart",
      label: "Quickstart",
      blocks: [
        { kind: "heading", text: "Make your first paid call" },
        { kind: "prose", text: "The @tollgate/sdk client wraps the x402 handshake: it calls a service, receives an HTTP 402 with payment terms, settles in USDC, and retries with the payment proof attached." },
        { kind: "code", lang: "bash", caption: "Install", code: "npm install @tollgate/sdk" },
        { kind: "code", lang: "ts", caption: "Pay for one inference job", code: "import { fetchPaid } from \"@tollgate/sdk\";\n\nconst res = await fetchPaid(\"/api/gateway/svc_0g_inference\", {\n  method: \"POST\",\n  body: JSON.stringify({ target: \"0x91a3...\", depth: 2 }),\n  wallet: agentWallet,       // signs the x402 payment\n  maxPriceUsd: 0.05,         // refuse anything above this\n});\n\nconst report = await res.json();\nconsole.log(report.riskScore, report.jobId);" },
        { kind: "callout", tone: "success", text: "On success the SDK returns the response plus an x402 receipt id — look it up under the Receipts tab." },
      ],
    },
    {
      id: "core-concepts",
      label: "Core Concepts",
      blocks: [
        { kind: "heading", text: "Core concepts" },
        { kind: "heading", level: 3, text: "Services" },
        { kind: "prose", text: "A service is a priced HTTP endpoint — an inference model, a storage write, a DA verification. Each service has a fixed USDC price and a provider wallet that receives payment." },
        { kind: "heading", level: 3, text: "Agents" },
        { kind: "prose", text: "An agent is a wallet with a spending policy: a daily limit, a max-per-request cap, and an allowlist of service ids it may pay. The router enforces the policy before any payment is signed." },
        { kind: "heading", level: 3, text: "Receipts" },
        { kind: "prose", text: "Every settled payment produces a receipt: payer, provider, amount, network, tx hash, and a kind-specific payload (job metadata, storage root, attestation id). Receipts are EIP-191 signed so anyone can verify them." },
        { kind: "heading", level: 3, text: "Inference jobs & storage writes" },
        { kind: "prose", text: "An inference job runs a model on a 0G compute node and returns a scored result. A storage write persists an agent-memory blob to 0G Storage and returns a verifiable 0g:// reference." },
      ],
    },
    {
      id: "api-reference",
      label: "API Reference",
      blocks: [
        { kind: "heading", text: "API Reference" },
        { kind: "prose", text: "The base URL is the router server. Priced endpoints answer HTTP 402 until a valid x402 payment header is attached." },
        { kind: "endpoint", method: "GET", path: "/api/services", desc: "List all registered services with price, currency, and provider.", resp: "[{ \"id\": \"svc_0g_inference\", \"priceUsd\": 0.03, \"currency\": \"USDC\" }]" },
        { kind: "endpoint", method: "GET", path: "/api/services/:id", desc: "Fetch one service definition.", resp: "{ \"id\": \"svc_0g_inference\", \"network\": \"0g-galileo\" }" },
        { kind: "endpoint", method: "POST", path: "/api/gateway/:serviceId", desc: "Call a priced service. Returns 402 with payment terms, or the service result once an x402 payment proof is attached.", req: "{ \"target\": \"0x91a3...\", \"depth\": 2 }", resp: "{ \"riskScore\": 73, \"jobId\": \"job_0g_8821\" }" },
        { kind: "endpoint", method: "POST", path: "/api/og/upload", desc: "Upload an agent-memory blob to 0G Storage; returns a verifiable storage reference.", req: "{ \"agentId\": \"agent_0g_worker\", \"blob\": \"...\" }", resp: "{ \"ref\": \"0g://Qm...\", \"size\": 4096 }" },
        { kind: "endpoint", method: "POST", path: "/api/og/compute", desc: "Run an inference job on a 0G compute node.", req: "{ \"model\": \"risk-scorer-v2\", \"prompt\": \"...\" }", resp: "{ \"jobId\": \"job_0g_8821\", \"output\": \"...\" }" },
        { kind: "endpoint", method: "GET", path: "/api/receipts", desc: "List payment receipts, newest first.", resp: "[{ \"id\": \"rcpt_...\", \"status\": \"verified\" }]" },
        { kind: "endpoint", method: "GET", path: "/api/receipts/:id", desc: "Fetch one receipt with its full payload.", resp: "{ \"id\": \"rcpt_...\", \"txHash\": \"0x...\" }" },
        { kind: "endpoint", method: "GET", path: "/api/events/payments", desc: "A Server-Sent Events stream of live payment and receipt updates.", resp: "event: payment | data: { \"id\": \"rcpt_...\" }" },
        { kind: "callout", tone: "warn", text: "Paths are taken from server/src/routes.ts. Re-confirm against that file before relying on them — routes evolve." },
      ],
    },
    {
      id: "architecture",
      label: "Architecture",
      blocks: [
        { kind: "heading", text: "Architecture" },
        { kind: "prose", text: "The 0G router has three layers." },
        { kind: "table", headers: ["Layer", "Responsibility"], rows: [
          ["Frontend", "React app — agent wallet, service catalogue, receipt explorer."],
          ["x402 Gateway (server)", "Express server — prices requests, enforces agent policy, issues HTTP 402, settles USDC, writes receipts."],
          ["0G chain & storage", "0G Compute nodes run inference; 0G Storage holds memory blobs; 0G DA proves data availability."],
        ] },
        { kind: "code", lang: "text", caption: "Request flow", code: "agent -> fetchPaid() -> 402 Payment Required\n      -> sign x402 payment (USDC)\n      -> retry with proof -> service result + receipt\n      -> receipt anchored, job metadata in 0G Storage" },
      ],
    },
    {
      id: "security",
      label: "Security",
      blocks: [
        { kind: "heading", text: "Security model" },
        { kind: "list", items: [
          "Spending policy — daily limit, max-per-request, and a service allowlist are enforced before any payment is signed.",
          "EIP-191 receipts — each receipt is signed so a third party can verify payer, amount, and job without trusting the router.",
          "TEE attestation — privacy-sensitive jobs run in a trusted execution environment; the receipt carries the attestation id and quote.",
          "Sealed inputs — private agent context is AES-GCM encrypted; only the receipt holder can unseal it.",
        ] },
        { kind: "callout", tone: "warn", text: "Never expose an agent's private key in client code. The agent wallet signs payments only inside the SDK or your backend." },
      ],
    },
    {
      id: "troubleshooting",
      label: "Troubleshooting",
      blocks: [
        { kind: "heading", text: "Troubleshooting" },
        { kind: "table", headers: ["Symptom", "Cause & fix"], rows: [
          ["402 keeps repeating", "Payment proof not attached or rejected — check the agent wallet has USDC and the SDK retried with the x402 header."],
          ["\"limit exceeded\"", "The request exceeds the agent's daily limit or max-per-request — raise the policy under the Agent Identity tab."],
          ["\"service not allowed\"", "The service id is not on the agent's allowlist — add it to the agent policy."],
          ["Receipt stuck on \"paid\"", "The job result has not been verified yet — verification anchors the receipt; refresh the Receipts tab."],
          ["Storage write returns no ref", "The 0G Storage upload failed — retry and check server logs for the /api/og/upload error."],
        ] },
      ],
    },
  ],
};
