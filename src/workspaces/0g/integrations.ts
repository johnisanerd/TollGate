// src/workspaces/0g/integrations.ts
import type { IntegrationsModule } from "../_docs";

export const integrations: IntegrationsModule = {
  intro: "Connect the 0G Agent Payment Router to your agent stack — the x402 SDK, an MCP server, raw HTTP, the 0G Galileo network, and live receipt webhooks.",
  cards: [
    {
      id: "og_sdk",
      title: "@tollgate/sdk",
      category: "SDK",
      status: "available",
      desc: "Zero-dependency x402 client. Wraps the 402 handshake — call, pay in USDC, retry with proof — in a single fetchPaid() call.",
      code: { lang: "bash", code: "npm install @tollgate/sdk" },
    },
    {
      id: "og_mcp",
      title: "MCP Server",
      category: "MCP",
      status: "beta",
      desc: "A Model Context Protocol server that exposes priced 0G services as MCP tools, so an LLM agent can discover and pay for them directly.",
      code: { lang: "json", code: "{\n  \"mcpServers\": {\n    \"tollgate\": { \"command\": \"npx\", \"args\": [\"@tollgate/mcp\"] }\n  }\n}" },
    },
    {
      id: "og_http",
      title: "Raw x402 over HTTP",
      category: "API",
      status: "available",
      desc: "No SDK required. Call the gateway, read the 402 payment terms, attach an X-PAYMENT header with your settlement proof, and retry.",
      code: { lang: "bash", code: "curl -s /api/gateway/svc_0g_inference\n# -> 402 Payment Required + terms\ncurl -s -H \"X-PAYMENT: <proof>\" /api/gateway/svc_0g_inference" },
    },
    {
      id: "og_net",
      title: "0G Galileo Network",
      category: "Chain",
      status: "available",
      desc: "Add the 0G Galileo network to a wallet to pay and settle. Use the live RPC URL and chain id from getOgConfig() in src/lib/og.ts.",
      code: { lang: "ts", code: "import { getOgConfig } from \"./lib/og\";\nconst cfg = getOgConfig(\"mainnet\"); // { rpcUrl, chainId, explorer }" },
    },
    {
      id: "og_webhook",
      title: "Receipt SSE Webhook",
      category: "Webhook",
      status: "available",
      desc: "Subscribe to /api/events/payments to receive a live event every time a payment settles or a receipt is verified.",
      code: { lang: "ts", code: "const es = new EventSource(\"/api/events/payments\");\nes.addEventListener(\"payment\", (e) => console.log(JSON.parse(e.data)));" },
    },
    {
      id: "og_storage",
      title: "0G Storage",
      category: "API",
      status: "available",
      desc: "Persist agent-memory blobs and read them back by reference. Each write returns a verifiable 0g:// reference and a content root.",
      code: { lang: "bash", code: "curl -X POST /api/og/upload -d '{ \"agentId\": \"agent_0g_worker\", \"blob\": \"...\" }'" },
    },
  ],
};
