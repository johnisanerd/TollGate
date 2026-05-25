/**
 * Read-only client for the on-chain AgentRegistry (ERC-8004-style).
 *
 * Discovers agents by indexing `AgentRegistered` events from the deployed
 * registry, then reads their current `AgentInfo` (reputation, decisions,
 * slashed flag). No fabricated data — empty config → empty list.
 */

import { Contract, Interface, JsonRpcProvider, type Log } from "ethers";

const REGISTRY_ABI = [
  "function getAgent(bytes32 agentId) view returns (tuple(address owner, bytes32 builderId, string metadata, uint64 registeredAt, uint256 decisions, uint256 reputation, bool slashed))",
  "function agentDecisionCount(bytes32 agentId) view returns (uint256)",
  "function agentReputation(bytes32 agentId) view returns (uint256)",
  "function reputationPerResolution() view returns (uint16)",
  "event AgentRegistered(bytes32 indexed agentId, bytes32 indexed builderId, address indexed owner, string metadata)",
  "event AgentSlashed(bytes32 indexed agentId, uint256 indexed decisionIndex, string reason)",
];

const ARC_RPC_FALLBACK = "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public";
const DEFAULT_LOOKBACK_BLOCKS = 200_000n;

function env(key: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.trim() ? v.trim() : undefined;
}

function getRegistryAddress(): string | null {
  return env("VITE_ARC_AGENT_REGISTRY") ?? null;
}

export function isAgentRegistryConfigured(): boolean {
  return getRegistryAddress() !== null;
}

function getArcRpc(): string {
  const explicit = env("VITE_ARC_RPC_URL");
  if (explicit) return explicit;
  const serverUrl = env("VITE_SERVER_URL");
  if (serverUrl) return `${serverUrl}/api/arc-rpc`;
  return ARC_RPC_FALLBACK;
}

function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider(getArcRpc());
}

export interface AgentSnapshot {
  agentId: string;
  builderId: string;
  owner: string;
  metadata: string;
  registeredAt: number;
  decisions: number;
  reputation: number;
  slashed: boolean;
  slashReason?: string;
}

const IFACE = new Interface(REGISTRY_ABI);

export async function fetchAgentSnapshots(opts?: { lookbackBlocks?: bigint }): Promise<AgentSnapshot[]> {
  const addr = getRegistryAddress();
  if (!addr) return [];
  try {
    const provider = getProvider();
    const registry = new Contract(addr, REGISTRY_ABI, provider);
    const head = await provider.getBlockNumber();
    const fromBlock = Math.max(0, head - Number(opts?.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS));

    const registeredTopics = IFACE.encodeFilterTopics("AgentRegistered", []);
    const slashedTopics = IFACE.encodeFilterTopics("AgentSlashed", []);

    const [registeredLogs, slashedLogs] = await Promise.all([
      provider.getLogs({ address: addr, topics: registeredTopics, fromBlock, toBlock: head }),
      provider.getLogs({ address: addr, topics: slashedTopics, fromBlock, toBlock: head }),
    ]);

    const slashReasons = new Map<string, string>();
    for (const log of slashedLogs as Log[]) {
      const parsed = IFACE.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed) continue;
      const id = String(parsed.args["agentId"]);
      const reason = String(parsed.args["reason"]);
      slashReasons.set(id.toLowerCase(), reason);
    }

    const seen = new Set<string>();
    const out: AgentSnapshot[] = [];
    for (const log of registeredLogs as Log[]) {
      const parsed = IFACE.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed) continue;
      const agentId = String(parsed.args["agentId"]);
      const builderId = String(parsed.args["builderId"]);
      const owner = String(parsed.args["owner"]);
      if (seen.has(agentId.toLowerCase())) continue;
      seen.add(agentId.toLowerCase());

      let info: {
        owner: string; builderId: string; metadata: string;
        registeredAt: bigint; decisions: bigint; reputation: bigint; slashed: boolean;
      };
      try {
        info = await registry.getAgent(agentId) as typeof info;
      } catch {
        continue;
      }
      out.push({
        agentId,
        builderId,
        owner,
        metadata: info.metadata,
        registeredAt: Number(info.registeredAt) * 1000,
        decisions: Number(info.decisions),
        reputation: Number(info.reputation),
        slashed: Boolean(info.slashed),
        slashReason: slashReasons.get(agentId.toLowerCase()),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export const AGENT_REGISTRY_ABI = REGISTRY_ABI;
export const AGENT_REGISTRY_IFACE = IFACE;
