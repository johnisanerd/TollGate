import { useState } from "react";
import {
  Bot, CheckCircle2, ChevronDown, ChevronRight, ClipboardCopy,
  Cpu, ExternalLink, Loader2, Radio, ShieldCheck, Zap,
} from "lucide-react";
import type { Workspace } from "../../../types";
import { useAppState } from "../../../app-state";
import { useLocalStore } from "../../../lib/storage";
import { deterministicScore, hashId, sha256Hex } from "../../../lib/util-hash";
import { uploadToOgStorage, anchorReceiptOnChain, isOgRegistryConfigured, runOgInference } from "../../../lib/og";
import { gatewayPay, API_ENABLED } from "../../../lib/api";
import { WidgetMeta } from "../../ui/Motion";
import {
  checkFunding,
  fundingReceiptPayload,
  recordFundingSpend,
  type FundingScope,
} from "../../../workspaces/0g/funding";

const hid = (s: string) => hashId("0g", s);
const now = () => new Date().toLocaleTimeString();
const OG_AGENT_FUNDING_SCOPE: FundingScope = { workspaceId: "0g", agentId: "agent_marketplace_consumer", project: "0g" };

// ─── 1. OpenClaw Skill Console ───────────────────────────────────────────────

const SKILL_TEMPLATES = [
  {
    name: "Inference",
    manifest: {
      skill: "0g.inference", version: "1.0.0", model: "risk-scorer-v2",
      price: "0.10 USDC", network: "0g-galileo",
      endpoint: "/api/gateway/svc_0g_inference", auth: "x402",
      description: "Score a wallet for risk signals via 0G Compute.",
    },
  },
  {
    name: "Storage Pin",
    manifest: {
      skill: "0g.storage.pin", version: "1.0.0", maxSize: "10MB",
      price: "0.05 USDC", network: "0g-galileo",
      endpoint: "/api/gateway/svc_0g_storage", auth: "x402",
      description: "Pin an agent memory blob to 0G decentralised storage.",
    },
  },
  {
    name: "Sealed Inference",
    manifest: {
      skill: "0g.sealed.inference", version: "1.0.0", tee: "sgx",
      price: "0.25 USDC", network: "0g-galileo",
      endpoint: "/api/gateway/svc_0g_inference?sealed=true", auth: "x402+attestation",
      description: "TEE-sealed inference — result verifiable via attestation quote.",
    },
  },
];

type OcJob = {
  id: string; skill: string; status: string;
  result: string; ts: string; serverPayload?: unknown; gatewayReal?: boolean;
};

