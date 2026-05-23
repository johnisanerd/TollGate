/**
 * Deploy UsycRouter to Arc Testnet.
 *
 * Run:
 *   npx hardhat run contracts/scripts/deploy-usyc-router.cjs --network arcTestnet
 *
 * Writes contracts/deployments/usyc-router.json
 */
const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log(`Network:  ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${hre.ethers.formatUnits(balance, 18)} native`);

  const usdcAddress = process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
  console.log(`USDC:     ${usdcAddress}`);

  const Router = await hre.ethers.getContractFactory("UsycRouter");
  console.log("Deploying UsycRouter...");
  const router = await Router.deploy(deployer.address, usdcAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();

  const deployTx = router.deploymentTransaction();
  console.log(`UsycRouter: ${routerAddress}`);
  console.log(`Tx:         ${deployTx?.hash}`);

  const out = {
    network,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    usycRouter: routerAddress,
    usdc: usdcAddress,
    txHash: deployTx?.hash,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.resolve(__dirname, "../deployments/usyc-router.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nSaved to contracts/deployments/usyc-router.json`);
  console.log(`\nAdd to server/.env:\nCIRCLE_USYC_ROUTER_ADDRESS=${routerAddress}`);
  console.log(`\nAdd to Vercel:\nVITE_ARC_USYC_ROUTER=${routerAddress}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
