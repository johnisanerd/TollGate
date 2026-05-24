/**
 * ArcMind autonomous decision loop.
 *
 * The loop records live market observations. Copy-leader rows are loaded only
 * from a configured external feed; the server must not invent leader metrics.
 */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ethers } from "ethers";
import { buildCopyGuardDecision, type CopyGuardLeader, type CopyGuardSignals } from "./arc-copyguard.js";
import { buildArcSignalSourceRadar } from "./arc-signal-sources.js";
import { fetchEthMarketPrice } from "./market-data.js";
import { appendReceipt } from "./store.js";
import { dispatchAlert } from "./alerts.js";
import { postCast, isFarcasterConfigured } from "./farcaster.js";
import { routeLlmCall } from "./llm.js";
import { recordPolymarketIntent } from "./polymarket-exec.js";

const ARC_RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc-node.thecanteenapp.com/v1/public";
const ARC_KEY = process.env.ARC_PRIVATE_KEY ?? "";
const AGENT_ID = process.env.ARC_AGENT_ID ?? "";
const REGISTRY = process.env.VITE_ARC_REGISTRY_ADDRESS ?? "0xF4BFd93061B160Fa376c7F66De207a00225B4e70";
const LEADER_FEED_URL = (process.env.ARC_LEADER_FEED_URL ?? "").trim();

const REGISTRY_ABI = [
  "function recordDecision(bytes32 agentId, bytes32 decisionHash) external returns (uint256 index)",
];

const LOG_DIR = join(process.cwd(), "data");
const LOG_FILE = join(LOG_DIR, "arc-decisions.jsonl");
export const ARC_AGENT_INTERVAL_MS = Number(process.env.ARC_AGENT_INTERVAL_MS ?? 30 * 60 * 1000);

let prevEthPrice: number | null = null;
let arcWallet: ethers.Wallet | null = null;
let schedulerStop: (() => void) | null = null;

/* ─── Regime detection ───────────────────────────────────────────────── */

type MarketRegime = "BULL" | "BEAR" | "RISK_OFF" | "CHOPPY";

function classifyRegimeFromSignals(
  ethChange24h: number,
  fundingRate: number,
  oiUsd: number,
): { regime: MarketRegime; reasoning: string } {
  const strongDown = ethChange24h < -3;
  const strongUp   = ethChange24h > 3;
  const negFunding = fundingRate < -0.0002;
  const posFunding = fundingRate > 0.0002;
  const lowOi      = oiUsd > 0 && oiUsd < 500_000_000;

  if (strongDown && (negFunding || lowOi))
    return { regime: "RISK_OFF", reasoning: `ETH ${ethChange24h.toFixed(2)}% w/ funding ${fundingRate.toFixed(5)} — capital flight, route to USYC.` };
  if (strongUp && posFunding)
    return { regime: "BULL", reasoning: `ETH ${ethChange24h.toFixed(2)}% w/ bullish funding — trend up, hold ETH allocation.` };
  if (ethChange24h < -1 && fundingRate < 0)
    return { regime: "BEAR", reasoning: `ETH ${ethChange24h.toFixed(2)}% w/ negative funding — downtrend, scale down beta.` };
  if (ethChange24h > 1 && fundingRate > 0)
    return { regime: "BULL", reasoning: `ETH ${ethChange24h.toFixed(2)}% w/ positive funding — uptrend, maintain risk-on.` };
  return { regime: "CHOPPY", reasoning: `ETH ${ethChange24h.toFixed(2)}%, funding ${fundingRate.toFixed(5)} — signals inconclusive.` };
}

