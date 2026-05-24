import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startArcAgentScheduler, __testingPolyIntent } from "./arc-agent-loop.js";

const { computeKellyBet } = __testingPolyIntent;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("computeKellyBet", () => {
  it("returns zero stake when edge is below 5%", () => {
    const { stakeUsdc, kellyFrac } = computeKellyBet(0.50, 0.53, 20);
    assert.equal(stakeUsdc, 0);
    assert.equal(kellyFrac, 0);
  });

  it("returns positive stake when edge exceeds 5% threshold", () => {
    const { stakeUsdc, betYes } = computeKellyBet(0.40, 0.50, 20);
    assert.ok(stakeUsdc > 0, "stake should be positive with 10pp edge");
    assert.ok(stakeUsdc <= 5, "stake must never exceed MAX_BET $5");
    assert.equal(betYes, true);
  });

  it("caps stake at $5 regardless of large bankroll or edge", () => {
    const { stakeUsdc } = computeKellyBet(0.10, 0.95, 10_000);
    assert.ok(stakeUsdc <= 5, "hard cap must hold");
  });

  it("bets NO when fairProb < marketPrice", () => {
    const { betYes, stakeUsdc } = computeKellyBet(0.70, 0.60, 20);
    assert.equal(betYes, false);
    assert.ok(stakeUsdc > 0, "negative edge on YES → positive stake on NO");
  });

  it("returns 0 stake when bankroll is 0", () => {
    const { stakeUsdc } = computeKellyBet(0.40, 0.55, 0);
    assert.equal(stakeUsdc, 0);
  });
});

describe("Arc agent scheduler", () => {
  it("runs immediately and continues on its interval", async () => {
    let runs = 0;
    const stop = startArcAgentScheduler({
      intervalMs: 20,
      run: async () => {
        runs += 1;
      },
    });

    await sleep(55);
    stop();

    assert.ok(runs >= 2);
  });
});
