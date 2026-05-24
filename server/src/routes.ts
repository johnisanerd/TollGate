// REST surface for TollGate. Mirrors ТЗ §9 (agent-payments-x402-universal-tz-uk.md).
// Route layout & naming ported from kravadk/XSight- (server/src/routes/*, server/src/index.ts).
//
//   GET  /api/services            ?workspace=liquify
//   GET  /api/services/:id
//   GET  /api/agents              ?workspace=0g
//   GET  /api/agents/:id
//   GET  /api/v1/x402-spec        ?workspace=liquify
//   GET  /api/gateway/:serviceId  → 402 + challenge, or unlocked sample response
//   POST /api/gateway/:serviceId
//   GET  /api/receipts            ?workspace=&service=&agent=
//   GET  /api/receipts/:id
//   GET  /api/status/health
//   GET  /api/status/activity
//   GET  /api/status/x402-log

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getAddress, JsonRpcProvider, parseUnits } from "ethers";
import { timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { env, isProd } from "./env.js";
import { buildArcAlerts, buildArcAuditTrail, buildArcDecisionReplay, evaluateArcDecisionVerification } from "./arc-audit.js";
import {
  appendArcTractionEvent,
  buildArcTractionStats,
  makeArcTractionEvent,
  readArcTractionEvents,
} from "./arc-traction.js";
import { buildPortfolioSimulation, buildProtectedPortfolio } from "./arc-portfolio.js";
import { arcAgentLoop, getArcAgentLoopStatus } from "./arc-agent-loop.js";
import { fetchEthMarketPrice } from "./market-data.js";
import { buildArcReadinessReport } from "./arc-readiness.js";
import { buildArcSignalSourceRadar } from "./arc-signal-sources.js";
import {
  allowControlSource,
  approveLatestControlDecision,
  buildLatestControlDecision,
  cancelControlExecution,
  developerControlStatus,
  getArcControlState,
  mutateControlPosition,
  refreshControlSources,
  rejectLatestControlDecision,
  retryControlExecution,
  runControlAction,
  setControlActionAllowed,
  setRiskGuardMode,
  setControlStrategy,
  topUpAgentBudget,
  triggerRiskEmergencyExit,
  updateAgentPolicy,
  withdrawAgentBudget,
  type AgentAction,
  type ControlSource,
  type FundingMode,
} from "./arc-control.js";
import { uploadToOg } from "./og-upload.js";
import { runOgInference } from "./og-compute.js";
import { routeLlmCall, isLlmConfigured } from "./llm.js";
import { fetchAllTickers } from "./exchanges.js";
import { buildSnapshot, onArbSnapshot, startArbScanner } from "./arb-scanner.js";
import { getEthUsdPrice } from "./pyth.js";
import { dispatchAlert, isAlertsConfigured } from "./alerts.js";
import { getCircleStatus, createProgrammableWallet } from "./circle.js";
import { isPinataConfigured, pinJson } from "./pinata.js";
import { isFarcasterConfigured, postCast } from "./farcaster.js";
import { isApifyConfigured, fetchNews } from "./apify.js";
import { getPolymarketStatus, recordPolymarketIntent } from "./polymarket-exec.js";
import {
  agentById,
  agents,
  serviceById,
  services,
  servicesForWorkspace,
} from "./data.js";
import {
  activitySnapshot,
  appendReceipt,
  listReceipts,
  receiptById,
  receiptStats,
  onReceipt,
  onNftUpdate,
  updateReceiptNft,
  recordActivity,
  x402Log,
} from "./store.js";
import { withX402 } from "./x402.js";
import { mintReceiptNFT } from "./receipt-nft.js";
import { mantleRecordDecision, mantleRecordPayment, ogAnchorReceipt } from "./chain-signer.js";
import type { Service, WorkspaceId } from "./types.js";

const WORKSPACE_IDS: WorkspaceId[] = ["0g", "qie", "arbitrum", "mantle", "sui", "agora", "polygon"];
function asWorkspace(v: unknown): WorkspaceId | undefined {
  return WORKSPACE_IDS.includes(v as WorkspaceId) ? (v as WorkspaceId) : undefined;
}

function publicService(s: Service) {
  return {
    id: s.id,
    name: s.name,
    provider: s.provider,
    providerWallet: s.providerWallet,
    category: s.category,
    priceUsd: s.priceUsd,
    currency: s.currency,
    network: s.network,
    description: s.description,
    status: s.status,
    workspaceIds: s.workspaceIds,
    gatewayUrl: `/api/gateway/${s.id}`,
    sampleResponse: s.sampleResponse,
  };
}

export const apiRouter = Router();

function hasArcAdmin(req: Request): boolean {
  const expected = process.env.ARC_ADMIN_TOKEN;
  if (!expected) return false;
  const raw = req.header("X-Arc-Admin-Token") ?? req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!raw) return false;
  const a = Buffer.from(raw);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanArcAddress(v: unknown): string | null {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(v)) return null;
  try {
    return getAddress(v);
  } catch {
    return null;
  }
}

async function verifyArcNativePayment(input: {
  txHash: unknown;
  from: unknown;
  minAmountUsd: number;
}): Promise<{ ok: true; txHash: string } | { ok: false; reason: string }> {
  const txHash = typeof input.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(input.txHash) ? input.txHash : "";
  const from = cleanArcAddress(input.from);
  const to = cleanArcAddress(env.x402PayoutAddress);
  if (!txHash) return { ok: false, reason: "missing_valid_tx_hash" };
  if (!from) return { ok: false, reason: "missing_valid_wallet" };
  if (!to) return { ok: false, reason: "payout_address_not_configured" };
  if (!process.env.ARC_RPC_URL) return { ok: false, reason: "arc_rpc_not_configured" };

  const provider = new JsonRpcProvider(process.env.ARC_RPC_URL);
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(txHash),
    provider.getTransactionReceipt(txHash),
  ]);
  if (!tx || !receipt) return { ok: false, reason: "tx_not_found_or_pending" };
  if (receipt.status !== 1) return { ok: false, reason: "tx_failed" };
  if (getAddress(tx.from) !== from) return { ok: false, reason: "tx_from_mismatch" };
  if (!tx.to || getAddress(tx.to) !== to) return { ok: false, reason: "tx_to_mismatch" };

  const required = parseUnits(input.minAmountUsd.toFixed(6), 18);
  if (tx.value < required) return { ok: false, reason: "tx_amount_too_low" };
  return { ok: true, txHash };
}

// ─── 0G Storage upload (server-side, uses private key) ──────────────────────

const uploadLimiter = rateLimit({
  windowMs: 60_000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "rate_limit_exceeded", retryAfterSec: 60, scope: "/api/og/upload" },
});

apiRouter.post("/og/upload", uploadLimiter, async (req: Request, res: Response) => {
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  if (!content) return res.status(400).json({ error: "content required" });
  if (content.length > 51200) return res.status(413).json({ error: "content too large (max 50 KB)" });
  try {
    const result = await uploadToOg(content);
    recordActivity("og.upload", "0g");
    res.json({ ok: true, ...result });
  } catch {
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── 0G Compute inference (server-side, uses compute private key) ────────────

const ALLOWED_MODELS = ["risk-scorer-v2", "wallet-labeler", "anomaly-detect", "sentiment-v1", "market-signals"];

apiRouter.post("/og/compute", async (req: Request, res: Response) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  const model = typeof req.body?.model === "string" ? req.body.model : undefined;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  if (model && !ALLOWED_MODELS.includes(model)) return res.status(400).json({ error: "unknown model" });
  const result = await runOgInference(prompt, model);
  if (!result.ok && result.reason === "compute_not_configured") {
    return res.status(503).json({ ok: false, reason: "compute_not_configured" });
  }
  recordActivity("og.compute", "0g");
  if (!result.ok) return res.status(502).json({ ok: false, reason: "error", message: result.message });
  res.json(result);
});

// ─── LLM proxy (server-side; API keys never leave the server) ───────────────

const llmLimiter = rateLimit({
  windowMs: 60_000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "rate_limit_exceeded", retryAfterSec: 60, scope: "/api/llm" },
});

apiRouter.get("/llm/status", (_req: Request, res: Response) => {
  res.json({ configured: isLlmConfigured() });
});

// ─── Multi-exchange ticker proxy (OKX / Coinbase / Binance / Hyperliquid) ───

const exchangeLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "rate_limit_exceeded", retryAfterSec: 60, scope: "/api/exchanges" },
});

