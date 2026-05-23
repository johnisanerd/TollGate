/**
 * Deploy PredictionOracle and seed 3 native Arc prediction questions.
 *
 * Run:
 *   PREDICTION_ORACLE_ADMIN=<wallet> npx hardhat run \
 *     contracts/scripts/seed-prediction-markets.cjs --network arcTestnet
 *
 * Writes contracts/deployments/prediction-oracle.json with the deployed
 * address + seeded question IDs. Idempotent — if the env var
 * PREDICTION_ORACLE_ADDRESS is already set, the script reuses the existing
 * deployment and only seeds missing questions.
 */
const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

const QUESTIONS = [
  { slug: "fed-rate-cut-jun-2026",  text: "Will the Fed cut rates by June 2026?" },
  { slug: "eth-above-5000-eoy-2026", text: "Will ETH close above $5,000 on Dec 31 2026?" },
  { slug: "btc-spot-etf-flows-positive-q2-2026", text: "Will BTC spot ETF net flows be positive in Q2 2026?" },
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const admin = (process.env.PREDICTION_ORACLE_ADMIN || "").trim() || deployer.address;

  console.log(`Network:  ${network}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Admin:    ${admin}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${hre.ethers.formatUnits(balance, 18)} native gas token`);

  let oracle;
  const reuse = (process.env.PREDICTION_ORACLE_ADDRESS || "").trim();
  if (reuse) {
    oracle = await hre.ethers.getContractAt("PredictionOracle", reuse);
    console.log(`Reusing existing PredictionOracle at ${reuse}`);
  } else {
    const Oracle = await hre.ethers.getContractFactory("PredictionOracle");
    oracle = await Oracle.deploy(admin);
    await oracle.waitForDeployment();
    const address = await oracle.getAddress();
    const tx = oracle.deploymentTransaction();
    console.log(`Deployed PredictionOracle to ${address} (tx ${tx?.hash ?? "n/a"})`);
  }

  const address = await oracle.getAddress();
  const seeded = [];

  for (const q of QUESTIONS) {
    const id = hre.ethers.id(q.slug);
    try {
      const tx = await oracle.registerQuestion(id, q.text);
      const receipt = await tx.wait();
      console.log(`  ✓ ${q.slug} (id=${id}) tx=${receipt?.hash}`);
      seeded.push({ slug: q.slug, id, txHash: receipt?.hash ?? null });
    } catch (e) {
      const msg = (e && e.message) ? String(e.message).slice(0, 140) : "unknown";
      if (msg.includes("QuestionAlreadyRegistered")) {
        console.log(`  ↺ ${q.slug} already registered, skipping.`);
        seeded.push({ slug: q.slug, id, txHash: null });
      } else {
        console.log(`  ✗ ${q.slug}: ${msg}`);
      }
    }
  }

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = {
    network,
    chainId: Number(hre.network.config.chainId ?? 0),
    address,
    deployer: deployer.address,
    admin,
    deployedAt: new Date().toISOString(),
    seededQuestions: seeded,
  };
  const filename = `prediction-oracle${network === "arcTestnet" ? "" : `.${network}`}.json`;
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
