/**
 * Record decision on-chain Action.
 *
 * Hashes the previous DECIDE_ETH_DIRECTION payload (SHA-256) and writes the
 * hash to ArcMindRegistry.recordDecision via ethers. When ARC_PRIVATE_KEY or
 * ARC_AGENT_ID are not set, runs in "paper" mode and still records the memory.
 *
 * In a full ElizaOS deployment, replace direct ethers usage with calls to the
 * @elizaos/plugin-evm Action `EVM_WRITE_CONTRACT`.
 */

import { createHash } from "node:crypto";
import type { Action, ActionResult, IAgentRuntime, Memory, State } from "../types.js";

const REGISTRY_ABI = [
  "function recordDecision(bytes32 agentId, bytes32 decisionHash) external returns (uint256 index)",
];

interface EthersModule {
  Wallet: new (key: string, provider: unknown) => { address: string };
  JsonRpcProvider: new (url: string) => unknown;
  Contract: new (addr: string, abi: string[], signer: unknown) => Record<string, (...args: unknown[]) => Promise<{ hash?: string; wait: () => Promise<{ hash?: string }> }>>;
}

let cachedEthers: EthersModule | null = null;
async function loadEthers(): Promise<EthersModule | null> {
  if (cachedEthers) return cachedEthers;
  try {
    const mod = await import("ethers") as unknown as EthersModule;
    cachedEthers = mod;
    return mod;
  } catch {
    return null;
  }
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function toBytes32(hex: string): string {
  const clean = hex.replace(/^0x/, "").padStart(64, "0");
  return "0x" + clean;
}

export const recordOnChainAction: Action = {
  name: "RECORD_ON_CHAIN",
  description: "Hash the latest decision payload and write its hash to ArcMindRegistry on Arc L1.",
  similes: ["ANCHOR_DECISION", "PUBLISH_ONCHAIN"],

  async validate(runtime: IAgentRuntime, _message?: Memory, state?: State): Promise<boolean> {
    if (!state?.values) return false;
    const recent = await runtime.getMemories({ roomId: runtime.agentId, count: 1 });
    return recent.length > 0 && recent[0].content.action === "DECIDE_ETH_DIRECTION";
  },

  async handler(runtime: IAgentRuntime, _message?: Memory, _state?: State): Promise<ActionResult> {
    const recent = await runtime.getMemories({ roomId: runtime.agentId, count: 1 });
    if (recent.length === 0) {
      return { success: false, error: "No prior decision memory found" };
    }
    const decisionMeta = recent[0].content.metadata ?? {};
    const payload = JSON.stringify({ ...decisionMeta, agentId: runtime.agentId });
    const decisionHash = "0x" + sha256Hex(payload);

    const privKey = runtime.getSetting("ARC_PRIVATE_KEY");
    const agentIdHex = runtime.getSetting("ARC_AGENT_ID");
    const registryAddr = runtime.getSetting("ARC_REGISTRY_ADDRESS")
      ?? String(runtime.character.settings?.["registryAddress"] ?? "");
    const rpcUrl = runtime.getSetting("ARC_RPC_URL")
      ?? "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public";

    if (!privKey || !agentIdHex || !registryAddr) {
      runtime.logger.warn("[arcmind] on-chain anchor SKIPPED — ARC_PRIVATE_KEY / ARC_AGENT_ID / ARC_REGISTRY_ADDRESS missing");
      return {
        success: false,
        error: "keys_missing",
        text: `On-chain anchor skipped (keys missing). Decision hash: ${decisionHash}`,
        data: { mode: "paper", decisionHash, txHash: null, reason: "keys_missing" },
      };
    }

    const ethers = await loadEthers();
    if (!ethers) {
      runtime.logger.warn("[arcmind] ethers not installed — on-chain anchor SKIPPED");
      return {
        success: false,
        error: "ethers_missing",
        text: `On-chain anchor skipped (ethers not installed). Decision hash: ${decisionHash}`,
        data: { mode: "paper", decisionHash, txHash: null, reason: "ethers_missing" },
      };
    }

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privKey, provider);
      const registry = new ethers.Contract(registryAddr, REGISTRY_ABI, wallet);
      const r = registry as unknown as { recordDecision: (a: string, h: string) => Promise<{ hash?: string; wait: () => Promise<{ hash?: string }> }> };
      const tx = await r.recordDecision(toBytes32(agentIdHex), decisionHash);
      const receipt = await tx.wait();
      const txHash = receipt.hash ?? tx.hash ?? "unknown";

      runtime.logger.info(`[arcmind] recorded ${decisionHash.slice(0, 14)}... → tx ${txHash}`);
      return {
        success: true,
        text: `Decision anchored on Arc: tx ${txHash}`,
        data: { mode: "arc", decisionHash, txHash, walletAddress: wallet.address },
      };
    } catch (err) {
      runtime.logger.error(`[arcmind] recordDecision failed: ${(err as Error).message}`);
      return {
        success: false,
        error: (err as Error).message,
        data: { mode: "paper", decisionHash, txHash: null },
      };
    }
  },
};
