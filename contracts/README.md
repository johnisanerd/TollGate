# AgentPay Router — on-chain contracts

The chain-specific contracts and one-command deploy scripts, kept in their own
package so the heavy build tooling (Hardhat, the 0G SDK, OpenZeppelin) never
touches the frontend bundle.

| Piece | What it is |
| --- | --- |
| `contracts/AgentReceiptRegistry.sol` | **0G** — permissionless, append-only notary for x402 receipts. `record(bytes32 receiptHash, bytes32 payloadHash)` anchors a paid receipt; emits `ReceiptRecorded`. No owner, no admin, no funds held. |
| `contracts/AgentIdentityRegistry.sol` | **Mantle** — ERC-8004-style agent identity registry implemented as an ERC-721 (the agent identity NFT). `register(domain, agentAddress)` mints it; `recordFeedback(agentId, score, ref)` is a light on-chain reputation tally. No admin, no funds held. |
| `contracts/AgentVault.sol` | **Mantle** — an AI-callable vault: `deposit()` parks idle MNT, `deployToYield(amount, strategyRef)` marks capital allocated to mETH, `recordDecision(decisionHash, contextHash)` anchors an agent decision on-chain, `withdraw`/`unwind` reverse it. On Mantle mainnet `yieldToken` is mETH; in the demo build it is the zero address (intent + accounting only). No owner. |
| `contracts/AgentEscrow.sol` | **Arbitrum** — escrow for agent→provider payments: `open(payee, token, amount, deadline, ref)` (native ETH or ERC-20), `release(id)` (payer, on delivery), `refund(id)` (payer, after deadline), `cancel(id)` (payee declines). Single-claim, `ReentrancyGuard` + `SafeERC20`. No owner, no fees. |
| `scripts/deploy.cjs` | Deploys `AgentReceiptRegistry` to a 0G network → prints address + explorer link, writes `deployments/<network>.json`. |
| `scripts/deploy-mantle.cjs` | Deploys `AgentIdentityRegistry` + `AgentVault` to a Mantle network → prints both addresses + explorer links, writes `deployments/<network>.json`. |
| `scripts/deploy-arbitrum.cjs` | Deploys `AgentEscrow` to an Arbitrum chain (Sepolia / One / an Orbit chain) → prints address + explorer link, writes `deployments/<network>.json`. |
| `scripts/og-upload.cjs` | Uploads a file to 0G Storage with `@0glabs/0g-ts-sdk` → prints the Merkle root + storage tx. Mirrors the in-app "Pin to 0G Storage" widget. |
| `hardhat.config.cjs` | Networks: `og` / `ogTestnet` (0G), `mantle` / `mantleSepolia` (Mantle), `arbitrumOne` / `arbitrumSepolia` / `orbit` (Arbitrum) — all driven by `contracts/.env`. |

Install once: `cd contracts && npm install` (use `--legacy-peer-deps` — the optional
`@0glabs/0g-ts-sdk` pins `ethers` tightly).

## 0G — one command from live

```bash
cd contracts
cp .env.example .env          # set OG_RPC_URL + OG_PRIVATE_KEY (a funded key)
npm install --legacy-peer-deps
npm run deploy:0g             # 0G mainnet   →  prints VITE_0G_REGISTRY_ADDRESS=0x…
# or:  npm run deploy:0g-testnet   (0G Galileo testnet, for a dry run first)
```

**Already deployed (live demo):** `AgentReceiptRegistry` at
`0xF4BFd93061B160Fa376c7F66De207a00225B4e70` on 0G mainnet (chainId 16661) —
https://chainscan.0g.ai/address/0xF4BFd93061B160Fa376c7F66De207a00225B4e70

Frontend `.env.local`:

```bash
VITE_0G_REGISTRY_ADDRESS=0xF4BFd93061B160Fa376c7F66De207a00225B4e70   # or your own redeploy
VITE_0G_CHAIN_ID=0x4115                  # 16661 = 0G mainnet; 0x40da = 16602 Galileo testnet
VITE_0G_EXPLORER=https://chainscan.0g.ai
VITE_0G_STORAGE_INDEXER=                 # optional — set → real Merkle roots in the Pin widget; else deterministic "simulated" root
```

With `VITE_0G_REGISTRY_ADDRESS` set, the 0G workspace's **Pin to 0G Storage** and
**Run an inference job** widgets show an **"Anchor on 0G"** action: it sends a real
`record(...)` tx from the connected wallet (the wallet switches/adds the 0G chain) and
links the receipt to a 0G Explorer transaction. Unset → everything still works — the
anchor button just isn't offered (same graceful-degradation pattern as the server's `dev-bypass`).

