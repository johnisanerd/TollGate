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
    agent-registry.ts    # AssemblyScript event handlers
    market-factory.ts
    copy-trade-market.ts
```

## Deploy (Subgraph Studio — free tier)

> Note: The Graph hosted service was shut down in 2024. Use Subgraph Studio.

```bash
# 1. Install graph-cli
npm install --save-dev @graphprotocol/graph-cli @graphprotocol/graph-ts

# 2. Authenticate with your deploy key from https://thegraph.com/studio/
npx graph auth --studio <GRAPH_DEPLOY_KEY>

# 3. Build
cd subgraph
npx graph codegen
npx graph build

# 4. Deploy to Studio
npx graph deploy --studio arcmind-arc
```

Set `GRAPH_DEPLOY_KEY` (from Subgraph Studio dashboard) in your env.

### Arc Testnet as custom network

Arc L1 testnet (chainId 5042002) is a custom network. Add it to `~/.graph/config.json`:

```json
{
  "networks": {
    "arc-testnet": {
      "rpc": "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public",
      "chainId": 5042002
    }
  }
}
```

The public GraphQL endpoint after deploy:
`https://api.studio.thegraph.com/query/<id>/arcmind-arc/version/latest`

Set `GRAPH_QUERY_URL` in the server env to enable the query API.

## Status

This directory ships the declarative artifacts (`subgraph.yaml`, `schema.graphql`).
The AssemblyScript handlers in `subgraph/src/` are stubs — the frontend continues
to work without the subgraph because `src/lib/agentRegistry.ts` falls back to
`provider.getLogs()`.
