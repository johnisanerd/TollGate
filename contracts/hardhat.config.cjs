/* Hardhat config for the AgentPay Router 0G contracts.
 *
 * Everything chain-specific comes from contracts/.env (copy contracts/.env.example).
 * Nothing here is a secret — OG_PRIVATE_KEY only ever lives in your local .env,
 * which is git-ignored.
 */
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("dotenv").config();

const {
  OG_RPC_URL,
  OG_TESTNET_RPC_URL,
  OG_PRIVATE_KEY,
  OG_CHAIN_ID,
  OG_TESTNET_CHAIN_ID,
  MANTLE_RPC_URL,
  MANTLE_SEPOLIA_RPC_URL,
  MANTLE_PRIVATE_KEY,
  ARBITRUM_RPC_URL,
  ARBITRUM_SEPOLIA_RPC_URL,
  ARBITRUM_PRIVATE_KEY,
  ORBIT_RPC_URL,
  ORBIT_CHAIN_ID,
  QIE_RPC_URL,
  QIE_MAINNET_RPC_URL,
  QIE_MAINNET_V3_RPC_URL,
  QIE_PRIVATE_KEY,
  ARC_RPC_URL,
  ARC_PRIVATE_KEY,
  POLYGON_RPC_URL,
  POLYGON_CARDONA_RPC_URL,
} = process.env;

const ogAccounts = OG_PRIVATE_KEY ? [OG_PRIVATE_KEY] : [];
const mantleAccounts = MANTLE_PRIVATE_KEY ? [MANTLE_PRIVATE_KEY] : [];
const arbAccounts = ARBITRUM_PRIVATE_KEY ? [ARBITRUM_PRIVATE_KEY] : [];
const arcAccounts = ARC_PRIVATE_KEY ? [ARC_PRIVATE_KEY] : [];
const qieAccounts = QIE_PRIVATE_KEY ? [QIE_PRIVATE_KEY] : [];

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    // 0G mainnet (or whatever RPC you point OG_RPC_URL at).
    og: {
      url: OG_RPC_URL || "https://evmrpc.0g.ai",
      chainId: OG_CHAIN_ID ? Number(OG_CHAIN_ID) : undefined,
      accounts: ogAccounts,
    },
    // 0G Galileo testnet — handy for a dry run before mainnet.
    ogTestnet: {
      url: OG_TESTNET_RPC_URL || "https://evmrpc-testnet.0g.ai",
      chainId: OG_TESTNET_CHAIN_ID ? Number(OG_TESTNET_CHAIN_ID) : 16602,
      accounts: ogAccounts,
    },
    // Mantle mainnet (chainId 5000).
    mantle: {
      url: MANTLE_RPC_URL || "https://rpc.mantle.xyz",
      chainId: 5000,
      accounts: mantleAccounts,
    },
    // Mantle Sepolia testnet (chainId 5003) — dry run before mainnet.
    mantleSepolia: {
      url: MANTLE_SEPOLIA_RPC_URL || "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      accounts: mantleAccounts,
    },
    // Arbitrum One (chainId 42161).
    arbitrumOne: {
      url: ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: arbAccounts,
    },
    // Arbitrum Sepolia testnet (chainId 421614).
    arbitrumSepolia: {
      url: ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: arbAccounts,
    },
    // Generic Arbitrum Orbit chain (e.g. Robinhood Chain) — point ORBIT_RPC_URL / ORBIT_CHAIN_ID at it.
    orbit: {
      url: ORBIT_RPC_URL || "",
      chainId: ORBIT_CHAIN_ID ? Number(ORBIT_CHAIN_ID) : undefined,
      accounts: arbAccounts,
    },
    // QIE testnet (chainId 1983 = 0x7BF).
    qieTestnet: {
      url: QIE_RPC_URL || "https://rpc1testnet.qie.digital/",
      chainId: 1983,
      accounts: qieAccounts,
    },
    // QIE legacy mainnet (chainId 5656). TLS issues on rpc-main1; use rpc-main2 as fallback.
    qieMainnetLegacy: {
      url: QIE_MAINNET_RPC_URL || "https://rpc-main2.qiblockchain.online/",
      chainId: 5656,
      accounts: qieAccounts,
    },
    // QIE mainnet v3 (chainId 1990) — current mainnet since July 2024.
    qieMainnet: {
      url: QIE_MAINNET_V3_RPC_URL || "https://rpc1mainnet.qie.digital/",
      chainId: 1990,
      accounts: qieAccounts,
    },
    // Arc L1 testnet (chainId 5042002). USDC is native gas token.
    // Get RPC key from: arc-node.thecanteenapp.com after running `arc login`
    arcTestnet: {
      url: ARC_RPC_URL || "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public",
      chainId: 5042002,
      accounts: arcAccounts,
    },
    // Polygon zkEVM mainnet (chainId 1101).
    polygonMainnet: {
      url: POLYGON_RPC_URL || "https://zkevm-rpc.com",
      chainId: 1101,
      accounts: arbAccounts,
    },
    // Polygon Cardona testnet (chainId 2442).
    polygonCardona: {
      url: POLYGON_CARDONA_RPC_URL || "https://rpc.cardona.zkevm-rpc.com",
      chainId: 2442,
      accounts: arbAccounts,
    },
  },
};
