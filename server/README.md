# TollGate — server

Real x402 gateway + MCP server + activity tracker for TollGate.

**Ported from [`kravadk/XSight-`](https://github.com/kravadk/XSight-)** (`server/src/middleware/x402.ts`, `server/src/routes/mcp.ts`, `server/src/services/activityTracker.ts`, `server/src/routes/analysis.ts` → `/x402-spec`, route layout from `server/src/index.ts`), generalized from XSight's OKX/X-Layer specifics to TollGate's 8-workspace / service-registry model. The frontend (`../src`) keeps its `PaymentModal` simulation as the *demo* path; this server is the *real* path — it returns an actual `HTTP 402 Payment Required` and verifies `X-PAYMENT` proofs.

## Run

```bash
cd server
npm install
cp .env.example .env          # PORT, NODE_ENV, CORS_ORIGIN, X402_PAYOUT_ADDRESS, X402_NETWORK, X402_ASSET
npm run dev                   # http://localhost:8787
# build: npm run build && npm start
```

## The x402 flow

```bash
# 1. Discover what's for sale (no payment)
curl -s http://localhost:8787/api/v1/x402-spec?workspace=liquify | jq

# 2. Hit a paid endpoint with no payment → 402 + challenge
curl -i http://localhost:8787/api/gateway/svc_liq_wallet_risk
# HTTP/1.1 402 Payment Required
# { "x402Version": 1, "error": "payment_required",
#   "challenge": { "challengeId": "ch_…", "serviceId": "svc_liq_wallet_risk",
#                  "amount": "0.05", "currency": "USDC", "network": "base-sepolia",
#                  "payTo": "0x…", "requestHash": "0x…", "expiresAt": "2026-…Z" },
#   "accepts": [ { "scheme": "exact", … } ] }

# 3a. Dev: bypass the facilitator (only when NODE_ENV != production)
curl -s -H "X-PAYMENT: dev-bypass" http://localhost:8787/api/gateway/svc_liq_wallet_risk | jq
# → { "serviceId": …, "data": { … sample response … }, "receiptId": "rcpt_…", "receipt": { … } }

# 3b. Prod: retry with a base64 X-PAYMENT proof bound to the challenge
HEADER=$(printf '%s' '{"challengeId":"ch_…","payTo":"0x…","amount":"0.05","asset":"USDC","network":"base-sepolia","txHash":"0x…","payer":"0xagent…"}' | base64)
curl -s -H "X-PAYMENT: $HEADER" http://localhost:8787/api/gateway/svc_liq_wallet_risk | jq
```

Each challenge is **single-use**, **bound to a `requestHash`**, and **expires after 5 minutes** — replays return `402 {error:"challenge_invalid",reason:"replayed"}`.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/services?workspace=<id>` | List paid services (all 8 workspaces, or filtered) |
| GET | `/api/services/:id` | One service |
| GET | `/api/agents?workspace=<id>` | Agent policies (read-only) |
| GET | `/api/agents/:id` | One agent |
| GET | `/api/v1/x402-spec?workspace=<id>` | Discovery descriptor (no payment) |
| GET·POST | `/api/gateway/:serviceId` | The gate — 402 + challenge, retry with `X-PAYMENT` |
| GET | `/api/receipts?workspace=&service=&agent=` | Settled receipts |
| GET | `/api/receipts/:id` | One receipt |
| GET | `/api/status/health` | Config + counts |
| GET | `/api/status/activity` | Live `byKind` activity map (`gateway.402`, `gateway.paid`, `gateway.replayed`, `mcp.tools.call`, …) |
| GET | `/api/status/x402-log` | Last 100 gateway calls (paid + rejected) |
| POST | `/mcp` | MCP JSON-RPC 2.0 — `initialize`, `tools/list`, `tools/call` |
| GET | `/mcp` | MCP capability discovery |

### MCP tools

`list_services` · `get_service` · `pay_for_service` · `list_receipts` · `get_agent_policy`

```bash
curl -s -X POST http://localhost:8787/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

curl -s -X POST http://localhost:8787/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pay_for_service","arguments":{"serviceId":"svc_0g_inference","agentId":"agent_0g_runner"}}}' | jq
```

## Wiring to the frontend (TODO — see `../TRACK-PLAN.md` §7)

- Point the `x402 Gateway` tab's "Try Unpaid / Try Paid" buttons at `${VITE_API_BASE}/api/gateway/<id>`.
- Have the receipts ledger read `GET /api/receipts` when the server is reachable, falling back to localStorage offline.
- Deploy (Render/Fly, like XSight) and set `VITE_API_BASE` on the Vercel frontend; set `CORS_ORIGIN` to the Vercel domain.

## Security notes

- Frontend is never the source of truth: `priceUsd`, `providerWallet`, receipt status, and payment proofs are all server-side. Provider/agent *mutations* (create service, change price, change budget) would require a wallet signature — not implemented in this skeleton (read-only registry for now).
- `dev-bypass` is disabled when `NODE_ENV=production` and logs a startup warning otherwise.
- Replay protection: nonce (`challengeId`) + expiry + `requestHash` + `serviceId` binding, single-use consume.
- In-memory stores (`src/store.ts`) — swap for a DB for persistence across restarts.
