# @arcmind/agent

ElizaOS-compatible autonomous trading agent. Drop-in plug-in shape: **Character + Providers + Actions + Evaluators + Service** — the same architecture used by `@elizaos/core` plugins.

This package replaces the bespoke `server/src/arc-agent-loop.ts` with a clean, framework-shaped agent that is ready to migrate to the full ElizaOS framework with no business-logic rewrites.

## What's inside

```
src/
├── index.ts                — startArcMindAgent() entrypoint
├── character.ts            — ArcMind character file (bio, lore, settings)
├── types.ts                — ElizaOS-compatible Action/Provider/Evaluator/Service shims
├── runtime.ts              — Minimal IAgentRuntime (in-memory; swap to @elizaos/core later)
├── providers/
│   ├── coingeckoPriceProvider.ts  — ETH/USD spot + 24h change
│   ├── hyperliquidOiProvider.ts   — OI + funding rate (POST api.hyperliquid.xyz/info)
│   └── leaderFeedProvider.ts      — optional external copy-leader feed
├── actions/
│   ├── decideEthDirection.ts      — BUY/SELL/HOLD + natural-language reasoning
│   └── recordOnChain.ts           — anchor decision hash on ArcMindRegistry
├── evaluators/
│   └── decisionAccuracyEvaluator.ts — grades previous decision vs actual move
└── service/
    └── arcMindService.ts   — 30-minute loop orchestrator
```

## Usage

```ts
import { startArcMindAgent } from "@arcmind/agent";

const stop = await startArcMindAgent({
  settings: {
    ARC_PRIVATE_KEY: process.env.ARC_PRIVATE_KEY,
    ARC_AGENT_ID:    process.env.ARC_AGENT_ID,
    ARC_RPC_URL:     "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public",
  },
});
// …later:
await stop();
```

If `ARC_PRIVATE_KEY` or `ARC_AGENT_ID` is missing the agent runs in **paper mode** — decisions are still produced and graded, just not anchored on-chain.

## Wiring into the existing TollGate server

The server currently boots the legacy loop in `server/src/index.ts`:

```ts
// server/src/index.ts (BEFORE)
import { startArcAgentScheduler } from "./arc-agent-loop.js";
startArcAgentScheduler();
```

To migrate to the new agent, add `@arcmind/agent` to `server/package.json`:

```json
{
  "dependencies": {
    "@arcmind/agent": "file:../packages/arcmind-agent"
  }
}
```

Then replace the two lines above:

```ts
// server/src/index.ts (AFTER)
import { startArcMindAgent } from "@arcmind/agent";
await startArcMindAgent();
```

That's the entire migration. The legacy loop can be deleted after one observation window confirms parity (decisions appearing on `/api/arc-decisions` with the same cadence and shape).

## Upgrading to the real @elizaos/core

`src/types.ts` is a local shim that mirrors the public shapes of `@elizaos/core`. When you're ready:

1. `npm install @elizaos/core @elizaos/plugin-evm` (in this package)
2. In `src/types.ts`, replace the local type bodies with:

   ```ts
   export type { Action, Provider, Evaluator, Service, Character,
                 IAgentRuntime, Memory, State } from "@elizaos/core";
   ```

3. Replace `createMinimalRuntime` callers with `new AgentRuntime({ character, plugins: [evmPlugin, ...] })` from `@elizaos/core`.

Every Provider / Action / Evaluator already has the right shape — no internal rewrites required.

## Standards

- **ERC-8004** (Agent Identity & Reputation) — the on-chain recipient of `recordOnChainAction` writes
- **ERC-8183** (Agentic Commerce Job lifecycle) — the protocol behind `CopyTradeEscrow.sol` events
- **x402** USDC nanopayments — used by paid data providers (see `packages/sdk` for the client)

## Tests

```bash
cd ../.. && npx vitest run src/test/arcmindAgent.test.ts
```

9 smoke tests covering decision direction logic, memory persistence, evaluator scoring, and runtime settings resolution.

## License

MIT.
