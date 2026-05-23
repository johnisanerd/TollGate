/**
 * QIE workspace — self-contained widget module
 *
 * Exports:
 *   - All QIE inline components (copied from WorkspaceDashboard)
 *   - Re-exports from widget sub-files
 *   - signature, cards(), renderTab(), renderAgentPanel(), renderOverviewExtra()
 */

import { useState, useMemo, type ReactNode } from "react";
import { useNetworkMode } from "../../hooks/useNetworkMode";
import { EcosystemLinksPanel } from "../../components/ui/EcosystemLinksPanel";
import {
  Bot,
  Check,
  Code,
  Copy,
  FileText,
  Loader2,
  MessageCircle,
  Plus,
  ReceiptText,
  Send,
  Shield,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useAppState } from "../../app-state";
import { useLocalStore } from "../../lib/storage";
import { deterministicScore, hashId } from "../../lib/util-hash";
import { makeTxHash } from "../../data";
import type { Receipt, Service, Workspace } from "../../types";
import type { SigBlock, CardDef, CardCtx, TabMeta, TabCtx } from "../_types";

// ---------------------------------------------------------------------------
// Re-exports from widget sub-files (also imported into scope for renderTab)
// ---------------------------------------------------------------------------
import { QiePosWidget, GameItemShop, MerchantPayoutsPanel, QieCheckoutPhoneMockup } from "../../components/widgets/qie-extra/QieExtraWidgets";
import { QieCreditWidget } from "./widgets/QieCreditWidget";
import { QieOracleFeedWidget } from "./widgets/QieOracleFeedWidget";
import { QieSubscriptionWidget } from "./widgets/QieSubscriptionWidget";
import { QieWalletConnectPanel } from "./widgets/QieWalletConnectPanel";
import { TreasuryPanel } from "./TreasuryPanel";
import { QIE_FUNDING_SCOPE, QIE_TREASURY_TOPUP_USD } from "./funding";

export { QiePosWidget, GameItemShop, MerchantPayoutsPanel, QieCheckoutPhoneMockup };
export { QieCreditWidget };
export { QieOracleFeedWidget };
export { QieWalletConnectPanel };
export { QieSubscriptionWidget };

// ---------------------------------------------------------------------------
// Local utilities
// ---------------------------------------------------------------------------

function ago(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  return Math.floor(d / 3600000) + "h ago";
}

function hashPct(seed: string, lo = 1.2, hi = 8.4): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return lo + ((h % 1000) / 1000) * (hi - lo);
}

// used for badge rendering in AgentWalletConsole
function badgeFor(status: string) {
  return <span className={`badge ${status}`}><span className="b-dot" />{status}</span>;
}

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type SplitPerson = { name: string; custom: string };
type QieSub = { id: string; subscriber: string; tier: string; priceQie: number; since: string; active: boolean };
type QiePass = { passId: string; holder: string; tier: "gold" | "silver" | "bronze"; issuedAt: string; expiresAt: string; status: "active" | "revoked" };
type CreatorTip = { id: string; creator: string; amount: number; message: string; ts: string };
type QieWalletState = { address: string; balance: number; cap: number };

// ---------------------------------------------------------------------------
// QIE Pass constants
// ---------------------------------------------------------------------------

const PASS_TIERS = ["gold", "silver", "bronze"] as const;
const TIER_RANK: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };
const SEED_PASSES: QiePass[] = [
  { passId: "qpass_a1f3c2", holder: "0xholder9a2c1e0b", tier: "gold", issuedAt: new Date(Date.now() - 10 * 864e5).toISOString(), expiresAt: new Date(Date.now() + 80 * 864e5).toISOString(), status: "active" },
  { passId: "qpass_77bd09", holder: "0xholder4f1d77aa", tier: "silver", issuedAt: new Date(Date.now() - 3 * 864e5).toISOString(), expiresAt: new Date(Date.now() + 27 * 864e5).toISOString(), status: "active" },
];

function gatedEndpoints(services: Service[]) {
  return services.map((s) => ({ s, req: (["bronze", "silver", "gold"] as const)[Math.floor(deterministicScore(s.id + "|tier", 0, 2.999))]! }));
}

// ---------------------------------------------------------------------------
// QIE Creator constants
// ---------------------------------------------------------------------------

const QIE_CREATORS = [
  { id: "cr_01", name: "0xZara.qie", niche: "AI research", followers: 4120, tier: "Gold" },
  { id: "cr_02", name: "0xNova.qie", niche: "DeFi strategies", followers: 2340, tier: "Silver" },
  { id: "cr_03", name: "0xMiro.qie", niche: "Game dev", followers: 870, tier: "Bronze" },
  { id: "cr_04", name: "0xAria.qie", niche: "NFT art", followers: 5600, tier: "Gold" },
] as const;

// ---------------------------------------------------------------------------
// QieBillSplitter
// ---------------------------------------------------------------------------

