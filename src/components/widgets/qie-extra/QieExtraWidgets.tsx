import { useState } from "react";
import {
  CheckCircle2, ClipboardCopy, ExternalLink, Gamepad2, Link2, Loader2, ShoppingCart, Store, Zap,
} from "lucide-react";
import type { Workspace } from "../../../types";
import { useAppState } from "../../../app-state";
import { useLocalStore } from "../../../lib/storage";
import { hashId } from "../../../lib/util-hash";
import {
  isQieCheckoutConfigured, isQiePassConfigured,
  createInvoice, splitPayout, mintPass,
  qieExplorerTxUrl,
} from "../../../lib/qie";
import { useWallet } from "../../../wallet";
import {
  checkFunding,
  fundingReceiptPayload,
  recordFundingSpend,
  QIE_FUNDING_SCOPE,
} from "../../../workspaces/qie/funding";

const hid = (s: string) => hashId("qie", s);
const now = () => new Date().toLocaleTimeString();



// ── 1. QIE POS Embed Generator ───────────────────────────────────────────────

type PosConfig = {
  id: string;
  merchantName: string;
  itemName: string;
  price: number;
  currency: "QIE" | "USDT";
  snippet: string;
  ts: string;
  invoiceTx?: string;
  invoiceId?: number | null;
  explorerUrl?: string;
};