apiRouter.get("/exchanges/tickers", exchangeLimiter, async (req: Request, res: Response) => {
  const symbol = typeof req.query["symbol"] === "string" && /^[A-Z0-9]+\/[A-Z0-9]+$/.test(req.query["symbol"])
    ? req.query["symbol"]
    : "ETH/USDC";
  const tickers = await fetchAllTickers(symbol);
  res.json({ symbol, tickers, ts: Date.now() });
});

// ─── Arbitrage scanner — REST snapshot + SSE stream ─────────────────────────

apiRouter.get("/arb/snapshot", exchangeLimiter, async (req: Request, res: Response) => {
  const symbol = typeof req.query["symbol"] === "string" && /^[A-Z0-9]+\/[A-Z0-9]+$/.test(req.query["symbol"])
    ? req.query["symbol"]
    : "ETH/USDC";
  const snap = await buildSnapshot(symbol);
  res.json(snap);
});

// Boot the scanner so SSE clients get periodic snapshots without needing to poll.
startArbScanner();

// ─── Pyth Network ETH/USD oracle (free public Hermes endpoint) ──────────────

apiRouter.get("/pyth/eth", exchangeLimiter, async (_req: Request, res: Response) => {
  const price = await getEthUsdPrice();
  if (!price.ok) return res.status(502).json(price);
  res.json(price);
});

// ─── Alerts (Discord + Telegram) ─────────────────────────────────────────────

const alertLimiter = rateLimit({
  windowMs: 60_000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "rate_limit_exceeded", retryAfterSec: 60, scope: "/api/alerts" },
});

apiRouter.get("/alerts/status", (_req: Request, res: Response) => {
  res.json(isAlertsConfigured());
});

apiRouter.get("/circle/status", (_req: Request, res: Response) => {
  res.json(getCircleStatus());
});

apiRouter.post("/circle/wallets/create", alertLimiter, async (req: Request, res: Response) => {
  const rawName = typeof req.body?.name === "string" ? req.body.name : "";
  const name = rawName.trim().slice(0, 64);
  if (!name) {
    res.status(400).json({ ok: false, reason: "name_required" });
    return;
  }
  const result = await createProgrammableWallet(name);
  res.status(result.ok ? 200 : 400).json(result);
});

// ─── Pinata IPFS pinning ────────────────────────────────────────────────────

apiRouter.get("/pinata/status", (_req: Request, res: Response) => {
  res.json({ configured: isPinataConfigured() });
});

apiRouter.post("/pinata/pin", alertLimiter, async (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  const payload = req.body?.payload;
  if (payload === undefined) {
    res.status(400).json({ ok: false, reason: "payload_required" });
    return;
  }
  const result = await pinJson(name, payload);
  res.status(result.ok ? 200 : 400).json(result);
});

// ─── Farcaster (Neynar cast) ────────────────────────────────────────────────

apiRouter.get("/farcaster/status", (_req: Request, res: Response) => {
  res.json({ configured: isFarcasterConfigured() });
});

apiRouter.post("/farcaster/cast", alertLimiter, async (req: Request, res: Response) => {
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  const channelId = typeof req.body?.channelId === "string" ? req.body.channelId : undefined;
  const embedUrl = typeof req.body?.embedUrl === "string" ? req.body.embedUrl : undefined;
  const opts: { channelId?: string; embedUrl?: string } = {};
  if (channelId) opts.channelId = channelId;
  if (embedUrl) opts.embedUrl = embedUrl;
  const result = await postCast(text, opts);
  res.status(result.ok ? 200 : 400).json(result);
});

// ─── Apify news scraper ─────────────────────────────────────────────────────

apiRouter.get("/apify/status", (_req: Request, res: Response) => {
  res.json({ configured: isApifyConfigured() });
});

apiRouter.get("/apify/news", exchangeLimiter, async (req: Request, res: Response) => {
  const actorId = typeof req.query["actor"] === "string" ? req.query["actor"] : undefined;
  const limit = typeof req.query["limit"] === "string" ? parseInt(req.query["limit"], 10) : undefined;
  const opts: { actorId?: string; limit?: number } = {};
  if (actorId) opts.actorId = actorId;
  if (typeof limit === "number" && Number.isFinite(limit)) opts.limit = limit;
  const result = await fetchNews(opts);
  res.status(result.ok ? 200 : 400).json(result);
});

// ─── Polymarket execution scaffold (dry-run intent recorder) ────────────────

apiRouter.get("/polymarket/status", (_req: Request, res: Response) => {
  res.json(getPolymarketStatus());
});

apiRouter.post("/polymarket/intent", alertLimiter, async (req: Request, res: Response) => {
  const tokenId = typeof req.body?.tokenId === "string" ? req.body.tokenId : "";
  const side = req.body?.side === "BUY" || req.body?.side === "SELL" ? req.body.side : null;
  const sizeUsdc = typeof req.body?.sizeUsdc === "number" ? req.body.sizeUsdc : Number(req.body?.sizeUsdc);
  const price = typeof req.body?.price === "number" ? req.body.price : undefined;
  const marketSlug = typeof req.body?.marketSlug === "string" ? req.body.marketSlug : undefined;
  if (!side) {
    res.status(400).json({ ok: false, status: "rejected", reason: "invalid_side" });
    return;
  }
  const input: {
    tokenId: string;
    side: "BUY" | "SELL";
    sizeUsdc: number;
    price?: number;
    marketSlug?: string;
  } = { tokenId, side, sizeUsdc };
  if (price !== undefined) input.price = price;
  if (marketSlug) input.marketSlug = marketSlug;
  const result = await recordPolymarketIntent(input);
  res.status(result.ok ? 200 : 400).json(result);
});

// Server-side Gamma API proxy — avoids browser CORS issues, adds 60s cache
const pmMarketsCache = new Map<string, { data: unknown; ts: number }>();
apiRouter.get("/polymarket/markets", async (req: Request, res: Response) => {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query?.["limit"] ?? "24"), 10) || 24));
  const tag = typeof req.query?.["tag"] === "string" ? req.query["tag"].slice(0, 60) : "";
  const cacheKey = `markets:${limit}:${tag}`;
  const hit = pmMarketsCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < 60_000) { res.json(hit.data); return; }
  try {
    const params = new URLSearchParams({ active: "true", closed: "false", limit: String(limit), order: "volume24hr", ascending: "false" });
    if (tag) params.set("tag", tag);
    const upstream = await fetch(`https://gamma-api.polymarket.com/markets?${params}`, { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } });
    if (!upstream.ok) { res.status(502).json({ ok: false, reason: `gamma_${upstream.status}` }); return; }
    const data = await upstream.json();
    pmMarketsCache.set(cacheKey, { data, ts: Date.now() });
    res.json(data);
  } catch (e) {
    res.status(503).json({ ok: false, reason: e instanceof Error ? e.message.slice(0, 100) : "fetch_failed" });
  }
});

apiRouter.post("/alerts/test", alertLimiter, async (req: Request, res: Response) => {
  const title = typeof req.body?.title === "string" ? req.body.title.slice(0, 120) : "ArcMind test alert";
  const body  = typeof req.body?.body  === "string" ? req.body.body.slice(0, 500)  : "Manual test from /api/alerts/test";
  const level = req.body?.level === "warn" || req.body?.level === "alert" || req.body?.level === "success" ? req.body.level : "info";
  const result = await dispatchAlert({ title, body, level });
  res.json(result);
});

