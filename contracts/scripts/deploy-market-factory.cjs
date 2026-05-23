/* Deploy MarketFactory + AgentRegistry + initial ETH/USDC market.
 *
 * This is the production deployment path that generates real markets for the
 * Arc workspace. Markets for additional assets (BTC/USDC, SOL/USDC, …) can be
 * created later via MarketFactory.createMarket() — the deployer here only
 * seeds the canonical ArcMind ETH/USDC market.
 *
 * Setup:
 *   1. Put ARC_RPC_URL + ARC_PRIVATE_KEY + ARC_USDC_ADDRESS into contracts/.env
 *   2. cd contracts && npx hardhat run scripts/deploy-market-factory.cjs --network arcTestnet
 *
 * Writes contracts/deployments/arc-market-factory.json with addresses.
 */

const fs   = require("fs");
const path = require("path");
const hre  = require("hardhat");

async function main() {
  const net = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No signer — set ARC_PRIVATE_KEY in contracts/.env");

  const usdc = process.env.ARC_USDC_ADDRESS;
  if (!usdc || !/^0x[a-fA-F0-9]{40}$/.test(usdc)) {
    throw new Error("Set ARC_USDC_ADDRESS in contracts/.env (USDC on the target chain).");
  }

  const explorer = (process.env.ARC_EXPLORER_URL || "https://testnet.arcscan.app").replace(/\/+$/, "");
  const operator = process.env.ARCMIND_OPERATOR_ADDRESS || deployer.address;
  const adminAddr = process.env.ARCMIND_ADMIN_ADDRESS || deployer.address;

  console.log(`Network:  ${net}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Admin:    ${adminAddr}`);
  console.log(`Operator: ${operator}`);
  console.log(`USDC:     ${usdc}`);

  console.log("\n[1/3] Deploying AgentRegistry…");
  const Registry = await hre.ethers.getContractFactory("AgentRegistry");
  const registry = await Registry.deploy(adminAddr);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  const registryTx = registry.deploymentTransaction()?.hash ?? null;
  console.log(`  AgentRegistry  → ${registryAddress}`);
  if (registryTx) console.log(`  tx: ${explorer}/tx/${registryTx}`);

  console.log("\n[2/3] Deploying MarketFactory…");
  const Factory = await hre.ethers.getContractFactory("MarketFactory");
  const factory = await Factory.deploy(adminAddr);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const factoryTx = factory.deploymentTransaction()?.hash ?? null;
  console.log(`  MarketFactory  → ${factoryAddress}`);
  if (factoryTx) console.log(`  tx: ${explorer}/tx/${factoryTx}`);

  console.log("\n[3/3] Creating initial ETH/USDC market via factory…");
  const performanceFeeBps = 500;
  const killThresholdBps  = 1500;
  const minStake = 1_000_000n;
  const maxStake = 1_000_000_000n;

  const tx = await factory.createMarket(
    operator,
    usdc,
    "ETH/USDC",
    performanceFeeBps,
    killThresholdBps,
    minStake,
    maxStake,
  );
  const receipt = await tx.wait();

  let initialMarket = null;
  const fragment = factory.interface.getEvent("MarketDeployed");
  for (const log of receipt.logs) {
    if (log.topics[0] === fragment.topicHash) {
      const parsed = factory.interface.parseLog({ topics: [...log.topics], data: log.data });
      initialMarket = parsed.args.market;
      break;
    }
  }
  console.log(`  ETH/USDC market → ${initialMarket}`);
  console.log(`  tx: ${explorer}/tx/${receipt.hash}`);

  const outDir = path.resolve(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "arc-market-factory.json");
  const payload = {
    network: net,
    chainId: hre.network.config.chainId ?? null,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    admin: adminAddr,
    operator,
    addresses: {
      agentRegistry: registryAddress,
      marketFactory: factoryAddress,
      initialMarket,
      usdc,
    },
    initialMarket: {
      address: initialMarket,
      baseSymbol: "ETH/USDC",
      performanceFeeBps,
      killThresholdBps,
      minStake: minStake.toString(),
      maxStake: maxStake.toString(),
    },
    explorer,
    txHashes: {
      agentRegistry: registryTx,
      marketFactory: factoryTx,
      initialMarket: receipt.hash,
    },
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(`\nSaved → ${path.relative(process.cwd(), outFile)}`);

  console.log("\nNext steps:");
  console.log(`  1. Copy AgentRegistry / MarketFactory / initialMarket addresses into your frontend .env`);
  console.log(`  2. Call factory.createMarket(...) again for any new (operator, symbol) you want to support`);
  console.log(`  3. Grant RESOLVER_ROLE on AgentRegistry to your evaluator address(es) if outcomes are settled by a separate service`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