export function QiePosWidget({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const { address: account } = useWallet();
  const [configs, setConfigs] = useLocalStore<PosConfig[]>("qie.pos.configs", []);
  const [merchantName, setMerchantName] = useState("My AI Store");
  const [itemName, setItemName] = useState("Premium AI Report");
  const [price, setPrice] = useState(5);
  const [currency, setCurrency] = useState<"QIE" | "USDT">("QIE");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);
  const [showEmbed, setShowEmbed] = useState(false);
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const configured = isQieCheckoutConfigured();
  const POS_COST_USD = 0.01;

  async function generate() {
    // Treasury preflight — the merchant bot provisions a hosted 402 endpoint;
    // block the paid action unless the QIE Treasury has a signed allowance.
    const fc = checkFunding(QIE_FUNDING_SCOPE, POS_COST_USD, { mode: "treasury", serviceId: "svc_qie_pos" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the QIE Treasury first.`);
      return;
    }
    setFundingErr(null);
    setBusy(true);
    setTxErr(null);
    await new Promise((r) => setTimeout(r, 400));
    const seed = merchantName + itemName + String(price) + currency + String(Date.now());
    const id = "pos_" + hid(seed);
    const snippet = `<script src="https://pay.qie.digital/embed.js"
  data-merchant="${merchantName}"
  data-item="${itemName}"
  data-price="${price}"
  data-currency="${currency}"
  data-chain="1983"
  data-callback="https://yoursite.com/webhook"
  data-pos-id="${id}">
</script>`;

    // Attempt real on-chain invoice creation when configured
    let invoiceTx: string | undefined;
    let invoiceId: number | null | undefined;
    let explorerUrl: string | undefined;
    if (configured) {
      const payee = account ?? "0x0000000000000000000000000000000000000001";
      const amountWei = BigInt(Math.round(price * 1e15)); // price in QIE → wei (rough)
      try {
        const res = await createInvoice(payee, amountWei);
        invoiceTx = res.txHash;
        invoiceId = res.invoiceId;
        explorerUrl = res.explorerUrl;
      } catch (e) {
        setTxErr((e as { message?: string }).message ?? "Invoice creation failed");
      }
    }

    const cfg: PosConfig = { id, merchantName, itemName, price, currency, snippet, ts: now(), invoiceTx, invoiceId, explorerUrl };
    setConfigs((prev) => [cfg, ...prev.slice(0, 9)]);
    setActiveId(id);
    const settlement = invoiceTx ? "live" : "fallback";
    recordFundingSpend(QIE_FUNDING_SCOPE, POS_COST_USD, { mode: "treasury", serviceId: "svc_qie_pos", settlement });
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_qie_checkout",
      serviceName: `POS Widget · ${merchantName}`,
      agentName: "QIE Merchant Agent",
      payerWallet: account ?? "0xQieAg…aa1",
      providerWallet: "0xQieGW…cc3",
      amount: 1,
      currency: "QIE",
      network: "qie-testnet",
      status: "verified",
      kind: "qie.pos.generate",
      payload: fundingReceiptPayload(QIE_FUNDING_SCOPE, POS_COST_USD, { mode: "treasury", serviceId: "svc_qie_pos", settlement }, { posId: id, merchantName, itemName, price, currency, invoiceTx }),
    });
    setBusy(false);
  }

  const active = configs.find((c) => c.id === activeId) ?? configs[0];
  const paymentLink = active ? `https://pay.qie.digital/checkout/${active.id}?item=${encodeURIComponent(active.itemName)}&price=${active.price}&currency=${active.currency}&merchant=${encodeURIComponent(active.merchantName)}` : "";

  function copy() {
    if (!active) return;
    navigator.clipboard.writeText(active.snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  function copyLink() {
    navigator.clipboard.writeText(paymentLink).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  }

  return (
    <div className="panel block svc-flavor" style={{ overflow: "hidden" }}>
      {/* Hero header */}
      <div style={{ padding: "16px 16px 0", borderBottom: "1px solid var(--line-2)", paddingBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Store size={17} style={{ color: "var(--accent-primary)" }} /></span>
          <div><h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>Payment link in 30 seconds</h3><div style={{ fontSize: ".72rem", color: "var(--muted)" }}>Create a checkout page · share the link · get paid in QIE</div></div>
        </div>
      </div>

      {/* Main two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "16px 16px 12px", alignItems: "start" }}>
        {/* Left: form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Step 1 */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-primary)", color: "#fff", fontSize: ".65rem", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>1</div>
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 700 }}>What are you selling?</span>
                <input value={itemName} onChange={(e) => setItemName(e.currentTarget.value)} placeholder="Premium AI Report" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 700 }}>Your shop name</span>
                <input value={merchantName} onChange={(e) => setMerchantName(e.currentTarget.value)} placeholder="My AI Store" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }} />
              </div>
            </div>
          </div>
          {/* Step 2 */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-primary)", color: "#fff", fontSize: ".65rem", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>2</div>
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 700 }}>Price</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" step="0.5" min={0.5} value={price} onChange={(e) => setPrice(Number(e.currentTarget.value))} style={{ flex: 1, padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".9rem", fontWeight: 700 }} />
                  <select value={currency} onChange={(e) => setCurrency(e.currentTarget.value as "QIE" | "USDT")} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem" }}>
                    <option value="QIE">QIE</option>
                    <option value="USDT">USDT</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          {/* Step 3 — CTA */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-primary)", color: "#fff", fontSize: ".65rem", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>3</div>
            <button className="btn btn-acc" type="button" onClick={generate} disabled={busy} style={{ flex: 1 }}>
              {busy ? <><Loader2 size={13} className="wallet-spin" /> Creating link…</> : <><Link2 size={13} /> Create payment link</>}
            </button>
          </div>

          {fundingErr && <div style={{ fontSize: ".72rem", color: "#fbbf24", padding: "6px 10px", background: "#f59e0b12", border: "1px solid #f59e0b44", borderRadius: 6 }}>{fundingErr}</div>}
          {txErr && <div style={{ fontSize: ".72rem", color: "#e05", padding: "6px 10px", background: "#e0500a11", borderRadius: 6 }}>{txErr}</div>}

          {/* Payment link hero — the real user result */}
          {active && (
            <div style={{ padding: "12px 14px", borderRadius: 12, border: "2px solid color-mix(in srgb, var(--accent-primary) 40%, var(--line-2))", background: "color-mix(in srgb, var(--accent-primary) 6%, transparent)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: ".65rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--accent-primary)" }}>Your payment link</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: ".72rem", color: "var(--ink)", wordBreak: "break-all", lineHeight: 1.4 }}>{paymentLink}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn btn-acc btn-sm" style={{ flex: 1 }} onClick={copyLink}>
                  {copiedLink ? <><CheckCircle2 size={12} /> Copied!</> : <><ClipboardCopy size={12} /> Copy link</>}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowEmbed(!showEmbed)} style={{ fontSize: ".68rem" }}>
                  {showEmbed ? "Hide embed" : "</> Embed code"}
                </button>
              </div>
              {active.invoiceTx && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: ".68rem" }}>
                  <CheckCircle2 size={11} style={{ color: "var(--green)", flexShrink: 0 }} />
                  <span style={{ color: "var(--green)" }}>Invoice #{active.invoiceId ?? "?"} on QIE chain</span>
                  <a href={active.explorerUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)", display: "flex", gap: 3, alignItems: "center" }}>{active.invoiceTx.slice(0, 10)}… <ExternalLink size={10} /></a>
                </div>
              )}
              {showEmbed && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: ".65rem", color: "var(--muted)", fontWeight: 600 }}>Embed snippet</span>
                    <button className="pill click" type="button" style={{ fontSize: ".58rem" }} onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
                  </div>
                  <pre style={{ background: "var(--bg-3, #0d1117)", borderRadius: 8, padding: "8px 10px", fontSize: ".62rem", overflowX: "auto", margin: 0, fontFamily: "var(--mono)", lineHeight: 1.5 }}>{active.snippet}</pre>
                </div>
              )}
              {configs.length > 1 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {configs.slice(0, 5).map((c) => (
                    <button key={c.id} type="button" className={"pill click" + ((activeId ?? configs[0]?.id) === c.id ? " on" : "")} style={{ fontSize: ".58rem" }} onClick={() => setActiveId(c.id)}>{c.merchantName.slice(0, 12)}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: phone mockup */}
        <div style={{ width: 180, flexShrink: 0 }}>
          <div style={{ width: 180, borderRadius: 28, border: "5px solid #2a2a2a", background: "#111", padding: "14px 8px 10px", boxShadow: "0 12px 32px rgba(0,0,0,.4)" }}>
            <div style={{ width: 55, height: 16, background: "#222", borderRadius: 10, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#444" }} />
            </div>
            <div style={{ background: "#fff", borderRadius: 12, padding: "12px 10px" }}>
              <div style={{ fontSize: 7, color: "#999", marginBottom: 5, fontWeight: 600, letterSpacing: ".04em" }}>QIE CHECKOUT</div>
              <div style={{ fontWeight: 800, fontSize: 11, color: "#111", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemName || "Item name"}</div>
              <div style={{ fontSize: 9, color: "#888", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>by {merchantName || "Your store"}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: "#555" }}>Price</span>
                <span style={{ fontWeight: 900, fontSize: 13, color: "#7C3AED" }}>{price} {currency}</span>
              </div>
              <div style={{ background: "#7C3AED", borderRadius: 8, padding: "7px 0", textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 9 }}>Pay with QIE</div>
              <div style={{ textAlign: "center", marginTop: 5, fontSize: 7, color: "#aaa" }}>Chain ID 1983 · Secured</div>
            </div>
            <div style={{ width: 48, height: 3, background: "#444", borderRadius: 3, margin: "8px auto 0" }} />
          </div>
          <div style={{ textAlign: "center", marginTop: 6, fontSize: ".62rem", color: "var(--muted)" }}>Live preview</div>
        </div>
      </div>
    </div>
  );
}

// ── 2. P2E Game Item Shop ─────────────────────────────────────────────────────

const GAME_ITEMS = [
  { id: "sword_fire", name: "Flame Sword", tier: "Rare", price: 50, power: 180, icon: "🗡️", passTier: 0 as 0 | 1 | 2 },
  { id: "shield_ice", name: "Frost Shield", tier: "Epic", price: 150, power: 320, icon: "🛡️", passTier: 1 as 0 | 1 | 2 },
  { id: "potion_hp", name: "HP Potion ×10", tier: "Common", price: 10, power: 0, icon: "🧪", passTier: 0 as 0 | 1 | 2 },
  { id: "mount_dragon", name: "Dragon Mount", tier: "Legendary", price: 500, power: 0, icon: "🐉", passTier: 2 as 0 | 1 | 2 },
  { id: "ring_speed", name: "Speed Ring", tier: "Uncommon", price: 25, power: 90, icon: "💍", passTier: 0 as 0 | 1 | 2 },
  { id: "armor_shadow", name: "Shadow Armor", tier: "Epic", price: 200, power: 400, icon: "⚔️", passTier: 1 as 0 | 1 | 2 },
];

const TIER_COLOR: Record<string, string> = {
  Common: "#aaa", Uncommon: "#4DA2FF", Rare: "#0FBF7A", Epic: "#9D85FF", Legendary: "#F5A623",
};

type OwnedItem = {
  id: string; name: string; tier: string;
  price: number; icon: string; grantId: string; ts: string;
  tokenId?: number | null; txHash?: string; explorerUrl?: string;
};

export function GameItemShop({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const { address: account } = useWallet();
  const [inventory, setInventory] = useLocalStore<OwnedItem[]>("qie.game.inventory", []);
  const [buying, setBuying] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const passConfigured = isQiePassConfigured();

  async function buyItem(item: typeof GAME_ITEMS[0]) {
    setBuying(item.id);
    setItemErrors((prev) => ({ ...prev, [item.id]: "" }));
    await new Promise((r) => setTimeout(r, 300));
    const seed = item.id + String(Date.now());
    const grantId = "grant_" + hid(seed);

    let tokenId: number | null | undefined;
    let txHash: string | undefined;
    let explorerUrl: string | undefined;

    if (passConfigured && account) {
      try {
        const res = await mintPass(account, item.passTier);
        tokenId = res.tokenId;
        txHash = res.txHash;
        explorerUrl = res.explorerUrl;
      } catch (e) {
        const msg = (e as { message?: string }).message ?? "Mint failed";
        setItemErrors((prev) => ({ ...prev, [item.id]: msg }));
      }
    }

    setInventory((prev) => [
      { id: item.id, name: item.name, tier: item.tier, price: item.price, icon: item.icon, grantId, ts: now(), tokenId, txHash, explorerUrl },
      ...prev,
    ]);
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_qie_checkout",
      serviceName: `Game Item · ${item.name}`,
      agentName: "QIE Game Agent",
      payerWallet: account ?? "0xQieAg…aa1",
      providerWallet: "0xQieGame…cc3",
      amount: item.price,
      currency: "QIE",
      network: "qie-testnet",
      status: "verified",
      kind: "qie.game.item",
      payload: { itemId: item.id, name: item.name, tier: item.tier, grantId, tokenId, txHash },
    });
    setBuying(null);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><Gamepad2 size={15} /></span>
          <div>
            <h3>P2E Item Shop</h3>
            <div className="sub">Buy game items with QIE tokens · each purchase mints an on-chain pass NFT</div>
          </div>
        </div>
        {inventory.length > 0 && (
          <span className="chip" style={{ background: "var(--accent-primary)22", color: "var(--accent-primary)", fontSize: 11 }}>
            {inventory.length} owned
          </span>
        )}
      </div>

      {!passConfigured && (
        <div className="muted sm" style={{ marginBottom: 10, padding: "8px 10px", border: "1px dashed var(--border-subtle)", borderRadius: 8 }}>
          Contract not deployed yet — run <code>npm run deploy:qie</code> and set <code>VITE_QIE_PASS_ADDRESS</code>.
          Purchases still record locally; on-chain NFT minting requires the contract.
        </div>
      )}

      {!account && passConfigured && (
        <div className="muted sm" style={{ marginBottom: 10, padding: "8px 10px", border: "1px dashed var(--border-subtle)", borderRadius: 8 }}>
          Connect wallet to mint on-chain pass NFTs.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 10, marginBottom: 12 }}>
        {GAME_ITEMS.map((item) => {
          const owned = inventory.filter((i) => i.id === item.id).length;
          return (
            <div key={item.id} style={{
              border: `1px solid ${TIER_COLOR[item.tier]}44`,
              borderRadius: 10, padding: "12px 12px 10px",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              <div style={{ fontSize: 22, textAlign: "center" }}>{item.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 12, textAlign: "center" }}>{item.name}</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span className="chip" style={{ background: TIER_COLOR[item.tier] + "22", color: TIER_COLOR[item.tier], fontSize: 10 }}>
                  {item.tier}
                </span>
              </div>
              {item.power > 0 && (
                <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center" }}>Power +{item.power}</div>
              )}
              <div style={{ textAlign: "center", fontWeight: 700, color: "var(--accent-primary)", fontSize: 13 }}>
                {item.price} QIE
              </div>
              {owned > 0 && (
                <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center" }}>Owned: {owned}</div>
              )}
              {itemErrors[item.id] && (
                <div style={{ fontSize: 9, color: "#e05", textAlign: "center" }}>{itemErrors[item.id].slice(0, 40)}</div>
              )}
              <button
                className="btn btn-acc btn-sm"
                type="button"
                style={{ fontSize: 11, padding: "5px 0" }}
                onClick={() => buyItem(item)}
                disabled={buying === item.id}
              >
                {buying === item.id ? <Loader2 size={11} className="wallet-spin" /> : <ShoppingCart size={11} />}
                {buying === item.id ? "Minting…" : "Buy"}
              </button>
            </div>
          );
        })}
      </div>

      {inventory.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Recent purchases</div>
          <div className="svc-table__scroll">
            <table className="svc-table">
              <thead><tr><th>Item</th><th>Tier</th><th>Price</th><th>Token ID / Grant</th><th>Tx</th><th>Time</th></tr></thead>
              <tbody>
                {inventory.slice(0, 10).map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.icon} {item.name}</td>
                    <td><span style={{ color: TIER_COLOR[item.tier], fontSize: 10 }}>{item.tier}</span></td>
                    <td className="svc-table__num">{item.price} QIE</td>
                    <td>
                      {item.tokenId != null
                        ? <code style={{ fontSize: 10 }}>#{item.tokenId}</code>
                        : <code style={{ fontSize: 10 }}>{item.grantId.slice(0, 12)}…</code>
                      }
                    </td>
                    <td>
                      {item.txHash
                        ? <a href={item.explorerUrl ?? qieExplorerTxUrl(item.txHash)} target="_blank" rel="noreferrer"
                            style={{ fontSize: 10, color: "var(--accent-primary)", display: "flex", gap: 3, alignItems: "center" }}>
                            {item.txHash.slice(0, 10)}… <ExternalLink size={10} />
                          </a>
                        : <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>—</span>
                      }
                    </td>
                    <td style={{ fontSize: 10 }}>{item.ts}</td>
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

// ── 3. Merchant Payouts Panel ────────────────────────────────────────────────

const DEMO_MERCHANTS = [
  { name: "AI Report Store", sales: 47, grossQie: 235, wallet: "0x1111111111111111111111111111111111111111" },
  { name: "NFT Marketplace", sales: 12, grossQie: 1800, wallet: "0x2222222222222222222222222222222222222222" },
  { name: "DeFi Analytics Hub", sales: 88, grossQie: 440, wallet: "0x3333333333333333333333333333333333333333" },
];

type MerchantPayout = {
  id: string; merchant: string; sales: number;
  grossQie: number; feeQie: number; netQie: number;
  txHash: string; ts: string; explorerUrl?: string; real?: boolean;
};

export function MerchantPayoutsPanel({ workspace }: { workspace: Workspace }) {
  const { emitReceipt } = useAppState();
  const [payouts, setPayouts] = useLocalStore<MerchantPayout[]>("qie.merchant.payouts", []);
  const [busy, setBusy] = useState<string | null>(null);
  const [txErrors, setTxErrors] = useState<Record<string, string>>({});
  const [fundingErr, setFundingErr] = useState<string | null>(null);

  const configured = isQieCheckoutConfigured();
  const PAYOUT_COST_USD = 0.02;

  async function payout(m: typeof DEMO_MERCHANTS[0]) {
    // Treasury preflight — batch-settling a merchant payout is an autonomous
    // paid action; block it unless the QIE Treasury has a signed allowance.
    const fc = checkFunding(QIE_FUNDING_SCOPE, PAYOUT_COST_USD, { mode: "treasury", serviceId: "svc_qie_payout" });
    if (!fc.ok) {
      setFundingErr(`Blocked: ${fc.reason}. Fund the QIE Treasury first.`);
      return;
    }
    setFundingErr(null);
    setBusy(m.name);
    setTxErrors((prev) => ({ ...prev, [m.name]: "" }));
    await new Promise((r) => setTimeout(r, 400));
    const seed = m.name + String(m.grossQie) + String(Date.now());
    const feeQie = Math.round(m.grossQie * 0.025 * 100) / 100;
    const netQie = Math.round((m.grossQie - feeQie) * 100) / 100;

    let txHash: string;
    let explorerUrl: string | undefined;
    let real = false;

    if (configured) {
      // Real splitPayout: send net amount to merchant, fee to platform (zero address demo)
      const netWei = BigInt(Math.round(netQie * 1e15)); // rough QIE → wei
      const feeWei = BigInt(Math.round(feeQie * 1e15));
      const totalWei = netWei + feeWei;
      try {
        const res = await splitPayout(
          [m.wallet, "0x0000000000000000000000000000000000000001"],
          [netWei, feeWei],
          totalWei
        );
        txHash = res.txHash;
        explorerUrl = res.explorerUrl;
        real = true;
      } catch (e) {
        const msg = (e as { message?: string }).message ?? "Payout failed";
        setTxErrors((prev) => ({ ...prev, [m.name]: msg }));
        txHash = "0x" + hid(seed);
      }
    } else {
      txHash = "0x" + hid(seed);
    }

    setPayouts((prev) => [
      { id: hid(seed + "id"), merchant: m.name, sales: m.sales, grossQie: m.grossQie, feeQie, netQie, txHash, ts: now(), explorerUrl, real },
      ...prev.slice(0, 19),
    ]);
    const settlement = real ? "live" : "fallback";
    recordFundingSpend(QIE_FUNDING_SCOPE, PAYOUT_COST_USD, { mode: "treasury", serviceId: "svc_qie_payout", settlement });
    emitReceipt({
      workspaceId: workspace.id,
      serviceId: "svc_qie_checkout",
      serviceName: `Merchant Payout · ${m.name}`,
      agentName: "QIE Merchant Agent",
      payerWallet: "0xQieGW…cc3",
      providerWallet: "0xMerch…aa1",
      amount: netQie,
      currency: "QIE",
      network: "qie-testnet",
      status: "verified",
      kind: "qie.merchant.payout",
      payload: fundingReceiptPayload(QIE_FUNDING_SCOPE, PAYOUT_COST_USD, { mode: "treasury", serviceId: "svc_qie_payout", settlement }, { merchant: m.name, sales: m.sales, grossQie: m.grossQie, feeQie, netQie, txHash, real }),
    });
    setBusy(null);
  }

  return (
    <div className="panel block svc-flavor">
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft" style={{ color: "var(--accent-primary)" }}><ShoppingCart size={15} /></span>
          <div>
            <h3>Merchant Payouts</h3>
            <div className="sub">Batch-settle merchant earnings in QIE · 2.5% platform fee · auto-split{configured ? " · real on-chain" : ""}</div>
          </div>
        </div>
      </div>

      {!configured && (
        <div className="muted sm" style={{ marginBottom: 10, padding: "8px 10px", border: "1px dashed var(--border-subtle)", borderRadius: 8 }}>
          Contract not deployed yet — run <code>npm run deploy:qie</code> and set <code>VITE_QIE_CHECKOUT_ADDRESS</code> to enable real on-chain splits.
        </div>
      )}

      {fundingErr && (
        <div style={{ marginBottom: 10, padding: "9px 11px", borderRadius: 8, border: "1px solid #f59e0b44", background: "#f59e0b12", color: "#fbbf24", fontSize: 11 }}>
          {fundingErr}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        {DEMO_MERCHANTS.map((m) => {
          const fee = Math.round(m.grossQie * 0.025 * 100) / 100;
          const net = Math.round((m.grossQie - fee) * 100) / 100;
          return (
            <div key={m.name} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", marginBottom: 8,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {m.sales} sales · Gross {m.grossQie} QIE · Fee {fee} QIE
                </div>
                {txErrors[m.name] && (
                  <div style={{ fontSize: 10, color: "#e05", marginTop: 2 }}>{txErrors[m.name].slice(0, 60)}</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: "var(--accent-primary)" }}>{net} QIE</div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>net payout</div>
                </div>
                <button className="btn btn-acc btn-sm" type="button" onClick={() => payout(m)} disabled={busy === m.name} style={{ fontSize: 11 }}>
                  {busy === m.name ? <Loader2 size={12} className="wallet-spin" /> : <Zap size={12} />}
                  {busy === m.name ? "Paying…" : "Pay out"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {payouts.length > 0 && (
        <div className="svc-table__scroll">
          <table className="svc-table">
            <thead><tr><th>Merchant</th><th>Sales</th><th>Gross QIE</th><th>Fee</th><th>Net QIE</th><th>Tx</th><th>Time</th></tr></thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontSize: 11 }}>
                    {p.real && <CheckCircle2 size={10} style={{ color: "var(--green)", marginRight: 4 }} />}
                    {p.merchant}
                  </td>
                  <td className="svc-table__num">{p.sales}</td>
                  <td className="svc-table__num">{p.grossQie}</td>
                  <td className="svc-table__num" style={{ color: "#e05", fontSize: 10 }}>−{p.feeQie}</td>
                  <td className="svc-table__num" style={{ color: "var(--green)" }}>{p.netQie}</td>
                  <td>
                    {p.explorerUrl
                      ? <a href={p.explorerUrl} target="_blank" rel="noreferrer"
                          style={{ fontSize: 10, color: "var(--accent-primary)", display: "flex", gap: 3, alignItems: "center" }}>
                          {p.txHash.slice(0, 10)}… <ExternalLink size={10} />
                        </a>
                      : <a href={`https://testnet.qie.digital/tx/${p.txHash}`} target="_blank" rel="noreferrer"
                          style={{ fontSize: 10, color: "var(--accent-primary)" }}>
                          {p.txHash.slice(0, 10)}…
                        </a>
                    }
                  </td>
                  <td style={{ fontSize: 10 }}>{p.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── QieCheckoutPhoneMockup ────────────────────────────────────────────────────
// Live-preview phone mockup: edit fields on the left, see the checkout page
// update instantly on the right. "Payment link in 30 seconds" demo.

const ACCENT_PRESETS = ["#00C389", "#4DA2FF", "#f59e0b", "#a855f7", "#ef4444"] as const;

export function QieCheckoutPhoneMockup() {
  const [product, setProduct] = useState("Premium AI Report");
  const [desc, setDesc] = useState("Monthly market intelligence powered by QIE AI agents.");
  const [price, setPrice] = useState("5.00");
  const [currency, setCurrency] = useState<"QIE" | "USDT">("QIE");
  const [accent, setAccent] = useState("#00C389");
  const [copied, setCopied] = useState(false);

  const link = `https://pay.qie.digital/checkout?product=${encodeURIComponent(product)}&price=${price}&currency=${currency}`;

  function copyLink() {
    navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="panel block svc-flavor" style={{ marginBottom: 14 }}>
      <div className="block-head">
        <div className="ttl">
          <span className="sq soft"><ShoppingCart width={15} height={15} /></span>
          <div>
            <h3>Checkout Link Builder</h3>
            <div className="sub">Generate a QIE payment link in 30 seconds · live phone preview</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, padding: "12px 16px 16px", alignItems: "start" }}>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800, display: "block", marginBottom: 4 }}>Product name</label>
            <input className="inp" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Premium AI Report" />
          </div>
          <div>
            <label style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800, display: "block", marginBottom: 4 }}>Description</label>
            <input className="inp" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800, display: "block", marginBottom: 4 }}>Price</label>
              <input className="inp" type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800, display: "block", marginBottom: 4 }}>Currency</label>
              <select className="inp" value={currency} onChange={(e) => setCurrency(e.target.value as "QIE" | "USDT")}>
                <option value="QIE">QIE</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", fontWeight: 800, display: "block", marginBottom: 6 }}>Brand colour</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ACCENT_PRESETS.map((c) => (
                <button key={c} type="button" onClick={() => setAccent(c)}
                  style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: accent === c ? "2.5px solid var(--ink)" : "2.5px solid transparent", cursor: "pointer" }} />
              ))}
            </div>
          </div>
          <div style={{ padding: "8px 10px", background: "var(--bg-3)", borderRadius: 8, fontFamily: "monospace", fontSize: ".63rem", color: "var(--muted)", wordBreak: "break-all", lineHeight: 1.6 }}>
            {link}
          </div>
          <button className="btn btn-acc btn-sm" type="button" onClick={copyLink} style={{ alignSelf: "flex-start" }}>
            {copied ? <CheckCircle2 width={12} height={12} /> : <ClipboardCopy width={12} height={12} />}
            {copied ? "Copied!" : "Copy checkout link"}
          </button>
        </div>

        {/* Phone mockup */}
        <div style={{
          width: 160, flexShrink: 0,
          border: "2.5px solid var(--line-2)", borderRadius: 24,
          overflow: "hidden", background: "#fff",
          boxShadow: "0 8px 32px rgba(0,0,0,.18)",
        }}>
          {/* notch */}
          <div style={{ background: "#111", height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 40, height: 6, background: "#333", borderRadius: 3 }} />
          </div>
          {/* screen */}
          <div style={{ padding: "10px 10px 14px", display: "flex", flexDirection: "column", gap: 8, background: "#fafafa" }}>
            {/* header */}
            <div style={{ background: accent, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: ".04em" }}>QIE Pay</div>
            </div>
            {/* product card */}
            <div style={{ background: "#fff", borderRadius: 8, padding: "8px 8px", border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#111", marginBottom: 3, lineHeight: 1.3, wordBreak: "break-word" }}>
                {product || "Product name"}
              </div>
              <div style={{ fontSize: 7.5, color: "#6b7280", lineHeight: 1.4, wordBreak: "break-word" }}>
                {desc.slice(0, 60) || "Description"}
              </div>
            </div>
            {/* price */}
            <div style={{ textAlign: "center", fontSize: 16, fontWeight: 900, color: "#111" }}>
              {parseFloat(price || "0").toFixed(2)} <span style={{ fontSize: 9, fontWeight: 600, color: "#6b7280" }}>{currency}</span>
            </div>
            {/* pay button */}
            <div style={{ background: accent, borderRadius: 7, padding: "6px 0", textAlign: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: "#fff" }}>Pay with QIE Wallet</span>
            </div>
            {/* footer */}
            <div style={{ textAlign: "center", fontSize: 7, color: "#9ca3af" }}>Secured by QIE testnet · chainId 1983</div>
          </div>
          {/* home bar */}
          <div style={{ background: "#f3f4f6", height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 36, height: 4, background: "#d1d5db", borderRadius: 2 }} />
          </div>
        </div>

      </div>
    </div>
  );
}