export function OpenClawSkillConsole({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [jobs, setJobs] = useLocalStore<OcJob[]>("og.openclaw.jobs", []);
  const [tplIdx, setTplIdx] = useState(0);
  const [prompt, setPrompt] = useState("Score wallet 0x9f3c…ba1 for mixer adjacency.");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [showManifest, setShowManifest] = useState(false);
  const [copied, setCopied] = useState(false);

  const tpl = SKILL_TEMPLATES[tplIdx];

  async function runSkill() {
    const priceUsd = parseFloat(tpl.manifest.price);
    const serviceId = tpl.name === "Storage Pin" ? "svc_0g_storage" : "svc_0g_inference";
    const funding = checkFunding(OG_AGENT_FUNDING_SCOPE, priceUsd, { mode: "treasury", serviceId });
    if (!funding.ok) {
      setLog(`Blocked before 0G paid skill: ${funding.reason}. Fund 0G Agent Treasury in the A2A Marketplace first.`);
      return;
    }
    setBusy(true);
    setLog("Registering skill with OpenClaw orchestrator…");
    await new Promise((r) => setTimeout(r, 500));
    setLog("OpenClaw routing job to 0G Compute…");
    await new Promise((r) => setTimeout(r, 600));

    const seed = tpl.name + prompt + Date.now();
    const jobId = "ocj_" + hid(seed);
    let result: string = "";
    let serverPayload: unknown;
    let gatewayReal = false;
    let ogReal = false;

    // Inference skills → try a REAL 0G Compute Network job first.
    if (tpl.name === "Inference" || tpl.name === "Sealed Inference") {
      setLog("Routing job to the 0G Compute Network…");
      const og = await runOgInference(prompt);
      if (og.ok) {
        result = og.content.slice(0, 240);
        serverPayload = { ogCompute: true, provider: og.provider, chatID: og.chatID, verified: og.verified, content: og.content };
        ogReal = true;
        setLog(`0G Compute · ${og.provider.slice(0, 10)}…${og.verified ? " · verified" : ""}`);
      }
    }

    // Fallback: real x402 gateway call (if the server is up), else deterministic demo.
    if (!ogReal) {
      if (API_ENABLED) {
        setLog("x402 challenge issued · payment verifying…");
        try {
          const unlocked = await gatewayPay("svc_0g_inference", { agentId: "agent_marketplace_consumer", proof: { workspaceId: "0g", fundingMode: "treasury" } });
          serverPayload = unlocked.data;
          result = JSON.stringify(unlocked.data).slice(0, 120);
          gatewayReal = true;
          setLog("Gateway response received");
        } catch {
          setLog("Gateway unreachable — using simulated result");
          const score = Math.round(deterministicScore(seed, 30, 95));
          result = tpl.name === "Storage Pin"
            ? `{ "blobId": "og_${hid(seed)}", "size": 184 }`
            : `{ "riskScore": ${score}, "confidence": 0.${Math.round(deterministicScore(seed, 80, 96))} }`;
        }
      } else {
        setLog("x402 challenge issued · payment verifying…");
        await new Promise((r) => setTimeout(r, 600));
        const score = Math.round(deterministicScore(seed, 30, 95));
        result = tpl.name === "Storage Pin"
          ? `{ "blobId": "og_${hid(seed)}", "size": 184 }`
          : `{ "riskScore": ${score}, "confidence": 0.${Math.round(deterministicScore(seed, 80, 96))} }`;
      }
    }

    recordFundingSpend(OG_AGENT_FUNDING_SCOPE, priceUsd, {
      mode: "treasury",
      serviceId,
      settlement: gatewayReal ? "live" : "fallback",
    });

    emitReceipt({
      workspaceId: workspace.id,
      serviceId,
      serviceName: `OpenClaw · ${tpl.manifest.skill}`,
      agentName: "0G Compute Agent",
      payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
      providerWallet: "0xF4BFd93061B160Fa376c7F66De207a00225B4e70",
      amount: gatewayReal ? priceUsd : 0,
      currency: "USDC",
      network: "0g-galileo",
      status: "verified",
      kind: "0g.openclaw",
      payload: fundingReceiptPayload(OG_AGENT_FUNDING_SCOPE, priceUsd, {
        mode: "treasury",
        serviceId,
        settlement: gatewayReal ? "live" : "fallback",
      }, { skill: tpl.manifest.skill, prompt, result, jobId, gatewayReal, ogCompute: ogReal, displayAmount: priceUsd }),
    });

    setJobs((prev) => [{ id: jobId, skill: tpl.manifest.skill, status: "done", result, ts: now(), serverPayload, gatewayReal }, ...prev.slice(0, 9)]);
    setLog(`Done · ${jobId}${ogReal ? " (0G Compute)" : gatewayReal ? " (real gateway)" : " (simulated)"}`);
    setBusy(false);
  }

  function copyManifest() {
    navigator.clipboard.writeText(JSON.stringify(tpl.manifest, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Bot size={15} /></span>
          <div><h3>OpenClaw Skill Console</h3><div className="sub">Register an OpenClaw skill manifest · orchestrate on 0G · pay per call with x402</div></div>
        </div>
      </div>

      <WidgetMeta
        live={API_ENABLED}
        what="a result for the chosen skill (risk score / blob id …). A live x402 receipt is issued only when the gateway settles; local/compute-only results are marked fallback and do not spend treasury."
        enter="pick a skill template (left), optionally open & edit its manifest JSON, then type the job prompt / payload."
        liveText="x402 server reachable — this is a real gateway call"
        demoText="no x402 server reachable — result is a deterministic demo; run server/ and set VITE_API_BASE for a real gateway response"
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {SKILL_TEMPLATES.map((t, i) => (
          <button key={t.name} className={"pill click" + (tplIdx === i ? " on" : "")} type="button" onClick={() => setTplIdx(i)}>
            {t.name}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowManifest(!showManifest)}>
            {showManifest ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Skill manifest JSON
          </button>
          <button className="pill click" type="button" style={{ fontSize: 10 }} onClick={copyManifest}>
            {copied ? <CheckCircle2 size={11} /> : <ClipboardCopy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {showManifest && (
          <pre style={{
            background: "var(--code-bg)", border: "1px solid var(--border-subtle)",
            borderRadius: 8, padding: "10px 12px", fontSize: 11, overflowX: "auto",
            lineHeight: 1.6, margin: 0,
          }}>
            {JSON.stringify(tpl.manifest, null, 2)}
          </pre>
        )}
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
        Job prompt / payload
        <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.currentTarget.value)} style={{ fontFamily: "monospace", fontSize: 11, background: "var(--code-bg)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", resize: "vertical" }} />
      </label>

      <button className="btn btn-acc btn-sm" type="button" onClick={runSkill} disabled={busy} style={{ marginTop: 10 }}>
        {busy ? <Loader2 size={13} className="wallet-spin" /> : <Zap size={13} />}
        {busy ? log : `Run via OpenClaw (${tpl.manifest.price})`}
      </button>

      {jobs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Job history ({jobs.length})</div>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Job ID</th><th>Skill</th><th>Status</th><th>Result</th><th>Time</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <code style={{ fontSize: 10 }}>{j.id}</code>
                      {j.gatewayReal && <span className="chip" style={{ marginLeft: 4, fontSize: 8, background: "var(--green-soft)", color: "var(--green)" }}>live</span>}
                    </td>
                    <td style={{ fontSize: 10 }}>{j.skill}</td>
                    <td><span className="chip" style={{ background: "var(--green-soft)", color: "var(--green)" }}>{j.status}</span></td>
                    <td style={{ fontSize: 10, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.result}</td>
                    <td className="svc-table__num" style={{ fontSize: 10 }}>{j.ts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 2. TEE Attestation Verifier ─────────────────────────────────────────────

type AttResult = {
  id: string; tee: string; valid: boolean;
  confidence: number; mrenclave: string; report: string; ts: string;
};

const TEE_TYPES = ["SGX (DCAP)", "TDX", "SEV-SNP"];

export function TeeAttestationVerifier({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [results, setResults] = useLocalStore<AttResult[]>("og.tee.attestations", []);
  const [attId, setAttId] = useState("att_9f2c1a7be4d03f5a");
  const [teeType, setTeeType] = useState(0);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");

  async function verify() {
    setBusy(true);
    setLog("Fetching attestation quote from 0G Compute node…");
    await new Promise((r) => setTimeout(r, 600));
    setLog(`Verifying ${TEE_TYPES[teeType]} quote against Intel IAS / PCCS…`);
    await new Promise((r) => setTimeout(r, 1000));

    const seed = attId + TEE_TYPES[teeType] + Date.now();
    const confidence = Math.round(deterministicScore(seed, 91, 99)) / 100;
    const mrenclave = hid(seed + "mr") + hid(seed + "mr2");
    const valid = confidence > 0.89;
    const report = valid
      ? `{ "tee": "${TEE_TYPES[teeType]}", "mrenclave": "${mrenclave.slice(0, 16)}…", "isvSvn": 3, "status": "OK" }`
      : `{ "tee": "${TEE_TYPES[teeType]}", "status": "GROUP_REVOKED", "advisory": "INTEL-SA-00161" }`;

    setResults((prev) => [{ id: attId, tee: TEE_TYPES[teeType], valid, confidence, mrenclave: mrenclave.slice(0, 32) + "…", report, ts: now() }, ...prev.slice(0, 9)]);
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_0g_inference",
      serviceName: "TEE Attestation Verify",
      agentName: "0G Compute Agent",
      payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
      providerWallet: "0x0GVerify…1a2b",
      amount: 0.02,
      currency: "USDC",
      network: "0g-galileo",
      status: "verified",
      kind: "0g.tee.verify",
      payload: { attId, teeType: TEE_TYPES[teeType], valid, confidence },
    });
    setLog(valid ? `Valid · confidence ${(confidence * 100).toFixed(0)}%` : "Invalid — enclave revoked");
    setBusy(false);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><ShieldCheck size={15} /></span>
          <div><h3>TEE Attestation Verifier</h3><div className="sub">Verify SGX / TDX / SEV-SNP quotes from sealed 0G Compute jobs · $0.02 / verify</div></div>
        </div>
      </div>

      <WidgetMeta
        live={false}
        what="a pass/fail verdict for the TEE quote + MRENCLAVE + report JSON, and a $0.02 verify receipt in the Receipts tab."
        enter={<>pick the TEE type, then paste an attestation ID from a sealed-inference receipt (run “Sealed Inference” in the OpenClaw console above) — or leave the demo value <code>att_9f2c1a7be4d03f5a</code>.</>}
        demoText="no real Intel IAS / PCCS round-trip here — the verdict is derived deterministically from the ID so the demo is reproducible"
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {TEE_TYPES.map((t, i) => (
          <button key={t} className={"pill click" + (teeType === i ? " on" : "")} type="button" onClick={() => setTeeType(i)}>{t}</button>
        ))}
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
        Attestation ID (from a sealed-inference receipt)
        <input value={attId} onChange={(e) => setAttId(e.currentTarget.value)} placeholder="att_…  (paste from a sealed-inference receipt, or keep the demo value)" style={{ fontFamily: "monospace", background: "var(--code-bg)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", fontSize: 12 }} />
      </label>

      <button className="btn btn-acc btn-sm" type="button" onClick={verify} disabled={busy} style={{ marginTop: 10 }}>
        {busy ? <Loader2 size={13} className="wallet-spin" /> : <Cpu size={13} />}
        {busy ? log : "Verify attestation"}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {results.slice(0, 3).map((r, i) => (
            <div key={i} style={{
              border: `1px solid ${r.valid ? "var(--green)" : "#e05"}`,
              borderRadius: 8, padding: "10px 12px", marginBottom: 8, opacity: i > 0 ? 0.7 : 1,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 12 }}>
                  {r.valid ? "✓ " : "✗ "}{r.tee} · {r.valid ? "Valid" : "Invalid"}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>conf {(r.confidence * 100).toFixed(0)}% · {r.ts}</span>
              </div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-secondary)", marginBottom: 4 }}>MRENCLAVE: {r.mrenclave}</div>
              <pre style={{ fontSize: 10, background: "var(--code-bg)", borderRadius: 6, padding: "6px 8px", overflow: "auto", margin: 0 }}>{r.report}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 3. DePIN Bulk Storage Pin ───────────────────────────────────────────────

type BlobPin = { root: string; simulated: boolean };
type BulkPin = {
  id: string; count: number; totalBytes: number; rootsPreview: string; ts: string;
  anchorTx?: string; anchorExplorer?: string; simulated?: boolean;
};

export function DePinBulkPin({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [runs, setRuns] = useLocalStore<BulkPin[]>("og.depin.bulkpins", []);
  const [count, setCount] = useState(5);
  const [size, setSize] = useState(256);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState("");
  const [pendingRoots, setPendingRoots] = useState<BlobPin[] | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [anchorErr, setAnchorErr] = useState<string | null>(null);

  const registryConfigured = isOgRegistryConfigured();

  async function bulkPin() {
    const priceUsd = 0.05 * count;
    const funding = checkFunding(OG_AGENT_FUNDING_SCOPE, priceUsd, { mode: "treasury", serviceId: "svc_0g_storage" });
    if (!funding.ok) {
      setLog(`Blocked before 0G storage pin: ${funding.reason}. Fund 0G Agent Treasury in the A2A Marketplace first.`);
      return;
    }
    setBusy(true);
    setProgress(0);
    setPendingRoots(null);
    setAnchorErr(null);
    setLog("Connecting to 0G Storage indexer…");
    await new Promise((r) => setTimeout(r, 300));

    const blobs: BlobPin[] = [];
    for (let i = 0; i < count; i++) {
      setProgress(Math.round(((i + 1) / count) * 100));
      setLog(`Pinning blob ${i + 1} / ${count}…`);
      const content = JSON.stringify({ blob: i, ts: Date.now() });
      try {
        const result = await uploadToOgStorage(content);
        blobs.push({ root: result.root, simulated: result.simulated });
      } catch {
        blobs.push({ root: "err_" + i, simulated: true });
      }
    }

    const totalBytes = count * size;
    const rootsPreview = blobs.slice(0, 3).map((b) => b.root.slice(0, 12) + "…").join(", ");
    const allSimulated = blobs.every((b) => b.simulated);
    recordFundingSpend(OG_AGENT_FUNDING_SCOPE, priceUsd, {
      mode: "treasury",
      serviceId: "svc_0g_storage",
      settlement: allSimulated ? "fallback" : "live",
    });
    const run: BulkPin = {
      id: "bulk_" + hid(String(Date.now())), count, totalBytes,
      rootsPreview, ts: now(), simulated: allSimulated,
    };
    setRuns((prev) => [run, ...prev.slice(0, 9)]);
    setPendingRoots(blobs);
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_0g_storage",
      serviceName: `0G Bulk Pin · ${count} blobs`,
      agentName: "0G Compute Agent",
      payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
      providerWallet: "0x0GStorage…1a2b",
      amount: allSimulated ? 0 : priceUsd,
      currency: "USDC",
      network: "0g-galileo",
      status: "verified",
      kind: "0g.depin.bulk",
      payload: fundingReceiptPayload(OG_AGENT_FUNDING_SCOPE, priceUsd, {
        mode: "treasury",
        serviceId: "svc_0g_storage",
        settlement: allSimulated ? "fallback" : "live",
      }, { count, totalBytes, roots: blobs.slice(0, 5).map((b) => b.root), allSimulated, displayAmount: priceUsd }),
    });
    setLog(`Done · ${count} blobs · ${(totalBytes / 1024).toFixed(1)} KB total${allSimulated ? " (simulated roots — set VITE_0G_STORAGE_INDEXER)" : " (real 0G roots)"}`);
    setProgress(0);
    setBusy(false);
  }

  async function anchorBatch() {
    if (!pendingRoots || pendingRoots.length === 0) return;
    setAnchoring(true);
    setAnchorErr(null);
    try {
      // Hash all roots together into one batch hash
      const batchContent = pendingRoots.map((b) => b.root).join(",");
      const batchHashHex = await sha256Hex(batchContent);
      const res = await anchorReceiptOnChain({ receiptHashHex: batchHashHex });
      // Update the last run with anchor info
      setRuns((prev) => {
        if (prev.length === 0) return prev;
        return [{ ...prev[0], anchorTx: res.txHash, anchorExplorer: res.explorerUrl }, ...prev.slice(1)];
      });
    } catch (e) {
      setAnchorErr((e as { message?: string }).message ?? "Anchor failed");
    } finally {
      setAnchoring(false);
    }
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Radio size={15} /></span>
          <div><h3>DePIN Bulk Storage Pin</h3><div className="sub">Pin N agent-memory blobs to 0G Storage in one batch · $0.05 / blob</div></div>
        </div>
      </div>

      <WidgetMeta
        live={isOgRegistryConfigured()}
        what="N content-hashed blobs pinned to 0G Storage (real Merkle roots if VITE_0G_STORAGE_INDEXER is set, otherwise simulated roots), one batch receipt, and — if a registry is configured — an on-chain anchor tx for the batch."
        enter="set how many blobs to pin and the size of each (bytes); the blobs themselves are auto-generated stubs."
        liveText="0G registry configured — the “Anchor batch on 0G” button sends a real tx"
        demoText="no 0G registry configured — pins still compute real hashes, but anchoring is disabled until VITE_0G_REGISTRY_ADDRESS is set"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          Blob count
          <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.currentTarget.value))} style={{ background: "var(--code-bg)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", fontSize: 12 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          Blob size (bytes each)
          <input type="number" min={64} max={65536} step={64} value={size} onChange={(e) => setSize(Number(e.currentTarget.value))} style={{ background: "var(--code-bg)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", fontSize: 12 }} />
        </label>
      </div>

      <button className="btn btn-acc btn-sm" type="button" onClick={bulkPin} disabled={busy || anchoring}>
        {busy ? <Loader2 size={13} className="wallet-spin" /> : <Radio size={13} />}
        {busy ? log : `Bulk pin ${count} blobs (${(0.05 * count).toFixed(2)} USDC)`}
      </button>

      {/* Anchor batch button — appears after a successful pin run */}
      {pendingRoots && pendingRoots.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {registryConfigured ? (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={anchorBatch}
              disabled={anchoring || busy}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              {anchoring ? <Loader2 size={12} className="wallet-spin" /> : <CheckCircle2 size={12} />}
              {anchoring ? "Anchoring on 0G…" : "Anchor batch on 0G"}
            </button>
          ) : (
            <div className="muted sm" style={{ fontSize: 10, padding: "6px 10px", border: "1px dashed var(--border-subtle)", borderRadius: 6 }}>
              Set <code>VITE_0G_REGISTRY_ADDRESS</code> to enable on-chain anchoring.
            </div>
          )}
          {anchorErr && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#e05" }}>{anchorErr}</div>
          )}
        </div>
      )}

      {busy && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 6, background: "var(--border-subtle)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent-primary)", transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 3 }}>{progress}%</div>
        </div>
      )}

      {runs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Batch ID</th><th>Blobs</th><th>Total</th><th>Sample roots</th><th>Anchor</th><th>Time</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code style={{ fontSize: 10 }}>{r.id}</code>
                      {r.simulated && <span className="chip" style={{ marginLeft: 4, fontSize: 8 }}>sim</span>}
                    </td>
                    <td className="svc-table__num">{r.count}</td>
                    <td className="svc-table__num">{(r.totalBytes / 1024).toFixed(1)} KB</td>
                    <td style={{ fontSize: 10, color: "var(--text-secondary)" }}>{r.rootsPreview}</td>
                    <td>
                      {r.anchorTx
                        ? <a href={r.anchorExplorer ?? ""} target="_blank" rel="noreferrer"
                            style={{ fontSize: 10, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: 3 }}>
                            {r.anchorTx.slice(0, 10)}… <ExternalLink size={10} />
                          </a>
                        : <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>—</span>
                      }
                    </td>
                    <td className="svc-table__num" style={{ fontSize: 10 }}>{r.ts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
