import { BigInt } from "@graphprotocol/graph-ts";
import { MarketDeployed } from "../generated/MarketFactory/MarketFactory";
import { Market } from "../generated/schema";
import { CopyTradeMarket } from "../generated/templates";

export function handleMarketDeployed(event: MarketDeployed): void {
  let market = new Market(event.params.market);
  market.quoteToken = event.params.quoteToken;
  market.agent = event.params.agent;
  market.label = event.params.label;
  market.operator = event.params.operator;
  market.totalStaked = BigInt.fromI32(0);
  market.settlementCount = BigInt.fromI32(0);
  market.deployedAt = event.block.timestamp;
  market.deployedBlock = event.block.number;
  market.deployedTx = event.transaction.hash;
  market.save();

  CopyTradeMarket.create(event.params.market);
}
