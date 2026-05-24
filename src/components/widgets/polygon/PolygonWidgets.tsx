import { useState } from "react";
import { safeAmt } from "../../../lib/validate";
import {
  ArrowRight, BadgeCheck, Building2, CheckCircle,
  DollarSign, FileText, Globe, Loader2,
  RefreshCw, Send, ShieldCheck, TrendingUp,
  Users, Zap,
} from "lucide-react";
import type { Workspace } from "../../../types";
import { useLocalStore } from "../../../lib/storage";
import { deterministicScore, hashId } from "../../../lib/util-hash";
import { getPolygonConfig } from "../../../lib/polygon";
import { useNetworkMode } from "../../../hooks/useNetworkMode";
import { checkFunding, requestWalletPerCallSignature } from "../../../workspaces/polygon/funding";
import { POLY_FUNDING_SCOPE } from "../../../workspaces/polygon/funding";

// ── Trade Finance — SME Invoice Factoring ───────────────────────────────────────

type Invoice = {
  id: string;
  buyer: string;
  amount: number;
  advance: number;
  status: "submitted" | "funded" | "repaid";
  dueDate: string;
  ts: string;
};

const BUYERS = ["Dubai Imports LLC", "Abu Dhabi Trading Co", "Sharjah Merchants", "RAK Commerce"];

export function PolygonTradeFinanceWidget({ workspace }: { workspace: Workspace }) {
  const [invoices, setInvoices] = useLocalStore<Invoice[]>(`polygon-invoices-${workspace.id}`, []);
  const [buyer, setBuyer] = useState(BUYERS[0]);
  const [amount, setAmount] = useState("50000");
  const [submitting, setSubmitting] = useState(false);
  const [funding, setFunding] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const totalFunded = invoices.filter(i => i.status === "funded").reduce((s, i) => s + i.advance, 0);

  async function submitInvoice() {
    const amtNum = safeAmt(amount, 10_000_000);
    if (!amtNum) { return; }
    // Invoice scoring is an autonomous agent call — gated by the Polygon Merchant Treasury.
    const preflight = checkFunding(POLY_FUNDING_SCOPE, 0.10, { mode: "treasury", serviceId: "svc_poly_invoice" });
    if (!preflight.ok) { setErr(`Invoice scoring blocked — ${preflight.reason}. Sign a treasury allowance first.`); return; }
    setErr(null);
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1600));
    const id = hashId("inv", `${Date.now()}`).slice(0, 12);
    const dueDate = new Date(Date.now() + 30 * 24 * 3600_000).toLocaleDateString();
    setInvoices(prev => [{
      id, buyer, amount: amtNum,
      advance: +(amtNum * 0.8).toFixed(0),
      status: "submitted", dueDate, ts: new Date().toLocaleTimeString(),
    }, ...prev]);
    setSubmitting(false);
  }

  async function fundInvoice(id: string) {
    const target = invoices.find(i => i.id === id);
    // Funding an invoice moves capital — manual wallet action, never the Agent Treasury.
    try {
      await requestWalletPerCallSignature(POLY_FUNDING_SCOPE, target?.advance ?? 0, "svc_poly_invoice");
    } catch {
      setErr("Wallet signature required — invoice not funded. Capital movement is a manual wallet action.");
      return;
    }
    setErr(null);
    setFunding(id);
    await new Promise(r => setTimeout(r, 1400));
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: "funded" } : inv));
    setFunding(null);
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#7B3FE4" }}><FileText size={15} /></span>
        <div>
          <h3>SME Trade Finance — Polygon zkEVM</h3>
          <div className="sub">Invoice factoring on-chain — submit invoice, get 80% advance in USDC instantly</div>
        </div>
        {totalFunded > 0 && (
          <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#7B3FE4" }}>
            ${totalFunded.toLocaleString()} advanced
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Advance rate", val: "80%" },
          { label: "Settlement", val: "USDC" },
          { label: "Network", val: "Polygon zkEVM" },
          { label: "Fee", val: "0.5%" },
        ].map(g => (
          <div key={g.label} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{g.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{g.val}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>Submit New Invoice</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
          <select className="inp" value={buyer} onChange={e => setBuyer(e.target.value)}>
            {BUYERS.map(b => <option key={b}>{b}</option>)}
          </select>
          <div style={{ position: "relative" }}>
            <input className="inp" type="number" placeholder="Invoice amount (USD)" value={amount} onChange={e => setAmount(e.target.value)} style={{ paddingLeft: 24 }} />
            <DollarSign size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          </div>
          <button className="btn btn-acc btn-sm" onClick={submitInvoice} disabled={submitting}>
            {submitting ? <Loader2 size={13} className="wallet-spin" /> : <FileText size={13} />}
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
        {amount && (
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
            You will receive: <strong style={{ color: "#7B3FE4" }}>${(parseFloat(amount || "0") * 0.8).toFixed(0)} USDC</strong> advance · repay ${amount} at due date
          </div>
        )}
        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
          Scoring runs on the Agent Treasury · funding an invoice is a manual wallet payment
        </div>
      </div>
      {err && (
        <div style={{ marginBottom: 12, padding: "7px 12px", borderRadius: 8, background: "#EF44441a", border: "1px solid #EF444433", color: "#EF4444", fontSize: 11, fontWeight: 600 }}>{err}</div>
      )}

      {invoices.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>ID</th><th>Buyer</th><th>Invoice</th><th>Advance</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontSize: 10 }}><code>{inv.id}</code></td>
                  <td style={{ fontSize: 11 }}>{inv.buyer.split(" ")[0]}</td>
                  <td className="svc-table__num">${inv.amount.toLocaleString()}</td>
                  <td className="svc-table__num" style={{ color: "#7B3FE4" }}>${inv.advance.toLocaleString()}</td>
                  <td style={{ fontSize: 10 }}>{inv.dueDate}</td>
                  <td>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: inv.status === "repaid" ? "var(--success-soft)" : inv.status === "funded" ? "var(--accent-soft)" : "#7B3FE422",
                      color: inv.status === "repaid" ? "var(--success)" : inv.status === "funded" ? "var(--accent-primary)" : "#7B3FE4",
                    }}>{inv.status}</span>
                  </td>
                  <td>
                    {inv.status === "submitted" && (
                      <button className="btn btn-sm btn-acc" style={{ fontSize: 10 }} onClick={() => fundInvoice(inv.id)} disabled={funding === inv.id}>
                        {funding === inv.id ? "…" : "Fund"}
                      </button>
                    )}
                    {inv.status === "funded" && (
                      <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: "repaid" } : i))}>Repay</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── USDC Cross-Border Payments ──────────────────────────────────────────────────

