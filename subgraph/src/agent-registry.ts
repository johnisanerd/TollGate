import { BigInt } from "@graphprotocol/graph-ts";
import {
  AgentRegistered,
  AgentSlashed,
  DecisionRecorded,
  DecisionResolved,
  ReputationUpdated,
} from "../generated/AgentRegistry/AgentRegistry";
import { Agent, Decision, SlashEvent } from "../generated/schema";

export function handleAgentRegistered(event: AgentRegistered): void {
  let agent = new Agent(event.params.agentId);
  agent.builderId = event.params.builderId;
  agent.owner = event.params.owner;
  agent.metadata = event.params.metadata;
  agent.reputation = BigInt.fromI32(0);
  agent.decisionCount = BigInt.fromI32(0);
  agent.slashed = false;
  agent.slashReason = null;
  agent.registeredAt = event.block.timestamp;
  agent.registeredBlock = event.block.number;
  agent.registeredTx = event.transaction.hash;
  agent.save();
}

export function handleDecisionRecorded(event: DecisionRecorded): void {
  const decisionId = event.params.agentId.toHexString() + "-" + event.params.index.toString();
  let decision = new Decision(decisionId);
  decision.agent = event.params.agentId;
  decision.decisionIndex = event.params.index;
  decision.decisionHash = event.params.decisionHash;
  decision.outcomeHash = null;
  decision.resolved = false;
  decision.resolvedAt = null;
  decision.newReputation = null;
  decision.recordedAt = event.block.timestamp;
  decision.recordedTx = event.transaction.hash;
  decision.save();

  let agent = Agent.load(event.params.agentId);
  if (agent !== null) {
    agent.decisionCount = agent.decisionCount.plus(BigInt.fromI32(1));
    agent.save();
  }
}

export function handleDecisionResolved(event: DecisionResolved): void {
  const decisionId = event.params.agentId.toHexString() + "-" + event.params.index.toString();
  let decision = Decision.load(decisionId);
  if (decision === null) return;
  decision.outcomeHash = event.params.outcomeHash;
  decision.resolved = true;
  decision.resolvedAt = event.block.timestamp;
  decision.newReputation = event.params.newReputation;
  decision.save();
}

export function handleAgentSlashed(event: AgentSlashed): void {
  const slashId = event.params.agentId.toHexString() + "-slash-" + event.params.decisionIndex.toString();
  let slash = new SlashEvent(slashId);
  slash.agent = event.params.agentId;
  slash.decisionIndex = event.params.decisionIndex;
  slash.reason = event.params.reason;
  slash.timestamp = event.block.timestamp;
  slash.blockNumber = event.block.number;
  slash.txHash = event.transaction.hash;
  slash.save();

  let agent = Agent.load(event.params.agentId);
  if (agent !== null) {
    agent.slashed = true;
    agent.slashReason = event.params.reason;
    agent.save();
  }
}

export function handleReputationUpdated(event: ReputationUpdated): void {
  let agent = Agent.load(event.params.agentId);
  if (agent !== null) {
    agent.reputation = event.params.newReputation;
    agent.save();
  }
}
