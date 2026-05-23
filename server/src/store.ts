// In-memory stores: activity tracker (ported from kravadk/XSight- server/src/services/activityTracker.ts,
// generalized) and x402 challenge store (replay + expiry).
// Receipt ledger is persisted to SQLite so history survives server restarts.

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { PaymentChallenge, Receipt, X402CallLogEntry } from "./types.js";

// ─── SQLite setup ────────────────────────────────────────────────────────────

const DB_PATH = process.env.DB_PATH ?? join(dirname(fileURLToPath(import.meta.url)), "../../data/receipts.db");
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    id             TEXT PRIMARY KEY,
    challengeId    TEXT NOT NULL,
    workspaceId    TEXT NOT NULL,
    serviceId      TEXT NOT NULL,
    serviceName    TEXT NOT NULL,
    agentId        TEXT NOT NULL,
    payerWallet    TEXT NOT NULL,
    providerWallet TEXT NOT NULL,
    amount         REAL NOT NULL,
    currency       TEXT NOT NULL,
    network        TEXT NOT NULL,
    txHash         TEXT,
    requestHash    TEXT NOT NULL,
    status         TEXT NOT NULL,
    errorCode      TEXT,
    createdAt      TEXT NOT NULL,
    paidAt         TEXT,
    verifiedAt     TEXT,
    nftTokenId     INTEGER,
    nftTxHash      TEXT
  );
`);
// Migration: add NFT columns to pre-existing DBs
try { db.exec("ALTER TABLE receipts ADD COLUMN nftTokenId INTEGER"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE receipts ADD COLUMN nftTxHash TEXT"); } catch { /* already exists */ }

// Notify SSE listeners on every new receipt.
export type ReceiptListener = (r: Receipt) => void;
const receiptListeners = new Set<ReceiptListener>();
export function onReceipt(cb: ReceiptListener): () => void {
  receiptListeners.add(cb);
  return () => receiptListeners.delete(cb);
}

// ─── Activity tracker ───────────────────────────────────────────────────────

export type ActivityKind =
  | "gateway.402"
  | "gateway.paid"
  | "gateway.rejected"
  | "gateway.replayed"
  | "gateway.expired"
  | "services.list"
  | "agents.list"
  | "receipts.list"
  | "spec.read"
  | "mcp.initialize"
  | "mcp.tools.list"
  | "mcp.tools.call"
  | "arc.control.budget.topup"
  | "arc.control.policy.update"
  | "arc.control.budget.withdraw"
  | "arc.control.sources.refresh"
  | "arc.control.risk.exit"
  | "arc.control.risk.arm"
  | "arc.control.risk.disarm"
  | "arc.control.risk.reset"
  | "og.upload"
  | "og.compute";

export interface ActivityEvent {
  timestamp: number;
  kind: ActivityKind;
  detail?: string;
}

interface CounterState {
  total: number;
  byKind: Record<string, number>;
  lastEventAt: number;
  recent: ActivityEvent[];
}

const RECENT_LIMIT = 100;
const activity: CounterState = { total: 0, byKind: {}, lastEventAt: 0, recent: [] };

export function recordActivity(kind: ActivityKind, detail?: string): void {
  const event: ActivityEvent = { timestamp: Date.now(), kind, detail };
  activity.total += 1;
  activity.byKind[kind] = (activity.byKind[kind] ?? 0) + 1;
  activity.lastEventAt = event.timestamp;
  activity.recent.unshift(event);
  if (activity.recent.length > RECENT_LIMIT) activity.recent.pop();
}

export function activitySnapshot() {
  return {
    totalCalls: activity.total,
    byKind: { ...activity.byKind },
    lastEventAt: activity.lastEventAt,
    paid: activity.byKind["gateway.paid"] ?? 0,
    rejected: activity.byKind["gateway.rejected"] ?? 0,
    challenges402: activity.byKind["gateway.402"] ?? 0,
    replays: activity.byKind["gateway.replayed"] ?? 0,
    mcpCalls: activity.byKind["mcp.tools.call"] ?? 0,
    recent: activity.recent.slice(0, 50),
  };
}

// ─── x402 call log (rejected + paid, like XSight's x402Log) ────────────────

export const x402Log: X402CallLogEntry[] = [];

export function logX402Call(entry: X402CallLogEntry): void {
  x402Log.push(entry);
  if (x402Log.length > 500) x402Log.shift();
}

// ─── Challenge store (replay protection + expiry) ──────────────────────────

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challenges = new Map<string, PaymentChallenge>();

export function issueChallenge(input: {
  serviceId: string;
  amount: string;
  currency: string;
  network: string;
  payTo: string;
  requestHash: string;
}): PaymentChallenge {
  const now = Date.now();
  const challenge: PaymentChallenge = {
    challengeId: "ch_" + randomUUID().replace(/-/g, "").slice(0, 24),
    ...input,
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
    used: false,
  };
  challenges.set(challenge.challengeId, challenge);
  // Opportunistic GC.
  for (const [id, c] of challenges) if (c.expiresAt < now - CHALLENGE_TTL_MS) challenges.delete(id);
  return challenge;
}

export type ChallengeCheck =
  | { ok: true; challenge: PaymentChallenge }
  | { ok: false; reason: "unknown" | "expired" | "replayed" | "service_mismatch" | "request_mismatch" };

export function consumeChallenge(id: string, serviceId: string, requestHash: string): ChallengeCheck {
  const c = challenges.get(id);
  if (!c) return { ok: false, reason: "unknown" };
  if (c.used) return { ok: false, reason: "replayed" };
  if (c.expiresAt < Date.now()) return { ok: false, reason: "expired" };
  if (c.serviceId !== serviceId) return { ok: false, reason: "service_mismatch" };
  if (c.requestHash !== requestHash) return { ok: false, reason: "request_mismatch" };
  c.used = true;
  return { ok: true, challenge: c };
}

// ─── Receipt ledger (SQLite) ─────────────────────────────────────────────────

const _insertReceipt = db.prepare(`
  INSERT OR IGNORE INTO receipts
    (id, challengeId, workspaceId, serviceId, serviceName, agentId,
     payerWallet, providerWallet, amount, currency, network, txHash,
     requestHash, status, errorCode, createdAt, paidAt, verifiedAt)
  VALUES
    (@id, @challengeId, @workspaceId, @serviceId, @serviceName, @agentId,
     @payerWallet, @providerWallet, @amount, @currency, @network, @txHash,
     @requestHash, @status, @errorCode, @createdAt, @paidAt, @verifiedAt)
