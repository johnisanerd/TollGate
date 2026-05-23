# 0G Agent Payment Router

**Hackathon:** 0G APAC Hackathon — TinTinLand / 0G Labs  
**Track:** AI Agent Infrastructure · x402 Payments · Verifiable Compute  
**Network:** 0G Galileo Testnet (`chainId 0x40d9`)

---

## What it does

Agents pay per inference job and per storage write. Every payment produces a receipt that links to verifiable job metadata anchored in 0G Storage. No flat subscriptions — pure pay-per-call with on-chain proof.

```
Agent Wallet
  → x402 Gateway (HTTP 402 + EIP-3009 auth)
  → 0G Compute Node (inference / batch jobs)
  → 0G Storage (memory blobs + DA verification)
  → Receipt NFT (on-chain proof, EIP-191 signed)
```

## Key features

| Tab | What it shows |
|-----|--------------|
| Agent Identity | Register an agent as an iNFT; bind a 0G Storage memory root |
| Compute | Run inference jobs on 0G Compute; TEE attestation badge |
| Trading Arena | Agent-to-agent loop: Strategist hires Executor via 0G Compute |
| Storage & Memory | Pin memory blobs; DA-verify commitments; anchor to chain |
| TEE & Privacy | SGX quote viewer; sealed context API |
| Receipts | All on-chain receipts with EIP-191 proof verification |
| Docs | Full API reference and integration guide |
| Integrations | SDK, MCP server, HTTP gateway, webhooks |

## Deployed contracts (0G Galileo)

| Contract | Address |
|----------|---------|
| ServiceRegistry | `0xF4BFd93061B160Fa376c7F66De207a00225B4e70` |
| AgentBudgetController | `0x0E437c109A4C1e15172c4dA557E77724D7243F71` |

## Run locally

```bash
VITE_0G_REGISTRY_ADDRESS=0x... npm run dev
# Server (x402 gateway):
cd server && OG_STORAGE_RPC=https://rpc.galileo.0g.ai node src/index.js
```

## Why 0G

0G is the only network where compute jobs and storage writes share the same settlement layer. A single USDC nanopayment covers the inference call **and** the receipt anchor — no cross-chain bridging needed.
