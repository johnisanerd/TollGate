const { expect } = require("chai");
const { ethers } = require("hardhat");

const QUESTION_TEXT = "Will the Fed cut rates by June 2026?";

describe("PredictionOracle", function () {
  let oracle;
  let admin;
  let other;
  let qid;
  const YES = ethers.keccak256(ethers.toUtf8Bytes("YES"));
  const NO  = ethers.keccak256(ethers.toUtf8Bytes("NO"));

  beforeEach(async function () {
    [admin, other] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("PredictionOracle");
    oracle = await Oracle.deploy(admin.address);
    qid = ethers.id("fed-rate-cut-jun-2026");
  });

  it("constants match keccak256 of YES/NO", async function () {
    expect(await oracle.YES()).to.equal(YES);
    expect(await oracle.NO()).to.equal(NO);
  });

  it("registers a question and emits PredictionRegistered", async function () {
    await expect(oracle.connect(admin).registerQuestion(qid, QUESTION_TEXT))
      .to.emit(oracle, "PredictionRegistered")
      .withArgs(qid, admin.address, QUESTION_TEXT);

    expect(await oracle.getQuestionCount()).to.equal(1);
    expect(await oracle.getQuestionIdAt(0)).to.equal(qid);
    const p = await oracle.getPrediction(qid);
    expect(p.question).to.equal(QUESTION_TEXT);
    expect(p.resolved).to.equal(false);
    expect(p.outcome).to.equal(ethers.ZeroHash);
  });

  it("rejects empty question text", async function () {
    await expect(oracle.connect(admin).registerQuestion(qid, ""))
      .to.be.revertedWithCustomError(oracle, "EmptyQuestion");
  });

  it("rejects duplicate registration of the same question id", async function () {
    await oracle.connect(admin).registerQuestion(qid, QUESTION_TEXT);
    await expect(oracle.connect(admin).registerQuestion(qid, "different text"))
      .to.be.revertedWithCustomError(oracle, "QuestionAlreadyRegistered")
      .withArgs(qid);
  });

  it("rejects registration from non-resolver", async function () {
    await expect(oracle.connect(other).registerQuestion(qid, QUESTION_TEXT))
      .to.be.reverted;
  });

  it("resolves YES with citation and emits PredictionResolved", async function () {
    await oracle.connect(admin).registerQuestion(qid, QUESTION_TEXT);
    await expect(oracle.connect(admin).resolveQuestion(qid, YES, "ipfs://QmCitation"))
      .to.emit(oracle, "PredictionResolved")
      .withArgs(qid, YES, admin.address, "ipfs://QmCitation");

    const [outcome, resolved] = await oracle.getOutcome(qid);
    expect(outcome).to.equal(YES);
    expect(resolved).to.equal(true);
  });

  it("rejects resolution with invalid outcome", async function () {
    await oracle.connect(admin).registerQuestion(qid, QUESTION_TEXT);
    const garbage = ethers.id("MAYBE");
    await expect(oracle.connect(admin).resolveQuestion(qid, garbage, "src"))
      .to.be.revertedWithCustomError(oracle, "InvalidOutcome");
  });

  it("rejects resolution of unknown question", async function () {
    await expect(oracle.connect(admin).resolveQuestion(ethers.id("nope"), YES, "src"))
      .to.be.revertedWithCustomError(oracle, "QuestionNotFound");
  });

  it("rejects double resolution", async function () {
    await oracle.connect(admin).registerQuestion(qid, QUESTION_TEXT);
    await oracle.connect(admin).resolveQuestion(qid, YES, "src");
    await expect(oracle.connect(admin).resolveQuestion(qid, NO, "src2"))
      .to.be.revertedWithCustomError(oracle, "AlreadyResolved")
      .withArgs(qid);
  });

  it("blocks state changes while paused, allows reads", async function () {
    await oracle.connect(admin).registerQuestion(qid, QUESTION_TEXT);
    await oracle.connect(admin).pause();
    await expect(oracle.connect(admin).resolveQuestion(qid, YES, "src"))
      .to.be.reverted;
    const p = await oracle.getPrediction(qid);
    expect(p.resolved).to.equal(false);
    await oracle.connect(admin).unpause();
    await oracle.connect(admin).resolveQuestion(qid, YES, "src");
    expect((await oracle.getOutcome(qid))[1]).to.equal(true);
  });

  it("grantRole lets a new resolver post outcomes", async function () {
    const RESOLVER_ROLE = await oracle.RESOLVER_ROLE();
    await oracle.connect(admin).grantRole(RESOLVER_ROLE, other.address);
    await oracle.connect(other).registerQuestion(qid, "Other-registered question");
    await oracle.connect(other).resolveQuestion(qid, NO, "src");
    const [outcome] = await oracle.getOutcome(qid);
    expect(outcome).to.equal(NO);
  });
});
