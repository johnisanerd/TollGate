/**
 * Exercise the AgentRegistry contract end-to-end against the deployed instance.
 *
 * Sends 3 SIGNED transactions:
 *   1. registerAgent(builderId, metadata)   — ~150K gas
 *   2. recordDecision(agentId, decisionHash)— ~120K gas
 *   3. resolveDecision(index, outcomeHash)  — ~80K gas
 *
 * Total ≈ 350K gas. Uses the deployer key from contracts/.env. Idempotent:
 * if the agent is already registered with the same builderId, the script
 * uses the existing one and only adds a new decision + resolution.
 *
 *   cd contracts && npx hardhat run --network arcTestnet scripts/exercise-agent.cjs
 */

const fs   = require("fs");
const path = require("path");
const hre  = require("hardhat");

async function main() {
  const file = path.resolve(__dirname, "..", "deployments", "arc-market-factory.json");
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run npm run deploy:arc-market-factory first.`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const [signer] = await hre.ethers.getSigners();

  console.log("=================================================================");
  console.log("AgentRegistry — exercise (3 real signed tx)");
  console.log("=================================================================");
  console.log("Network: ", d.network, `(chainId ${d.chainId})`);
  console.log("Signer:  ", signer.address);
  console.log("Registry:", d.addresses.agentRegistry);
  console.log();

  const reg = await hre.ethers.getContractAt("AgentRegistry", d.addresses.agentRegistry);
  const explorer = d.explorer || "https://testnet.arcscan.app";

  // ── Step 1: registerAgent ─────────────────────────────────────────────────

  const builderLabel = `arcmind-live-${Math.floor(Date.now() / 1000)}`;
  const builderId    = hre.ethers.encodeBytes32String(builderLabel);
  const metadata     = JSON.stringify({
    name: "ArcMind",
    version: "live-deploy",
    workspace: "agora",
    deployedAt: new Date().toISOString(),
  });

  console.log("[1/3] registerAgent");
  console.log("       builderId:", builderId, `(${builderLabel})`);
  console.log("       metadata :", metadata);

  let agentId;
  const existing = await reg.agentIdForBuilder(builderId);
  if (existing !== "0x" + "0".repeat(64)) {
    agentId = existing;
    console.log("       → already registered, reusing agentId", agentId);
  } else {
    const tx1 = await reg.registerAgent(builderId, metadata);
    const r1  = await tx1.wait();
    console.log("       tx:", `${explorer}/tx/${r1.hash}`);
    agentId = await reg.agentIdForBuilder(builderId);
    console.log("       → agentId", agentId);
  }
  console.log();

  // ── Step 2: recordDecision ────────────────────────────────────────────────

  const decisionPayload = JSON.stringify({
    decision: "BUY",
    ethPrice: 3500,
    sources: ["coingecko", "hyperliquid"],
    ts: new Date().toISOString(),
  });
  const decisionHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(decisionPayload));

  console.log("[2/3] recordDecision");
  console.log("       payload     :", decisionPayload);
  console.log("       decisionHash:", decisionHash);

  const tx2 = await reg.recordDecision(agentId, decisionHash);
  const r2  = await tx2.wait();
  console.log("       tx:", `${explorer}/tx/${r2.hash}`);
  const decisionCount = await reg.agentDecisionCount(agentId);
  const decisionIndex = Number(decisionCount) - 1;
  console.log("       → decision index", decisionIndex);
  console.log();

  // ── Step 3: resolveDecision ───────────────────────────────────────────────

  const outcomePayload = JSON.stringify({ outcome: "correct", priceMove: "+1.2%", resolvedAt: new Date().toISOString() });
  const outcomeHash    = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(outcomePayload));

  console.log("[3/3] resolveDecision");
  console.log("       outcome    :", outcomePayload);
  console.log("       outcomeHash:", outcomeHash);

  const repBefore = await reg.agentReputation(agentId);
  const tx3 = await reg.resolveDecision(decisionIndex, outcomeHash);
  const r3  = await tx3.wait();
  console.log("       tx:", `${explorer}/tx/${r3.hash}`);
  const repAfter = await reg.agentReputation(agentId);
  console.log("       reputation:", repBefore.toString(), "→", repAfter.toString());
  console.log();

  console.log("Done. All 3 tx confirmed.");
}

main().catch((err) => {
  console.error("\n[FAIL]", err.message ?? err);
  process.exit(1);
});
