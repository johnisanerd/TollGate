// src/components/docs/DocBlocks.tsx
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { DocBlock } from "../../workspaces/_docs";

/** A copy-to-clipboard button used by code blocks and integration cards. */
export function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setDone(true);
      window.setTimeout(() => setDone(false), 1400);
    });
  };
  return (
    <button type="button" className="doc-copy" onClick={copy} aria-label="Copy code">
      {done ? <Check size={13} /> : <Copy size={13} />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function CodeCard({ code, caption }: { code: string; caption?: string }) {
  return (
    <div className="doc-code">
      {caption ? <div className="doc-code-cap">{caption}</div> : null}
      <CopyCode code={code} />
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Renders a list of DocBlocks — one branch per block kind. */
export function DocBlocks({ blocks, accent }: { blocks: DocBlock[]; accent: string }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading":
            return b.level === 3 ? (
              <h3 key={i} className="doc-h3">{b.text}</h3>
            ) : (
              <h2 key={i} className="doc-h2" style={{ borderColor: accent }}>{b.text}</h2>
            );
          case "prose":
            return <p key={i} className="doc-prose">{b.text}</p>;
          case "code":
            return <CodeCard key={i} code={b.code} caption={b.caption} />;
          case "callout":
            return <div key={i} className={`doc-callout ${b.tone}`}>{b.text}</div>;
          case "list":
            return b.ordered ? (
              <ol key={i} className="doc-list">
                {b.items.map((it, j) => <li key={j}>{it}</li>)}
              </ol>
            ) : (
              <ul key={i} className="doc-list">
                {b.items.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            );
          case "table":
            return (
              <table key={i} className="doc-table">
                <thead>
                  <tr>{b.headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((row, j) => (
                    <tr key={j}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            );
          case "endpoint":
            return (
              <div key={i} className="doc-endpoint">
                <div className="doc-endpoint-head">
                  <span className={`doc-method ${b.method.toLowerCase()}`}>{b.method}</span>
                  <code className="doc-path">{b.path}</code>
                </div>
                <p className="doc-prose">{b.desc}</p>
                {b.req ? <CodeCard code={b.req} caption="Request" /> : null}
                {b.resp ? <CodeCard code={b.resp} caption="Response" /> : null}
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
