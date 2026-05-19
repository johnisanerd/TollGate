import { createPortal } from "react-dom";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Info, Keyboard, Palette, RotateCcw, ShieldCheck, Sliders, Wallet, X, Zap } from "lucide-react";
import { Toggle } from "./Toggle";
import {
  useSettings,
  ACCENT_CSS,
  WORKSPACE_SETTING_DEFAULTS,
  type AccentColor,
  type WorkspaceSettings,
} from "../../hooks/useSettings";
import { workspaces } from "../../data";
import type { Workspace, WorkspaceId } from "../../types";
import { CHAIN_LOGOS } from "../../lib/chain-logos";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  workspace?: Workspace;
};

type WorkspaceSettingConfig = {
  title: string;
  description: string;
  modeLabel: string;
  modeOptions: Array<{ value: string; label: string }>;
  settlementLabel: string;
  settlementOptions: Array<{ value: string; label: string }>;
  limitLabel: string;
  thresholdLabel: string;
  alertsLabel: string;
  automationLabel: string;
  quickLinks: Array<{ label: string; tab: string }>;
};

const sectionStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--muted, #888)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 10,
  display: "flex",
  alignItems: "center",
  gap: 7,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "10px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const labelStyle: CSSProperties = { fontSize: 13, color: "var(--ink, #fff)", fontWeight: 700 };
const sublabelStyle: CSSProperties = { fontSize: 11, color: "var(--muted, #888)", marginTop: 2, lineHeight: 1.35 };
const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  padding: "7px 10px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.11)",
  borderRadius: 9,
  color: "var(--ink, #fff)",
  fontSize: 13,
};

const SHORTCUTS = [
  { keys: "⌘ K", action: "Open command palette" },
  { keys: "Esc", action: "Close any panel" },
  { keys: "↑ ↓", action: "Navigate palette" },
  { keys: "↵", action: "Select item" },
];

