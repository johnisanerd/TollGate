/**
 * Exercise the CopyTradeMarket end-to-end against the deployed initial market.
 *
 * Step 0 (read-only): probe the configured USDC address to verify it is an
 *   actual ERC-20 contract (has bytecode + balanceOf works). Aborts if not.
 * Step 1: approve($1 USDC for the market) — 1 tx, ~50K gas
 * Step 2: stake($1 USDC)                  — 1 tx, ~180K gas  (emits JobCreated + JobFunded)
 * Step 3: settle(trader, +$0)             — 1 tx, ~90K gas  (operator-signed, emits JobSubmitted + JobCompleted("settled"))
 *
 * If the USDC address isn't a real ERC-20 (e.g. it's the Arc native-gas
 * precompile), the script aborts before any tx is sent — no gas wasted.
 *
 *   cd contracts && npx hardhat run --network arcTestnet scripts/exercise-market.cjs
 */

const fs   = require("fs");
const path = require("path");
const hre  = require("hardhat");

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function main() {
  const file = path.resolve(__dirname, "..", "deployments", "arc-market-factory.json");
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run npm run deploy:arc-market-factory first.`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const [signer] = await hre.ethers.getSigners();

  console.log("=================================================================");
  console.log("CopyTradeMarket — exercise (stake + settle)");
  console.log("=================================================================");
  console.log("Network: ", d.network, `(chainId ${d.chainId})`);
  console.log("Signer:  ", signer.address);
  console.log("Market:  ", d.addresses.initialMarket);
  console.log("USDC:    ", d.addresses.usdc);
  console.log();

  const explorer = d.explorer || "https://testnet.arcscan.app";
  const market   = await hre.ethers.getContractAt("CopyTradeMarket", d.addresses.initialMarket);

  // ── Step 0: USDC contract probe ──────────────────────────────────────────
  console.log("[0] Probing USDC contract…");

  const code = await hre.ethers.provider.getCode(d.addresses.usdc);
  if (code === "0x") {
    console.log("    USDC address has NO contract bytecode at", d.addresses.usdc);
    console.log("    This is likely the Arc L1 native-gas precompile or an unconfigured address.");
    console.log("    `stake()` would revert in safeTransferFrom — aborting before any gas is spent.");
    console.log("    Fix: set ARC_USDC_ADDRESS in contracts/.env to a real ERC-20 USDC on Arc,");
    console.log("         then re-run `npm run deploy:arc-market-factory` to spawn a new market.");
    process.exit(0);
  }

  const usdc = new hre.ethers.Contract(d.addresses.usdc, ERC20_ABI, signer);
  let usdcSymbol = "USDC";
  let usdcDecimals = 6;
  try { usdcSymbol  = await usdc.symbol(); } catch { /* not standard ERC-20 */ }
  try { usdcDecimals = Number(await usdc.decimals()); } catch { /* default */ }
  let balance = 0n;
  try {
    balance = await usdc.balanceOf(signer.address);
  } catch (err) {
    console.log("    USDC.balanceOf reverted:", err.message);
    console.log("    The contract at this address is not a standard ERC-20. Aborting.");
    process.exit(0);
  }
  console.log("    symbol     :", usdcSymbol);
  console.log("    decimals   :", usdcDecimals);
  console.log("    your balance:", balance.toString(), `(${hre.ethers.formatUnits(balance, usdcDecimals)} ${usdcSymbol})`);

  const minStake = await market.minStake();
  console.log("    market min :", minStake.toString(), `(${hre.ethers.formatUnits(minStake, usdcDecimals)} ${usdcSymbol})`);

  if (balance < minStake) {
    console.log("\n    [SKIP] Insufficient balance for min stake. Get testnet USDC from faucet and retry.");
    process.exit(0);
  }

  const stakeAmount = minStake;

  // ── Step 1: approve ──────────────────────────────────────────────────────
  console.log();
  console.log("[1] approve(market, $1 USDC)");
  const tx1 = await usdc.approve(d.addresses.initialMarket, stakeAmount);
  const r1  = await tx1.wait();
  console.log("    tx:", `${explorer}/tx/${r1.hash}`);

  // ── Step 2: stake ────────────────────────────────────────────────────────
  console.log();
  console.log("[2] stake($1 USDC) — emits JobCreated + JobFunded + Staked");
  const existing = await market.getPosition(signer.address);
  if (existing.stakeQuote > 0n) {
    console.log("    [SKIP] Signer already has an open position. Settle it first.");
    process.exit(0);
  }
  const tx2 = await market.stake(stakeAmount);
  const r2  = await tx2.wait();
  console.log("    tx:", `${explorer}/tx/${r2.hash}`);
  const jobId = await market.jobIdOf(signer.address);
  console.log("    jobId (ERC-8183):", jobId);

  // ── Step 3: settle (operator-signed; deployer == operator in our deploy) ─
  console.log();
  console.log("[3] settle(signer, +0 PnL) — emits JobSubmitted + JobCompleted(settled)");
  const operator = await market.operator();
  if (operator.toLowerCase() !== signer.address.toLowerCase()) {
    console.log("    [SKIP] Signer is not the market operator. Operator =", operator);
    console.log("    Your position is now open at the market.");
    process.exit(0);
  }
  const tx3 = await market.settle(signer.address, 0n);
  const r3  = await tx3.wait();
  console.log("    tx:", `${explorer}/tx/${r3.hash}`);
  const newBal = await usdc.balanceOf(signer.address);
  console.log("    balance after settle:", newBal.toString(), `(${hre.ethers.formatUnits(newBal, usdcDecimals)} ${usdcSymbol})`);

  console.log();
  console.log("All 3 tx confirmed. Market exercise complete.");
}

main().catch((err) => {
  console.error("\n[FAIL]", err.message ?? err);
  process.exit(1);
});
