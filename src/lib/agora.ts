/* Agora / Arc L1 on-chain glue for the frontend.
 *
 * Arc L1 testnet (chainId 5042002) is the only network — no mainnet exists.
 *
 * Deployed contracts (arcTestnet.json):
 *   ArcMindRegistry:   VITE_ARC_REGISTRY_ADDRESS
 *   CopyTradeEscrow:   VITE_ARC_ESCROW_ADDRESS
 *
 * Same graceful-degradation pattern as src/lib/arbitrum.ts and src/lib/mantle.ts.
 */
import { BrowserProvider, Contract, encodeBytes32String, Interface, JsonRpcProvider } from "ethers";
import type { NetworkMode } from "./chains";

function env(key: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.trim() ? v.trim() : undefined;
}

// Arc L1 testnet chainId 5042002 = 0x4CEF52
export const ARC_CHAIN_HEX = "0x4cef52";

const ARC_ADD_CHAIN: Record<string, unknown> = {
  "0x4cef52": {
    chainId: "0x4cef52",
    chainName: "Arc L1 Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.testnet.arc-node.thecanteenapp.com/v1/public"],
    blockExplorerUrls: ["https://testnet.arcscan.app"],
  },
};

export type AgoraConfig = {
  registryAddress: string | null;
  escrowAddress: string | null;
  explorerBase: string;
  chainHex: string;
};

export function getAgoraConfig(_mode?: NetworkMode): AgoraConfig {
  return {
    registryAddress: env("VITE_ARC_REGISTRY_ADDRESS") ?? null,
    escrowAddress:   env("VITE_ARC_ESCROW_ADDRESS") ?? null,
    explorerBase:    (env("VITE_ARC_EXPLORER") ?? "https://testnet.arcscan.app").replace(/\/+$/, ""),
    chainHex: ARC_CHAIN_HEX,
  };
}

export function isAgoraRegistryConfigured(): boolean { return getAgoraConfig().registryAddress !== null; }
export function isAgoraEscrowConfigured():   boolean { return getAgoraConfig().escrowAddress !== null; }
export function arcExplorerAddrUrl(addr: string): string { return `${getAgoraConfig().explorerBase}/address/${addr}`; }
export function arcExplorerTxUrl(txHash: string): string { return `${getAgoraConfig().explorerBase}/tx/${txHash}`; }

// ── Wallet switch to Arc L1 ───────────────────────────────────────────────────

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

function getEth(): Eip1193 {
  const eth = typeof window !== "undefined" ? (window as unknown as { ethereum?: Eip1193 }).ethereum : undefined;
  if (!eth) throw new Error("No EIP-1193 wallet detected — install MetaMask.");
  return eth;
}

// ── ABI fragments ─────────────────────────────────────────────────────────────

const REGISTRY_ABI = [
  "function registerAgent(bytes32 builderId, string calldata metadata) external returns (bytes32 agentId)",
  "function recordDecision(bytes32 agentId, bytes32 decisionHash) external returns (uint256 index)",
  "function resolveDecision(uint256 index, bytes32 outcomeHash) external",
  "function getReputation(bytes32 agentId) external view returns (uint256)",
];

const ESCROW_ABI = [
  "function stake(uint256 amount) external",
  "function totalStaked() view returns (uint256)",
  "function jobIdOf(address trader) view returns (bytes32)",
  "event JobCreated(bytes32 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 budget, uint256 ts)",
  "event JobFunded(bytes32 indexed jobId, uint256 amount, uint256 ts)",
  "event JobSubmitted(bytes32 indexed jobId, bytes32 outcome, uint256 ts)",
  "event JobCompleted(bytes32 indexed jobId, bytes32 reason, uint256 ts)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
];

const ARC_USDC = "0x3600000000000000000000000000000000000000";

// ── Circle Paymaster (ERC-4337) ───────────────────────────────────────────────
//
// If VITE_ARC_PAYMASTER_URL is set, we call pm_sponsorUserOperation before the
// stake tx to check whether Circle Paymaster will cover gas. With a regular
// MetaMask EOA the actual tx still pays gas; in production a SmartAccount would
// send the fully sponsored UserOperation via a Bundler instead.

const ENTRYPOINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

async function checkPaymasterSponsorship(
  paymasterUrl: string,
  from: string,
  calldata: string,
  nonce: number,
): Promise<boolean> {
  const userOp = {
    sender: from,
    nonce: `0x${nonce.toString(16)}`,
    initCode: "0x",
    callData: calldata,
    callGasLimit: "0x186a0",
    verificationGasLimit: "0x186a0",
    preVerificationGas: "0x5208",
    maxFeePerGas: "0x3b9aca00",
    maxPriorityFeePerGas: "0x3b9aca00",
    paymasterAndData: "0x",
    signature: "0x",
  };
  const res = await fetch(paymasterUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "pm_sponsorUserOperation", params: [userOp, ENTRYPOINT_V06] }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) return false;
  const data = await res.json() as { result?: { paymasterAndData?: string } };
  return !!(data.result?.paymasterAndData);
}

// ── On-chain write helpers ────────────────────────────────────────────────────

export async function stakeToEscrow(amountUsdc: number): Promise<{ txHash: string; gasless: boolean }> {
  const cfg = getAgoraConfig();
  if (!cfg.escrowAddress) throw new Error("CopyTradeEscrow not configured.");
  await switchToArc();
  const eth = getEth();
  await eth.request({ method: "eth_requestAccounts" });
  const provider = new BrowserProvider(eth as never);
  const signer = await provider.getSigner();

  // Circle Paymaster sponsorship check (optional — graceful fallback if absent)
  let gasless = false;
  const paymasterUrl = env("VITE_ARC_PAYMASTER_URL");
  if (paymasterUrl) {
    try {
      const from = await signer.getAddress();
      const nonce = await provider.getTransactionCount(from);
      // encode stake(amountWei) calldata for the sponsorship check
      const escrowIface = new Interface(ESCROW_ABI);
      const amountWeiCheck = BigInt(Math.round(amountUsdc * 1_000_000));
      const calldata = escrowIface.encodeFunctionData("stake", [amountWeiCheck]);
      gasless = await checkPaymasterSponsorship(paymasterUrl, from, calldata, nonce);
    } catch { /* paymaster unavailable — proceed without it */ }
  }

  const amountWei = BigInt(Math.round(amountUsdc * 1_000_000)); // USDC 6 decimals
  const usdc = new Contract(ARC_USDC, ERC20_ABI, signer);
  await (await usdc.approve(cfg.escrowAddress, amountWei)).wait();
  const escrow = new Contract(cfg.escrowAddress, ESCROW_ABI, signer);
  const tx = await escrow.stake(amountWei);
  const receipt = await tx.wait() as { hash: string };
  return { txHash: receipt.hash, gasless };
}

export async function registerArcAgent(domain: string, metadata: string): Promise<{ agentId: string; txHash: string }> {
  const cfg = getAgoraConfig();
  if (!cfg.registryAddress) throw new Error("ArcMindRegistry not configured.");
  await switchToArc();
  const eth = getEth();
  await eth.request({ method: "eth_requestAccounts" });
  const provider = new BrowserProvider(eth as never);
  const signer = await provider.getSigner();
  const builderId = encodeBytes32String(domain.slice(0, 31));
  const registry = new Contract(cfg.registryAddress, REGISTRY_ABI, signer);
  const tx = await registry.registerAgent(builderId, metadata);
  const receipt = await tx.wait() as { hash: string; logs?: { topics?: string[] }[] };
  const agentId = receipt.logs?.find((l) => l.topics && l.topics.length > 1)?.topics?.[1] ?? null;
  return { agentId: agentId ?? "0x" + "0".repeat(64), txHash: receipt.hash };
}

