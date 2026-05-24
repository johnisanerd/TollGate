import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildArcReadinessReport } from "./arc-readiness.js";

const address = "0x1111111111111111111111111111111111111111";

describe("Arc readiness report", () => {
  it("treats zero payout as missing and returns actionable fixes", () => {
    const report = buildArcReadinessReport({
      env: {
        NODE_ENV: "development",
        ARC_RPC_URL: "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public",
      },
      x402PayoutAddress: "0x0000000000000000000000000000000000000000",
      x402Network: "base-sepolia",
      decisions: [{ decisionHash: "0xabc" }],
      receipts: [],
      stats: { testers: 0, connectedWallets: 0, feedbackCount: 0 },
      agoraServiceCount: 3,
    });

    assert.equal(report.status, "needs_decisions");
    assert.ok(report.missing.includes("x402_payout"));
    assert.ok(report.missing.includes("x402_network_arc"));
    assert.ok(report.recommendedActions.some((action) => action.includes("X402_PAYOUT_ADDRESS")));
  });

  it("marks a product with core Arc config as paper-ready before signer secrets", () => {
    const report = buildArcReadinessReport({
      env: {
        NODE_ENV: "production",
        ARC_RPC_URL: "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public",
        VITE_ARC_REGISTRY_ADDRESS: address,
        VITE_ARC_ESCROW_ADDRESS: address,
      },
      x402PayoutAddress: address,
      x402Network: "arc-testnet",
      decisions: [{ decisionHash: "0xabc" }],
      receipts: [{ serviceId: "svc_arc_reasoning" }],
      stats: { testers: 2, connectedWallets: 1, feedbackCount: 1 },
      agoraServiceCount: 3,
    });

    assert.equal(report.status, "ready_paper");
    assert.ok(report.score >= 70);
    assert.ok(report.missing.includes("arc_private_key"));
    assert.ok(report.missing.includes("arc_agent_id"));
  });

  it("accepts deployed Arc contracts from the deployment artifact when env omits browser vars", () => {
    const report = buildArcReadinessReport({
      env: {
        NODE_ENV: "production",
        ARC_RPC_URL: "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public",
        ARC_PRIVATE_KEY: "configured-secret",
        ARC_AGENT_ID: "0x" + "a".repeat(64),
      },
      deployedContracts: {
        registry: address,
        escrow: address,
        controlLayer: {
          agentTreasury: address,
          strategyVault: address,
          riskGuard: address,
          receiptRegistry: address,
        },
      },
      x402PayoutAddress: address,
      x402Network: "arc-testnet",
      decisions: [{ decisionHash: "0xabc" }],
      receipts: [{ serviceId: "svc_arc_copytrade" }],
      stats: { testers: 3, connectedWallets: 2, feedbackCount: 2 },
      agoraServiceCount: 3,
    });

    assert.equal(report.status, "ready_onchain");
    assert.equal(report.score, 100);
    assert.deepEqual(report.missing, []);
    assert.equal(
      report.checks.find((check) => check.id === "arc_escrow_contract")?.detail,
      "from deployment artifact",
    );
  });

  it("marks a fully configured demo as onchain-ready", () => {
    const report = buildArcReadinessReport({
      env: {
        NODE_ENV: "production",
        ARC_RPC_URL: "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public",
        ARC_PRIVATE_KEY: "configured-secret",
        ARC_AGENT_ID: "0x" + "a".repeat(64),
        VITE_ARC_REGISTRY_ADDRESS: address,
        VITE_ARC_ESCROW_ADDRESS: address,
        VITE_ARC_AGENT_TREASURY_ADDRESS: address,
        VITE_ARC_STRATEGY_VAULT_ADDRESS: address,
        VITE_ARC_RISK_GUARD_ADDRESS: address,
        VITE_ARC_RECEIPT_REGISTRY_ADDRESS: address,
      },
      x402PayoutAddress: address,
      x402Network: "arc-testnet",
      decisions: [{ decisionHash: "0xabc" }],
      receipts: [{ serviceId: "svc_arc_copytrade" }],
      stats: { testers: 3, connectedWallets: 2, feedbackCount: 2 },
      agoraServiceCount: 3,
    });

    assert.equal(report.status, "ready_onchain");
    assert.equal(report.score, 100);
    assert.deepEqual(report.missing, []);
  });
});