export function QieBillSplitter({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [total, setTotal] = useState("48.00");
  const [currency, setCurrency] = useState<"QIE" | "USDT">("USDT");
  const [people, setPeople] = useState<SplitPerson[]>([
    { name: "Alex", custom: "" },
    { name: "Mia", custom: "" },
    { name: "Sam", custom: "" },
  ]);
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [done, setDone] = useState<{ name: string; share: number; link: string }[] | null>(null);

  const t = parseFloat(total) || 0;
  const equalShare = people.length > 0 ? t / people.length : 0;
  const addPerson = () => setPeople((p) => [...p, { name: `Person ${p.length + 1}`, custom: "" }]);
  const rmPerson = (i: number) => setPeople((p) => p.filter((_, j) => j !== i));
  const setName = (i: number, v: string) => setPeople((p) => p.map((x, j) => j === i ? { ...x, name: v } : x));
  const setCustom = (i: number, v: string) => setPeople((p) => p.map((x, j) => j === i ? { ...x, custom: v } : x));
  const customTotal = people.reduce((s, p) => s + (parseFloat(p.custom) || 0), 0);
  const validCustom = Math.abs(customTotal - t) < 0.01;

  const split = () => {
    const results = people.map((p, i) => {
      const share = mode === "equal" ? equalShare : (parseFloat(p.custom) || 0);
      const id = hashId("split", p.name + i + Date.now(), 6);
      const link = `https://pay.qie.digital/bill/${id}?amount=${share.toFixed(2)}&currency=${encodeURIComponent(currency)}&to=${encodeURIComponent(p.name)}`;
      emitReceipt({ workspaceId: workspace.id, serviceName: "QIE Bill Split", amount: share, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.bill.split", payload: { person: p.name, share, link, batchTotal: t } });
      return { name: p.name, share, link };
    });
    setDone(results);
  };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft">🍕</span><div><h3>Bill splitter</h3><div className="sub">split any amount between people · get a payment link per person · everyone pays their share in QIE or USDT</div></div></div>
      </div>
      <div style={{ padding: "0 16px 4px" }}>
        {/* total + currency */}
        <div className="row sm" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 140 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Total bill</span>
            <input value={total} onChange={(e) => { setTotal(e.currentTarget.value); setDone(null); }} inputMode="decimal" style={{ padding: "10px 12px", borderRadius: 10, border: "2px solid var(--accent-primary)", background: "var(--bg-2)", color: "var(--ink)", fontSize: "1.1rem", fontWeight: 800 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.currentTarget.value as "QIE" | "USDT")} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".9rem" }}><option>QIE</option><option>USDT</option></select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Split mode</span>
            <div className="row sm" style={{ gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid var(--line-2)" }}>
              {(["equal", "custom"] as const).map((m) => <button key={m} type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, borderRadius: 0, background: mode === m ? "var(--accent-primary)" : "var(--bg-2)", color: mode === m ? "#fff" : "var(--muted)", fontWeight: mode === m ? 800 : 400, padding: "8px 14px" }} onClick={() => { setMode(m); setDone(null); }}>{m === "equal" ? "Equal" : "Custom"}</button>)}
            </div>
          </label>
        </div>
        {/* people list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {people.map((p, i) => (
            <div key={i} className="row sm" style={{ gap: 8, padding: "8px 12px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: `hsl(${i * 60},60%,55%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".7rem", fontWeight: 900, color: "#fff", flexShrink: 0 }}>{p.name[0]?.toUpperCase()}</span>
              <input value={p.name} onChange={(e) => { setName(i, e.currentTarget.value); setDone(null); }} placeholder="Name" style={{ flex: 1, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".85rem" }} />
              {mode === "equal"
                ? <span style={{ fontSize: ".9rem", fontWeight: 800, color: "var(--accent-primary)", minWidth: 70, textAlign: "right" }}>{currency} {equalShare.toFixed(2)}</span>
                : <input value={p.custom} onChange={(e) => { setCustom(i, e.currentTarget.value); setDone(null); }} inputMode="decimal" placeholder="0.00" style={{ width: 80, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".85rem", textAlign: "right" }} />
              }
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { rmPerson(i); setDone(null); }} style={{ color: "var(--muted)", padding: "4px 6px" }}><X width={13} height={13} /></button>
            </div>
          ))}
          <div className="row sm" style={{ gap: 10, marginTop: 2 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addPerson}><Plus width={12} height={12} /> Add person</button>
            {mode === "custom" && <span style={{ fontSize: ".74rem", color: validCustom ? "var(--green)" : "var(--red)", fontWeight: 700 }}>sum {customTotal.toFixed(2)} / {t.toFixed(2)} {validCustom ? "✓" : "— must match total"}</span>}
          </div>
        </div>
        <button type="button" className="btn btn-acc" style={{ width: "100%", padding: "11px 0", fontSize: ".92rem", fontWeight: 800 }} onClick={split} disabled={people.length === 0 || (mode === "custom" && !validCustom)}>
          Generate {people.length} payment link{people.length !== 1 ? "s" : ""} →
        </button>
        {/* results */}
        {done && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {done.map((d, i) => (
              <div key={i} style={{ padding: "10px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--green) 8%, var(--bg-2))", border: "1px solid color-mix(in srgb, var(--green) 25%, transparent)" }}>
                <div className="row sm" style={{ gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: `hsl(${i * 60},60%,55%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".66rem", fontWeight: 900, color: "#fff" }}>{d.name[0]?.toUpperCase()}</span>
                  <span style={{ fontWeight: 800, flex: 1 }}>{d.name}</span>
                  <span style={{ fontWeight: 900, color: "var(--green)" }}>{currency} {d.share.toFixed(2)}</span>
                </div>
                <div className="row sm" style={{ gap: 6 }}>
                  <code style={{ fontSize: ".65rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)" }}>{d.link}</code>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: ".68rem" }} onClick={() => navigator.clipboard?.writeText(d.link)}><Copy width={11} height={11} /> Copy</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ height: 14 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// QieRequestPay
// ---------------------------------------------------------------------------

export function QieRequestPay({ workspace }: { workspace: Workspace }) {
  const [amount, setAmount] = useState("10.00");
  const [note, setNote] = useState("for the design work");
  const [currency, setCurrency] = useState<"QIE" | "USDT">("USDT");
  const [copied, setCopied] = useState(false);

  const myAddr = "0x" + hashId("me", workspace.id, 40);
  const link = `https://pay.qie.digital/request?to=${myAddr.slice(0, 12)}&amount=${amount}&currency=${currency}&note=${encodeURIComponent(note)}`;

  const copy = () => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft">💸</span><div><h3>Request payment</h3><div className="sub">fill in amount + note → share a link → payer opens it and pays you instantly in QIE / USDT</div></div></div>
      </div>
      <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Amount</span>
            <input value={amount} onChange={(e) => setAmount(e.currentTarget.value)} inputMode="decimal" style={{ padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".95rem", fontWeight: 800 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.currentTarget.value as "QIE" | "USDT")} style={{ padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".9rem" }}><option>QIE</option><option>USDT</option></select>
          </label>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Note (what is it for?)</span>
          <input value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="e.g. dinner last Friday" style={{ padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".88rem" }} />
        </label>
        {/* link preview */}
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--accent-primary) 7%, var(--bg-2))", border: "1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)" }}>
          <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700, marginBottom: 6 }}>Your payment request link</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: ".72rem", color: "var(--muted)", wordBreak: "break-all", marginBottom: 8 }}>{link}</div>
          <button type="button" className="btn btn-acc" style={{ width: "100%", padding: "9px 0", fontWeight: 800 }} onClick={copy}>
            {copied ? <><Check width={14} height={14} /> Copied!</> : <><Copy width={14} height={14} /> Copy link</>}
          </button>
        </div>
        <div style={{ fontSize: ".72rem", color: "var(--muted)", textAlign: "center" }}>Send this link to anyone · they open it · pay with one click · you get notified</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QieWalletDashboard
// ---------------------------------------------------------------------------

export function QieWalletDashboard({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [balance, setBalance] = useLocalStore("qie.wallet.qie", 0);
  const [usdtBal, setUsdtBal] = useLocalStore("qie.wallet.usdt", 0);
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("5");
  const [token, setToken] = useState<"QIE" | "USDT">("QIE");
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const addr = "0x" + hashId("qw", workspace.id, 40);

  const txs = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && (r.kind?.startsWith("qie.wallet") || r.kind?.startsWith("qie."))).slice(0, 10), [receipts, workspace.id]);

  const catSpend: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = { Payments: 0, Gaming: 0, Tips: 0, Passes: 0 };
    for (const r of receipts.filter((r) => r.workspaceId === workspace.id)) {
      if (r.kind?.includes("checkout") || r.kind?.includes("pay")) m.Payments = (m.Payments ?? 0) + r.amount;
      else if (r.kind?.includes("game") || r.kind?.includes("item")) m.Gaming = (m.Gaming ?? 0) + r.amount;
      else if (r.kind?.includes("tip")) m.Tips = (m.Tips ?? 0) + r.amount;
      else if (r.kind?.includes("pass")) m.Passes = (m.Passes ?? 0) + r.amount;
    }
    return m;
  }, [receipts, workspace.id]);

  const catColors = ["#00C389", "#f59e0b", "#8b5cf6", "#3b82f6"] as const;
  const catKeys = ["Payments", "Gaming", "Tips", "Passes"] as const;
  const totalCat = catKeys.reduce((s, k) => s + (catSpend[k] ?? 0), 0) || 1;

  const doSend = () => {
    const a = parseFloat(amt) || 0; if (a <= 0 || !to) return;
    const bal = token === "QIE" ? balance : usdtBal;
    if (a > bal) { setNotice({ ok: false, msg: "Insufficient balance" }); return; }
    if (token === "QIE") setBalance((b) => +(b - a).toFixed(4));
    else setUsdtBal((b) => +(b - a).toFixed(4));
    emitReceipt({ workspaceId: workspace.id, serviceName: `QIE Wallet · Send ${token}`, amount: a, currency: token === "QIE" ? "QIE" as const : "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.wallet.send", payload: { to, token, txHash: makeTxHash() } });
    setNotice({ ok: true, msg: `Sent ${a} ${token} → ${to.slice(0, 10)}…` });
    setTo(""); setAmt("5");
  };

  // SVG donut
  const donut = (() => {
    const r = 36; const cx = 44; const cy = 44; const stroke = 14;
    let offset = 0;
    return catKeys.map((k, i) => {
      const pct = (catSpend[k] ?? 0) / totalCat;
      const dash = pct * 2 * Math.PI * r;
      const gap = 2 * Math.PI * r - dash;
      const el = <circle key={k} cx={cx} cy={cy} r={r} fill="none" stroke={catColors[i]!} strokeWidth={stroke} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} strokeLinecap="round" />;
      offset += dash;
      return el;
    });
  })();

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Wallet width={15} height={15} /></span><div><h3>QIE Wallet</h3><div className="sub">your balances, spend breakdown, and quick transfer</div></div></div>
      </div>
      {/* balance hero */}
      <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800, marginBottom: 3 }}>QIE balance</div>
          <div style={{ fontSize: "2rem", fontWeight: 900, color: "#00C389" }}>{balance.toFixed(2)} <span style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--muted)" }}>QIE</span></div>
        </div>
        <div>
          <div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800, marginBottom: 3 }}>USDT balance</div>
          <div style={{ fontSize: "2rem", fontWeight: 900, color: "#10b981" }}>{usdtBal.toFixed(2)} <span style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--muted)" }}>USDT</span></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800, marginBottom: 3 }}>Address</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: ".7rem", color: "var(--muted)" }}>{addr.slice(0, 14)}…</div>
        </div>
      </div>
      {/* spend donut + categories */}
      <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "88px 1fr", gap: 16, alignItems: "center" }}>
        <svg width="88" height="88" viewBox="0 0 88 88" style={{ display: "block" }}>
          <circle cx={44} cy={44} r={36} fill="none" stroke="var(--line-2)" strokeWidth={14} />
          <g transform={`rotate(-90 44 44)`}>{donut}</g>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700, marginBottom: 2 }}>Spend by category</div>
          {catKeys.map((k, i) => (
            <div key={k} className="row sm" style={{ gap: 7 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: catColors[i]!, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: ".78rem" }}>{k}</span>
              <span style={{ fontWeight: 800, fontSize: ".78rem", color: catColors[i]! }}>{((catSpend[k] ?? 0) / totalCat * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
      {/* quick transfer */}
      <div style={{ margin: "0 16px 12px", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--field)" }}>
        <div style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700, marginBottom: 8 }}>Quick transfer</div>
        <div className="row sm" style={{ gap: 8, flexWrap: "wrap" }}>
          <input value={to} onChange={(e) => setTo(e.currentTarget.value)} placeholder="0x… recipient" style={{ flex: 1, minWidth: 160, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem", fontFamily: "var(--mono)" }} />
          <input value={amt} onChange={(e) => setAmt(e.currentTarget.value)} inputMode="decimal" style={{ width: 70, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".85rem", fontWeight: 700 }} />
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--line-2)" }}>
            {(["QIE", "USDT"] as const).map((tk) => <button key={tk} type="button" style={{ padding: "7px 10px", background: token === tk ? "#00C389" : "var(--bg-2)", color: token === tk ? "#fff" : "var(--muted)", border: "none", cursor: "pointer", fontWeight: token === tk ? 800 : 400, fontSize: ".8rem" }} onClick={() => setToken(tk)}>{tk}</button>)}
          </div>
          <button type="button" className="btn btn-acc btn-sm" onClick={doSend}><Send width={12} height={12} /> Send</button>
        </div>
        {notice && <div style={{ marginTop: 6, fontSize: ".76rem", fontWeight: 700, color: notice.ok ? "var(--green)" : "var(--red)" }}>{notice.ok ? <Check width={12} height={12} /> : <X width={12} height={12} />} {notice.msg}</div>}
      </div>
      {/* tx feed */}
      {txs.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "4px 0 6px" }}>Recent transactions · {txs.length}</div>
          <div className="svc-hist">{txs.map((r) => <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "#00C389" }} /><div className="svc-hist__main"><b>{r.serviceName}</b><span>{new Date(r.createdAt).toLocaleTimeString()}</span></div><span className="svc-hist__amt">{r.amount.toFixed(2)}</span></div>)}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QieCreatorSubscriptions
// ---------------------------------------------------------------------------

export function QieCreatorSubscriptions({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [price, setPrice] = useState("2");
  const [desc, setDesc] = useState("Monthly AI insights newsletter + gated Q&A access");
  const [reqTier, setReqTier] = useState<"bronze" | "silver" | "gold">("silver");
  const [subs, setSubs] = useLocalStore<QieSub[]>("qie.creator.subs", [
    { id: "sub_01", subscriber: "0xfan9a2c1e0b", tier: "silver", priceQie: 2, since: new Date(Date.now() - 15 * 864e5).toISOString(), active: true },
    { id: "sub_02", subscriber: "0xfan4f1d77aa", tier: "gold", priceQie: 2, since: new Date(Date.now() - 45 * 864e5).toISOString(), active: true },
  ]);
  const [copied, setCopied] = useState(false);
  const link = `https://pay.qie.digital/subscribe/${hashId("subs", workspace.id + price + reqTier, 8)}?price=${price}&tier=${reqTier}`;

  const totalMonthly = subs.filter((s) => s.active).reduce((sum, s) => sum + s.priceQie, 0);
  const copy = () => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const addDemoSub = () => {
    const id = "sub_" + hashId("sub", Date.now().toString(), 6);
    const newSub: QieSub = { id, subscriber: "0xnew" + hashId("fan", id, 8), tier: reqTier, priceQie: parseFloat(price) || 1, since: new Date().toISOString(), active: true };
    setSubs((p) => [newSub, ...p].slice(0, 20));
    emitReceipt({ workspaceId: workspace.id, serviceName: "QIE Creator · New Subscriber", amount: parseFloat(price) || 1, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.creator.sub", payload: { tier: reqTier, subscriber: newSub.subscriber } });
  };

  const tierColor = { bronze: "#b07a3a", silver: "#9aa3ad", gold: "#e0a200" } as const;

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft">⭐</span><div><h3>Creator Subscriptions</h3><div className="sub">set up recurring QIE subscriptions · share a link · fans pay monthly · you see every renewal</div></div></div>
      </div>
      <div style={{ padding: "0 16px 14px" }}>
        {/* stats hero */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Subscribers", val: subs.filter((s) => s.active).length, col: "#00C389" },
            { label: "Monthly revenue", val: `${totalMonthly.toFixed(1)} QIE`, col: "#f59e0b" },
            { label: "Required tier", val: reqTier, col: tierColor[reqTier] },
          ].map((s) => (
            <div key={s.label} style={{ padding: "10px 12px", borderRadius: 12, background: s.col + "12", border: `1px solid ${s.col}28`, textAlign: "center" }}>
              <div style={{ fontSize: ".58rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>{s.label}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 900, color: s.col, marginTop: 3, textTransform: "capitalize" }}>{String(s.val)}</div>
            </div>
          ))}
        </div>
        {/* setup form */}
        <div style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--field)", marginBottom: 12 }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>Subscription settings</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: ".6rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Price (QIE/mo)</span>
              <input value={price} onChange={(e) => setPrice(e.currentTarget.value)} inputMode="decimal" style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".88rem", fontWeight: 800 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: ".6rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Min QIE Pass tier</span>
              <select value={reqTier} onChange={(e) => setReqTier(e.currentTarget.value as typeof reqTier)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>
                <option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option>
              </select>
            </label>
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-end" }} onClick={addDemoSub}><Plus width={11} height={11} /> Demo sub</button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <input value={desc} onChange={(e) => setDesc(e.currentTarget.value)} placeholder="What subscribers get…" style={{ width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".82rem", boxSizing: "border-box" }} />
          </div>
          <div style={{ padding: "8px 12px", borderRadius: 10, background: "color-mix(in srgb, #00C389 7%, var(--bg-2))", border: "1px solid #00C38928" }}>
            <div style={{ fontSize: ".6rem", color: "var(--muted)", fontWeight: 700, marginBottom: 5 }}>Your subscription link</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: ".68rem", color: "var(--muted)", marginBottom: 6, wordBreak: "break-all" }}>{link}</div>
            <button type="button" className="btn btn-acc btn-sm" style={{ width: "100%", fontWeight: 800 }} onClick={copy}>{copied ? <><Check width={12} height={12} /> Copied!</> : <><Copy width={12} height={12} /> Copy subscription link</>}</button>
          </div>
        </div>
        {/* subscriber list */}
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 6 }}>Subscribers · {subs.length}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {subs.map((s) => (
            <div key={s.id} className="row sm" style={{ gap: 8, padding: "7px 10px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
              <span className="pill" style={{ background: tierColor[s.tier as keyof typeof tierColor] + "18", color: tierColor[s.tier as keyof typeof tierColor], fontSize: ".6rem", textTransform: "capitalize" }}>{s.tier}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: ".7rem", flex: 1 }}>{s.subscriber.slice(0, 14)}…</span>
              <span style={{ fontSize: ".68rem", color: "var(--muted)" }}>since {new Date(s.since).toLocaleDateString()}</span>
              <span style={{ fontSize: ".72rem", fontWeight: 800, color: "#00C389" }}>{s.priceQie} QIE/mo</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QieSalesAnalytics
// ---------------------------------------------------------------------------

export function QieSalesAnalytics({ workspace }: { workspace: Workspace }) {
  const { receipts } = useAppState();
  const checkoutReceipts = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && (r.kind?.includes("checkout") || r.kind?.includes("invoice") || r.kind?.includes("pos") || r.kind?.includes("split") || r.kind?.includes("request"))), [receipts, workspace.id]);

  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString(undefined, { weekday: "short" });
    const base = deterministicScore(`sales_qie_d${i}`, 2, 18);
    const real = checkoutReceipts.filter((r) => new Date(r.createdAt).getDate() === d.getDate()).reduce((s, r) => s + r.amount, 0);
    return { label, rev: +(base + real).toFixed(2) };
  });
  const maxRev = Math.max(...days7.map((d) => d.rev), 1);
  const totalRev = days7.reduce((s, d) => s + d.rev, 0);
  const avgOrder = +(totalRev / Math.max(days7.reduce((s, d) => s + Math.round(d.rev / 3), 0), 1)).toFixed(2);

  const topProducts = [
    { name: "Premium AI Report", orders: 14, rev: 42 },
    { name: "Monthly Data Feed", orders: 8, rev: 64 },
    { name: "Strategy Signal Pack", orders: 5, rev: 25 },
    { name: "API Access — 100 calls", orders: 11, rev: 33 },
    { name: "Custom Analysis", orders: 3, rev: 60 },
  ];
  const topProduct = topProducts.reduce((a, b) => a.orders > b.orders ? a : b);

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft">📊</span><div><h3>Sales Analytics</h3><div className="sub">7-day revenue · orders · top products · repeat buyer rate — your merchant dashboard</div></div></div>
      </div>
      <div style={{ padding: "0 16px 14px" }}>
        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Revenue (7d)", val: `$${totalRev.toFixed(2)}`, col: "#00C389" },
            { label: "Orders", val: String(days7.reduce((s, d) => s + Math.round(d.rev / 3), 0)), col: "#3b82f6" },
            { label: "Avg order", val: `$${avgOrder}`, col: "#8b5cf6" },
            { label: "Top product", val: topProduct.name.split(" ").slice(0, 2).join(" "), col: "#f59e0b" },
          ].map((s) => (
            <div key={s.label} style={{ padding: "10px 12px", borderRadius: 12, background: s.col + "12", border: `1px solid ${s.col}28`, textAlign: "center" }}>
              <div style={{ fontSize: ".56rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 700 }}>{s.label}</div>
              <div style={{ fontSize: ".95rem", fontWeight: 900, color: s.col, marginTop: 3 }}>{s.val}</div>
            </div>
          ))}
        </div>
        {/* revenue bar chart */}
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 80, marginBottom: 14 }}>
          {days7.map((d) => (
            <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#00C389" }}>${d.rev}</span>
              <div style={{ width: "100%", height: Math.max(6, d.rev / maxRev * 56), background: "#00C389", borderRadius: "4px 4px 0 0", opacity: 0.8 }} />
              <span style={{ fontSize: ".6rem", color: "var(--muted)" }}>{d.label}</span>
            </div>
          ))}
        </div>
        {/* top products */}
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 6 }}>Top products</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {topProducts.map((p) => (
            <div key={p.name} className="row sm" style={{ gap: 8, padding: "6px 10px", borderRadius: 9, background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
              <span style={{ flex: 1, fontSize: ".8rem" }}>{p.name}</span>
              <span style={{ fontSize: ".72rem", color: "var(--muted)" }}>{p.orders} orders</span>
              <span style={{ fontSize: ".78rem", fontWeight: 800, color: "#00C389" }}>${p.rev}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QiePassIssuer
// ---------------------------------------------------------------------------

export function QiePassIssuer({ workspace, services }: { workspace: Workspace; services: Service[] }) {
  const { emitReceipt, receipts } = useAppState();
  const [list, setList] = useLocalStore<QiePass[]>("qie.passes", SEED_PASSES);
  const [holder, setHolder] = useState("0xnewholder1a2b3c4d");
  const [tier, setTier] = useState<typeof PASS_TIERS[number]>("silver");
  const [days, setDays] = useState(90);
  const gated = useMemo(() => gatedEndpoints(services.slice(0, 6)), [services]);
  const [checkPass, setCheckPass] = useState(list[0]?.passId ?? "");
  const [checkSvc, setCheckSvc] = useState(gated[0]?.s.id ?? "");
  const [checkRes, setCheckRes] = useState<{ ok: boolean; reason: string } | null>(null);
  const accessChecks = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && r.kind === "qie.pass.access").slice(0, 6), [receipts, workspace.id]);

  const issue = () => {
    const passId = "qpass_" + hashId("qpass", holder + tier + Date.now(), 6);
    const p: QiePass = { passId, holder: holder.trim() || "0x", tier, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * 864e5).toISOString(), status: "active" };
    setList((prev) => [p, ...prev].slice(0, 20));
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_qie_pass", serviceName: "QIE Pass · Mint", amount: 0.02, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.pass.issue", payload: { passId, holder: p.holder, tier, expiresAt: p.expiresAt } });
  };
  const revoke = (id: string) => setList((prev) => prev.map((x) => x.passId === id ? { ...x, status: "revoked" } : x));
  const checkAccess = () => {
    const p = list.find((x) => x.passId === checkPass);
    const g = gated.find((x) => x.s.id === checkSvc);
    let ok = true, reason = "Access granted";
    if (!p) { ok = false; reason = "pass not found"; }
    else if (p.status === "revoked") { ok = false; reason = "pass has been revoked"; }
    else if (new Date(p.expiresAt) < new Date()) { ok = false; reason = "pass expired"; }
    else if (g && TIER_RANK[p.tier]! < TIER_RANK[g.req]!) { ok = false; reason = `endpoint requires ${g.req} tier — pass is ${p.tier}`; }
    setCheckRes({ ok, reason });
    if (ok && p && g) emitReceipt({ workspaceId: workspace.id, serviceId: g.s.id, serviceName: `QIE Pass · Access ${g.s.name}`, amount: 0, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.pass.access", payload: { passId: p.passId, endpoint: g.s.id, tier: p.tier } });
  };
  const tierColor = (tt: string) => tt === "gold" ? "#e0a200" : tt === "silver" ? "#9aa3ad" : "#b07a3a";

  const TIER_META = [
    { t: "gold" as const, col: "#e0a200", label: "Gold", price: "$9.99", validity: "365 days", perks: ["All endpoints unlocked", "Batch API (up to 500 calls/day)", "Priority queue + 0-fee transactions", "White-label checkout embed"] },
    { t: "silver" as const, col: "#9aa3ad", label: "Silver", price: "$3.99", validity: "90 days", perks: ["Standard API access", "Up to 100 calls/day", "QIE Pay checkout link", "Access reports & receipts"] },
    { t: "bronze" as const, col: "#b07a3a", label: "Bronze", price: "$0.99", validity: "30 days", perks: ["Basic read-only endpoints", "Up to 10 calls/day", "Public checkout link"] },
  ] as const;

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl"><span className="sq soft"><Shield width={15} height={15} /></span><div><h3>QIE Pass — membership tiers</h3><div className="sub">get an on-chain pass · unlocks paid API endpoints · gates by tier · every access logged as receipt</div></div></div>
      </div>

      {/* tier ladder */}
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {TIER_META.map((tm) => {
          const active = list.filter((p) => p.tier === tm.t && p.status === "active");
          const isSelected = tier === tm.t;
          return (
            <div key={tm.t} onClick={() => setTier(tm.t)} style={{ borderRadius: 14, border: `2px solid ${isSelected ? tm.col : "var(--line-2)"}`, background: isSelected ? `color-mix(in srgb, ${tm.col} 8%, var(--bg-2))` : "var(--bg-2)", padding: "14px 18px", cursor: "pointer", transition: "border-color .15s, background .15s", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "0 18px", alignItems: "center" }}>
              {/* left: tier badge */}
              <div style={{ width: 44, height: 44, borderRadius: 12, background: tm.col + "22", border: `2px solid ${tm.col}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.1rem" }}>{tm.t === "gold" ? "🥇" : tm.t === "silver" ? "🥈" : "🥉"}</span>
              </div>
              {/* middle: name + perks */}
              <div>
                <div className="row sm" style={{ gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontWeight: 900, fontSize: "1rem", color: tm.col }}>{tm.label}</span>
                  <span style={{ fontSize: ".72rem", color: "var(--muted)", fontWeight: 600 }}>{tm.validity}</span>
                  {active.length > 0 && <span className="pill ok" style={{ fontSize: ".6rem" }}>{active.length} active</span>}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tm.perks.map((p) => <span key={p} style={{ fontSize: ".68rem", color: "var(--muted)", background: "var(--bg-1)", padding: "2px 7px", borderRadius: 6 }}>✓ {p}</span>)}
                </div>
              </div>
              {/* right: price + CTA */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span style={{ fontWeight: 900, fontSize: "1.15rem", color: isSelected ? tm.col : "var(--ink)" }}>{tm.price}</span>
                {isSelected && <span style={{ fontSize: ".65rem", fontWeight: 800, color: tm.col, textTransform: "uppercase", letterSpacing: ".07em" }}>Selected ✓</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* issue form */}
      <div style={{ margin: "0 16px 12px", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--field)" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 10 }}>Issue a {tier} pass to an address</div>
        <div className="row sm" style={{ gap: 8, flexWrap: "wrap" }}>
          <input value={holder} onChange={(e) => setHolder(e.currentTarget.value)} placeholder="0xholder…" style={{ flex: 1, minWidth: 200, padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".82rem", fontFamily: "var(--mono)" }} />
          <select value={days} onChange={(e) => setDays(Number(e.currentTarget.value))} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>{[30, 90, 365].map((d) => <option key={d}>{d} days</option>)}</select>
          <button className="btn btn-acc btn-sm" type="button" onClick={issue}><Plus width={13} height={13} /> Mint pass ($0.02)</button>
        </div>
      </div>

      {/* active passes compact list */}
      {list.filter((p) => p.status === "active").length > 0 && (
        <div style={{ padding: "0 16px 10px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "4px 0 6px" }}>Active passes · {list.filter((p) => p.status === "active").length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {list.filter((p) => p.status === "active").map((p) => (
              <div key={p.passId} className="row sm" style={{ gap: 8, padding: "7px 10px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
                <span className="pill" style={{ background: `color-mix(in srgb, ${tierColor(p.tier)} 18%, transparent)`, color: tierColor(p.tier), fontWeight: 800, fontSize: ".62rem", textTransform: "capitalize" }}>{p.tier}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: ".72rem", flex: 1 }}>{p.holder.slice(0, 16)}…</span>
                <span style={{ fontSize: ".68rem", color: "var(--muted)" }}>exp {new Date(p.expiresAt).toLocaleDateString()}</span>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => revoke(p.passId)} style={{ fontSize: ".68rem", padding: "2px 8px" }}>Revoke</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* access check */}
      <div style={{ margin: "0 16px 12px", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--field)" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>Check access to a gated endpoint</div>
        <div className="row sm" style={{ gap: 8, flexWrap: "wrap" }}>
          <select value={checkPass} onChange={(e) => setCheckPass(e.currentTarget.value)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem" }}>{list.map((p) => <option key={p.passId} value={p.passId}>{p.passId} ({p.tier})</option>)}</select>
          <select value={checkSvc} onChange={(e) => setCheckSvc(e.currentTarget.value)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem" }}>{gated.map((g) => <option key={g.s.id} value={g.s.id}>{g.s.name} — needs {g.req}</option>)}</select>
          <button className="btn btn-sm" type="button" onClick={checkAccess}>Check</button>
        </div>
        {checkRes && <div style={{ marginTop: 8, padding: "7px 12px", borderRadius: 10, background: `color-mix(in srgb, ${checkRes.ok ? "var(--green)" : "var(--red)"} 12%, transparent)`, color: checkRes.ok ? "var(--green)" : "var(--red)", fontSize: ".78rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>{checkRes.ok ? <Check width={13} height={13} /> : <X width={13} height={13} />} {checkRes.ok ? "ACCESS GRANTED" : "ACCESS DENIED"} — {checkRes.reason}</div>}
      </div>
      {accessChecks.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent access checks · {accessChecks.length}</div>
          <div className="svc-hist">{accessChecks.map((r) => { const p = (r.payload ?? {}) as { passId?: string; endpoint?: string; tier?: string }; return (
            <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: "#1fb58a" }} /><div className="svc-hist__main"><b>{p.passId}</b><span>{p.endpoint} · {p.tier} · {new Date(r.createdAt).toLocaleTimeString()}</span></div><span className="pill ok">granted</span></div>
          ); })}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QieCreatorTipsWidget
// ---------------------------------------------------------------------------

export function QieCreatorTipsWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [tips, setTips] = useLocalStore<CreatorTip[]>("qie.creator.tips", []);
  const [selectedCreator, setSelectedCreator] = useState<string>(QIE_CREATORS[0]!.id);
  const [amtStr, setAmtStr] = useState("5");
  const [message, setMessage] = useState("Great content!");
  const [busy, setBusy] = useState(false);
  const tierColor = { Gold: "#F59E0B", Silver: "#94A3B8", Bronze: "#CD7C2F" } as const;
  const tip = async () => {
    const creator = QIE_CREATORS.find((c) => c.id === selectedCreator) ?? QIE_CREATORS[0]!;
    const amt = parseFloat(amtStr) || 1;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 500));
    const t: CreatorTip = { id: "tip_" + hashId("qie", creator.id + Date.now(), 8), creator: creator.name, amount: amt, message: message.trim() || "Great content!", ts: new Date().toLocaleTimeString() };
    setTips((prev) => [t, ...prev].slice(0, 30));
    emitReceipt({ workspaceId: workspace.id, serviceId: "svc_qie_checkout", serviceName: `Creator Tip · ${creator.name}`, amount: amt, currency: "QIE", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.creator.tip", payload: { creatorId: creator.id, name: creator.name, amount: amt, message: t.message } });
    setBusy(false);
  };
  const totalTipped = tips.reduce((s, tt) => s + tt.amount, 0);
  const AVATARS = ["#7C5CF8", "#1fb58a", "#3aa0e6", "#e63946"];
  const sel = QIE_CREATORS.find((c) => c.id === selectedCreator) ?? QIE_CREATORS[0]!;
  const selColor = tierColor[sel.tier as keyof typeof tierColor] ?? "var(--muted)";
  return (
    <div className="panel block svc-flavor" style={{ overflow: "hidden" }}>
      <div className="block-head" style={{ borderBottom: "1px solid var(--line-2)", paddingBottom: 12 }}>
        <div className="ttl"><span className="sq soft"><MessageCircle width={15} height={15} /></span><div><h3>Creator social feed</h3><div className="sub">Support QIE creators · QIE Pass gating · Social &amp; Community track</div></div></div>
        {totalTipped > 0 && <span style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--accent-primary)", background: "color-mix(in srgb, var(--accent-primary) 10%, transparent)", borderRadius: 8, padding: "3px 8px" }}>{totalTipped.toFixed(0)} QIE tipped</span>}
      </div>
      {/* Creator profile card grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(178px, 1fr))", gap: 10, padding: "16px 16px 12px" }}>
        {QIE_CREATORS.map((c, i) => {
          const tc = tierColor[c.tier as keyof typeof tierColor] ?? "var(--muted)";
          const avatar = AVATARS[i % AVATARS.length]!;
          const creatorTips = tips.filter((tt) => tt.creator === c.name);
          const tipped = creatorTips.reduce((s, tt) => s + tt.amount, 0);
          const isSel = selectedCreator === c.id;
          return (
            <div key={c.id} onClick={() => setSelectedCreator(c.id)} style={{ borderRadius: 14, border: `2px solid ${isSel ? tc : "var(--line-2)"}`, background: isSel ? `color-mix(in srgb, ${tc} 6%, var(--bg-2))` : "var(--bg-2)", padding: "14px 14px 12px", cursor: "pointer", transition: "all .2s", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: avatar, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "1rem", color: "#fff", flexShrink: 0 }}>{c.name.slice(2, 4).toUpperCase()}</div>
                <span style={{ fontSize: ".6rem", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: tc, background: `${tc}22`, borderRadius: 6, padding: "2px 7px" }}>{c.tier}</span>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: ".85rem" }}>{c.name}</div>
                <div style={{ fontSize: ".68rem", color: "var(--muted)" }}>{c.niche}</div>
              </div>
              <div style={{ display: "flex", gap: 10, fontSize: ".68rem" }}>
                <span style={{ color: "var(--muted)" }}>👥 <b style={{ color: "var(--ink)" }}>{(c.followers / 1000).toFixed(1)}K</b></span>
                {tipped > 0 && <span style={{ color: "var(--muted)" }}>💸 <b style={{ color: tc }}>{tipped} QIE</b></span>}
              </div>
              {isSel && <div style={{ fontSize: ".65rem", fontWeight: 700, color: tc, borderTop: `1px solid ${tc}33`, paddingTop: 6 }}><Check width={11} height={11} /> Selected</div>}
            </div>
          );
        })}
      </div>
      {/* Tip form */}
      <div style={{ margin: "0 16px 14px", padding: "12px 14px", borderRadius: 12, border: `1px solid color-mix(in srgb, ${selColor} 30%, var(--line-2))`, background: `color-mix(in srgb, ${selColor} 5%, transparent)` }}>
        <div style={{ fontSize: ".7rem", fontWeight: 800, color: selColor, marginBottom: 8 }}>Tip {sel.name} ({sel.tier})</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)" }}>
            <span style={{ fontSize: ".7rem", color: "var(--muted)" }}>QIE</span>
            <input value={amtStr} onChange={(e) => setAmtStr(e.currentTarget.value)} inputMode="decimal" style={{ width: 55, background: "none", border: "none", outline: "none", color: "var(--ink)", fontSize: ".9rem", fontWeight: 800 }} />
          </div>
          <input value={message} onChange={(e) => setMessage(e.currentTarget.value)} placeholder="Message…" style={{ flex: 1, minWidth: 120, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".8rem" }} />
          <button className="btn btn-acc btn-sm" type="button" onClick={tip} disabled={busy}>{busy ? <Loader2 size={13} className="wallet-spin" /> : <Zap width={13} height={13} />} Send tip</button>
        </div>
      </div>
      {/* Social feed */}
      {tips.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line-2)", padding: "10px 16px 14px" }}>
          <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>Recent tips · {tips.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tips.slice(0, 5).map((tt) => (
              <div key={tt.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, background: "var(--field)", border: "1px solid var(--line-2)" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".75rem", flexShrink: 0 }}>💸</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: ".78rem", fontWeight: 700 }}>→ {tt.creator}</div><div style={{ fontSize: ".68rem", color: "var(--muted)" }}>{tt.message}</div></div>
                <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontWeight: 800, color: "var(--accent-primary)", fontSize: ".82rem" }}>{tt.amount} QIE</div><div style={{ fontSize: ".62rem", color: "var(--muted)" }}>{tt.ts}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentWalletConsole
// ---------------------------------------------------------------------------

export function AgentWalletConsole({ workspace }: { workspace: Workspace }) {
  const { emitReceipt, receipts } = useAppState();
  const [w, setW] = useLocalStore<QieWalletState>("qie.wallet", { address: "0x" + hashId("qwagent", workspace.id, 40), balance: 0, cap: 1.0 });
  const [topup, setTopup] = useState("5.00");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0.40");
  const [memo, setMemo] = useState("API tool call");
  const [capDraft, setCapDraft] = useState(String(w.cap));
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const activity = useMemo(() => receipts.filter((r) => r.workspaceId === workspace.id && (r.kind === "qie.wallet.send" || r.kind === "qie.wallet.topup")).slice(0, 8), [receipts, workspace.id]);

  const doTopup = () => {
    const a = parseFloat(topup) || 0; if (a <= 0) return;
    setW((s) => ({ ...s, balance: Number((s.balance + a).toFixed(4)) }));
    emitReceipt({ workspaceId: workspace.id, serviceName: "QIE Wallet · Deposit", amount: a, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.wallet.topup", payload: { to: w.address, txHash: makeTxHash() } });
    setNotice({ ok: true, text: `Topped up $${a.toFixed(2)}` });
  };
  const doSend = () => {
    const a = parseFloat(amount) || 0; if (a <= 0) return;
    if (a > w.cap) { setNotice({ ok: false, text: `$${a.toFixed(2)} exceeds the per-tx cap $${w.cap.toFixed(2)} — human approval required` }); return; }
    if (a > w.balance) { setNotice({ ok: false, text: "insufficient balance — top up first" }); return; }
    const txHash = makeTxHash();
    setW((s) => ({ ...s, balance: Number((s.balance - a).toFixed(4)) }));
    emitReceipt({ workspaceId: workspace.id, serviceName: "QIE Wallet · Transfer", amount: a, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.wallet.send", payload: { to: to.trim(), memo: memo.trim(), txHash } });
    setNotice({ ok: true, text: `Sent $${a.toFixed(2)} → ${to.slice(0, 12)}… · ${txHash.slice(0, 12)}…` });
  };
  const saveCap = () => { const c = parseFloat(capDraft) || 0; setW((s) => ({ ...s, cap: c })); emitReceipt({ workspaceId: workspace.id, serviceName: "QIE Wallet · Cap", amount: 0, currency: "USDC", network: workspace.networks[0] ?? "qie-testnet", kind: "qie.wallet.cap", payload: { cap: c } }); setNotice({ ok: true, text: `Per-tx cap set to $${c.toFixed(2)}` }); };

  return (
    <div className="panel block svc-flavor">
      <div className="block-head"><div className="ttl"><span className="sq soft"><Wallet width={15} height={15} /></span><div><h3>Agent wallet console</h3><div className="sub">self-custodial QIE wallet for the merchant agent · top up · send · per-tx cap · every send leaves a receipt</div></div></div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "0 16px 12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>Balance</span><span style={{ fontSize: "1.5rem", fontWeight: 800 }}>${w.balance.toFixed(2)} <span style={{ fontSize: ".7rem", fontWeight: 600, color: "var(--muted)" }}>USDC</span></span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800 }}>Per-tx cap</span><span style={{ fontSize: ".95rem", fontWeight: 800 }}>${w.cap.toFixed(2)}</span></div>
        <div style={{ flex: 1, minWidth: 200, fontFamily: "var(--mono)", fontSize: ".74rem", color: "var(--muted)" }}>{w.address}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, padding: "0 16px 12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--bg-2)" }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Top up</span>
          <div className="row sm" style={{ gap: 8 }}><input value={topup} onChange={(e) => setTopup(e.currentTarget.value)} inputMode="decimal" style={{ flex: 1, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".8rem" }} /><button className="btn btn-acc btn-sm" type="button" onClick={doTopup}><Plus width={12} height={12} /> Deposit</button></div>
          <div className="row sm" style={{ gap: 8, marginTop: 4 }}><span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700, flex: 1 }}>Per-tx cap</span><input value={capDraft} onChange={(e) => setCapDraft(e.currentTarget.value)} inputMode="decimal" style={{ width: 70, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".8rem" }} /><button className="btn btn-ghost btn-sm" type="button" onClick={saveCap}>Save</button></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--bg-2)" }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>Send payment</span>
          <div className="row sm" style={{ gap: 8 }}>
            <input value={to} onChange={(e) => setTo(e.currentTarget.value)} placeholder="recipient 0x…" style={{ flex: 1, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".78rem", fontFamily: "var(--mono)" }} />
            <input value={amount} onChange={(e) => setAmount(e.currentTarget.value)} inputMode="decimal" style={{ width: 70, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".8rem" }} />
            <input value={memo} onChange={(e) => setMemo(e.currentTarget.value)} placeholder="memo" style={{ width: 130, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--field)", color: "var(--ink)", fontSize: ".78rem" }} />
            <button className="btn btn-acc btn-sm" type="button" onClick={doSend}><Send width={12} height={12} /> Send</button>
          </div>
        </div>
      </div>
      {notice && <div style={{ margin: "0 16px 12px", padding: "7px 12px", borderRadius: 10, background: `color-mix(in srgb, ${notice.ok ? "var(--green)" : "var(--red)"} 12%, transparent)`, color: notice.ok ? "var(--green)" : "var(--red)", fontSize: ".76rem", fontWeight: 700 }}>{notice.ok ? <Check width={13} height={13} /> : <X width={13} height={13} />} {notice.text}</div>}
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "var(--muted)", padding: "6px 0" }}>Recent wallet activity · {activity.length}</div>
        <div className="svc-hist">
          {activity.length === 0 && <div className="muted sm">No activity yet — top up or send above.</div>}
          {activity.map((r) => { const isSend = r.kind === "qie.wallet.send"; const p = (r.payload ?? {}) as { to?: string; memo?: string }; return (
            <div className="svc-hist__row" key={r.id}><span className="svc-hist__dot" style={{ background: isSend ? "#ff9b00" : "#1fb58a" }} /><div className="svc-hist__main"><b>{isSend ? "Sent" : "Deposit"} ${r.amount.toFixed(2)}</b><span>{isSend ? `${(p.to ?? "").slice(0, 12)}… · ${p.memo ?? ""}` : "into wallet"} · {new Date(r.createdAt).toLocaleTimeString()}</span></div>{badgeFor(r.status)}</div>
          ); })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QieMerchantTreasury — signed Agent Treasury allowance for the merchant bot
// ---------------------------------------------------------------------------
//
// The QIE Merchant Bot (agent_qie_merchant_bot) spends only this signed
// treasury allowance for its autonomous paid flows: POS endpoint provisioning
// (svc_qie_pos), merchant payouts (svc_qie_payout), subscription charges and
// the credit borrow-and-pay leg (svc_qie_checkout). Without a signed allowance
// every one of those flows is blocked by checkFunding before it can charge.
//
// `treasuryEpoch` is bumped on each successful top-up so the panel re-mounts
// and reflects the new balance (mirrors 0g's OgAgentToAgentLoop pattern).
export function QieMerchantTreasury() {
  const [treasuryEpoch, setTreasuryEpoch] = useState(0);
  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft"><Bot width={15} height={15} /></span>
          <div>
            <h3>Merchant Bot Treasury</h3>
            <div className="sub">sign an allowance so the QIE Merchant Bot can run autonomous paid flows · payouts · POS · subscriptions</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        <TreasuryPanel
          key={treasuryEpoch}
          scope={QIE_FUNDING_SCOPE}
          label="QIE Merchant Bot autonomous payments"
          defaultTopUpUsd={QIE_TREASURY_TOPUP_USD}
          onTreasuryChange={() => setTreasuryEpoch((e) => e + 1)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// signature — workspace stats table shown in the overview
// ---------------------------------------------------------------------------

export const signature: SigBlock = {
  title: "QIE rail health",
  sub: "checkout, passes and merchant payouts on the QIE network",
  headers: ["Metric", "Value", "Window", "Trend"],
  rows: [
    ["Active merchants", "142", "this week", "+8"],
    ["Checkouts settled", "2,210", "7 days", "+12%"],
    ["QIE Pass holders", "1,884", "all-time", "+63"],
    ["Next payout run", "Fri 18:00", "scheduled", "42.10 QIE"],
  ],
  accentCol: 3,
};

// ---------------------------------------------------------------------------
// cards() — quick-action tiles for the overview page
// ---------------------------------------------------------------------------

export function cards(ctx: CardCtx): CardDef[] {
  const { onGoTab, wsReceipts } = ctx;
  return [
    { light: true, ico: Zap, title: "Create a payment link", sub: "hosted 402 endpoint agents can pay", onClick: () => onGoTab("checkout") },
    { ico: FileText, title: "Query QIEDEX pool data", sub: "depth · fees · TWAP · per-query pricing", onClick: () => onGoTab("qiedex") || onGoTab("dex") },
    { ico: Shield, title: "Issue & verify QIE Pass", sub: "gated access · gold / silver tiers", onClick: () => onGoTab("pass") },
    { ico: Bot, title: "Manage Merchant Bot agent", sub: "daily limit $6 · auto-pay on", onClick: () => onGoTab("wallet") || onGoTab("agent") },
    { ico: Code, title: "QIE x402 integration docs", sub: "cURL · SDK · rail adapters", onClick: () => onGoTab("gateway") },
    { ico: ReceiptText, title: "Merchant dashboard & payouts", sub: `${wsReceipts.length} receipts · next payout Fri`, onClick: () => onGoTab("merchant") },
  ];
}

// ---------------------------------------------------------------------------
// renderTab() — returns widgets for a given tab label
// ---------------------------------------------------------------------------

export function renderTab(
  t: string,
  ws: Workspace,
  svcs: Service[],
  _rcpts: Receipt[],
  _pay: (s: Service) => void,
): ReactNode {
  return (
    <>
      {t.includes("checkout") && <QieCheckoutPhoneMockup />}
      {t.includes("checkout") && <QiePosWidget workspace={ws} />}
      {t.includes("checkout") && <QieBillSplitter workspace={ws} />}
      {t.includes("checkout") && <QieRequestPay workspace={ws} />}
      {(t.includes("checkout") || t.includes("merchant")) && <QieSalesAnalytics workspace={ws} />}

      {(t.includes("gaming") || t.includes("game")) && <GameItemShop workspace={ws} />}
      {(t.includes("social") || t.includes("creator")) && <QieCreatorTipsWidget workspace={ws} />}
      {(t.includes("social") || t.includes("creator")) && <QieCreatorSubscriptions workspace={ws} />}
      {t.includes("wallet") && <QieWalletConnectPanel />}
      {t.includes("wallet") && <QieWalletDashboard workspace={ws} />}
      {t.includes("merchant") && <QieMerchantTreasury />}
      {t.includes("merchant") && <MerchantPayoutsPanel workspace={ws} />}
      {t.includes("credit") && <QieCreditWidget workspace={ws} />}
      {t.includes("oracle") && <QieOracleFeedWidget workspace={ws} />}
      {t.includes("subscript") && <QieSubscriptionWidget workspace={ws} />}
      {(t.includes("pass") || t.includes("verify")) && <QiePassIssuer workspace={ws} services={svcs} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// renderTabContent() — TabCtx-based renderer (Task 4 refactor)
// ---------------------------------------------------------------------------

export function renderTabContent(tab: string, ctx: TabCtx): ReactNode {
  const { workspace } = ctx;
  const t = tab.toLowerCase();
  const nodes: ReactNode[] = [];

  if (t.includes("checkout")) {
    nodes.push(<QiePosWidget key="pos" workspace={workspace} />);
    nodes.push(<QieBillSplitter key="split" workspace={workspace} />);
    nodes.push(<QieRequestPay key="reqpay" workspace={workspace} />);
  }
  if (t.includes("checkout") || t.includes("merchant")) {
    nodes.push(<QieSalesAnalytics key="analytics" workspace={workspace} />);
  }
  if (t.includes("gaming") || t.includes("game")) nodes.push(<GameItemShop key="game" workspace={workspace} />);
  if (t.includes("social") || t.includes("creator")) {
    nodes.push(<QieCreatorTipsWidget key="tips" workspace={workspace} />);
    nodes.push(<QieCreatorSubscriptions key="subs" workspace={workspace} />);
  }
  if (t.includes("wallet")) nodes.push(<QieWalletDashboard key="wallet" workspace={workspace} />);
  if (t.includes("merchant")) nodes.push(<MerchantPayoutsPanel key="payouts" workspace={workspace} />);
  if (t.includes("oracle")) nodes.push(<QieOracleFeedWidget key="oracle" workspace={workspace} />);
  if (t.includes("credit")) nodes.push(<QieCreditWidget key="credit" workspace={workspace} />);

  return nodes.length > 0 ? <>{nodes}</> : null;
}

// ---------------------------------------------------------------------------
// renderAgentPanel() — the agent console widget
// ---------------------------------------------------------------------------

export function renderAgentPanel(ws: Workspace): ReactNode {
  return <AgentWalletConsole workspace={ws} />;
}

// ---------------------------------------------------------------------------
// renderOverviewExtra() — deployed contracts panel
// ---------------------------------------------------------------------------

const QIE_CONTRACTS = [
  { label: "QieCheckout (Mainnet v3)",    addr: (import.meta.env as Record<string,string|undefined>)["VITE_QIE_CHECKOUT_ADDRESS"]     ?? "0xBa7348e57F124B1163c8356Cf7294fa6Dfb7Ea0E" },
  { label: "QiePass (Mainnet v3)",        addr: (import.meta.env as Record<string,string|undefined>)["VITE_QIE_PASS_ADDRESS"]          ?? "0x6260Ff7701a97A49Cb5c9816Bd025181dBbe4605" },
  { label: "QieAgentCredit (Mainnet v3)", addr: (import.meta.env as Record<string,string|undefined>)["VITE_QIE_AGENT_CREDIT_ADDRESS"]  ?? "0x83E980569D3db24dA0fd7B1B362255118756264A" },
  { label: "QieOracleFeed (Mainnet v3)",  addr: (import.meta.env as Record<string,string|undefined>)["VITE_QIE_ORACLE_FEED_ADDRESS"]   ?? "0x0551b255Cb74F004e872034a5a906ffaA7DD58Eb" },
] as const;

function QieEcosystemLinks() {
  const { mode } = useNetworkMode("qie");
  const isTestnet = mode === "testnet";
  const groups = isTestnet ? [
    { title: "Explorer", items: [{ label: "QIE Testnet Explorer", url: "https://testnet.qie.digital/explorer" }] },
    { title: "Faucet", items: [{ label: "QIE Testnet Faucet", url: "https://faucet.testnet.qie.digital" }] },
  ] : [
    { title: "Explorer", items: [{ label: "QIE Explorer", url: "https://mainnet.qie.digital/explorer" }] },
    { title: "Swap", items: [{ label: "QIE Swap", url: "https://swap.qie.digital" }] },
    { title: "Checkout", items: [{ label: "QIE Pay", url: "https://pay.qie.digital" }, { label: "QIE Pass Portal", url: "https://pass.qie.digital" }] },
    { title: "Dev", items: [{ label: "QIE Docs", url: "https://docs.qie.digital" }] },
  ];
  return <EcosystemLinksPanel groups={groups} network={isTestnet ? "QIE Testnet · chainId 1983" : "QIE Mainnet · chainId 1990"} accent="#7c3aed" />;
}

export function renderOverviewExtra(_ws: Workspace): ReactNode {
  return (
    <>
    <div style={{ background: "var(--bg-2)", borderRadius: 14, border: "1px solid var(--line-2)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: ".7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)" }}>Deployed Contracts</span>
        <span style={{ fontSize: ".63rem", color: "#7c3aed", fontWeight: 700, background: "#7c3aed18", padding: "2px 7px", borderRadius: 5 }}>QIE Mainnet v3 · chainId 1990</span>
      </div>
      {QIE_CONTRACTS.map((c) => {
        const short = `${c.addr.slice(0, 8)}…${c.addr.slice(-6)}`;
        return (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid var(--line-2)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: ".77rem", fontWeight: 700, color: "var(--ink)" }}>{c.label}</div>
              <div style={{ fontSize: ".62rem", color: "var(--muted)", fontFamily: "monospace" }}>{c.addr}</div>
            </div>
            <a href={`https://mainnet.qie.digital/address/${c.addr}`} target="_blank" rel="noreferrer"
              style={{ fontSize: ".6rem", color: "#7c3aed", fontWeight: 700, textDecoration: "none", background: "#7c3aed14", padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap" }}
            >{short} ↗</a>
          </div>
        );
      })}
    </div>
    <QieEcosystemLinks />
    </>
  );
}

// Suppress unused-import warnings for utility functions kept for completeness
void ago;
void hashPct;

// ── Tab metadata ──────────────────────────────────────────────────────────────
export function tabMeta(tab: string): TabMeta | null {
  const t = tab.toLowerCase();
  if (t.includes("checkout") || t.includes("merchant"))
    return { title: "Merchant checkout workspace", sub: "Create payment links, split settlement and track POS requests for real merchants.", intent: "Commerce", proof: "checkout receipt" };
  if (t.includes("qiedex") || t.includes("dex"))
    return { title: "QIEDEX swap desk", sub: "Quote swaps, inspect liquidity and execute only after the route is understandable.", intent: "DEX", proof: "quote result" };
  if (t.includes("gaming") || t.includes("game"))
    return { title: "Game item economy", sub: "Sell items, route payments and track creator/game receipts inside one flow.", intent: "Gaming", proof: "item receipt" };
  if (t.includes("social") || t.includes("creator"))
    return { title: "Creator monetization flow", sub: "Handle tips, subscriptions and social payments with clear settlement state.", intent: "Creator", proof: "subscription/tip" };
  if (t.includes("wallet"))
    return { title: "QIE wallet control room", sub: "Review wallet balances, actions and agent spending from the user's perspective.", intent: "Wallet", proof: "wallet activity" };
  if (t.includes("oracle"))
    return { title: "Oracle feed workspace", sub: "Inspect feed values, freshness and downstream product impact before agents use them.", intent: "Oracle", proof: "feed freshness" };
  if (t.includes("credit"))
    return { title: "Credit decision workspace", sub: "Score credit, preview limits and record decisions as auditable agent actions.", intent: "Credit", proof: "score output" };
  if (t.includes("pass"))
    return { title: "QIE Pass identity gate", sub: "Issue access passes and enforce identity-gated commerce without exposing private data.", intent: "Identity", proof: "access proof" };
  return null;
}
