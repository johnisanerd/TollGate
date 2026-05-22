// src/workspaces/_docs.ts
// Content types for the per-workspace Docs portal and Integrations page.

export type DocBlock =
  | { kind: "heading"; text: string; level?: 2 | 3 }
  | { kind: "prose"; text: string }
  | { kind: "code"; lang: string; code: string; caption?: string }
  | { kind: "callout"; tone: "info" | "warn" | "success"; text: string }
  | { kind: "list"; ordered?: boolean; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | {
      kind: "endpoint";
      method: "GET" | "POST";
      path: string;
      desc: string;
      req?: string;
      resp?: string;
    };

/** One left-sidebar entry in the Docs portal. `id` is the stable `?p=` slug. */
export type DocSection = { id: string; label: string; blocks: DocBlock[] };

export type DocsModule = { sections: DocSection[] };

export type IntegrationCard = {
  id: string;
  title: string;
  category: "SDK" | "MCP" | "API" | "Webhook" | "Chain" | "Wallet";
  desc: string;
  status: "available" | "beta" | "soon";
  code?: { lang: string; code: string };
  link?: { label: string; url: string };
};

export type IntegrationsModule = { intro: string; cards: IntegrationCard[] };
