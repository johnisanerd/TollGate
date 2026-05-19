# ArcMind — Autonomous Trading Intelligence

**App route:** `/app/agora`

**Active execution plan:** [`docs/AGORA-ACTIVE-EXECUTION-PLAN.md`](../../../docs/AGORA-ACTIVE-EXECUTION-PLAN.md). Read this first before changing Agora; it is the ordered source of truth for current product work.

## What it does

ArcMind is an autonomous trading agent that publishes its reasoning step by step, lets anyone copy-trade with $1 minimum, and hard-kills all positions when drawdown exceeds the threshold — all settled in USDC on Arc L1 via CCTP cross-chain transfers. Market data feeds (Hyperliquid OI, Polymarket sentiment, news sentiment, whale flows) are sold as sub-cent x402 Nanopayments.

## Features

| Feature | Description |
|---|---|
| CCTP cross-chain arb | Detects USDC price gaps across Arc, Base, Arbitrum; executes via Circle CCTP |
| Copy-trading escrow | `CopyTradeEscrow.sol`: stake USDC, agent allocates + settles PnL automatically |
| Reasoning trace marketplace | Buy step-by-step ArcMind decision logs via x402; each trace includes Kelly sizing and outcome |
| Kill switch | When drawdown exceeds threshold: stops entries, liquidates escrows, posts on-chain kill event |
| Nanopayment data feeds | $0.001–$0.005/call for Hyperliquid OI, Polymarket, news sentiment, whale tracker |
| Circle Paymaster | Gas-free USDC portfolio rebalancing via Circle Paymaster |

## Contracts deployed

| Contract | Network | Address |
|---|---|---|
| `ArcMindRegistry` | Arc Testnet | `0x24Cb6d1bE131006e8CB2cb7fBa5675725f9E6Da8` |
| `CopyTradeEscrow` | Arc Testnet | via `deploy-arc.cjs` |

## Paid APIs (x402 services)

| Service ID | Name | Price | Description |
|---|---|---|---|
| `svc_arc_oracle` | Arc Price Oracle | $0.02 | Real-time USDC price across Arc, Arbitrum, Base — spots cross-chain gaps |
| `svc_arc_arb` | Cross-Chain Arb Executor | $0.05 | Executes USDC arbitrage via CCTP; monitors finality, returns net profit |
| `svc_arc_portfolio` | Portfolio Rebalance API | $0.08 | Multi-asset rebalance instructions settled via Circle Paymaster |
| `svc_arc_signal_hl` | Hyperliquid OI Feed | $0.01 | Open interest delta + funding rate from Hyperliquid perps |
| `svc_arc_signal_poly` | Polymarket Sentiment Feed | $0.001 | YES probability for top macro events on Polymarket |
| `svc_arc_signal_news` | News Sentiment Oracle | $0.005 | Aggregated sentiment from 200+ crypto news sources |
| `svc_arc_signal_whale` | On-Chain Whale Tracker | $0.003 | Net wallet flows >$100k across Arc, Base, and Arbitrum |
| `svc_arc_reasoning` | Reasoning Trace Marketplace | $0.01 | ArcMind step-by-step decision logs: signal → Kelly sizing → outcome |
| `svc_arc_copytrade` | Copy ArcMind — ERC-8183 Escrow | $1.00 | Open copy-trade position in `CopyTradeEscrow.sol`; auto PnL settlement |

## UI tabs

1. **Overview** — ArcMind performance summary, live arb feed, kill switch status
2. **Agent Engine** — live cross-chain price oracle + CCTP arb executor panel
3. **Copy Strategy** — stake USDC into `CopyTradeEscrow.sol`, view PnL + kill threshold
4. **Reasoning Proofs** — buy ArcMind decision trace via x402; view signal, sizing, outcome
5. **Decision Guard** — 4 live data feeds: Hyperliquid OI, Polymarket, news sentiment, whale tracker
6. **Portfolio Manager** — multi-asset rebalancer: target weights → rebalance calldata via Paymaster
7. **Circle Tools** — CCTP cross-chain USDC transfer builder + status tracker
8. **Receipts** — full payment history with Arc explorer links

## Kill switch mechanism

When cumulative drawdown exceeds the configured threshold (default 15%):
1. All new position entries are stopped
2. A `killSwitch` event is posted to `ArcMindRegistry` on-chain
3. All copy-trade escrows are liquidated at current mark price
4. A receipt is emitted for the forced exit — auditable by anyone via the registry

## Nanopayment economics

Signal calls are priced at $0.001–$0.005 per call. This works because x402 challenges are issued and verified server-side with no per-call gas cost; on-chain settlement is batched and amortised across many calls.
