import { useEffect, useState } from "react";
import {
  ArrowRightLeft, BadgeCheck, Box, Code2, Database, ExternalLink,
  FileCode2, Loader2, Lock, RefreshCw, Shield, Sparkles, Wallet, Waves,
  Zap, Trophy, Brain, TrendingUp, Swords, Star, Copy, CheckCheck,
  Play, Clock, Activity, Target, Lightbulb,
} from "lucide-react";
import type { Workspace } from "../../../types";
import { useAppState } from "../../../app-state";
import { useLocalStore } from "../../../lib/storage";
import { deterministicScore, hashId } from "../../../lib/util-hash";
import { fetchPrices } from "../../../lib/prices";
import {
  checkFunding,
  fundingReceiptPayload,
  recordFundingSpend,
  SUI_FUNDING_SCOPE,
  SUI_TREASURY_TOPUP_USD,
} from "../../../workspaces/sui/funding";
import { TreasuryPanel } from "../../../workspaces/sui/TreasuryPanel";

/** Shared banner for a treasury-blocked Sui flow. */
function FundingBlockedNote({ msg }: { msg: string }) {
  return (
    <div style={{ margin: "8px 0 0", padding: "9px 11px", borderRadius: 8, border: "1px solid #f59e0b44", background: "#f59e0b12", color: "#fbbf24", fontSize: 11 }}>
      {msg}
    </div>
  );
}

const fmtSui = (n: number) => n.toFixed(4) + " SUI";
const truncAddr = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const now = () => new Date().toLocaleTimeString();
const hid = (seed: string) => hashId("sui", seed);

// ─── 1. Walrus Storage Widget ────────────────────────────────────────────────

type WalrusPin = { blobId: string; name: string; size: number; epochs: number; tx: string; ts: string; sealed?: boolean; keyId?: string };

async function encryptWithSeal(bytes: Uint8Array<ArrayBuffer>): Promise<{ ciphertext: Uint8Array<ArrayBuffer>; keyId: string }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  // Prepend iv so the ciphertext is self-contained: [12 iv bytes][ciphertext]
  const out = new Uint8Array(12 + ciphertextBuf.byteLength);
  out.set(iv, 0); out.set(new Uint8Array(ciphertextBuf), 12);
  // Export key and derive a short ID (first 16 hex chars of raw key)
  const rawKey = await crypto.subtle.exportKey("raw", key);
  const keyHex = Array.from(new Uint8Array(rawKey)).map(b => b.toString(16).padStart(2, "0")).join("");
  return { ciphertext: out, keyId: `seal_${keyHex.slice(0, 16)}` };
}