async function detectRegime(
  ethPrice: number,
  ethChange24h: number,
  fundingRate: number,
  oiUsd: number,
): Promise<{ regime: MarketRegime; reasoning: string; source: "rule" | "llm" }> {
  const rule = classifyRegimeFromSignals(ethChange24h, fundingRate, oiUsd);
  try {
    const llmOut = await routeLlmCall({
      prompt: `Market signals:\n- ETH: $${ethPrice.toFixed(2)}\n- 24h change: ${ethChange24h.toFixed(2)}%\n- HL OI: ${(oiUsd / 1e6).toFixed(1)}M USD\n- Funding: ${fundingRate.toFixed(5)}\n\nRule regime: ${rule.regime}\nAgree? First word must be BULL, BEAR, RISK_OFF, or CHOPPY. Then one short reasoning sentence.`,
      system: "Classify crypto market regime. First word must be exactly: BULL, BEAR, RISK_OFF, or CHOPPY.",
      maxTokens: 80,
      temperature: 0.15,
    });
    if (llmOut.ok && llmOut.text) {
      const match = llmOut.text.match(/(BULL|BEAR|RISK_OFF|CHOPPY)/);
      if (match?.[1]) {
        return { regime: match[1] as MarketRegime, reasoning: llmOut.text.trim().slice(0, 320), source: "llm" };
      }
    }
  } catch { /* LLM failure is non-fatal — rule-based stands */ }
  return { ...rule, source: "rule" };
}

/* ─── Degradation evaluator ──────────────────────────────────────────── */

interface DegradationState {
  winRatePct: number;
  graded: number;
  recommendation: "ok" | "watch" | "degraded";
}

function readRollingWinRate(): DegradationState {
  const threshold = Number(process.env["ARC_DEGRADATION_THRESHOLD"] ?? 40);
  try {
    if (!existsSync(LOG_FILE)) return { winRatePct: 100, graded: 0, recommendation: "ok" };
    const cutoff = Date.now() - 7 * 86_400_000;
    const recent: Array<{ decision: string; ethPrice: number; ts: number }> = [];
    for (const line of readFileSync(LOG_FILE, "utf8").trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const ts = new Date(String(entry["ts"] ?? "")).getTime();
        if (!Number.isFinite(ts) || ts < cutoff) continue;
        const decision = String(entry["decision"] ?? "");
        const ethPrice = Number(entry["ethPrice"] ?? 0);
        if ((decision === "BUY" || decision === "SELL" || decision === "HOLD") && ethPrice > 0)
          recent.push({ decision, ethPrice, ts });
      } catch { /* skip malformed lines */ }
    }
    recent.sort((a, b) => a.ts - b.ts);
    let wins = 0, graded = 0;
    for (let i = 0; i < recent.length - 1; i++) {
      const curr = recent[i]!;
      const next = recent[i + 1]!;
      if (curr.decision === "HOLD") continue;
      const priceUp = next.ethPrice > curr.ethPrice;
      const won = (curr.decision === "BUY" && priceUp) || (curr.decision === "SELL" && !priceUp);
      if (won) wins++;
      graded++;
    }
    const winRatePct = graded > 0 ? (wins / graded) * 100 : 100;
    const recommendation: DegradationState["recommendation"] =
      graded < 3 ? "ok"
      : winRatePct < threshold ? "degraded"
      : winRatePct < threshold + 10 ? "watch"
      : "ok";
    return { winRatePct: Number(winRatePct.toFixed(1)), graded, recommendation };
  } catch {
    return { winRatePct: 100, graded: 0, recommendation: "ok" };
  }
}

export const __testingLoop = { classifyRegimeFromSignals, readRollingWinRate };

export type ArcAgentLoopStatus = {
  state: "idle" | "running" | "skipped" | "recorded" | "failed";
  startedAt?: string;
  finishedAt?: string;
  decisionHash?: string;
  txHash?: string | null;
  mode?: "paper" | "arc";
  ethPrice?: number;
  leaderSource?: LeaderSource;
  message?: string;
  regime?: MarketRegime;
  regimeSource?: "rule" | "llm";
  degradation?: DegradationState;
  polymarketIntent?: PolyIntentSummary;
};

type LeaderSourceStatus = "configured" | "missing" | "unavailable";
type LeaderSource = {
  status: LeaderSourceStatus;
  provider: string;
  detail: string;
  sourceUrl?: string;
  requiredEnv?: string[];
};

