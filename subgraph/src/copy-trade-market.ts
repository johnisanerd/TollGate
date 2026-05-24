import { BigInt } from "@graphprotocol/graph-ts";
import { Staked, Settled } from "../generated/templates/CopyTradeMarket/CopyTradeMarket";
import { Market, Stake, Settlement } from "../generated/schema";

export function handleStaked(event: Staked): void {
  const stakeId = event.address.toHexString() + "-s-" + event.params.staker.toHexString() + "-" + event.block.timestamp.toString();
  let stake = new Stake(stakeId);
  stake.market = event.address;
  stake.staker = event.params.staker;
  stake.amount = event.params.amount;
  stake.blockNumber = event.block.number;
  stake.txHash = event.transaction.hash;
  stake.timestamp = event.block.timestamp;
  stake.save();

  let market = Market.load(event.address);
  if (market !== null) {
    market.totalStaked = market.totalStaked.plus(event.params.amount);
    market.save();
  }
}

export function handleSettled(event: Settled): void {
  const settlementId = event.address.toHexString() + "-settle-" + event.block.timestamp.toString();
  let settlement = new Settlement(settlementId);
  settlement.market = event.address;
  settlement.winner = event.params.winner;
  settlement.payout = event.params.payout;
  settlement.performanceFee = event.params.performanceFee;
  settlement.pnl = event.params.pnl;
  settlement.blockNumber = event.block.number;
  settlement.txHash = event.transaction.hash;
  settlement.timestamp = event.block.timestamp;
  settlement.save();

  let market = Market.load(event.address);
  if (market !== null) {
    market.settlementCount = market.settlementCount.plus(BigInt.fromI32(1));
    market.save();
  }
}