apiRouter.get("/arb/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Send a first snapshot immediately so the client doesn't wait up to 10s.
  void buildSnapshot().then((snap) => {
    res.write(`data: ${JSON.stringify({ type: "snapshot", snap })}\n\n`);
  });

  const unsub = onArbSnapshot((snap) => {
    res.write(`data: ${JSON.stringify({ type: "snapshot", snap })}\n\n`);
  });

  const keepalive = setInterval(() => res.write(": ping\n\n"), 20_000);
  req.on("close", () => { unsub(); clearInterval(keepalive); });
});

apiRouter.post("/llm/route", llmLimiter, async (req: Request, res: Response) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  if (!prompt) return res.status(400).json({ ok: false, reason: "empty_prompt" });
  if (!isLlmConfigured()) {
    return res.status(503).json({
      ok: false,
      reason: "no_provider_configured",
      message: "Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in server env.",
    });
  }
  const result = await routeLlmCall({
    prompt,
    system: typeof req.body?.system === "string" ? req.body.system : undefined,
    model: typeof req.body?.model === "string" ? req.body.model : undefined,
    maxTokens: typeof req.body?.maxTokens === "number" ? req.body.maxTokens : undefined,
    temperature: typeof req.body?.temperature === "number" ? req.body.temperature : undefined,
  });
  if (!result.ok) return res.status(502).json(result);
  res.json(result);
});

// ─── Services ───────────────────────────────────────────────────────────────

apiRouter.get("/services", (req: Request, res: Response) => {
  const ws = asWorkspace(req.query["workspace"]);
  recordActivity("services.list", ws ?? "all");
  const pool = ws ? servicesForWorkspace(ws) : services;
  res.json({ services: pool.map(publicService), count: pool.length, workspace: ws ?? null });
});

apiRouter.get("/services/:id", (req: Request, res: Response) => {
  const s = serviceById(String(req.params["id"]));
  if (!s) return res.status(404).json({ error: "unknown_service" });
  res.json(publicService(s));
});

// ─── Agents (policy is read-only here; mutations would need a signature) ────

apiRouter.get("/agents", (req: Request, res: Response) => {
  const ws = asWorkspace(req.query["workspace"]);
  recordActivity("agents.list", ws ?? "all");
  const pool = ws ? agents.filter((a) => a.workspaceId === ws) : agents;
  res.json({ agents: pool, count: pool.length, workspace: ws ?? null });
});

apiRouter.get("/agents/:id", (req: Request, res: Response) => {
  const a = agentById(String(req.params["id"]));
  if (!a) return res.status(404).json({ error: "unknown_agent" });
  res.json(a);
});

// ─── x402 discovery spec (no payment required) ─────────────────────────────

apiRouter.get("/v1/x402-spec", (req: Request, res: Response) => {
  const ws = asWorkspace(req.query["workspace"]);
  recordActivity("spec.read", ws ?? "all");
  const pool = ws ? servicesForWorkspace(ws) : services;
  res.json({
    name: "TollGate x402 API",
    version: "1.0.0",
    description:
      "Pay-per-call API economy for AI agents. Every endpoint is gated by an x402 payment challenge; pay the stablecoin amount and retry with X-PAYMENT to unlock the resource.",
    workspace: ws ?? "all",
    defaultNetwork: env.x402Network,
    defaultAsset: env.x402Asset,
    paymentScheme: "exact",
    paymentInstruction: {
      flow: "GET /api/gateway/<serviceId> → 402 {challenge} → pay <amount> <asset> to <payTo> on <network> → GET again with X-PAYMENT",
      header: "X-PAYMENT",
      format: "base64-encoded JSON of {challengeId, payTo, amount, asset, network, txHash?, payer?}",
      devBypassHeader: isProd() ? null : "X-PAYMENT: dev-bypass (NODE_ENV != production only)",
      replayProtection: "each challenge is single-use, bound to a requestHash, and expires after 5 minutes",
    },
    endpoints: pool.map((s) => ({
      method: "GET",
      path: `/api/gateway/${s.id}`,
      serviceId: s.id,
      name: s.name,
      priceUsd: s.priceUsd,
      currency: s.currency,
      network: s.network,
      category: s.category,
      description: s.description,
      responseShape: s.sampleResponse,
    })),
    examples: {
      unauthenticated_returns_402: `curl -i ${req.protocol}://${req.get("host")}/api/gateway/svc_0g_inference`,
      dev_bypass: isProd() ? undefined : `curl -H "X-PAYMENT: dev-bypass" ${req.protocol}://${req.get("host")}/api/gateway/svc_0g_inference`,
    },
  });
});

// ─── Gateway ────────────────────────────────────────────────────────────────

async function unlockedResponse(req: Request, res: Response): Promise<void> {
  // withX402() already verified payment and attached req.x402.
  const x = (req as Request & { x402?: { service: Service; challengeId: string; requestHash: string; payer: string; txHash?: string; devBypass: boolean } }).x402;
  if (!x) {
    res.status(500).json({ error: "internal", detail: "x402 context missing" });
    return;
  }
  const { service } = x;
  const agentId = ((req.header("X-Agent-Id") ?? "anonymous").slice(0, 128).replace(/[^\x20-\x7E]/g, "") || "anonymous");
  const ws = service.workspaceIds[0] ?? "unknown";
  const receipt = appendReceipt({
    challengeId: x.challengeId,
    workspaceId: ws,
    serviceId: service.id,
    serviceName: service.name,
    agentId,
    payerWallet: x.payer,
    providerWallet: service.providerWallet || env.x402PayoutAddress,
    amount: service.priceUsd,
    currency: service.currency,
    network: service.network,
    txHash: x.txHash,
    requestHash: x.requestHash,
    status: x.txHash ? "verified" : "paid",
    paidAt: new Date().toISOString(),
    verifiedAt: x.txHash ? new Date().toISOString() : undefined,
  });
  // Fire-and-forget on-chain audit trail — does not block the response
  void mantleRecordDecision(receipt.id, JSON.stringify({ serviceId: service.id, amount: service.priceUsd }));
  void ogAnchorReceipt(receipt.id, JSON.stringify({ id: receipt.id, serviceId: service.id, paidAt: receipt.paidAt }));
  const payerAddr = /^0x[0-9a-fA-F]{40}$/.test(x.payer) ? x.payer : "";
  if (payerAddr) void mantleRecordPayment(payerAddr, service.priceUsd);

  // Fire-and-forget NFT mint — does not block the response
  if (payerAddr) {
    mintReceiptNFT({
      to: payerAddr,
      receiptId: receipt.id,
      serviceId: service.id,
      amount: service.priceUsd,
      currency: service.currency,
      paidAt: receipt.paidAt ?? new Date().toISOString(),
      txHash: x.txHash,
    }).then((r) => {
      if (r.ok && r.tokenId != null && r.txHash) {
        updateReceiptNft(receipt.id, r.tokenId, r.txHash);
      }
    }).catch(() => {/* non-critical */});
  }

  res.json({
    serviceId: service.id,
    name: service.name,
    data: service.sampleResponse,
    receiptId: receipt.id,
    receipt,
    note: x.devBypass
      ? "dev-bypass: this response simulates a settled x402 payment. Production verifies a real on-chain proof."
      : "x402 payment verified.",
  });
}

apiRouter.get("/gateway/:serviceId", withX402(), unlockedResponse);
apiRouter.post("/gateway/:serviceId", withX402(), unlockedResponse);

// ─── Receipts ───────────────────────────────────────────────────────────────

