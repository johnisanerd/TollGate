# ArcMind Control Layer

**Safe delegation for AI market agents on Arc.**

[![Live App](https://img.shields.io/badge/live-toll--gatee.vercel.app-16c784?style=for-the-badge)](https://toll-gatee.vercel.app/)
[![Backend](https://img.shields.io/badge/backend-render-4f7cff?style=for-the-badge)](https://tollgate-1.onrender.com)
[![Arc](https://img.shields.io/badge/network-Arc_Testnet-111827?style=for-the-badge)](https://www.arc.network/)
[![Agora Agents](https://img.shields.io/badge/submission-Agora_Agents-ffb000?style=for-the-badge)](https://agora.thecanteenapp.com/)

ArcMind Control Layer lets a user give an AI market agent a limited USDC operating budget, approved data sources, allowed actions and risk rules. The agent can read market data, build decisions and execute only inside those constraints. User capital stays in a separate strategy vault, and every action leaves an auditable receipt.

The product is built for the **Agora Agents Hackathon by Canteen, Circle and Arc**: agents that trade, invest, create and interface with markets, settled instantly on Arc with USDC.

## Why This Exists

AI trading products usually answer one narrow question: **what should I trade?**

The hard product problem is different:

- Where does the agent get money for paid APIs and market actions?
- How much can it spend per call or per day?
- Which sources are trustworthy enough to influence capital?
- What happens if a source fails, a payment fails, or risk spikes?
- Can the user stop, withdraw or audit the agent without giving it a whole wallet?

ArcMind solves that control problem.

> The user does not give the agent a wallet. The user gives the agent a bounded budget, policy, risk guard and strategy vault.

## Product In One Flow

```mermaid
flowchart LR
  A["Connect wallet"] --> B["Fund Agent Budget"]
  B --> C["Allow data sources"]
  C --> D["Enable strategy"]
  D --> E["Agent builds decision"]
  E --> F{"Budget + policy + risk gates"}
  F -- pass --> G["Approve or auto-execute"]
  F -- block --> H["Blocked receipt + reason"]
  G --> I["Execution receipt"]
  I --> J["Positions / withdraw / settle"]
```

## What The User Can Do

The Arc workspace is a full multi-tab trading platform. Pick an agent, inspect its reasoning, stake with one click, or drill into raw positions and predictions.

| Tab | User question | Main actions |
|---|---|---|
| **Discover** | What agents can I copy? | Leaderboard: ArcMind (Arc, native) + every Hyperliquid vault from `vaultSummaries`. Sort/filter by APR / AUM / MDD / followers / age. Cross-chain Mirror button per Hyperliquid row (CCTP intent) |
| **Agent: ArcMind** | What is ArcMind doing and why? | Portfolio sparkline, win rate, Sharpe, 30d return, traded assets, fee schedule, source contribution per decision, followers count, ArcScan link for every on-chain action |
| **Copy & Position** | How do I copy with $X USDC? | Stake (min $1), risk profile, max drawdown, advanced Binance/Bybit-style settings (TP / SL / max position / slippage / copy mode), live realized + unrealized PnL split |
| **Signal Feed** | What is the agent reasoning right now? | LLM Debate Room (Bull vs Bear vs Synthesizer), live ETH price + Hyperliquid OI, market regime badge (BULL / BEAR / RISK_OFF / CHOPPY) |
| **Arb Scanner** | Any live spread opportunities? | Real-time SSE feed of ETH spread across OKX, Coinbase, Binance, Hyperliquid; net bps after fees; Execute button creates CCTP intent |
| **Perp Trading** | Can I see agent perp positions? | Read-only dYdX v4 (Cosmos) + GMX v2 (Arbitrum) positions; env-gated by `VITE_DYDX_ADDRESS` / `VITE_GMX_AGENT_ADDRESS` |
| **Predictions** | Any prediction market bets? | Top Polymarket crypto events + 3 native Arc prediction markets via `PredictionOracle.sol`; Kelly-sized bet intents emitted on each BUY/BULL tick |
| **Receipts** | What proof exists? | Filter, export CSV, copy receipt id; embedded ERC-8183 Job lifecycle viewer (Open → Funded → Submitted → Terminal) with per-state ArcScan tx links |
| **Developer Console** | How do builders integrate this? | 15 collapsible power-user sections: Agent Budget, Strategies, Sources, Multi-Agent Debate, Slash-Bonded Leaderboard, Galxe Pioneer Quest, Cross-Platform Positions, Decision Room, Execution Queue, Risk Guard, Positions, Control Receipts, Portfolio, App Kit, x402, CCTP, Circle Tools |
| **Leaderboard** | Which agents are top ranked? | ERC-8004 on-chain scores, bond-at-risk USDC per agent, slashed agents with reasons and tx hashes |
| **Docs** | API reference | Full Docs portal |
| **Integrations** | Which chains/keys do I need? | Live integration grid with status per integration |

## Why It Fits Agora

All 6 RFBs are covered:

- **RFB 01 - Perpetual Futures Trading Agent**: autonomous 30-min loop; risk guard + drawdown rules + stale-source blocking + emergency exit; read-only dYdX v4 + GMX v2 position tracking; HL Perp Trading tab; degradation evaluator auto-pauses the loop when 7d win-rate drops below 40%.
- **RFB 02 - Prediction Market Trader Intelligence**: Polymarket Gamma live feed (top crypto events by 24h volume); Kelly-sized bet intents computed on every BUY/BULL tick and recorded via `recordPolymarketIntent`; native Arc prediction markets via `PredictionOracle.sol`.
- **RFB 03 - Prediction Market Creator**: `MarketFactory` deploys isolated markets on-chain; `seed-prediction-markets.cjs` seeds 3 geopolitical + crypto questions; `PredictionOracle.sol` handles admin-attested resolution.
- **RFB 04 - Adaptive Portfolio Manager**: regime classifier (BULL/BEAR/RISK_OFF/CHOPPY) via rule engine + optional LLM second-opinion; RISK_OFF routes to USYC via `UsycRouter.sol`; strategy vault + rebalancing controls.
- **RFB 05 - Cross-Platform Arbitrage Agent**: real-time arb scanner (OKX, Coinbase, Binance, Hyperliquid) via SSE; spread ranked by net bps after CCTP fee; Execute creates CCTP intent; Pyth Network sub-second price confirmation.
- **RFB 06 - Social Trading Intelligence**: CopyGuard decay scoring (drawdown ×0.2, losses ×0.15, vol ×0.1); slash-bonded leaderboard (ERC-8004 reputation on-chain); Farcaster auto-cast + Discord + Telegram on every BUY/SELL decision; Galxe Pioneer NFT quest.

## Funding Model

ArcMind separates money into four buckets.

| Bucket | Pays for | Does not pay for |
|---|---|---|
| **User Wallet** | Manual signatures, top-up, withdrawals, user-approved actions | Hidden autonomous retries |
| **Agent Budget** | Autonomous source reads, x402 calls, arb checks, agent operating costs | User strategy stake |
| **Strategy Vault** | User capital, exposure, reduce/close/settle/withdraw | Paid data sources |
| **Receipts Layer** | Audit trail for live, blocked and failed actions | Custody |

New Agora actions are **live-only**:

- no local fallback receipts for new actions;
- no seed BUY/HOLD/SELL data;
- no fake PnL, fake volume or simulated custody;
- if a live path is unavailable, the action is blocked with a concrete reason.

## Auto-Generated Markets (MarketFactory)

ArcMind ships a production `MarketFactory` so any new `(operator, baseSymbol, quoteToken)` triple can spawn its own isolated `CopyTradeMarket` contract. Every market is a separate Solidity contract with its own pause switch, fee schedule, stake bounds, and per-trader state — risk on one market never crosses into another.

```bash
cd contracts
ARC_USDC_ADDRESS=0x... ARC_PRIVATE_KEY=0x... npm run deploy:arc-market-factory
```

Deploys `AgentRegistry` + `MarketFactory` + the canonical ETH/USDC market, writes `contracts/deployments/arc-market-factory.json`. Adding a second market (e.g. BTC/USDC) is a single call:

```ts
await factory.createMarket(
  operator, usdc,
  "BTC/USDC",
  500,   // 5% performance fee (capped at 20%)
  1500,  // 15% kill-switch drawdown (range 5%-50%)
  1_000_000n,   // $1 USDC min stake
  1_000_000_000n,  // $1,000 USDC max stake
);
```

Security primitives across every new contract (OpenZeppelin 5.0.2):

- `Ownable` + `Pausable` + `ReentrancyGuard` + `SafeERC20`
- CEI (checks-effects-interactions) on every external transfer
- Per-parameter validation in constructor AND per-call (defence in depth)
- Custom errors with structured args (no string reverts)
- No `delegatecall`, no proxy, no upgradeability
- `sweepDust()` cannot drain quote token — user capital is segregated
- Factory enforces a global policy bound (max performance fee, kill-threshold range, stake floor/ceiling) on top of each market's own immutable bounds

The frontend Discover tab auto-discovers every market on every page load — set `VITE_ARC_MARKET_FACTORY` in your env and the "Native Arc Markets" section appears with live TVL, fees paid, settlement count, and pause state per market.

## Live Architecture

```mermaid
flowchart TB
  U["User wallet"] --> UI["React dApp"]
  UI --> API["Arc Control API"]
  API --> DB["SQLite control state"]
  API --> SRC["Live source adapters"]
  UI --> ARC["Arc Testnet contracts"]
  ARC --> T["ArcAgentTreasury"]
  ARC --> V["ArcStrategyVault"]
  ARC --> R["ArcRiskGuard"]
  ARC --> RR["ArcReceiptRegistry"]
  SRC --> M["Market price / OI / funding"]
  SRC --> S["Social + news via Apify"]
  SRC --> L["Leader feed if configured"]
```

### Standards

- **ERC-8004** (Agent Identity & Reputation) — `AgentRegistry.sol` exposes `agentURI`, `agentReputation`, `agentOwner`, `agentDecisionCount` + emits standard `ReputationUpdated` events. Resolvers have a dedicated role; governors can slash misbehaving agents.
- **ERC-8183** (Agentic Commerce, Virtuals × Ethereum Foundation) — every copy-trade position emits `JobCreated → JobFunded → JobSubmitted → JobCompleted` events from `CopyTradeMarket`. The Receipts tab includes a live Job-lifecycle viewer.
- **Hyperliquid Info API** — POST `https://api.hyperliquid.xyz/info` with `vaultSummaries` / `vaultDetails` / `leaderboard`. Cached 60s in-memory; empty array on failure, never synthetic.
- **Circle CCTP v2** — domain numbers and USDC addresses for Ethereum/Arbitrum/Base/Optimism/Polygon are exposed via the Mirror modal; intents persist as receipts and will be replayable once Arc L1 is added to CCTP.
- **x402 USDC nanopayments** — agent operating costs settle in USDC per-call via `packages/sdk` (zero-dep client).

### `@arcmind/agent` package

The standalone autonomous agent runtime lives at `packages/arcmind-agent/`. Architecture matches ElizaOS plugin shape (Character + Providers + Actions + Evaluators + Service) with a local TypeScript shim of the public `@elizaos/core` types — drop in `@elizaos/core` later by changing one `types.ts` import, no business-logic rewrites needed.

Providers: `coingeckoPriceProvider`, `hyperliquidOiProvider`, `leaderFeedProvider`.
Actions: `decideEthDirectionAction`, `recordOnChainAction`, `predictionBetAction` (Kelly-sized Polymarket intent).
Evaluators: `decisionAccuracyEvaluator` (feeds ERC-8004 reputation), `degradationEvaluator` (7d rolling win-rate; auto-pauses loop + fires alert at < 40%).

The `arc-agent-loop.ts` server extension adds:
- **Regime detection** — rule-based classifier (BULL/BEAR/RISK_OFF/CHOPPY) with optional LLM second-opinion via OpenRouter/Anthropic/Hermes. RISK_OFF forces HOLD; BEAR blocks BUY.
- **Degradation guard** — reads `data/arc-decisions.jsonl`; pauses tick and fires alert when 7-day win-rate falls below configurable threshold.
- **Polymarket Kelly intent** — on BUY/BULL ticks: fetches top crypto market from Gamma API, computes fractional-Kelly stake (0.5×, capped $5), records intent via `polymarket-exec.ts`.
- **Decision broadcast** — auto-casts to Farcaster (`@arcmind` channel), Discord webhook, and Telegram on every non-HOLD decision.

```ts
import { startArcMindAgent } from "@arcmind/agent";
const stop = await startArcMindAgent({
  settings: { ARC_PRIVATE_KEY: "0x…", ARC_AGENT_ID: "0x…" },
});
```

### Frontend

- React 19
- Vite 7
- TypeScript
- Tailwind CSS
- Workspace route: `/app/agora`

### Backend

- Express + TypeScript
- `better-sqlite3` control-state persistence
- x402-style service gateway
- Arc Control API
- live source adapters

### Contracts

**Production contract suite** (deploy via `cd contracts && npm run deploy:arc-market-factory`):

| Contract | Role | Source |
|---|---|---|
| `MarketFactory` | Permissionless factory — deploys one `CopyTradeMarket` per `(operator, baseSymbol, quoteToken)`; owner-configurable policy bounds | [`contracts/contracts/MarketFactory.sol`](contracts/contracts/MarketFactory.sol) |
| `CopyTradeMarket` | Per-market escrow: stake/settle/killSwitch/pause; immutable fee + drawdown bounds; ERC-8183 Job lifecycle events | [`contracts/contracts/CopyTradeMarket.sol`](contracts/contracts/CopyTradeMarket.sol) |
| `AgentRegistry` | Multi-agent registry with `AccessControl` (resolver + governor roles), slashing, ERC-8004 view interface | [`contracts/contracts/AgentRegistry.sol`](contracts/contracts/AgentRegistry.sol) |

**Live on Arc Testnet:**

| Contract | Address | Status |
|---|---|---|
| `AgentRegistry` | [`0x8aD47542EBbd92696E7C69E756bdf654d867581d`](https://testnet.arcscan.app/address/0x8aD47542EBbd92696E7C69E756bdf654d867581d) | live; `registerAgent` + `recordDecision` + `resolveDecision` exercised, reputation 0 → 10 |
| `MarketFactory` | [`0x9C36Aa5fa856893Ae70E33014985678E4Ce198AD`](https://testnet.arcscan.app/address/0x9C36Aa5fa856893Ae70E33014985678E4Ce198AD) | live; `createMarket` exercised; 1 market deployed |
| `CopyTradeMarket` (ETH/USDC) | [`0xaef1bac4a9660bABCc78304580E1ea67749f0351`](https://testnet.arcscan.app/address/0xaef1bac4a9660bABCc78304580E1ea67749f0351) | live; `stake` + `settle` exercised; ERC-8183 full lifecycle emitted |
| `UsycRouter` | [`0xAC5b39B7a5F4df7888B3A1a2cDf65e3ad2C28bb8`](https://testnet.arcscan.app/address/0xAC5b39B7a5F4df7888B3A1a2cDf65e3ad2C28bb8) | live; swaps USDC↔USYC on RISK_OFF regime signal |
| `PredictionOracle` | [`0xbe64545c5e4A6e5a3D7cEEb58e1bb1a8C7C0E2B1`](https://testnet.arcscan.app/address/0xbe64545c5e4A6e5a3D7cEEb58e1bb1a8C7C0E2B1) | live; 3 questions seeded (ETH > $3k, BTC halving impact, Fed rate cut) |

15+ signed transactions across deploy + function calls — full ERC-8004 + ERC-8183 lifecycle verified on-chain. Reproduce with `npm run verify:arc-deployments` (zero gas), `npm run exercise:arc-agent` (3 real tx), `npm run exercise:arc-market` (3 real tx).

**Legacy Arc Testnet deployment** (still live for the original 12-tab demo flow):

| Contract | Address |
|---|---|
| `ArcAgentTreasury` | [`0x4Cf79c89cFd85F788f6A0d8A27e0552902622869`](https://testnet.arcscan.app/address/0x4Cf79c89cFd85F788f6A0d8A27e0552902622869) |
| `ArcStrategyVault` | [`0xdBB4b61fC5Cbc2A456d56aFfF79a27e5155106d0`](https://testnet.arcscan.app/address/0xdBB4b61fC5Cbc2A456d56aFfF79a27e5155106d0) |
| `ArcRiskGuard` | [`0x0F066C8280E67F88B1c7959595E229541aFc531c`](https://testnet.arcscan.app/address/0x0F066C8280E67F88B1c7959595E229541aFc531c) |
| `ArcReceiptRegistry` | [`0xB5F9Ca1350c3EDA3FB2f0C0b7398C88BA2310693`](https://testnet.arcscan.app/address/0xB5F9Ca1350c3EDA3FB2f0C0b7398C88BA2310693) |
| `ArcMindRegistry` (ERC-8004 shim) | [`0xF4BFd93061B160Fa376c7F66De207a00225B4e70`](https://testnet.arcscan.app/address/0xF4BFd93061B160Fa376c7F66De207a00225B4e70) |
| `CopyTradeEscrow` (ERC-8183 events) | [`0x24Cb6d1bE131006e8CB2cb7fBa5675725f9E6Da8`](https://testnet.arcscan.app/address/0x24Cb6d1bE131006e8CB2cb7fBa5675725f9E6Da8) |

## Control API

Product-level routes:

```txt
GET  /api/arc/control/status
GET  /api/arc/control/budget
POST /api/arc/control/budget/top-up
POST /api/arc/control/budget/withdraw
POST /api/arc/control/policy

GET  /api/arc/control/sources
POST /api/arc/control/sources/refresh
POST /api/arc/control/sources/allow
POST /api/arc/control/sources/block

GET  /api/arc/control/strategies
POST /api/arc/control/strategies/enable
POST /api/arc/control/strategies/disable
POST /api/arc/control/strategies/run-once

GET  /api/arc/control/decision/latest
POST /api/arc/control/decision/build
POST /api/arc/control/decision/approve
POST /api/arc/control/decision/reject

GET  /api/arc/control/execution
POST /api/arc/control/execution/cancel
POST /api/arc/control/execution/retry

GET  /api/arc/control/positions
POST /api/arc/control/positions/open
POST /api/arc/control/positions/reduce
POST /api/arc/control/positions/close
POST /api/arc/control/positions/settle
POST /api/arc/control/positions/withdraw

POST /api/arc/control/risk/exit
POST /api/arc/control/risk/arm
POST /api/arc/control/risk/disarm
POST /api/arc/control/risk/reset

GET  /api/arc/control/receipts
GET  /api/arc/control/developer/status
```

Write routes return a single result shape:

```ts
type ControlWriteResult = {
  ok: boolean;
  status: "live" | "blocked" | "failed";
  reason?: string;
  txHash?: string;
  receiptId?: string;
  state?: ControlState;
};
```

## Source Layer

ArcMind never invents live data.

| Source group | Live source | Behavior when unavailable |
|---|---|---|
| Market price | Binance, Coinbase, Hyperliquid public APIs | Source marked unavailable; paid action can be blocked |
| OI / funding | Hyperliquid public API | Source marked unavailable or stale |
| Social / news | Apify-backed public source layer | `needs_key` if token is missing |
| Leader feed | `ARC_LEADER_FEED_URL` with sourced JSON | CopyGuard unavailable; SignalGuard mode remains |
| Developer paid sources | x402 service catalog | Hidden in Developer unless configured |

## Local Development

Install dependencies:

```bash
npm install
cd server
npm install
```

Run backend:

```bash
cd server
npm run dev
```

Run frontend:

```bash
npm run dev
```

Recommended local ports:

```bash
# backend
PORT=8787 npm run dev

# frontend
VITE_SERVER_URL=http://127.0.0.1:8787 VITE_API_BASE=http://127.0.0.1:8787 npm run dev
```

## Integration Matrix (Waves 1–4)

Every integration is **env-gated** and follows the same contract: with the env
key absent the helper returns `{ok:false, reason}` and the UI shows an empty
state. Nothing is ever fabricated.

| Integration | Cost | Required env | Module | Endpoint(s) |
|---|---|---|---|---|
| **OpenRouter LLM** (default: Nous Hermes 3 405B `:free`) | Free tier | `OPENROUTER_API_KEY` | `server/src/llm.ts` | `POST /api/llm/route` · `GET /api/llm/status` |
| **Anthropic direct** (fallback) | Paid | `ANTHROPIC_API_KEY` | `server/src/llm.ts` | (chained) |
| **Hermes self-host** (Nous Research) | Self-hosted (free) | `HERMES_URL` · opt `HERMES_API_KEY` | `server/src/llm.ts` | (chained) |
| **Multi-exchange feeds** (OKX, Coinbase, Binance, Hyperliquid) | Free public | none | `server/src/exchanges.ts` | `GET /api/exchanges/tickers` |
| **Arb scanner** (SSE) | Free | none | `server/src/arb-scanner.ts` | `GET /api/arb/snapshot` · `/api/arb/stream` |
| **Pyth Network ETH/USD** | Free public Hermes | none | `server/src/pyth.ts` | `GET /api/pyth/eth` |
| **Hyperliquid positions** (read-only) | Free public Info API | none | `src/lib/hyperliquid.ts` | (Perp tab UI) |
| **AgentRegistry leaderboard** (slash-bonded) | Free on-chain reads | `VITE_ARC_AGENT_REGISTRY` | `src/lib/agentRegistry.ts` | (Leaderboard tab UI) |
| **Discord alerts** | Free webhook | `DISCORD_WEBHOOK_URL` | `server/src/alerts.ts` | `GET /api/alerts/status` · `POST /api/alerts/test` |
| **Telegram alerts** | Free | `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | `server/src/alerts.ts` | (same) |
| **Circle Paymaster / Wallets / USYC** | Developer testnet (free) | `CIRCLE_API_KEY` · `CIRCLE_PAYMASTER_POLICY_ID` · `CIRCLE_WALLET_SET_ID` · `CIRCLE_USYC_ROUTER_ADDRESS` | `server/src/circle.ts` | `GET /api/circle/status` · `POST /api/circle/wallets/create` |
| **Pinata IPFS pinning** | Free tier | `PINATA_JWT` · opt `PINATA_GATEWAY` | `server/src/pinata.ts` | `GET /api/pinata/status` · `POST /api/pinata/pin` |
| **Farcaster cast bot** (Neynar) | Free tier | `NEYNAR_API_KEY` · `NEYNAR_SIGNER_UUID` | `server/src/farcaster.ts` | `GET /api/farcaster/status` · `POST /api/farcaster/cast` |
| **Apify news scraper** | Free tier (cap'd credits) | `APIFY_TOKEN` | `server/src/apify.ts` | `GET /api/apify/status` · `GET /api/apify/news` |
| **PostHog analytics** | Free 1M events/mo | `VITE_POSTHOG_KEY` · opt `VITE_POSTHOG_HOST` | `src/lib/analytics.ts` | (browser fire-and-forget) |
| **Galxe quest** | Free | static manifest | `docs/galxe-quest.json` | (operator dashboard) |
| **Polymarket Gamma data** | Free public | none | `src/lib/polymarket.ts` | (Predictions tab UI) |
| **Polymarket CLOB exec scaffold** | Free (dry-run) | `POLYMARKET_PRIVATE_KEY` · `POLYMARKET_DRY_RUN` (default `true`) | `server/src/polymarket-exec.ts` | `GET /api/polymarket/status` · `POST /api/polymarket/intent` |
| **Polymarket Kelly intent** (agent loop) | Free (dry-run) | `PREDICTION_BANKROLL_USDC` (default $20) | `server/src/arc-agent-loop.ts` | embedded in decision payload + `lastLoopStatus` |
| **dYdX v4** (read-only positions) | Free public indexer | `VITE_DYDX_ADDRESS` | `src/lib/exchanges/dydx.ts` | (Perp Trading tab) |
| **GMX v2 Arbitrum** (read-only positions) | Free public stats | `VITE_GMX_AGENT_ADDRESS` | `src/lib/exchanges/gmx.ts` | (Perp Trading tab) |
| **The Graph subgraph** | Free hosted service | `GRAPH_DEPLOY_KEY` · `GRAPH_SUBGRAPH_NAME` | `subgraph/` | (deploy via `npm run deploy:studio`) |
| **Galxe quest** | Free | `VITE_GALXE_CAMPAIGN_ID` | `src/components/widgets/agora/ArcGalxeQuestWidget.tsx` | (Developer Console) |

### Paid vs free summary

- **Free / no key**: every signal source (Hyperliquid, OKX, Coinbase, Binance,
  Pyth, Polymarket Gamma) and the OpenRouter `:free` route work out of the box.
- **Free tier with sign-up**: OpenRouter, Pinata, Neynar, Apify, PostHog,
  Circle developer console — none required for the platform to render.
- **Paid optional**: Anthropic direct, Apify above free credits, OpenRouter
  non-free models.
- **Live tx**: requires funded keys (Arc signer, Polygon signer for Polymarket).
  Polymarket live execution is gated behind explicit `POLYMARKET_DRY_RUN=false`
  AND `live_signer_not_implemented` — a separate signer must be deployed
  before real bets fire.

## Required Environment

Backend (all optional except `NODE_ENV`/`PORT`/`CORS_ORIGIN` — missing keys
disable the feature gracefully):

```txt
NODE_ENV=production
PORT=8787
CORS_ORIGIN=https://toll-gatee.vercel.app
X402_NETWORK=arc-testnet
X402_ASSET=USDC
X402_PAYOUT_ADDRESS=<Arc payout wallet>
ARC_RPC_URL=<Arc RPC URL>
ARC_PRIVATE_KEY=<dedicated funded Arc signer>
ARC_AGENT_ID=<agent id>
ARC_SIGNAL_SOURCE_MODE=live

# LLM routing — first available provider wins
OPENROUTER_API_KEY=<sk-or-v1-…>
OPENROUTER_MODEL=nousresearch/hermes-3-llama-3.1-405b:free
ANTHROPIC_API_KEY=<sk-ant-…>
HERMES_URL=http://localhost:8080
HERMES_API_KEY=<optional bearer for Hermes>

# Alerts
DISCORD_WEBHOOK_URL=<https://discord.com/api/webhooks/…>
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_CHAT_ID=<chat id>

# Circle
CIRCLE_API_KEY=<TEST_API_KEY:…>
CIRCLE_WALLET_SET_ID=<wallet set id>
CIRCLE_PAYMASTER_POLICY_ID=<policy id>
CIRCLE_USYC_ROUTER_ADDRESS=<router address>

# Data + social
APIFY_TOKEN=<APIFY token>
PINATA_JWT=<Pinata JWT>
PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs
NEYNAR_API_KEY=<Neynar API key>
NEYNAR_SIGNER_UUID=<signer UUID>

# Polymarket (dry-run by default; live needs a signer wired separately)
POLYMARKET_PRIVATE_KEY=<Polygon EOA, ≥ $5 USDC funded>
POLYMARKET_DRY_RUN=true
POLYMARKET_CLOB_BASE=https://clob.polymarket.com
```

Frontend:

```txt
VITE_SERVER_URL=https://tollgate-1.onrender.com
VITE_API_BASE=https://tollgate-1.onrender.com
VITE_ARC_AGENT_TREASURY_ADDRESS=0x4Cf79c89cFd85F788f6A0d8A27e0552902622869
VITE_ARC_STRATEGY_VAULT_ADDRESS=0xdBB4b61fC5Cbc2A456d56aFfF79a27e5155106d0
VITE_ARC_RISK_GUARD_ADDRESS=0x0F066C8280E67F88B1c7959595E229541aFc531c
VITE_ARC_RECEIPT_REGISTRY_ADDRESS=0xB5F9Ca1350c3EDA3FB2f0C0b7398C88BA2310693
VITE_ARC_MARKET_FACTORY=0x9C36Aa5fa856893Ae70E33014985678E4Ce198AD
VITE_ARC_AGENT_REGISTRY=0x8aD47542EBbd92696E7C69E756bdf654d867581d
VITE_ARC_INITIAL_MARKET=0xaef1bac4a9660bABCc78304580E1ea67749f0351
VITE_ARC_RPC_URL=https://rpc.testnet.arc-node.thecanteenapp.com/v1/public
VITE_ARC_EXPLORER=https://testnet.arcscan.app
VITE_POSTHOG_KEY=<phc_…>
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

## Verification

```bash
# Frontend (122 tests)
npm test
npx tsc --noEmit
npm run build

# Contracts (34 tests including market factory + ERC-8004/8183 lifecycle)
cd contracts && npx hardhat test
cd contracts && npx hardhat compile

# Standalone agent package
cd packages/arcmind-agent && npx tsc --noEmit

# Server (135 tests across LLM routing, exchanges, Pyth, alerts, Circle,
# Pinata, Farcaster, Apify, Polymarket exec, arb scanner, traction,
# Kelly intent math, regime classifier, degradation evaluator, etc.)
cd server && npm test
cd server && npm run typecheck
```

Production smoke:

```bash
AGORA_FRONTEND_URL=https://toll-gatee.vercel.app \
AGORA_BACKEND_URL=https://tollgate-1.onrender.com \
npm run test:agora-live
```

## Security And Product Boundaries

- Agent Budget and Strategy Vault are separate.
- Agent Budget cannot pay user stake.
- Strategy Vault cannot pay data-source calls.
- Manual user-money actions require a wallet transaction.
- Autonomous paid actions require budget, policy and risk gates.
- Failed or blocked actions do not mutate budget or positions.
- Receipts show live transaction hashes only for real Arc transactions.
- Developer tooling is secondary and does not replace the user product flow.

## Repository Map

```txt
contracts/contracts/
  MarketFactory.sol               Production factory — auto-generates markets
  CopyTradeMarket.sol             Per-market escrow with full security primitives
  AgentRegistry.sol               ERC-8004 + slashing + AccessControl
  CopyTradeEscrow.sol             Legacy (still emits ERC-8183 events)
  ArcMindRegistry.sol             Legacy (ERC-8004 shim)
contracts/scripts/
  deploy-market-factory.cjs       Deploys factory + initial ETH/USDC market
contracts/test/
  market-factory.test.cjs         24 lifecycle + security tests
  arc-erc-compat.test.cjs         10 ERC-8004/8183 shim tests

packages/arcmind-agent/             ElizaOS-compatible standalone agent
  src/character.ts                ArcMind character file
  src/providers/                  CoinGecko, Hyperliquid OI, leader feed
  src/actions/                    decideEthDirection, recordOnChain, predictionBet (Kelly)
  src/evaluators/                 decisionAccuracy, degradation (7d win-rate)
  src/service/arcMindService.ts   30-min decision loop
  src/types.ts                    Local shim of @elizaos/core types

subgraph/                         The Graph AssemblyScript subgraph
  schema.graphql                  Agent, Market, Decision, Settlement, Slash entities
  src/agent-registry.ts           AgentRegistered, DecisionRecorded/Resolved, AgentSlashed
  src/market-factory.ts           MarketDeployed
  src/copy-trade-market.ts        Staked, Settled

infra/hermes/                     Hermes self-hosted agent runner
  install.sh                      One-line installer (docker backend)
  skills/arcmind.yaml             ArcMind exposed as a Hermes skill (MCP-compatible)

src/lib/
  hyperliquid.ts                  Hyperliquid Info API client (vaults/leaderboard)
  cctp.ts                         CCTP intent + fee estimator (Mirror flow)
  marketFactory.ts                Read-only client for the on-chain factory
  agora.ts                        Arc helpers + ERC-8183 lifecycle reader + Paymaster
  exchanges/dydx.ts               dYdX v4 read-only positions (Cosmos indexer)
  exchanges/gmx.ts                GMX v2 Arbitrum read-only positions
  predictionOracle.ts             PredictionOracle.sol reader (native Arc markets)
  polymarket.ts                   Polymarket Gamma API client
  analytics.ts                    PostHog fire-and-forget (env-gated)

src/components/widgets/agora/
  ArcDiscoverWidget.tsx           Discover tab (native markets + Hyperliquid leaderboard)
  ArcAgentDetailWidget.tsx        Agent profile page (portfolio sparkline, reasoning)
  ArcMindOverviewWidget.tsx       ArcMind hero + position card
  ArcMindAlgorithmProfile.tsx     "Who am I copying?" shared card
  ArcMindWidgets.tsx              Copy & Position + LLM Debate Room
  ArcTractionWidget.tsx           Live traction strip (on-chain event counts)
  ArbScannerWidget.tsx            Real-time arb opportunities (SSE)
  ArcPerpTradingWidget.tsx        dYdX v4 + GMX v2 read-only positions
  ArcPredictionsWidget.tsx        Polymarket events + native Arc prediction markets
  ArcSlashLeaderboardWidget.tsx   ERC-8004 slash-bonded leaderboard
  ArcGalxeQuestWidget.tsx         Galxe Pioneer NFT quest checklist
  ArcMultiExchangeWidget.tsx      Cross-platform positions panel
  ArcDeveloperConsoleWidget.tsx   15 collapsible power-user sections
  CrossChainMirrorModal.tsx       CCTP intent flow
  JobLifecycleViewer.tsx          ERC-8183 Open/Funded/Submitted/Terminal viewer

server/src/
  arc-agent-loop.ts               Autonomous loop: regime + degradation + Kelly + on-chain record
  arc-control.ts                  Budget / policy / positions / risk gate state machine
  exchanges.ts                    OKX, Coinbase, Binance, Hyperliquid ticker cache
  arb-scanner.ts                  Multi-venue spread scanner + SSE emitter
  pyth.ts                         Pyth Network Hermes price decoder
  alerts.ts                       Shared Discord + Telegram dispatcher (10-min dedup)
  farcaster.ts                    Neynar cast bot (auto-cast on BUY/SELL)
  apify.ts                        CryptoPanic + Twitter trends scraper
  pinata.ts                       IPFS pinning for decision traces
  llm.ts                          OpenRouter → Anthropic → Hermes routing chain
  polymarket-exec.ts              Polymarket CLOB intent recorder (dry-run default)
  circle.ts                       Circle Paymaster + Programmable Wallets

src/pages/WorkspacePage.tsx       Agora tab dispatcher
src/workspaces/agora/             Workspace module (12-tab TAB_MAP)
```

## Links

- Live product: [https://toll-gatee.vercel.app/](https://toll-gatee.vercel.app/)
- Backend: [https://tollgate-1.onrender.com](https://tollgate-1.onrender.com)
- GitHub: [https://github.com/kravadk/TollGate](https://github.com/kravadk/TollGate)
- Agora Agents Hackathon: [https://agora.thecanteenapp.com/](https://agora.thecanteenapp.com/)
- Arc: [https://www.arc.network/](https://www.arc.network/)
- Circle Developer Docs: [https://developers.circle.com/](https://developers.circle.com/)

