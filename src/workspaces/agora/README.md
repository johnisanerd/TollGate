# ArcMind Control Layer

**Hackathon:** Arc Agora Hackathon — Circle / Arc L1  
**Track:** AI Agent Payments · USDC-Native · On-Chain Decision Proof  
**Network:** Arc Testnet (`chainId 0x4cef52`, native token: USDC)

---

## What it does

Give an AI market agent a USDC budget, risk limits, approved data sources, and proof-backed execution on Arc. User capital stays separate from agent spending at all times.

```
User funds CopyTradeEscrow.sol (USDC)
  → ArcMind reads Hyperliquid OI + ETH price + Polymarket
  → Records BUY / SELL / HOLD decision on ArcMindRegistry (on-chain)
  → Circle Paymaster covers gas — agents never need ETH
  → Kill switch triggers if drawdown > user threshold
  → Receipt NFT proves every decision on-chain
```

## Key features

| Tab | What it shows |
|-----|--------------|
| Agent Budget | Daily USDC spend cap; per-request limit; live burn rate |
| Strategies | Copy ArcMind's ETH/USDC strategy; pause / withdraw |
| Sources | Approved data sources with x402 Nanopayments per query |
| Decision Room | Live ArcMind reasoning trace; Bullish vs Bearish debate |
| Execution | Manual BUY/SELL at live ETH price via Arc DEX |
| Positions | Real-time PnL on open copy-trade positions |
| Risk Guard | Drawdown threshold; on-chain kill switch; alert history |
| Receipts | All Arc-settled receipts with on-chain proof |
| Developer | Arc API reference; SDK snippets; live contract calls |
| Docs | Full Arc integration docs portal |
| Integrations | Arc SDK, CCTP bridge, ERC-8183 escrow, x402 feed |

## Deployed contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| ArcMindRegistry | `0x24Cb6d1bE131006e8CB2cb7fBa5675725f9E6Da8` |
| CopyTradeEscrow | `0xF4BFd93061B160Fa376c7F66De207a00225B4e70` |

## Why Arc

Arc is EVM-compatible with USDC as the native gas token — agents never need to hold ETH. Circle Paymaster abstracts gas entirely. Combined with ERC-8183 escrow and on-chain decision logging, Arc is the only chain where an AI agent can operate end-to-end in USDC with zero friction.

## Run locally

```bash
VITE_ARC_REGISTRY_ADDRESS=0x24Cb... VITE_ARC_ESCROW_ADDRESS=0xF4BF... npm run dev
```