## Mantle — one command from live

```bash
cd contracts
cp .env.example .env              # set MANTLE_PRIVATE_KEY (a funded key); RPCs have defaults
npm install --legacy-peer-deps
npm run deploy:mantle             # Mantle mainnet (5000)   →  prints VITE_MANTLE_IDENTITY_ADDRESS / VITE_MANTLE_VAULT_ADDRESS
# or:  npm run deploy:mantle-sepolia   (Mantle Sepolia 5003, dry run)
```

Frontend `.env.local`:

```bash
VITE_MANTLE_IDENTITY_ADDRESS=0x…   # from the deploy output
VITE_MANTLE_VAULT_ADDRESS=0x…
VITE_MANTLE_CHAIN_ID=0x1388        # 5000 = Mantle mainnet; 0x138b = 5003 Mantle Sepolia
VITE_MANTLE_EXPLORER=https://explorer.mantle.xyz
```

With these set, the Mantle workspace's **Agents** tab gains an **"ERC-8004 agent identity"**
panel (registers a real identity NFT and shows the agentId + token link) and an **"AgentVault"**
panel (real `deposit` / `deployToYield` / `recordDecision` txs). Unset → those panels show a
"scaffolded — one command from live" note; the rest of the Mantle workspace runs in simulation.

`AgentVault`'s constructor takes the yield token. The deploy script defaults it to mETH
(`0xcDA86A272531e8640cD7F1a92c01839911B90bb0`) on Mantle mainnet and the zero address on
Sepolia; override with `MANTLE_METH_ADDRESS` in `.env`.

## Arbitrum — one command from live

```bash
cd contracts
cp .env.example .env              # set ARBITRUM_PRIVATE_KEY (a funded key); RPCs have defaults
npm install --legacy-peer-deps
npm run deploy:arb                # Arbitrum Sepolia (421614)   →  prints VITE_ARBITRUM_ESCROW_ADDRESS=0x…
# or:  npm run deploy:arb-one     (Arbitrum One 42161)
# or:  npm run deploy:orbit       (set ORBIT_RPC_URL / ORBIT_CHAIN_ID / ORBIT_EXPLORER_URL — e.g. Robinhood Chain)
```

**Already deployed (live demo):** `AgentEscrow` at `0x990Fe8e3f7d59148593D9B174a70F2Cd79C7bBc7`
on Arbitrum Sepolia (chainId 421614) — https://sepolia.arbiscan.io/address/0x990Fe8e3f7d59148593D9B174a70F2Cd79C7bBc7

Frontend `.env.local`:

```bash
VITE_ARBITRUM_ESCROW_ADDRESS=0x990Fe8e3f7d59148593D9B174a70F2Cd79C7bBc7   # or your own redeploy
VITE_ARBITRUM_CHAIN_ID=0x66eee     # 421614 = Arbitrum Sepolia; 0xa4b1 = 42161 Arbitrum One
VITE_ARBITRUM_EXPLORER=https://sepolia.arbiscan.io
```

With `VITE_ARBITRUM_ESCROW_ADDRESS` set, the Arbitrum **Escrow** tab gains a real **"AgentEscrow"**
panel: open a native-ETH escrow to a provider with a deadline, then release / refund / cancel — all
real txs from the connected wallet (which it switches/adds to the configured Arbitrum chain). The
contract also supports ERC-20 escrows (e.g. USDC) via `open(payee, token, amount, …)` after an `approve`.

## 0G Storage upload (optional)

```bash
cd contracts
# in .env: OG_STORAGE_RPC, OG_STORAGE_INDEXER, OG_PRIVATE_KEY
npm install --legacy-peer-deps
npm run upload:0g -- ./some-file.json   # prints the Merkle root + storage tx
```

If `@0glabs/0g-ts-sdk` isn't installed or the env isn't set, the script prints what's
missing and exits cleanly — it never breaks the rest of the project.

## Arc Testnet (Agora Hackathon) — deployed contracts

All contracts live on **Arc Testnet** (chainId `5042002`).  
Explorer: `https://testnet.arcscan.app`  
Deployer: `0x82736f84Ad234566180F902237e2Fb4c35177bDB`

### Core control layer

