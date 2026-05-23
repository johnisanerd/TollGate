import { describe, expect, it } from "vitest";
import {
  CCTP_DOMAIN,
  CCTP_USDC_ADDRESS,
  createMirrorIntent,
  estimateMirrorFees,
  preflightMirror,
  vaultPublicUrl,
} from "../lib/cctp";
import type { VaultSummary } from "../lib/hyperliquid";

function mockVault(overrides: Partial<VaultSummary> = {}): VaultSummary {
  return {
    name: "Test Vault",
    vaultAddress: "0x1111111111111111111111111111111111111111",
    leader: "0x2222222222222222222222222222222222222222",
    apr: 25,
    aum: 50_000,
    followers: 12,
    mdd: 8,
    ageDays: 90,
    raw: {},
    ...overrides,
  };
}

describe("cctp shim", () => {
  it("exports the correct CCTP v2 domain numbers", () => {
    expect(CCTP_DOMAIN.ethereum).toBe(0);
    expect(CCTP_DOMAIN.optimism).toBe(2);
    expect(CCTP_DOMAIN.arbitrum).toBe(3);
    expect(CCTP_DOMAIN.base).toBe(6);
    expect(CCTP_DOMAIN.polygon).toBe(7);
  });

  it("USDC contract addresses are valid hex", () => {
    for (const addr of Object.values(CCTP_USDC_ADDRESS)) {
      expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }
  });

  it("createMirrorIntent returns an awaiting_arc_support status with disclosures", () => {
    const intent = createMirrorIntent({
      vault: mockVault(),
      sourceChain: "arbitrum",
      amountUsd: 25,
    });
    expect(intent.status).toBe("awaiting_arc_support");
    expect(intent.amountUsd).toBe(25);
    expect(intent.sourceChain).toBe("arbitrum");
    expect(intent.slippageBps).toBe(100);
    expect(intent.disclosures.length).toBeGreaterThanOrEqual(4);
    expect(intent.intentId).toMatch(/^mirror_/);
    expect(intent.txHashes).toEqual({});
  });

  it("respects custom slippageBps", () => {
    const intent = createMirrorIntent({
      vault: mockVault(),
      sourceChain: "base",
      amountUsd: 100,
      slippageBps: 250,
    });
    expect(intent.slippageBps).toBe(250);
    expect(intent.disclosures.some((d) => d.includes("2.50%"))).toBe(true);
  });

  it("estimateMirrorFees scales with amount and clamps the minimum", () => {
    const small = estimateMirrorFees(0.5);
    expect(small.cctpFeeUsd).toBeGreaterThanOrEqual(0.01);
    const big = estimateMirrorFees(10_000);
    expect(big.cctpFeeUsd).toBeCloseTo(5, 1);
    expect(big.performanceFeeBps).toBe(500);
  });

  it("preflight blocks amounts below $1 and reports awaiting Arc CCTP support", () => {
    const tiny = preflightMirror({ vault: mockVault(), amountUsd: 0.5 });
    expect(tiny.blockers).toContain("Minimum mirror amount is $1 USDC.");
    expect(tiny.canProceed).toBe(false);

    const ok = preflightMirror({ vault: mockVault({ aum: 1_000_000 }), amountUsd: 10 });
    expect(ok.blockers.length).toBe(1);
    expect(ok.blockers[0]).toMatch(/Arc L1 is not yet/);
    expect(ok.canProceed).toBe(true);
  });

  it("preflight warns when mirror exceeds 5% of vault AUM", () => {
    const heavy = preflightMirror({ vault: mockVault({ aum: 100 }), amountUsd: 50 });
    expect(heavy.warnings.some((w) => w.includes("more than 5%"))).toBe(true);
  });

  it("vaultPublicUrl builds the Hyperliquid web URL", () => {
    const url = vaultPublicUrl(mockVault({ vaultAddress: "0xabc" }));
    expect(url).toBe("https://app.hyperliquid.xyz/vaults/0xabc");
  });
});