const CORRIDORS = [
  { from: "AED (UAE)", to: "USD", bankFee: 3.5, ourFee: 0.1, bankTime: "2 days", ourTime: "~3s" },
  { from: "AED (UAE)", to: "EUR", bankFee: 4.2, ourFee: 0.1, bankTime: "3 days", ourTime: "~3s" },
  { from: "AED (UAE)", to: "INR", bankFee: 2.8, ourFee: 0.1, bankTime: "1 day",  ourTime: "~3s" },
];

export function PolygonUsdcPaymentsWidget({ workspace }: { workspace: Workspace }) {
  const [corridor, setCorridor] = useState(0);
  const [amount, setAmount] = useState("10000");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [transfers, setTransfers] = useLocalStore<{ from: string; to: string; amount: number; hash: string; ts: string }[]>(
    `polygon-usdc-${workspace.id}`, []
  );

  const sel = CORRIDORS[corridor];
  const amtNum = parseFloat(amount) || 0;
  const bankCost = amtNum * sel.bankFee / 100;
  const ourCost = amtNum * sel.ourFee / 100;
  const saving = bankCost - ourCost;

  async function sendPayment() {
    if (!safeAmt(amount, 100_000_000)) return;
    // Cross-border remittance execution — manual wallet action, needs a per-call signature.
    try {
      await requestWalletPerCallSignature(POLY_FUNDING_SCOPE, ourCost, "svc_poly_cross");
    } catch {
      setSendErr("Wallet signature required — remittance not sent. Manual wallet payment, never the Agent Treasury.");
      return;
    }
    setSendErr(null);
    setSending(true);
    await new Promise(r => setTimeout(r, 2200));
    const hash = hashId("usdc", `${Date.now()}`).slice(0, 18);
    setTransfers(prev => [{ from: sel.from, to: sel.to, amount: amtNum, hash, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 20));
    setSending(false);
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#7B3FE4" }}><Globe size={15} /></span>
        <div>
          <h3>Cross-Border USDC Payments</h3>
          <div className="sub">UAE trade corridor — 0.1% fee vs bank 3.5%, instant Polygon zkEVM settlement</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {CORRIDORS.map((c, i) => (
          <button key={i} onClick={() => setCorridor(i)} className={`btn btn-sm ${corridor === i ? "btn-acc" : ""}`} style={{ fontSize: 11 }}>
            {c.from.split(" ")[0]} → {c.to}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #EF444433", background: "#EF44440a" }}>
          <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 700, marginBottom: 6 }}>Traditional Bank</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#EF4444" }}>{sel.bankFee}% fee</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>= ${bankCost.toFixed(0)} cost</div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>⏱ {sel.bankTime}</div>
        </div>
        <div style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #10B98133", background: "#10B9810a" }}>
          <div style={{ fontSize: 10, color: "#10B981", fontWeight: 700, marginBottom: 6 }}>Polygon USDC</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#10B981" }}>{sel.ourFee}% fee</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>= ${ourCost.toFixed(0)} cost</div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>⏱ {sel.ourTime}</div>
        </div>
      </div>

      {saving > 0 && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "#10B9810d", border: "1px solid #10B98122", marginBottom: 12, fontSize: 12, color: "#10B981", fontWeight: 700 }}>
          Save ${saving.toFixed(0)} ({(saving / amtNum * 100).toFixed(1)}% vs bank) on ${amtNum.toLocaleString()} transfer
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 12 }}>
        <input className="inp" type="number" placeholder="Amount (AED)" value={amount} onChange={e => setAmount(e.target.value)} />
        <button className="btn btn-acc btn-sm" onClick={sendPayment} disabled={sending}>
          {sending ? <><Loader2 size={13} className="wallet-spin" /> Sending…</> : <><Send size={13} /> Send</>}
        </button>
      </div>
      {sendErr && (
        <div style={{ marginBottom: 12, padding: "7px 12px", borderRadius: 8, background: "#EF44441a", border: "1px solid #EF444433", color: "#EF4444", fontSize: 11, fontWeight: 600 }}>{sendErr}</div>
      )}

      {transfers.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Corridor</th><th>Amount</th><th>Hash</th><th>Time</th></tr></thead>
            <tbody>
              {transfers.slice(0, 8).map((t, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 11 }}>{t.from.split(" ")[0]} → {t.to}</td>
                  <td className="svc-table__num">${t.amount.toLocaleString()}</td>
                  <td style={{ fontSize: 10 }}><code>{t.hash}…</code></td>
                  <td className="svc-table__num" style={{ fontSize: 10 }}>{t.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Agent Marketplace — Polygon zkEVM ───────────────────────────────────────────

const AGENT_SERVICES = [
  { id: "ag-1", name: "UAE Trade Compliance Agent", provider: "0xprov…a91c", price: 0.50,  calls: 1842, rating: 4.9, tag: "compliance" },
  { id: "ag-2", name: "FX Rate Oracle (AED/USDC)",  provider: "0xprov…cc31", price: 0.02,  calls: 9431, rating: 4.8, tag: "oracle" },
  { id: "ag-3", name: "Invoice Verification Agent", provider: "0xprov…77be", price: 0.25,  calls: 624,  rating: 4.7, tag: "finance" },
  { id: "ag-4", name: "Shipping Document Parser",   provider: "0xprov…fe12", price: 0.10,  calls: 3201, rating: 4.6, tag: "logistics" },
];

export function PolygonAgentMarketplaceWidget({ workspace }: { workspace: Workspace }) {
  const [calls, setCalls] = useLocalStore<{ name: string; amount: number; hash: string; ts: string }[]>(
    `polygon-market-${workspace.id}`, []
  );
  const [calling, setCalling] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [callErr, setCallErr] = useState<string | null>(null);

  const tags = ["all", ...Array.from(new Set(AGENT_SERVICES.map(s => s.tag)))];
  const filtered = filter === "all" ? AGENT_SERVICES : AGENT_SERVICES.filter(s => s.tag === filter);

  async function callAgent(svc: typeof AGENT_SERVICES[0]) {
    // Agent marketplace service call — autonomous, gated by the Polygon Merchant Treasury.
    const preflight = checkFunding(POLY_FUNDING_SCOPE, svc.price, { mode: "treasury", serviceId: "svc_poly_merchant" });
    if (!preflight.ok) {
      setCallErr(`Agent call blocked — ${preflight.reason}. Sign a treasury allowance first.`);
      return;
    }
    setCallErr(null);
    setCalling(svc.id);
    await new Promise(r => setTimeout(r, 900 + deterministicScore(svc.id, 0, 800)));
    const hash = hashId("poly", `${svc.id}-${Date.now()}`).slice(0, 16);
    setCalls(prev => [{ name: svc.name, amount: svc.price, hash, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
    setCalling(null);
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#7B3FE4" }}><Users size={15} /></span>
        <div>
          <h3>Agent Marketplace — Polygon zkEVM</h3>
          <div className="sub">UAE commerce agents — call per-use, pay USDC, settle on-chain</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {tags.map(tag => (
          <button key={tag} onClick={() => setFilter(tag)} className={`btn btn-sm ${filter === tag ? "btn-acc" : ""}`} style={{ fontSize: 11 }}>
            {tag}
          </button>
        ))}
      </div>
      {callErr && (
        <div style={{ marginBottom: 12, padding: "7px 12px", borderRadius: 8, background: "#EF44441a", border: "1px solid #EF444433", color: "#EF4444", fontSize: 11, fontWeight: 600 }}>{callErr}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {filtered.map(svc => (
          <div key={svc.id} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border-subtle)", background: "var(--card-bg)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={15} style={{ color: "#7B3FE4" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{svc.name}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{svc.provider}</span>
                  <span style={{ fontSize: 10, color: "#F59E0B" }}>★ {svc.rating}</span>
                  <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{svc.calls.toLocaleString()} calls</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#7B3FE4", marginBottom: 4 }}>${svc.price} USDC</div>
                <button className="btn btn-sm btn-acc" style={{ fontSize: 11 }} onClick={() => callAgent(svc)} disabled={calling === svc.id}>
                  {calling === svc.id ? <Loader2 size={11} className="wallet-spin" /> : null}
                  {calling === svc.id ? "Calling…" : "Call"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {calls.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Agent</th><th>Paid</th><th>Hash</th><th>Time</th></tr></thead>
            <tbody>
              {calls.slice(0, 6).map((c, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 11 }}>{c.name.split(" ").slice(0, 3).join(" ")}…</td>
                  <td className="svc-table__num" style={{ color: "#7B3FE4" }}>${c.amount}</td>
                  <td style={{ fontSize: 10 }}><code>{c.hash}…</code></td>
                  <td className="svc-table__num" style={{ fontSize: 10 }}>{c.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Polygon Network Stats ───────────────────────────────────────────────────────

export function PolygonStatsWidget({ workspace: _ }: { workspace: Workspace }) {
  const [refreshing, setRefreshing] = useState(false);
  const [seed, setSeed] = useState(42);

  async function refresh() {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    setSeed(Date.now());
    setRefreshing(false);
  }

  const stats = [
    { label: "TPS",              val: (280 + deterministicScore(`tps-${seed}`, 0, 60)).toFixed(0) },
    { label: "Avg gas (gwei)",   val: (0.001 + deterministicScore(`gas-${seed}`, 0, 3) * 0.001).toFixed(4) },
    { label: "Finality",         val: "~2s" },
    { label: "USDC vol 24h",     val: `$${(4.2 + deterministicScore(`vol-${seed}`, 0, 5)).toFixed(1)}M` },
    { label: "Active merchants", val: (1240 + Math.floor(deterministicScore(`merchants-${seed}`, 0, 200))).toString() },
    { label: "Agent calls 24h",  val: (28400 + Math.floor(deterministicScore(`calls-${seed}`, 0, 5000))).toLocaleString() },
  ];

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#7B3FE4" }}><TrendingUp size={15} /></span>
        <div><h3>Polygon zkEVM Network Stats</h3><div className="sub">Live UAE commerce infrastructure metrics</div></div>
        <button className="btn btn-sm" onClick={refresh} disabled={refreshing} style={{ marginLeft: "auto" }}>
          {refreshing ? <Loader2 size={12} className="wallet-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 8 }}>
        {stats.map(s => (
          <div key={s.label} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--card-bg)" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#7B3FE4" }}>{s.val}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Why Polygon zkEVM for UAE Commerce?</div>
        {[
          { icon: ShieldCheck, text: "EVM-equivalent — deploy existing Solidity contracts unchanged" },
          { icon: DollarSign, text: "Gas fees ~0.001 gwei — 1000× cheaper than Ethereum L1" },
          { icon: Globe, text: "USDC natively supported — perfect for cross-border AED settlement" },
          { icon: Building2, text: "Polygon Labs × Ignyte $25K + $100K incentives for UAE commerce" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
            <Icon size={12} style={{ color: "#7B3FE4", marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{text}</span>
          </div>
        ))}
      </div>
      <PolygonDeployedContracts />
    </div>
  );
}

function PolygonDeployedContracts() {
  const { mode } = useNetworkMode("polygon");
  const cfg = getPolygonConfig(mode);
  const escrow = cfg.escrowAddress ?? undefined;
  const explorer = cfg.explorerBase;
  return (
    <div style={{ marginTop: 10, background: "var(--bg-2)", borderRadius: 12, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--line-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: ".68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)" }}>Deployed Contracts</span>
        <span style={{ fontSize: ".62rem", color: "#7B3FE4", fontWeight: 700, background: "#7B3FE418", padding: "2px 7px", borderRadius: 5 }}>Polygon zkEVM mainnet</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}>
        <ShieldCheck size={12} style={{ color: escrow ? "#7B3FE4" : "var(--muted)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: ".75rem", fontWeight: 700 }}>AgentEscrow.sol</div>
          <div style={{ fontSize: ".6rem", color: "var(--muted)" }}>chainId 1101 · deployed 2026-05-14</div>
        </div>
        {escrow ? (
          <a href={`${explorer}/address/${escrow}`} target="_blank" rel="noreferrer"
            style={{ fontSize: ".6rem", fontWeight: 700, color: "#7B3FE4", fontFamily: "monospace", textDecoration: "none" }}>
            {escrow.slice(0, 10)}…↗
          </a>
        ) : (
          <span style={{ fontSize: ".6rem", color: "var(--muted)", fontFamily: "monospace" }}>set VITE_POLYGON_MAINNET_ESCROW_ADDRESS</span>
        )}
      </div>
    </div>
  );
}

// ── Merchant Onboarding — 30-second setup ───────────────────────────────────────

const ONBOARD_STEPS = ["Business info", "API setup", "Deploy contract", "Go live"];

export function PolygonMerchantOnboardingWidget({ workspace }: { workspace: Workspace }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [apiDesc, setApiDesc] = useState("");
  const [price, setPrice] = useState("0.10");
  const [deploying, setDeploying] = useState(false);
  const [deployErr, setDeployErr] = useState<string | null>(null);
  const [deployed, setDeployed] = useLocalStore<{ name: string; address: string; endpoint: string; ts: string } | null>(
    `polygon-merchant-${workspace.id}`, null
  );
  const { mode } = useNetworkMode(workspace.id);

  async function deploy() {
    if (!safeAmt(price, 10_000)) return;
    // Merchant contract deploy — manual wallet action, never the Agent Treasury.
    try {
      await requestWalletPerCallSignature(POLY_FUNDING_SCOPE, 0, "svc_poly_merchant");
    } catch {
      setDeployErr("Wallet signature required — merchant contract not deployed.");
      return;
    }
    setDeployErr(null);
    setDeploying(true);
    await new Promise(r => setTimeout(r, 2000));
    const escrow = getPolygonConfig(mode).escrowAddress ?? `0x${hashId("merchant", `${name}`).slice(0, 40)}`;
    setDeployed({ name, address: escrow, endpoint: `/api/${name.toLowerCase().replace(/\s/g, "-")}`, ts: new Date().toLocaleTimeString() });
    setDeploying(false);
    setStep(3);
  }

  if (deployed && step === 3) {
    return (
      <div className="widget-card">
        <div className="widget-header">
          <span className="sq soft" style={{ color: "#7B3FE4" }}><Building2 size={15} /></span>
          <div><h3>Merchant Live on Polygon zkEVM</h3><div className="sub">Your paid API endpoint is live — agents can pay per call</div></div>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 10, border: "1.5px solid #10B98133", background: "#10B9810a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <CheckCircle size={16} style={{ color: "#10B981" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>Deployed in &lt;30 seconds</span>
          </div>
          {[
            { label: "Business", val: deployed.name },
            { label: "Contract", val: deployed.address.slice(0, 22) + "…" },
            { label: "Endpoint", val: deployed.endpoint },
            { label: "Deployed", val: deployed.ts },
          ].map(g => (
            <div key={g.label} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 70 }}>{g.label}</span>
              <code style={{ fontSize: 11, color: "#7B3FE4" }}>{g.val}</code>
            </div>
          ))}
        </div>
        <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => { setDeployed(null); setStep(0); setName(""); setApiDesc(""); }}>
          <RefreshCw size={12} /> Register another
        </button>
      </div>
    );
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="sq soft" style={{ color: "#7B3FE4" }}><Building2 size={15} /></span>
        <div><h3>Merchant Onboarding — 30 seconds</h3><div className="sub">Publish your paid API on Polygon zkEVM — no blockchain experience needed</div></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {ONBOARD_STEPS.map((s, i) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
              background: i === step ? "#7B3FE4" : i < step ? "#7B3FE422" : "var(--card-bg)",
              color: i === step ? "#fff" : i < step ? "#7B3FE4" : "var(--text-secondary)",
              border: `1px solid ${i <= step ? "#7B3FE4" : "var(--border-subtle)"}`,
            }}>{i < step ? "✓" : i + 1}. {s}</span>
            {i < ONBOARD_STEPS.length - 1 && <ArrowRight size={10} style={{ color: "var(--text-secondary)" }} />}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input className="inp" placeholder="Business name (e.g. Dubai Imports LLC)" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn btn-acc" onClick={() => setStep(1)} disabled={!name.trim()}>Next →</button>
        </div>
      )}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea className="inp" rows={2} placeholder="What does your API do? (e.g. Real-time AED/USD exchange rates)" value={apiDesc} onChange={e => setApiDesc(e.target.value)} style={{ resize: "vertical" }} />
          <input className="inp" type="number" placeholder="Price per call (USDC)" value={price} onChange={e => setPrice(e.target.value)} />
          <button className="btn btn-acc" onClick={() => setStep(2)} disabled={!apiDesc.trim()}>Next →</button>
        </div>
      )}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: "12px 14px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border-subtle)", fontSize: 11 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Ready to deploy</div>
            <div style={{ color: "var(--text-secondary)" }}>Business: <strong>{name}</strong></div>
            <div style={{ color: "var(--text-secondary)" }}>API: {apiDesc}</div>
            <div style={{ color: "var(--text-secondary)" }}>Price: <strong style={{ color: "#7B3FE4" }}>${price} USDC/call</strong></div>
            <div style={{ color: "var(--text-secondary)" }}>Network: Polygon zkEVM</div>
          </div>
          <button className="btn btn-acc" onClick={deploy} disabled={deploying}>
            {deploying ? <><Loader2 size={13} className="wallet-spin" /> Deploying ServiceRegistry contract…</> : <><BadgeCheck size={13} /> Deploy &amp; Go Live</>}
          </button>
          {deployErr && (
            <div style={{ padding: "7px 12px", borderRadius: 8, background: "#EF44441a", border: "1px solid #EF444433", color: "#EF4444", fontSize: 11, fontWeight: 600 }}>{deployErr}</div>
          )}
        </div>
      )}
    </div>
  );
}
