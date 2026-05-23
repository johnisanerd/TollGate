/**
 * Circle CCTP (Cross-Chain Transfer Protocol) — Arc workspace shim.
 *
 * SCOPE OF THIS FILE
 * ------------------
 * Phase 4 of the Arc UX simplification plan introduces a "Mirror this Hyperliquid
 * trader on Arc" flow in the Discover tab. The complete flow needs:
 *
 *   1. Burn USDC on the source chain via Circle TokenMessenger
 *   2. Wait ~5-15 min for Circle's attestation service to sign the message
 *   3. Mint USDC on Arc via MessageTransmitter.receiveMessage(message, attestation)
 *   4. Open a CopyTradeEscrow position on Arc with metadata { mirroredTrader, sourceChain }
 *   5. Server-side watcher reads the Hyperliquid leader's positions every minute
 *      and emits matching ArcMindRegistry decisions
 *
 * Steps 1-3 require the @circle-fin/usdc-token-messenger-sdk (large dep with
 * a deprecated v1 still on npm) and the matching contract addresses on Arc L1
 * — which Circle has not yet listed as a supported CCTP domain.
 *
 * Until Arc is officially supported by CCTP this file emits an INTENT receipt
 * and surfaces an honest "coming soon — no funds moved" message to the user.
 * The function signatures match what the real implementation will need so the
 * UI surface and the receipt schema are forward-compatible.
 *
 * Supported domains (per CCTP v2):
 *   - Ethereum (domain 0)
 *   - Arbitrum (domain 3)
 *   - Base     (domain 6)
 *   - Polygon  (domain 7)
 *   - Optimism (domain 2)
 *
 * Reference: https://developers.circle.com/cctp
 */

import { hyperliquidVaultUrl, type VaultSummary } from "./hyperliquid";

export type CctpSupportedChain = "ethereum" | "arbitrum" | "base" | "polygon" | "optimism";

export interface MirrorIntent {
  intentId: string;
  targetVaultAddress: string;
  targetVaultName: string;
  sourceChain: CctpSupportedChain;
  amountUsd: number;
  slippageBps: number;
  estimatedLatencyMin: number;
  status: MirrorStatus;
  createdAt: string;
  updatedAt: string;
  txHashes: {
    burn?: string;
    attestation?: string;
    mint?: string;
    escrowStake?: string;
  };
  disclosures: string[];
}

export type MirrorStatus =
  | "intent_created"
  | "awaiting_arc_support"
  | "burning_source"
  | "awaiting_attestation"
  | "minting_arc"
  | "opening_escrow"
  | "active"
  | "failed";

export const CCTP_DOMAIN: Record<CctpSupportedChain, number> = {
  ethereum: 0,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
};

export const CCTP_USDC_ADDRESS: Record<CctpSupportedChain, string> = {
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  base:     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon:  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

export function createMirrorIntent(input: {
  vault: VaultSummary;
  sourceChain: CctpSupportedChain;
  amountUsd: number;
  slippageBps?: number;
}): MirrorIntent {
  const now = new Date().toISOString();
  const intentId = `mirror_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  const slippageBps = input.slippageBps ?? 100;
  return {
    intentId,
    targetVaultAddress: input.vault.vaultAddress,
    targetVaultName: input.vault.name,
    sourceChain: input.sourceChain,
    amountUsd: input.amountUsd,
    slippageBps,
    estimatedLatencyMin: 12,
    status: "awaiting_arc_support",
    createdAt: now,
    updatedAt: now,
    txHashes: {},
    disclosures: [
      "Arc L1 is not yet listed as an official CCTP domain. This intent is recorded locally — no USDC has been bridged.",
      "When Circle adds Arc L1 to CCTP, this intent can be replayed automatically with full provenance.",
      "Cross-chain latency is typically 5-15 minutes from burn to mint.",
      `Price drift between Hyperliquid (${input.vault.name}) and Arc may reach ${(slippageBps / 100).toFixed(2)}% during the bridge window.`,
      "ArcMind tracks the leader's on-chain positions via Hyperliquid Info API. Mirror accuracy depends on the leader's update frequency.",
      "You can revoke this intent at any time before it transitions to burning_source.",
    ],
  };
}

export function estimateMirrorFees(amountUsd: number): {
  cctpFeeUsd: number;
  arcGasUsd: number;
  performanceFeeBps: number;
  totalUsd: number;
} {
  const cctpFeeUsd = Math.max(0.01, amountUsd * 0.0005);
  const arcGasUsd = 0.05;
  const performanceFeeBps = 500;
  return {
    cctpFeeUsd: Number(cctpFeeUsd.toFixed(4)),
    arcGasUsd,
    performanceFeeBps,
    totalUsd: Number((cctpFeeUsd + arcGasUsd).toFixed(4)),
  };
}

export function preflightMirror(input: { vault: VaultSummary; amountUsd: number }): {
  canProceed: boolean;
  warnings: string[];
  blockers: string[];
} {
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (input.amountUsd < 1) blockers.push("Minimum mirror amount is $1 USDC.");
  if (input.amountUsd > 10_000) warnings.push("Large mirrors (> $10k) may suffer increased slippage during the bridge window.");
  if (input.vault.aum > 0 && input.amountUsd > input.vault.aum * 0.05) {
    warnings.push(`Your mirror is more than 5% of the vault's $${input.vault.aum.toLocaleString()} AUM — track-following accuracy may degrade.`);
  }
  blockers.push("Arc L1 is not yet an official Circle CCTP domain — intent will be queued, no funds will move until support lands.");
  return {
    canProceed: blockers.length === 1 && blockers[0].includes("queued"),
    warnings,
    blockers,
  };
}

export function vaultPublicUrl(vault: VaultSummary): string {
  return hyperliquidVaultUrl(vault.vaultAddress);
}
