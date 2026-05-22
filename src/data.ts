// Collector — imports per-workspace modules and assembles the shared arrays.
// To add a new workspace: create src/workspaces/<id>/index.ts and add one import line here.
import type { Agent, Receipt, Service } from "./types";
import type { WorkspaceId } from "./types";
import type { AgentRaw, SeedRow, SRaw } from "./workspaces/_types";

import {
  workspace as og,
  rawServices as ogSvcs,
  agentRaw as ogAgent,
  seedRows as ogRows,
  SEEDED_PINS,
} from "./workspaces/0g";
export type { SeededPin } from "./workspaces/0g";

import { workspace as mantle, rawServices as mantleSvcs, agentRaw as mantleAgent, seedRows as mantleRows } from "./workspaces/mantle";
import { workspace as arbitrum, rawServices as arbSvcs, agentRaw as arbAgent, seedRows as arbRows } from "./workspaces/arbitrum";
import { workspace as sui, rawServices as suiSvcs, agentRaw as suiAgent, seedRows as suiRows } from "./workspaces/sui";
import { workspace as qie, rawServices as qieSvcs, agentRaw as qieAgent, seedRows as qieRows } from "./workspaces/qie";
import { workspace as agora, rawServices as agoraSvcs, agentRaw as agoraAgent, seedRows as agoraRows } from "./workspaces/agora";
import { workspace as polygon, rawServices as polySvcs, agentRaw as polyAgent, seedRows as polyRows } from "./workspaces/polygon";
import { docs as ogDocs } from "./workspaces/0g/docs";
import { integrations as ogIntegrations } from "./workspaces/0g/integrations";
import { docs as agoraDocs } from "./workspaces/agora/docs";
import { integrations as agoraIntegrations } from "./workspaces/agora/integrations";
import type { DocsModule, IntegrationsModule } from "./workspaces/_docs";

export { SEEDED_PINS };

// ── Workspaces ──────────────────────────────────────────────────────────────

export const workspaces = [og, mantle, arbitrum, sui, qie, agora, polygon];

export const wsBySlug = (slug: string) => workspaces.find((w) => w.route === `/${slug}`);

// ── Docs & Integrations ──────────────────────────────────────────────────────
// Generic lookup: any workspace can opt in by adding an entry here. Only the 0G
// and Arc (agora) workspaces ship content today.

const DOCS: Partial<Record<WorkspaceId, DocsModule>> = {
  "0g": ogDocs,
  agora: agoraDocs,
};

const INTEGRATIONS: Partial<Record<WorkspaceId, IntegrationsModule>> = {
  "0g": ogIntegrations,
  agora: agoraIntegrations,
};

export const docsFor = (wsId: WorkspaceId): DocsModule | undefined => DOCS[wsId];
export const integrationsFor = (wsId: WorkspaceId): IntegrationsModule | undefined =>
  INTEGRATIONS[wsId];

// ── Services ────────────────────────────────────────────────────────────────

const LAT: Record<string, string> = {
  data: "380ms", inference: "820ms", storage: "290ms", analytics: "410ms",
  payment: "210ms", trading: "540ms", tax: "760ms", "game-intel": "470ms",
};
const priceStr = (n: number, cur: string) => `${n.toFixed(2)} ${cur}`;

const ALL_RAW: SRaw[] = [
  ...ogSvcs, ...mantleSvcs, ...arbSvcs, ...suiSvcs, ...qieSvcs, ...agoraSvcs, ...polySvcs,
];

export const services: Service[] = ALL_RAW.map((s) => ({
  ...s,
  workspaceIds: [s.workspaceId],
  price: priceStr(s.priceUsd, s.currency),
  latency: LAT[s.category] ?? "400ms",
}));

export const servicesFor = (wsId: WorkspaceId) => services.filter((s) => s.workspaceIds.includes(wsId));
export const serviceById = (id: string) => services.find((s) => s.id === id);

