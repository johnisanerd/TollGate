/**
 * Read-only client for MarketFactory + CopyTradeMarket.
 *
 * Lists all ArcMind-style markets deployed by the on-chain factory so the
 * frontend can render them in Discover. No fake data — if VITE_ARC_MARKET_FACTORY
 * is unset or the contract has zero markets, this returns [] and the UI
 * shows an empty state.
 */

import { Contract, Interface, JsonRpcProvider } from "ethers";

const FACTORY_ABI = [
  "function marketCount() view returns (uint256)",
  "function allMarkets(uint256) view returns (address)",
  "function getMarketsPaged(uint256 start, uint256 count) view returns (tuple(address market, address operator, address quoteToken, string baseSymbol, uint64 createdAt)[])",
  "function marketFor(address operator, string baseSymbol, address quoteToken) view returns (address)",
];

const MARKET_ABI = [
  "function operator() view returns (address)",
  "function quoteToken() view returns (address)",
  "function baseSymbol() view returns (string)",
  "function performanceFeeBps() view returns (uint16)",
  "function killThresholdBps() view returns (uint16)",
  "function minStake() view returns (uint256)",
  "function maxStake() view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "function totalSettled() view returns (uint256)",
  "function totalFeesPaid() view returns (uint256)",
  "function paused() view returns (bool)",
  "function getSettlementCount() view returns (uint256)",
];

const ARC_RPC_FALLBACK = "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public";

function env(key: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.trim() ? v.trim() : undefined;
}

export interface OnChainMarket {
  address: string;
  operator: string;
  quoteToken: string;
  baseSymbol: string;
  performanceFeeBps: number;
  killThresholdBps: number;
  minStake: bigint;
  maxStake: bigint;
  totalStaked: bigint;
  totalSettled: bigint;
  totalFeesPaid: bigint;
  paused: boolean;
  settlementCount: number;
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

function getFactoryAddress(): string | null {
  return env("VITE_ARC_MARKET_FACTORY") ?? null;
}

export function isMarketFactoryConfigured(): boolean {
  return getFactoryAddress() !== null;
}

export async function fetchAllMarkets(): Promise<OnChainMarket[]> {
  const addr = getFactoryAddress();
  if (!addr) return [];
  try {
    const provider = getProvider();
    const factory = new Contract(addr, FACTORY_ABI, provider);
    const count = await factory.marketCount() as bigint;
    if (count === 0n) return [];

    const PAGE = 50;
    const out: OnChainMarket[] = [];
    for (let start = 0n; start < count; start += BigInt(PAGE)) {
      const page = await factory.getMarketsPaged(start, PAGE) as Array<{
        market: string;
        operator: string;
        quoteToken: string;
        baseSymbol: string;
      }>;
      for (const entry of page) {
        const stats = await fetchMarketStats(entry.market, provider);
        out.push({
          address:    entry.market,
          operator:   entry.operator,
          quoteToken: entry.quoteToken,
          baseSymbol: entry.baseSymbol,
          ...stats,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchMarketStats(marketAddr: string, provider: JsonRpcProvider): Promise<{
  performanceFeeBps: number;
  killThresholdBps: number;
  minStake: bigint;
  maxStake: bigint;
  totalStaked: bigint;
  totalSettled: bigint;
  totalFeesPaid: bigint;
  paused: boolean;
  settlementCount: number;
}> {
  const c = new Contract(marketAddr, MARKET_ABI, provider);
  try {
    const [perfFee, killBps, minStake, maxStake, totalStaked, totalSettled, totalFees, paused, settlementCount] = await Promise.all([
      c.performanceFeeBps() as Promise<bigint>,
      c.killThresholdBps() as Promise<bigint>,
      c.minStake() as Promise<bigint>,
      c.maxStake() as Promise<bigint>,
      c.totalStaked() as Promise<bigint>,
      c.totalSettled() as Promise<bigint>,
      c.totalFeesPaid() as Promise<bigint>,
      c.paused() as Promise<boolean>,
      c.getSettlementCount() as Promise<bigint>,
    ]);
    return {
      performanceFeeBps: Number(perfFee),
      killThresholdBps:  Number(killBps),
      minStake,
      maxStake,
      totalStaked,
      totalSettled,
      totalFeesPaid:     totalFees,
      paused,
      settlementCount:   Number(settlementCount),
    };
  } catch {
    return {
      performanceFeeBps: 0,
      killThresholdBps:  0,
      minStake:          0n,
      maxStake:          0n,
      totalStaked:       0n,
      totalSettled:      0n,
      totalFeesPaid:     0n,
      paused:            false,
      settlementCount:   0,
    };
  }
}

export async function findMarket(operator: string, baseSymbol: string, quoteToken: string): Promise<string | null> {
  const addr = getFactoryAddress();
  if (!addr) return null;
  try {
    const provider = getProvider();
    const factory = new Contract(addr, FACTORY_ABI, provider);
    const market = await factory.marketFor(operator, baseSymbol, quoteToken) as string;
    return market === "0x0000000000000000000000000000000000000000" ? null : market;
  } catch {
    return null;
  }
}

export const ABI = {
  factory: FACTORY_ABI,
  market:  MARKET_ABI,
};

export function fmtUsdc(raw: bigint): string {
  if (raw === 0n) return "—";
  const whole = raw / 1_000_000n;
  const frac  = raw % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").slice(0, 2);
  return `$${whole.toString()}.${fracStr}`;
}

export const FACTORY_IFACE = new Interface(FACTORY_ABI);
export const MARKET_IFACE  = new Interface(MARKET_ABI);
