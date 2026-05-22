// src/components/docs/DocsPage.tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Workspace } from "../../types";
import { docsFor } from "../../data";
import { DocBlocks } from "./DocBlocks";

/** A Docusaurus-style in-app documentation portal for one workspace. */
export function DocsPage({ workspace }: { workspace: Workspace }) {
  const docs = docsFor(workspace.id);
  const [params, setParams] = useSearchParams();
  const sections = docs?.sections ?? [];

  const activeId = params.get("p") ?? sections[0]?.id;
  const active = useMemo(
    () => sections.find((s) => s.id === activeId) ?? sections[0],
    [sections, activeId],
  );

  if (!docs || sections.length === 0 || !active) {
    return (
      <div className="lede-head">
        <div className="crumb">{workspace.shortName} · Docs</div>
        <h1>Documentation</h1>
        <p>No documentation is available for this workspace yet.</p>
      </div>
    );
  }

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("p", id);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <div className="lede-head">
        <div className="crumb">{workspace.shortName} · Docs</div>
        <h1>{workspace.name} Documentation</h1>
        <p>{workspace.pitch}</p>
      </div>
      <div className="docs-portal">
        <nav className="docs-nav" aria-label="Documentation sections">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === active.id ? "active" : ""}
              onClick={() => select(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <article className="docs-body">
          <DocBlocks blocks={active.blocks} accent={workspace.accent} />
        </article>
      </div>
    </div>
  );
}
