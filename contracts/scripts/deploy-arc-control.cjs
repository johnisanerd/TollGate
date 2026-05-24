/* Deploy ArcMind Control Layer contracts to Arc L1 testnet.
 *
 * Required env in contracts/.env:
 *   ARC_RPC_URL=...
 *   ARC_PRIVATE_KEY=0x...
 *
 * Optional:
 *   ARC_CONTROL_OPERATOR=0x...  (defaults to deployer)
 *   ARC_AGENT_TREASURY_ADDRESS=0x... (reuse)
 *   ARC_STRATEGY_VAULT_ADDRESS=0x... (reuse)
 *   ARC_RISK_GUARD_ADDRESS=0x... (reuse)
 *   ARC_RECEIPT_REGISTRY_ADDRESS=0x... (reuse)
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function deployOrReuse(name, envKey, args) {
  const existing = process.env[envKey]?.trim();
  if (existing) {
    console.log(`${name}: reusing ${existing}`);
    return { address: existing, txHash: null };
  }
  const Factory = await hre.ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  console.log(`${name} deploy tx: ${tx?.hash ?? "(unknown)"} - waiting...`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  ok ${name}: ${address}`);
  return { address, txHash: tx?.hash ?? null };
}

async function main() {
  const net = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No signer - set ARC_PRIVATE_KEY in contracts/.env or inherited env.");

  const explorer = (process.env.ARC_EXPLORER_URL || "https://testnet.arcscan.app").replace(/\/+$/, "");
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const operator = process.env.ARC_CONTROL_OPERATOR?.trim() || deployer.address;

  console.log(`Network:  ${net} (chainId 5042002)`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatUnits(balance, 18)} native USDC`);
  console.log(`Operator: ${operator}`);

  const treasury = await deployOrReuse("ArcAgentTreasury", "ARC_AGENT_TREASURY_ADDRESS", [
    operator,
    hre.ethers.parseUnits("1", 18),
    hre.ethers.parseUnits("0.5", 18),
  ]);
  const vault = await deployOrReuse("ArcStrategyVault", "ARC_STRATEGY_VAULT_ADDRESS", [operator]);
  const riskGuard = await deployOrReuse("ArcRiskGuard", "ARC_RISK_GUARD_ADDRESS", [operator]);
  const receiptRegistry = await deployOrReuse("ArcReceiptRegistry", "ARC_RECEIPT_REGISTRY_ADDRESS", [operator]);

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });

  const basePath = path.join(outDir, "arcTestnet.json");
  let existing = {};
  if (fs.existsSync(basePath)) {
    try { existing = JSON.parse(fs.readFileSync(basePath, "utf8")); } catch { existing = {}; }
  }

  const output = {
    ...existing,
    network: net,
    chainId: 5042002,
    deployer: deployer.address,
    explorer,
    controlLayer: {
      operator,
      agentTreasury: treasury.address,
      strategyVault: vault.address,
      riskGuard: riskGuard.address,
      receiptRegistry: receiptRegistry.address,
      txHashes: {
        agentTreasury: treasury.txHash,
        strategyVault: vault.txHash,
        riskGuard: riskGuard.txHash,
        receiptRegistry: receiptRegistry.txHash,
      },
      deployedAt: new Date().toISOString(),
    },
  };

  fs.writeFileSync(basePath, JSON.stringify(output, null, 2) + "\n");

  console.log("");
  console.log("ArcMind Control Layer contracts:");
  console.log(`  AgentTreasury:   ${treasury.address}`);
  console.log(`    ${explorer}/address/${treasury.address}`);
  console.log(`  StrategyVault:   ${vault.address}`);
  console.log(`    ${explorer}/address/${vault.address}`);
  console.log(`  RiskGuard:       ${riskGuard.address}`);
  console.log(`    ${explorer}/address/${riskGuard.address}`);
  console.log(`  ReceiptRegistry: ${receiptRegistry.address}`);
  console.log(`    ${explorer}/address/${receiptRegistry.address}`);
  console.log("");
  console.log("Frontend env:");
  console.log(`  VITE_ARC_AGENT_TREASURY_ADDRESS=${treasury.address}`);
  console.log(`  VITE_ARC_STRATEGY_VAULT_ADDRESS=${vault.address}`);
  console.log(`  VITE_ARC_RISK_GUARD_ADDRESS=${riskGuard.address}`);
  console.log(`  VITE_ARC_RECEIPT_REGISTRY_ADDRESS=${receiptRegistry.address}`);
  console.log("");
  console.log("Wrote contracts/deployments/arcTestnet.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
