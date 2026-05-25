import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  CircleDollarSign,
  Code2,
  Copy,
  Download,
  Eye,
  FileText,
  Gauge,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import type { Workspace } from "../../../types";
import { useAppState } from "../../../app-state";
import { getAgoraConfig } from "../../../lib/agora";
import { JobLifecycleViewer } from "./JobLifecycleViewer";
import {
  buildActionDisclosure,
  buildControlSnapshot,
  createInitialControlState,
  decideFromSources,
  type AgentAction,
  type ControlExecution,
  type ControlFundingMode,
  type ControlPosition,
  type ControlReceipt,
  type ControlSource,
  type ControlState,
  type ControlStrategy,
} from "../../../workspaces/agora/control";

const envRecord = import.meta.env as Record<string, string | boolean | undefined>;
const SERVER = typeof envRecord["VITE_SERVER_URL"] === "string" && envRecord["VITE_SERVER_URL"].trim()
  ? envRecord["VITE_SERVER_URL"]
  : envRecord["DEV"] ? "http://127.0.0.1:8787" : "";
const CONTROL_API = SERVER ? `${SERVER.replace(/\/+$/, "")}/api/arc/control` : "";
const ARC_AGENT_TREASURY_ADDRESS = typeof envRecord["VITE_ARC_AGENT_TREASURY_ADDRESS"] === "string" ? envRecord["VITE_ARC_AGENT_TREASURY_ADDRESS"] : "0x4Cf79c89cFd85F788f6A0d8A27e0552902622869";
const ARC_STRATEGY_VAULT_ADDRESS = typeof envRecord["VITE_ARC_STRATEGY_VAULT_ADDRESS"] === "string" ? envRecord["VITE_ARC_STRATEGY_VAULT_ADDRESS"] : "0xdBB4b61fC5Cbc2A456d56aFfF79a27e5155106d0";
const ARC_RISK_GUARD_ADDRESS = typeof envRecord["VITE_ARC_RISK_GUARD_ADDRESS"] === "string" ? envRecord["VITE_ARC_RISK_GUARD_ADDRESS"] : "0x0F066C8280E67F88B1c7959595E229541aFc531c";

function defaultSources(): ControlSource[] {
  return [
    {
      id: "market_price",
      label: "Market Price",
      group: "market",
      status: "unavailable",
      costUsd: 0,
      payer: "free_public",
      contribution: 0,
      signal: "Waiting for Hyperliquid / Binance / Coinbase ETH price.",
      lastUpdated: "not loaded",
    },
    {
      id: "oi_funding",
      label: "OI / Funding",
      group: "derivatives",
      status: "unavailable",
      costUsd: 0.002,
      payer: "agent_treasury",
      contribution: 0,
      signal: "Waiting for Hyperliquid open-interest and funding context.",
      lastUpdated: "not loaded",
    },
    {
      id: "prediction_context",
      label: "Prediction Context",
      group: "prediction",
      status: "unavailable",
      costUsd: 0,
      payer: "free_public",
      contribution: 0,
      signal: "Polymarket/Gamma context unavailable until refresh succeeds.",
      lastUpdated: "not loaded",
    },
    {
      id: "social_news",
      label: "Social / News",
      group: "social",
      status: "needs_key",
      costUsd: 0.005,
      payer: "agent_treasury",
      contribution: 0,
      signal: "Requires Apify-backed public source layer. Missing keys stay visible.",
      lastUpdated: "not loaded",
    },
    {
      id: "leader_feed",
      label: "Verified Leader Feed",
      group: "leader",
      status: "unavailable",
      costUsd: 0,
      payer: "free_public",
      contribution: 0,
      signal: "No verified leader feed configured. SignalGuard mode is used; no invented leaders.",
      lastUpdated: "not configured",
    },
    {
      id: "developer_paid_source",
      label: "Developer Paid Source",
      group: "developer",
      status: "unavailable",
      costUsd: 0.01,
      payer: "agent_treasury",
      contribution: 0,
      signal: "Developer paid source requires a live x402 endpoint before it can be used.",
      lastUpdated: "not configured",
    },
  ];
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? v as Record<string, unknown> : {};
}

function copyText(value: unknown): void {
  const text = String(value ?? "");
  if (!text) return;
  void navigator.clipboard?.writeText(text);
}

function CopyFeedbackButton({ text, label, icon }: { text: string; label: string; icon: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton tone="soft" onClick={() => {
      void navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }}>
      {icon} {copied ? "Copied!" : label}
    </ActionButton>
  );
}