| Contract | Address | Deploy tx |
|---|---|---|
| AgentRegistry (ERC-8004) | `0x8aD47542EBbd92696E7C69E756bdf654d867581d` | [0x294dd785](https://testnet.arcscan.app/tx/0x294dd78563f0b06a81680488565c5d4bd0c22f9af1733648599e5369b06d9701) |
| MarketFactory | `0x9C36Aa5fa856893Ae70E33014985678E4Ce198AD` | [0x8ea44f0c](https://testnet.arcscan.app/tx/0x8ea44f0c1ff492b35fa49ed3e05adf832de424894e82914f8f7bd6a8283528a9) |
| CopyTradeMarket ETH/USDC | `0xaef1bac4a9660bABCc78304580E1ea67749f0351` | [0xd3cdce86](https://testnet.arcscan.app/tx/0xd3cdce8668421477326291f87e80517a4723fa324c042a034923a1d7c75f0d65) |
| ArcAgentTreasury | `0x4Cf79c89cFd85F788f6A0d8A27e0552902622869` | [0x8c631250](https://testnet.arcscan.app/tx/0x8c63125019a06ea7a7824404b295482e04651c3d4367c9587e88a37b20678bde) |
| ArcStrategyVault | `0xdBB4b61fC5Cbc2A456d56aFfF79a27e5155106d0` | [0x5ca07be9](https://testnet.arcscan.app/tx/0x5ca07be91893873902570f7c1687383730a843c9e2129ddfdf6e5ac4683dd9a8) |
| ArcRiskGuard | `0x0F066C8280E67F88B1c7959595E229541aFc531c` | [0x77cf4954](https://testnet.arcscan.app/tx/0x77cf4954eff56663d67178d4a654f6f71d4e3ebe653e1bf9e329bd2d29d6b4e4) |
| ArcReceiptRegistry | `0xB5F9Ca1350c3EDA3FB2f0C0b7398C88BA2310693` | [0x1852e2aa](https://testnet.arcscan.app/tx/0x1852e2aa052e906f874648f347e388f5bc43d37b2247c5783628eea3ebd1ac85) |

### Circle & prediction layer

| Contract | Address | Deploy tx |
|---|---|---|
| UsycRouter (RISK_OFF→USYC) | `0xAC5b39B79E67019D08A0E24CC18F154445eAc275` | [0xaeabf663](https://testnet.arcscan.app/tx/0xaeabf663c6cd9a1c9043a505a1a65ca9480219190a49792fcf4a473b435c2639) |
| PredictionOracle | `0xbe64545c3753D613dC91c8695DE6bD67ec9390a6` | [0xb1ef2f5e](https://testnet.arcscan.app/tx/0xb1ef2f5eb7546bd2a15cc6609abf18f438d978d7d2c67f91e770bcc139614ab2) |

### Seeded prediction questions

| Question slug | Seed tx |
|---|---|
| fed-rate-cut-jun-2026 | [0xbe04d49c](https://testnet.arcscan.app/tx/0xbe04d49cb7280bbca23d3fed272e7bb5cb6612bbe3fbc8e388546785e374d19c) |
| eth-above-5000-eoy-2026 | [0x14f9a0a2](https://testnet.arcscan.app/tx/0x14f9a0a2ccbfeea75b00444bafcc0b8f0ddb50ac18d06bf3ead8e6d0898f29a5) |
| btc-spot-etf-flows-positive-q2-2026 | [0xa113be7c](https://testnet.arcscan.app/tx/0xa113be7c64261fc8c213bd420933e82489e264868001c3a26207a8e997fac248) |

Total: **12 verified on-chain transactions** across 9 contracts on Arc Testnet.

---

## Notes

- `contracts/.env` is git-ignored. Never commit a private key.
- `deployments/<network>.json` records the deployed address(es) + tx hashes + chainId + deployer + ISO timestamp after each deploy — commit it so the submission has a permanent record.
- Endpoints (RPC / explorer / indexer) move; check the current 0G / Mantle / Arbitrum docs and update `.env`. The defaults baked into `hardhat.config.cjs`: 0G mainnet `https://evmrpc.0g.ai`, 0G Galileo testnet `https://evmrpc-testnet.0g.ai`, Mantle mainnet `https://rpc.mantle.xyz`, Mantle Sepolia `https://rpc.sepolia.mantle.xyz`, Arbitrum One `https://arb1.arbitrum.io/rpc`, Arbitrum Sepolia `https://sepolia-rollup.arbitrum.io/rpc`.
- Solidity compiles to the `paris` EVM target with the optimizer on; OpenZeppelin is pinned to `5.0.2` (later 5.1+ emits the Cancun `mcopy` opcode). `AgentEscrow` uses OZ `ReentrancyGuard` + `SafeERC20`.
