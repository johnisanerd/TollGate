# Mantle Agent Wallet Economy

**Hackathon:** Mantle Turing Test Hackathon
**Track:** AI Agent Wallets · Yield-Bearing Treasury · On-Chain Credit Scoring
**Networks:** Mantle Mainnet (`0x1388`) · Mantle Sepolia (`0x138b`)

---

## What it does

Agent wallets with enforced spend policies buy Mantle alpha signals, mETH/USDY yield rotations, and RWA risk reports — all paid per call. Surplus is automatically deployed into mETH yield. Every agent gets a FICO-style credit score on-chain.

## Key features

| Tab | What it shows |
|-----|--------------|
| Agent Economy | Auto-cycle A2A loop; deploy surplus → mETH; NFT chip per cycle |
| Alpha Data | Live mETH whale transfers (real `eth_getLogs`) |
| Yield Compare | mETH vs USDY vs stETH — DeFiLlama live APY |
| Yield Optimizer | Drag-to-target portfolio rebalancer |
| RWA Data | Real-world asset risk reports paid per query |
| Trading Strategies | AlphaBot; strategy backtesting |
| Agent Credit Score | On-chain FICO score; live AgentCreditRegistry calls |
| Budget Dashboard | Daily spend cap; burn rate; live contract state |

## Deployed contracts (Mantle Mainnet)

| Contract | Address |
|----------|---------|
| AgentCreditRegistry | `0xA8FdDb9F6f54Fbf127cb8c71049cB1e19f5836F9` |
| AgentBudgetController | `0x4cA80A3af6e0a4E0c85AB31E3B4a86C6BffF17CB\` |

## Why Mantle

mETH is the highest-TVL LST on Mantle and earns 3.9–4.8% APY. Agent wallets that auto-deploy idle USDC into mETH turn payment infrastructure into a yield-generating treasury. The AgentCreditRegistry brings credit scoring to autonomous AI agents for the first time.
