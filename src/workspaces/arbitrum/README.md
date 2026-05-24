# Arbitrum Agent Services

**Hackathon:** Arbitrum Hackathon
**Track:** Agent Payments · USDC · Escrow · Stylus Contracts
**Networks:** Arbitrum One (`0xa4b1`) · Arbitrum Sepolia (`0x66eee`)

---

## What it does

Agents pay USDC for API services on Arbitrum with enforced spend limits, on-chain receipts, and optional escrowed delivery. Providers list services in a ServiceRegistry; agents top up an AgentBudgetController and spend per-call.

## Key features

| Tab | What it shows |
|-----|--------------|
| Agent Marketplace | Browse and call registered services; live spend meter |
| USDC Payments | Batch payouts; token transfer history |
| Stylus Contracts | Deploy Rust-based Stylus contracts; copy deploy command |
| Escrow | Create / release / refund escrowed agent jobs |
| Wallet Protection | Budget panel; on-chain registry viewer |

## Deployed contracts

| Contract | Network | Address |
|----------|---------|---------|
| ServiceRegistry | Arbitrum One | `0x990Fe8e3f7d59148593D9B174a70F2Cd79C7bBc7` |
| AgentBudgetController | Arbitrum One | `0x1dF5382BDb63537cd731A8e3Ee09eF10EA4179a3` |

## Why Arbitrum

Arbitrum One has the deepest USDC liquidity of any L2 and the lowest gas for ERC-20 transfers. Stylus lets service providers write high-performance contract logic in Rust — critical for on-chain verification of AI inference results.
