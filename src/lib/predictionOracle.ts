/**
 * Read-only client for PredictionOracle (native Arc prediction markets).
 *
 * Lists registered questions and their outcomes. Returns empty list when
 * VITE_ARC_PREDICTION_ORACLE is unset — never fabricates predictions.
 */

import { Contract, Interface, JsonRpcProvider } from "ethers";

const ORACLE_ABI = [
  "function getQuestionCount() view returns (uint256)",
  "function getQuestionIdAt(uint256) view returns (bytes32)",
  "function getPrediction(bytes32) view returns (tuple(string question, string citationUri, bytes32 outcome, uint64 registeredAt, uint64 resolvedAt, address admin, bool resolved))",
  "function YES() view returns (bytes32)",
  "function NO() view returns (bytes32)",
];

const ARC_RPC_FALLBACK = "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public";

function env(key: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.trim() ? v.trim() : undefined;
}

function getOracleAddress(): string | null {
  return env("VITE_ARC_PREDICTION_ORACLE") ?? null;
}

export function isPredictionOracleConfigured(): boolean {
  return getOracleAddress() !== null;
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

export interface NativePrediction {
  id: string;
  question: string;
  citationUri: string;
  outcome: "YES" | "NO" | "UNRESOLVED";
  resolved: boolean;
  registeredAt: number;
  resolvedAt: number | null;
  admin: string;
}

export interface NativePredictionsResult {
  ok: boolean;
  reason?: string;
  predictions: NativePrediction[];
  oracleAddress?: string;
  fetchedAt: number;
}

let CACHED_YES: string | null = null;
let CACHED_NO: string | null = null;

export async function fetchNativePredictions(): Promise<NativePredictionsResult> {
  const addr = getOracleAddress();
  if (!addr) {
    return { ok: false, reason: "not_configured", predictions: [], fetchedAt: Date.now() };
  }
  try {
    const provider = getProvider();
    const oracle = new Contract(addr, ORACLE_ABI, provider);

    if (CACHED_YES === null || CACHED_NO === null) {
      const [yes, no] = await Promise.all([
        oracle.YES() as Promise<string>,
        oracle.NO() as Promise<string>,
      ]);
      CACHED_YES = yes.toLowerCase();
      CACHED_NO = no.toLowerCase();
    }

    const count = await oracle.getQuestionCount() as bigint;
    if (count === 0n) {
      return { ok: true, predictions: [], oracleAddress: addr, fetchedAt: Date.now() };
    }

    const ids: string[] = [];
    for (let i = 0n; i < count; i++) {
      const id = await oracle.getQuestionIdAt(i) as string;
      ids.push(id);
    }

    const results = await Promise.all(ids.map(async (id) => {
      const p = await oracle.getPrediction(id) as {
        question: string;
        citationUri: string;
        outcome: string;
        registeredAt: bigint;
        resolvedAt: bigint;
        admin: string;
        resolved: boolean;
      };
      const outcomeHash = p.outcome.toLowerCase();
      const outcome: NativePrediction["outcome"] =
        !p.resolved ? "UNRESOLVED"
        : outcomeHash === CACHED_YES ? "YES"
        : outcomeHash === CACHED_NO ? "NO"
        : "UNRESOLVED";
      return {
        id,
        question: p.question,
        citationUri: p.citationUri,
        outcome,
        resolved: p.resolved,
        registeredAt: Number(p.registeredAt) * 1000,
        resolvedAt: p.resolved ? Number(p.resolvedAt) * 1000 : null,
        admin: p.admin,
      } satisfies NativePrediction;
    }));

    results.sort((a, b) => b.registeredAt - a.registeredAt);
    return { ok: true, predictions: results, oracleAddress: addr, fetchedAt: Date.now() };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message.slice(0, 120) : "fetch_failed",
      predictions: [], fetchedAt: Date.now(),
    };
  }
}

export const PREDICTION_ORACLE_IFACE = new Interface(ORACLE_ABI);
