/**
 * ERC-8004 / ERC-8183 compatibility tests for ArcMindRegistry + CopyTradeEscrow.
 *
 * Plain chai assertions only — no hardhat-chai-matchers dependency. Events are
 * verified via `tx.wait()` + `queryFilter`.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

const ZERO32 = "0x" + "0".repeat(64);

function findEvent(receipt, contract, eventName) {
  const fragment = contract.interface.getEvent(eventName);
  for (const log of receipt.logs) {
    if (log.topics[0] === fragment.topicHash) {
      return contract.interface.parseLog({ topics: [...log.topics], data: log.data });
    }
  }
  return null;
}

function findAllEvents(receipt, contract, eventName) {
  const fragment = contract.interface.getEvent(eventName);
  const out = [];
  for (const log of receipt.logs) {
    if (log.topics[0] === fragment.topicHash) {
      out.push(contract.interface.parseLog({ topics: [...log.topics], data: log.data }));
    }
  }
  return out;
}

describe("ArcMindRegistry ERC-8004 shim", function () {
  let registry;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("ArcMindRegistry");
    registry = await Registry.deploy();
  });

  it("agentURI returns the metadata string for a registered agent", async function () {
    const builderId = ethers.encodeBytes32String("arcmind-v1");
    const metadata = "ipfs://QmTest";
    await registry.registerAgent(builderId, metadata);
    const agentId = await registry.agentIdForBuilder(builderId);
    expect(await registry.agentURI(agentId)).to.equal(metadata);
  });

  it("agentURI reverts on unknown agent", async function () {
    let threw = false;
    try {
      await registry.agentURI(ethers.keccak256(ethers.toUtf8Bytes("missing")));
    } catch (e) {
      threw = true;
      expect(e.message).to.match(/AgentNotFound/);
    }
    expect(threw).to.equal(true);
  });

  it("agentReputation, agentOwner, agentDecisionCount mirror legacy getters", async function () {
    const builderId = ethers.encodeBytes32String("arc-v2");
    await registry.registerAgent(builderId, "meta");
    const agentId = await registry.agentIdForBuilder(builderId);

    expect(await registry.agentReputation(agentId)).to.equal(0n);
    expect(await registry.agentOwner(agentId)).to.equal(await owner.getAddress());
    expect(await registry.agentDecisionCount(agentId)).to.equal(0n);

    const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("BUY"));
    await registry.recordDecision(agentId, decisionHash);

    expect(await registry.agentDecisionCount(agentId)).to.equal(1n);
  });

  it("emits ReputationUpdated alongside DecisionResolved", async function () {
    const builderId = ethers.encodeBytes32String("arc-v3");
    await registry.registerAgent(builderId, "meta");
    const agentId = await registry.agentIdForBuilder(builderId);
    const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("SELL"));
    await registry.recordDecision(agentId, decisionHash);
    const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("loss"));

    const tx = await registry.resolveDecision(0, outcomeHash);
    const receipt = await tx.wait();

    const decisionResolved = findEvent(receipt, registry, "DecisionResolved");
    expect(decisionResolved, "DecisionResolved should be emitted").to.not.be.null;

    const reputationUpdated = findEvent(receipt, registry, "ReputationUpdated");
    expect(reputationUpdated, "ReputationUpdated should be emitted").to.not.be.null;
    expect(reputationUpdated.args.agentId).to.equal(agentId);
    expect(reputationUpdated.args.oldScore).to.equal(0n);
    expect(reputationUpdated.args.newScore).to.equal(10n);

    expect(await registry.agentReputation(agentId)).to.equal(10n);
  });

  it("agentOwner returns address(0) for unknown agents", async function () {
    expect(await registry.agentOwner(ZERO32)).to.equal(ethers.ZeroAddress);
  });
});

describe("CopyTradeEscrow ERC-8183 Job lifecycle", function () {
  let usdc;
  let escrow;
  let operator;
  let trader;

  const STAKE = 100_000_000n; // 100 USDC (6 decimals)

  beforeEach(async function () {
    [operator, trader] = await ethers.getSigners();
    const Usdc = await ethers.getContractFactory("MockUsdc");
    usdc = await Usdc.deploy();
    const Escrow = await ethers.getContractFactory("CopyTradeEscrow");
    escrow = await Escrow.connect(operator).deploy(await usdc.getAddress(), 1500, 500);

    await usdc.mint(await trader.getAddress(), STAKE * 10n);
    await usdc.connect(trader).approve(await escrow.getAddress(), STAKE * 10n);
  });

  it("stake emits JobCreated + JobFunded with the deterministic jobId + keeps legacy Staked", async function () {
    const tx = await escrow.connect(trader).stake(STAKE);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);

    const expectedJobId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "address"],
        [await trader.getAddress(), block.timestamp, await escrow.getAddress()],
      ),
    );

    expect(await escrow.jobIdOf(await trader.getAddress())).to.equal(expectedJobId);

    const created = findEvent(receipt, escrow, "JobCreated");
    expect(created, "JobCreated should be emitted").to.not.be.null;
    expect(created.args.jobId).to.equal(expectedJobId);
    expect(created.args.client).to.equal(await trader.getAddress());
    expect(created.args.provider).to.equal(await operator.getAddress());
    expect(created.args.evaluator).to.equal(await operator.getAddress());
    expect(created.args.budget).to.equal(STAKE);

    const funded = findEvent(receipt, escrow, "JobFunded");
    expect(funded, "JobFunded should be emitted").to.not.be.null;
    expect(funded.args.jobId).to.equal(expectedJobId);
    expect(funded.args.amount).to.equal(STAKE);

    const staked = findEvent(receipt, escrow, "Staked");
    expect(staked, "legacy Staked should still be emitted").to.not.be.null;
  });

  it("settle emits JobSubmitted + JobCompleted(\"settled\") + keeps legacy Settled", async function () {
    await escrow.connect(trader).stake(STAKE);
    const jobId = await escrow.jobIdOf(await trader.getAddress());
    await usdc.mint(await escrow.getAddress(), STAKE);

    const tx = await escrow.connect(operator).settle(await trader.getAddress(), 5_000_000n);
    const receipt = await tx.wait();

    const submitted = findEvent(receipt, escrow, "JobSubmitted");
    expect(submitted, "JobSubmitted should be emitted").to.not.be.null;
    expect(submitted.args.jobId).to.equal(jobId);

    const completed = findEvent(receipt, escrow, "JobCompleted");
    expect(completed, "JobCompleted should be emitted").to.not.be.null;
    expect(completed.args.jobId).to.equal(jobId);
    expect(completed.args.reason).to.equal(ethers.encodeBytes32String("settled"));

    const settled = findEvent(receipt, escrow, "Settled");
    expect(settled, "legacy Settled should still be emitted").to.not.be.null;
  });

  it("killSwitch emits JobSubmitted + JobCompleted(\"kill_switch\")", async function () {
    await escrow.connect(trader).stake(STAKE);
    const jobId = await escrow.jobIdOf(await trader.getAddress());

    const tx = await escrow.connect(operator).killSwitch(await trader.getAddress(), 1500);
    const receipt = await tx.wait();

    const submitted = findEvent(receipt, escrow, "JobSubmitted");
    expect(submitted.args.jobId).to.equal(jobId);

    const completed = findEvent(receipt, escrow, "JobCompleted");
    expect(completed.args.jobId).to.equal(jobId);
    expect(completed.args.reason).to.equal(ethers.encodeBytes32String("kill_switch"));

    const ks = findEvent(receipt, escrow, "KillSwitchTriggered");
    expect(ks, "legacy KillSwitchTriggered should still be emitted").to.not.be.null;
  });

  it("jobIdOf returns 0x0 when the trader has no open position", async function () {
    expect(await escrow.jobIdOf(await trader.getAddress())).to.equal(ZERO32);
  });

  it("findAllEvents helper sanity — two consecutive jobs produce different jobIds", async function () {
    // First open + settle, then re-open.
    await escrow.connect(trader).stake(STAKE);
    const jobId1 = await escrow.jobIdOf(await trader.getAddress());
    await usdc.mint(await escrow.getAddress(), STAKE);
    await escrow.connect(operator).settle(await trader.getAddress(), 0n);

    // Advance time so entryTs differs.
    await ethers.provider.send("evm_increaseTime", [60]);
    await ethers.provider.send("evm_mine", []);

    await usdc.connect(trader).approve(await escrow.getAddress(), STAKE);
    const tx2 = await escrow.connect(trader).stake(STAKE);
    const receipt2 = await tx2.wait();
    const jobId2 = await escrow.jobIdOf(await trader.getAddress());

    expect(jobId1).to.not.equal(jobId2);
    const events = findAllEvents(receipt2, escrow, "JobCreated");
    expect(events).to.have.length(1);
    expect(events[0].args.jobId).to.equal(jobId2);
  });
});
