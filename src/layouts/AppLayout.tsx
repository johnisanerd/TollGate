import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu } from "lucide-react";
import { workspaces, agentFor } from "../data";
import type { WorkspaceId } from "../types";
import { AppSidebar } from "../components/ui/AppSidebar";
import { PaymentModal } from "../components/PaymentModal";
import { NetworkBanner } from "../components/ui/NetworkBanner";
import { WorkspaceWalletGate } from "../components/ui/WorkspaceWalletGate";
import { useAppState } from "../app-state";
import { WorkspaceBackdrop } from "../components/visual/WorkspaceBackdrop";

export type WorkspaceOutletContext = {
  workspaceId: WorkspaceId;
};

export function AppLayout() {
  const { wsId } = useParams<{ wsId: string }>();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const workspace = workspaces.find((w) => w.id === (wsId as WorkspaceId));
  const { selectedService, setSelectedService, approvePayment } = useAppState();

  useEffect(() => {
    setSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  if (!workspace) {
    return <Navigate to="/" replace />;
  }

  const accentStyle = {
    ["--accent-primary" as string]: workspace.accent,
    ["--accent-secondary" as string]: workspace.darkAccent,
    ["--workspace-accent" as string]: workspace.accent,
    ["--workspace-accent-soft" as string]: `${workspace.accent}24`,
    ["--border-active" as string]: `${workspace.accent}4d`,
  } as React.CSSProperties;

  return (
    <div className={`relative min-h-screen bg-bg-base flex overflow-hidden text-text-primary ${workspace.id === "agora" ? "arc-workspace-shell" : ""}`} style={accentStyle}>
      {/* Per-project animated backdrop */}
      <WorkspaceBackdrop workspaceId={workspace.id} />

      <div className="relative z-10 hidden md:block">
        <AppSidebar workspace={workspace} />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-30 bg-black/55 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-y-0 left-0 z-40 md:hidden"
            >
              <AppSidebar workspace={workspace} onClose={() => setSidebarOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="relative z-10 flex-1 h-screen overflow-y-auto">
        <div className="glass-panel flex items-center gap-4 px-5 py-3 md:hidden sticky top-0 z-20">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 grid place-items-center rounded-lg bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold">{workspace.shortName}</span>
        </div>

        <NetworkBanner />

        <div className="max-w-6xl mx-auto px-5 py-7 md:px-10 md:py-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
            >
              <WorkspaceWalletGate workspace={workspace}>
                <Outlet context={{ workspaceId: workspace.id } satisfies WorkspaceOutletContext} />
              </WorkspaceWalletGate>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <PaymentModal
        agent={agentFor(workspace.id)}
        service={selectedService}
        workspace={workspace}
        onApproved={(svc, tx) => approvePayment(svc, tx)}
        onClose={() => setSelectedService(null)}
      />
    </div>
  );
}

