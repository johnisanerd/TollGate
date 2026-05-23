import type { ComponentType, ReactNode } from "react";
import type { ReceiptStatus, WorkspaceId, Service, Receipt, Workspace } from "../types";

export type SRaw = {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  provider: string;
  providerWallet: string;
  category: string;
  priceUsd: number;
  currency: string;
  network: string;
  description: string;
  sampleIn: string;
  response: string;
  status: "active" | "paused";
  calls: number;
  lastPaid?: string;
};

export type AgentRaw = {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  wallet: string;
  autoPay: boolean;
  dailyLimitUsd: number;
  maxPerRequestUsd: number;
  spentTodayUsd: number;
  allowlist: string[];
};

export type SeedRow = {
  ws: WorkspaceId;
  svc: string;
  agent: string;
  mins: number;
  status: ReceiptStatus;
  err?: string;
  kind?: string;
  payload?: Record<string, unknown>;
  name?: string;
};

// ── Workspace UI types (used by each workspace's widgets.tsx) ─────────────────

export type SigBlock = {
  title: string;
  sub: string;
  headers: string[];
  rows: (string | number)[][];
  accentCol: number;
};

export type CardDef = {
  ico: ComponentType<{ width?: number; height?: number }>;
  title: string;
  sub?: string;
  light?: boolean;
  link?: string;
  onLink?: () => void;
  onClick: () => void;
  accent?: string;
  metric?: string;
  detail?: string;
};

export type CardCtx = {
  onGoTab: (t: string) => boolean;
  onOpenPayment: (s: Service) => void;
  wsReceipts: Receipt[];
  def: Service | undefined;
  onGoReceipts: () => void;
};

// ── Context types for workspace render functions (tabs, overviews) ──────────────

export interface TabCtx {
  workspace: Workspace;
  services: Service[];
  receipts: Receipt[];
  onOpenPayment: (s: Service) => void;
  onGoTab: (t: string) => boolean;
  onGoReceipts: () => void;
}

export interface OverviewCtx {
  workspace: Workspace;
  onGoTab: (t: string) => boolean;
  onGoReceipts: () => void;
}

export interface TabMeta {
  title: string;
  sub: string;
  intent: string;
  proof: string;
}