export async function recordArcDecision(agentId: string, decisionJson: string): Promise<{ txHash: string }> {
  const cfg = getAgoraConfig();
  if (!cfg.registryAddress) throw new Error("ArcMindRegistry not configured.");
  await switchToArc();
  const eth = getEth();
  await eth.request({ method: "eth_requestAccounts" });
  const provider = new BrowserProvider(eth as never);
  const signer = await provider.getSigner();
  const enc = new TextEncoder();
  const raw = enc.encode(decisionJson);
  const hashBuf = await crypto.subtle.digest("SHA-256", raw);
  const decisionHash = "0x" + Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  const registry = new Contract(cfg.registryAddress, REGISTRY_ABI, signer);
  const tx = await registry.recordDecision(agentId, decisionHash);
  const receipt = await tx.wait() as { hash: string };
  return { txHash: receipt.hash };
}

export async function resolveArcDecision(index: number, outcome: string): Promise<{ txHash: string }> {
  const cfg = getAgoraConfig();
  if (!cfg.registryAddress) throw new Error("ArcMindRegistry not configured.");
  await switchToArc();
  const eth = getEth();
  await eth.request({ method: "eth_requestAccounts" });
  const provider = new BrowserProvider(eth as never);
  const signer = await provider.getSigner();
  const enc = new TextEncoder();
  const raw = enc.encode(outcome);
  const hashBuf = await crypto.subtle.digest("SHA-256", raw);
  const outcomeHash = "0x" + Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  const registry = new Contract(cfg.registryAddress, REGISTRY_ABI, signer);
  const tx = await registry.resolveDecision(index, outcomeHash);
  const receipt = await tx.wait() as { hash: string };
  return { txHash: receipt.hash };
}

// ── ERC-8183 Job lifecycle reader ─────────────────────────────────────────────

export type JobState = "Open" | "Funded" | "Submitted" | "Terminal";

export interface JobLifecycleEntry {
  jobId: string;
  state: JobState;
  client: string;
  provider: string;
  evaluator: string;
  budget: string;       // USDC, formatted as decimal string (6 decimals → display)
  createdAt: number;    // unix ms
  fundedAt?: number;
  submittedAt?: number;
  completedAt?: number;
  outcome?: string;
  reason?: string;
  txHashes: {
    created?: string;
    funded?: string;
    submitted?: string;
    completed?: string;
  };
}

const ARC_RPC_FALLBACK = "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public";
const ESCROW_DEPLOY_BLOCK_FALLBACK = 0;

function getArcRpc(): string {
  const explicit = env("VITE_ARC_RPC_URL");
  if (explicit) return explicit;
  const serverUrl = env("VITE_SERVER_URL");
  if (serverUrl) return `${serverUrl}/api/arc-rpc`;
  return ARC_RPC_FALLBACK;
} // safe default; backend can override later

interface RawLog {
  fragment?: { name?: string };
  args?: Record<string | number, unknown>;
  blockNumber?: number;
  transactionHash?: string;
}

interface EthersBlockMin { timestamp: number }

/**
 * Read ERC-8183 lifecycle events for `userAddress` from CopyTradeEscrow.
 * Returns most-recent-first list of Jobs with their state progression and tx hashes.
 *
 * Reads via the Arc public RPC. Returns [] when escrow address is not configured,
 * RPC is down, or the address has no Jobs.
 */