const CONFIG: Record<WorkspaceId, WorkspaceSettingConfig> = {
  agora: {
    title: "ArcMind trading intelligence",
    description: "Controls copy-trading, SignalGuard, risk-off behavior and alerts for the Agora hackathon product.",
    modeLabel: "Agent mode",
    modeOptions: [
      { value: "signalguard", label: "SignalGuard public-source mode" },
      { value: "copyguard", label: "CopyGuard with leader decay" },
      { value: "arb-scout", label: "Cross-chain arbitrage scout" },
    ],
    settlementLabel: "Settlement rail",
    settlementOptions: [
      { value: "arc-testnet-usdc", label: "Arc Testnet · USDC" },
      { value: "arc-gateway", label: "Gateway unified balance" },
      { value: "arc-paymaster", label: "Paymaster · USDC fees" },
    ],
    limitLabel: "Max copy allocation",
    thresholdLabel: "Decay / kill threshold",
    alertsLabel: "Telegram decision alerts",
    automationLabel: "Autonomous kill switch",
    quickLinks: [
      { label: "Signal Hub", tab: "signal-hub" },
      { label: "Kill Switch", tab: "kill-switch" },
      { label: "Copy Trading", tab: "copy-trading" },
    ],
  },
  "0g": {
    title: "0G compute and memory",
    description: "Controls inference budget, sealed payloads, storage retention and privacy defaults.",
    modeLabel: "Execution mode",
    modeOptions: [
      { value: "private-compute", label: "Private compute + sealed context" },
      { value: "batch-inference", label: "Batch inference queue" },
      { value: "storage-first", label: "Storage memory first" },
    ],
    settlementLabel: "Network profile",
    settlementOptions: [
      { value: "0g-galileo", label: "0G Galileo testnet" },
      { value: "0g-storage", label: "0G Storage proof mode" },
      { value: "0g-da", label: "0G DA proof mode" },
    ],
    limitLabel: "Daily compute budget",
    thresholdLabel: "Privacy strictness",
    alertsLabel: "Job completion alerts",
    automationLabel: "Require TEE proof",
    quickLinks: [
      { label: "Compute", tab: "compute" },
      { label: "Storage", tab: "storage-memory" },
      { label: "TEE", tab: "tee-privacy" },
    ],
  },
  arbitrum: {
    title: "Arbitrum agent payments",
    description: "Controls USDC payment defaults, escrow release behavior and wallet protection rules.",
    modeLabel: "Payment mode",
    modeOptions: [
      { value: "usdc-payments", label: "USDC payments" },
      { value: "escrow-first", label: "Escrow-first delivery" },
      { value: "stylus-contracts", label: "Stylus contract review" },
    ],
    settlementLabel: "Settlement network",
    settlementOptions: [
      { value: "arbitrum-one-usdc", label: "Arbitrum One · USDC" },
      { value: "arbitrum-sepolia", label: "Arbitrum Sepolia" },
      { value: "orbit-monitor", label: "Orbit monitor mode" },
    ],
    limitLabel: "USDC spend cap",
    thresholdLabel: "Protection threshold",
    alertsLabel: "Payment failure alerts",
    automationLabel: "Auto-hold escrow until proof",
    quickLinks: [
      { label: "USDC Payments", tab: "usdc-payments" },
      { label: "Escrow", tab: "escrow" },
      { label: "Protection", tab: "wallet-protection" },
    ],
  },
  mantle: {
    title: "Mantle yield strategy",
    description: "Controls strategy risk, yield rotation, RWA exposure and agent credit defaults.",
    modeLabel: "Strategy profile",
    modeOptions: [
      { value: "yield-balanced", label: "Balanced yield rotation" },
      { value: "alpha-aggressive", label: "Aggressive alpha desk" },
      { value: "rwa-defensive", label: "RWA defensive basket" },
    ],
    settlementLabel: "Asset route",
    settlementOptions: [
      { value: "mantle-usdc", label: "Mantle · USDC" },
      { value: "meth-usdy", label: "mETH / USDY rotation" },
      { value: "rwa-basket", label: "RWA basket mode" },
    ],
    limitLabel: "Strategy run budget",
    thresholdLabel: "Rebalance threshold",
    alertsLabel: "Alpha/yield alerts",
    automationLabel: "Auto-rebalance simulation",
    quickLinks: [
      { label: "Alpha Data", tab: "alpha-data" },
      { label: "Yield", tab: "yield-compare" },
      { label: "Budget", tab: "budget-dashboard" },
    ],
  },
  sui: {
    title: "Sui agent economy",
    description: "Controls zkLogin, Walrus storage, pay widget defaults and intent execution limits.",
    modeLabel: "User flow",
    modeOptions: [
      { value: "wallet-zklogin", label: "Wallet + zkLogin" },
      { value: "pay-widget", label: "Pay widget first" },
      { value: "intent-engine", label: "Intent engine" },
    ],
    settlementLabel: "Sui rail",
    settlementOptions: [
      { value: "sui-testnet", label: "Sui testnet" },
      { value: "walrus-storage", label: "Walrus storage" },
      { value: "deepbook-escrow", label: "DeepBook yield escrow" },
    ],
    limitLabel: "Agent spend limit",
    thresholdLabel: "Intent confidence",
    alertsLabel: "Wallet/action alerts",
    automationLabel: "Auto-build PTB preview",
    quickLinks: [
      { label: "Agent Wallet", tab: "agent-wallet" },
      { label: "Pay Widget", tab: "pay-widget" },
      { label: "Intent Engine", tab: "intent-engine" },
    ],
  },
  qie: {
    title: "QIE merchant gateway",
    description: "Controls merchant checkout, QIE Pass, creator payments and wallet defaults.",
    modeLabel: "Merchant mode",
    modeOptions: [
      { value: "merchant-pos", label: "Merchant POS" },
      { value: "creator-hub", label: "Creator monetization" },
      { value: "oracle-credit", label: "Oracle + credit mode" },
    ],
    settlementLabel: "Rail",
    settlementOptions: [
      { value: "qie-testnet", label: "QIE testnet" },
      { value: "qie-pass", label: "QIE Pass-gated" },
      { value: "qiedex", label: "QIEDEX quote rail" },
    ],
    limitLabel: "Merchant bot budget",
    thresholdLabel: "Pass / credit threshold",
    alertsLabel: "Checkout/payout alerts",
    automationLabel: "Auto-split settlement",
    quickLinks: [
      { label: "Checkout", tab: "merchant-checkout" },
      { label: "QIE Pass", tab: "qie-pass" },
      { label: "Wallet", tab: "qie-wallet" },
    ],
  },
  polygon: {
    title: "Polygon commerce ops",
    description: "Controls merchant onboarding, invoice finance, remittance and marketplace defaults.",
    modeLabel: "Commerce profile",
    modeOptions: [
      { value: "merchant-finance", label: "Merchant finance" },
      { value: "invoice-advance", label: "Invoice advance" },
      { value: "remittance", label: "Cross-border remittance" },
    ],
    settlementLabel: "Payment rail",
    settlementOptions: [
      { value: "polygon-zkevm-usdc", label: "Polygon zkEVM · USDC" },
      { value: "polygon-pos", label: "Polygon PoS" },
      { value: "uae-corridor", label: "UAE remittance corridor" },
    ],
    limitLabel: "Merchant agent budget",
    thresholdLabel: "Finance risk threshold",
    alertsLabel: "Invoice/payment alerts",
    automationLabel: "Auto-create payment link",
    quickLinks: [
      { label: "Merchant", tab: "merchant-mode" },
      { label: "Trade Finance", tab: "trade-finance" },
      { label: "USDC Payments", tab: "usdc-payments" },
    ],
  },
};

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

function coerceNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function SettingsRow({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div style={rowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={labelStyle}>{title}</div>
        <div style={sublabelStyle}>{subtitle}</div>
      </div>
      <div style={{ flex: "0 0 auto" }}>{children}</div>
    </div>
  );
}

function WorkspaceSettingsBlock({
  workspace,
  value,
  config,
  onChange,
  onReset,
  onClose,
}: {
  workspace: Workspace;
  value: WorkspaceSettings;
  config: WorkspaceSettingConfig;
  onChange: <K extends keyof WorkspaceSettings>(key: K, next: WorkspaceSettings[K]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const logo = CHAIN_LOGOS[workspace.id];
  const WorkspaceIcon = workspace.Icon;
  const openTab = (tab: string) => {
    navigate(`/app/${workspace.id}/${slugify(tab)}`);
    onClose();
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={sectionStyle}><Zap size={12} /> Active workspace</div>
      <div
        style={{
          border: `1px solid color-mix(in srgb, ${workspace.accent} 34%, rgba(255,255,255,.12))`,
          background: `linear-gradient(145deg, color-mix(in srgb, ${workspace.accent} 16%, rgba(255,255,255,.04)), rgba(255,255,255,.035))`,
          borderRadius: 16,
          padding: 14,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              background: `color-mix(in srgb, ${workspace.accent} 18%, transparent)`,
              border: `1px solid color-mix(in srgb, ${workspace.accent} 32%, transparent)`,
            }}
          >
            {logo ? <img src={logo} alt={workspace.shortName} width={28} height={28} style={{ objectFit: "contain" }} /> : <WorkspaceIcon size={22} />}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...labelStyle, color: "var(--ink, #fff)" }}>{config.title}</div>
            <div style={sublabelStyle}>{config.description}</div>
          </div>
        </div>

        <SettingsRow title="Workspace enabled" subtitle="Hide or activate this product profile in automation logic.">
          <Toggle size="sm" checked={value.enabled} onChange={(v) => onChange("enabled", v)} />
        </SettingsRow>

        <div style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={labelStyle}>{config.modeLabel}</div>
          <div style={sublabelStyle}>Default scenario for this workspace.</div>
          <select value={value.primaryMode} onChange={(e) => onChange("primaryMode", e.target.value)} style={{ ...inputStyle, marginTop: 8 }}>
            {config.modeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={labelStyle}>{config.settlementLabel}</div>
          <div style={sublabelStyle}>Default rail shown to users and used by workspace flows.</div>
          <select value={value.settlement} onChange={(e) => onChange("settlement", e.target.value)} style={{ ...inputStyle, marginTop: 8 }}>
            {config.settlementOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>{config.limitLabel}</span>
            <input
              type="number"
              min={0}
              step={1}
              value={value.spendLimitUsd}
              onChange={(e) => onChange("spendLimitUsd", coerceNumber(e.target.value, value.spendLimitUsd))}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>{config.thresholdLabel}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={value.riskThreshold}
              onChange={(e) => onChange("riskThreshold", coerceNumber(e.target.value, value.riskThreshold))}
              style={inputStyle}
            />
          </label>
        </div>

        <SettingsRow title={config.alertsLabel} subtitle="Used by alert UI and notification defaults.">
          <Toggle size="sm" checked={value.alerts} onChange={(v) => onChange("alerts", v)} />
        </SettingsRow>
        <SettingsRow title={config.automationLabel} subtitle="Controls whether workspace actions start in assisted/autonomous mode.">
          <Toggle size="sm" checked={value.automation} onChange={(v) => onChange("automation", v)} />
        </SettingsRow>

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingTop: 12 }}>
          {config.quickLinks.map((link) => (
            <button
              key={link.tab}
              type="button"
              onClick={() => openTab(link.tab)}
              style={{
                border: `1px solid color-mix(in srgb, ${workspace.accent} 32%, transparent)`,
                background: `color-mix(in srgb, ${workspace.accent} 10%, transparent)`,
                color: workspace.accent,
                borderRadius: 9,
                padding: "6px 9px",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {link.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onReset}
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: "1px solid rgba(255,255,255,.11)",
              background: "rgba(255,255,255,.04)",
              color: "var(--muted, #888)",
              borderRadius: 9,
              padding: "6px 9px",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            <RotateCcw size={11} /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({ open, onClose, workspace }: SettingsPanelProps) {
  const { settings, setSetting, setWorkspaceSetting, resetWorkspaceSettings } = useSettings();
  const activeWorkspace = workspace ?? workspaces.find((w) => w.id === settings.defaultWorkspace) ?? workspaces[0];
  const workspaceValue = settings.workspace[activeWorkspace.id] ?? WORKSPACE_SETTING_DEFAULTS[activeWorkspace.id];
  const workspaceConfig = CONFIG[activeWorkspace.id];

  const ACCENTS: { id: AccentColor; label: string }[] = [
    { id: "indigo", label: "Indigo" },
    { id: "emerald", label: "Emerald" },
    { id: "amber", label: "Amber" },
  ];

  const statusLine = useMemo(() => {
    const enabled = workspaceValue.enabled ? "enabled" : "disabled";
    const alerts = workspaceValue.alerts ? "alerts on" : "alerts off";
    return `${activeWorkspace.shortName}: ${enabled}, ${workspaceValue.primaryMode}, ${alerts}`;
  }, [activeWorkspace.shortName, workspaceValue]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, zIndex: 49998, background: "rgba(0,0,0,0.34)" }}
          />
          <motion.aside
            key="settings-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              zIndex: 49999,
              width: "min(390px, 94vw)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="glass-card"
              style={{ flex: 1, display: "flex", flexDirection: "column", borderRadius: "16px 0 0 16px", overflow: "hidden" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "var(--ink, #fff)" }}>Settings</span>
                  <div style={{ ...sublabelStyle, marginTop: 3 }}>{statusLine}</div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--muted, #888)", borderRadius: 8 }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
                <div style={{ marginBottom: 24 }}>
                  <div style={sectionStyle}><Palette size={12} /> Appearance</div>
                  <SettingsRow title="Accent color" subtitle="Global fallback accent for launcher and non-workspace UI.">
                    <div style={{ display: "flex", gap: 7 }}>
                      {ACCENTS.map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          title={label}
                          onClick={() => setSetting("accent", id)}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: ACCENT_CSS[id],
                            border: settings.accent === id ? "2px solid #fff" : "2px solid transparent",
                            boxShadow: settings.accent === id ? `0 0 0 2px ${ACCENT_CSS[id]}` : "none",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        />
                      ))}
                    </div>
                  </SettingsRow>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={sectionStyle}><Sliders size={12} /> Global defaults</div>
                  <SettingsRow title="Auto-connect wallet" subtitle="Automatically request wallet context before workspace content opens.">
                    <Toggle size="sm" checked={settings.autoConnect} onChange={(v) => setSetting("autoConnect", v)} />
                  </SettingsRow>
                  <SettingsRow title="Testnet warning" subtitle="Show wrong-network and account-change banners.">
                    <Toggle size="sm" checked={settings.showTestnetWarning} onChange={(v) => setSetting("showTestnetWarning", v)} />
                  </SettingsRow>
                  <div style={{ padding: "10px 0" }}>
                    <div style={labelStyle}>Default workspace</div>
                    <div style={sublabelStyle}>Opening the launcher will route here when set.</div>
                    <select
                      value={settings.defaultWorkspace}
                      onChange={(e) => setSetting("defaultWorkspace", e.target.value as "" | WorkspaceId)}
                      style={{ ...inputStyle, marginTop: 8 }}
                    >
                      <option value="">None (show launcher)</option>
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>{w.shortName} - {w.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <WorkspaceSettingsBlock
                  workspace={activeWorkspace}
                  value={workspaceValue}
                  config={workspaceConfig}
                  onChange={(key, value) => setWorkspaceSetting(activeWorkspace.id, key, value)}
                  onReset={() => resetWorkspaceSettings(activeWorkspace.id)}
                  onClose={onClose}
                />

                <div style={{ marginBottom: 24 }}>
                  <div style={sectionStyle}><Wallet size={12} /> Workspace matrix</div>
                  <div style={{ display: "grid", gap: 7 }}>
                    {workspaces.map((w) => {
                      const ws = settings.workspace[w.id] ?? WORKSPACE_SETTING_DEFAULTS[w.id];
                      return (
                        <div
                          key={w.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "28px 1fr auto",
                            alignItems: "center",
                            gap: 9,
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: w.id === activeWorkspace.id ? `1px solid ${w.accent}66` : "1px solid rgba(255,255,255,.07)",
                            background: w.id === activeWorkspace.id ? `color-mix(in srgb, ${w.accent} 11%, transparent)` : "rgba(255,255,255,.035)",
                          }}
                        >
                          <span style={{ width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: 8, background: `color-mix(in srgb, ${w.accent} 14%, transparent)` }}>
                            {CHAIN_LOGOS[w.id] ? <img src={CHAIN_LOGOS[w.id]} alt={w.shortName} width={17} height={17} /> : <w.Icon size={15} />}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink, #fff)" }}>{w.shortName}</div>
                            <div style={{ fontSize: 10.5, color: "var(--muted, #888)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws.primaryMode} · ${ws.spendLimitUsd} · risk {ws.riskThreshold}%</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 900, color: ws.enabled ? "#22c55e" : "#ef4444", textTransform: "uppercase" }}>
                            {ws.enabled ? "on" : "off"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={sectionStyle}><Keyboard size={12} /> Keyboard shortcuts</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {SHORTCUTS.map(({ keys, action }) => (
                        <tr key={keys}>
                          <td style={{ padding: "6px 0", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--muted, #888)" }}>
                            <kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{keys}</kbd>
                          </td>
                          <td style={{ padding: "6px 0 6px 12px", fontSize: 12, color: "var(--ink, #fff)" }}>{action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 28, padding: "12px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 12 }}>
                  <div style={sectionStyle}><Info size={12} /> About</div>
                  <div style={{ fontSize: 12, color: "var(--muted, #888)", lineHeight: 1.6 }}>
                    <div>AgentPay Router · v2.0.0</div>
                    <div>x402 payment protocol · multi-chain</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, color: workspaceValue.alerts ? "#22c55e" : "#f59e0b" }}>
                      <Bell size={12} />
                      {workspaceValue.alerts ? "Workspace alerts enabled" : "Workspace alerts disabled"}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, color: workspaceValue.automation ? "#22c55e" : "#f59e0b" }}>
                      <ShieldCheck size={12} />
                      {workspaceValue.automation ? "Automation enabled" : "Manual approval mode"}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <a href="https://agora.thecanteenapp.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary, #6366f1)", textDecoration: "none", fontWeight: 800 }}>Agora Agents hackathon ↗</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