apiRouter.get("/receipts", (req: Request, res: Response) => {
  recordActivity("receipts.list");
  const workspaceId = asWorkspace(req.query["workspace"]);
  const serviceId = req.query["service"] ? String(req.query["service"]) : undefined;
  const agentId = req.query["agent"] ? String(req.query["agent"]) : undefined;
  const rows = listReceipts({ workspaceId, serviceId, agentId });
  res.json({ receipts: rows, count: rows.length });
});

apiRouter.get("/receipts/:id", (req: Request, res: Response) => {
  const r = receiptById(String(req.params["id"]));
  if (!r) return res.status(404).json({ error: "unknown_receipt" });
  res.json(r);
});

// ─── Receipt stats (Economy Dashboard) ─────────────────────────────────────

apiRouter.get("/receipts/stats", (_req: Request, res: Response) => {
  res.json(receiptStats());
});

// ─── AgentScore (computed from receipt history, mirrors AgentCreditRegistry.sol) ─

function computeAgentScore(agentId: string, receipts: { amount: number }[]) {
  const count = receipts.length;
  const volumeUsd = receipts.reduce((s, r) => s + r.amount, 0);
  const base = Math.min(count * 5, 500);
  const vol = Math.min(Math.floor(volumeUsd), 300);
  const score = Math.min(base + vol, 1000);
  const tier = score >= 850 ? "Platinum" : score >= 700 ? "Gold" : score >= 400 ? "Silver" : "Bronze";
  return { agentId, score, tier, receiptCount: count, volumeUsd: Math.round(volumeUsd * 100) / 100, breakdown: { base, vol, pen: 0 } };
}

apiRouter.get("/agent-score/:agentId", (req: Request, res: Response) => {
  const agentId = String(req.params["agentId"]);
  const receipts = listReceipts({ agentId });
  res.json(computeAgentScore(agentId, receipts));
});

// ─── SSE: live payment stream (Economy Dashboard) ──────────────────────────

apiRouter.get("/events/payments", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const recentRows = listReceipts().slice(0, 10);
  res.write(`data: ${JSON.stringify({ type: "snapshot", receipts: recentRows })}\n\n`);

  const unsub = onReceipt((r) => {
    res.write(`data: ${JSON.stringify({ type: "receipt", receipt: r })}\n\n`);
  });
  const unsubNft = onNftUpdate((receiptId, tokenId, txHash) => {
    res.write(`data: ${JSON.stringify({ type: "nft_update", receiptId, tokenId, txHash })}\n\n`);
  });

  const keepalive = setInterval(() => res.write(": ping\n\n"), 20_000);
  req.on("close", () => { unsub(); unsubNft(); clearInterval(keepalive); });
});

// ─── Status / observability ────────────────────────────────────────────────

const ARC_LOG = join(process.cwd(), "data", "arc-decisions.jsonl");
const ARC_DEPLOYMENT_CANDIDATES = [
  join(process.cwd(), "../contracts/deployments/arcTestnet.json"),
  join(process.cwd(), "contracts/deployments/arcTestnet.json"),
];

type ArcControlLayerDeployment = {
  operator?: string;
  agentTreasury?: string;
  strategyVault?: string;
  riskGuard?: string;
  receiptRegistry?: string;
  txHashes?: Record<string, string | null>;
  deployedAt?: string;
};

type ArcDeployment = {
  registry?: string;
  escrow?: string;
  usdc?: string;
  explorer?: string;
  controlLayer?: ArcControlLayerDeployment;
};

function readArcDecisionLog(): Record<string, unknown>[] {
  if (!existsSync(ARC_LOG)) return [];
  try {
    const lines = readFileSync(ARC_LOG, "utf8").trim().split("\n").filter(Boolean);
    return lines
      .slice(-50)
      .reverse()
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readArcDeployment(): ArcDeployment {
  for (const file of ARC_DEPLOYMENT_CANDIDATES) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const control = typeof data.controlLayer === "object" && data.controlLayer !== null
        ? data.controlLayer as Record<string, unknown>
        : {};
      const txHashes = typeof control.txHashes === "object" && control.txHashes !== null
        ? control.txHashes as Record<string, string | null>
        : undefined;
      return {
        registry: stringField(data, "registry"),
        escrow: stringField(data, "escrow"),
        usdc: stringField(data, "usdc"),
        explorer: stringField(data, "explorer"),
        controlLayer: Object.keys(control).length
          ? {
            operator: stringField(control, "operator"),
            agentTreasury: stringField(control, "agentTreasury"),
            strategyVault: stringField(control, "strategyVault"),
            riskGuard: stringField(control, "riskGuard"),
            receiptRegistry: stringField(control, "receiptRegistry"),
            txHashes,
            deployedAt: stringField(control, "deployedAt"),
          }
          : undefined,
      };
    } catch {
      return {};
    }
  }
  return {};
}

apiRouter.get("/arc-decisions", (_req: Request, res: Response) => {
  res.json({ decisions: readArcDecisionLog().slice(0, 20) });
});

apiRouter.post("/arc-traction/event", (req: Request, res: Response) => {
  const event = makeArcTractionEvent({
    type: req.body?.type,
    sessionId: req.body?.sessionId,
    wallet: req.body?.wallet,
    amountUsd: req.body?.amountUsd,
    feedbackPrompt: req.body?.feedbackPrompt,
    feedback: req.body?.feedback,
  });
  if (!event) return res.status(400).json({ error: "invalid_arc_traction_event" });
  appendArcTractionEvent(event);
  res.json({ ok: true, event });
});

apiRouter.get("/arc-traction/stats", (_req: Request, res: Response) => {
  const decisions = readArcDecisionLog();
  const stats = buildArcTractionStats(readArcTractionEvents(), decisions.length);
  res.json({ stats, ts: new Date().toISOString() });
});

apiRouter.post("/arc-trace/unlock", async (req: Request, res: Response) => {
  const wallet = cleanArcAddress(req.body?.wallet);
  const amountUsd = 0.01;
  if (!wallet) return res.status(400).json({ error: "wallet_required" });
  try {
    const payment = await verifyArcNativePayment({ txHash: req.body?.txHash, from: wallet, minAmountUsd: amountUsd });
    if (!payment.ok) return res.status(402).json({ error: "arc_payment_not_verified", reason: payment.reason });
    const session = typeof req.body?.sessionId === "string" ? req.body.sessionId : "anonymous";
    const receipt = appendReceipt({
      challengeId: `ch_trace_${payment.txHash.slice(2, 18)}`,
      workspaceId: "agora",
      serviceId: "svc_arc_reasoning",
      serviceName: "ArcMind Reasoning Trace Unlock",
      agentId: session.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "anonymous",
      payerWallet: wallet,
      providerWallet: env.x402PayoutAddress,
      amount: amountUsd,
      currency: "USDC",
      network: "arc-testnet",
      txHash: payment.txHash,
      requestHash: `trace:${payment.txHash}`,
      status: "verified",
      paidAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    });
    const event = makeArcTractionEvent({
      type: "trace_unlock",
      sessionId: session,
      wallet,
      amountUsd,
    });
    if (event) appendArcTractionEvent(event);
    res.json({ ok: true, receipt });
  } catch (err) {
    res.status(502).json({ error: "arc_payment_verification_failed", detail: err instanceof Error ? err.message : "unknown" });
  }
});

apiRouter.post("/arc-portfolio/simulate", (req: Request, res: Response) => {
  const decisions = readArcDecisionLog();
  const simulation = buildPortfolioSimulation({
    latestDecision: decisions[0] ?? null,
    riskProfile: req.body?.riskProfile,
    amountUsd: req.body?.amountUsd,
    sessionId: req.body?.sessionId,
    selectedLeaderId: req.body?.selectedLeaderId,
    maxDrawdownPct: req.body?.maxDrawdownPct,
  });
  res.json({ ok: true, simulation, ts: new Date().toISOString() });
});

