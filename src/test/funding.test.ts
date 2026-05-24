import { beforeEach, describe, expect, it } from "vitest";

import * as arbitrum from "../workspaces/arbitrum/funding";
import * as mantle from "../workspaces/mantle/funding";
import * as polygon from "../workspaces/polygon/funding";
import * as og from "../workspaces/0g/funding";
import * as agora from "../workspaces/agora/funding";
import * as qie from "../workspaces/qie/funding";
import * as sui from "../workspaces/sui/funding";

/**
 * Each workspace owns a private, self-contained copy of the funding engine
 * (src/workspaces/<ws>/funding.ts). There is no shared funding module, so this
 * suite exercises all seven engines independently and asserts they stay isolated.
 */

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

function freshStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
}

/** Minimal structural shape shared by every per-workspace funding module. */
type FundingModule = {
  checkFunding: (scope: unknown, amount: number, ctx: unknown) => { ok: boolean; reason?: string; requiresSignature?: boolean };
  fundTreasury: (scope: unknown, amount: number, sig?: string) => unknown;
  getTreasuryState: (scope: unknown) => { availableUsd: number };
  recordFundingSpend: (scope: unknown, amount: number, ctx: unknown) => { ok: boolean; reason?: string };
  settleFundedCall: (scope: unknown, amount: number, ctx: unknown) => {
    preflight: { ok: boolean };
    spend?: { ok: boolean };
    receipt?: { fallback?: boolean; fundingMode?: string };
  };
  fundingReceiptPayload: (scope: unknown, amount: number, ctx: unknown) => { fundingMode: string; fallback?: boolean };
};

const WORKSPACES: { name: string; mod: FundingModule; scope: unknown; serviceId: string }[] = [
  { name: "arbitrum", mod: arbitrum, scope: arbitrum.ARB_FUNDING_SCOPE, serviceId: "svc_arb_orbit" },
  { name: "mantle", mod: mantle, scope: mantle.MNT_FUNDING_SCOPE, serviceId: "svc_mnt_rwa" },
  { name: "polygon", mod: polygon, scope: polygon.POLY_FUNDING_SCOPE, serviceId: "svc_poly_merchant" },
  { name: "0g", mod: og, scope: og.OG_FUNDING_SCOPE, serviceId: "svc_0g_inference" },
  { name: "agora", mod: agora, scope: agora.ARC_AGENT_FUNDING_SCOPE, serviceId: "svc_arc_arb" },
  { name: "qie", mod: qie, scope: qie.QIE_FUNDING_SCOPE, serviceId: "svc_qie_dex" },
  { name: "sui", mod: sui, scope: sui.SUI_FUNDING_SCOPE, serviceId: "svc_sui_intent" },
];

describe.each(WORKSPACES)("$name workspace funding engine", ({ mod, scope, serviceId }) => {
  beforeEach(freshStorage);

  it("blocks an autonomous treasury action until the agent has signed funds", () => {
    const check = mod.checkFunding(scope, 0.07, { mode: "treasury", serviceId });
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("treasury_insufficient");
    expect(check.requiresSignature).toBe(true);
  });

  it("records a live treasury spend but never deducts a fallback receipt", () => {
    mod.fundTreasury(scope, 1, "0xsigned");
    expect(mod.getTreasuryState(scope).availableUsd).toBe(1);

    const fallback = mod.recordFundingSpend(scope, 0.07, { mode: "treasury", serviceId, settlement: "fallback" });
    expect(fallback.ok).toBe(false);
    expect(mod.getTreasuryState(scope).availableUsd).toBe(1);

    const live = mod.recordFundingSpend(scope, 0.07, { mode: "treasury", serviceId, settlement: "live" });
    expect(live.ok).toBe(true);
    expect(mod.getTreasuryState(scope).availableUsd).toBeCloseTo(0.93);
  });

  it("blocks a live treasury settle before spend when funds are missing", () => {
    const result = mod.settleFundedCall(scope, 0.04, { mode: "treasury", serviceId, settlement: "live" });
    expect(result.preflight.ok).toBe(false);
    expect(result.spend).toBeUndefined();
    expect(result.receipt).toBeUndefined();
  });

  it("tags a wallet-per-call receipt as a manual action", () => {
    const payload = mod.fundingReceiptPayload(scope, 5, { mode: "wallet_per_call", serviceId, settlement: "live" });
    expect(payload.fundingMode).toBe("wallet_per_call");
    expect(payload.fallback).toBeFalsy();
  });
});

describe("per-workspace funding isolation", () => {
  beforeEach(freshStorage);

  it("does not share a treasury balance across workspace modules", () => {
    arbitrum.fundTreasury(arbitrum.ARB_FUNDING_SCOPE, 1, "0xsigned");

    expect(arbitrum.getTreasuryState(arbitrum.ARB_FUNDING_SCOPE).availableUsd).toBe(1);
    expect(mantle.getTreasuryState(mantle.MNT_FUNDING_SCOPE).availableUsd).toBe(0);
    expect(og.getTreasuryState(og.OG_FUNDING_SCOPE).availableUsd).toBe(0);
    expect(polygon.getTreasuryState(polygon.POLY_FUNDING_SCOPE).availableUsd).toBe(0);
    expect(agora.getTreasuryState(agora.ARC_AGENT_FUNDING_SCOPE).availableUsd).toBe(0);
    expect(qie.getTreasuryState(qie.QIE_FUNDING_SCOPE).availableUsd).toBe(0);
    expect(sui.getTreasuryState(sui.SUI_FUNDING_SCOPE).availableUsd).toBe(0);
  });

  it("keeps a Mantle agent blocked even after the Arbitrum treasury is funded", () => {
    arbitrum.fundTreasury(arbitrum.ARB_FUNDING_SCOPE, 1, "0xsigned");

    const check = mantle.checkFunding(mantle.MNT_FUNDING_SCOPE, 0.02, { mode: "treasury", serviceId: "svc_mnt_rwa" });
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("treasury_insufficient");
  });
});
