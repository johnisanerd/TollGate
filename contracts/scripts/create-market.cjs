/**
 * Create an additional CopyTradeMarket via the deployed MarketFactory.
 *
 * Example — EURC quote token once Circle deploys EURC on Arc Testnet:
 *   FACTORY_ADDRESS=0x9C36Aa5fa856893Ae70E33014985678E4Ce198AD \
 *   QUOTE_TOKEN=<EURC address on Arc Testnet> \
 *   BASE_SYMBOL="ETH/EURC" \
 *   npx hardhat run contracts/scripts/create-market.cjs --network arcTestnet
 *
 * Example — BTC market with same USDC quote:
 *   FACTORY_ADDRESS=0x9C36Aa5fa856893Ae70E33014985678E4Ce198AD \
 *   QUOTE_TOKEN=0x3600000000000000000000000000000000000000 \
 *   BASE_SYMBOL="BTC/USDC" \
 *   npx hardhat run contracts/scripts/create-market.cjs --network arcTestnet
 *
 * Other env (all optional with sensible defaults):
 *   OPERATOR        — defaults to deployer
 *   PERF_FEE_BPS    — defaults to 500 (5%)
 *   KILL_BPS        — defaults to 1500 (15%)
 *   MIN_STAKE_USDC  — defaults to 1     (1 USDC, 6 decimals)
 *   MAX_STAKE_USDC  — defaults to 1000  (1000 USDC)
 *
 * The script REFUSES to invent quote-token addresses. If QUOTE_TOKEN is
 * unset it exits with a clear error — no mocks, no fabricated tokens.
 */
const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

const FACTORY_ABI = [
  "function createMarket(address operator, address quoteToken, string baseSymbol, uint16 performanceFeeBps, uint16 killThresholdBps, uint256 minStake, uint256 maxStake) returns (address)",
  "function marketFor(address operator, string baseSymbol, address quoteToken) view returns (address)",
];

function envOrDie(key) {
  const v = (process.env[key] || "").trim();
  if (!v) {
    console.error(`ERROR: ${key} is required.`);
    process.exit(1);
  }
  return v;
}

function envOr(key, fallback) {
  const v = (process.env[key] || "").trim();
  return v || fallback;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  console.log(`Network:  ${network}`);
  console.log(`Deployer: ${deployer.address}`);

  const factoryAddress = envOrDie("FACTORY_ADDRESS");
  const quoteToken = envOrDie("QUOTE_TOKEN");
  const baseSymbol = envOrDie("BASE_SYMBOL");
  const operator = envOr("OPERATOR", deployer.address);
  const perfFeeBps = Number(envOr("PERF_FEE_BPS", "500"));
  const killBps = Number(envOr("KILL_BPS", "1500"));
  const minStakeUsdc = Number(envOr("MIN_STAKE_USDC", "1"));
  const maxStakeUsdc = Number(envOr("MAX_STAKE_USDC", "1000"));

  const minStake = hre.ethers.parseUnits(String(minStakeUsdc), 6);
  const maxStake = hre.ethers.parseUnits(String(maxStakeUsdc), 6);

  console.log("Parameters:");
  console.log(`  factory:     ${factoryAddress}`);
  console.log(`  operator:    ${operator}`);
  console.log(`  quoteToken:  ${quoteToken}`);
  console.log(`  baseSymbol:  ${baseSymbol}`);
  console.log(`  perfFeeBps:  ${perfFeeBps}`);
  console.log(`  killBps:     ${killBps}`);
  console.log(`  minStake:    ${minStakeUsdc} USDC-units (6dp)`);
  console.log(`  maxStake:    ${maxStakeUsdc} USDC-units (6dp)`);

  const factory = new hre.ethers.Contract(factoryAddress, FACTORY_ABI, deployer);

  const existing = await factory.marketFor(operator, baseSymbol, quoteToken);
  if (existing && existing !== hre.ethers.ZeroAddress) {
    console.log(`Market already exists at ${existing}; nothing to do.`);
    return;
  }

  console.log("Submitting createMarket transaction…");
  const tx = await factory.createMarket(operator, quoteToken, baseSymbol, perfFeeBps, killBps, minStake, maxStake);
  console.log(`  tx: ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt) {
    console.error("ERROR: no receipt — RPC may have dropped the tx.");
    process.exit(1);
  }

  const newMarket = await factory.marketFor(operator, baseSymbol, quoteToken);
  console.log(`Market deployed at ${newMarket} (block ${receipt.blockNumber})`);

  const outDir = path.join(__dirname, "..", "deployments");
  const outPath = path.join(outDir, "arc-market-factory.json");
  if (fs.existsSync(outPath)) {
    const json = JSON.parse(fs.readFileSync(outPath, "utf8"));
    json.additionalMarkets = json.additionalMarkets || [];
    json.additionalMarkets.push({
      address: newMarket,
      baseSymbol,
      quoteToken,
      operator,
      performanceFeeBps: perfFeeBps,
      killThresholdBps: killBps,
      minStake: minStake.toString(),
      maxStake: maxStake.toString(),
      txHash: tx.hash,
      createdAt: new Date().toISOString(),
    });
    fs.writeFileSync(outPath, JSON.stringify(json, null, 2) + "\n");
    console.log(`Updated ${path.relative(process.cwd(), outPath)}`);
  } else {
    console.log("(No arc-market-factory.json found — skipping deployment record update.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
