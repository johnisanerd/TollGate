import { Agentation } from "agentation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AppStateContext, type AppState, type EmitReceiptInput } from "./app-state";
import { ProjectLauncher } from "./pages/ProjectLauncher";
import { WorkspacePage } from "./pages/WorkspacePage";
import { NotFound } from "./pages/NotFound";
import { AppLayout } from "./layouts/AppLayout";
import { ReceiptsShowcase } from "./components/ReceiptsShowcase";
import { FleetView } from "./pages/FleetView";
import { ArcMindLive } from "./pages/ArcMindLive";
import { Preloader } from "./components/visual/Preloader";
import { CustomCursor } from "./components/visual/CustomCursor";
import { Toaster, toast } from "./components/ui/Toast";
import { CommandPalette } from "./components/ui/CommandPalette";
import { OnboardingFlow } from "./components/ui/OnboardingFlow";
import { notifStore } from "./lib/notificationStore";
import { agentFor, initialReceipts, makeReceiptId, makeTxHash } from "./data";
import { useSettings, ACCENT_CSS } from "./hooks/useSettings";
import type { Receipt, Service, Theme } from "./types";

const THEME_STORAGE_KEY = "tollgate-theme";
const AGENTATION_ENDPOINT = import.meta.env.VITE_AGENTATION_ENDPOINT as string | undefined;

function readInitialTheme(): Theme {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const HAS_MANUAL_THEME_KEY = "tollgate-theme-manual";

export default function App() {
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [receipts, setReceipts] = useState<Receipt[]>(initialReceipts);
  const [cmdOpen, setCmdOpen] = useState(false);
  const disconnectShownRef = useRef(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [paidServiceIds, setPaidServiceIds] = useState<Record<string, string>>({});
  const [extraServices, setExtraServices] = useState<Service[]>([]);
  const { settings } = useSettings();
  const isArcExperience = location.pathname === "/live" || location.pathname.startsWith("/app/agora");

  useEffect(() => {
    document.documentElement.dataset.theme = isArcExperience ? "dark" : theme;
    document.documentElement.style.setProperty("--user-accent", ACCENT_CSS[settings.accent]);
    if (!isArcExperience) window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, isArcExperience, settings.accent]);

  // Follow OS theme changes when user hasn't set a manual preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (window.localStorage.getItem(HAS_MANUAL_THEME_KEY)) return;
      setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Cmd+K / Ctrl+K → open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // MetaMask disconnect → show toast
  useEffect(() => {
    const eth = (window as unknown as { ethereum?: { on?: (e: string, h: () => void) => void; removeListener?: (e: string, h: () => void) => void } }).ethereum;
    if (!eth?.on) return;
    const onDisconnect = () => {
      if (disconnectShownRef.current) return;
      disconnectShownRef.current = true;
      const msg = "Wallet disconnected — reconnect to sign on-chain receipts.";
      toast.warn(msg);
      notifStore.push("warn", msg);
      setTimeout(() => { disconnectShownRef.current = false; }, 10_000);
    };
    eth.on("disconnect", onDisconnect);
    return () => eth.removeListener?.("disconnect", onDisconnect);
  }, []);

  const toggleTheme = useCallback(() => {
    window.localStorage.setItem(HAS_MANUAL_THEME_KEY, "1");
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const addService = useCallback((service: Service) => {
    setExtraServices((prev) => [...prev, service]);
  }, []);

  const approvePayment = useCallback((service: Service, onchainTxHash?: string) => {
    setReceipts((prev) => {
      const workspaceId = service.workspaceIds[0];
      const agent = agentFor(workspaceId);
      const receipt: Receipt = {
        id: makeReceiptId(),
        workspaceId,
        serviceId: service.id,
        serviceName: service.name,
        agentName: agent.name,
        payerWallet: agent.wallet,
        providerWallet: service.providerWallet,
        amount: service.priceUsd,
        currency: service.currency,
        network: service.network,
        txHash: onchainTxHash ?? makeTxHash(),
        status: "verified",
        createdAt: new Date().toISOString(),
        kind: "x402.pay",
        payload: onchainTxHash ? { onchainTxHash, x402: true } : { x402: true },
      };
      return [receipt, ...prev];
    });
    setPaidServiceIds((prev) => ({ ...prev, [service.id]: "just now" }));
  }, []);

  const emitReceipt = useCallback((input: EmitReceiptInput): Receipt => {
    const agent = agentFor(input.workspaceId);
    const receipt: Receipt = {
      id: makeReceiptId(),
      workspaceId: input.workspaceId,
      serviceId: input.serviceId ?? `${input.kind}-${Date.now()}`,
      serviceName: input.serviceName,
      agentName: input.agentName ?? agent.name,
      payerWallet: input.payerWallet ?? agent.wallet,
      providerWallet: input.providerWallet ?? "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
      amount: input.amount,
      currency: input.currency ?? "USDC",
      network: input.network,
      txHash: (input.payload as { settlement?: string } | undefined)?.settlement === "fallback"
        ? undefined
        : makeTxHash(),
      status: input.status ?? "verified",
      createdAt: new Date().toISOString(),
      kind: input.kind,
      payload: input.payload,
    };
    setReceipts((prev) => [receipt, ...prev]);
    const amt = receipt.amount > 0 ? ` · $${receipt.amount.toFixed(receipt.amount < 0.01 ? 4 : 2)} ${receipt.currency}` : "";
    const msg = `Receipt: ${receipt.serviceName}${amt}`;
    toast.success(msg, 3500);
    notifStore.push("success", msg, `/app/${input.workspaceId}`);
    return receipt;
  }, []);

  const value = useMemo<AppState>(
    () => ({
      receipts,
      approvePayment,
      emitReceipt,
      paidServiceIds,
      extraServices,
      addService,
      selectedService,
      setSelectedService,
      assistantOpen,
      setAssistantOpen,
      theme,
      toggleTheme,
    }),
    [receipts, approvePayment, emitReceipt, paidServiceIds, extraServices, addService, selectedService, assistantOpen, theme, toggleTheme],
  );
  return (
    <AppStateContext.Provider value={value}>
      {!isArcExperience && <Preloader />}
      <CustomCursor />
      <Toaster />
      {!isArcExperience && <OnboardingFlow />}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <Routes>
        <Route path="/" element={<ProjectLauncher />} />
        <Route path="/app/:wsId" element={<AppLayout />}>
          <Route index element={<WorkspacePage />} />
          <Route path=":tabSlug" element={<WorkspacePage />} />
        </Route>
        <Route path="/fleet" element={<FleetView />} />
        <Route path="/live" element={<ArcMindLive />} />
        <Route
          path="/showcase"
          element={<ReceiptsShowcase onBack={() => { window.history.back(); }} />}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {import.meta.env.DEV ? (
        <Agentation
          endpoint={AGENTATION_ENDPOINT?.trim() || undefined}
          onSessionCreated={(sessionId) => {
            console.info("Agentation session started:", sessionId);
          }}
        />
      ) : null}
    </AppStateContext.Provider>
  );
}
