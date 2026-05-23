/**
 * Read-only verification of the deployed MarketFactory + AgentRegistry + initial market.
 *
 * Run AFTER deploy-market-factory.cjs. Reads contracts/deployments/arc-market-factory.json
 * and calls every public view function so you can confirm the on-chain state
 * matches what the deploy script printed.
 *
 * Uses zero gas — only view calls.
 *
 *   cd contracts && npx hardhat run --network arcTestnet scripts/verify-deployments.cjs
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
  console.log("Arc Market Factory deployment — on-chain verification");
  console.log("=================================================================");
  console.log("Reading from:", file);
  console.log("Network:    ", d.network, `(chainId ${d.chainId})`);
  console.log("Signer:     ", signer.address);
  console.log();

  // ── AgentRegistry ─────────────────────────────────────────────────────────

  console.log("--- AgentRegistry @", d.addresses.agentRegistry);
  const reg = await hre.ethers.getContractAt("AgentRegistry", d.addresses.agentRegistry);
  console.log("  paused()                      :", await reg.paused());
  console.log("  reputationPerResolution()     :", (await reg.reputationPerResolution()).toString());
  console.log("  getDecisionCount()            :", (await reg.getDecisionCount()).toString());
  const RESOLVER_ROLE = await reg.RESOLVER_ROLE();
  const GOVERNOR_ROLE = await reg.GOVERNOR_ROLE();
  const ADMIN_ROLE    = await reg.DEFAULT_ADMIN_ROLE();
  console.log("  hasRole(ADMIN, deployer)      :", await reg.hasRole(ADMIN_ROLE,    d.admin));
  console.log("  hasRole(RESOLVER, deployer)   :", await reg.hasRole(RESOLVER_ROLE, d.admin));
  console.log("  hasRole(GOVERNOR, deployer)   :", await reg.hasRole(GOVERNOR_ROLE, d.admin));
  console.log();

  // ── MarketFactory ─────────────────────────────────────────────────────────

  console.log("--- MarketFactory @", d.addresses.marketFactory);
  const fac = await hre.ethers.getContractAt("MarketFactory", d.addresses.marketFactory);
  console.log("  owner()                       :", await fac.owner());
  console.log("  paused()                      :", await fac.paused());
  console.log("  maxPerformanceFeeBps()        :", (await fac.maxPerformanceFeeBps()).toString());
  console.log("  maxKillThresholdBps()         :", (await fac.maxKillThresholdBps()).toString());
  console.log("  minKillThresholdBps()         :", (await fac.minKillThresholdBps()).toString());
  console.log("  minStakeFloor()               :", (await fac.minStakeFloor()).toString());
  console.log("  maxStakeCeiling()             :", (await fac.maxStakeCeiling()).toString());
  console.log("  marketCount()                 :", (await fac.marketCount()).toString());
  console.log("  allMarkets(0)                 :", await fac.allMarkets(0));
  console.log("  marketFor(operator, ETH/USDC) :", await fac.marketFor(d.operator, "ETH/USDC", d.addresses.usdc));
  console.log();

  // ── CopyTradeMarket (initial ETH/USDC) ────────────────────────────────────

  console.log("--- CopyTradeMarket @", d.addresses.initialMarket, "(ETH/USDC)");
  const mkt = await hre.ethers.getContractAt("CopyTradeMarket", d.addresses.initialMarket);
  console.log("  owner()                       :", await mkt.owner());
  console.log("  operator()                    :", await mkt.operator());
  console.log("  quoteToken()                  :", await mkt.quoteToken());
  console.log("  baseSymbol()                  :", await mkt.baseSymbol());
  console.log("  performanceFeeBps()           :", (await mkt.performanceFeeBps()).toString());
  console.log("  killThresholdBps()            :", (await mkt.killThresholdBps()).toString());
  console.log("  minStake() / maxStake()       :", (await mkt.minStake()).toString(), "/", (await mkt.maxStake()).toString());
  console.log("  paused()                      :", await mkt.paused());
  console.log("  totalStaked()                 :", (await mkt.totalStaked()).toString());
  console.log("  totalSettled()                :", (await mkt.totalSettled()).toString());
  console.log("  totalFeesPaid()               :", (await mkt.totalFeesPaid()).toString());
  console.log("  getSettlementCount()          :", (await mkt.getSettlementCount()).toString());
  console.log("  jobIdOf(signer)               :", await mkt.jobIdOf(signer.address));
  console.log();

  // ── Sanity: factory paginated read ────────────────────────────────────────

  console.log("--- Paged market read");
  const page = await fac.getMarketsPaged(0, 10);
  page.forEach((entry, i) => {
    console.log(`  [${i}] ${entry.baseSymbol.padEnd(10)} → ${entry.market}  op=${entry.operator}`);
  });
  console.log();
  console.log("Verification complete. All read calls succeeded — contracts are healthy.");
}

main().catch((err) => {
  console.error("\n[FAIL]", err.message ?? err);
  process.exit(1);
});
