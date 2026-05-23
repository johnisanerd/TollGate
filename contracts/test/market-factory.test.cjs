/**
 * Tests for MarketFactory + CopyTradeMarket + AgentRegistry.
 * Covers full lifecycle, security primitives, and policy enforcement.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

async function deployUsdc() {
  const Usdc = await ethers.getContractFactory("MockUsdc");
  return Usdc.deploy();
}

function findEvent(receipt, contract, eventName) {
  const fragment = contract.interface.getEvent(eventName);
  for (const log of receipt.logs) {
    if (log.topics[0] === fragment.topicHash) {
      return contract.interface.parseLog({ topics: [...log.topics], data: log.data });
    }
  }
  return null;
}

describe("MarketFactory", function () {
  let factory;
  let usdc;
  let owner;
  let operator;
  let alice;

  beforeEach(async function () {
    [owner, operator, alice] = await ethers.getSigners();
    usdc = await deployUsdc();
    const Factory = await ethers.getContractFactory("MarketFactory");
    factory = await Factory.connect(owner).deploy(await owner.getAddress());
  });

  it("deploys with sensible default policy", async function () {
    expect(await factory.maxPerformanceFeeBps()).to.equal(2000n);
    expect(await factory.maxKillThresholdBps()).to.equal(5000n);
    expect(await factory.minKillThresholdBps()).to.equal(500n);
    expect(await factory.minStakeFloor()).to.equal(1_000_000n);
    expect(await factory.maxStakeCeiling()).to.equal(1_000_000_000n);
    expect(await factory.marketCount()).to.equal(0n);
  });

  it("createMarket deploys a CopyTradeMarket and records it", async function () {
    const tx = await factory.createMarket(
      await operator.getAddress(),
      await usdc.getAddress(),
      "ETH/USDC",
      500, 1500, 1_000_000n, 100_000_000n,
    );
    const receipt = await tx.wait();
    const deployed = findEvent(receipt, factory, "MarketDeployed");
    expect(deployed).to.not.be.null;
    expect(deployed.args.operator).to.equal(await operator.getAddress());
    expect(deployed.args.baseSymbol).to.equal("ETH/USDC");
    expect(deployed.args.performanceFeeBps).to.equal(500n);

    expect(await factory.marketCount()).to.equal(1n);
    expect(await factory.allMarkets(0)).to.equal(deployed.args.market);
    expect(await factory.marketFor(
      await operator.getAddress(),
      "ETH/USDC",
      await usdc.getAddress(),
    )).to.equal(deployed.args.market);
  });

  it("blocks duplicate (operator, symbol, quote) combinations", async function () {
    await factory.createMarket(
      await operator.getAddress(),
      await usdc.getAddress(),
      "ETH/USDC",
      500, 1500, 1_000_000n, 100_000_000n,
    );
    await expect(factory.createMarket(
      await operator.getAddress(),
      await usdc.getAddress(),
      "ETH/USDC",
      500, 1500, 1_000_000n, 100_000_000n,
    )).to.be.revertedWithCustomError(factory, "MarketAlreadyExists");
  });

  it("rejects markets that breach factory policy", async function () {
    await expect(factory.createMarket(
      await operator.getAddress(), await usdc.getAddress(), "ETH/USDC",
      3000, 1500, 1_000_000n, 100_000_000n,
    )).to.be.revertedWithCustomError(factory, "PolicyViolation");

    await expect(factory.createMarket(
      await operator.getAddress(), await usdc.getAddress(), "ETH/USDC",
      500, 100, 1_000_000n, 100_000_000n,
    )).to.be.revertedWithCustomError(factory, "PolicyViolation");

    await expect(factory.createMarket(
      await operator.getAddress(), await usdc.getAddress(), "ETH/USDC",
      500, 1500, 100n, 100_000_000n,
    )).to.be.revertedWithCustomError(factory, "PolicyViolation");
  });

  it("rejects zero addresses + empty symbol", async function () {
    await expect(factory.createMarket(
      ZERO_ADDR, await usdc.getAddress(), "ETH/USDC",
      500, 1500, 1_000_000n, 100_000_000n,
    )).to.be.revertedWithCustomError(factory, "ZeroAddress");

    await expect(factory.createMarket(
      await operator.getAddress(), await usdc.getAddress(), "",
      500, 1500, 1_000_000n, 100_000_000n,
    )).to.be.revertedWithCustomError(factory, "EmptyBaseSymbol");
  });

  it("setPolicy + pause respects owner-only access", async function () {
    await expect(factory.connect(alice).setPolicy(1000, 3000, 500, 1_000_000n, 100_000_000n))
      .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await factory.connect(owner).setPolicy(1000, 3000, 500, 1_000_000n, 100_000_000n);
    expect(await factory.maxPerformanceFeeBps()).to.equal(1000n);

    await factory.connect(owner).pause();
    await expect(factory.createMarket(
      await operator.getAddress(), await usdc.getAddress(), "ETH/USDC",
      500, 1500, 1_000_000n, 100_000_000n,
    )).to.be.revertedWithCustomError(factory, "EnforcedPause");
  });

  it("getMarketsPaged returns market info correctly", async function () {
    await factory.createMarket(await operator.getAddress(), await usdc.getAddress(), "ETH/USDC", 500, 1500, 1_000_000n, 100_000_000n);
    await factory.createMarket(await operator.getAddress(), await usdc.getAddress(), "BTC/USDC", 500, 1500, 1_000_000n, 100_000_000n);

    const page = await factory.getMarketsPaged(0, 10);
    expect(page).to.have.length(2);
    expect(page[0].baseSymbol).to.equal("ETH/USDC");
    expect(page[1].baseSymbol).to.equal("BTC/USDC");

    const emptyPage = await factory.getMarketsPaged(5, 10);
    expect(emptyPage).to.have.length(0);
  });
});

describe("CopyTradeMarket (deployed via factory)", function () {
  let factory;
  let market;
  let usdc;
  let owner;
  let operator;
  let alice;
  let bob;

  const STAKE = 50_000_000n;

  beforeEach(async function () {
    [owner, operator, alice, bob] = await ethers.getSigners();
    usdc = await deployUsdc();
    const Factory = await ethers.getContractFactory("MarketFactory");
    factory = await Factory.connect(owner).deploy(await owner.getAddress());

    const tx = await factory.createMarket(
      await operator.getAddress(), await usdc.getAddress(), "ETH/USDC",
      500, 1500, 1_000_000n, 500_000_000n,
    );
    const receipt = await tx.wait();
    const deployed = findEvent(receipt, factory, "MarketDeployed");
    market = await ethers.getContractAt("CopyTradeMarket", deployed.args.market);

    await usdc.mint(await alice.getAddress(), STAKE * 10n);
    await usdc.connect(alice).approve(await market.getAddress(), STAKE * 10n);
    await usdc.mint(await bob.getAddress(), STAKE * 10n);
    await usdc.connect(bob).approve(await market.getAddress(), STAKE * 10n);
  });

  it("exposes immutable identity correctly", async function () {
    expect(await market.operator()).to.equal(await operator.getAddress());
    expect(await market.quoteToken()).to.equal(await usdc.getAddress());
    expect(await market.baseSymbol()).to.equal("ETH/USDC");
    expect(await market.performanceFeeBps()).to.equal(500n);
    expect(await market.killThresholdBps()).to.equal(1500n);
    expect(await market.owner()).to.equal(await owner.getAddress());
  });

  it("stake enforces min/max bounds", async function () {
    await expect(market.connect(alice).stake(0n))
      .to.be.revertedWithCustomError(market, "InsufficientAmount");
    await expect(market.connect(alice).stake(999_999n))
      .to.be.revertedWithCustomError(market, "InsufficientAmount");
    await expect(market.connect(alice).stake(600_000_000n))
      .to.be.revertedWithCustomError(market, "OverMaxStake");
  });

  it("stake blocks double-stake by same trader", async function () {
    await market.connect(alice).stake(STAKE);
    await expect(market.connect(alice).stake(STAKE))
      .to.be.revertedWithCustomError(market, "AlreadyStaked");
  });

  it("settle pays profit minus 5% perf fee", async function () {
    await market.connect(alice).stake(STAKE);
    await usdc.mint(await market.getAddress(), STAKE);

    const profit = 10_000_000n;
    const balBefore = await usdc.balanceOf(await alice.getAddress());
    await market.connect(operator).settle(await alice.getAddress(), profit);
    const balAfter = await usdc.balanceOf(await alice.getAddress());

    const expectedFee  = (profit * 500n) / 10000n;
    const expectedBack = STAKE + profit - expectedFee;
    expect(balAfter - balBefore).to.equal(expectedBack);
    expect(await market.totalFeesPaid()).to.equal(expectedFee);
  });

  it("settle on loss returns stake minus loss; no fee on loss", async function () {
    await market.connect(alice).stake(STAKE);
    await market.connect(operator).settle(await alice.getAddress(), -5_000_000n);

    const settlement = await market.getSettlement(0);
    expect(settlement.returnedQuote).to.equal(STAKE - 5_000_000n);
    expect(await market.totalFeesPaid()).to.equal(0n);
  });

  it("non-operator cannot call settle/killSwitch", async function () {
    await market.connect(alice).stake(STAKE);
    await expect(market.connect(alice).settle(await alice.getAddress(), 0n))
      .to.be.revertedWithCustomError(market, "NotOperator");
    await expect(market.connect(alice).killSwitch(await alice.getAddress(), 1500))
      .to.be.revertedWithCustomError(market, "NotOperator");
  });

  it("pause stops new stakes; existing positions can still be settled", async function () {
    await market.connect(alice).stake(STAKE);
    await market.connect(owner).pause();

    await expect(market.connect(bob).stake(STAKE))
      .to.be.revertedWithCustomError(market, "EnforcedPause");

    await market.connect(operator).settle(await alice.getAddress(), 0n);
    expect((await market.getPosition(await alice.getAddress())).stakeQuote).to.equal(0n);
  });

  it("sweepDust cannot drain quoteToken; can sweep other ERC-20s", async function () {
    await market.connect(alice).stake(STAKE);
    await expect(market.connect(owner).sweepDust(await usdc.getAddress(), await owner.getAddress(), 1n))
      .to.be.revertedWithCustomError(market, "CannotSweepQuoteToken");

    const Other = await ethers.getContractFactory("MockUsdc");
    const other = await Other.deploy();
    await other.mint(await market.getAddress(), 1_000n);
    await market.connect(owner).sweepDust(await other.getAddress(), await owner.getAddress(), 1_000n);
    expect(await other.balanceOf(await owner.getAddress())).to.equal(1_000n);
  });

  it("constructor rejects out-of-bounds parameters (defence in depth)", async function () {
    const Market = await ethers.getContractFactory("CopyTradeMarket");
    await expect(Market.deploy(
      await owner.getAddress(), await operator.getAddress(), await usdc.getAddress(),
      "ETH/USDC", 3000, 1500, 1_000_000n, 100_000_000n,
    )).to.be.revertedWithCustomError(Market, "InvalidFeeBps");

    await expect(Market.deploy(
      await owner.getAddress(), await operator.getAddress(), await usdc.getAddress(),
      "ETH/USDC", 500, 6000, 1_000_000n, 100_000_000n,
    )).to.be.revertedWithCustomError(Market, "InvalidKillThresholdBps");
  });

  it("killSwitch returns stake minus drawdown and emits JobCompleted(kill_switch)", async function () {
    await market.connect(alice).stake(STAKE);
    const jobId = await market.jobIdOf(await alice.getAddress());

    const tx = await market.connect(operator).killSwitch(await alice.getAddress(), 1500);
    const receipt = await tx.wait();
    const completed = findEvent(receipt, market, "JobCompleted");
    expect(completed.args.jobId).to.equal(jobId);
    expect(completed.args.reason).to.equal(ethers.encodeBytes32String("kill_switch"));
  });
});

describe("AgentRegistry", function () {
  let registry;
  let admin;
  let alice;
  let resolver;
  let governor;

  beforeEach(async function () {
    [admin, alice, resolver, governor] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("AgentRegistry");
    registry = await Registry.connect(admin).deploy(await admin.getAddress());
    const RESOLVER_ROLE = await registry.RESOLVER_ROLE();
    const GOVERNOR_ROLE = await registry.GOVERNOR_ROLE();
    await registry.connect(admin).grantRole(RESOLVER_ROLE, await resolver.getAddress());
    await registry.connect(admin).grantRole(GOVERNOR_ROLE, await governor.getAddress());
  });

  it("registerAgent + recordDecision + resolveDecision happy path", async function () {
    const builderId = ethers.encodeBytes32String("agent-x");
    await registry.connect(alice).registerAgent(builderId, "ipfs://meta");
    const agentId = await registry.agentIdForBuilder(builderId);

    const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("BUY"));
    await registry.connect(alice).recordDecision(agentId, decisionHash);
    expect(await registry.agentDecisionCount(agentId)).to.equal(1n);

    const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("win"));
    await registry.connect(alice).resolveDecision(0, outcomeHash);
    expect(await registry.agentReputation(agentId)).to.equal(10n);
  });

  it("resolver role can resolve any agent's decision", async function () {
    const builderId = ethers.encodeBytes32String("agent-y");
    await registry.connect(alice).registerAgent(builderId, "ipfs://meta");
    const agentId = await registry.agentIdForBuilder(builderId);
    await registry.connect(alice).recordDecision(agentId, ethers.keccak256(ethers.toUtf8Bytes("SELL")));

    await registry.connect(resolver).resolveDecision(0, ethers.keccak256(ethers.toUtf8Bytes("loss")));
    expect(await registry.agentReputation(agentId)).to.equal(10n);
  });

  it("governor can slash; slashed agent cannot record new decisions", async function () {
    const builderId = ethers.encodeBytes32String("agent-z");
    await registry.connect(alice).registerAgent(builderId, "ipfs://meta");
    const agentId = await registry.agentIdForBuilder(builderId);
    await registry.connect(alice).recordDecision(agentId, ethers.keccak256(ethers.toUtf8Bytes("BUY")));
    await registry.connect(alice).resolveDecision(0, ethers.keccak256(ethers.toUtf8Bytes("win")));
    expect(await registry.agentReputation(agentId)).to.equal(10n);

    await registry.connect(governor).slashAgent(0, "fraud-detected");
    expect(await registry.agentReputation(agentId)).to.equal(0n);
    const info = await registry.getAgent(agentId);
    expect(info.slashed).to.equal(true);

    await expect(registry.connect(alice).recordDecision(agentId, ethers.keccak256(ethers.toUtf8Bytes("NEW"))))
      .to.be.revertedWithCustomError(registry, "AgentAlreadySlashed");
  });

  it("only governor can slash", async function () {
    const builderId = ethers.encodeBytes32String("agent-q");
    await registry.connect(alice).registerAgent(builderId, "ipfs://meta");
    const agentId = await registry.agentIdForBuilder(builderId);
    await registry.connect(alice).recordDecision(agentId, ethers.keccak256(ethers.toUtf8Bytes("BUY")));

    await expect(registry.connect(alice).slashAgent(0, "test"))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("metadata length is capped at 1024 bytes", async function () {
    const builderId = ethers.encodeBytes32String("agent-huge");
    const huge = "x".repeat(2000);
    await expect(registry.connect(alice).registerAgent(builderId, huge))
      .to.be.revertedWithCustomError(registry, "MetadataTooLong");
  });

  it("pause stops all writes; admin can unpause", async function () {
    await registry.connect(admin).pause();
    await expect(registry.connect(alice).registerAgent(
      ethers.encodeBytes32String("agent-paused"), "ipfs://meta",
    )).to.be.revertedWithCustomError(registry, "EnforcedPause");
    await registry.connect(admin).unpause();
    await registry.connect(alice).registerAgent(ethers.encodeBytes32String("agent-paused"), "ipfs://meta");
  });

  it("ERC-8004 view interface returns expected values", async function () {
    const builderId = ethers.encodeBytes32String("agent-erc");
    await registry.connect(alice).registerAgent(builderId, "ipfs://meta");
    const agentId = await registry.agentIdForBuilder(builderId);
    expect(await registry.agentURI(agentId)).to.equal("ipfs://meta");
    expect(await registry.agentOwner(agentId)).to.equal(await alice.getAddress());
  });
});