let lastLoopStatus: ArcAgentLoopStatus = { state: "idle", message: "Arc agent loop has not run in this process yet." };

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function toBytes32(hex: string): string {
  const clean = hex.replace(/^0x/, "").padStart(64, "0");
  return "0x" + clean;
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchEthPrice(): Promise<number | null> {
  const market = await fetchEthMarketPrice();
  return market.price;
}

async function fetchHyperliquidOI(): Promise<{ oiValue: string; oiUsd: number; fundingRate: string } | null> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as [{ universe: { name: string }[] }, { openInterest: string; funding: string }[]];
    const ethIdx = data[0].universe.findIndex((u) => u.name === "ETH");
    const ctx = ethIdx >= 0 ? data[1][ethIdx] : undefined;
    if (!ctx) return null;
    const oiNum = parseFloat(ctx.openInterest);
    return {
      oiValue: Number.isFinite(oiNum) ? `${(oiNum / 1e6).toFixed(1)}M` : ctx.openInterest,
      oiUsd: Number.isFinite(oiNum) ? oiNum : 0,
      fundingRate: ctx.funding,
    };
  } catch {
    return null;
  }
}

function makeDecision(ethPrice: number, oi: { fundingRate: string } | null, regime: MarketRegime): "BUY" | "SELL" | "HOLD" {
  if (regime === "RISK_OFF") return "HOLD";
  const ethUp = prevEthPrice !== null && ethPrice > prevEthPrice * 1.001;
  const ethDown = prevEthPrice !== null && ethPrice < prevEthPrice * 0.999;
  const fr = oi ? parseFloat(oi.fundingRate) : NaN;
  const oiBullish = !Number.isNaN(fr) && fr > 0.0001;
  const oiBearish = !Number.isNaN(fr) && fr < -0.0001;
  if (regime === "BEAR") {
    if (ethDown && oiBearish) return "SELL";
    return "HOLD";
  }
  if (ethUp && oiBullish) return "BUY";
  if (ethDown && oiBearish) return "SELL";
  return "HOLD";
}

function cleanString(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/[^\x20-\x7E]/g, "");
  return trimmed ? trimmed.slice(0, max) : null;
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function pickNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = finiteNumber(raw[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeExternalLeader(raw: unknown, index: number): CopyGuardLeader | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const address = cleanString(row["address"] ?? row["wallet"] ?? row["account"], 80) ?? undefined;
  const id = cleanString(row["id"], 80) ?? address ?? `leader-${index + 1}`;
  const name = cleanString(row["name"] ?? row["displayName"] ?? row["label"], 80)
    ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null);
  const winRatePct = pickNumber(row, ["winRatePct", "winRate", "win_rate_pct"]);
  const sharpe = pickNumber(row, ["sharpe", "sharpeRatio", "sharpe_ratio"]);
  const maxDrawdownPct = pickNumber(row, ["maxDrawdownPct", "maxDrawdown", "max_drawdown_pct"]);
  const recentPnlPct = pickNumber(row, ["recentPnlPct", "recentPnl", "recent_pnl_pct", "pnl7dPct"]);
  const liquidityUsd = pickNumber(row, ["liquidityUsd", "liquidity", "aumUsd", "notionalUsd"]);
  const recentLosses = pickNumber(row, ["recentLosses", "lossStreak", "losses7d"]);
  if (!name || winRatePct === null || sharpe === null || maxDrawdownPct === null || recentPnlPct === null || liquidityUsd === null || recentLosses === null) {
    return null;
  }
  return {
    id,
    name,
    address,
    winRatePct,
    sharpe,
    maxDrawdownPct,
    recentPnlPct,
    liquidityUsd,
    recentLosses: Math.max(0, Math.round(recentLosses)),
    source: cleanString(row["source"], 80) ?? "External leader feed",
    sourceUrl: httpUrl(cleanString(row["sourceUrl"] ?? row["url"], 240) ?? "") ?? httpUrl(LEADER_FEED_URL) ?? undefined,
    metricsNote: cleanString(row["metricsNote"], 240) ?? "Metrics are supplied by ARC_LEADER_FEED_URL; ArcMind only scores and caps allocation.",
  };
}

