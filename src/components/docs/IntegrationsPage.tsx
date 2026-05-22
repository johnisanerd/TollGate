// src/components/docs/IntegrationsPage.tsx
import type { Workspace } from "../../types";
import type { IntegrationCard } from "../../workspaces/_docs";
import { integrationsFor } from "../../data";
import { CopyCode } from "./DocBlocks";

const CATEGORY_ORDER: IntegrationCard["category"][] = [
  "SDK",
  "MCP",
  "API",
  "Webhook",
  "Chain",
  "Wallet",
];

function statusBadgeClass(status: IntegrationCard["status"]): string {
  if (status === "available") return "active";
  if (status === "beta") return "pending";
  return "paused";
}

/** Lists a workspace's SDK / MCP / API / webhook / chain integrations. */
export function IntegrationsPage({ workspace }: { workspace: Workspace }) {
  const mod = integrationsFor(workspace.id);

  if (!mod || mod.cards.length === 0) {
    return (
      <div className="lede-head">
        <div className="crumb">{workspace.shortName} · Integrations</div>
        <h1>Integrations</h1>
        <p>No integrations are listed for this workspace yet.</p>
      </div>
    );
  }

  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    cards: mod.cards.filter((c) => c.category === cat),
  })).filter((g) => g.cards.length > 0);

  return (
    <div>
      <div className="lede-head">
        <div className="crumb">{workspace.shortName} · Integrations</div>
        <h1>Integrations</h1>
        <p>{mod.intro}</p>
      </div>
      {groups.map((g) => (
        <section key={g.cat} className="intg-group">
          <h2 className="intg-cat" style={{ borderColor: workspace.accent }}>{g.cat}</h2>
          <div className="intg-grid">
            {g.cards.map((c) => (
              <div key={c.id} className="intg-card">
                <div className="intg-card-head">
                  <h3>{c.title}</h3>
                  <span className={`badge ${statusBadgeClass(c.status)}`}>
                    <span className="b-dot" />
                    {c.status}
                  </span>
                </div>
                <p className="doc-prose">{c.desc}</p>
                {c.code ? (
                  <div className="doc-code">
                    <CopyCode code={c.code.code} />
                    <pre>
                      <code>{c.code.code}</code>
                    </pre>
                  </div>
                ) : null}
                {c.link ? (
                  <a
                    className="intg-link"
                    href={c.link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.link.label} →
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