apiRouter.post("/arc-portfolio/start", async (req: Request, res: Response) => {
  const decisions = readArcDecisionLog();
  const mode = process.env.ARC_PRIVATE_KEY && process.env.ARC_AGENT_ID ? "arc" : "paper";
  const wallet = cleanArcAddress(req.body?.wallet);
  if (!wallet) return res.status(400).json({ error: "wallet_required" });
  const portfolio = buildProtectedPortfolio({
    latestDecision: decisions[0] ?? null,
    riskProfile: req.body?.riskProfile,
    amountUsd: req.body?.amountUsd,
    sessionId: req.body?.sessionId,
    wallet,
    mode,
  });
  try {
    const payment = await verifyArcNativePayment({ txHash: req.body?.txHash, from: wallet, minAmountUsd: portfolio.amountUsd });
    if (!payment.ok) return res.status(402).json({ error: "arc_payment_not_verified", reason: payment.reason });
  const receipt = appendReceipt({
    challengeId: `ch_${portfolio.portfolioId}`,
    workspaceId: "agora",
    serviceId: "svc_arc_copytrade",
    serviceName: "ArcMind CopyGuard Protected Portfolio",
    agentId: portfolio.sessionId,
    payerWallet: wallet,
    providerWallet: env.x402PayoutAddress,
    amount: portfolio.amountUsd,
    currency: "USDC",
    network: "arc-testnet",
      txHash: payment.txHash,
      requestHash: portfolio.requestHash,
      status: "verified",
    paidAt: portfolio.createdAt,
      verifiedAt: portfolio.createdAt,
  });
  const event = makeArcTractionEvent({
    type: "portfolio_start",
    sessionId: portfolio.sessionId,
    wallet: portfolio.wallet,
    amountUsd: portfolio.amountUsd,
  });
  if (event) appendArcTractionEvent(event);
  res.json({ ok: true, portfolio, receipt });
  } catch (err) {
    res.status(502).json({ error: "arc_payment_verification_failed", detail: err instanceof Error ? err.message : "unknown" });
  }
});

apiRouter.get("/arc-readiness", (_req: Request, res: Response) => {
  const decisions = readArcDecisionLog();
  const receipts = listReceipts({ workspaceId: "agora" });
  const stats = buildArcTractionStats(readArcTractionEvents(), decisions.length);
  const agoraServices = servicesForWorkspace("agora");
  const deployedContracts = readArcDeployment();
  const readiness = buildArcReadinessReport({
    env: process.env,
    x402PayoutAddress: env.x402PayoutAddress,
    x402Network: env.x402Network,
    deployedContracts,
    decisions,
    receipts,
    stats,
    agoraServiceCount: agoraServices.length,
  });
  res.json({
    ...readiness,
    ts: new Date().toISOString(),
  });
});

apiRouter.get("/arc-audit", (_req: Request, res: Response) => {
  const decisions = readArcDecisionLog();
  const receipts = listReceipts({ workspaceId: "agora" });
  const auditTrail = buildArcAuditTrail({
    registrationTxHash: process.env.ARC_AGENT_REGISTER_TX,
    decisions,
    receipts,
  });
  res.json({ auditTrail, ts: new Date().toISOString() });
});

apiRouter.get("/arc-alerts", (req: Request, res: Response) => {
  const threshold = Number(req.query["threshold"] ?? 50);
  const alerts = buildArcAlerts(readArcDecisionLog(), Number.isFinite(threshold) ? threshold : 50);
  res.json({ alerts, ts: new Date().toISOString() });
});

apiRouter.get("/arc-decision-replay/latest", (_req: Request, res: Response) => {
  const replay = buildArcDecisionReplay(readArcDecisionLog()[0] ?? null);
  res.json({ replay, ts: new Date().toISOString() });
});

apiRouter.get("/arc-signal-sources", (_req: Request, res: Response) => {
  res.json(buildArcSignalSourceRadar(process.env));
});

apiRouter.get("/arc-agent/status", (_req: Request, res: Response) => {
  res.json({
    status: getArcAgentLoopStatus(),
    manualTickConfigured: Boolean(process.env.ARC_ADMIN_TOKEN),
    intervalMs: process.env.ARC_AGENT_INTERVAL_MS ?? null,
    ts: new Date().toISOString(),
  });
});

apiRouter.post("/arc-agent/tick", async (req: Request, res: Response) => {
  if (!hasArcAdmin(req)) {
    return res.status(process.env.ARC_ADMIN_TOKEN ? 403 : 404).json({
      error: process.env.ARC_ADMIN_TOKEN ? "forbidden" : "manual_tick_not_configured",
    });
  }
  await arcAgentLoop();
  res.json({
    ok: true,
    status: getArcAgentLoopStatus(),
    latestDecision: readArcDecisionLog()[0] ?? null,
    ts: new Date().toISOString(),
  });
});

apiRouter.get("/arc-verify/latest", async (_req: Request, res: Response) => {
  const latest = readArcDecisionLog()[0];
  const txHash = typeof latest?.["txHash"] === "string" ? latest["txHash"] : undefined;
  let receiptState: { found: boolean; status?: number | null } = { found: false };
  if (txHash && process.env.ARC_RPC_URL) {
    try {
      const provider = new JsonRpcProvider(process.env.ARC_RPC_URL);
      const receipt = await provider.getTransactionReceipt(txHash);
      receiptState = { found: Boolean(receipt), status: receipt?.status ?? null };
    } catch {
      receiptState = { found: false };
    }
  }
  res.json({
    verification: evaluateArcDecisionVerification(latest, receiptState),
    ts: new Date().toISOString(),
  });
});

apiRouter.get("/arc-live", (_req: Request, res: Response) => {
  const decisions = readArcDecisionLog();
  const receipts = listReceipts({ workspaceId: "agora" });
  const stats = buildArcTractionStats(readArcTractionEvents(), decisions.length);
  const auditTrail = buildArcAuditTrail({
    registrationTxHash: process.env.ARC_AGENT_REGISTER_TX,
    decisions,
    receipts,
  });
  const alerts = buildArcAlerts(decisions);
  const decisionReplay = buildArcDecisionReplay(decisions[0] ?? null);
  res.json({
    status: {
      server: "online",
      mode: process.env.ARC_PRIVATE_KEY && process.env.ARC_AGENT_ID ? "arc" : "paper",
      network: "arc-testnet",
      nextLoopHintMinutes: 30,
      payoutAddress: env.x402PayoutAddress,
      agentId: process.env.ARC_AGENT_ID,
      registrationTxHash: process.env.ARC_AGENT_REGISTER_TX,
    },
    latestDecision: decisions[0] ?? null,
    decisions: decisions.slice(0, 10),
    receipts: receipts.slice(0, 10),
    stats,
    auditTrail,
    alerts,
    decisionReplay,
    ts: new Date().toISOString(),
  });
});

// ─── ArcMind Control Layer product API ───────────────────────────────────────

function parseAgentAction(v: unknown): AgentAction | null {
  const value = typeof v === "string" ? v : "";
  return ["READ_SOURCE", "BUILD_DECISION", "COPY", "HOLD", "REDUCE", "STOP", "MOVE_TO_USDC", "RUN_ARB_CHECK", "UNLOCK_REASONING"].includes(value)
    ? value as AgentAction
    : null;
}

function parseFundingMode(v: unknown): FundingMode | undefined {
  const value = typeof v === "string" ? v : "";
  return ["agent_treasury", "user_wallet", "user_strategy_vault", "free_public"].includes(value)
    ? value as FundingMode
    : undefined;
}

function liveTxContext(req: Request) {
  return {
    txHash: typeof req.body?.txHash === "string" ? req.body.txHash : undefined,
    walletAddress: typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined,
  };
}