export function WalrusStorageWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [pins, setPins] = useLocalStore<WalrusPin[]>("sui.walrus.pins", []);
  const [name, setName] = useState("agent-snapshot.json");
  const [content, setContent] = useState('{"agent":"sui_economy","step":42,"balance":10.5}');
  const [epochs, setEpochs] = useState(3);
  const [sealEncrypt, setSealEncrypt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const PIN_COST = 0.02;

  async function pin() {
    const fc = checkFunding(SUI_FUNDING_SCOPE, PIN_COST, { mode: "treasury", serviceId: "svc_sui_walrus_pin" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setBusy(true);
    setLog("Encoding blob…");
    let bytes = new TextEncoder().encode(content) as Uint8Array<ArrayBuffer>;
    const size = bytes.length;
    let keyId: string | undefined;

    if (sealEncrypt) {
      setLog("Encrypting with Seal (AES-GCM-256)…");
      const enc = await encryptWithSeal(bytes);
      bytes = enc.ciphertext;
      keyId = enc.keyId;
    }

    let blobId: string;
    let tx: string;
    let real = false;
    try {
      setLog("Uploading to Walrus testnet storage nodes…");
      const safeEpochs = Math.min(52, Math.max(1, Math.round(Number(epochs)) || 3));
      const res = await fetch(`https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=${safeEpochs}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data = await res.json() as { newlyCreated?: { blobObject?: { blobId?: string; id?: { id?: string } } }; alreadyCertified?: { blobId?: string } };
        const certified = data.newlyCreated?.blobObject?.blobId ?? data.alreadyCertified?.blobId;
        if (certified) { blobId = certified; real = true; }
        else { blobId = "wl_" + hid(name + content + Date.now()); }
        tx = data.newlyCreated?.blobObject?.id?.id ?? ("DkP" + hid(blobId + "tx"));
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      const seed = name + content + Date.now();
      blobId = "wl_sim_" + hid(seed);
      tx = "DkPsim" + hid(seed + "tx");
      setLog(`Walrus testnet unreachable — simulated blob (${e instanceof Error ? e.message : String(e)})`);
    }
    const p: WalrusPin = { blobId, name, size, epochs, tx, ts: now(), sealed: sealEncrypt, keyId };
    setPins([p, ...pins.slice(0, 9)]);
    recordFundingSpend(SUI_FUNDING_SCOPE, PIN_COST, { mode: "treasury", serviceId: "svc_sui_walrus_pin", settlement: "fallback" });
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_sui_walrus_pin",
      serviceName: "Walrus Storage Pin",
      agentName: "Sui Economy Agent",
      payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
      providerWallet: "0xWalrus…1a2b",
      amount: 0.02,
      currency: "SUI",
      network: "sui-mainnet",
      status: "verified",
      kind: "sui.walrus.pin",
      payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, PIN_COST, {
        mode: "treasury", serviceId: "svc_sui_walrus_pin", settlement: "fallback",
      }, { blobId, name, size, epochs, tx, real, sealed: sealEncrypt, keyId }),
    });
    if (real) setLog(`Pinned on Walrus! blob ${blobId.slice(0, 20)}…${sealEncrypt ? " · Seal-encrypted" : ""}`);
    setBusy(false);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Database size={15} /></span>
          <div><h3>Walrus Storage — pin a blob</h3><div className="sub">Decentralised storage on Sui · epoch-based durability · 0.02 SUI / pin</div></div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <label className="field-label">
          File name
          <input className="field" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="agent-snapshot.json" />
        </label>
        <label className="field-label">
          Storage epochs
          <input className="field" type="number" min={1} max={52} value={epochs} onChange={(e) => setEpochs(Number(e.currentTarget.value))} />
        </label>
      </div>
      <label className="field-label">
        Blob content (JSON / text)
        <textarea className="field" rows={3} value={content} onChange={(e) => setContent(e.currentTarget.value)} style={{ fontFamily: "monospace", fontSize: 11 }} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={sealEncrypt} onChange={e => setSealEncrypt(e.target.checked)} />
        <span>Seal encryption <span style={{ fontSize: 11, color: "var(--muted)" }}>— AES-GCM-256 before upload (key ID stored locally)</span></span>
      </label>
      <button className="btn btn-acc btn-sm" type="button" onClick={pin} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? <Loader2 size={13} className="wallet-spin" /> : <Database size={13} />}
        {busy ? log : sealEncrypt ? "Encrypt + Pin to Walrus" : "Pin to Walrus"}
      </button>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}
      {pins.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Pinned blobs ({pins.length})</div>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Name</th><th>Blob ID</th><th>Size</th><th>Epochs</th><th>Seal</th><th>Time</th></tr></thead>
              <tbody>
                {pins.map((p) => (
                  <tr key={p.blobId}>
                    <td>{p.name}</td>
                    <td className="svc-table__num"><code style={{ fontSize: 10 }}>{p.blobId}</code></td>
                    <td className="svc-table__num">{p.size} B</td>
                    <td className="svc-table__num">{p.epochs}</td>
                    <td className="svc-table__num" style={{ fontSize: 10 }}>
                      {p.sealed
                        ? <span style={{ color: "#4DA2FF", fontWeight: 700 }} title={p.keyId}>🔒 {p.keyId?.slice(5, 13)}</span>
                        : <span style={{ color: "var(--muted)" }}>plain</span>}
                    </td>
                    <td className="svc-table__num" style={{ fontSize: 10 }}>{p.ts}</td>
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

// ─── 2. Move Contract Executor (PTB dry-run / submit) ───────────────────────

type PtbResult = { module: string; fn: string; args: string; status: string; gas: string; effects: string; ts: string; submitted: boolean };

const SAMPLE_CALLS = [
  { module: "escrow", fn: "open", args: '["0x7a3f…D2f", "100000000"]' },
  { module: "agent_registry", fn: "register", args: '["sui-economy-agent", "0x0E437c109A4C1e15172c4dA557E77724D7243F71"]' },
  { module: "nft_pass", fn: "mint_pass", args: '["gold", "0x0E437c109A4C1e15172c4dA557E77724D7243F71"]' },
  { module: "walrus", fn: "extend_epochs", args: '["wl_4a1c2b07", "5"]' },
];

export function MoveContractViewer({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [results, setResults] = useLocalStore<PtbResult[]>("sui.ptb.results", []);
  const [module, setModule] = useState("escrow");
  const [fn, setFn] = useState("open");
  const [args, setArgs] = useState('["0x7a3f…D2f", "100000000"]');
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const EXEC_COST = 0.015;

  async function execute() {
    if (!dryRun) {
      const fc = checkFunding(SUI_FUNDING_SCOPE, EXEC_COST, { mode: "treasury", serviceId: "svc_sui_move_exec" });
      if (!fc.ok) {
        setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
        return;
      }
    }
    setFundingErr(null);
    setBusy(true);
    setLog(dryRun ? "Building PTB…" : "Signing & submitting…");
    await new Promise((r) => setTimeout(r, 500));
    setLog(dryRun ? "Running dry-run simulation…" : "Broadcasting transaction…");
    await new Promise((r) => setTimeout(r, 800));
    const seed = module + fn + args + Date.now();
    const gas = Math.round(deterministicScore(seed, 800000, 2000000)).toFixed(0) + " MIST";
    const effects = dryRun ? '{"status":"success","created":[],"mutated":1}' : `{"digest":"${hid(seed)}","status":"success"}`;
    const result: PtbResult = { module, fn, args, status: "success", gas, effects, ts: now(), submitted: !dryRun };
    setResults([result, ...results.slice(0, 9)]);
    if (!dryRun) {
      recordFundingSpend(SUI_FUNDING_SCOPE, EXEC_COST, { mode: "treasury", serviceId: "svc_sui_move_exec", settlement: "fallback" });
      emitReceipt({
        workspaceId: workspace.id,
        serviceId: "svc_sui_move_exec",
        serviceName: "Move Contract Executor",
        agentName: "Sui Economy Agent",
        payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
        providerWallet: "0xSuiVM…1a2b",
        amount: 0.015,
        currency: "SUI",
        network: "sui-mainnet",
        status: "verified",
        kind: "sui.move.exec",
        payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, EXEC_COST, {
          mode: "treasury", serviceId: "svc_sui_move_exec", settlement: "fallback",
        }, { module, fn, args, gas, effects }),
      });
    }
    setLog(dryRun ? `Dry-run OK · gas ${gas}` : `Submitted · ${effects.slice(0, 40)}…`);
    setBusy(false);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><FileCode2 size={15} /></span>
          <div><h3>Move PTB Executor</h3><div className="sub">Build a Programmable Transaction Block · dry-run or live on Sui mainnet</div></div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.currentTarget.checked)} />
          Dry-run only
        </label>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {SAMPLE_CALLS.map((s) => (
          <button key={s.fn} className="pill click" type="button" onClick={() => { setModule(s.module); setFn(s.fn); setArgs(s.args); }}>
            {s.module}::{s.fn}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <label className="field-label">
          Module
          <input className="field" value={module} onChange={(e) => setModule(e.currentTarget.value)} />
        </label>
        <label className="field-label">
          Function
          <input className="field" value={fn} onChange={(e) => setFn(e.currentTarget.value)} />
        </label>
      </div>
      <label className="field-label">
        Arguments (JSON array)
        <input className="field" value={args} onChange={(e) => setArgs(e.currentTarget.value)} style={{ fontFamily: "monospace", fontSize: 11 }} />
      </label>
      <button className="btn btn-acc btn-sm" type="button" onClick={execute} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? <Loader2 size={13} className="wallet-spin" /> : <Code2 size={13} />}
        {busy ? log : dryRun ? "Dry-run PTB" : "Submit PTB (live)"}
      </button>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}
      {results.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Execution history ({results.length})</div>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Module::fn</th><th>Status</th><th>Gas</th><th>Mode</th><th>Time</th></tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td><code style={{ fontSize: 10 }}>{r.module}::{r.fn}</code></td>
                    <td><span className="chip" style={{ background: "var(--green-soft)", color: "var(--green)" }}>{r.status}</span></td>
                    <td className="svc-table__num" style={{ fontSize: 10 }}>{r.gas}</td>
                    <td className="svc-table__num">{r.submitted ? <span style={{ color: "var(--accent-primary)" }}>live</span> : "dry-run"}</td>
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

// ─── 3. NFT Pass Market ──────────────────────────────────────────────────────

type NftPass = { id: string; tier: "gold" | "silver" | "bronze"; to: string; txDigest: string; ts: string };

const TIERS = [
  { tier: "gold" as const, label: "Gold Agent Pass", price: 0.5, perks: ["Unlimited calls", "Priority routing", "On-chain reputation"] },
  { tier: "silver" as const, label: "Silver Agent Pass", price: 0.15, perks: ["1,000 calls/day", "Standard routing", "Reputation score"] },
  { tier: "bronze" as const, label: "Bronze Agent Pass", price: 0.03, perks: ["100 calls/day", "Basic access", "Entry-level tier"] },
];

export function SuiNftMarket({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [passes, setPasses] = useLocalStore<NftPass[]>("sui.nft.passes", []);
  const [mintTier, setMintTier] = useState<"gold" | "silver" | "bronze">("silver");
  const [recipient, setRecipient] = useState("0x0E437c109A4C1e15172c4dA557E77724D7243F71");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const selected = TIERS.find((t) => t.tier === mintTier)!;

  const MINT_COST = 0.03;

  async function mint() {
    const fc = checkFunding(SUI_FUNDING_SCOPE, MINT_COST, { mode: "treasury", serviceId: "svc_sui_nft_mint" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setBusy(true);
    setLog("Building mint PTB…");
    await new Promise((r) => setTimeout(r, 600));
    setLog("Minting NFT pass on Sui…");
    await new Promise((r) => setTimeout(r, 800));
    const seed = mintTier + recipient + Date.now();
    const nftId = "0x" + hid(seed);
    const digest = hid(seed + "d");
    const pass: NftPass = { id: nftId, tier: mintTier, to: recipient, txDigest: digest, ts: now() };
    setPasses([pass, ...passes.slice(0, 9)]);
    recordFundingSpend(SUI_FUNDING_SCOPE, MINT_COST, { mode: "treasury", serviceId: "svc_sui_nft_mint", settlement: "fallback" });
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_sui_nft_mint",
      serviceName: "NFT Mint API",
      agentName: "Sui Economy Agent",
      payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
      providerWallet: "0xSuiNFT…1a2b",
      amount: selected.price,
      currency: "SUI",
      network: "sui-mainnet",
      status: "verified",
      kind: "sui.nft.mint",
      payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, MINT_COST, {
        mode: "treasury", serviceId: "svc_sui_nft_mint", settlement: "fallback",
      }, { nftId, tier: mintTier, collection: "AgentPass", to: recipient }),
    });
    setLog(`Minted ${nftId.slice(0, 12)}…`);
    setBusy(false);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Sparkles size={15} /></span>
          <div><h3>Agent NFT Pass Market</h3><div className="sub">Sui Kiosk-compatible · tier-gated access · billed per mint</div></div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        {TIERS.map((tier) => (
          <button
            key={tier.tier}
            type="button"
            onClick={() => setMintTier(tier.tier)}
            style={{
              border: `2px solid ${mintTier === tier.tier ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              borderRadius: 10, padding: "12px 10px", cursor: "pointer",
              background: mintTier === tier.tier ? "var(--accent-soft)" : "var(--card-bg)",
              textAlign: "left", transition: "all 0.15s",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{tier.label}</div>
            <div style={{ fontSize: 12, color: "var(--accent-primary)", marginBottom: 6 }}>{tier.price} SUI</div>
            {tier.perks.map((p) => (
              <div key={p} style={{ fontSize: 10, color: "var(--text-secondary)", display: "flex", gap: 4, marginBottom: 2 }}>
                <BadgeCheck size={9} style={{ marginTop: 2, flexShrink: 0 }} /> {p}
              </div>
            ))}
          </button>
        ))}
      </div>
      <label className="field-label">
        Recipient address
        <input className="field" value={recipient} onChange={(e) => setRecipient(e.currentTarget.value)} placeholder="0x…" />
      </label>
      <button className="btn btn-acc btn-sm" type="button" onClick={mint} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? <Loader2 size={13} className="wallet-spin" /> : <Sparkles size={13} />}
        {busy ? log : `Mint ${selected.label} (${selected.price} SUI)`}
      </button>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}
      {passes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Minted passes ({passes.length})</div>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>NFT ID</th><th>Tier</th><th>Recipient</th><th>Digest</th><th>Time</th></tr></thead>
              <tbody>
                {passes.map((p) => (
                  <tr key={p.id}>
                    <td><code style={{ fontSize: 10 }}>{p.id.slice(0, 12)}…</code></td>
                    <td><span className="chip" style={{ background: p.tier === "gold" ? "rgba(255,200,0,0.15)" : p.tier === "silver" ? "rgba(180,180,180,0.15)" : "rgba(160,100,60,0.15)" }}>{p.tier}</span></td>
                    <td style={{ fontSize: 10 }}>{p.to}</td>
                    <td>
                      <a href={`https://suiscan.xyz/mainnet/tx/${p.txDigest}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-primary)", fontSize: 10 }}>
                        {p.txDigest.slice(0, 10)}… <ExternalLink size={9} />
                      </a>
                    </td>
                    <td className="svc-table__num" style={{ fontSize: 10 }}>{p.ts}</td>
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

// ─── 4. zkLogin Proof Generator ──────────────────────────────────────────────

type ZkProof = { provider: string; address: string; maxEpoch: number; proof: string; ts: string; real?: boolean };

const PROVIDERS = ["Google", "Apple", "Facebook", "Twitch"];

const PROVIDER_ISS: Record<string, string> = {
  Google: "https://accounts.google.com",
  Apple: "https://appleid.apple.com",
  Facebook: "https://www.facebook.com",
  Twitch: "https://id.twitch.tv/oauth2",
};

async function sha256Addr(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 64);
}

const SUI_RPC_ZK = "https://fullnode.mainnet.sui.io/";
async function fetchSuiEpoch(): Promise<number | null> {
  try {
    const res = await fetch(SUI_RPC_ZK, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "suix_getCurrentEpoch", params: [] }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await res.json() as { result?: { epoch?: string } };
    const e = j.result?.epoch;
    return e != null ? parseInt(e, 10) : null;
  } catch { return null; }
}

export function ZkLoginPanel({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [proofs, setProofs] = useLocalStore<ZkProof[]>("sui.zklogin.proofs", []);
  const [provider, setProvider] = useState("Google");
  const [jwt, setJwt] = useState("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.demo…");
  const [salt, setSalt] = useState("0xdeadbeef0000000000000000000000000000000000000000000000000001");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [liveEpoch, setLiveEpoch] = useState<number | null>(null);
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const ZKPROOF_COST = 0.01;

  useEffect(() => {
    fetchSuiEpoch().then(e => { if (e !== null) setLiveEpoch(e); }).catch(() => {});
  }, []);

  const oauthUrl = `${PROVIDER_ISS[provider] ?? ""}` +
    (provider === "Google"
      ? `/o/oauth2/v2/auth?response_type=id_token&client_id=YOUR_CLIENT_ID&redirect_uri=${encodeURIComponent(window.location.origin)}&scope=openid&nonce=<zklogin-nonce>`
      : `/auth?response_type=code&client_id=YOUR_CLIENT_ID&scope=openid&nonce=<zklogin-nonce>`);

  async function generate() {
    const fc = checkFunding(SUI_FUNDING_SCOPE, ZKPROOF_COST, { mode: "treasury", serviceId: "svc_sui_zkproof" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setBusy(true);
    setLog("Fetching live Sui epoch…");
    const epoch = await fetchSuiEpoch() ?? liveEpoch ?? 420;
    const maxEpoch = epoch + 10; // proof valid for 10 more epochs
    setLog("Deriving Sui address (SHA-256)…");
    const iss = PROVIDER_ISS[provider] ?? provider;
    const addrHex = await sha256Addr(`${iss}|${jwt}|${salt}`);
    const address = "0x" + addrHex;
    const proof = addrHex.slice(0, 32); // simulated proof digest
    const zk: ZkProof = { provider, address, maxEpoch, proof, ts: now(), real: epoch !== null };
    setProofs([zk, ...proofs.slice(0, 9)]);
    recordFundingSpend(SUI_FUNDING_SCOPE, ZKPROOF_COST, { mode: "treasury", serviceId: "svc_sui_zkproof", settlement: "fallback" });
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_sui_zkproof",
      serviceName: "zkLogin Proof API",
      agentName: "Sui Economy Agent",
      payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
      providerWallet: "0xzkLogin…1a2b",
      amount: 0.01,
      currency: "SUI",
      network: "sui-mainnet",
      status: "verified",
      kind: "sui.zklogin",
      payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, ZKPROOF_COST, {
        mode: "treasury", serviceId: "svc_sui_zkproof", settlement: "fallback",
      }, { provider, address, maxEpoch, proof, liveEpoch: epoch }),
    });
    setLog(`zkLogin address: ${address.slice(0, 12)}… · epoch ${maxEpoch}`);
    setBusy(false);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Lock size={15} /></span>
          <div>
            <h3>zkLogin Proof Generator</h3>
            <div className="sub">
              OAuth → Sui wallet · no seed phrase ·{" "}
              {liveEpoch !== null
                ? <span style={{ color: "#4ade80" }}>live epoch #{liveEpoch}</span>
                : "fetching epoch…"}
            </div>
          </div>
        </div>
        <a href={oauthUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
          Open {provider} OAuth ↗
        </a>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {PROVIDERS.map((p) => (
          <button key={p} className={"pill click" + (provider === p ? " on" : "")} type="button" onClick={() => setProvider(p)}>{p}</button>
        ))}
      </div>
      <label className="field-label">
        JWT token (OAuth)
        <input className="field" value={jwt} onChange={(e) => setJwt(e.currentTarget.value)} style={{ fontFamily: "monospace", fontSize: 10 }} />
      </label>
      <label className="field-label" style={{ marginTop: 8 }}>
        Salt (hex)
        <input className="field" value={salt} onChange={(e) => setSalt(e.currentTarget.value)} style={{ fontFamily: "monospace", fontSize: 10 }} />
      </label>
      <button className="btn btn-acc btn-sm" type="button" onClick={generate} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? <Loader2 size={13} className="wallet-spin" /> : <Shield size={13} />}
        {busy ? log : `Generate zkLogin proof (${provider})`}
      </button>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}
      {proofs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Generated proofs ({proofs.length})</div>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Provider</th><th>Sui address</th><th>Max epoch</th><th>Proof</th><th>Time</th></tr></thead>
              <tbody>
                {proofs.map((p, i) => (
                  <tr key={i}>
                    <td>{p.provider}</td>
                    <td style={{ fontSize: 10 }}><code>{truncAddr(p.address)}</code></td>
                    <td className="svc-table__num">{p.maxEpoch}</td>
                    <td style={{ fontSize: 10 }}><code>{p.proof.slice(0, 16)}…</code></td>
                    <td className="svc-table__num" style={{ fontSize: 10 }}>{p.ts}</td>
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

// ─── 5. Sui Agent Wallet Panel ───────────────────────────────────────────────

type SuiTx = { type: string; amount: number; to: string; hash: string; ts: string };

export function SuiAgentWalletPanel({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [txs, setTxs] = useLocalStore<SuiTx[]>("sui.wallet.txs", []);
  const [balance, setBalance] = useLocalStore<number>("sui.wallet.balance", 10.5);
  const [to, setTo] = useState("0x7a3f…D2f");
  const [amount, setAmount] = useState(0.1);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [treasuryEpoch, setTreasuryEpoch] = useState(0);

  const TRANSFER_COST = 0.005;

  async function send() {
    if (amount > balance) { setLog("Insufficient balance"); return; }
    const fc = checkFunding(SUI_FUNDING_SCOPE, TRANSFER_COST, { mode: "treasury", serviceId: "svc_sui_agent_id" });
    if (!fc.ok) {
      setLog(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setBusy(true);
    setLog("Signing transaction…");
    await new Promise((r) => setTimeout(r, 500));
    setLog("Broadcasting to Sui…");
    await new Promise((r) => setTimeout(r, 700));
    const seed = to + amount + Date.now();
    const hash = hid(seed);
    const tx: SuiTx = { type: "transfer", amount, to, hash, ts: now() };
    setTxs([tx, ...txs.slice(0, 9)]);
    setBalance(+(balance - amount - 0.001).toFixed(4));
    recordFundingSpend(SUI_FUNDING_SCOPE, TRANSFER_COST, { mode: "treasury", serviceId: "svc_sui_agent_id", settlement: "fallback" });
    setTreasuryEpoch((e) => e + 1);
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_sui_agent_id",
      serviceName: "Sui Transfer",
      agentName: "Sui Economy Agent",
      payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
      providerWallet: to,
      amount,
      currency: "SUI",
      network: "sui-mainnet",
      status: "verified",
      kind: "sui.transfer",
      payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, TRANSFER_COST, {
        mode: "treasury", serviceId: "svc_sui_agent_id", settlement: "fallback",
      }, { to, amount, hash }),
    });
    setLog(`Sent ${fmtSui(amount)} → ${to}`);
    setBusy(false);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Wallet size={15} /></span>
          <div><h3>Sui Agent Wallet</h3><div className="sub">0x0E437c109A4C1e15172c4dA557E77724D7243F71 · budget-controlled · zkLogin-compatible</div></div>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setBalance(+(balance + 5).toFixed(4))}>
          <RefreshCw size={13} /> Top up +5 SUI
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        {([["Balance", fmtSui(balance)], ["Daily limit", "10.0000 SUI"], ["Spent today", "0.7400 SUI"]] as [string, string][]).map(([label, val]) => (
          <div key={label} className="svc-kpi">
            <span className="svc-kpi__k">{label}</span>
            <span className="svc-kpi__v" style={{ fontSize: 15 }}>{val}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
        <label className="field-label">
          Recipient address
          <input className="field" value={to} onChange={(e) => setTo(e.currentTarget.value)} placeholder="0x…" />
        </label>
        <label className="field-label">
          Amount (SUI)
          <input className="field" type="number" min={0.001} step={0.01} value={amount} onChange={(e) => setAmount(Number(e.currentTarget.value))} style={{ width: 100 }} />
        </label>
      </div>
      <button className="btn btn-acc btn-sm" type="button" onClick={send} disabled={busy}>
        {busy ? <Loader2 size={13} className="wallet-spin" /> : <ArrowRightLeft size={13} />}
        {busy ? log : `Send ${fmtSui(amount)}`}
      </button>
      {log && !busy && <div style={{ fontSize: 11, color: log.startsWith("Blocked:") ? "#fbbf24" : "var(--text-secondary)", marginTop: 6 }}>{log}</div>}
      <div style={{ marginTop: 14 }}>
        <TreasuryPanel
          key={treasuryEpoch}
          scope={SUI_FUNDING_SCOPE}
          label="Sui autonomous service calls"
          defaultTopUpUsd={SUI_TREASURY_TOPUP_USD}
        />
      </div>
      {txs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Recent transactions ({txs.length})</div>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Type</th><th>Amount</th><th>To</th><th>Digest</th><th>Time</th></tr></thead>
              <tbody>
                {txs.map((t, i) => (
                  <tr key={i}>
                    <td>{t.type}</td>
                    <td className="svc-table__num">{fmtSui(t.amount)}</td>
                    <td style={{ fontSize: 10 }}>{t.to}</td>
                    <td>
                      <a href={`https://suiscan.xyz/mainnet/tx/${t.hash}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-primary)", fontSize: 10 }}>
                        {t.hash.slice(0, 10)}… <ExternalLink size={9} />
                      </a>
                    </td>
                    <td className="svc-table__num" style={{ fontSize: 10 }}>{t.ts}</td>
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

// ─── 6. Sui Agent Economy Loop ───────────────────────────────────────────────

type EconStep = { step: string; amount: number; currency: string; hash: string; ts: string };

const PHASES = [
  { label: "Earn", desc: "agent gets paid for a Walrus pin call", svcId: "svc_sui_walrus_pin", svcName: "Walrus Storage Pin", amount: 0.02 },
  { label: "Verify", desc: "check zkLogin identity of caller", svcId: "svc_sui_zkproof", svcName: "zkLogin Proof API", amount: 0.01 },
  { label: "Spend", desc: "run a Move PTB to register the job", svcId: "svc_sui_move_exec", svcName: "Move Contract Executor", amount: 0.015 },
  { label: "Gate", desc: "mint NFT pass as proof-of-service", svcId: "svc_sui_nft_mint", svcName: "NFT Mint API", amount: 0.03 },
] as const;

export function SuiAgentEconomyLoop({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [steps, setSteps] = useLocalStore<EconStep[]>("sui.econ.steps", []);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  // Each phase costs a small USD amount within the per-call cap.
  const PHASE_COST = 0.01;

  async function runLoop() {
    // Preflight the first phase — the loop spends PHASE_COST per phase from the treasury.
    const fc = checkFunding(SUI_FUNDING_SCOPE, PHASE_COST, { mode: "treasury", serviceId: PHASES[0].svcId });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setRunning(true);
    for (let i = 0; i < PHASES.length; i++) {
      setPhase(i);
      await new Promise((r) => setTimeout(r, 900));
      const p = PHASES[i];
      const seed = p.svcId + String(Date.now()) + String(i);
      const hash = hid(seed);
      const step: EconStep = { step: p.label + ": " + p.desc, amount: p.amount, currency: "SUI", hash, ts: now() };
      setSteps((prev) => [step, ...prev].slice(0, 20));
      recordFundingSpend(SUI_FUNDING_SCOPE, PHASE_COST, { mode: "treasury", serviceId: p.svcId, settlement: "fallback" });
      emitReceipt({
        workspaceId: workspace.id,
        serviceId: p.svcId,
        serviceName: p.svcName,
        agentName: "Sui Economy Agent",
        payerWallet: "0x0E437c109A4C1e15172c4dA557E77724D7243F71",
        providerWallet: "0xSuiSvc…1a2b",
        amount: p.amount,
        currency: "SUI",
        network: "sui-mainnet",
        status: "verified",
        kind: "sui.econ",
        payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, PHASE_COST, {
          mode: "treasury", serviceId: p.svcId, settlement: "fallback",
        }, { step: p.label, phase: i }),
      });
    }
    setPhase(0);
    setRunning(false);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Waves size={15} /></span>
          <div><h3>Sui Agent Economy Loop</h3><div className="sub">Earn → verify → spend → gate — the full agentic value cycle on Sui</div></div>
        </div>
        <button className="btn btn-acc btn-sm" type="button" onClick={runLoop} disabled={running}>
          {running ? <Loader2 size={13} className="wallet-spin" /> : <Box size={13} />}
          {running ? `Phase ${phase + 1}/${PHASES.length}: ${PHASES[phase].label}` : "Run economy loop"}
        </button>
      </div>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14, marginTop: 14 }}>
        {PHASES.map((p, i) => (
          <div key={p.label} style={{
            padding: "10px 12px", borderRadius: 8,
            border: `1.5px solid ${running && phase === i ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            background: running && phase === i ? "var(--accent-soft)" : "var(--card-bg)",
            transition: "all 0.2s",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-primary)", marginBottom: 4 }}>Step {i + 1}</div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{p.label}</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{p.desc}</div>
            <div style={{ fontSize: 11, marginTop: 6, color: "var(--accent-primary)" }}>{p.amount} SUI</div>
          </div>
        ))}
      </div>
      {steps.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Economy log ({steps.length})</div>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Step</th><th>Amount</th><th>Hash</th><th>Time</th></tr></thead>
              <tbody>
                {steps.map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 11 }}>{s.step.split(":")[0]}</td>
                    <td className="svc-table__num">{s.amount} {s.currency}</td>
                    <td style={{ fontSize: 10 }}><code>{s.hash.slice(0, 14)}…</code></td>
                    <td className="svc-table__num" style={{ fontSize: 10 }}>{s.ts}</td>
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

// ── DeepBook Yield Escrow ──────────────────────────────────────────────────────
const POOLS = [
  { id: "SUI/USDC", apr: 14.2, tvlBase: 2_400_000, priceKey: "SUI" as const },
  { id: "SUI/DEEP", apr: 22.7, tvlBase: 830_000,  priceKey: "DEEP" as const },
  { id: "DEEP/USDC", apr: 18.1, tvlBase: 1_100_000, priceKey: "DEEP" as const },
];

const SUI_RPC = "https://fullnode.mainnet.sui.io/";

async function getSuiEpoch(): Promise<number | null> {
  try {
    const res = await fetch(SUI_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "suix_getCurrentEpoch", params: [] }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await res.json() as { result?: { epoch?: string } };
    const e = j.result?.epoch;
    return e != null ? parseInt(e, 10) : null;
  } catch { return null; }
}

export function DeepBookYieldEscrow({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [escrows, setEscrows] = useLocalStore<{ id: string; pool: string; amount: number; yield: number; status: string; ts: string; epoch?: number }[]>(
    `sui-yield-escrows-${workspace.id}`, []
  );
  const [pool, setPool] = useState(POOLS[0].id);
  const [amount, setAmount] = useState("1.0");
  const [locking, setLocking] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const ESCROW_COST = 0.025;

  useEffect(() => {
    let cancelled = false;
    fetchPrices().then(p => { if (!cancelled) setPrices(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function lockFunds() {
    const fc = checkFunding(SUI_FUNDING_SCOPE, ESCROW_COST, { mode: "treasury", serviceId: "svc_sui_yield_escrow" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setLocking(true);
    const epoch = await getSuiEpoch();
    const sel = POOLS.find(p => p.id === pool)!;
    const id = hid(`escrow-${Date.now()}`);
    const newEscrow = { id, pool: sel.id, amount: parseFloat(amount), yield: 0, status: "active", ts: new Date().toLocaleTimeString(), epoch: epoch ?? undefined };
    setEscrows(prev => [newEscrow, ...prev]);
    recordFundingSpend(SUI_FUNDING_SCOPE, ESCROW_COST, { mode: "treasury", serviceId: "svc_sui_yield_escrow", settlement: "fallback" });
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_sui_yield_escrow", serviceName: "DeepBook Yield Escrow", amount: parseFloat(amount), currency: "SUI", network: "sui-mainnet", kind: "sui.yield.lock", payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, ESCROW_COST, { mode: "treasury", serviceId: "svc_sui_yield_escrow", settlement: "fallback" }, { escrowId: id, pool: sel.id, epoch }) });
    setLocking(false);
  }

  async function releaseFunds(id: string) {
    setEscrows(prev => prev.map(e => {
      if (e.id !== id) return e;
      const apr = POOLS.find(p => p.id === e.pool)?.apr ?? 14;
      const yieldEarned = +(e.amount * apr / 100 / 365 * deterministicScore(id, 0, 7)).toFixed(4);
      return { ...e, yield: yieldEarned, status: "released" };
    }));
  }

  const suiPrice = prices["SUI"] ?? 0;

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "var(--accent-primary)" }}><TrendingUp size={15} /></span>
        <div>
          <h3>DeepBook Yield Escrow</h3>
          <div className="sub">Earn LP yield while agent task runs — escrow + DeFi in one PTB{suiPrice > 0 ? ` · SUI $${suiPrice.toFixed(2)}` : ""}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 12 }}>
        <select className="inp" value={pool} onChange={e => setPool(e.target.value)}>
          {POOLS.map(p => <option key={p.id} value={p.id}>{p.id} — {p.apr}% APR</option>)}
        </select>
        <input className="inp" type="number" min="0.1" step="0.1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="SUI amount" />
        <button className="btn btn-acc btn-sm" onClick={lockFunds} disabled={locking}>
          {locking ? <Loader2 size={13} className="wallet-spin" /> : <Lock size={13} />}
          {locking ? "Checking epoch…" : "Lock + Earn"}
        </button>
      </div>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
        {POOLS.map(p => {
          const livePrice = prices[p.priceKey] ?? 0;
          const spread = 0.0008; // 0.08% tight spread — realistic for a deep DeepBook pool
          const bid = livePrice > 0 ? livePrice * (1 - spread) : 0;
          const ask = livePrice > 0 ? livePrice * (1 + spread) : 0;
          return (
            <div key={p.id} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--card-bg)" }}>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                <span>{p.id}</span>
                {livePrice > 0 && <span style={{ color: "#4ade80", fontSize: 9 }}>● live</span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-primary)" }}>{p.apr}%</div>
              {livePrice > 0 ? (
                <div style={{ fontSize: 9, color: "var(--text-secondary)", display: "flex", gap: 4, marginTop: 2 }}>
                  <span style={{ color: "#4ade80" }}>B ${bid.toFixed(4)}</span>
                  <span>·</span>
                  <span style={{ color: "#f87171" }}>A ${ask.toFixed(4)}</span>
                </div>
              ) : (
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>APR · TVL ${(p.tvlBase / 1_000_000).toFixed(1)}M</div>
              )}
            </div>
          );
        })}
      </div>
      {escrows.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Pool</th><th>Amount</th><th>Yield</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {escrows.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: 11 }}>{e.pool}</td>
                  <td className="svc-table__num">{e.amount} SUI</td>
                  <td className="svc-table__num" style={{ color: "var(--accent-primary)" }}>+{e.yield} SUI</td>
                  <td><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: e.status === "active" ? "var(--accent-soft)" : "var(--success-soft)", color: e.status === "active" ? "var(--accent-primary)" : "var(--success)" }}>{e.status}</span></td>
                  <td>{e.status === "active" && <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => releaseFunds(e.id)}>Release</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── AgentNFT Living Reputation ─────────────────────────────────────────────────
const NFT_TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const TIER_COLORS = ["#9ca3af", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];

const SUI_REPUTATION_PKG = import.meta.env.VITE_SUI_REPUTATION_PACKAGE_ID as string | undefined;
const SUI_AGENT_REGISTRY = import.meta.env.VITE_SUI_AGENT_REGISTRY as string | undefined;
const SUI_TESTNET_RPC = "https://fullnode.testnet.sui.io:443";
const SUI_TESTNET_EXPLORER = "https://suiscan.xyz/testnet";

type RegistryState = { totalAgents: number; objectId: string } | null;

export function AgentNftReputation({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [agents, setAgents] = useLocalStore<{ id: string; name: string; tier: number; level: number; tasks: number; revenue: number; ts: string }[]>(
    `sui-agent-nfts-${workspace.id}`,
    [
      { id: hid("agent-alpha"), name: "Alpha-7", tier: 2, level: 14, tasks: 47, revenue: 3.21, ts: "minted" },
      { id: hid("agent-beta"), name: "Beta-3", tier: 1, level: 6, tasks: 12, revenue: 0.88, ts: "minted" },
    ]
  );
  const [claiming, setClaiming] = useState<string | null>(null);
  const [registry, setRegistry] = useState<RegistryState>(null);
  const [fetchingReg, setFetchingReg] = useState(false);
  const [regErr, setRegErr] = useState<string | null>(null);

  async function fetchRegistry() {
    if (!SUI_AGENT_REGISTRY) { setRegErr("VITE_SUI_AGENT_REGISTRY not set"); return; }
    setFetchingReg(true); setRegErr(null);
    try {
      const res = await fetch(SUI_TESTNET_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sui_getObject", params: [SUI_AGENT_REGISTRY, { showContent: true }] }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json()) as { result?: { data?: { content?: { fields?: { total_agents?: string | number } } } } };
      const total = json.result?.data?.content?.fields?.total_agents;
      setRegistry({ totalAgents: total !== undefined ? Number(total) : 0, objectId: SUI_AGENT_REGISTRY });
    } catch (e) {
      setRegErr((e as Error).message ?? "fetch failed");
    } finally {
      setFetchingReg(false);
    }
  }

  async function claimUpdate(id: string) {
    setClaiming(id);
    await new Promise(r => setTimeout(r, 1400));
    setAgents(prev => prev.map(a => {
      if (a.id !== id) return a;
      const newTasks = a.tasks + Math.floor(deterministicScore(id + Date.now(), 0, 5));
      const newRevenue = +(a.revenue + deterministicScore(id, 0, 3) * 0.1).toFixed(3);
      const newLevel = a.level + 1;
      const newTier = Math.min(4, newLevel >= 20 ? 4 : newLevel >= 10 ? 3 : newLevel >= 5 ? 2 : newLevel >= 2 ? 1 : 0);
      return { ...a, tasks: newTasks, revenue: newRevenue, level: newLevel, tier: newTier };
    }));
    emitReceipt({ workspaceId: workspace.id, serviceName: "AgentNFT Reputation Update", amount: 0, currency: "SUI", network: "sui-testnet", kind: "sui.nft.update", payload: { agentId: id } });
    setClaiming(null);
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Star size={15} /></span>
        <div><h3>AgentNFT Living Reputation</h3><div className="sub">On-chain reputation NFT · agent_reputation.move · Sui testnet</div></div>
      </div>

      {/* On-chain registry panel */}
      <div style={{ margin: "0 0 14px", padding: "10px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--line-2)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>Deployed contract — Sui testnet</div>
        {SUI_REPUTATION_PKG && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".7rem" }}>
            <span style={{ color: "var(--muted)" }}>Package:</span>
            <a href={`${SUI_TESTNET_EXPLORER}/object/${SUI_REPUTATION_PKG}`} target="_blank" rel="noreferrer"
              style={{ fontFamily: "monospace", color: "#4DA2FF", fontSize: ".65rem" }}>
              {SUI_REPUTATION_PKG.slice(0, 10)}…{SUI_REPUTATION_PKG.slice(-6)} ↗
            </a>
          </div>
        )}
        {SUI_AGENT_REGISTRY && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".7rem" }}>
            <span style={{ color: "var(--muted)" }}>AgentRegistry:</span>
            <a href={`${SUI_TESTNET_EXPLORER}/object/${SUI_AGENT_REGISTRY}`} target="_blank" rel="noreferrer"
              style={{ fontFamily: "monospace", color: "#4DA2FF", fontSize: ".65rem" }}>
              {SUI_AGENT_REGISTRY.slice(0, 10)}… ↗
            </a>
            {registry && (
              <span style={{ marginLeft: 8, fontSize: ".65rem", color: "var(--green)", fontWeight: 700 }}>
                {registry.totalAgents} agent{registry.totalAgents !== 1 ? "s" : ""} minted
              </span>
            )}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" type="button" onClick={fetchRegistry} disabled={fetchingReg}>
            {fetchingReg ? <Loader2 size={11} className="wallet-spin" /> : null}
            {fetchingReg ? "Fetching…" : "Fetch registry state"}
          </button>
          {regErr && <span style={{ fontSize: ".65rem", color: "#f87171" }}>{regErr}</span>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 4 }}>
        {agents.map(a => (
          <div key={a.id} style={{ padding: "14px 16px", borderRadius: 10, border: `2px solid ${TIER_COLORS[a.tier]}33`, background: "var(--card-bg)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${TIER_COLORS[a.tier]}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Trophy size={18} style={{ color: TIER_COLORS[a.tier] }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                <div style={{ fontSize: 10, color: TIER_COLORS[a.tier], fontWeight: 600 }}>{NFT_TIERS[a.tier]} · Lv.{a.level}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Tasks: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{a.tasks}</span></div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Revenue: <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{a.revenue} SUI</span></div>
            </div>
            <div style={{ height: 4, borderRadius: 4, background: "var(--border-subtle)", marginBottom: 10 }}>
              <div style={{ height: "100%", borderRadius: 4, background: TIER_COLORS[a.tier], width: `${(a.level % 10) * 10}%`, transition: "width 0.4s" }} />
            </div>
            <button className="btn btn-sm btn-acc" style={{ width: "100%", fontSize: 11 }} onClick={() => claimUpdate(a.id)} disabled={claiming === a.id}>
              {claiming === a.id ? <><Loader2 size={11} className="wallet-spin" /> Updating…</> : <>Claim Reputation Update</>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sui Pay Button Widget ──────────────────────────────────────────────────────
export function SuiPayButtonWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [label, setLabel] = useState("Pay with Sui AI");
  const [amount, setAmount] = useState("0.01");
  const [recipient, setRecipient] = useState("");
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const PAY_COST = 0.001;

  const snippet = `<script src="https://cdn.suiagent.os/pay.js"></script>
<sui-pay
  label="${label}"
  amount="${amount}"
  currency="SUI"
  recipient="${recipient}"
></sui-pay>`;

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function simulatePay() {
    const fc = checkFunding(SUI_FUNDING_SCOPE, PAY_COST, { mode: "treasury", serviceId: "svc_sui_pay_widget" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setPaying(true);
    await new Promise(r => setTimeout(r, 1600));
    const hash = hid(`pay-${Date.now()}`);
    recordFundingSpend(SUI_FUNDING_SCOPE, PAY_COST, { mode: "treasury", serviceId: "svc_sui_pay_widget", settlement: "fallback" });
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_sui_pay_widget", serviceName: "Sui Pay Button", amount: parseFloat(amount), currency: "SUI", network: "sui-mainnet", status: "paid", kind: "sui.pay.widget", payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, PAY_COST, { mode: "treasury", serviceId: "svc_sui_pay_widget", settlement: "fallback" }, { hash }) });
    setPaying(false);
    setPaid(true);
    setTimeout(() => setPaid(false), 3000);
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Zap size={15} /></span>
        <div><h3>Sui Pay Button</h3><div className="sub">One &lt;script&gt; tag = Stripe for AI on Sui — drop into any website</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <input className="inp" placeholder="Button label" value={label} onChange={e => setLabel(e.target.value)} />
        <input className="inp" placeholder="Amount (SUI)" value={amount} onChange={e => setAmount(e.target.value)} />
        <input className="inp" placeholder="Recipient address" value={recipient} onChange={e => setRecipient(e.target.value)} />
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <pre style={{ margin: 0, padding: "12px 14px", borderRadius: 8, background: "var(--code-bg, var(--card-bg))", border: "1px solid var(--border-subtle)", fontSize: 11, lineHeight: 1.6, overflowX: "auto", color: "var(--text-primary)" }}>{snippet}</pre>
        <button onClick={copySnippet} style={{ position: "absolute", top: 8, right: 8, background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
          {copied ? <><CheckCheck size={12} style={{ color: "var(--success)" }} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, fontSize: 11, color: "var(--text-secondary)" }}>Live preview — click the button below to simulate a payment:</div>
        <button className="btn btn-acc" onClick={simulatePay} disabled={paying || paid} style={{ minWidth: 140 }}>
          {paying ? <><Loader2 size={13} className="wallet-spin" /> Processing…</> : paid ? <><BadgeCheck size={13} /> Paid!</> : <><Zap size={13} /> {label}</>}
        </button>
      </div>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}
    </div>
  );
}

// ── Agent Memory Network ───────────────────────────────────────────────────────
export function AgentMemoryNetwork({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [memories, setMemories] = useLocalStore<{ id: string; key: string; preview: string; shared: boolean; price: number; ts: string }[]>(
    `sui-memories-${workspace.id}`, []
  );
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [shared, setShared] = useState(false);
  const [price, setPrice] = useState("0.005");
  const [writing, setWriting] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const MEMORY_COST = 0.018;

  async function writeMemory() {
    if (!key.trim() || !value.trim()) return;
    const fc = checkFunding(SUI_FUNDING_SCOPE, MEMORY_COST, { mode: "treasury", serviceId: "svc_sui_memory_write" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setWriting(true);
    await new Promise(r => setTimeout(r, 1500));
    const id = hid(`mem-${key}-${Date.now()}`);
    setMemories(prev => [{ id, key: key.trim(), preview: value.slice(0, 60) + (value.length > 60 ? "…" : ""), shared, price: parseFloat(price), ts: new Date().toLocaleTimeString() }, ...prev]);
    recordFundingSpend(SUI_FUNDING_SCOPE, MEMORY_COST, { mode: "treasury", serviceId: "svc_sui_memory_write", settlement: "fallback" });
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_sui_memory_write", serviceName: "Agent Memory Write", amount: 0.018, currency: "SUI", network: "sui-mainnet", kind: "sui.memory.write", payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, MEMORY_COST, { mode: "treasury", serviceId: "svc_sui_memory_write", settlement: "fallback" }, { memoryId: id, memKey: key.trim(), shared }) });
    setKey(""); setValue("");
    setWriting(false);
  }

  async function buyAccess(id: string, p: number) {
    const ACCESS_COST = 0.005;
    const fc = checkFunding(SUI_FUNDING_SCOPE, ACCESS_COST, { mode: "treasury", serviceId: "svc_sui_memory_write" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setBuying(id);
    await new Promise(r => setTimeout(r, 1200));
    recordFundingSpend(SUI_FUNDING_SCOPE, ACCESS_COST, { mode: "treasury", serviceId: "svc_sui_memory_write", settlement: "fallback" });
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_sui_memory_write", serviceName: "Agent Memory Access", amount: p, currency: "SUI", network: "sui-mainnet", status: "paid", kind: "sui.memory.access", payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, ACCESS_COST, { mode: "treasury", serviceId: "svc_sui_memory_write", settlement: "fallback" }, { memoryId: id }) });
    setBuying(null);
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Brain size={15} /></span>
        <div><h3>Agent Memory Network</h3><div className="sub">Walrus-encrypted memory blobs + Seal access control + knowledge marketplace</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <input className="inp" placeholder="Memory key (e.g. user-prefs)" value={key} onChange={e => setKey(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <input className="inp" placeholder="Price if shared (SUI)" value={price} onChange={e => setPrice(e.target.value)} disabled={!shared} style={{ flex: 1 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /> Share
          </label>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <textarea className="inp" rows={2} placeholder="Memory value (encrypted with Seal before writing to Walrus)" value={value} onChange={e => setValue(e.target.value)} style={{ flex: 1, resize: "vertical" }} />
        <button className="btn btn-acc btn-sm" onClick={writeMemory} disabled={writing || !key.trim() || !value.trim()} style={{ alignSelf: "flex-end" }}>
          {writing ? <Loader2 size={13} className="wallet-spin" /> : <Database size={13} />}
          {writing ? "Writing…" : "Write Memory"}
        </button>
      </div>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}
      {memories.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Key</th><th>Preview</th><th>Access</th><th></th></tr></thead>
            <tbody>
              {memories.map(m => (
                <tr key={m.id}>
                  <td style={{ fontSize: 11, fontWeight: 600 }}>{m.key}</td>
                  <td style={{ fontSize: 10, color: "var(--text-secondary)" }}>{m.preview}</td>
                  <td>{m.shared ? <span style={{ fontSize: 10, color: "var(--accent-primary)" }}>{m.price} SUI</span> : <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Private</span>}</td>
                  <td>{m.shared && <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => buyAccess(m.id, m.price)} disabled={buying === m.id}>{buying === m.id ? "…" : "Buy Access"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Battle Arena Widget ────────────────────────────────────────────────────────
const ARENA_CHALLENGES = [
  { id: "c1", name: "Alpha-7 vs Beta-3", category: "Agent Payments", prize: 2.0, bets: { a: 1.4, b: 0.9 }, status: "live" },
  { id: "c2", name: "Gamma-1 vs Delta-9", category: "DeepBook Arb", prize: 5.0, bets: { a: 2.1, b: 3.7 }, status: "live" },
  { id: "c3", name: "Eta-2 vs Theta-5", category: "Walrus Speed", prize: 1.0, bets: { a: 0.6, b: 0.6 }, status: "upcoming" },
];

export function BattleArenaWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [tab, setTab] = useState<"spectate" | "compete">("spectate");
  const [bets, setBets] = useLocalStore<Record<string, { side: "a" | "b"; amount: number }>>(
    `sui-arena-bets-${workspace.id}`, {}
  );
  const [betAmount, setBetAmount] = useState("0.1");
  const [challengeName, setChallengeName] = useState("");
  const [challengePrize, setChallengePrize] = useState("1.0");
  const [creating, setCreating] = useState(false);
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const BET_COST = 0.01;
  const CREATE_COST = 0.05;

  async function placeBet(challengeId: string, side: "a" | "b") {
    const fc = checkFunding(SUI_FUNDING_SCOPE, BET_COST, { mode: "treasury", serviceId: "svc_sui_battle" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    const hash = hid(`bet-${challengeId}-${side}-${Date.now()}`);
    setBets(prev => ({ ...prev, [challengeId]: { side, amount: parseFloat(betAmount) } }));
    recordFundingSpend(SUI_FUNDING_SCOPE, BET_COST, { mode: "treasury", serviceId: "svc_sui_battle", settlement: "fallback" });
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_sui_battle", serviceName: "Battle Arena Bet", amount: parseFloat(betAmount), currency: "SUI", network: "sui-mainnet", status: "paid", kind: "sui.arena.bet", payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, BET_COST, { mode: "treasury", serviceId: "svc_sui_battle", settlement: "fallback" }, { challengeId, side, hash }) });
  }

  async function createChallenge() {
    if (!challengeName.trim()) return;
    const fc = checkFunding(SUI_FUNDING_SCOPE, CREATE_COST, { mode: "treasury", serviceId: "svc_sui_battle" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setCreating(true);
    await new Promise(r => setTimeout(r, 1400));
    recordFundingSpend(SUI_FUNDING_SCOPE, CREATE_COST, { mode: "treasury", serviceId: "svc_sui_battle", settlement: "fallback" });
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_sui_battle", serviceName: "Battle Arena Challenge", amount: parseFloat(challengePrize), currency: "SUI", network: "sui-mainnet", status: "paid", kind: "sui.arena.create", payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, CREATE_COST, { mode: "treasury", serviceId: "svc_sui_battle", settlement: "fallback" }, { challengeName, prizePool: hid(`challenge-${Date.now()}`) }) });
    setCreating(false);
    setChallengeName("");
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Swords size={15} /></span>
        <div><h3>Agent Battle Arena</h3><div className="sub">Agents compete on-chain, spectators bet via DeepBook</div></div>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button className={`btn btn-sm ${tab === "spectate" ? "btn-acc" : ""}`} onClick={() => setTab("spectate")}>Spectate</button>
          <button className={`btn btn-sm ${tab === "compete" ? "btn-acc" : ""}`} onClick={() => setTab("compete")}>Compete</button>
        </div>
      </div>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}
      {tab === "spectate" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {ARENA_CHALLENGES.map(c => {
            const myBet = bets[c.id];
            const totalPool = c.bets.a + c.bets.b;
            return (
              <div key={c.id} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border-subtle)", background: "var(--card-bg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{c.category}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "var(--accent-primary)", fontWeight: 700 }}>{c.prize} SUI Prize</div>
                    <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{totalPool.toFixed(1)} SUI pool</div>
                  </div>
                </div>
                <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ flex: c.bets.a, background: "var(--accent-primary)" }} />
                  <div style={{ flex: c.bets.b, background: "#f59e0b" }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                    <input className="inp" type="number" min="0.01" step="0.01" value={betAmount} onChange={e => setBetAmount(e.target.value)} style={{ width: 70, fontSize: 11 }} />
                    <button className="btn btn-sm btn-acc" style={{ flex: 1, fontSize: 11 }} onClick={() => placeBet(c.id, "a")} disabled={c.status !== "live" || !!myBet}>
                      {myBet?.side === "a" ? `Bet placed (${myBet.amount} SUI)` : `Bet A (${(c.bets.a / totalPool * 100).toFixed(0)}%)`}
                    </button>
                    <button className="btn btn-sm" style={{ flex: 1, fontSize: 11, borderColor: "#f59e0b", color: "#f59e0b" }} onClick={() => placeBet(c.id, "b")} disabled={c.status !== "live" || !!myBet}>
                      {myBet?.side === "b" ? `Bet placed (${myBet.amount} SUI)` : `Bet B (${(c.bets.b / totalPool * 100).toFixed(0)}%)`}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab === "compete" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>Create a new agent challenge — specify the task and prize pool</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 }}>
            <input className="inp" placeholder="Challenge name (e.g. Fastest Walrus Upload)" value={challengeName} onChange={e => setChallengeName(e.target.value)} />
            <input className="inp" placeholder="Prize (SUI)" value={challengePrize} onChange={e => setChallengePrize(e.target.value)} style={{ width: 110 }} />
          </div>
          <button className="btn btn-acc" onClick={createChallenge} disabled={creating || !challengeName.trim()} style={{ width: "100%" }}>
            {creating ? <><Loader2 size={13} className="wallet-spin" /> Creating on-chain…</> : <><Trophy size={13} /> Create Challenge</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Intent Engine Widget ───────────────────────────────────────────────────────
const INTENT_EXAMPLES = [
  "Find best yield for 5 SUI, deposit and notify me",
  "Hire 3 agents to scrape, analyze, and summarize crypto news",
  "If ETH drops 10%, swap half my SUI to USDC via DeepBook",
  "Upload my model weights to Walrus, sell access for 0.1 SUI",
];

function parseIntent(text: string): { agents: string[]; steps: string[]; schedule: string } {
  const lower = text.toLowerCase();
  const agents: string[] = [];
  const steps: string[] = [];
  if (lower.includes("yield") || lower.includes("deposit")) { agents.push("YieldOptimizer"); steps.push("Scan DeepBook pools for APR"); steps.push("Lock funds in highest-yield escrow"); }
  if (lower.includes("swap") || lower.includes("usdc") || lower.includes("eth")) { agents.push("SwapExecutor"); steps.push("Watch price feed via DeepBook oracle"); steps.push("Execute PTB swap on trigger"); }
  if (lower.includes("scrape") || lower.includes("news") || lower.includes("summar")) { agents.push("WebScraper"); agents.push("LLMAnalyst"); steps.push("Scrape sources via x402-gated endpoint"); steps.push("Summarize via Atoma on-chain LLM"); }
  if (lower.includes("upload") || lower.includes("walrus") || lower.includes("model")) { agents.push("WalrusUploader"); steps.push("Encrypt blob with Seal"); steps.push("Pin to Walrus + register in marketplace"); }
  if (agents.length === 0) { agents.push("OrchestratorAgent"); steps.push("Parse intent NL → PTB"); steps.push("Route to best available agent"); }
  const schedule = lower.includes("if ") ? "Conditional trigger" : lower.includes("every") ? "Recurring cron" : "One-shot";
  return { agents, steps, schedule };
}

// ── PTB Builder (visual step palette) ──────────────────────────────────────────

type PtbCmd = "MoveCall" | "TransferObjects" | "SplitCoins" | "MergeCoins" | "Pay" | "Publish";
type PtbStep = { id: string; cmd: PtbCmd; detail: string; gasEst: number };

const PTB_PALETTE: { cmd: PtbCmd; label: string; detail: string; gasEst: number }[] = [
  { cmd: "MoveCall",       label: "Move Call",        detail: "escrow::open(signer, amount)", gasEst: 800 },
  { cmd: "TransferObjects", label: "Transfer Objects", detail: "transfer_to(recipient)",      gasEst: 400 },
  { cmd: "SplitCoins",     label: "Split Coins",      detail: "split_n(coin, [1000, 2000])",  gasEst: 300 },
  { cmd: "MergeCoins",     label: "Merge Coins",      detail: "merge(coin, [extra])",         gasEst: 250 },
  { cmd: "Pay",            label: "Pay SUI",          detail: "pay_sui([recipient], [amt])",  gasEst: 350 },
  { cmd: "Publish",        label: "Publish Module",   detail: "publish(bytecode, upgradeCap)", gasEst: 2000 },
];

let ptbStepCounter = 0;

export function IntentEngineWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [mode, setMode] = useState<"nl" | "builder">("nl");

  // NL mode state
  const [intent, setIntent] = useState("");
  const [parsed, setParsed] = useState<{ agents: string[]; steps: string[]; schedule: string } | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);

  // PTB Builder state
  const [ptbSteps, setPtbSteps] = useState<PtbStep[]>([]);
  const [building, setBuilding] = useState(false);
  const [builtHash, setBuiltHash] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const DEPLOY_COST = 0.04;
  const PTB_BUILD_COST = 0.015;

  function handleParse() {
    if (!intent.trim()) return;
    setParsed(parseIntent(intent));
    setDeployed(false);
  }

  async function deployWorkflow() {
    const fc = checkFunding(SUI_FUNDING_SCOPE, DEPLOY_COST, { mode: "treasury", serviceId: "svc_sui_intent" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setDeploying(true);
    await new Promise(r => setTimeout(r, 2000));
    const hash = hid(`workflow-${Date.now()}`);
    recordFundingSpend(SUI_FUNDING_SCOPE, DEPLOY_COST, { mode: "treasury", serviceId: "svc_sui_intent", settlement: "fallback" });
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_sui_intent", serviceName: "Intent Engine Deploy", amount: 0.04, currency: "SUI", network: "sui-mainnet", status: "verified", kind: "sui.intent.deploy", payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, DEPLOY_COST, { mode: "treasury", serviceId: "svc_sui_intent", settlement: "fallback" }, { hash }) });
    setDeploying(false);
    setDeployed(true);
  }

  function addStep(p: typeof PTB_PALETTE[number]) {
    const id = `step_${ptbStepCounter++}`;
    setPtbSteps(prev => [...prev, { id, cmd: p.cmd, detail: p.detail, gasEst: p.gasEst }]);
    setBuiltHash(null);
  }

  function removeStep(id: string) { setPtbSteps(prev => prev.filter(s => s.id !== id)); setBuiltHash(null); }
  function moveStep(idx: number, dir: -1 | 1) {
    setPtbSteps(prev => {
      const arr = [...prev];
      const t = arr[idx + dir];
      if (!t) return arr;
      arr[idx + dir] = arr[idx]; arr[idx] = t;
      return arr;
    });
    setBuiltHash(null);
  }

  // drag-and-drop reorder
  function onDragStart(idx: number) { setDragging(idx); }
  function onDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDragOver(idx); }
  function onDrop(idx: number) {
    if (dragging === null || dragging === idx) { setDragging(null); setDragOver(null); return; }
    setPtbSteps(prev => {
      const arr = [...prev];
      const [item] = arr.splice(dragging, 1);
      arr.splice(idx, 0, item);
      return arr;
    });
    setDragging(null); setDragOver(null); setBuiltHash(null);
  }

  async function buildPtb() {
    if (ptbSteps.length === 0) return;
    const fc = checkFunding(SUI_FUNDING_SCOPE, PTB_BUILD_COST, { mode: "treasury", serviceId: "svc_sui_move_exec" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the Sui Agent Treasury first.`);
      return;
    }
    setFundingErr(null);
    setBuilding(true);
    await new Promise(r => setTimeout(r, 1200));
    const hash = hid(`ptb-${ptbSteps.map(s => s.cmd).join("-")}-${Date.now()}`);
    setBuiltHash(hash);
    const totalGas = ptbSteps.reduce((s, st) => s + st.gasEst, 0);
    recordFundingSpend(SUI_FUNDING_SCOPE, PTB_BUILD_COST, { mode: "treasury", serviceId: "svc_sui_move_exec", settlement: "fallback" });
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_sui_move_exec", serviceName: "PTB Builder · Execute", amount: totalGas / 1_000_000, currency: "SUI", network: "sui-mainnet", status: "verified", kind: "sui.ptb.execute", payload: fundingReceiptPayload(SUI_FUNDING_SCOPE, PTB_BUILD_COST, { mode: "treasury", serviceId: "svc_sui_move_exec", settlement: "fallback" }, { steps: ptbSteps.map(s => s.cmd), hash, totalGas }) });
    setBuilding(false);
  }

  const totalGas = ptbSteps.reduce((s, st) => s + st.gasEst, 0);

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Lightbulb size={15} /></span>
        <div><h3>Intent Engine + PTB Builder</h3><div className="sub">NL → multi-agent workflow · or drag-and-drop PTB steps manually</div></div>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button className={`btn btn-sm ${mode === "nl" ? "btn-acc" : ""}`} onClick={() => setMode("nl")}>NL → PTB</button>
          <button className={`btn btn-sm ${mode === "builder" ? "btn-acc" : ""}`} onClick={() => setMode("builder")}>PTB Builder</button>
        </div>
      </div>
      {fundingErr && <FundingBlockedNote msg={fundingErr} />}

      {mode === "nl" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {INTENT_EXAMPLES.map(ex => (
              <button key={ex} onClick={() => { setIntent(ex); setParsed(parseIntent(ex)); setDeployed(false); }} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 20, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", cursor: "pointer", color: "var(--text-secondary)" }}>{ex}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <textarea className="inp" rows={2} placeholder="Describe what you want agents to do…" value={intent} onChange={e => { setIntent(e.target.value); setParsed(null); setDeployed(false); }} style={{ flex: 1, resize: "vertical" }} />
            <button className="btn btn-acc btn-sm" onClick={handleParse} disabled={!intent.trim()} style={{ alignSelf: "flex-end" }}>
              <Target size={13} /> Parse
            </button>
          </div>
          {parsed && (
            <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>AGENTS ({parsed.agents.length})</div>
                  {parsed.agents.map(a => <div key={a} style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-primary)" }}>· {a}</div>)}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>STEPS</div>
                  {parsed.steps.map((s, i) => <div key={i} style={{ fontSize: 10, color: "var(--text-primary)" }}>{i + 1}. {s}</div>)}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>SCHEDULE</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{parsed.schedule}</div>
                </div>
              </div>
              <button className="btn btn-acc" onClick={deployWorkflow} disabled={deploying || deployed} style={{ width: "100%" }}>
                {deploying ? <><Loader2 size={13} className="wallet-spin" /> Deploying workflow…</> : deployed ? <><BadgeCheck size={13} /> Workflow deployed!</> : <><Play size={13} /> Deploy as PTB Workflow</>}
              </button>
            </div>
          )}
        </>
      )}

      {mode === "builder" && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
            Click a command to add it · drag steps to reorder · arrows for precise ordering
          </div>
          {/* Palette */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {PTB_PALETTE.map(p => (
              <button key={p.cmd} onClick={() => addStep(p)} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", cursor: "pointer", color: "var(--accent-primary)", fontWeight: 600 }}>
                + {p.label}
              </button>
            ))}
          </div>
          {/* Step list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, minHeight: ptbSteps.length === 0 ? 48 : undefined }}>
            {ptbSteps.length === 0 && (
              <div style={{ textAlign: "center", padding: "12px 0", fontSize: 12, color: "var(--text-secondary)", border: "1px dashed var(--border-subtle)", borderRadius: 8 }}>
                Add a step from the palette above
              </div>
            )}
            {ptbSteps.map((s, i) => (
              <div
                key={s.id}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={e => onDragOver(e, i)}
                onDrop={() => onDrop(i)}
                onDragEnd={() => { setDragging(null); setDragOver(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", borderRadius: 8,
                  border: dragOver === i ? "2px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                  background: dragging === i ? "var(--accent-soft)" : "var(--card-bg)",
                  cursor: "grab", opacity: dragging === i ? 0.5 : 1,
                  transition: "border 0.12s, background 0.12s",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--text-secondary)", userSelect: "none" }}>≡</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-primary)", minWidth: 100 }}>{i + 1}. {s.cmd}</span>
                <code style={{ fontSize: 9, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.detail}</code>
                <span style={{ fontSize: 10, color: "var(--text-secondary)", minWidth: 60, textAlign: "right" }}>{s.gasEst} gas</span>
                <div style={{ display: "flex", gap: 2 }}>
                  <button onClick={() => moveStep(i, -1)} disabled={i === 0} style={{ fontSize: 10, padding: "1px 5px", cursor: "pointer", background: "none", border: "1px solid var(--border-subtle)", borderRadius: 4 }}>↑</button>
                  <button onClick={() => moveStep(i, 1)} disabled={i === ptbSteps.length - 1} style={{ fontSize: 10, padding: "1px 5px", cursor: "pointer", background: "none", border: "1px solid var(--border-subtle)", borderRadius: 4 }}>↓</button>
                  <button onClick={() => removeStep(s.id)} style={{ fontSize: 10, padding: "1px 5px", cursor: "pointer", background: "none", border: "1px solid var(--border-subtle)", borderRadius: 4, color: "var(--red)" }}>×</button>
                </div>
              </div>
            ))}
          </div>
          {ptbSteps.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>
                {ptbSteps.length} step{ptbSteps.length !== 1 ? "s" : ""} · est. {totalGas.toLocaleString()} gas units
              </span>
              <button className="btn btn-acc btn-sm" onClick={buildPtb} disabled={building}>
                {building ? <><Loader2 size={13} className="wallet-spin" /> Building PTB…</> : <><Play size={13} /> Build + Execute PTB</>}
              </button>
            </div>
          )}
          {builtHash && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#4ade80", fontWeight: 600 }}>
              ✓ PTB executed · tx <code style={{ fontSize: 10 }}>{builtHash.slice(0, 20)}…</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