export async function fetchEscrowJobLifecycle(userAddress: string): Promise<JobLifecycleEntry[]> {
  const cfg = getAgoraConfig();
  if (!cfg.escrowAddress) return [];
  if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) return [];

  try {
    const provider = new JsonRpcProvider(getArcRpc());
    const escrow = new Contract(cfg.escrowAddress, ESCROW_ABI, provider);

    const userLower = userAddress.toLowerCase();
    const fromBlock = ESCROW_DEPLOY_BLOCK_FALLBACK;

    // JobCreated has 3 indexed topics: jobId, client, provider. Filter by client.
    const createdFilter = escrow.filters.JobCreated(null, userAddress);
    const createdLogs = await escrow.queryFilter(createdFilter, fromBlock) as unknown as RawLog[];

    const jobs: JobLifecycleEntry[] = [];
    const blockCache = new Map<number, number>(); // blockNumber → ts (sec)

    async function blockTs(num: number | undefined): Promise<number> {
      if (typeof num !== "number") return 0;
      const cached = blockCache.get(num);
      if (cached !== undefined) return cached;
      const block = await provider.getBlock(num) as EthersBlockMin | null;
      const ts = block?.timestamp ?? 0;
      blockCache.set(num, ts);
      return ts;
    }

    for (const log of createdLogs) {
      const args = log.args ?? {};
      const jobId = String(args["jobId"] ?? args[0]);
      if (!jobId || jobId === "0x") continue;
      const provider_ = String(args["provider"] ?? args[2]);
      const evaluator = String(args["evaluator"] ?? args[3]);
      const budget = String(args["budget"] ?? args[4]);
      const createdTs = await blockTs(log.blockNumber);

      const fundedLogs = await escrow.queryFilter(escrow.filters.JobFunded(jobId), fromBlock) as unknown as RawLog[];
      const submittedLogs = await escrow.queryFilter(escrow.filters.JobSubmitted(jobId), fromBlock) as unknown as RawLog[];
      const completedLogs = await escrow.queryFilter(escrow.filters.JobCompleted(jobId), fromBlock) as unknown as RawLog[];

      const fundedLog = fundedLogs[0];
      const submittedLog = submittedLogs[0];
      const completedLog = completedLogs[0];

      let state: JobState = "Open";
      if (completedLog) state = "Terminal";
      else if (submittedLog) state = "Submitted";
      else if (fundedLog) state = "Funded";

      jobs.push({
        jobId,
        state,
        client: userAddress,
        provider: provider_,
        evaluator,
        budget,
        createdAt: createdTs * 1000,
        fundedAt: fundedLog ? (await blockTs(fundedLog.blockNumber)) * 1000 : undefined,
        submittedAt: submittedLog ? (await blockTs(submittedLog.blockNumber)) * 1000 : undefined,
        completedAt: completedLog ? (await blockTs(completedLog.blockNumber)) * 1000 : undefined,
        outcome: submittedLog ? String(submittedLog.args?.["outcome"] ?? "") : undefined,
        reason: completedLog ? decodeReason(String(completedLog.args?.["reason"] ?? "")) : undefined,
        txHashes: {
          created: log.transactionHash,
          funded: fundedLog?.transactionHash,
          submitted: submittedLog?.transactionHash,
          completed: completedLog?.transactionHash,
        },
      });
    }

    // Most recent first
    jobs.sort((a, b) => b.createdAt - a.createdAt);
    return jobs;
  } catch {
    return [];
  }
}

/** Decode bytes32-packed ERC-8183 reason string ("settled", "kill_switch", "global_halt"). */
function decodeReason(hex: string): string {
  if (!hex || hex === "0x") return "";
  try {
    // strip trailing zeros and decode as UTF-8
    const clean = hex.replace(/^0x/, "").replace(/(00)+$/, "");
    if (clean.length === 0) return "";
    const bytes = new Uint8Array(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return hex;
  }
}

export async function getArcAgentStats(agentId: string): Promise<{ reputation: number } | null> {
  const cfg = getAgoraConfig();
  if (!cfg.registryAddress || !agentId) return null;
  try {
    const iface = new Interface(REGISTRY_ABI);
    const provider = new JsonRpcProvider(getArcRpc());
    const registry = new Contract(cfg.registryAddress, iface, provider);
    const rep = await registry.getReputation(agentId) as bigint;
    return { reputation: Number(rep) };
  } catch {
    return null;
  }
}

export async function switchToArc(): Promise<void> {
  const eth = getEth();
  const current = (await eth.request({ method: "eth_chainId" })) as string;
  if (current.toLowerCase() === ARC_CHAIN_HEX) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_HEX }] });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 4902) {
      try { await eth.request({ method: "wallet_addEthereumChain", params: [ARC_ADD_CHAIN[ARC_CHAIN_HEX]] }); }
      catch { throw new Error("Add Arc L1 Testnet to your wallet and retry."); }
    } else {
      throw new Error(`Switch wallet to Arc L1 Testnet (${ARC_CHAIN_HEX}) and retry.`);
    }
  }
}
