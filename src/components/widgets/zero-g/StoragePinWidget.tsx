import { useState } from "react";
import { Check, Copy, Download, ExternalLink, FileText, HardDrive, Link2, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { Workspace } from "../../../types";
import { useAppState } from "../../../app-state";
import { useLocalStore } from "../../../lib/storage";
import { sha256Hex, fmtBytes, hashId, deterministicScore } from "../../../lib/util-hash";
import { anchorReceiptOnChain, isOgRegistryConfigured, ogExplorerTxUrl, uploadToOgStorage } from "../../../lib/og";
import { SEEDED_PINS } from "../../../data";
import { ActionPanel } from "../ActionPanel";
import { WidgetMeta } from "../../ui/Motion";

type PinnedBlob = {
  id: string;
  name: string;
  hash: string;
  size: number;
  content: string;
  kind?: "pin" | "memory";
  agentId?: string;
  generation?: number;
  receiptId?: string;
  createdAt: string;
  storageRoot?: string;
  storageSimulated?: boolean;
  storageMerkle?: boolean;
  storageOnChain?: boolean;
  onchainTxHash?: string;
  onchainIndex?: number;
};

const PRICE_PER_KB = 0.00012;
const BASE_PRICE = 0.005;

function priceFor(size: number): number {
  return BASE_PRICE + Math.max(1, Math.ceil(size / 1024)) * PRICE_PER_KB;
}

function shortHash(h: string): string {
  return h.slice(0, 8) + "…" + h.slice(-6);
}

const SNAP_AGENTS = [
  { agentId: "agid_0g_a1f3", name: "Yield Researcher", strategy: "mETH-USDY rotation" },
  { agentId: "agid_0g_77bd", name: "Memory Curator", strategy: "long-context summarisation" },
  { agentId: "agid_0g_3c11", name: "Job Worker", strategy: "inference queue drain" },
] as const;

function genMemory(agentId: string, name: string, strategy: string, generation: number): string {
  const seed = agentId + "|g" + generation;
  const balance = deterministicScore(seed + "|bal", 0.2, 4.8).toFixed(3);
  const trades = Array.from({ length: 3 }, (_, i) => ({
    at: new Date(Date.now() - (i + 1) * 36e5).toISOString(),
    pair: ["mETH/USDY", "mETH/USDC", "T-BILL/mETH"][i % 3],
    side: deterministicScore(seed + "|s" + i, 0, 1) > 0.5 ? "buy" : "sell",
    sizeUsd: Number(deterministicScore(seed + "|z" + i, 50, 900).toFixed(2)),
  }));
  return JSON.stringify(
    {
      agentId,
      agentName: name,
      generation,
      snapshotAt: new Date().toISOString(),
      balanceEth: balance,
      strategy,
      recentTrades: trades,
      contextWindow: [
        "user: keep mETH exposure under 60% while USDY APY > mETH APY",
        "agent: rotated 40% mETH → USDY at gen " + Math.max(1, generation - 1),
        "agent: next review when spread compresses below 0.04%",
      ],
      metrics: { winRatePct: Math.round(deterministicScore(seed + "|wr", 48, 72)), trades30d: Math.round(deterministicScore(seed + "|t30", 12, 180)) },
    },
    null,
    2,
  );
}

export function StoragePinWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [blobs, setBlobs] = useLocalStore<PinnedBlob[]>("0g.pins", []);
  const [mode, setMode] = useState<"pin" | "snapshot">("pin");
  const [agentIdx, setAgentIdx] = useState(0);
  const [content, setContent] = useState("# memory-segment\nagent_yield_researcher.snapshot\nbalance: 1.23 ETH\nstrategy: mETH-USDY pair\nlast_trade: 2026-05-12T11:42:08Z");
  const [name, setName] = useState("agent-snapshot.md");
  const [stage, setStage] = useState<"idle" | "pinning" | "done">("idle");
  const [lastPinned, setLastPinned] = useState<PinnedBlob | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copiedRoot, setCopiedRoot] = useState(false);
  const [restored, setRestored] = useState<string | null>(null);
  const [anchoring, setAnchoring] = useState<string | null>(null);
  const [anchorErr, setAnchorErr] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const ogReady = isOgRegistryConfigured();
  const size = new TextEncoder().encode(content).length;
  const cost = priceFor(size);
  const agent = SNAP_AGENTS[agentIdx] ?? SNAP_AGENTS[0];

  const genFor = (agentId: string) => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "0g.memory.snapshot" && ((r.payload ?? {}) as { agentId?: string }).agentId === agentId).length + 1;

  const loadMemoryTemplate = (idx: number) => {
    const a = SNAP_AGENTS[idx] ?? SNAP_AGENTS[0];
    setContent(genMemory(a.agentId, a.name, a.strategy, genFor(a.agentId)));
    setName(`${a.agentId}.memory.json`);
  };

  const switchMode = (m: "pin" | "snapshot") => {
    setMode(m); setRestored(null); setLastPinned(null);
    if (m === "snapshot") loadMemoryTemplate(agentIdx);
    else { setContent("# memory-segment\nagent_yield_researcher.snapshot\nbalance: 1.23 ETH\nstrategy: mETH-USDY pair\nlast_trade: 2026-05-12T11:42:08Z"); setName("agent-snapshot.md"); }
  };

  const pin = async () => {
    if (!content.trim() || stage === "pinning") return;
    setStage("pinning");
    setAnchorErr(null);
    try {
      const hash = await sha256Hex(content);
      const storage = await uploadToOgStorage(content);
      const isMem = mode === "snapshot";
      const gen = isMem ? genFor(agent.agentId) : undefined;
      const blob: PinnedBlob = {
        id: hashId("pin", hash, 10),
        name: name.trim() || "untitled.bin",
        hash, size, content,
        kind: isMem ? "memory" : "pin",
        agentId: isMem ? agent.agentId : undefined,
        generation: gen,
        storageRoot: storage.root,
        storageSimulated: storage.simulated,
        storageMerkle: storage.merkleComputed,
        storageOnChain: storage.onChain,
        createdAt: new Date().toISOString(),
      };
      const r = emitReceipt({
        workspaceId: workspace.id,
        serviceName: isMem ? `0G Storage · Agent Memory (${agent.name})` : "0G Storage · Pin",
        amount: Number(cost.toFixed(5)),
        currency: "USDC",
        network: workspace.networks[0] ?? "0g-galileo",
        kind: isMem ? "0g.memory.snapshot" : "0g.pin",
        payload: {
          hash, name: blob.name, size, blobId: blob.id,
          storageRoot: storage.root,
          storageMode: storage.onChain ? "0g-onchain" : storage.merkleComputed ? "0g-merkle" : "simulated",
          ...(isMem ? { agentId: agent.agentId, generation: gen } : {}),
        },
      });
      blob.receiptId = r.id;
      setBlobs((prev) => [blob, ...prev].slice(0, 24));
      setLastPinned(blob);
      setStage("done");
    } catch (e) {
      setAnchorErr((e as { message?: string }).message ?? "Pin failed");
      setStage("idle");
    }
  };

  const anchorBlob = async (b: PinnedBlob) => {
    if (!ogReady || anchoring) return;
    setAnchoring(b.id);
    setAnchorErr(null);
    try {
      const payloadHashHex = await sha256Hex(b.content);
      const res = await anchorReceiptOnChain({ receiptHashHex: b.hash, payloadHashHex });
      setBlobs((prev) => prev.map((x) => (x.id === b.id ? { ...x, onchainTxHash: res.txHash, onchainIndex: res.index ?? undefined } : x)));
      setLastPinned((p) => (p && p.id === b.id ? { ...p, onchainTxHash: res.txHash, onchainIndex: res.index ?? undefined } : p));
    } catch (e) {
      setAnchorErr((e as { message?: string }).message ?? "Anchor failed");
    } finally {
      setAnchoring(null);
    }
  };

  const retrieve = (b: PinnedBlob) => {
    const blob = new Blob([b.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = b.name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const restore = (b: PinnedBlob) => {
    setContent(b.content); setName(b.name);
    setMode(b.kind === "memory" ? "snapshot" : "pin");
    setRestored(b.id);
  };
  const remove = (id: string) => setBlobs((prev) => prev.filter((b) => b.id !== id));
  const copyHash = (h: string) => {
    navigator.clipboard?.writeText(`0g://${h}`).catch(() => {});
    setCopiedHash(h);
    setTimeout(() => setCopiedHash(null), 1200);
  };

  return (
    <ActionPanel
      icon={mode === "snapshot" ? <HardDrive size={15} /> : <FileText size={15} />}
      title={mode === "snapshot" ? "Snapshot agent memory to 0G Storage" : "Pin content to 0G Storage"}
      sub={mode === "snapshot" ? "Save an agent's working memory (balance, strategy, trades, context window) as a content-hashed blob. Restore any generation later — persistent agent memory across sessions." : "Each pin computes a real SHA-256 content hash and settles a micro-payment. Retrieve any time."}
      actions={
        <button className="btn btn-acc btn-sm" type="button" onClick={pin} disabled={stage === "pinning" || !content.trim()}>
          {stage === "pinning" ? <><Loader2 size={13} className="wallet-spin" /> {mode === "snapshot" ? "Snapshotting…" : "Pinning…"}</> : mode === "snapshot" ? <><HardDrive width={13} height={13} /> Pay &amp; Snapshot</> : <><FileText width={13} height={13} /> Pay &amp; Pin</>}
        </button>
      }
    >
      <WidgetMeta
        live={ogReady}
        what={<>a permanent <code>0g://&lt;sha256&gt;</code> link for whatever you typed below, plus a settled storage receipt. With the indexer it carries a real 0G Merkle root; with a registry you can also anchor it on-chain (button appears after pinning).</>}
        enter="type or paste the content (text / JSON) in the editor below and give it a filename. “Agent memory snapshot” mode auto-fills an example agent-state JSON you can edit."
        liveText="0G registry configured — “Anchor on 0G” sends a real tx"
        demoText="content hash & 0g:// link are always real; set VITE_0G_STORAGE_INDEXER for real Merkle roots and VITE_0G_REGISTRY_ADDRESS to anchor on-chain"
      />

      <div className="seg" style={{ display: "inline-flex", marginBottom: 10 }}>
        <button type="button" className={mode === "pin" ? "on" : ""} onClick={() => switchMode("pin")}>Pin blob</button>
        <button type="button" className={mode === "snapshot" ? "on" : ""} onClick={() => switchMode("snapshot")}>Agent memory snapshot</button>
      </div>

      {mode === "snapshot" && (
        <div style={{ display: "flex", alignItems: "end", gap: 10, marginBottom: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Agent</span>
            <select value={agentIdx} onChange={(e) => { const i = Number(e.currentTarget.value); setAgentIdx(i); loadMemoryTemplate(i); }} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>
              {SNAP_AGENTS.map((a, i) => <option key={a.agentId} value={i}>{a.agentId} · {a.name}</option>)}
            </select>
          </label>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => loadMemoryTemplate(agentIdx)}><RotateCcw width={12} height={12} /> Regenerate template</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Filename</span>
          <input
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="agent-snapshot.md"
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Size</span>
          <div style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".84rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBytes(size)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Cost</span>
          <div style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".84rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            ${cost.toFixed(5)} <span style={{ color: "var(--muted)", fontWeight: 500 }}>USDC</span>
          </div>
        </div>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>{mode === "snapshot" ? "Memory blob (JSON)" : "Content (text)"}</span>
        <textarea
          rows={mode === "snapshot" ? 8 : 4}
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
          style={{ padding: "9px 11px", borderRadius: 10, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontFamily: "var(--mono)", fontSize: ".76rem", resize: "vertical" }}
          placeholder="Anything you want to pin…"
        />
      </label>

      {lastPinned && (() => {
        const permanentLink = `0g://${lastPinned.hash}`;
        const gatewayLink = `https://storage.0g.ai/retrieve/${lastPinned.hash}`;
        const copyPermanent = () => { navigator.clipboard?.writeText(permanentLink).catch(() => {}); setCopiedHash(lastPinned.hash); setTimeout(() => setCopiedHash(null), 1500); };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 12, border: "2px solid #1fb58a", overflow: "hidden", marginBottom: 12 }}>
            {/* Hero — permanent link */}
            <div style={{ background: "color-mix(in srgb, #1fb58a 12%, transparent)", padding: "12px 14px" }}>
              <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800, color: "#1fb58a", marginBottom: 6 }}>
                <Check width={11} height={11} style={{ display: "inline", marginRight: 4 }} />{lastPinned.kind === "memory" ? `Memory snapshot gen ${lastPinned.generation} · ` : "Pinned — "}your permanent 0G link
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ flex: 1, fontFamily: "var(--mono)", fontSize: ".75rem", background: "rgba(0,0,0,.15)", borderRadius: 7, padding: "5px 9px", color: "#d4ffed", wordBreak: "break-all" }}>{permanentLink}</code>
                <button type="button" className="btn btn-sm" style={{ background: "#1fb58a", color: "#fff", border: "none", fontWeight: 800, flexShrink: 0 }} onClick={copyPermanent}>
                  {copiedHash === lastPinned.hash ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy link</>}
                </button>
              </div>
            </div>
            {/* Secondary — storage status + anchor */}
            <div style={{ background: "var(--field)", padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: ".68rem" }}>
              {lastPinned.storageSimulated ? (
                <span style={{ background: "rgba(180,80,0,.18)", color: "#ffb347", fontWeight: 700, borderRadius: 4, padding: "2px 8px", letterSpacing: ".02em" }}>
                  ⚠ Local SHA-256 — not uploaded to 0G (set OG_STORAGE_INDEXER to enable real Merkle root)
                </span>
              ) : (
                <span style={{ color: "#1fb58a", fontWeight: 700 }}>
                  {lastPinned.storageOnChain ? "✓ Anchored on 0G Storage — on-chain" : "✓ Anchored on 0G Storage — Merkle root verified"}
                </span>
              )}
              {lastPinned.storageRoot && <span style={{ color: "var(--muted)" }}>root: <code style={{ background: "rgba(0,0,0,.1)", borderRadius: 4, padding: "1px 5px" }}>{shortHash(lastPinned.storageRoot.replace(/^0x/, ""))}</code></span>}
              <span style={{ flex: 1 }} />
              {lastPinned.onchainTxHash ? (
                <a href={ogExplorerTxUrl(lastPinned.onchainTxHash)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#1fb58a", fontWeight: 700 }}>
                  <Link2 width={11} height={11} /> 0G Explorer{lastPinned.onchainIndex != null ? ` #${lastPinned.onchainIndex}` : ""} <ExternalLink width={10} height={10} />
                </a>
              ) : ogReady ? (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: ".65rem" }} type="button" onClick={() => anchorBlob(lastPinned)} disabled={anchoring === lastPinned.id}>
                  {anchoring === lastPinned.id ? <><Loader2 size={11} className="wallet-spin" /> Anchoring…</> : <><Link2 width={11} height={11} /> Anchor on 0G</>}
                </button>
              ) : (
                <a href={gatewayLink} target="_blank" rel="noreferrer" style={{ color: "var(--muted)", display: "inline-flex", gap: 3, alignItems: "center" }}>Gateway <ExternalLink size={10} /></a>
              )}
              {anchorErr && <em style={{ color: "var(--red)", fontStyle: "normal", fontWeight: 600 }}>{anchorErr}</em>}
            </div>
          </div>
        );
      })()}
      {restored && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--accent-primary) 12%, transparent)", color: "var(--accent-primary)", fontSize: ".74rem", fontWeight: 700, marginBottom: 12 }}>
          <RotateCcw width={13} height={13} /> Memory restored into the editor — re-snapshot to advance the generation, or edit and pin.
        </div>
      )}
      {lastPinned && lastPinned.kind === "memory" && lastPinned.storageRoot && (() => {
        const root = "0x" + lastPinned.storageRoot.replace(/^0x/, "");
        const copyRoot = () => { navigator.clipboard?.writeText(root).catch(() => {}); setCopiedRoot(true); setTimeout(() => setCopiedRoot(false), 1500); };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px", borderRadius: 11, border: "1px solid color-mix(in srgb, var(--accent-primary) 32%, transparent)", background: "color-mix(in srgb, var(--accent-primary) 8%, transparent)", marginBottom: 12 }}>
            <div style={{ fontSize: ".72rem", color: "var(--ink)", lineHeight: 1.5 }}>
              <b>This snapshot is {SNAP_AGENTS[agentIdx]?.name ?? "the agent"}&apos;s brain.</b> Bind its root to the agent&apos;s <b>identity NFT</b> — open an agent identity registry (e.g. the Mantle workspace → <i>Agents</i> tab → &ldquo;Memory snapshot&rdquo;), enter the agentId and paste this root. The NFT then points at a verifiable 0G Storage blob — an intelligent NFT whose brain lives on 0G.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ flex: "1 1 220px", fontFamily: "var(--mono)", fontSize: ".72rem", background: "rgba(0,0,0,.1)", borderRadius: 7, padding: "5px 9px", wordBreak: "break-all" }}>{root}</code>
              <button type="button" className="btn btn-sm" onClick={copyRoot}>{copiedRoot ? <><Check size={12} /> Copied root</> : <><Copy size={12} /> Copy memory root</>}</button>
            </div>
          </div>
        );
      })()}

      <div style={{ marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", marginBottom: 8 }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)" }}>{mode === "snapshot" ? "Memory snapshots & pins" : "Pinned blobs"} · {blobs.length}</div>
          <div className="seg" style={{ display: "inline-flex" }}>
            <button type="button" className={viewMode === "grid" ? "on" : ""} onClick={() => setViewMode("grid")} style={{ fontSize: ".65rem", padding: "3px 10px" }}>Grid</button>
            <button type="button" className={viewMode === "list" ? "on" : ""} onClick={() => setViewMode("list")} style={{ fontSize: ".65rem", padding: "3px 10px" }}>List</button>
          </div>
        </div>

        {viewMode === "grid" ? (
          blobs.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: ".78rem", padding: "14px 0" }}>No pinned blobs — pin one above.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
              {blobs.map((b) => {
                const ext = b.name.split(".").pop() ?? "bin";
                const isJson = ext === "json" || ext === "md";
                const isHovered = hoveredId === b.id;
                return (
                  <div
                    key={b.id}
                    onMouseEnter={() => setHoveredId(b.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ position: "relative", borderRadius: 12, border: `1px solid ${b.onchainTxHash ? "#10b98140" : "var(--line-2)"}`, background: isHovered ? "var(--field)" : "var(--bg-2)", padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 6, cursor: "default", transition: "background .15s" }}
                  >
                    <div style={{ fontSize: "1.6rem", lineHeight: 1 }}>{isJson ? "📄" : "📦"}</div>
                    <div style={{ fontSize: ".75rem", fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.name}>{b.name}</div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                      {b.kind === "memory" && <span className="pill ok" style={{ fontSize: ".58rem", padding: "1px 6px" }}>g{b.generation ?? 1}</span>}
                      {b.onchainTxHash
                        ? <span style={{ fontSize: ".55rem", color: "#10b981", fontWeight: 800, background: "#10b98120", borderRadius: 4, padding: "1px 5px" }}>⛓ on-chain</span>
                        : b.storageSimulated === false
                          ? <span style={{ fontSize: ".55rem", color: "#3b82f6", fontWeight: 800, background: "#3b82f620", borderRadius: 4, padding: "1px 5px" }}>0G</span>
                          : <span style={{ fontSize: ".55rem", color: "#f59e0b", fontWeight: 800, background: "#f59e0b20", borderRadius: 4, padding: "1px 5px" }}>SHA-256</span>}
                    </div>
                    <div style={{ fontSize: ".62rem", color: "var(--muted)", fontFamily: "monospace" }}>0g://{shortHash(b.hash)}</div>
                    <div style={{ fontSize: ".62rem", color: "var(--muted)" }}>{fmtBytes(b.size)} · {new Date(b.createdAt).toLocaleTimeString()}</div>

                    {isHovered && (
                      <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20, background: "var(--bg-1)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "10px", boxShadow: "0 8px 24px rgba(0,0,0,.35)", maxHeight: 140, overflow: "hidden" }}>
                        <div style={{ fontSize: ".6rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 5 }}>Preview</div>
                        <pre style={{ margin: 0, fontSize: ".65rem", color: "var(--ink)", fontFamily: "monospace", overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 100 }}>{b.content.slice(0, 320)}{b.content.length > 320 ? "\n…" : ""}</pre>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => copyHash(b.hash)} title="Copy CID" style={{ flex: 1, justifyContent: "center" }}>
                        {copiedHash === b.hash ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => retrieve(b)} title="Download" style={{ flex: 1, justifyContent: "center" }}>
                        <Download size={11} />
                      </button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => restore(b)} title="Restore" style={{ flex: 1, justifyContent: "center" }}>
                        <RotateCcw size={11} />
                      </button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(b.id)} title="Forget" style={{ flex: 1, justifyContent: "center", color: "var(--red)" }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Reference</th><th>Name</th><th>Kind</th><th>Size</th><th>When</th><th aria-label="actions" /></tr></thead>
              <tbody>
                {blobs.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)", padding: 14 }}>No pinned blobs — pin one above.</td></tr>}
                {blobs.map((b) => (
                  <tr key={b.id}>
                    <td><code>0g://{shortHash(b.hash)}</code></td>
                    <td>{b.name}</td>
                    <td>{b.kind === "memory" ? <span className="pill ok">memory · g{b.generation ?? 1}</span> : <span className="muted" style={{ fontSize: ".7rem" }}>blob</span>}</td>
                    <td className="svc-table__num">{fmtBytes(b.size)}</td>
                    <td className="muted svc-table__num">{new Date(b.createdAt).toLocaleTimeString()}</td>
                    <td>
                      <span className="row sm" style={{ gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => copyHash(b.hash)} title="Copy CID">
                          {copiedHash === b.hash ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => restore(b)} title="Restore into editor">
                          <RotateCcw size={12} />
                        </button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => retrieve(b)} title="Download">
                          <Download size={12} />
                        </button>
                        {b.onchainTxHash ? (
                          <a className="btn btn-ghost btn-sm" href={ogExplorerTxUrl(b.onchainTxHash)} target="_blank" rel="noreferrer" title={`Anchored on 0G${b.onchainIndex != null ? ` · #${b.onchainIndex}` : ""}`} style={{ color: "var(--green)" }}>
                            <Link2 size={12} />
                          </a>
                        ) : ogReady ? (
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => anchorBlob(b)} disabled={anchoring === b.id} title="Anchor receipt on 0G">
                            {anchoring === b.id ? <Loader2 size={12} className="wallet-spin" /> : <Link2 size={12} />}
                          </button>
                        ) : null}
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(b.id)} title="Forget" style={{ color: "var(--red)" }}>
                          <Trash2 size={12} />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ActionPanel>
  );
}