`);

export function appendReceipt(r: Omit<Receipt, "id" | "createdAt"> & Partial<Pick<Receipt, "id" | "createdAt">>): Receipt {
  const receipt: Receipt = {
    id: r.id ?? "rcpt_" + randomUUID().replace(/-/g, "").slice(0, 20),
    createdAt: r.createdAt ?? new Date().toISOString(),
    ...r,
  } as Receipt;
  _insertReceipt.run({
    id: receipt.id,
    challengeId: receipt.challengeId,
    workspaceId: receipt.workspaceId,
    serviceId: receipt.serviceId,
    serviceName: receipt.serviceName,
    agentId: receipt.agentId,
    payerWallet: receipt.payerWallet,
    providerWallet: receipt.providerWallet,
    amount: receipt.amount,
    currency: receipt.currency,
    network: receipt.network,
    txHash: receipt.txHash ?? null,
    requestHash: receipt.requestHash,
    status: receipt.status,
    errorCode: receipt.errorCode ?? null,
    createdAt: receipt.createdAt,
    paidAt: receipt.paidAt ?? null,
    verifiedAt: receipt.verifiedAt ?? null,
  });
  for (const cb of receiptListeners) { try { cb(receipt); } catch { /* ignore listener errors */ } }
  return receipt;
}

export function listReceipts(filter?: { workspaceId?: string; serviceId?: string; agentId?: string }): Receipt[] {
  let sql = "SELECT * FROM receipts WHERE 1=1";
  const params: Record<string, string> = {};
  if (filter?.workspaceId) { sql += " AND workspaceId = @workspaceId"; params.workspaceId = filter.workspaceId; }
  if (filter?.serviceId)   { sql += " AND serviceId = @serviceId";     params.serviceId   = filter.serviceId; }
  if (filter?.agentId)     { sql += " AND agentId = @agentId";         params.agentId     = filter.agentId; }
  sql += " ORDER BY createdAt DESC LIMIT 500";
  return db.prepare(sql).all(params) as Receipt[];
}

export function receiptById(id: string): Receipt | undefined {
  return db.prepare("SELECT * FROM receipts WHERE id = ?").get(id) as Receipt | undefined;
}

export function receiptStats(): { total: number; today: number; uniqueAgents: number; avgAmount: number } {
  const total      = (db.prepare("SELECT COUNT(*) as n FROM receipts").get() as { n: number }).n;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today      = (db.prepare("SELECT COUNT(*) as n FROM receipts WHERE createdAt >= ?").get(todayStart.toISOString()) as { n: number }).n;
  const agents     = (db.prepare("SELECT COUNT(DISTINCT agentId) as n FROM receipts").get() as { n: number }).n;
  const avg        = (db.prepare("SELECT AVG(amount) as a FROM receipts").get() as { a: number | null }).a ?? 0;
  return { total, today, uniqueAgents: agents, avgAmount: Math.round(avg * 10000) / 10000 };
}

export type NftUpdateListener = (receiptId: string, tokenId: number, txHash: string) => void;
const nftListeners = new Set<NftUpdateListener>();
export function onNftUpdate(cb: NftUpdateListener): () => void {
  nftListeners.add(cb);
  return () => nftListeners.delete(cb);
}

export function updateReceiptNft(receiptId: string, tokenId: number, txHash: string): void {
  db.prepare("UPDATE receipts SET nftTokenId = ?, nftTxHash = ? WHERE id = ?").run(tokenId, txHash, receiptId);
  for (const cb of nftListeners) { try { cb(receiptId, tokenId, txHash); } catch { /* ignore */ } }
}
