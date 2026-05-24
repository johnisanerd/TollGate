# @tollgate/sdk

The smallest possible client for an **x402 (HTTP 402) paid API**. One call —
`fetchPaid(serviceId)` — runs the whole loop:

```
GET /api/gateway/<id>            → 402 { challenge }
build an X-PAYMENT proof          → GET /api/gateway/<id> with X-PAYMENT
200 OK { data, receiptId, ... }   → you get the data + receipt
```

Zero dependencies. Works in the browser, Node 18+, Bun, Deno, Cloudflare Workers —
anywhere there's a global `fetch` (or pass your own).

## Install

```bash
npm install @tollgate/sdk
```

(Or, in this monorepo, build it from source: `cd packages/sdk && npm install && npm run build`.)

## Use

```ts
import { fetchPaid } from "@tollgate/sdk";

// One paid call against the TollGate demo gateway (https://tollgate-1.onrender.com):
const res = await fetchPaid("svc_0g_inference", { agentId: "my-agent" });
console.log(res.data);        // the unlocked resource
console.log(res.receiptId);   // receipt id for this call
console.log(res.note);        // "x402 payment verified."
```

Point it at your own gateway, or use `dev-bypass` in development:

```ts
import { createTollGate } from "@tollgate/sdk";

const tg = createTollGate({
  baseUrl: "http://localhost:8787",  // your TollGate server
  agentId: "research-bot",
  devBypass: true,                   // server must run with NODE_ENV != production
});

const services = await tg.listServices("0g");          // discover paid endpoints
const spec     = await tg.discover();                  // the x402 spec
const out      = await tg.fetchPaid("svc_0g_storage"); // pay & unlock
```

### Plug in a real payment

By default the SDK builds an *echo proof* (mirrors the 402 challenge back) — enough
to unlock the demo gateway, which checks `payTo` / `amount` / `asset` / `network`.
In production, supply a `proof` builder that performs an actual on-chain payment (or
calls a facilitator) and returns the proof object:

```ts
const tg = createTollGate({
  baseUrl: "https://your-gateway.example",
  proof: async (challenge) => {
    const txHash = await payOnChain(challenge.payTo, challenge.amount, challenge.network);
    return {
      challengeId: challenge.challengeId,
      payTo: challenge.payTo,
      amount: challenge.amount,
      asset: challenge.currency,
      network: challenge.network,
      txHash,
      payer: myWalletAddress,
    };
  },
});
```

## API

| Export | Signature |
| --- | --- |
| `fetchPaid<T>(serviceId, opts?)` | `Promise<PaidResult<T>>` — one-shot paid fetch |
| `createTollGate(opts?)` | `{ baseUrl, fetchPaid, listServices, discover }` |
| `TollGateOptions` | `{ baseUrl?, agentId?, fetch?, proof?, devBypass? }` |
| `PaidResult<T>` | `{ data, receiptId, receipt, challenge, via, note }` |
| `TollGateError` | thrown on non-402 / payment-rejected responses (`.status`, `.body`) |

## MCP

The same gateway also speaks **MCP** (JSON-RPC 2.0 at `POST /mcp`) — any
Claude-powered agent can use TollGate's paid APIs as a tool with no bespoke wiring.
See the repo root README, "Run TollGate as an MCP tool".

MIT
