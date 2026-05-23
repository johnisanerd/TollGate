// src/workspaces/0g/docs.ts
import type { DocsModule } from "../_docs";

export const docs: DocsModule = {
  sections: [
    {
      id: "overview",
      label: "Overview",
      blocks: [
        { kind: "heading", text: "0G AI Compute & Storage" },
        { kind: "prose", text: "0G is a four-layer decentralised AI infrastructure: Compute handles GPU inference with per-token pricing and cryptographic receipts; Storage provides content-addressed blob storage anchored by SHA-256 hashes; DA (data availability) keeps blobs accessible and verifiable; and Chain is the settlement layer where receipts, agent registries, and revenue splits live on-chain." },
        { kind: "list", items: [
          "Inference jobs — run LLM models on 0G Compute with pay-per-token x402 pricing.",
          "Storage pinning — store memory blobs on 0G Storage with SHA-256 content addressing.",
          "Proof verification — verify every inference receipt anchored to 0G Chain.",
          "Agent budgets — per-agent daily spend caps with allowlisted service IDs.",
        ] },
        { kind: "callout", tone: "info", text: "Connect your wallet to 0G Chain before running inference jobs or pinning storage blobs." },
      ],
    },
    {
      id: "quickstart",
      label: "Quickstart",
      blocks: [
        { kind: "heading", text: "Run your first inference job" },
        { kind: "prose", text: "The typical flow is: pin any context blob to 0G Storage, run an inference job against 0G Compute referencing that blob, then verify the returned receipt proof on 0G Chain." },
        { kind: "code", lang: "bash", caption: "1 - Pin a blob to 0G Storage", code: "curl -X POST /api/og/storage/pin \\\n  -H 'Content-Type: application/json' \\\n  -d '{ \"data\": \"base64...\", \"tags\": [] }'" },
        { kind: "code", lang: "bash", caption: "2 - Run an inference job", code: "curl -X POST /api/og/inference \\\n  -H 'Content-Type: application/json' \\\n  -d '{ \"model\": \"llama3\", \"prompt\": \"Analyse this token\", \"maxTokens\": 256 }'" },
        { kind: "code", lang: "bash", caption: "3 - Verify the proof", code: "curl '/api/og/proof?txHash=0x...'" },
        { kind: "callout", tone: "success", text: "Each inference job produces a receipt anchored to 0G Chain." },
      ],
    },
    {
      id: "core-concepts",
      label: "Core Concepts",
      blocks: [
        { kind: "heading", text: "Core concepts" },
        { kind: "heading", level: 3, text: "0G Compute" },
        { kind: "prose", text: "GPU inference runs on the 0G Compute network with per-token pricing. Every result is paired with a cryptographic receipt — an EIP-191 signed payload that is anchored on 0G Chain and can be independently verified." },
        { kind: "heading", level: 3, text: "0G Storage" },
        { kind: "prose", text: "Blobs are stored in a content-addressed manner: the payload is SHA-256-hashed and the hash serves as the retrieval key. Data is replicated across the 0G Storage network and remains tamper-evident." },
        { kind: "heading", level: 3, text: "Agent budgets & allowlists" },
        { kind: "prose", text: "Each agent has a configured daily spend cap. Only service IDs on the agent's allowlist may receive automatic payments, preventing unexpected charges from unknown endpoints." },
        { kind: "heading", level: 3, text: "Revenue splits" },
        { kind: "prose", text: "Earnings can be split across multiple recipient addresses on-chain. The split ratios are set at contract deployment and enforced by the 0G Chain settlement contract, requiring no off-chain trust." },
      ],
    },
    {
      id: "api-reference",
      label: "API Reference",
      blocks: [
        { kind: "heading", text: "API Reference" },
        { kind: "prose", text: "All endpoints follow the x402 payment-per-call pattern." },
        { kind: "endpoint", method: "GET", path: "/api/og/status", desc: "Current 0G connectivity and registry readiness.", resp: '{"ready":true,"chainId":16602}' },
        { kind: "endpoint", method: "POST", path: "/api/og/inference", desc: "Run an LLM inference job — pay per token, receive a cryptographic receipt.", req: '{"model":"llama3","prompt":"...","maxTokens":256}', resp: '{"result":"...","receipt":"0x...","tokensUsed":214}' },
        { kind: "endpoint", method: "POST", path: "/api/og/storage/pin", desc: "Pin a memory blob to 0G Storage — returns a content hash.", req: '{"data":"base64...","tags":[]}', resp: '{"hash":"0x...","size":1024}' },
        { kind: "endpoint", method: "GET", path: "/api/og/proof", desc: "Verify a receipt proof against 0G Chain.", resp: '{"valid":true,"anchored":true}' },
        { kind: "endpoint", method: "GET", path: "/api/arc-readiness", desc: "Pre-flight check before arming the compute agent.", resp: '{"ready":true,"checks":[]}' },
        { kind: "callout", tone: "warn", text: "Paths are served from server/src/routes.ts. Confirm against that file before relying on them." },
      ],
    },
    {
      id: "architecture",
      label: "Architecture",
      blocks: [
        { kind: "heading", text: "Architecture" },
        { kind: "table", headers: ["Layer", "Role"], rows: [
          ["0G Compute", "GPU inference — model execution, token pricing, receipt generation"],
          ["0G Storage", "Content-addressed blob storage — SHA-256 hash, tamper-evident"],
          ["0G DA", "Data availability — keeps blob data accessible and verifiable"],
          ["0G Chain", "Settlement — receipt anchoring, agent registry, revenue splits"],
        ] },
        { kind: "code", lang: "text", caption: "Inference flow", code: "request -> pay via x402\n         -> run model on 0G Compute\n         -> pin result to 0G Storage\n         -> anchor receipt on 0G Chain -> proof" },
      ],
    },
    {
      id: "security",
      label: "Security",
      blocks: [
        { kind: "heading", text: "Security model" },
        { kind: "list", items: [
          "Signed receipts — every inference result carries a cryptographic receipt anchored on-chain.",
          "Agent allowlists — only pre-approved service IDs can receive automatic payments.",
          "Daily budget cap — the agent cannot exceed its configured daily spend limit.",
          "Revenue split contract — earnings are split on-chain; no off-chain trust required.",
          "Single-use proofs — receipts are replay-protected and cannot be reused.",
        ] },
      ],
    },
    {
      id: "troubleshooting",
      label: "Troubleshooting",
      blocks: [
        { kind: "heading", text: "Troubleshooting" },
        { kind: "table", headers: ["Symptom", "Cause & fix"], rows: [
          ["Inference returns empty", "Model endpoint unreachable — check 0G Compute status on the Overview tab."],
          ["Proof verification fails", "Receipt not yet anchored — wait one block and retry the verify call."],
          ["Storage pin rejected", "Blob exceeds size limit or missing tags — reduce payload or add required tags."],
          ["Budget depleted", "Daily cap reached — increase the cap in Agent settings or wait for the daily reset."],
          ["Registry not configured", "VITE_0G_REGISTRY env var missing — set it and redeploy."],
        ] },
      ],
    },
  ],
};
