import type React from "react";

export type Theme = "light" | "dark";

export type WorkspaceId =
  | "0g"
  | "qie"
  | "arbitrum"
  | "mantle"
  | "sui"
  | "agora"
  | "polygon";

export type PaymentStage =
  | "required"
  | "paying"
  | "verifying"
  | "approved"
  | "unlocked";

export type ReceiptStatus =
  | "verified"
  | "paid"
  | "failed"
  | "replayed"
  | "expired"
  | "pending";

export type Workspace = {
  id: WorkspaceId;
  shortName: string;
  name: string;
  route: string;
  pitch: string;
  tags: string[];
  networks: string[];
  tabs: string[];
  accent: string;
  darkAccent: string;
  overviewClass: string;
  overviewAccents: string[];
  Icon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>;
};

export type Service = {
  id: string;
  workspaceIds: WorkspaceId[];
  name: string;
  provider: string;
  providerWallet: string;
  category: string;
  price: string;
  priceUsd: number;
  currency: string;
  network: string;
  description: string;
  sampleIn: string;
  response: string;
  latency: string;
  calls: number;
  status: "active" | "paused";
  lastPaid?: string;
};

export type Agent = {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  wallet: string;
  budget: string;
  spent: string;
  maxPerRequest: string;
  status: "Ready" | "Paused";
  autoPay: boolean;
  dailyLimitUsd: number;
  maxPerRequestUsd: number;
  spentTodayUsd: number;
  allowlist: string[];
};

export type Receipt = {
  id: string;
  workspaceId: WorkspaceId;
  serviceId: string;
  serviceName: string;
  agentName: string;
  payerWallet: string;
  providerWallet: string;
  amount: number;
  currency: string;
  network: string;
  txHash?: string;
  status: ReceiptStatus;
  createdAt: string;
  errorCode?: string;
  /** Domain-specific category for filtering ("0g.inference", "0g.pin", "qie.checkout", ...). */
  kind?: string;
  /** Action widget input/output payload (prompt+response, hash, escrow state, etc.). */
  payload?: Record<string, unknown>;
};
