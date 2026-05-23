# ArcMind subgraph (The Graph)

Indexes ERC-8004 + ERC-8183 events from Arc L1 testnet:

- **AgentRegistry** (`0x8aD47542EBbd92696E7C69E756bdf654d867581d`):
  `AgentRegistered`, `DecisionRecorded`, `DecisionResolved`, `AgentSlashed`,
  `ReputationUpdated`.
- **MarketFactory** (`0x9C36Aa5fa856893Ae70E33014985678E4Ce198AD`):
  `MarketDeployed` — spawns a `CopyTradeMarket` data source template.
- **CopyTradeMarket** (per-market, dynamically tracked): `Staked`, `Settled`.

## Why a subgraph

`provider.getLogs()` on a public RPC works for the small leaderboard widget
today, but every additional market and every additional event multiplies the
read cost. A subgraph gives one O(1) GraphQL query — `agents(orderBy:
reputation, where: { slashed: false })` — instead of N RPC round-trips.

## Layout

```
subgraph/
  subgraph.yaml          # graph-cli manifest
  schema.graphql         # GraphQL entity schema
  abis/                  # extracted JSON ABIs (copy from contracts/artifacts)
  src/
    agent-registry.ts    # AssemblyScript event handlers (TODO)
    market-factory.ts
    copy-trade-market.ts
```

## Deploy

```bash
cd subgraph
npm install --save-dev @graphprotocol/graph-cli @graphprotocol/graph-ts
npx graph codegen
npx graph build

# Hosted service (recommended for hackathon — free, no GRT bond)
npx graph deploy --product hosted-service kravadk/arcmind-arc
```

Set `GRAPH_DEPLOY_KEY` in the env and the deploy will create a public GraphQL
endpoint that ArcMind frontend can hit instead of paging RPC logs.

## Status

This directory ships the **declarative artifacts** (`subgraph.yaml`,
`schema.graphql`, this README). The AssemblyScript handlers live under
`subgraph/src/` and are stubs — implement them when wiring the production
subgraph deployment. The frontend continues to work without the subgraph
because `src/lib/agentRegistry.ts` falls back to `provider.getLogs()`.
