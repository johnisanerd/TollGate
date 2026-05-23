import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetHyperliquidCache,
  getLeaderboard,
  getVaultDetails,
  getVaultSummaries,
  hyperliquidVaultUrl,
} from "../lib/hyperliquid";

const ORIGINAL_FETCH = globalThis.fetch;

function mockResponseOnce(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;
}

describe("hyperliquid info client", () => {
  beforeEach(() => {
    _resetHyperliquidCache();
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("getVaultSummaries returns adapted vaults", async () => {
    mockResponseOnce([
      {
        name: "Sample Vault",
        vaultAddress: "0x1111111111111111111111111111111111111111",
        leader: "0x2222222222222222222222222222222222222222",
        apr: 0.42,
        tvl: "500000",
        followers: 23,
        mdd: 0.15,
        createTimeMillis: Date.now() - 10 * 86_400_000,
      },
      { name: "Skip me" }, // invalid — no vaultAddress
    ]);
    const vaults = await getVaultSummaries();
    expect(vaults).toHaveLength(1);
    expect(vaults[0].name).toBe("Sample Vault");
    expect(vaults[0].apr).toBeCloseTo(42, 0);
    expect(vaults[0].aum).toBe(500_000);
    expect(vaults[0].followers).toBe(23);
    expect(vaults[0].ageDays).toBeGreaterThanOrEqual(9);
  });

  it("getVaultSummaries returns empty array on HTTP error", async () => {
    globalThis.fetch = vi.fn(async () => new Response("err", { status: 500 })) as typeof fetch;
    const vaults = await getVaultSummaries();
    expect(vaults).toEqual([]);
  });

  it("getVaultDetails rejects malformed addresses", async () => {
    const res = await getVaultDetails("not-an-address");
    expect(res).toBeNull();
  });

  it("getVaultDetails extracts allTime portfolio series", async () => {
    mockResponseOnce({
      name: "Detail Vault",
      vaultAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      leader: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      description: "Test strategy",
      apr: 0.3,
      tvl: 100_000,
      followers: 5,
      profitShareBps: 1000,
      leaderFraction: 0.1,
      allowedAssets: ["ETH", "BTC"],
      portfolio: [
        ["day", { accountValueHistory: [], pnlHistory: [] }],
        [
          "allTime",
          {
            accountValueHistory: [[1_700_000_000_000, "100000"], [1_700_086_400_000, "105000"]],
            pnlHistory: [[1_700_000_000_000, "0"], [1_700_086_400_000, "5000"]],
          },
        ],
      ],
    });
    const details = await getVaultDetails("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(details).not.toBeNull();
    expect(details!.description).toBe("Test strategy");
    expect(details!.feeBps).toBe(1000);
    expect(details!.leaderStakeUsd).toBeCloseTo(10_000);
    expect(details!.tradedAssets).toEqual(["ETH", "BTC"]);
    expect(details!.portfolio).toHaveLength(2);
    expect(details!.portfolio[1].value).toBe(105_000);
    expect(details!.portfolio[1].pnl).toBe(5_000);
  });

  it("getLeaderboard adapts entries", async () => {
    mockResponseOnce({
      leaderboardRows: [
        { ethAddress: "0xabc0000000000000000000000000000000000000", accountValue: 250_000, pnl: 50_000, roi: 0.25, volume: 1_000_000 },
        { accountValue: 1 }, // skipped: no address
      ],
    });
    const top = await getLeaderboard();
    expect(top).toHaveLength(1);
    expect(top[0].accountValue).toBe(250_000);
    expect(top[0].roi).toBe(25);
  });

  it("hyperliquidVaultUrl builds correct URL", () => {
    expect(hyperliquidVaultUrl("0xdead")).toBe("https://app.hyperliquid.xyz/vaults/0xdead");
  });

  it("caches successive identical requests within TTL", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify([{ name: "X", vaultAddress: "0x" + "1".repeat(40), apr: 0.1, tvl: 10 }]), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;
    await getVaultSummaries();
    await getVaultSummaries();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
