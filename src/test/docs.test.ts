import { describe, expect, it } from "vitest";

import { docsFor, integrationsFor, workspaces } from "../data";
import { pageKind } from "../components/WorkspaceDashboard";

const WITH_CONTENT = ["0g", "agora"] as const;

describe("workspace docs content", () => {
  for (const wsId of WITH_CONTENT) {
    it(`${wsId}: docs module has >= 7 unique, non-empty sections`, () => {
      const docs = docsFor(wsId);
      expect(docs).toBeDefined();
      const sections = docs!.sections;
      expect(sections.length).toBeGreaterThanOrEqual(7);

      const ids = sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);

      for (const s of sections) {
        expect(s.label.length).toBeGreaterThan(0);
        expect(s.blocks.length).toBeGreaterThan(0);
      }
    });

    it(`${wsId}: integrations module has an intro and unique cards`, () => {
      const intg = integrationsFor(wsId);
      expect(intg).toBeDefined();
      expect(intg!.intro.length).toBeGreaterThan(0);
      expect(intg!.cards.length).toBeGreaterThan(0);

      const ids = intg!.cards.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }

  it("does not attach docs/integrations to other workspaces", () => {
    const others = workspaces
      .map((w) => w.id)
      .filter((id) => id !== "0g" && id !== "agora");
    for (const id of others) {
      expect(docsFor(id)).toBeUndefined();
      expect(integrationsFor(id)).toBeUndefined();
    }
  });
});

describe("pageKind routing for the new tabs", () => {
  it("maps Docs to the docs page kind", () => {
    expect(pageKind("Docs", 7)).toBe("docs");
  });
  it("maps Integrations to the integrations page kind", () => {
    expect(pageKind("Integrations", 8)).toBe("integrations");
  });
});