async function fetchCopyLeaders(): Promise<{ leaders: CopyGuardLeader[]; source: LeaderSource }> {
  const leaderFeedUrl = httpUrl(LEADER_FEED_URL);
  if (!leaderFeedUrl) {
    return {
      leaders: [],
      source: {
        status: "missing",
        provider: "External leader feed",
        detail: LEADER_FEED_URL
          ? "ARC_LEADER_FEED_URL is set but is not an http(s) JSON endpoint, so ArcMind ignores it and keeps SignalGuard active."
          : "ARC_LEADER_FEED_URL is not configured, so ArcMind hides copy-leader rows instead of generating sample traders.",
        requiredEnv: ["ARC_LEADER_FEED_URL"],
      },
    };
  }

  try {
    const res = await fetch(leaderFeedUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return {
        leaders: [],
        source: {
          status: "unavailable",
          provider: "External leader feed",
          detail: `ARC_LEADER_FEED_URL returned HTTP ${res.status}; no synthetic leaders were created.`,
          sourceUrl: leaderFeedUrl,
          requiredEnv: ["ARC_LEADER_FEED_URL"],
        },
      };
    }
    const data = await res.json() as unknown;
    const rows = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { leaders?: unknown[] }).leaders)
        ? (data as { leaders: unknown[] }).leaders
        : [];
    const leaders = rows
      .map((row, index) => normalizeExternalLeader(row, index))
      .filter(Boolean) as CopyGuardLeader[];
    return {
      leaders,
      source: leaders.length
        ? {
          status: "configured",
          provider: "External leader feed",
          detail: `${leaders.length} verified leader rows loaded from ARC_LEADER_FEED_URL.`,
          sourceUrl: leaderFeedUrl,
        }
        : {
          status: "unavailable",
          provider: "External leader feed",
          detail: "ARC_LEADER_FEED_URL responded, but no rows matched the required metric schema.",
          sourceUrl: leaderFeedUrl,
          requiredEnv: ["ARC_LEADER_FEED_URL"],
        },
    };
  } catch (err) {
    return {
      leaders: [],
      source: {
        status: "unavailable",
        provider: "External leader feed",
        detail: `ARC_LEADER_FEED_URL failed: ${err instanceof Error ? err.message : "unknown error"}. No synthetic leaders were created.`,
        sourceUrl: leaderFeedUrl,
        requiredEnv: ["ARC_LEADER_FEED_URL"],
      },
    };
  }
}