function writeStatus(state: { receipts?: Array<{ liveStatus?: string }>; executions?: Array<{ status?: string }> }) {
  const latestReceipt = state.receipts?.[0];
  const latestExecution = state.executions?.[0];
  if (latestReceipt?.liveStatus === "blocked" || latestExecution?.status === "blocked") return "blocked";
  if (latestExecution?.status === "failed") return "failed";
  return "live";
}

apiRouter.get("/arc/control/status", (_req: Request, res: Response) => {
  res.json({ ok: true, state: getArcControlState(), ts: new Date().toISOString() });
});

apiRouter.get("/arc/control/budget", (_req: Request, res: Response) => {
  const state = getArcControlState();
  res.json({ ok: true, budget: state.budget, policy: state.policy, ts: new Date().toISOString() });
});

apiRouter.post("/arc/control/budget/top-up", (req: Request, res: Response) => {
  const state = topUpAgentBudget(req.body?.amountUsd, liveTxContext(req));
  recordActivity("arc.control.budget.topup", "agora");
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, budget: state.budget, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/budget/update-policy", (req: Request, res: Response) => {
  const state = updateAgentPolicy(req.body ?? {});
  recordActivity("arc.control.policy.update", "agora");
  res.json({ ok: true, state, budget: state.budget, policy: state.policy, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/policy", (req: Request, res: Response) => {
  const state = updateAgentPolicy(req.body ?? {});
  recordActivity("arc.control.policy.update", "agora");
  res.json({ ok: true, state, budget: state.budget, policy: state.policy, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/budget/withdraw", (req: Request, res: Response) => {
  const state = withdrawAgentBudget(req.body?.amountUsd, liveTxContext(req));
  recordActivity("arc.control.budget.withdraw", "agora");
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, budget: state.budget, receipt: state.receipts[0] ?? null });
});

apiRouter.get("/arc/control/sources", (_req: Request, res: Response) => {
  const state = getArcControlState();
  res.json({ ok: true, sources: state.sources, policy: state.policy, ts: new Date().toISOString() });
});

apiRouter.post("/arc/control/sources/refresh", async (_req: Request, res: Response) => {
  const updates: Partial<ControlSource>[] = [];
  const marketPrice = await fetchEthMarketPrice();
  updates.push({
    id: "market_price",
    status: marketPrice.price ? "live" : "unavailable",
    contribution: marketPrice.price ? 35 : 0,
    signal: marketPrice.price
      ? `ETH quote ${marketPrice.price.toLocaleString()} from ${marketPrice.provider ?? "public market source"}.`
      : "ETH quote unavailable; agent actions cannot claim live price.",
  });
  const radar = buildArcSignalSourceRadar(process.env);
  const configured = radar.sources.filter((source) => source.status === "configured").length;
  const needsKey = radar.sources.filter((source) => source.status === "needs_key").length;
  updates.push({
    id: "social_news",
    status: configured > 0 ? "live" : needsKey > 0 ? "needs_key" : "unavailable",
    contribution: configured > 0 ? Math.min(25, configured * 4) : 0,
    signal: configured > 0
      ? `${configured} Apify-backed social/news sources configured.`
      : "Social/news source layer needs APIFY_TOKEN or configured source mode.",
  });
  let leaderLive = false;
  if (process.env.ARC_LEADER_FEED_URL && /^https?:\/\//i.test(process.env.ARC_LEADER_FEED_URL)) {
    try {
      const feedRes = await fetch(process.env.ARC_LEADER_FEED_URL, { signal: AbortSignal.timeout(5_000) });
      if (feedRes.ok) {
        const payload = await feedRes.json() as unknown;
        leaderLive = Array.isArray(payload) ? payload.length > 0 : typeof payload === "object" && payload !== null;
      }
    } catch { /* leader remains unavailable */ }
  }
  updates.push({
    id: "leader_feed",
    status: leaderLive ? "live" : "unavailable",
    contribution: leaderLive ? 12 : 0,
    signal: leaderLive
      ? "Verified leader feed returned sourced data for this refresh."
      : "No verified leader feed configured; SignalGuard mode stays active.",
  });
  const state = refreshControlSources(updates);
  recordActivity("arc.control.sources.refresh", "agora");
  res.json({ ok: true, state, sources: state.sources, decision: state.latestDecision, execution: state.executions[0] ?? null, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/sources/allow", (req: Request, res: Response) => {
  const sourceId = typeof req.body?.sourceId === "string" ? req.body.sourceId : "";
  if (!sourceId) return res.status(400).json({ error: "sourceId_required" });
  const state = allowControlSource(sourceId, true);
  res.json({ ok: true, state, policy: state.policy, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/sources/block", (req: Request, res: Response) => {
  const sourceId = typeof req.body?.sourceId === "string" ? req.body.sourceId : "";
  if (!sourceId) return res.status(400).json({ error: "sourceId_required" });
  const state = allowControlSource(sourceId, false);
  res.json({ ok: true, state, policy: state.policy, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/actions/allow", (req: Request, res: Response) => {
  const action = parseAgentAction(req.body?.action);
  if (!action) return res.status(400).json({ error: "action_required" });
  const state = setControlActionAllowed(action, true);
  res.json({ ok: true, state, policy: state.policy, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/actions/block", (req: Request, res: Response) => {
  const action = parseAgentAction(req.body?.action);
  if (!action) return res.status(400).json({ error: "action_required" });
  const state = setControlActionAllowed(action, false);
  res.json({ ok: true, state, policy: state.policy, receipt: state.receipts[0] ?? null });
});

apiRouter.get("/arc/control/strategies", (_req: Request, res: Response) => {
  const state = getArcControlState();
  res.json({ ok: true, strategies: state.strategies, decision: state.latestDecision, ts: new Date().toISOString() });
});

apiRouter.post("/arc/control/strategies/enable", (req: Request, res: Response) => {
  const strategyId = typeof req.body?.strategyId === "string" ? req.body.strategyId : "";
  if (!strategyId) return res.status(400).json({ error: "strategyId_required" });
  const state = setControlStrategy(strategyId, true, typeof req.body?.autoRun === "boolean" ? req.body.autoRun : undefined);
  res.json({ ok: true, state, strategies: state.strategies, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/strategies/disable", (req: Request, res: Response) => {
  const strategyId = typeof req.body?.strategyId === "string" ? req.body.strategyId : "";
  if (!strategyId) return res.status(400).json({ error: "strategyId_required" });
  const state = setControlStrategy(strategyId, false);
  res.json({ ok: true, state, strategies: state.strategies, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/strategies/run-once", (req: Request, res: Response) => {
  const strategyId = typeof req.body?.strategyId === "string" ? req.body.strategyId : undefined;
  const action = strategyId === "arbwatcher" ? "RUN_ARB_CHECK" : "BUILD_DECISION";
  const amountUsd = strategyId === "arbwatcher" ? 0.05 : 0;
  const fundingMode: FundingMode = strategyId === "arbwatcher" ? "agent_treasury" : "free_public";
  const state = runControlAction(action, { amountUsd, fundingMode, strategyId });
  res.json({ ok: true, state, execution: state.executions[0] ?? null, receipt: state.receipts[0] ?? null });
});

apiRouter.get("/arc/control/decision/latest", (_req: Request, res: Response) => {
  const state = getArcControlState();
  res.json({ ok: true, decision: state.latestDecision, ts: new Date().toISOString() });
});

apiRouter.post("/arc/control/decision/build", (_req: Request, res: Response) => {
  const state = buildLatestControlDecision();
  res.json({ ok: true, state, decision: state.latestDecision, execution: state.executions[0] ?? null, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/decision/approve", (req: Request, res: Response) => {
  const stateNow = getArcControlState();
  const action = parseAgentAction(req.body?.action) ?? stateNow.latestDecision.action;
  const fundingMode = parseFundingMode(req.body?.fundingMode)
    ?? (["COPY", "HOLD", "REDUCE", "STOP", "MOVE_TO_USDC"].includes(action) ? "user_strategy_vault" : "agent_treasury");
  const amountUsd = typeof req.body?.amountUsd !== "undefined" ? req.body.amountUsd : action === "RUN_ARB_CHECK" ? 0.05 : 0;
  const state = approveLatestControlDecision({ action, amountUsd, fundingMode });
  res.json({ ok: true, state, execution: state.executions[0] ?? null, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/decision/reject", (_req: Request, res: Response) => {
  const state = rejectLatestControlDecision();
  res.json({ ok: true, state, execution: state.executions[0] ?? null, receipt: state.receipts[0] ?? null });
});

apiRouter.get("/arc/control/execution", (_req: Request, res: Response) => {
  const state = getArcControlState();
  res.json({ ok: true, executions: state.executions, ts: new Date().toISOString() });
});

apiRouter.post("/arc/control/execution/cancel", (req: Request, res: Response) => {
  const executionId = typeof req.body?.executionId === "string" ? req.body.executionId : "";
  if (!executionId) return res.status(400).json({ error: "executionId_required" });
  const state = cancelControlExecution(executionId);
  res.json({ ok: true, state, executions: state.executions, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/execution/retry", (req: Request, res: Response) => {
  const executionId = typeof req.body?.executionId === "string" ? req.body.executionId : "";
  if (!executionId) return res.status(400).json({ error: "executionId_required" });
  const state = retryControlExecution(executionId);
  res.json({ ok: true, state, execution: state.executions[0] ?? null, receipt: state.receipts[0] ?? null });
});

apiRouter.get("/arc/control/positions", (_req: Request, res: Response) => {
  const state = getArcControlState();
  res.json({ ok: true, positions: state.positions, ts: new Date().toISOString() });
});

apiRouter.post("/arc/control/positions/reduce", (req: Request, res: Response) => {
  const positionId = typeof req.body?.positionId === "string" ? req.body.positionId : undefined;
  const action = req.body?.pct === 50 ? "reduce50" : "reduce25";
  const state = mutateControlPosition(action, positionId, liveTxContext(req));
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, positions: state.positions, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/positions/close", (req: Request, res: Response) => {
  const state = mutateControlPosition("close", typeof req.body?.positionId === "string" ? req.body.positionId : undefined, liveTxContext(req));
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, positions: state.positions, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/positions/settle", (req: Request, res: Response) => {
  const state = mutateControlPosition("settle", typeof req.body?.positionId === "string" ? req.body.positionId : undefined, liveTxContext(req));
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, positions: state.positions, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/positions/withdraw", (req: Request, res: Response) => {
  const state = mutateControlPosition("withdraw", typeof req.body?.positionId === "string" ? req.body.positionId : undefined, liveTxContext(req));
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, positions: state.positions, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/positions/open", (req: Request, res: Response) => {
  const state = mutateControlPosition("open", undefined, liveTxContext(req));
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, positions: state.positions, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/risk/exit", (req: Request, res: Response) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
  const state = triggerRiskEmergencyExit(reason, liveTxContext(req));
  recordActivity("arc.control.risk.exit", "agora");
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, budget: state.budget, positions: state.positions, execution: state.executions[0] ?? null, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/risk/arm", (req: Request, res: Response) => {
  const state = setRiskGuardMode("arm", liveTxContext(req));
  recordActivity("arc.control.risk.arm", "agora");
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, budget: state.budget, positions: state.positions, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/risk/disarm", (req: Request, res: Response) => {
  const state = setRiskGuardMode("disarm", liveTxContext(req));
  recordActivity("arc.control.risk.disarm", "agora");
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, budget: state.budget, positions: state.positions, receipt: state.receipts[0] ?? null });
});

apiRouter.post("/arc/control/risk/reset", (req: Request, res: Response) => {
  const state = setRiskGuardMode("reset", liveTxContext(req));
  recordActivity("arc.control.risk.reset", "agora");
  const status = writeStatus(state);
  res.json({ ok: status === "live", status, reason: status === "blocked" ? "live_tx_required" : undefined, state, budget: state.budget, positions: state.positions, receipt: state.receipts[0] ?? null });
});

apiRouter.get("/arc/control/receipts", (_req: Request, res: Response) => {
  const state = getArcControlState();
  res.json({ ok: true, receipts: state.receipts, count: state.receipts.length, ts: new Date().toISOString() });
});

apiRouter.get("/arc/control/developer/status", (_req: Request, res: Response) => {
  const deployment = readArcDeployment();
  res.json({
    ok: true,
    developer: {
      ...developerControlStatus(),
      deployment,
    },
    ts: new Date().toISOString(),
  });
});

// ─── Signals aggregator (ArcMind Signal Hub) ─────────────────────────────────

interface HlCtx { openInterest: string; funding: string }
interface PmMarket { question: string; outcomePrices?: string[]; volume24hr?: number }

apiRouter.get("/signals", async (_req: Request, res: Response) => {
  let whale: { available: boolean; netFlow: number | null; direction: "bullish" | "bearish" | "neutral"; status: string } = {
    available: false,
    netFlow: null,
    direction: "neutral",
    status: "hyperliquid_unavailable",
  };
  try {
    const hlRes = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: AbortSignal.timeout(7_000),
    });
    if (hlRes.ok) {
      const hlData = await hlRes.json() as [{ universe: { name: string }[] }, HlCtx[]];
      const ethIdx = hlData[0].universe.findIndex((u) => u.name === "ETH");
      if (ethIdx >= 0 && hlData[1][ethIdx]) {
        const ctx = hlData[1][ethIdx];
        const oi  = parseFloat(ctx.openInterest);
        const fr  = parseFloat(ctx.funding);
        whale = {
          available: Number.isFinite(oi),
          netFlow: Number.isFinite(oi) ? parseFloat((oi / 1e6).toFixed(1)) : null,
          direction: (!isNaN(fr) && fr > 0.0001) ? "bullish" : (!isNaN(fr) && fr < -0.0001) ? "bearish" : "neutral",
          status: "live",
        };
      }
    }
  } catch { /* source stays unavailable */ }

  let polymarket: { available: boolean; question: string | null; yesPct: number | null; volume24h: number | null; status: string } = {
    available: false,
    question: null,
    yesPct: null,
    volume24h: null,
    status: "polymarket_unavailable",
  };
  try {
    const pmRes = await fetch(
      "https://gamma-api.polymarket.com/markets?tag=crypto&limit=5&active=true",
      { signal: AbortSignal.timeout(6_000) }
    );
    if (pmRes.ok) {
      const pmData = await pmRes.json() as PmMarket[];
      const mkt = Array.isArray(pmData) ? pmData[0] : null;
      if (mkt) {
        const prices = Array.isArray(mkt.outcomePrices) ? mkt.outcomePrices.map(Number) : [0.5];
        const yesPct = Number.isFinite(prices[0]) ? Math.round((prices[0] ?? 0.5) * 100) : null;
        polymarket = {
          available: yesPct !== null,
          question: mkt.question ?? null,
          yesPct,
          volume24h: typeof mkt.volume24hr === "number" ? mkt.volume24hr : null,
          status: "live",
        };
      }
    }
  } catch { /* source stays unavailable */ }

  const marketPrice = await fetchEthMarketPrice();
  const ethPrice = marketPrice.price;

  res.json({
    polymarket,
    whale,
    ethPrice,
    sources: {
      hyperliquid: whale.available ? "live" : "unavailable",
      polymarket: polymarket.available ? "live" : "unavailable",
      price: marketPrice.provider ?? "unavailable",
      priceSources: marketPrice.sources,
    },
    ts: new Date().toISOString(),
  });
});

// ─── USYC APY (DeFiLlama → Circle USYC pool) ─────────────────────────────────

interface LlamaPool { symbol: string; apy: number; project?: string }

apiRouter.get("/usyc-apy", async (_req: Request, res: Response) => {
  try {
    const r = await fetch("https://yields.llama.fi/pools", { signal: AbortSignal.timeout(8_000) });
    if (r.ok) {
      const data = await r.json() as { data: LlamaPool[] };
      const pool = data.data?.find(p => p.symbol?.toUpperCase().includes("USYC"));
      if (pool?.apy) {
        const apy = parseFloat(pool.apy.toFixed(2));
        return res.json({ apy, asset: "USYC", provider: "DeFiLlama", network: "arc-testnet", ts: new Date().toISOString() });
      }
    }
  } catch { /* handled below */ }
  res.status(503).json({ ok: false, reason: "usyc_apy_unavailable", asset: "USYC", provider: "DeFiLlama", network: "arc-testnet", ts: new Date().toISOString() });
});

// ─── Swap quote (real ETH price via public market sources) ────────────────────

apiRouter.get("/swap-quote", async (req: Request, res: Response) => {
  const side = String(req.query["side"] ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const amountIn = Math.min(Math.max(parseFloat(String(req.query["amountIn"] ?? "100")) || 100, 0.001), 1_000_000);

  const marketPrice = await fetchEthMarketPrice();
  const ethPrice = marketPrice.price;
  if (ethPrice === null) {
    return res.status(503).json({ error: "eth_price_unavailable", sources: marketPrice.sources, ts: new Date().toISOString() });
  }

  const slippage = 0.001; // 0.1%
  const amountOut = side === "BUY"
    ? parseFloat(((amountIn / ethPrice) * (1 - slippage)).toFixed(8))
    : parseFloat((amountIn * ethPrice * (1 - slippage)).toFixed(4));

  res.json({ pair: "ETH/USDC", side, amountIn, amountOut, price: ethPrice, priceProvider: marketPrice.provider, priceSources: marketPrice.sources, slippagePct: 0.1, network: "arc-testnet", ts: new Date().toISOString() });
});

// ─── Multi-agent debate (Bullish vs Bearish LLM calls) ───────────────────────

apiRouter.get("/arc-debate", async (_req: Request, res: Response) => {
  const marketPrice = await fetchEthMarketPrice();
  const ethPrice: number | null = marketPrice.price;
  let oiValue: string | null = null;
  let fundingRate: number | null = null;
  try {
    const hl = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }), signal: AbortSignal.timeout(6_000),
    });
    const hlData = await hl.json() as [{ universe: { name: string }[] }, { openInterest: string; funding?: string }[]];
    const idx = hlData[0].universe.findIndex(u => u.name === "ETH");
    if (idx >= 0 && hlData[1][idx]) {
      const oi = parseFloat(hlData[1][idx].openInterest);
      oiValue = Number.isFinite(oi) ? `${(oi / 1e6).toFixed(1)}M` : null;
      const fr = parseFloat(hlData[1][idx].funding ?? "");
      fundingRate = Number.isFinite(fr) ? fr : null;
    }
  } catch { /* handled below */ }
  if (ethPrice === null || oiValue === null) {
    return res.status(503).json({ ok: false, reason: "live_sources_unavailable", ts: new Date().toISOString() });
  }

  const marketCtx = `ETH/USDC price: $${ethPrice.toLocaleString()} | Open interest: ${oiValue} | Funding rate: ${fundingRate !== null ? (fundingRate * 100).toFixed(4) + "%" : "unknown"}`;

  if (!isLlmConfigured()) {
    const fundingSignal = fundingRate ?? 0;
    const bullArg = `ETH at $${ethPrice.toLocaleString()} with OI ${oiValue} — accumulation pattern. Funding at ${fundingRate !== null ? (fundingRate * 100).toFixed(4) + "%" : "unknown"} supports cautious long entry.`;
    const bearArg = `OI ${oiValue} elevated against $${ethPrice.toLocaleString()} — crowding risk. Funding ${fundingRate !== null ? (fundingRate * 100).toFixed(4) + "%" : "unknown"} suggests overleveraged longs.`;
    const verdict: "BUY" | "SELL" | "HOLD" = fundingSignal > 0.0001 ? "BUY" : fundingSignal < -0.0001 ? "SELL" : "HOLD";
    return res.json({ ethPrice, oiValue, bullArg, bearArg, verdict, fundingRate, llmUsed: false, provider: "rule-based", model: "none", ts: new Date().toISOString() });
  }

  const bullResult = await routeLlmCall({
    system: "You are a Bullish crypto analyst. Given live market data, make the strongest possible case for buying ETH. Be concise — 2-3 sentences max. Cite specific numbers from the data provided. Do not hedge.",
    prompt: marketCtx,
    maxTokens: 120,
    temperature: 0.5,
  });

  const bearResult = await routeLlmCall({
    system: "You are a Bearish crypto analyst. Given live market data, make the strongest possible case for selling or avoiding ETH. Be concise — 2-3 sentences max. Cite specific numbers from the data provided. Do not hedge.",
    prompt: marketCtx,
    maxTokens: 120,
    temperature: 0.5,
  });

  const verdictResult = await routeLlmCall({
    system: "You are ArcMind, an autonomous trading agent. Read the bull and bear arguments below and respond with ONLY one word: BUY, SELL, or HOLD. No explanation.",
    prompt: `Market: ${marketCtx}\n\nBull: ${bullResult.text || "unavailable"}\nBear: ${bearResult.text || "unavailable"}\n\nVerdict:`,
    maxTokens: 10,
    temperature: 0.1,
  });

  const bullArg = bullResult.ok && bullResult.text
    ? bullResult.text.trim()
    : `ETH at $${ethPrice.toLocaleString()} with OI ${oiValue} — accumulation signals. LLM unavailable: ${bullResult.reason ?? "unknown"}.`;
  const bearArg = bearResult.ok && bearResult.text
    ? bearResult.text.trim()
    : `OI ${oiValue} vs $${ethPrice.toLocaleString()} — crowding risk. LLM unavailable: ${bearResult.reason ?? "unknown"}.`;

  const rawVerdict = verdictResult.text.trim().toUpperCase();
  const verdict: "BUY" | "SELL" | "HOLD" = rawVerdict === "BUY" ? "BUY" : rawVerdict === "SELL" ? "SELL" : "HOLD";

  res.json({
    ethPrice, oiValue, bullArg, bearArg, verdict, fundingRate,
    llmUsed: bullResult.ok || bearResult.ok,
    provider: bullResult.provider,
    model: bullResult.model,
    ts: new Date().toISOString(),
  });
});

// ─── Agent leaderboard ────────────────────────────────────────────────────────

apiRouter.get("/leaderboard", (_req: Request, res: Response) => {
  const all = listReceipts();
  const byAgent = new Map<string, { amount: number }[]>();
  for (const r of all) {
    if (!byAgent.has(r.agentId)) byAgent.set(r.agentId, []);
    byAgent.get(r.agentId)!.push({ amount: r.amount });
  }
  const rows = Array.from(byAgent.entries())
    .map(([agentId, receipts]) => {
      const s = computeAgentScore(agentId, receipts);
      return { agentId, score: s.score, tier: s.tier, receipts: receipts.length, volumeUsd: s.volumeUsd };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  res.json({ leaderboard: rows, ts: new Date().toISOString() });
});

export const statusRouter = Router();

statusRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "tollgate-server",
    nodeEnv: env.nodeEnv,
    defaultNetwork: env.x402Network,
    defaultAsset: env.x402Asset,
    payoutAddress: env.x402PayoutAddress,
    serviceCount: services.length,
    agentCount: agents.length,
  });
});

statusRouter.get("/activity", (_req: Request, res: Response) => {
  res.json({ ...activitySnapshot() });
});

statusRouter.get("/x402-log", (_req: Request, res: Response) => {
  res.json({ calls: x402Log.slice(-100).reverse() });
});