// ── Agents ──────────────────────────────────────────────────────────────────

const mkAgent = (a: AgentRaw): Agent => ({
  ...a,
  budget: `$${a.dailyLimitUsd.toFixed(2)}`,
  spent: `$${a.spentTodayUsd.toFixed(2)}`,
  maxPerRequest: `$${a.maxPerRequestUsd.toFixed(2)}`,
  status: a.autoPay ? "Ready" : "Paused",
});

export const agents: Agent[] = [
  mkAgent(ogAgent), mkAgent(qieAgent), mkAgent(arbAgent), mkAgent(mantleAgent),
  mkAgent(suiAgent), mkAgent(agoraAgent), mkAgent(polyAgent),
];

export const agentFor = (wsId: WorkspaceId) => agents.find((a) => a.workspaceId === wsId) ?? agents[0];
export const agent = agents[0];

// ── Receipts ─────────────────────────────────────────────────────────────────

const now = Date.now();
const iso = (mins: number) => new Date(now - mins * 60000).toISOString();

let rc = 4000;
let sc = 7000;
export const makeReceiptId = () => `rcpt_${(rc++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const makeServiceId = () => `svc_usr_${(sc++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const makeTxHash = () =>
  `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;

const ALL_SEED_ROWS: SeedRow[] = [
  ...ogRows, ...qieRows, ...arbRows, ...mantleRows, ...suiRows, ...agoraRows, ...polyRows,
];

function seedReceipts(): Receipt[] {
  return ALL_SEED_ROWS.flatMap((p, i) => {
    const svc = serviceById(p.svc);
    const ag = agents.find((a) => a.id === p.agent);
    if (!svc || !ag) return [];
    const settled = p.status === "verified" || p.status === "paid";
    return [{
      id: `rcpt_seed${i.toString().padStart(2, "0")}`,
      workspaceId: p.ws,
      serviceId: svc.id,
      serviceName: p.name ?? svc.name,
      agentName: ag.name,
      payerWallet: ag.wallet,
      providerWallet: svc.providerWallet,
      amount: svc.priceUsd,
      currency: svc.currency,
      network: svc.network,
      txHash: settled ? makeTxHash() : undefined,
      status: p.status,
      createdAt: iso(p.mins),
      errorCode: p.err,
      kind: p.kind,
      payload: p.payload,
    }];
  });
}

const HARDCODED_0G: Receipt[] = [
  { id: "rcpt_0g_h01", workspaceId: "0g", serviceId: "svc_0g_inference", serviceName: "0G Inference Risk Report",    agentName: "0G Compute Agent", payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", providerWallet: "0xF4BFd93061B160Fa376c7F66De207a00225B4e70", amount: 0.03, currency: "USDC", network: "0g-galileo", txHash: makeTxHash(), status: "verified", createdAt: iso(3),   kind: "0g.inference",    payload: { model: "risk-scorer-v2", attestationId: "att_0g_3f9c2a", ogCompute: true, response: '{"riskScore":41,"label":"low"}' } },
  { id: "rcpt_0g_h02", workspaceId: "0g", serviceId: "svc_0g_storage",   serviceName: "0G Storage Memory Write",    agentName: "0G Compute Agent", payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", providerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", amount: 0.02, currency: "USDC", network: "0g-galileo", txHash: makeTxHash(), status: "verified", createdAt: iso(11),  kind: "0g.storage.pin", payload: { root: "0x9f2c8b4e1d3a7f60aa91bc54de2081cf44e3d0b", size: 3072, merkleComputed: true, onChain: true } },
  { id: "rcpt_0g_h03", workspaceId: "0g", serviceId: "svc_0g_inference", serviceName: "Trading Arena · ETH/USDC",   agentName: "0G Compute Agent", payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", providerWallet: "0xF4BFd93061B160Fa376c7F66De207a00225B4e70", amount: 0.03, currency: "USDC", network: "0g-galileo", txHash: makeTxHash(), status: "verified", createdAt: iso(24),  kind: "0g.trading.signal", payload: { pair: "ETH/USDC", signal: "BUY", confidence: 87, attestationId: "att_0g_c71a8b", sealed: true } },
  { id: "rcpt_0g_h04", workspaceId: "0g", serviceId: "svc_0g_dav",       serviceName: "0G DA Verify",               agentName: "0G Compute Agent", payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", providerWallet: "0xF4BFd93061B160Fa376c7F66De207a00225B4e70", amount: 0.015, currency: "USDC", network: "0g-galileo", txHash: makeTxHash(), status: "verified", createdAt: iso(38),  kind: "0g.da.verify",   payload: { segment: 7, ok: true, root: "0x77da11c2e4a3f90b" } },
  { id: "rcpt_0g_h05", workspaceId: "0g", serviceId: "svc_0g_context",   serviceName: "0G Privacy · TEE Execution", agentName: "0G Compute Agent", payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", providerWallet: "0xF4BFd93061B160Fa376c7F66De207a00225B4e70", amount: 0.018, currency: "USDC", network: "0g-galileo", txHash: makeTxHash(), status: "verified", createdAt: iso(55),  kind: "0g.privacy.tee", payload: { attestationId: "att_0g_e20f91", teeQuote: "SGX_QUOTE:v3·E20F91·verified" } },
  { id: "rcpt_0g_h06", workspaceId: "0g", serviceId: "svc_0g_batch",     serviceName: "0G Compute Batch Job",       agentName: "0G Compute Agent", payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", providerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", amount: 0.09, currency: "USDC", network: "0g-galileo", txHash: makeTxHash(), status: "paid",     createdAt: iso(72),  kind: "0g.inference",   payload: { model: "risk-scorer-v2", prompts: 24, batchId: "batch_0g_31a", avgMs: 608 } },
  { id: "rcpt_0g_h07", workspaceId: "0g", serviceId: "svc_0g_storage",   serviceName: "0G Storage Memory Write",    agentName: "0G Compute Agent", payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", providerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", amount: 0.02, currency: "USDC", network: "0g-galileo", txHash: makeTxHash(), status: "verified", createdAt: iso(94),  kind: "0g.storage.pin", payload: { root: "0x2d9e4c1b8a7f3e06c55d1b09ea4720fc1a2b3c4d", size: 8192, merkleComputed: true } },
  { id: "rcpt_0g_h08", workspaceId: "0g", serviceId: "svc_0g_inference", serviceName: "0G Inference Risk Report",   agentName: "0G Compute Agent", payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71", providerWallet: "0xF4BFd93061B160Fa376c7F66De207a00225B4e70", amount: 0.03, currency: "USDC", network: "0g-galileo", txHash: makeTxHash(), status: "verified", createdAt: iso(130), kind: "0g.inference",   payload: { model: "wallet-labeler", attestationId: "att_0g_7d4c01", response: '{"label":"defi-power-user","score":91}' } },
];

export const initialReceipts: Receipt[] = [...HARDCODED_0G, ...seedReceipts()];

// ── Metrics ──────────────────────────────────────────────────────────────────

export function workspaceMetrics(wsId: WorkspaceId, receipts: Receipt[]) {
  const rs = receipts.filter((r) => r.workspaceId === wsId);
  const verified = rs.filter((r) => r.status === "verified" || r.status === "paid");
  const failed = rs.filter((r) => r.status === "failed" || r.status === "replayed" || r.status === "expired");
  const revenue = verified.reduce((s, r) => s + r.amount, 0);
  const svcCount = servicesFor(wsId).filter((s) => s.status === "active").length;
  const agCount = agents.filter((a) => a.workspaceId === wsId && a.status === "Ready").length;
  return { requests: rs.length, paid: verified.length, failed: failed.length, revenue, svcCount, agCount };
}