function useWalletStatus() {
  const [wallet, setWallet] = useState<{ connected: boolean; address?: string; chainId?: string; arcReady: boolean }>({
    connected: false,
    arcReady: false,
  });
  useEffect(() => {
    let cancelled = false;
    const eth = (window as unknown as { ethereum?: { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    async function load() {
      if (!eth?.request) return;
      try {
        const accounts = await eth.request({ method: "eth_accounts" });
        const chainId = await eth.request({ method: "eth_chainId" });
        const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : undefined;
        const chain = typeof chainId === "string" ? chainId : undefined;
        if (!cancelled) setWallet({ connected: Boolean(address), address, chainId: chain, arcReady: chain?.toLowerCase() === "0x4cef52" });
      } catch {
        if (!cancelled) setWallet({ connected: false, arcReady: false });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);
  return wallet;
}

function amountToWeiHex(amountUsd: number): string {
  const scaled = BigInt(Math.max(0, Math.round(amountUsd * 1_000_000))) * 1_000_000_000_000n;
  return `0x${scaled.toString(16)}`;
}

async function sendArcTransaction(to: string | undefined, amountUsd = 0, data?: string): Promise<{ txHash: string; walletAddress: string }> {
  const eth = (window as unknown as { ethereum?: { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!eth?.request) throw new Error("wallet_not_connected");
  if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) throw new Error("contract_missing");
  const accounts = await eth.request({ method: "eth_requestAccounts" });
  const walletAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (!walletAddress) throw new Error("wallet_not_connected");
  const txHash = await eth.request({
    method: "eth_sendTransaction",
    params: [{ from: walletAddress, to, value: amountToWeiHex(amountUsd), ...(data ? { data } : {}) }],
  });
  if (typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error("tx_failed");
  return { txHash, walletAddress };
}

function encodeUint256(amountUsd: number): string {
  return amountToWeiHex(amountUsd).slice(2).padStart(64, "0");
}

function encodeAddress(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("wallet_not_connected");
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function sourceGroup(v: unknown): ControlSource["group"] {
  const value = String(v ?? "");
  if (value === "market_price") return "market";
  if (value === "oi_funding") return "derivatives";
  if (value === "prediction_context") return "prediction";
  if (value === "social_news") return "social";
  if (value === "leader_feed") return "leader";
  return "developer";
}

function adaptServerState(raw: unknown, fallback: ControlState): ControlState {
  const server = asRecord(raw);
  const fallbackByStrategy = new Map(fallback.strategies.map((strategy) => [strategy.id, strategy]));
  const rawStrategies = Array.isArray(server["strategies"]) ? server["strategies"] as Record<string, unknown>[] : [];
  const strategies: ControlStrategy[] = rawStrategies.length
    ? rawStrategies.map((strategy) => {
      const id = String(strategy["id"]) as ControlStrategy["id"];
      const local = fallbackByStrategy.get(id);
      return {
        id,
        name: String(strategy["name"] ?? local?.name ?? id),
        summary: local?.summary ?? String(strategy["summary"] ?? strategy["lastAction"] ?? ""),
        enabled: strategy["enabled"] === true || strategy["status"] === "enabled",
        requiredSources: Array.isArray(strategy["requiredSources"]) ? strategy["requiredSources"].map(String) : local?.requiredSources ?? [],
        expectedCostUsd: Number(strategy["expectedCostUsd"] ?? local?.expectedCostUsd ?? 0),
        risk: (strategy["risk"] ?? strategy["riskLevel"] ?? local?.risk ?? "medium") as ControlStrategy["risk"],
        lastAction: String(strategy["lastAction"] ?? local?.lastAction ?? ""),
      };
    })
    : fallback.strategies;
  return {
    ...fallback,
    budget: { ...fallback.budget, ...asRecord(server["budget"]) },
    policy: { ...fallback.policy, ...asRecord(server["policy"]) },
    strategies,
    executionQueue: Array.isArray(server["executions"]) ? server["executions"] as ControlExecution[] : fallback.executionQueue,
    positions: Array.isArray(server["positions"]) ? server["positions"] as ControlPosition[] : fallback.positions,
    receipts: Array.isArray(server["receipts"]) ? server["receipts"] as ControlReceipt[] : fallback.receipts,
  };
}

function adaptServerSources(raw: unknown, fallback: ControlSource[]): ControlSource[] {
  const arr = Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
  if (!arr.length) return fallback;
  return arr.map((source) => ({
    id: String(source["id"] ?? ""),
    label: String(source["label"] ?? source["id"] ?? "Source"),
    group: sourceGroup(source["group"]),
    status: (source["status"] ?? "unavailable") as ControlSource["status"],
    costUsd: Number(source["costUsd"] ?? 0),
    payer: (source["payer"] ?? "free_public") as ControlSource["payer"],
    contribution: Number(source["contribution"] ?? 0),
    signal: String(source["signal"] ?? ""),
    lastUpdated: String(source["lastUpdated"] ?? "not loaded"),
  }));
}

async function getControl(path: string): Promise<Record<string, unknown> | null> {
  if (!CONTROL_API) return null;
  try {
    const res = await fetch(`${CONTROL_API}${path}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function postControl(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!CONTROL_API) return null;
  try {
    const res = await fetch(`${CONTROL_API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` })) as Record<string, unknown>;
    if (!res.ok) return { ok: false, status: "failed", reason: String(payload["error"] ?? `http_${res.status}`), ...payload };
    return payload;
  } catch {
    return { ok: false, status: "failed", reason: "control_api_unreachable" };
  }
}

function useControl(workspace: Workspace) {
  const [state, setState] = useState<ControlState>(() => createInitialControlState("agora"));
  useEffect(() => {
    let cancelled = false;
    void getControl("/status").then((data) => {
      if (cancelled || !data?.["state"]) return;
      setState((current) => adaptServerState(data["state"], current));
    });
    return () => { cancelled = true; };
  }, [setState, workspace.id]);
  return [state, setState] as const;
}

function useSources(workspace: Workspace) {
  const [sources, setSources] = useState<ControlSource[]>(() => defaultSources());
  useEffect(() => {
    let cancelled = false;
    void getControl("/sources").then((data) => {
      if (cancelled || !data?.["sources"]) return;
      setSources((current) => adaptServerSources(data["sources"], current));
    });
    return () => { cancelled = true; };
  }, [setSources, workspace.id]);
  return [sources, setSources] as const;
}

function money(v: number): string {
  return `$${v.toFixed(v < 1 ? 4 : 2)}`;
}

function shortHash(value?: string | null, head = 8, tail = 6): string {
  if (!value) return "not set";
  return value.length > head + tail + 3 ? `${value.slice(0, head)}...${value.slice(-tail)}` : value;
}

function toneForStatus(status: string): string {
  if (["live", "active", "completed", "passed"].includes(status)) return "#20e3b2";
  if (["stale", "needs_key", "watch", "paused"].includes(status)) return "#facc15";
  if (["blocked", "failed", "unavailable", "empty", "exit"].includes(status)) return "#fb7185";
  return "#93c5fd";
}

type ActionNoticeTone = "info" | "success" | "warning" | "danger";
type ActionNotice = { tone: ActionNoticeTone; title: string; body: string };

function noticeColor(tone: ActionNoticeTone): string {
  if (tone === "success") return "#20e3b2";
  if (tone === "warning") return "#facc15";
  if (tone === "danger") return "#fb7185";
  return "#60a5fa";
}

function reasonText(reason?: unknown): string {
  const value = typeof reason === "string" ? reason : "";
  const known: Record<string, string> = {
    control_api_unreachable: "Control API did not respond. Start the backend or check VITE_SERVER_URL.",
    live_tx_required: "A live wallet transaction is required. Nothing was written because no confirmed tx hash was received.",
    wallet_not_connected: "Connect an Arc Testnet wallet first.",
    wallet_rejected: "Wallet request was cancelled or rejected. No funds moved.",
    tx_failed: "The wallet transaction failed. No product state was changed.",
    sourceId_required: "Source id is missing.",
    action_required: "Action id is missing.",
    executionId_required: "Execution id is missing.",
    strategyId_required: "Strategy id is missing.",
  };
  return known[value] ?? (value ? value.replace(/_/g, " ") : "The action did not complete.");
}

function remoteNotice(label: string, remote: Record<string, unknown> | null): ActionNotice {
  if (!remote) return { tone: "danger", title: `${label} failed`, body: "Control API returned no response. Nothing changed." };
  const receipt = asRecord(remote["receipt"]);
  const execution = asRecord(remote["execution"]);
  const status = String(remote["status"] ?? "");
  const receiptAction = String(receipt["action"] ?? "");
  const receiptStatus = String(receipt["liveStatus"] ?? "");
  const executionStatus = String(execution["status"] ?? "");
  const auditOnly = remote["ok"] === true && ["DECISION_REJECT", "EXECUTION_CANCEL"].includes(receiptAction);
  if (auditOnly) {
    const receiptId = typeof receipt["id"] === "string" ? ` Receipt: ${shortHash(receipt["id"], 10, 5)}.` : "";
    return {
      tone: "success",
      title: `${label} recorded`,
      body: `Audit event recorded through the Control API.${receiptId} No hidden retry ran and no funds moved.`,
    };
  }
  const failed = remote["ok"] === false || status === "blocked" || status === "failed" || receiptStatus === "blocked" || executionStatus === "blocked" || executionStatus === "failed";
  const reason = remote["reason"] ?? execution["failureReason"] ?? (receiptStatus === "blocked" ? "live_tx_required" : "");
  if (failed) {
    return {
      tone: status === "failed" || executionStatus === "failed" ? "danger" : "warning",
      title: `${label} blocked`,
      body: `${reasonText(reason)} No hidden retry ran and no funds moved.`,
    };
  }
  const receiptId = typeof receipt["id"] === "string" ? ` Receipt: ${shortHash(receipt["id"], 10, 5)}.` : "";
  const execId = typeof execution["id"] === "string" ? ` Execution: ${shortHash(execution["id"], 10, 5)}.` : "";
  return { tone: "success", title: `${label} complete`, body: `State updated through the Control API.${receiptId}${execId}` };
}

function ActionFeedback({ notice, onClose }: { notice: ActionNotice | null; onClose?: () => void }) {
  if (!notice) return null;
  const color = noticeColor(notice.tone);
  return (
    <div style={{ border: `1px solid ${color}35`, background: `${color}12`, borderRadius: 14, padding: "12px 13px", margin: "12px 0", display: "flex", gap: 10, alignItems: "flex-start", color: "#cbd5e1" }}>
      <div style={{ width: 9, height: 9, borderRadius: 999, background: color, boxShadow: `0 0 18px ${color}66`, marginTop: 5, flex: "0 0 auto" }} />
      <div style={{ flex: 1 }}>
        <div style={{ color: "#fff", fontWeight: 900, marginBottom: 3 }}>{notice.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.45 }}>{notice.body}</div>
      </div>
      {onClose && <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0 }}><X size={16} /></button>}
    </div>
  );
}

function panelStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    border: "1px solid rgba(96,165,250,0.20)",
    background: "linear-gradient(145deg, rgba(8,13,25,0.94), rgba(10,18,32,0.82))",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 24px 80px rgba(0,0,0,0.32)",
    ...extra,
  };
}

function SectionTitle({ icon, title, sub, right }: { icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 38, height: 38, borderRadius: 13, background: "rgba(22,82,240,0.20)", border: "1px solid rgba(96,165,250,0.25)", display: "grid", placeItems: "center", color: "#60a5fa" }}>
          {icon}
        </div>
        <div>
          <h3 style={{ margin: 0, color: "#fff", fontSize: 18, letterSpacing: "-0.01em" }}>{title}</h3>
          {sub && <p style={{ margin: "4px 0 0", color: "#9fb0c8", fontSize: 13, lineHeight: 1.45 }}>{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span style={{ color: toneForStatus(value), background: `${toneForStatus(value)}18`, border: `1px solid ${toneForStatus(value)}35`, borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", display: "inline-flex", alignItems: "center", width: "fit-content", height: "fit-content", lineHeight: 1, alignSelf: "flex-start", whiteSpace: "nowrap" }}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function ActionButton({ children, onClick, tone = "primary", disabled = false }: { children: React.ReactNode; onClick: () => void; tone?: "primary" | "soft" | "danger"; disabled?: boolean }) {
  const bg = tone === "danger" ? "linear-gradient(135deg,#ef4444,#b91c1c)" : tone === "soft" ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#20e3b2,#1652f0)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: tone === "soft" ? "1px solid rgba(255,255,255,0.12)" : "none",
        borderRadius: 12,
        padding: "10px 13px",
        color: disabled ? "#64748b" : "#fff",
        background: disabled ? "rgba(255,255,255,0.04)" : bg,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 800,
        fontSize: 12,
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

function FactGrid({ items }: { items: Array<{ label: string; value: string; tone?: string }> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
      {items.map((item) => (
        <div key={item.label} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.045)", borderRadius: 14, padding: 12 }}>
          <div style={{ color: "#7f8ea3", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 900 }}>{item.label}</div>
          <div style={{ color: item.tone ?? "#eaf2ff", fontSize: 16, fontWeight: 900, marginTop: 6 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function DisclosureBox({ state, input }: { state: ControlState; input: Parameters<typeof buildActionDisclosure>[1] }) {
  const d = buildActionDisclosure(state, input);
  return (
    <div style={{ border: `1px solid ${toneForStatus(d.liveStatus)}30`, background: `${toneForStatus(d.liveStatus)}12`, borderRadius: 14, padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, fontSize: 12, color: "#cbd5e1" }}>
      <div><b style={{ color: "#fff" }}>Payer:</b> {d.payer.replace(/_/g, " ")}</div>
      <div><b style={{ color: "#fff" }}>Amount:</b> {money(d.amountUsd)}</div>
      <div><b style={{ color: "#fff" }}>Signature:</b> {d.requiresSignature ? "required" : "not required"}</div>
      <div><b style={{ color: "#fff" }}>Status:</b> <span style={{ color: toneForStatus(d.liveStatus) }}>{d.liveStatus}</span></div>
      <div style={{ gridColumn: "1 / -1", color: "#9fb0c8" }}><b style={{ color: "#fff" }}>Cancel:</b> {d.onCancel}</div>
      <div style={{ gridColumn: "1 / -1", color: "#9fb0c8" }}>{d.onFail}</div>
      {d.refundPath && <div style={{ gridColumn: "1 / -1", color: "#94a3b8" }}><b style={{ color: "#fff" }}>Refund/Review:</b> {d.refundPath}</div>}
    </div>
  );
}

function strategyActionFor(strategy: ControlStrategy): AgentAction {
  return strategy.id === "arbwatcher" ? "RUN_ARB_CHECK" : "BUILD_DECISION";
}

function riskTone(risk: ControlStrategy["risk"]): string {
  return risk === "high" ? "#fb7185" : risk === "medium" ? "#facc15" : "#20e3b2";
}

function StrategyFundingStrip({ state, strategy }: { state: ControlState; strategy: ControlStrategy }) {
  const disclosure = buildActionDisclosure(state, {
    action: strategyActionFor(strategy),
    amountUsd: strategy.expectedCostUsd,
    fundingMode: strategy.expectedCostUsd > 0 ? "agent_treasury" : "free_public",
    strategyId: strategy.id,
  });
  return (
    <div
      style={{
        border: `1px solid ${toneForStatus(disclosure.liveStatus)}2f`,
        background: `linear-gradient(135deg, ${toneForStatus(disclosure.liveStatus)}12, rgba(255,255,255,0.035))`,
        borderRadius: 14,
        padding: 12,
        display: "grid",
        gridTemplateColumns: "repeat(3,minmax(0,1fr))",
        gap: 10,
        color: "#cbd5e1",
        fontSize: 12,
      }}
    >
      <div>
        <div style={{ color: "#7f8ea3", fontSize: 9, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase" }}>Payer</div>
        <b style={{ color: "#f8fafc" }}>{disclosure.payer.replace(/_/g, " ")}</b>
      </div>
      <div>
        <div style={{ color: "#7f8ea3", fontSize: 9, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase" }}>Run cost</div>
        <b style={{ color: "#f8fafc" }}>{money(disclosure.amountUsd)}</b>
      </div>
      <div>
        <div style={{ color: "#7f8ea3", fontSize: 9, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase" }}>Gate</div>
        <b style={{ color: toneForStatus(disclosure.liveStatus) }}>{disclosure.liveStatus}</b>
      </div>
      <div style={{ gridColumn: "1 / -1", color: "#98a9c2", lineHeight: 1.45 }}>
        {disclosure.liveStatus === "live"
          ? "Can run when required sources stay fresh and Risk Guard allows the proposed action."
          : disclosure.onFail}
      </div>
    </div>
  );
}

export function ArcControlStartWidget({ workspace, onGoTab }: { workspace: Workspace; onGoTab?: (tab: string) => boolean }) {
  const [state] = useControl(workspace);
  const [sources] = useSources(workspace);
  const wallet = useWalletStatus();
  const snapshot = useMemo(() => buildControlSnapshot(state, sources), [state, sources]);
  const activeStrategies = state.strategies.filter((strategy) => strategy.enabled).map((strategy) => strategy.name).join(", ") || "none";
  const latestReceipt = state.receipts[0];
  return (
    <div style={panelStyle({ background: "radial-gradient(circle at 10% 0%, rgba(32,227,178,0.18), transparent 32%), radial-gradient(circle at 82% 18%, rgba(22,82,240,0.24), transparent 36%), rgba(8,13,25,0.94)" })}>
      <SectionTitle
        icon={<Shield size={18} />}
        title="ArcMind Control Layer"
        sub="Give an AI market agent a USDC budget, risk limits, approved sources, and proof-backed execution on Arc."
        right={<StatusPill value={snapshot.budget.status} />}
      />
      <FactGrid items={[
        { label: "Wallet", value: wallet.connected ? shortHash(wallet.address, 6, 4) : "not connected", tone: wallet.connected ? "#20e3b2" : "#facc15" },
        { label: "Arc Testnet", value: wallet.arcReady ? "ready" : "switch needed", tone: wallet.arcReady ? "#20e3b2" : "#facc15" },
        { label: "Agent Budget", value: money(snapshot.budget.balanceUsd - snapshot.budget.spendTodayUsd), tone: snapshot.budget.balanceUsd > 0 ? "#20e3b2" : "#facc15" },
        { label: "Active Strategy", value: activeStrategies, tone: "#93c5fd" },
        { label: "Latest Action", value: snapshot.decision.action.replace(/_/g, " "), tone: toneForStatus(snapshot.decision.riskGate) },
        { label: "Decision Mode", value: snapshot.decision.strategyId === "signalguard" ? "SignalGuard" : "CopyGuard", tone: "#93c5fd" },
      ]} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 14 }}>
        {["Fund agent", "Allow sources", "Enable strategy", "Review decision", "Manage position"].map((step, index) => (
          <div key={step} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", borderRadius: 13, padding: 10 }}>
            <div style={{ color: "#60a5fa", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Step {index + 1}</div>
            <div style={{ color: "#fff", fontWeight: 900, marginTop: 4 }}>{step}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.045)", borderRadius: 14, padding: 14, color: "#cbd5e1", fontSize: 13 }}>
        <b style={{ color: "#fff" }}>Next:</b> {snapshot.nextStep}
      </div>
      <div style={{ marginTop: 10, border: "1px solid rgba(96,165,250,0.16)", background: "rgba(22,82,240,0.06)", borderRadius: 14, padding: 12, color: "#cbd5e1", fontSize: 12, lineHeight: 1.45 }}>
        <b style={{ color: "#fff" }}>Latest receipt:</b>{" "}
        {latestReceipt
          ? `${latestReceipt.action.replace(/_/g, " ")} · ${latestReceipt.fundingMode.replace(/_/g, " ")} · ${latestReceipt.liveStatus}`
          : "No control receipts yet. Budget, source, decision, strategy and risk actions will appear here."}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <ActionButton tone="soft" onClick={() => void (window as unknown as { ethereum?: { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum?.request?.({ method: "eth_requestAccounts" })}><Wallet size={15} /> Connect Wallet</ActionButton>
        <ActionButton tone="soft" onClick={() => void (window as unknown as { ethereum?: { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum?.request?.({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x4cef52" }] })}><RefreshCw size={15} /> Switch to Arc Testnet</ActionButton>
        <ActionButton onClick={() => onGoTab?.("Agent Budget")}><Wallet size={15} /> Create Agent Budget</ActionButton>
        <ActionButton tone="soft" onClick={() => onGoTab?.("Strategies")}><SlidersHorizontal size={15} /> Choose Strategy</ActionButton>
        <ActionButton tone="soft" onClick={() => onGoTab?.("Decision Room")}><Gauge size={15} /> Review Decision</ActionButton>
      </div>
    </div>
  );
}

export function ArcControlBudgetWidget({ workspace }: { workspace: Workspace }) {
  const [state, setState] = useControl(workspace);
  const [sources] = useSources(workspace);
  const [topUp, setTopUp] = useState("1");
  const [dailyCap, setDailyCap] = useState(String(state.budget.dailyCapUsd));
  const [maxCall, setMaxCall] = useState(String(state.budget.maxPerCallUsd));
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const remaining = Math.max(0, state.budget.dailyCapUsd - state.budget.spendTodayUsd);
  const spendLog = state.executionQueue.filter((exec) => exec.fundingMode === "agent_treasury" || exec.amountUsd > 0).slice(0, 6);

  async function topUpBudget() {
    const amount = Math.max(0, Number(topUp) || 0);
    if (amount <= 0) {
      setNotice({ tone: "warning", title: "Top-up blocked", body: "Enter an amount greater than 0 before opening the wallet transaction." });
      return;
    }
    let tx: { txHash: string; walletAddress: string } | null = null;
    try {
      setNotice({ tone: "info", title: "Waiting for wallet signature", body: "Confirm the live ArcAgentTreasury transaction. The budget updates only after a tx hash is returned." });
      tx = await sendArcTransaction(ARC_AGENT_TREASURY_ADDRESS, amount);
    } catch {
      tx = null;
      setNotice({ tone: "warning", title: "Wallet transaction not completed", body: "No live tx hash was returned. The backend will block the top-up and leave Agent Budget unchanged." });
    }
    const remote = await postControl("/budget/top-up", { amountUsd: amount, ...tx });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Top up Agent Budget", remote));
  }

  async function saveCaps() {
    setNotice({ tone: "info", title: "Saving budget caps", body: "Updating daily cap and max-per-call policy through the Control API." });
    const remote = await postControl("/budget/update-policy", { dailyCapUsd: Number(dailyCap) || 0, maxPerCallUsd: Number(maxCall) || 0 });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Save budget caps", remote));
  }

  async function withdrawUnused() {
    const unused = Math.max(0, state.budget.balanceUsd - state.budget.spendTodayUsd);
    let tx: { txHash: string; walletAddress: string } | null = null;
    try {
      setNotice({ tone: "info", title: "Withdraw pending wallet", body: "Confirm the live ArcAgentTreasury withdrawal transaction. No budget is withdrawn without a tx hash." });
      const accounts = await (window as unknown as { ethereum?: { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum?.request?.({ method: "eth_requestAccounts" });
      const walletAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
      const data = `0x00f714ce${encodeUint256(unused)}${encodeAddress(walletAddress)}`;
      tx = await sendArcTransaction(ARC_AGENT_TREASURY_ADDRESS, 0, data);
    } catch {
      tx = null;
      setNotice({ tone: "warning", title: "Withdraw not signed", body: "Wallet did not return a tx hash. The backend will block the withdrawal." });
    }
    const remote = await postControl("/budget/withdraw", { amountUsd: unused, ...tx });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Withdraw unused budget", remote));
  }

  async function toggleSpending() {
    const nextStatus = state.budget.status === "paused" ? "active" : "paused";
    setNotice({ tone: "info", title: `${nextStatus === "paused" ? "Pausing" : "Resuming"} Agent Budget`, body: "Updating spend policy. This does not move user funds." });
    const remote = await postControl("/policy", { status: nextStatus });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice(nextStatus === "paused" ? "Pause Agent Budget" : "Resume Agent Budget", remote));
  }

  async function toggleBudgetSource(source: ControlSource, blocked: boolean) {
    setNotice({ tone: "info", title: `${blocked ? "Allowing" : "Blocking"} ${source.label}`, body: "Updating whether this source may influence paid agent actions." });
    const remote = await postControl(blocked ? "/sources/allow" : "/sources/block", { sourceId: source.id });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice(blocked ? `Allow ${source.label}` : `Block ${source.label}`, remote));
  }

  async function toggleBudgetAction(action: AgentAction, allowed: boolean) {
    setNotice({ tone: "info", title: `${allowed ? "Blocking" : "Allowing"} ${action}`, body: "Updating the action allowlist. Blocked actions cannot be executed silently." });
    const remote = await postControl(allowed ? "/actions/block" : "/actions/allow", { action });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice(allowed ? `Block ${action}` : `Allow ${action}`, remote));
  }

  return (
    <div style={panelStyle()}>
      <SectionTitle
        icon={<CircleDollarSign size={18} />}
        title="Agent Budget"
        sub="This is the agent's operating budget for source reads and autonomous service calls. It is separate from user strategy capital."
        right={<StatusPill value={state.budget.status} />}
      />
      <ActionFeedback notice={notice} onClose={() => setNotice(null)} />
      <FactGrid items={[
        { label: "Treasury Balance", value: money(Math.max(0, state.budget.balanceUsd - state.budget.spendTodayUsd)), tone: "#20e3b2" },
        { label: "Spent Today", value: money(state.budget.spendTodayUsd), tone: "#93c5fd" },
        { label: "Remaining Daily Cap", value: money(remaining), tone: remaining > 0 ? "#20e3b2" : "#fb7185" },
        { label: "Max Per Call", value: money(state.budget.maxPerCallUsd), tone: "#facc15" },
      ]} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginTop: 16 }}>
        <label style={{ color: "#9fb0c8", fontSize: 12 }}>Top up amount USDC<input value={topUp} onChange={(e) => setTopUp(e.currentTarget.value)} style={inputStyle()} /></label>
        <label style={{ color: "#9fb0c8", fontSize: 12 }}>Daily cap<input value={dailyCap} onChange={(e) => setDailyCap(e.currentTarget.value)} style={inputStyle()} /></label>
        <label style={{ color: "#9fb0c8", fontSize: 12 }}>Max per call<input value={maxCall} onChange={(e) => setMaxCall(e.currentTarget.value)} style={inputStyle()} /></label>
      </div>
      <DisclosureBox state={state} input={{ action: "READ_SOURCE", amountUsd: 0.002, fundingMode: "agent_treasury", sourceId: "oi_funding" }} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <ActionButton onClick={topUpBudget}><Wallet size={15} /> Top Up Agent Budget</ActionButton>
        <ActionButton tone="soft" onClick={saveCaps}><Check size={15} /> Save Caps</ActionButton>
        <ActionButton tone="soft" onClick={toggleSpending}>{state.budget.status === "paused" ? <Play size={15} /> : <Pause size={15} />} {state.budget.status === "paused" ? "Resume Spending" : "Pause Agent Spending"}</ActionButton>
        <ActionButton tone="danger" onClick={withdrawUnused}><Download size={15} /> Withdraw Unused Budget</ActionButton>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginTop: 16 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", borderRadius: 14, padding: 14 }}>
          <b style={{ color: "#fff" }}>Allowed paid sources</b>
          <p style={{ margin: "5px 0 10px", color: "#94a3b8", fontSize: 12 }}>Block a source here and the Decision Room cannot silently spend Agent Treasury on it.</p>
          <div style={{ display: "grid", gap: 8 }}>
            {sources.filter((source) => source.costUsd > 0 || source.payer === "agent_treasury").map((source) => {
              const blocked = state.policy.blockedSources.includes(source.id);
              return (
                <button key={source.id} onClick={() => toggleBudgetSource(source, blocked)} style={{ border: `1px solid ${blocked ? "rgba(251,113,133,0.35)" : "rgba(32,227,178,0.24)"}`, background: blocked ? "rgba(251,113,133,0.08)" : "rgba(32,227,178,0.06)", color: "#e2e8f0", borderRadius: 11, padding: 10, cursor: "pointer", textAlign: "left" }}>
                  <b>{blocked ? "Blocked" : "Allowed"}</b> - {source.label} - {money(source.costUsd)}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", borderRadius: 14, padding: 14 }}>
          <b style={{ color: "#fff" }}>Allowed actions</b>
          <p style={{ margin: "5px 0 10px", color: "#94a3b8", fontSize: 12 }}>These are the only agent actions that can pass policy gate.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["READ_SOURCE", "BUILD_DECISION", "COPY", "HOLD", "REDUCE", "STOP", "MOVE_TO_USDC", "RUN_ARB_CHECK", "UNLOCK_REASONING"] as AgentAction[]).map((action) => {
              const allowed = state.policy.allowedActions.includes(action);
              return (
                <button key={action} onClick={() => toggleBudgetAction(action, allowed)} style={{ border: `1px solid ${allowed ? "rgba(96,165,250,0.28)" : "rgba(255,255,255,0.10)"}`, background: allowed ? "rgba(22,82,240,0.18)" : "rgba(255,255,255,0.035)", color: allowed ? "#bfdbfe" : "#94a3b8", borderRadius: 999, padding: "7px 10px", cursor: "pointer", fontSize: 11, fontWeight: 900 }}>
                  {action.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", borderRadius: 14, padding: 14 }}>
        <b style={{ color: "#fff" }}>Spend log</b>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {spendLog.length === 0 && <div style={{ color: "#94a3b8", fontSize: 12 }}>No Agent Treasury spend yet. Paid source/action calls will appear here with amount, payer and status.</div>}
          {spendLog.map((exec) => (
            <div key={exec.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 10, color: "#cbd5e1", fontSize: 12 }}>
              <span>{exec.action.replace(/_/g, " ")} - {exec.sourceId ?? exec.strategyId ?? "control"}</span>
              <span>{money(exec.amountUsd)} - {exec.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 7,
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    outline: "none",
  };
}

export function ArcControlStrategiesWidget({ workspace }: { workspace: Workspace }) {
  const [state, setState] = useControl(workspace);
  const [configured, setConfigured] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const enabledCount = state.strategies.filter((strategy) => strategy.enabled).length;

  async function runStrategy(strategy: ControlStrategy) {
    setNotice({ tone: "info", title: `Running ${strategy.name}`, body: "Checking strategy policy, source requirements and funding gate..." });
    const remote = await postControl("/strategies/run-once", { strategyId: strategy.id });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice(`Run ${strategy.name}`, remote));
  }

  return (
    <div style={panelStyle({ background: "radial-gradient(circle at 0% 0%, rgba(32,227,178,0.12), transparent 30%), radial-gradient(circle at 100% 12%, rgba(96,165,250,0.13), transparent 34%), rgba(8,13,25,0.94)" })}>
      <SectionTitle
        icon={<SlidersHorizontal size={18} />}
        title="Strategies"
        sub="Pick the market behaviors the agent may run. Each card shows source dependency, user impact, cost and policy gate before execution."
        right={<StatusPill value={`${enabledCount}/${state.strategies.length} active`} />}
      />
      <ActionFeedback notice={notice} onClose={() => setNotice(null)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(380px,1fr))", gap: 14 }}>
        {state.strategies.map((strategy) => {
          const action = strategyActionFor(strategy);
          const policyAllowed = state.policy.allowedActions.includes(action);
          const accent = strategy.enabled ? "#20e3b2" : strategy.risk === "high" ? "#fb7185" : "#60a5fa";
          return (
          <div
            key={strategy.id}
            style={{
              position: "relative",
              overflow: "hidden",
              border: `1px solid ${strategy.enabled ? "rgba(32,227,178,0.34)" : "rgba(148,163,184,0.14)"}`,
              background: strategy.enabled
                ? "linear-gradient(145deg, rgba(12,38,44,0.78), rgba(9,17,31,0.92))"
                : "linear-gradient(145deg, rgba(15,23,42,0.78), rgba(7,12,22,0.92))",
              borderRadius: 20,
              padding: 18,
              boxShadow: strategy.enabled ? "0 18px 55px rgba(32,227,178,0.10)" : "0 18px 55px rgba(0,0,0,0.22)",
            }}
          >
            <div style={{ position: "absolute", inset: "0 auto auto 0", width: 5, height: "100%", background: `linear-gradient(180deg, ${accent}, transparent)` }} />
            <div style={{ position: "absolute", right: -48, top: -58, width: 150, height: 150, borderRadius: "50%", background: `${accent}18`, filter: "blur(2px)" }} />
            <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <h4 style={{ margin: 0, color: "#fff", fontSize: 18, letterSpacing: "-0.015em" }}>{strategy.name}</h4>
                  <span style={{ color: riskTone(strategy.risk), background: `${riskTone(strategy.risk)}16`, border: `1px solid ${riskTone(strategy.risk)}30`, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>
                    {strategy.risk} risk
                  </span>
                </div>
                <p style={{ margin: "8px 0 0", color: "#afbdd1", fontSize: 13, lineHeight: 1.5, maxWidth: 410 }}>{strategy.summary}</p>
              </div>
              <StatusPill value={strategy.enabled ? "active" : "paused"} />
            </div>

            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginTop: 16 }}>
              {[
                { label: "Cost", value: money(strategy.expectedCostUsd), tone: "#eaf2ff" },
                { label: "Policy", value: policyAllowed ? "allowed" : "blocked", tone: policyAllowed ? "#20e3b2" : "#fb7185" },
                { label: "Capital impact", value: strategy.id === "copyguard" || strategy.id === "riskoff" ? "Strategy Vault" : "Agent Budget", tone: "#93c5fd" },
              ].map((item) => (
                <div key={item.label} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.045)", borderRadius: 14, padding: "10px 11px" }}>
                  <div style={{ color: "#7f8ea3", fontSize: 9, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase" }}>{item.label}</div>
                  <div style={{ color: item.tone, fontSize: 13, fontWeight: 900, marginTop: 5 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ position: "relative", marginTop: 12 }}>
              <div style={{ color: "#7f8ea3", fontSize: 10, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 7 }}>Required sources</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {strategy.requiredSources.map((source) => {
                  const blocked = state.policy.blockedSources.includes(source);
                  return (
                    <span key={source} style={{ color: blocked ? "#fecdd3" : "#c7d2fe", background: blocked ? "rgba(251,113,133,0.12)" : "rgba(96,165,250,0.10)", border: `1px solid ${blocked ? "rgba(251,113,133,0.26)" : "rgba(96,165,250,0.20)"}`, borderRadius: 999, padding: "5px 8px", fontSize: 11, fontWeight: 800 }}>
                      {source.replace(/_/g, " ")}
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={{ position: "relative", marginTop: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.16)", borderRadius: 14, padding: 12, color: "#9fb0c8", fontSize: 12, lineHeight: 1.45 }}>
              <b style={{ color: "#f8fafc" }}>Last state:</b> {strategy.lastAction}
            </div>

            {configured === strategy.id && (
              <div style={{ position: "relative", marginTop: 12, border: "1px solid rgba(96,165,250,0.20)", background: "rgba(22,82,240,0.08)", borderRadius: 14, padding: 12, color: "#cbd5e1", fontSize: 12, lineHeight: 1.5 }}>
                <b style={{ color: "#fff" }}>How it runs:</b> required sources must be allowed and fresh, the run cost must fit Agent Budget, and Risk Guard must approve the proposed action. User stake stays in StrategyVault and is never spent as agent operating budget.
              </div>
            )}
            <div style={{ position: "relative", marginTop: 12 }}>
              <StrategyFundingStrip state={state} strategy={strategy} />
            </div>
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginTop: 14 }}>
              <ActionButton tone={strategy.enabled ? "danger" : "primary"} onClick={async () => {
                setNotice({ tone: "info", title: `${strategy.enabled ? "Disabling" : "Enabling"} ${strategy.name}`, body: "Updating the strategy policy through the Control API..." });
                const remote = await postControl(strategy.enabled ? "/strategies/disable" : "/strategies/enable", { strategyId: strategy.id });
                if (remote?.["state"]) {
                  setState((current) => adaptServerState(remote["state"], current));
                }
                setNotice(remoteNotice(strategy.enabled ? `Disable ${strategy.name}` : `Enable ${strategy.name}`, remote));
              }}>{strategy.enabled ? <Ban size={14} /> : <Check size={14} />} {strategy.enabled ? "Disable" : "Enable"}</ActionButton>
              <ActionButton tone="soft" onClick={() => {
                const next = configured === strategy.id ? null : strategy.id;
                setConfigured(next);
                setNotice(next
                  ? { tone: "info", title: `${strategy.name} configuration opened`, body: "This panel explains the required sources, Agent Budget cost and Risk Guard checks before the strategy can run." }
                  : { tone: "info", title: `${strategy.name} configuration closed`, body: "No policy change was made." });
              }}><SlidersHorizontal size={14} /> Configure</ActionButton>
              <ActionButton tone="soft" onClick={() => runStrategy(strategy)} disabled={!strategy.enabled}><Play size={14} /> Run Once</ActionButton>
              <ActionButton tone="soft" onClick={async () => {
                setNotice({ tone: "info", title: "Updating automation", body: "Saving auto-execute preference through the Control API..." });
                const remote = await postControl("/policy", { autoExecute: !state.policy.autoExecute });
                if (remote?.["state"]) {
                  setState((current) => adaptServerState(remote["state"], current));
                }
                setNotice(remoteNotice("Automation setting", remote));
              }}><Zap size={14} /> {state.policy.autoExecute ? "Auto On" : "Auto Off"}</ActionButton>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export function ArcControlSourcesWidget({ workspace }: { workspace: Workspace }) {
  const [state, setState] = useControl(workspace);
  const [sources, setSources] = useSources(workspace);
  const [selected, setSelected] = useState<ControlSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  async function refresh() {
    setLoading(true);
    setNotice({ tone: "info", title: "Refreshing sources", body: "Calling live source adapters. Unavailable sources will stay marked as unavailable instead of using invented data." });
    const remote = await postControl("/sources/refresh", {});
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
      setSources((current) => adaptServerSources(asRecord(remote["state"])["sources"], current));
    }
    const nextSources = Array.isArray(asRecord(remote?.["state"])["sources"]) ? adaptServerSources(asRecord(remote?.["state"])["sources"], sources) : sources;
    const liveCount = nextSources.filter((source) => source.status === "live").length;
    setNotice(remote?.["state"]
      ? { tone: liveCount > 0 ? "success" : "warning", title: "Sources refreshed", body: `${liveCount}/${nextSources.length} sources are live. Missing keys and unavailable feeds remain visible and can block decisions.` }
      : remoteNotice("Refresh sources", remote));
    setLoading(false);
  }

  return (
    <div style={panelStyle()}>
      <SectionTitle icon={<Activity size={18} />} title="Sources" sub="Every decision must point to visible data. Missing keys and unavailable feeds stay visible instead of becoming claimed live data." right={<ActionButton onClick={refresh}><RefreshCw size={15} /> {loading ? "Refreshing" : "Refresh Sources"}</ActionButton>} />
      <ActionFeedback notice={notice} onClose={() => setNotice(null)} />
      {sources.some((source) => source.group === "leader" && source.status !== "live") && (
        <div style={{ border: "1px solid rgba(250,204,21,0.24)", background: "rgba(250,204,21,0.08)", color: "#fde68a", borderRadius: 14, padding: 12, marginBottom: 12, fontSize: 13 }}>
          Leader Feed is not live, so ArcMind is in SignalGuard mode. It will not invent copy leaders; decisions use visible market/source evidence only.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        {sources.map((source) => {
          const allowed = !state.policy.blockedSources.includes(source.id);
          return (
            <div key={source.id} style={{ border: `1px solid ${allowed ? "rgba(255,255,255,0.10)" : "rgba(251,113,133,0.35)"}`, background: allowed ? "rgba(255,255,255,0.04)" : "rgba(251,113,133,0.08)", borderRadius: 16, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <h4 style={{ margin: 0, color: "#fff", fontSize: 15 }}>{source.label}</h4>
                <StatusPill value={allowed ? source.status : "blocked"} />
              </div>
              <p style={{ color: "#9fb0c8", fontSize: 12, lineHeight: 1.45, minHeight: 42 }}>{source.signal}</p>
              <FactGrid items={[
                { label: "Group", value: source.group, tone: "#93c5fd" },
                { label: "Cost", value: money(source.costUsd), tone: source.costUsd > 0 ? "#facc15" : "#20e3b2" },
                { label: "Payer", value: source.payer.replace(/_/g, " "), tone: "#93c5fd" },
                { label: "Impact", value: `${source.contribution}%`, tone: "#20e3b2" },
                { label: "Updated", value: source.lastUpdated, tone: "#cbd5e1" },
              ]} />
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <ActionButton tone="soft" onClick={() => setSelected(source)}><Eye size={14} /> Inspect</ActionButton>
                {source.status !== "live" && <ActionButton tone="soft" onClick={refresh}><RefreshCw size={14} /> Retry Failed Source</ActionButton>}
                <ActionButton tone={allowed ? "danger" : "primary"} onClick={async () => {
                  setNotice({ tone: "info", title: `${allowed ? "Blocking" : "Allowing"} ${source.label}`, body: "Updating source policy. This changes whether the source can influence future decisions." });
                  const remote = await postControl(allowed ? "/sources/block" : "/sources/allow", { sourceId: source.id });
                  if (remote?.["state"]) {
                    setState((current) => adaptServerState(remote["state"], current));
                  }
                  setNotice(remoteNotice(allowed ? `Block ${source.label}` : `Allow ${source.label}`, remote));
                }}>{allowed ? <Ban size={14} /> : <Check size={14} />} {allowed ? "Block Source" : "Allow Source"}</ActionButton>
              </div>
            </div>
          );
        })}
      </div>
      {selected && (
        <div style={{ marginTop: 14, border: "1px solid rgba(96,165,250,0.22)", background: "rgba(22,82,240,0.08)", borderRadius: 16, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <b style={{ color: "#fff" }}>{selected.label} evidence</b>
            <button onClick={() => setSelected(null)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}><X size={16} /></button>
          </div>
          <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5 }}>{selected.signal}</p>
          <DisclosureBox state={state} input={{ action: "READ_SOURCE", amountUsd: selected.costUsd, fundingMode: selected.payer, sourceId: selected.id }} />
        </div>
      )}
    </div>
  );
}

export function ArcControlDecisionRoomWidget({ workspace }: { workspace: Workspace }) {
  const [state, setState] = useControl(workspace);
  const [sources] = useSources(workspace);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const decision = useMemo(() => decideFromSources(state, sources), [state, sources]);
  const actionFunding: ControlFundingMode = decision.action === "COPY" || decision.action === "HOLD" || decision.action === "REDUCE" || decision.action === "STOP" || decision.action === "MOVE_TO_USDC"
    ? "user_strategy_vault"
    : "agent_treasury";
  const executable = decision.policyGate === "passed" && decision.riskGate === "passed" && decision.budgetGate !== "blocked";

  async function execute(action: AgentAction, amountUsd: number, fundingMode: ControlFundingMode, name: string) {
    setNotice({ tone: "info", title: name, body: "Submitting the decision action to the Control API..." });
    const remote = await postControl(name === "Reject Decision" ? "/decision/reject" : "/decision/approve", { action, amountUsd, fundingMode });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice(name, remote));
  }

  async function sendToStrategy() {
    setNotice({ tone: "info", title: "Sending decision to strategy", body: "Enabling the decision strategy so future actions can be routed through its policy." });
    const remote = await postControl("/strategies/enable", { strategyId: decision.strategyId });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Send to strategy", remote));
  }

  async function toggleAutoExecute() {
    setNotice({ tone: "info", title: "Updating automation", body: "Saving auto-execute preference through the Control API." });
    const remote = await postControl("/policy", { autoExecute: !state.policy.autoExecute });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Auto-execute setting", remote));
  }

  return (
    <div style={panelStyle({ background: "radial-gradient(circle at 20% 0%, rgba(22,82,240,0.24), transparent 36%), rgba(8,13,25,0.94)" })}>
      <SectionTitle icon={<Gauge size={18} />} title="Decision Room" sub="The agent proposes one action, then budget, policy and risk gates decide whether it can execute." right={<StatusPill value={executable ? "passed" : "blocked"} />} />
      <ActionFeedback notice={notice} onClose={() => setNotice(null)} />
      <FactGrid items={[
        { label: "Proposed Action", value: decision.action.replace(/_/g, " "), tone: executable ? "#20e3b2" : "#facc15" },
        { label: "Confidence", value: `${decision.confidence}%`, tone: "#93c5fd" },
        { label: "Risk Score", value: `${decision.riskScore}/100`, tone: decision.riskScore > 70 ? "#fb7185" : "#20e3b2" },
        { label: "Strategy", value: decision.strategyId, tone: "#facc15" },
      ]} />
      <div style={{ marginTop: 14, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.045)" }}>
        <div style={{ color: "#fff", fontWeight: 900, marginBottom: 6 }}>Why</div>
        <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5 }}>{decision.reason}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 12 }}>
        <div style={{ border: "1px solid rgba(32,227,178,0.18)", background: "rgba(32,227,178,0.05)", borderRadius: 14, padding: 12 }}>
          <b style={{ color: "#fff" }}>If approved</b>
          <p style={{ color: "#9fb0c8", fontSize: 12, lineHeight: 1.45, margin: "6px 0 0" }}>
            The action is executed only through the shown funding mode. Treasury spend is capped; user strategy actions affect only strategy/vault state.
          </p>
        </div>
        <div style={{ border: "1px solid rgba(251,113,133,0.18)", background: "rgba(251,113,133,0.05)", borderRadius: 14, padding: 12 }}>
          <b style={{ color: "#fff" }}>If rejected</b>
          <p style={{ color: "#9fb0c8", fontSize: 12, lineHeight: 1.45, margin: "6px 0 0" }}>
            The agent records a STOP/reject event, no hidden retry runs, and no funds move.
          </p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12 }}>
        <StatusCard label="Budget Gate" value={decision.budgetGate} />
        <StatusCard label="Policy Gate" value={decision.policyGate} />
        <StatusCard label="Risk Gate" value={decision.riskGate} />
        <StatusCard label="Freshness" value={decision.stale ? "stale" : "live"} />
      </div>
      <div style={{ marginTop: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", borderRadius: 14, padding: 12 }}>
        <b style={{ color: "#fff" }}>Source contribution</b>
        <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
          {decision.sources.slice(0, 6).map((source) => (
            <div key={source.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", color: "#cbd5e1", fontSize: 12 }}>
              <span>{source.label}</span>
              <span>{source.contribution}%</span>
              <StatusPill value={source.policyAllowed ? source.status : "blocked"} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <DisclosureBox state={state} input={{ action: decision.action, amountUsd: actionFunding === "agent_treasury" ? 0.01 : 0, fundingMode: actionFunding, strategyId: decision.strategyId }} />
      </div>
      {!executable && (
        <ActionFeedback
          notice={{
            tone: "warning",
            title: "Approve is blocked",
            body: `Execution is disabled because budget=${decision.budgetGate}, policy=${decision.policyGate}, risk=${decision.riskGate}, freshness=${decision.stale ? "stale" : "live"}. Reject still records an audit event; approve requires gates to pass.`,
          }}
        />
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        <ActionButton onClick={() => execute(decision.action, actionFunding === "agent_treasury" ? 0.01 : 0, actionFunding, `Approve ${decision.action}`)} disabled={!executable}><Check size={15} /> Approve Once</ActionButton>
        <ActionButton tone="danger" onClick={() => execute("STOP", 0, "free_public", "Reject Decision")}><X size={15} /> Reject</ActionButton>
        <ActionButton tone="soft" onClick={toggleAutoExecute}><Zap size={15} /> {state.policy.autoExecute ? "Auto-execute On" : "Auto-execute Off"}</ActionButton>
        <ActionButton tone="soft" onClick={sendToStrategy}><SlidersHorizontal size={15} /> Send To Strategy</ActionButton>
        <ActionButton tone="soft" onClick={() => execute("UNLOCK_REASONING", 0.01, "user_wallet", "Reasoning Unlock")}><Lock size={15} /> Unlock Full Reasoning</ActionButton>
      </div>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: `1px solid ${toneForStatus(value)}30`, borderRadius: 14, background: `${toneForStatus(value)}12`, padding: 12 }}>
      <div style={{ color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 900 }}>{label}</div>
      <div style={{ color: toneForStatus(value), fontWeight: 900, marginTop: 6, textTransform: "uppercase" }}>{value.replace(/_/g, " ")}</div>
    </div>
  );
}

export function ArcControlExecutionWidget({ workspace }: { workspace: Workspace }) {
  const [state, setState] = useControl(workspace);
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  async function cancelExecution(exec: ControlExecution) {
    setNotice({ tone: "info", title: "Cancelling execution", body: `Cancelling ${exec.action}. If it already completed, only an audit event is recorded.` });
    const remote = await postControl("/execution/cancel", { executionId: exec.id });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Cancel execution", remote));
  }

  async function retryExecution(exec: ControlExecution) {
    setNotice({ tone: "info", title: "Retrying execution", body: "Retry will re-check budget, source and policy gates before any action runs." });
    const remote = await postControl("/execution/retry", { executionId: exec.id });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Retry execution", remote));
  }

  async function setAutomationPaused(paused: boolean) {
    setNotice({ tone: "info", title: paused ? "Pausing automation" : "Resuming automation", body: "Updating Control Layer policy. This does not move user funds." });
    const remote = await postControl("/policy", { status: paused ? "paused" : "active" });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice(paused ? "Pause automation" : "Resume automation", remote));
  }

  return (
    <div style={panelStyle()}>
      <SectionTitle
        icon={<Zap size={18} />}
        title="Execution"
        sub="Queued, completed, failed and cancelled agent actions. No hidden retries."
        right={(
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton tone="danger" onClick={() => setAutomationPaused(true)}><Pause size={14} /> Pause All Agent Actions</ActionButton>
            <ActionButton tone="soft" onClick={() => setAutomationPaused(false)}><Play size={14} /> Resume Automation</ActionButton>
          </div>
        )}
      />
      <ActionFeedback notice={notice} onClose={() => setNotice(null)} />
      <div style={{ display: "grid", gap: 10 }}>
        {state.executionQueue.length === 0 && (
          <EmptyState
            title="No executions yet"
            body="Run Once in Strategies, Refresh Sources, or approve a Decision Room action. Pause/Resume still updates automation policy and will show feedback above."
          />
        )}
        {state.executionQueue.map((exec) => (
          <div key={exec.id} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", borderRadius: 15, padding: 13, display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ color: "#fff" }}>{exec.action.replace(/_/g, " ")}</b>
                <StatusPill value={exec.status} />
                <StatusPill value={exec.liveStatus} />
              </div>
              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>
                {money(exec.amountUsd)} · {exec.fundingMode.replace(/_/g, " ")} · {exec.strategyId ?? exec.sourceId ?? "control"}
              </div>
              <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
                Receipt: {exec.receiptId ?? "not issued"} - Payer: {exec.fundingMode.replace(/_/g, " ")} - {exec.liveStatus}
              </div>
              {exec.failureReason && <div style={{ color: "#fb7185", fontSize: 12, marginTop: 6 }}>{exec.failureReason}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {exec.receiptId && <ActionButton tone="soft" onClick={() => copyText(exec.receiptId)}><Copy size={14} /> View Receipt</ActionButton>}
              {exec.status === "failed" && <ActionButton tone="soft" onClick={() => retryExecution(exec)}><RefreshCw size={14} /> Retry</ActionButton>}
              {exec.status !== "cancelled" && <ActionButton tone="danger" onClick={() => cancelExecution(exec)}><Ban size={14} /> Cancel</ActionButton>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 16, padding: 18, textAlign: "center", color: "#94a3b8", background: "rgba(255,255,255,0.025)" }}>
      <b style={{ color: "#e2e8f0" }}>{title}</b>
      <p style={{ margin: "6px auto 0", maxWidth: 560, lineHeight: 1.5, fontSize: 13 }}>{body}</p>
    </div>
  );
}

export function ArcControlPositionsWidget({ workspace }: { workspace: Workspace }) {
  const [state, setState] = useControl(workspace);
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  async function walletAddress(): Promise<string> {
    const accounts = await (window as unknown as { ethereum?: { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum?.request?.({ method: "eth_requestAccounts" });
    const wallet = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
    if (!wallet) throw new Error("wallet_not_connected");
    return wallet;
  }

  async function openPosition() {
    let tx: { txHash: string; walletAddress: string } | null = null;
    try {
      setNotice({ tone: "info", title: "Waiting for wallet signature", body: "Rabby/MetaMask will ask you to sign a live StrategyVault transaction. No local position is created before a tx hash is returned." });
      tx = await sendArcTransaction(ARC_STRATEGY_VAULT_ADDRESS, 25);
    } catch {
      tx = null;
      setNotice({ tone: "warning", title: "Wallet transaction not completed", body: "The wallet request was cancelled, rejected, or could not simulate. Sending the action to the backend will be blocked; no position is created." });
    }
    const remote = await postControl("/positions/open", { ...tx });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Open StrategyVault position", remote));
  }

  async function updatePosition(pos: ControlPosition, kind: "reduce25" | "reduce50" | "close" | "withdraw" | "settle") {
    const remotePath = kind === "reduce25" || kind === "reduce50" ? "/positions/reduce" : `/positions/${kind}`;
    let tx: { txHash: string; walletAddress: string } | null = null;
    try {
      setNotice({ tone: "info", title: `${kind} pending wallet`, body: "Confirm the live StrategyVault wallet transaction. If it is cancelled, product state will stay unchanged." });
      const wallet = await walletAddress();
      const pct = kind === "reduce25" ? 0.25 : kind === "reduce50" ? 0.5 : 1;
      const amount = Math.round(pos.exposureUsd * pct * 100) / 100;
      const data = kind === "withdraw"
        ? `0x2e1a7d4d${encodeUint256(pos.withdrawableUsd)}`
        : kind === "settle"
          ? `0x9729b3df${encodeAddress(wallet)}${"0".repeat(64)}`
          : kind === "close"
            ? `0xc74073a1${encodeAddress(wallet)}`
            : `0x1395e640${encodeAddress(wallet)}${encodeUint256(amount)}`;
      tx = await sendArcTransaction(ARC_STRATEGY_VAULT_ADDRESS, 0, data);
    } catch {
      tx = null;
      setNotice({ tone: "warning", title: "Wallet transaction not completed", body: "The position action did not receive a live tx hash. The backend will block it and leave funds/state unchanged." });
    }
    const remote = await postControl(remotePath, { positionId: pos.id, pct: kind === "reduce50" ? 50 : 25, ...tx });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice(`Position ${kind}`, remote));
  }

  return (
    <div style={panelStyle()}>
      <SectionTitle icon={<Activity size={18} />} title="Positions" sub="User capital and exposure. Agent Budget never pays for strategy stake." right={<ActionButton onClick={openPosition}><Play size={15} /> Open StrategyVault Position</ActionButton>} />
      <ActionFeedback notice={notice} onClose={() => setNotice(null)} />
      <div style={{ display: "grid", gap: 12 }}>
        {state.positions.length === 0 && <EmptyState title="No active user position" body="Open a StrategyVault position with a wallet transaction. You will see wallet pending, blocked, or success feedback above; no local position is created without a live tx hash." />}
        {state.positions.map((pos) => (
          <div key={pos.id} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <b style={{ color: "#fff" }}>{pos.strategyId}</b>
              <StatusPill value={pos.riskStatus} />
            </div>
            <FactGrid items={[
              { label: "Stake", value: money(pos.stakeUsd), tone: "#93c5fd" },
              { label: "Exposure", value: money(pos.exposureUsd), tone: "#20e3b2" },
              { label: "Entry Price", value: pos.entryPrice ? money(pos.entryPrice) : "n/a", tone: "#cbd5e1" },
              { label: "Current Price", value: pos.currentPrice ? money(pos.currentPrice) : "n/a", tone: "#cbd5e1" },
              { label: "Unrealized PnL", value: money(pos.unrealizedPnlUsd), tone: pos.unrealizedPnlUsd >= 0 ? "#20e3b2" : "#fb7185" },
              { label: "Withdrawable", value: money(pos.withdrawableUsd), tone: "#facc15" },
              { label: "Settlement", value: "live contract", tone: "#20e3b2" },
              { label: "Payer", value: "User strategy vault", tone: "#93c5fd" },
            ]} />
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>{pos.lastAction}</div>
            <div style={{ marginTop: 10 }}>
              <DisclosureBox state={state} input={{ action: "REDUCE", amountUsd: 0, fundingMode: "user_strategy_vault", strategyId: pos.strategyId }} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <ActionButton tone="soft" onClick={() => updatePosition(pos, "reduce25")}>Reduce 25%</ActionButton>
              <ActionButton tone="soft" onClick={() => updatePosition(pos, "reduce50")}>Reduce 50%</ActionButton>
              <ActionButton tone="danger" onClick={() => updatePosition(pos, "close")}>Close</ActionButton>
              <ActionButton tone="soft" onClick={() => updatePosition(pos, "settle")}>Settle</ActionButton>
              <ActionButton onClick={() => updatePosition(pos, "withdraw")}>Withdraw</ActionButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ArcControlRiskGuardWidget({ workspace }: { workspace: Workspace }) {
  const [state, setState] = useControl(workspace);
  const [stale, setStale] = useState(String(state.policy.staleSourceTimeoutMinutes));
  const [divergence, setDivergence] = useState(String(state.policy.sourceDivergenceLimit));
  const [maxDrawdown, setMaxDrawdown] = useState("15");
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  async function saveRules() {
    const patch = {
      staleSourceTimeoutMinutes: Math.max(1, Number(stale) || 15),
      sourceDivergenceLimit: Math.max(1, Number(divergence) || 35),
    };
    let tx: { txHash: string; walletAddress: string } | null = null;
    try {
      setNotice({ tone: "info", title: "Updating Risk Guard", body: "Confirm the live RiskGuard transaction or the backend will block the rule update." });
      const maxDrawdownBps = Math.round((Number(maxDrawdown) || 15) * 100);
      const staleSeconds = Math.round((Number(stale) || 15) * 60);
      const divergenceBps = Math.round((Number(divergence) || 35) * 100);
      const data = `0x9c7329dc${maxDrawdownBps.toString(16).padStart(64, "0")}${encodeUint256(state.budget.dailyCapUsd)}${encodeUint256(state.budget.maxPerCallUsd)}${staleSeconds.toString(16).padStart(64, "0")}${divergenceBps.toString(16).padStart(64, "0")}`;
      tx = await sendArcTransaction(ARC_RISK_GUARD_ADDRESS, 0, data);
    } catch {
      tx = null;
      setNotice({ tone: "warning", title: "Risk Guard transaction not completed", body: "No live tx hash was returned. The backend will block live rule mutation." });
    }
    const remote = await postControl("/policy", { ...patch, ...tx });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Update Risk Guard rules", remote));
  }

  async function triggerExit() {
    let tx: { txHash: string; walletAddress: string } | null = null;
    try {
      setNotice({ tone: "info", title: "Emergency exit pending", body: "Confirm the RiskGuard emergency transaction. If cancelled, positions and budget stay unchanged." });
      const wallet = await (async () => {
        const accounts = await (window as unknown as { ethereum?: { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum?.request?.({ method: "eth_requestAccounts" });
        const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
        if (!address) throw new Error("wallet_not_connected");
        return address;
      })();
      const reasonHash = "5269736b20477561726420656d657267656e63792065786974000000000000";
      const data = `0x0caa4eef${encodeAddress(wallet)}${reasonHash}`;
      tx = await sendArcTransaction(ARC_RISK_GUARD_ADDRESS, 0, data);
    } catch {
      tx = null;
      setNotice({ tone: "warning", title: "Emergency exit not signed", body: "No live transaction was confirmed. The backend will block emergency exit and leave state unchanged." });
    }
    const remote = await postControl("/risk/exit", { reason: "Risk Guard emergency exit", ...tx });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice("Emergency exit", remote));
  }

  async function setRiskMode(mode: "arm" | "disarm" | "reset") {
    let tx: { txHash: string; walletAddress: string } | null = null;
    try {
      setNotice({ tone: "info", title: `${mode} Risk Guard`, body: "Waiting for wallet confirmation. Without a tx hash, the Control API blocks the mode change." });
      const armed = mode !== "disarm";
      const data = `0xa5ff06c7${armed ? "1".padStart(64, "0") : "0".repeat(64)}`;
      tx = await sendArcTransaction(ARC_RISK_GUARD_ADDRESS, 0, data);
    } catch {
      tx = null;
      setNotice({ tone: "warning", title: "Risk Guard mode not signed", body: "Wallet did not return a tx hash. No mode change was applied." });
    }
    const remote = await postControl(`/risk/${mode}`, { ...tx });
    if (remote?.["state"]) {
      setState((current) => adaptServerState(remote["state"], current));
    }
    setNotice(remoteNotice(`Risk Guard ${mode}`, remote));
  }

  return (
    <div style={panelStyle()}>
      <SectionTitle icon={<Shield size={18} />} title="Risk Guard" sub="Safety controls connect budget, strategy, decision and positions. If a rule blocks, the agent cannot continue silently." right={<StatusPill value={state.budget.status === "paused" ? "paused" : "active"} />} />
      <ActionFeedback notice={notice} onClose={() => setNotice(null)} />
      <FactGrid items={[
        { label: "Max Daily Spend", value: money(state.budget.dailyCapUsd), tone: "#93c5fd" },
        { label: "Max Per Action", value: money(state.budget.maxPerCallUsd), tone: "#facc15" },
        { label: "Max Drawdown", value: `${maxDrawdown}%`, tone: "#fb7185" },
        { label: "Stale Source Timeout", value: `${state.policy.staleSourceTimeoutMinutes}m`, tone: "#20e3b2" },
        { label: "Divergence Limit", value: `${state.policy.sourceDivergenceLimit}%`, tone: "#20e3b2" },
        { label: "Emergency Stop", value: state.budget.status === "paused" ? "armed/paused" : "armed", tone: state.budget.status === "paused" ? "#facc15" : "#20e3b2" },
      ]} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 14 }}>
        <label style={{ color: "#9fb0c8", fontSize: 12 }}>Max drawdown %<input value={maxDrawdown} onChange={(e) => setMaxDrawdown(e.currentTarget.value)} style={inputStyle()} /></label>
        <label style={{ color: "#9fb0c8", fontSize: 12 }}>Stale source timeout minutes<input value={stale} onChange={(e) => setStale(e.currentTarget.value)} style={inputStyle()} /></label>
        <label style={{ color: "#9fb0c8", fontSize: 12 }}>Source divergence limit %<input value={divergence} onChange={(e) => setDivergence(e.currentTarget.value)} style={inputStyle()} /></label>
      </div>
      <div style={{ marginTop: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", borderRadius: 14, padding: 12, color: "#cbd5e1", fontSize: 12, lineHeight: 1.45 }}>
        Failed payment behavior: block the action, keep the execution visible, do not retry silently. Affected surfaces: Decision Room, Execution, Strategies and Positions.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <ActionButton onClick={saveRules}><Check size={15} /> Update Rules</ActionButton>
        <ActionButton tone="soft" onClick={() => setRiskMode("arm")}><Play size={15} /> Arm Guard</ActionButton>
        <ActionButton tone="soft" onClick={() => setRiskMode("disarm")}><Pause size={15} /> Disarm Guard</ActionButton>
        <ActionButton tone="danger" onClick={triggerExit}><AlertTriangle size={15} /> Trigger Emergency Exit</ActionButton>
        <ActionButton tone="soft" onClick={() => setRiskMode("reset")}><RefreshCw size={15} /> Reset Guard</ActionButton>
      </div>
    </div>
  );
}

export function ArcControlReceiptsWidget({ workspace }: { workspace: Workspace }) {
  const { receipts } = useAppState();
  const [state] = useControl(workspace);
  const [filter, setFilter] = useState("all");
  const appReceipts = receipts.filter((receipt) => receipt.workspaceId === workspace.id);
  const controlReceipts = state.receipts.filter((receipt) => filter === "all" || receipt.liveStatus === filter);
  const csv = [
    "id,action,amount,fundingMode,liveStatus,createdAt",
    ...controlReceipts.map((r) => [r.id, r.action, r.amountUsd, r.fundingMode, r.liveStatus, r.createdAt].join(",")),
  ].join("\n");

  return (
    <div style={panelStyle()}>
      <SectionTitle icon={<FileText size={18} />} title="Receipts" sub="Audit trail for budget, source reads, decisions, strategy actions and blocked/live events." right={<ActionButton tone="soft" onClick={() => {
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "agora-control-receipts.csv";
        a.click();
        URL.revokeObjectURL(url);
      }}><Download size={15} /> Export CSV</ActionButton>} />

      {/* ERC-8183 Job lifecycle (on-chain reader) */}
      <div style={{ marginBottom: 14 }}>
        <JobLifecycleViewer />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {["all", "live", "blocked", "failed"].map((item) => (
          <button key={item} onClick={() => setFilter(item)} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 999, padding: "7px 10px", background: filter === item ? "rgba(22,82,240,0.35)" : "rgba(255,255,255,0.05)", color: "#e2e8f0", cursor: "pointer", fontWeight: 800, fontSize: 12 }}>{item}</button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {controlReceipts.length === 0 && appReceipts.length === 0 && <EmptyState title="No receipts yet" body="Every budget, source, decision and strategy action will create a visible receipt." />}
        {controlReceipts.map((receipt) => (
          <div key={receipt.id} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <b style={{ color: "#fff" }}>{receipt.action.replace(/_/g, " ")}</b>
              <StatusPill value={receipt.liveStatus} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <CopyFeedbackButton text={receipt.id} label="Copy ID" icon={<Copy size={14} />} />
              <CopyFeedbackButton text={JSON.stringify(receipt, null, 2)} label="Request Review" icon={<FileText size={14} />} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 10, color: "#9fb0c8", fontSize: 11 }}>
              <span>Workspace: agora</span>
              <span>Payer: {receipt.fundingMode.replace(/_/g, " ")}</span>
              <span>Policy actions: {receipt.policySnapshot.allowedActions.length}</span>
              <span>{receipt.liveStatus === "live" ? "Arc live path" : "No verified live tx"}</span>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>{money(receipt.amountUsd)} · {receipt.fundingMode.replace(/_/g, " ")} · {receipt.strategyId ?? receipt.sourceId ?? receipt.policyTarget ?? "control"} · {new Date(receipt.createdAt).toLocaleString()}</div>
          </div>
        ))}
        {appReceipts.slice(0, 8).map((receipt) => (
          <div key={receipt.id} style={{ border: "1px solid rgba(96,165,250,0.14)", background: "rgba(22,82,240,0.05)", borderRadius: 14, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <b style={{ color: "#fff" }}>{receipt.serviceName}</b>
              <StatusPill value={String(receipt.payload?.["liveStatus"] ?? receipt.status)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 10, color: "#9fb0c8", fontSize: 11 }}>
              <span>Workspace: {receipt.workspaceId}</span>
              <span>Network: {receipt.network}</span>
              <span>Payer: {String(receipt.payload?.["payer"] ?? receipt.payerWallet ?? "user wallet")}</span>
              <span>{receipt.txHash && receipt.network === "arc-testnet"
                ? <a href={`${getAgoraConfig().explorerBase}/tx/${receipt.txHash}`} target="_blank" rel="noreferrer"
                    style={{ color: "#60a5fa", textDecoration: "none", fontFamily: "monospace" }}
                    title="View on ArcScan">
                    Arc tx {shortHash(receipt.txHash, 10, 6)} ↗
                  </a>
                : "no verified Arc tx"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <CopyFeedbackButton text={receipt.id} label="Copy ID" icon={<Copy size={14} />} />
              <CopyFeedbackButton text={JSON.stringify(receipt, null, 2)} label="Request Review" icon={<FileText size={14} />} />
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>{money(receipt.amount)} · {String(receipt.payload?.["fundingMode"] ?? "legacy receipt")} · {new Date(receipt.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ArcControlDeveloperWidget({ workspace, children }: { workspace: Workspace; children?: React.ReactNode }) {
  const [state] = useControl(workspace);
  const [developer, setDeveloper] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getControl("/developer/status").then((data) => {
      if (cancelled || !data) return;
      setDeveloper(asRecord(data["developer"]));
    });
    return () => { cancelled = true; };
  }, []);
  const deployment = asRecord(developer?.["deployment"]);
  const controlLayer = asRecord(deployment["controlLayer"]);
  const explorer = String(deployment["explorer"] ?? "https://testnet.arcscan.app");
  const contractRows = [
    { label: "AgentTreasury", address: String(controlLayer["agentTreasury"] ?? "") },
    { label: "StrategyVault", address: String(controlLayer["strategyVault"] ?? "") },
    { label: "RiskGuard", address: String(controlLayer["riskGuard"] ?? "") },
    { label: "ReceiptRegistry", address: String(controlLayer["receiptRegistry"] ?? "") },
  ];
  const deployedCount = contractRows.filter((row) => /^0x[a-fA-F0-9]{40}$/.test(row.address)).length;
  return (
    <div style={panelStyle({ borderColor: "rgba(250,204,21,0.20)" })}>
      <SectionTitle icon={<Code2 size={18} />} title="Developer Console" sub="Advanced x402, Circle/Arc tooling, raw service catalog and deployed Arc control contracts. This is intentionally secondary to the user product." />
      <FactGrid items={[
        { label: "Policy Schema", value: `${state.policy.allowedActions.length} actions`, tone: "#93c5fd" },
        { label: "Treasury Model", value: "agent budget", tone: "#20e3b2" },
        { label: "Contracts", value: `${deployedCount}/4 deployed`, tone: deployedCount === 4 ? "#20e3b2" : "#facc15" },
        { label: "User Tabs", value: "no endpoint console", tone: "#20e3b2" },
      ]} />
      <div style={{ marginTop: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", borderRadius: 14, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <b style={{ color: "#fff" }}>Arc Testnet Control Contracts</b>
          <StatusPill value={deployedCount === 4 ? "live" : "unavailable"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
          {contractRows.map((row) => {
            const valid = /^0x[a-fA-F0-9]{40}$/.test(row.address);
            return (
              <div key={row.label} style={{ border: "1px solid rgba(96,165,250,0.14)", background: "rgba(22,82,240,0.05)", borderRadius: 12, padding: 11 }}>
                <div style={{ color: "#7f8ea3", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 900 }}>{row.label}</div>
                {valid ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                    <a href={`${explorer}/address/${row.address}`} target="_blank" rel="noreferrer" style={{ color: "#93c5fd", fontSize: 13, fontWeight: 900, textDecoration: "none", display: "inline-block" }}>
                      {shortHash(row.address)} Open
                    </a>
                    <button onClick={() => copyText(row.address)} style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.06)", color: "#e2e8f0", borderRadius: 8, padding: "4px 7px", cursor: "pointer", fontSize: 11, fontWeight: 800 }}>
                      Copy
                    </button>
                  </div>
                ) : (
                  <div style={{ color: "#facc15", fontSize: 13, fontWeight: 900, marginTop: 6 }}>not configured</div>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ margin: "12px 0 0", color: "#9fb0c8", fontSize: 12, lineHeight: 1.45 }}>
          User actions now require live wallet or server-verified contract paths. If a required contract/API is unavailable, the product blocks the action instead of creating local settlement.
        </p>
      </div>
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}


