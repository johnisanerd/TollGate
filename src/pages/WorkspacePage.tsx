import { useMemo, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { workspaces, agentFor, services as allServices } from "../data";
import type { Service, WorkspaceId } from "../types";
import { useAppState } from "../app-state";
import {
  buildRail,
  CataloguePage,
  CreateServiceModal,
  ServiceTabPage,
  AgentsPage,
  ReceiptsPage,
  GatewayPage,
  OverviewPage,
  type RailKind,
} from "../components/WorkspaceDashboard";
import { ArcControlReceiptsWidget } from "../components/widgets/agora/ArcControlWidgets";
import { ArcMindOverviewWidget } from "../components/widgets/agora/ArcMindOverviewWidget";
import { ArcDeveloperConsoleWidget } from "../components/widgets/agora/ArcDeveloperConsoleWidget";
import {
  ArcMindCopyTradingWidget,
  ArcMindReasoningWidget,
} from "../components/widgets/agora/ArcMindWidgets";
import { slugifyTab } from "../components/ui/AppSidebar";
import { DocsPage, IntegrationsPage } from "../components/docs";
import type { WorkspaceOutletContext } from "../layouts/AppLayout";
import { TabFade } from "../components/ui/Motion";
import type { Workspace } from "../types";

function AgoraControlTab({
  workspace,
  tabLabel,
  onGoTab,
}: {
  workspace: Workspace;
  tabLabel: string;
  onGoTab: (tab: string) => boolean;
}) {
  const tab = tabLabel.toLowerCase();
  if (tab === "docs" || tab === "documentation") return <DocsPage workspace={workspace} />;
  if (tab === "integrations" || tab.includes("integration")) return <IntegrationsPage workspace={workspace} />;
  if (tab === "overview") return <ArcMindOverviewWidget workspace={workspace} onGoTab={onGoTab} />;
  if (tab === "signal feed") return <ArcMindReasoningWidget workspace={workspace} />;
  if (tab === "copy & position") return <ArcMindCopyTradingWidget workspace={workspace} />;
  if (tab === "receipts") return <ArcControlReceiptsWidget workspace={workspace} />;
  if (tab === "developer console") return <ArcDeveloperConsoleWidget workspace={workspace} />;
  return <ArcMindOverviewWidget workspace={workspace} onGoTab={onGoTab} />;
}

export function WorkspacePage() {
  const params = useParams<{ wsId: string; tabSlug: string }>();
  const navigate = useNavigate();
  const ctx = useOutletContext<WorkspaceOutletContext>();
  const wsId = (ctx?.workspaceId ?? (params.wsId as WorkspaceId)) as WorkspaceId;
  const workspace = workspaces.find((w) => w.id === wsId);

  const {
    receipts,
    paidServiceIds,
    extraServices,
    addService,
    setSelectedService,
  } = useAppState();

  const [agentPaused, setAgentPaused] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const workspaceServices = useMemo(() => {
    if (!workspace) return [];
    return [...allServices, ...extraServices].filter((s) => s.workspaceIds.includes(workspace.id));
  }, [workspace, extraServices]);

  const railItems = useMemo(() => (workspace ? buildRail(workspace) : []), [workspace]);

  if (!workspace) {
    return <Navigate to="/" replace />;
  }

  const activeIdx = railItems.findIndex((it) => slugifyTab(it.label) === params.tabSlug);
  if (activeIdx < 0) {
    const firstSlug = slugifyTab(railItems[0]?.label ?? "Overview");
    return <Navigate to={`/app/${workspace.id}/${firstSlug}`} replace />;
  }
  const active = railItems[activeIdx];
  const tabLabel = active.label;
  const kind = active.kind;

  const agent = agentFor(workspace.id);
  const effectiveAgent = agentPaused ? { ...agent, status: "Paused" as const } : agent;

  const goByKind = (...kinds: RailKind[]): boolean => {
    for (const k of kinds) {
      const it = railItems.find((r) => r.kind === k);
      if (it) {
        navigate(`/app/${workspace.id}/${slugifyTab(it.label)}`);
        return true;
      }
    }
    return false;
  };

  const goTab = (matcher: string): boolean => {
    const needle = matcher.toLowerCase();
    const it = railItems.find((r, i) => i !== activeIdx && r.label.toLowerCase().includes(needle));
    if (it) {
      navigate(`/app/${workspace.id}/${slugifyTab(it.label)}`);
      return true;
    }
    if (["wallet", "agent", "budget", "policy", "companion"].some((k) => needle.includes(k))) return goByKind("agents");
    if (["payment", "receipt", "approval"].some((k) => needle.includes(k))) return goByKind("receipts");
    if (["gateway", "explainer", "debugger", "playground", "sdk"].some((k) => needle.includes(k))) return goByKind("gateway", "service", "catalogue");
    if (["privacy", "verif", "compliance", "proof"].some((k) => needle.includes(k))) return goByKind("verify", "service");
    if (["market", "catalog"].some((k) => needle.includes(k))) return goByKind("catalogue", "service");
    if (["data", "checkout", "trading", "compute", "storage", "analy", "tax", "service", "report"].some((k) => needle.includes(k))) return goByKind("service", "catalogue");
    return false;
  };

  const goToReceipts = () => { goByKind("receipts", "overview"); };
  const onOpenPayment = (svc: Service) => setSelectedService(svc);

  return (
    <div className="ap402">
      <TabFade tabKey={`${workspace.id}:${tabLabel}`}>
      {String(workspace.id).trim().toLowerCase() === "agora" ? (
        <AgoraControlTab workspace={workspace} tabLabel={tabLabel} onGoTab={goTab} />
      ) : kind === "overview" ? (
        <OverviewPage
          agent={effectiveAgent}
          receipts={receipts}
          services={workspaceServices}
          workspace={workspace}
          onGoTab={goTab}
          onOpenPayment={onOpenPayment}
          onGoReceipts={goToReceipts}
        />
      ) : kind === "receipts" ? (
        <ReceiptsPage receipts={receipts} workspace={workspace} tabLabel={tabLabel} />
      ) : kind === "agents" ? (
        <AgentsPage
          agent={effectiveAgent}
          workspace={workspace}
          tabLabel={tabLabel}
          onTogglePause={() => setAgentPaused((p) => !p)}
        />
      ) : kind === "gateway" ? (
        <GatewayPage workspace={workspace} tabLabel={tabLabel} />
      ) : kind === "docs" ? (
        <DocsPage workspace={workspace} />
      ) : kind === "integrations" ? (
        <IntegrationsPage workspace={workspace} />
      ) : kind === "service" || kind === "verify" ? (
        <ServiceTabPage
          services={workspaceServices}
          workspace={workspace}
          tabLabel={tabLabel}
          receipts={receipts}
          variant={kind === "verify" ? "verify" : "service"}
          onOpenPayment={onOpenPayment}
        />
      ) : (
        <CataloguePage
          agent={effectiveAgent}
          paidServiceIds={paidServiceIds}
          services={workspaceServices}
          workspace={workspace}
          tabLabel={tabLabel}
          onOpenPayment={onOpenPayment}
          onCreateOpen={() => setCreateOpen(true)}
        />
      )}
      </TabFade>

      {createOpen ? (
        <CreateServiceModal
          workspace={workspace}
          onClose={() => setCreateOpen(false)}
          onAdd={(s) => addService(s)}
        />
      ) : null}
    </div>
  );
}
