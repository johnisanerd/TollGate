import { type CSSProperties, useState } from "react";
import { Badge, ExternalLink, HandCoins, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import type { Workspace } from "../../../types";
import { useAppState } from "../../../app-state";
import { useWallet } from "../../../wallet";
import { useLocalStore } from "../../../lib/storage";
import { sha256Hex } from "../../../lib/util-hash";
import {
  getArbitrumConfig, arbitrumExplorerTxUrl, arbitrumExplorerAddrUrl,
  openEscrow, releaseEscrow, refundEscrow, cancelEscrow, getEscrowView, formatDeadlineRelative, type EscrowView,
} from "../../../lib/arbitrum";
import type { NetworkMode } from "../../../lib/chains";
import { ActionPanel } from "../ActionPanel";
import { fundingReceiptPayload, ARB_FUNDING_SCOPE } from "../../../workspaces/arbitrum/funding";

const headStyle: CSSProperties = { fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 };
const inputStyle: CSSProperties = { padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const okStrip: CSSProperties = { display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--green) 12%, transparent)", color: "var(--green)", fontSize: ".74rem", fontWeight: 700, flexWrap: "wrap" };
const codeStyle: CSSProperties = { background: "rgba(0,0,0,.16)", padding: "1px 5px", borderRadius: 5, fontSize: ".82em" };
const SHORT = (h: string) => h.slice(0, 8) + "…" + h.slice(-6);

type LocalEscrow = { id: number | null; txHash: string; payee: string; amountEth: string; deadline: number; at: string; state?: EscrowView["state"] };

export function ArbitrumEscrowPanel({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const wallet = useWallet();
  const [netMode, setNetMode] = useState<NetworkMode>("testnet");
  const cfg = getArbitrumConfig(netMode);
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [mins, setMins] = useState("30");
  const [refNote, setRefNote] = useState("x402 invoice — wallet-risk report v2");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<{ id: number | null; txHash: string } | null>(null);
  const [log, setLog] = useLocalStore<LocalEscrow[]>("arb.escrow.log", []);

  if (!cfg.escrowAddress) {
    return (
      <div className="panel block" style={{ borderStyle: "dashed" }}>
        <div className="block-head"><div className="ttl"><span className="sq soft"><Badge width={15} height={15} /></span><div><h3>AgentEscrow on Arbitrum — not wired yet</h3><div className="sub">scaffolded, one command from live</div></div></div></div>
        <p style={{ margin: "0 16px 14px", fontSize: ".82rem", color: "var(--muted)", lineHeight: 1.55 }}>
          Deploy <code style={codeStyle}>contracts/AgentEscrow.sol</code> and set <code style={codeStyle}>VITE_ARBITRUM_ESCROW_ADDRESS</code> in <code style={codeStyle}>.env.local</code>:
          <br /><code style={{ ...codeStyle, display: "inline-block", marginTop: 6 }}>cd contracts &amp;&amp; npm run deploy:arb</code><br />
          Until then the Arbitrum workspace's interactive escrow runs in simulation — nothing breaks.
        </p>
      </div>
    );
  }

  const push = (e: LocalEscrow) => setLog((l) => [e, ...l].slice(0, 16));
  const patch = (id: number, state: EscrowView["state"]) => setLog((l) => l.map((e) => (e.id === id ? { ...e, state } : e)));

  const open = async () => {
    if (busy) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(payee.trim())) { setErr("Enter a valid provider (payee) address."); return; }
    const minsN = Math.max(1, Math.floor(parseFloat(mins) || 30));
    setBusy(true); setErr(null);
    try {
      const refHex = await sha256Hex(`arb|escrow|${refNote}|${Date.now()}`);
      const deadlineSec = Math.floor(Date.now() / 1000) + minsN * 60;
      const res = await openEscrow({ payee: payee.trim(), amountEthStr: amount, deadlineSec, refHex }, netMode);
      setLast({ id: res.id, txHash: res.txHash });
      push({ id: res.id, txHash: res.txHash, payee: payee.trim(), amountEth: amount, deadline: deadlineSec, at: new Date().toISOString(), state: "Open" });
      // Escrow funding mode — funds are held on-chain, not spent from the Agent Treasury.
      emitReceipt({ workspaceId: workspace.id, serviceName: "AgentEscrow · Open (Arbitrum Sepolia)", amount: 0, currency: "ETH", network: workspace.networks[0] ?? "arbitrum-sepolia", kind: "arb.escrow.open", payload: fundingReceiptPayload(ARB_FUNDING_SCOPE, parseFloat(amount) || 0, { mode: "escrow", serviceId: "svc_arb_escrow", settlement: "live" }, { escrowId: res.id, payee: payee.trim(), amountEth: amount, deadlineSec, ref: refHex, txHash: res.txHash, explorerUrl: res.explorerUrl, contract: res.contract, chainHex: res.chainHex }), status: "verified" });
    } catch (e) { setErr((e as { message?: string }).message ?? "Open failed"); } finally { setBusy(false); }
  };

  const doAction = async (id: number, kind: "release" | "refund" | "cancel") => {
    if (acting != null) return;
    setActing(id); setErr(null);
    try {
      const fn = kind === "release" ? releaseEscrow : kind === "refund" ? refundEscrow : cancelEscrow;
      const res = await fn(id, netMode);
      patch(id, kind === "release" ? "Released" : "Refunded");
      // Explicit escrow state transition (release / refund / cancel) — never a treasury deduction.
      emitReceipt({ workspaceId: workspace.id, serviceName: `AgentEscrow · ${kind[0].toUpperCase()}${kind.slice(1)} #${id}`, amount: 0, currency: "ETH", network: workspace.networks[0] ?? "arbitrum-sepolia", kind: `arb.escrow.${kind}`, payload: fundingReceiptPayload(ARB_FUNDING_SCOPE, 0, { mode: "escrow", serviceId: "svc_arb_escrow", settlement: "live" }, { escrowId: id, txHash: res.txHash, explorerUrl: res.explorerUrl }), status: "verified" });
    } catch (e) { setErr((e as { message?: string }).message ?? `${kind} failed`); } finally { setActing(null); }
  };

  const refreshState = async (id: number) => {
    const v = await getEscrowView(id, netMode);
    if (v) patch(id, v.state);
  };

  const recent = log.slice(0, 8);

  return (
    <ActionPanel
      icon={<ShieldCheck width={15} height={15} />}
      title="AgentEscrow on Arbitrum · agent → provider, with a deadline"
      sub={`Real escrow on Arbitrum Sepolia: the agent funds it (native ETH), releases on delivery, refunds after the deadline, or the provider cancels. Single-claim, no admin. Contract ${SHORT(cfg.escrowAddress!)}.`}
      actions={
        <span className="row sm" style={{ gap: 6 }}>
          <button className={"pill click" + (netMode === "testnet" ? " on" : "")} type="button" onClick={() => setNetMode("testnet")} style={{ fontSize: ".65rem" }}>Sepolia</button>
          <button className={"pill click" + (netMode === "mainnet" ? " on" : "")} type="button" onClick={() => setNetMode("mainnet")} style={{ fontSize: ".65rem" }}>Mainnet</button>
          <a className="btn btn-ghost btn-sm" href={arbitrumExplorerAddrUrl(cfg.escrowAddress!, netMode)} target="_blank" rel="noreferrer">Contract <ExternalLink width={11} height={11} /></a>
          <button className="btn btn-acc btn-sm" type="button" onClick={open} disabled={busy}>{busy ? <><Loader2 size={13} className="wallet-spin" /> Opening…</> : <><HandCoins width={13} height={13} /> Open escrow</>}</button>
        </span>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr .7fr .6fr", gap: 10, marginBottom: 10 }}>
        <label style={labelStyle}><span style={headStyle}>Provider (payee) address</span>
          <input value={payee} onChange={(e) => setPayee(e.currentTarget.value)} placeholder={wallet.address ? `${wallet.address} (or any address)` : "0x… provider address"} style={{ ...inputStyle, fontFamily: "var(--mono)", fontSize: ".76rem" }} />
        </label>
        <label style={labelStyle}><span style={headStyle}>Amount (ETH)</span>
          <input value={amount} onChange={(e) => setAmount(e.currentTarget.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}><span style={headStyle}>Deadline (min)</span>
          <input value={mins} onChange={(e) => setMins(e.currentTarget.value)} style={inputStyle} />
        </label>
      </div>
      <label style={{ ...labelStyle, marginBottom: 10 }}><span style={headStyle}>Reference note (hashed into the escrow's ref)</span>
        <input value={refNote} onChange={(e) => setRefNote(e.currentTarget.value)} style={inputStyle} />
      </label>
      {wallet.address && (
        <div style={{ marginBottom: 10 }}>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPayee(wallet.address!)}>Use my address as the provider (test the round-trip)</button>
        </div>
      )}

      {last && (
        <div style={{ ...okStrip, marginBottom: 12 }}>
          <ShieldCheck width={13} height={13} /> Escrow opened{last.id != null ? <> · id <code style={codeStyle}>#{last.id}</code></> : null} ·{" "}
          <a href={arbitrumExplorerTxUrl(last.txHash, netMode)} target="_blank" rel="noreferrer" style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>tx {SHORT(last.txHash)} <ExternalLink width={11} height={11} /></a>
        </div>
      )}
      {err && <div style={{ marginBottom: 12, color: "var(--red)", fontSize: ".76rem", fontWeight: 600 }}>{err}</div>}

      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Escrows · {log.length}</div>
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Id</th><th>Payee</th><th>Amount</th><th>Deadline</th><th>State</th><th>Tx</th><th aria-label="actions" /></tr></thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted)", padding: 14 }}>No escrows yet — open one above.</td></tr>}
              {recent.map((e) => (
                <tr key={`${e.txHash}-${e.id}`}>
                  <td>{e.id != null ? <span className="pill ok">#{e.id}</span> : "—"}</td>
                  <td><code>{SHORT(e.payee)}</code></td>
                  <td className="svc-table__num">{e.amountEth} ETH</td>
                  <td className="muted svc-table__num" title={new Date(e.deadline * 1000).toLocaleString()}>{(() => { const d = formatDeadlineRelative(e.deadline); return <span style={d.expired ? { color: "var(--red)" } : {}}>{d.label}</span>; })()}</td>
                  <td>{e.state === "Open" ? <span className="pill">open</span> : e.state === "Released" ? <span className="pill ok">released</span> : e.state === "Refunded" ? <span className="pill">refunded</span> : "—"}</td>
                  <td><a href={arbitrumExplorerTxUrl(e.txHash, netMode)} target="_blank" rel="noreferrer"><code>{e.txHash.slice(0, 10)}…</code></a></td>
                  <td>
                    <span className="row sm" style={{ gap: 6 }}>
                      {e.id != null && e.state === "Open" && <>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => doAction(e.id!, "release")} disabled={acting != null} title="Release to provider">{acting === e.id ? <Loader2 size={12} className="wallet-spin" /> : "Release"}</button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => doAction(e.id!, "refund")} disabled={acting != null} title="Refund (only after deadline)">Refund</button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => doAction(e.id!, "cancel")} disabled={acting != null} title="Cancel (only the provider)">Cancel</button>
                      </>}
                      {e.id != null && <button className="btn btn-ghost btn-sm" type="button" onClick={() => refreshState(e.id!)} title="Refresh on-chain state"><RefreshCw size={12} /></button>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ActionPanel>
  );
}