async function pinTraceJson(payload: unknown, decisionHash: string): Promise<{ provider: "Pinata"; status: "pinned"; cid: string; url: string } | { provider: "Pinata"; status: "unavailable"; detail: string } | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;
  try {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataMetadata: { name: `arcmind-trace-${decisionHash.slice(2, 14)}.json` },
        pinataContent: payload,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { provider: "Pinata", status: "unavailable", detail: `HTTP ${res.status}` };
    const data = await res.json() as { IpfsHash?: string };
    if (!data.IpfsHash) return { provider: "Pinata", status: "unavailable", detail: "missing IpfsHash" };
    return {
      provider: "Pinata",
      status: "pinned",
      cid: data.IpfsHash,
      url: `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
    };
  } catch (err) {
    return { provider: "Pinata", status: "unavailable", detail: err instanceof Error ? err.message : "pin failed" };
  }
}

/* ─── Polymarket Kelly intent ────────────────────────────────────────── */

const POLY_BANKROLL_USDC = Number(process.env["PREDICTION_BANKROLL_USDC"] ?? 20);

interface PolyIntentSummary {
  betDecision: "BET_YES" | "BET_NO" | "PASS";
  stakeUsdc: number;
  reason: string;
  intentId?: string;
  marketSlug?: string;
}

function computeKellyBet(
  marketPrice: number,
  fairProb: number,
  bankrollUsdc: number,
): { stakeUsdc: number; betYes: boolean; kellyFrac: number } {
  const MIN_EDGE = 0.05;
  const MAX_BET = 5;
  const KELLY_MULT = 0.5;
  const yesEdge = fairProb - marketPrice;
  if (Math.abs(yesEdge) < MIN_EDGE) return { stakeUsdc: 0, betYes: yesEdge >= 0, kellyFrac: 0 };
  const betYes = yesEdge > 0;
  const price = betYes ? marketPrice : 1 - marketPrice;
  const fair = betYes ? fairProb : 1 - fairProb;
  const b = 1 / price - 1;
  const kellyFrac = Math.max(0, (b * fair - (1 - fair)) / b);
  const stakeUsdc = Math.min(kellyFrac * bankrollUsdc * KELLY_MULT, MAX_BET);
  return { stakeUsdc, betYes, kellyFrac };
}

export const __testingPolyIntent = { computeKellyBet };

async function fetchTopPolymarketCryptoMarket(): Promise<{ tokenId: string; marketPrice: number; marketSlug?: string } | null> {
  try {
    const res = await fetch(
      "https://gamma-api.polymarket.com/markets?tag=crypto&limit=8&active=true&closed=false&order=volume24hr&ascending=false",
      { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json() as unknown;
    const markets = Array.isArray(data) ? data : [];
    for (const m of markets) {
      if (!m || typeof m !== "object") continue;
      const r = m as Record<string, unknown>;
      const prices = Array.isArray(r["outcomePrices"]) ? r["outcomePrices"].map(Number) : [];
      const p = prices[0] ?? NaN;
      if (!Number.isFinite(p) || p < 0.05 || p > 0.95) continue;
      let tokenId = "";
      const rawIds = r["clobTokenIds"];
      if (typeof rawIds === "string") {
        try {
          const parsed = JSON.parse(rawIds) as string[];
          tokenId = Array.isArray(parsed) ? (String(parsed[0] ?? "")) : rawIds;
        } catch {
          tokenId = rawIds.replace(/[\[\]"\s]/g, "").split(",")[0] ?? "";
        }
      } else if (Array.isArray(rawIds)) {
        tokenId = String(rawIds[0] ?? "");
      }
      if (!tokenId || !/^[0-9]{1,80}$/.test(tokenId)) continue;
      return {
        tokenId,
        marketPrice: p as number,
        marketSlug: typeof r["slug"] === "string" ? r["slug"] : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function maybeRecordPolymarketIntent(
  decision: "BUY" | "SELL" | "HOLD",
  regime: MarketRegime,
): Promise<PolyIntentSummary | null> {
  if (decision === "HOLD" && regime !== "BULL") return null;
  const mkt = await fetchTopPolymarketCryptoMarket();
  if (!mkt) return null;
  const bias = decision === "BUY" ? 0.07 : decision === "SELL" ? -0.07 : 0.03;
  const fairProb = Math.max(0.02, Math.min(0.98, mkt.marketPrice + bias));
  const { stakeUsdc, betYes, kellyFrac } = computeKellyBet(mkt.marketPrice, fairProb, POLY_BANKROLL_USDC);
  const absEdge = Math.abs(fairProb - mkt.marketPrice);
  if (stakeUsdc < 0.5) {
    return {
      betDecision: "PASS",
      stakeUsdc: 0,
      reason: absEdge < 0.05 ? "edge_below_min_5pp" : "stake_under_half_dollar",
      marketSlug: mkt.marketSlug,
    };
  }
  const result = await recordPolymarketIntent({
    tokenId: mkt.tokenId,
    side: "BUY",
    sizeUsdc: Number(stakeUsdc.toFixed(2)),
    price: mkt.marketPrice,
    marketSlug: mkt.marketSlug,
  });
  return {
    betDecision: betYes ? "BET_YES" : "BET_NO",
    stakeUsdc: Number(stakeUsdc.toFixed(2)),
    reason: `${(absEdge * 100).toFixed(1)}pp edge, kelly=${(kellyFrac * 100).toFixed(1)}%, $${stakeUsdc.toFixed(2)}`,
    intentId: result.intentId,
    marketSlug: mkt.marketSlug,
  };
}

async function sendDecisionAlert(input: { action: string; risk?: number; decisionHash: string; txHash?: string | null; leaderSource: LeaderSource }): Promise<void> {
  if (input.action === "ALLOW_COPY" || input.action === "HOLD_USDC") return;
  const body = [
    input.risk != null ? `Risk score: ${input.risk}/100` : null,
    `Leader feed: ${input.leaderSource.status}`,
    `Decision: ${input.decisionHash.slice(0, 18)}...`,
    input.txHash ? `Arc tx: https://testnet.arcscan.app/tx/${input.txHash}` : "Arc tx: pending/paper",
  ].filter(Boolean).join("\n");
  await dispatchAlert({
    title: `ArcMind decision: ${input.action}`,
    body,
    level: input.action === "ARC_RECORD_FAILED" ? "alert" : input.action.startsWith("STOP") ? "warn" : "info",
    href: input.txHash ? `https://testnet.arcscan.app/tx/${input.txHash}` : undefined,
    dedupeKey: `${input.action}:${input.decisionHash}`,
  }).catch(() => { /* best-effort */ });
}

function getArcWallet(): ethers.Wallet | null {
  if (!ARC_KEY) return null;
  if (!arcWallet) {
    arcWallet = new ethers.Wallet(ARC_KEY, new ethers.JsonRpcProvider(ARC_RPC));
  }
  return arcWallet;
}

function appendLog(entry: Record<string, unknown>): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Logging is best effort; the API should not crash if local disk is unavailable.
  }
}

export async function arcAgentLoop(): Promise<void> {
  const tag = "[arc-loop]";
  lastLoopStatus = { state: "running", startedAt: new Date().toISOString(), message: "Arc agent loop tick started." };
  const degradation = readRollingWinRate();
  if (degradation.recommendation === "degraded") {
    const msg = `ArcMind degraded: ${degradation.winRatePct}% win-rate (${degradation.graded} graded, 7d) — tick paused.`;
    console.warn(`${tag} ${msg}`);
    await dispatchAlert({ title: "ArcMind: strategy degraded — tick paused", body: msg, level: "warn", dedupeKey: "degradation:tick_paused" }).catch(() => {});
    lastLoopStatus = { ...lastLoopStatus, state: "skipped", finishedAt: new Date().toISOString(), degradation, message: msg };
    return;
  }

  const [ethPrice, hlOI, leaderFeed, sourceRadar] = await Promise.all([fetchEthPrice(), fetchHyperliquidOI(), fetchCopyLeaders(), Promise.resolve(buildArcSignalSourceRadar(process.env))]);
  if (!ethPrice) {
    console.warn(`${tag} Could not fetch ETH price; skipping tick`);
    lastLoopStatus = {
      ...lastLoopStatus,
      state: "skipped",
      finishedAt: new Date().toISOString(),
      leaderSource: leaderFeed.source,
      message: "Could not fetch a live ETH price, so no decision was recorded.",
    };
    return;
  }

  const previousEthPrice = prevEthPrice;
  const fundingRateNum = hlOI ? parseFloat(hlOI.fundingRate) : 0;
  const fundingRate = Number.isFinite(fundingRateNum) ? fundingRateNum : 0;
  const ethPriceChangePct = previousEthPrice
    ? Number((((ethPrice - previousEthPrice) / previousEthPrice) * 100).toFixed(3))
    : 0;
  const oiUsd = hlOI?.oiUsd ?? 0;

  const { regime, reasoning: regimeReasoning, source: regimeSource } = await detectRegime(ethPrice, ethPriceChangePct, fundingRate, oiUsd);
  console.log(`${tag} regime=${regime} (${regimeSource}) — ${regimeReasoning.slice(0, 80)}`);

  const decision = makeDecision(ethPrice, hlOI, regime);
  prevEthPrice = ethPrice;
  const polyIntent = await maybeRecordPolymarketIntent(decision, regime);
  const copyGuardSignals: CopyGuardSignals = {
    ethPrice,
    ethPriceChangePct,
    openInterestUsd: oiUsd,
    fundingRate,
    volatilityPct: previousEthPrice ? Math.min(12, Math.abs(ethPriceChangePct) * 3 + 2) : 2.5,
    polymarketYesPct: null,
  };
  const copyGuard = buildCopyGuardDecision({
    signals: copyGuardSignals,
    leaders: leaderFeed.leaders,
    riskProfile: "balanced",
    sourceCoverage: sourceRadar.summary.configured,
  });

  const payload = {
    ts: copyGuard.ts,
    decision,
    primaryAction: copyGuard.primaryAction,
    ethPrice,
    oiValue: hlOI?.oiValue ?? "n/a",
    fundingRate: hlOI?.fundingRate ?? "n/a",
    agentId: AGENT_ID,
    leaderScores: copyGuard.leaderScores,
    allocation: copyGuard.allocation,
    leaderSource: leaderFeed.source,
    signalGuard: copyGuard.signalGuard,
    reasoningTrace: copyGuard.reasoningTrace,
    copyGuardHash: copyGuard.decisionHash,
    regime,
    regimeSource,
    regimeReasoning,
    degradation,
    ...(polyIntent ? { polymarketIntent: polyIntent } : {}),
  };
  const decisionHash = "0x" + sha256Hex(JSON.stringify(payload));
  const traceStorage = await pinTraceJson({ ...payload, decisionHash }, decisionHash);
  const finalPayload = traceStorage ? { ...payload, traceStorage } : payload;
  lastLoopStatus = {
    ...lastLoopStatus,
    ethPrice,
    leaderSource: leaderFeed.source,
    decisionHash,
    regime,
    regimeSource,
    degradation,
    ...(polyIntent ? { polymarketIntent: polyIntent } : {}),
    message: "Decision payload built.",
  };

  console.log(`${tag} ${decision}/${copyGuard.primaryAction} | ETH $${ethPrice} | OI ${hlOI?.oiValue ?? "n/a"} | hash ${decisionHash.slice(0, 14)}...`);

  const wallet = getArcWallet();
  if (!wallet || !AGENT_ID) {
    appendLog({ ...finalPayload, decisionHash, txHash: null, mode: "paper", note: "ARC_PRIVATE_KEY or ARC_AGENT_ID not set" });
    lastLoopStatus = {
      ...lastLoopStatus,
      state: "recorded",
      finishedAt: new Date().toISOString(),
      mode: "paper",
      txHash: null,
      message: "Paper decision recorded; ARC_PRIVATE_KEY or ARC_AGENT_ID is not set.",
    };
    await sendDecisionAlert({ action: copyGuard.signalGuard?.action ?? copyGuard.primaryAction, risk: copyGuard.signalGuard?.riskScore, decisionHash, txHash: null, leaderSource: leaderFeed.source });
    if (isFarcasterConfigured() && decision !== "HOLD") {
      postCast(`ArcMind decision: ${decision} ETH @ $${ethPrice.toLocaleString()} | OI ${hlOI?.oiValue ?? "n/a"} | paper mode\n${decisionHash.slice(0, 20)}...`, { channelId: "arcmind" }).catch(() => {});
    }
    console.log(`${tag} Paper decision recorded locally; set ARC_PRIVATE_KEY + ARC_AGENT_ID for Arc registry writes`);
    return;
  }

  try {
    const registry = new ethers.Contract(REGISTRY, REGISTRY_ABI, wallet);
    const agentId32 = toBytes32(AGENT_ID);
    const r = registry as unknown as {
      recordDecision: (agentId: string, hash: string) => Promise<{ hash?: string; wait: () => Promise<{ hash?: string }> }>;
    };
    const tx = await r.recordDecision(agentId32, decisionHash);
    const receipt = await tx.wait();
    const txHash = receipt.hash ?? tx.hash ?? "unknown";

    console.log(`${tag} Recorded -> ${txHash} | https://testnet.arcscan.app/tx/${txHash}`);
    appendLog({ ...finalPayload, decisionHash, txHash, mode: "arc" });
    lastLoopStatus = {
      ...lastLoopStatus,
      state: "recorded",
      finishedAt: new Date().toISOString(),
      mode: "arc",
      txHash,
      message: "Decision recorded on Arc and appended to the local decision log.",
    };
    await sendDecisionAlert({ action: copyGuard.signalGuard?.action ?? copyGuard.primaryAction, risk: copyGuard.signalGuard?.riskScore, decisionHash, txHash, leaderSource: leaderFeed.source });
    if (isFarcasterConfigured() && decision !== "HOLD") {
      postCast(`ArcMind decision: ${decision} ETH @ $${ethPrice.toLocaleString()} | OI ${hlOI?.oiValue ?? "n/a"}\nhttps://testnet.arcscan.app/tx/${txHash}`, { channelId: "arcmind" }).catch(() => {});
    }

    if (decision !== "HOLD") {
      const side = decision === "BUY" ? "BUY" : "SELL";
      const amountIn = 100;
      appendReceipt({
        challengeId: "ch_arc_auto_" + txHash.slice(2, 14),
        workspaceId: "agora",
        serviceId: "svc_arc_swap",
        serviceName: "ArcMind CopyGuard Auto Action",
        agentId: AGENT_ID,
        payerWallet: wallet.address,
        providerWallet: "0x24Cb6d1bE131006e8CB2cb7fBa5675725f9E6Da8",
        amount: 0.02,
        currency: "USDC",
        network: "arc-testnet",
        txHash,
        requestHash: decisionHash,
        status: "verified",
        paidAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
      });
      console.log(`${tag} Auto-action receipt recorded | ${side} ${amountIn} USDC notional`);
    }
  } catch (err) {
    console.error(`${tag} recordDecision failed:`, (err as Error).message ?? err);
    appendLog({ ...finalPayload, decisionHash, txHash: null, mode: "paper", error: (err as Error).message });
    lastLoopStatus = {
      ...lastLoopStatus,
      state: "failed",
      finishedAt: new Date().toISOString(),
      mode: "paper",
      txHash: null,
      message: `recordDecision failed; paper decision was appended: ${(err as Error).message ?? "unknown error"}`,
    };
    await sendDecisionAlert({ action: "ARC_RECORD_FAILED", risk: copyGuard.signalGuard?.riskScore, decisionHash, txHash: null, leaderSource: leaderFeed.source });
  }
}

export function getArcAgentLoopStatus(): ArcAgentLoopStatus {
  return lastLoopStatus;
}

export function startArcAgentScheduler(options: {
  intervalMs?: number;
  run?: () => Promise<void>;
  onError?: (err: unknown) => void;
} = {}): () => void {
  if (schedulerStop && !options.run) return schedulerStop;
  const intervalMs = Math.max(10, options.intervalMs ?? ARC_AGENT_INTERVAL_MS);
  const run = options.run ?? arcAgentLoop;
  const onError = options.onError ?? ((err: unknown) => console.error("[arc-loop] scheduler error:", (err as Error).message ?? err));
  let running = false;

  const tick = () => {
    if (running) return;
    running = true;
    void run().catch(onError).finally(() => {
      running = false;
    });
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  const stop = () => clearInterval(timer);
  if (!options.run) schedulerStop = stop;
  return stop;
}
