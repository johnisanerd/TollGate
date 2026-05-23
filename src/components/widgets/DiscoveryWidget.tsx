import { type CSSProperties, useEffect, useState } from "react";
import { ExternalLink, Search, Plus, Database, Zap, Loader2 } from "lucide-react";
import { useLocalStore } from "../../lib/storage";
import { ActionPanel } from "./ActionPanel";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Motion";
import { toast } from "../ui/Toast";
import { registerOnChainService } from "../../lib/og";
import type { WorkspaceId } from "../../types";

const CONTRACTS = [
  { label: "Arbitrum Sepolia", addr: "0xA8FdDb9F6f54Fbf127cb8c71049cB1e19f5836F9", url: "https://sepolia.arbiscan.io/address/0xA8FdDb9F6f54Fbf127cb8c71049cB1e19f5836F9" },
  { label: "0G Galileo testnet",       addr: "0x2b27425bd22Ae883dEc34F7a8Eacacf336C562b8", url: "https://chainscan-galileo.0g.ai/address/0x2b27425bd22Ae883dEc34F7a8Eacacf336C562b8" },
];

type RegistryService = {
  serviceId: string;
  name: string;
  priceUsd: number;
  network: string;
  endpoint: string;
  provider: string;
  registeredAt: string;
};

const SEED_SERVICES: RegistryService[] = [
  { serviceId: "svc_0g_inference", name: "0G Compute · Inference", priceUsd: 0.03, network: "0g-galileo", endpoint: "https://tollgate-1.onrender.com/api/gateway/svc_0g_inference", provider: "0xTollGate", registeredAt: "2026-05-13T00:00:00Z" },
  { serviceId: "svc_arb_gas_oracle", name: "Arbitrum · Gas Oracle", priceUsd: 0.01, network: "arbitrum-sepolia", endpoint: "https://tollgate-1.onrender.com/api/gateway/svc_arb_gas_oracle", provider: "0xTollGate", registeredAt: "2026-05-13T00:00:00Z" },
  { serviceId: "svc_mantle_yield", name: "Mantle · Yield Optimizer", priceUsd: 0.08, network: "mantle-mainnet", endpoint: "https://tollgate-1.onrender.com/api/gateway/svc_mantle_yield", provider: "0xTollGate", registeredAt: "2026-05-13T00:00:00Z" },
  { serviceId: "svc_qie_sentiment", name: "QIE · Sentiment Analysis", priceUsd: 0.02, network: "qie-mainnet", endpoint: "https://tollgate-1.onrender.com/api/gateway/svc_qie_sentiment", provider: "0xTollGate", registeredAt: "2026-05-13T00:00:00Z" },
];

const inp: CSSProperties = { padding: "7px 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--bg-2)", color: "var(--ink)", fontSize: ".84rem", width: "100%" };
const lbl: CSSProperties = { fontSize: ".65rem", textTransform: "uppercase" as const, letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 };
const col: CSSProperties = { display: "flex", flexDirection: "column" as const, gap: 4 };

const NETWORK_COLORS: Record<string, string> = {
  "arbitrum-sepolia": "#12AAFF",
  "mantle-mainnet": "#1AC964",
  "0g-galileo": "#A78BFA",
  "qie-mainnet": "#FB923C",
};

function netColor(network: string) {
  return NETWORK_COLORS[network] ?? "var(--muted)";
}

export function DiscoveryWidget({ workspaceId: _workspaceId }: { workspaceId?: WorkspaceId } = {}) {
  const [services, setServices] = useLocalStore<RegistryService[]>("registry.services", SEED_SERVICES);
  const [query, setQuery] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 420); return () => clearTimeout(t); }, []);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({ serviceId: "", name: "", priceUsd: "", network: "0g-galileo", endpoint: "", provider: "" });
  const [registered, setRegistered] = useState(false);

  const maxP = parseFloat(maxPrice) || Infinity;
  const q = query.toLowerCase();
  const filtered = services
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.serviceId.toLowerCase().includes(q) || s.network.toLowerCase().includes(q))
    .filter((s) => s.priceUsd <= maxP)
    .sort((a, b) => a.priceUsd - b.priceUsd);

  const [regErr, setRegErr] = useState<string | null>(null);
  const [regBusy, setRegBusy] = useState(false);

  function isValidHttpsUrl(s: string): boolean {
    try {
      const u = new URL(s);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch { return false; }
  }

  async function register() {
    setRegErr(null);
    const serviceId = form.serviceId.trim();
    const name      = form.name.trim();
    const endpoint  = form.endpoint.trim();

    if (!serviceId)             { setRegErr("Service ID is required"); return; }
    if (!/^[a-z0-9_]{3,64}$/i.test(serviceId)) { setRegErr("Service ID: 3–64 chars, letters/digits/underscore only"); return; }
    if (!name)                  { setRegErr("Name is required"); return; }
    if (name.length > 80)       { setRegErr("Name too long (max 80 chars)"); return; }
    if (!endpoint)              { setRegErr("Endpoint URL is required"); return; }
    if (!isValidHttpsUrl(endpoint)) { setRegErr("Endpoint must be a valid http(s) URL"); return; }

    const price = parseFloat(form.priceUsd);
    if (!Number.isFinite(price) || price < 0) { setRegErr("Price must be ≥ 0"); return; }
    if (price > 10_000)                        { setRegErr("Price too high (max $10,000)"); return; }

    const priceWei = BigInt(Math.round(price * 1e18));
    const agentCardUri = `https://tollgate.ai/agents/${serviceId}`;

    setRegBusy(true);
    try {
      const result = await registerOnChainService({
        serviceId, name, priceWei, currency: "OG", network: form.network,
        endpoint, agentCardUri,
      });
      const svc: RegistryService = {
        serviceId, name,
        priceUsd: Math.round(price * 10000) / 10000,
        network: form.network, endpoint,
        provider: result.provider,
        registeredAt: new Date().toISOString(),
      };
      setServices((prev) => [svc, ...prev.filter((s) => s.serviceId !== svc.serviceId)]);
      setForm({ serviceId: "", name: "", priceUsd: "", network: "0g-galileo", endpoint: "", provider: "" });
      setRegistered(true);
      toast.success(`Service '${name}' registered on-chain · tx ${result.txHash.slice(0, 10)}…`);
      setTimeout(() => { setRegistered(false); setShowRegister(false); }, 2200);
    } catch (e) {
      setRegErr((e as Error).message ?? String(e));
    }
    setRegBusy(false);
  }

  return (
    <ActionPanel
      icon={<Database size={15} />}
      title="ServiceRegistry — On-Chain Service Discovery"
      sub={<>Agents autonomously discover &amp; pay for services · ERC-8004 compatible · deployed on 3 chains</>}
    >
      {/* Contract links */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {CONTRACTS.map((c) => (
          <a key={c.label} href={c.url} target="_blank" rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".65rem", fontWeight: 700,
              padding: "3px 8px", borderRadius: 999, background: "var(--bg-2)", border: "1px solid var(--line-2)",
              color: "var(--muted)", textDecoration: "none" }}>
            <ExternalLink size={10} /> {c.label} · {c.addr.slice(0, 8)}…
          </a>
        ))}
      </div>

      {/* Search + filter row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 10 }}>
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input style={{ ...inp, paddingLeft: 28 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services…" />
        </div>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: ".82rem" }}>max $</span>
          <input style={{ ...inp, paddingLeft: 36, width: 90 }} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="∞" />
        </div>
      </div>

      {/* Result count + register toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ ...lbl }}>{filtered.length} service{filtered.length !== 1 ? "s" : ""} found · sorted cheapest-first</span>
        <button className="btn sm" onClick={() => setShowRegister((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Plus size={11} /> Register
        </button>
      </div>

      {/* Service list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {loading && [0, 1, 2].map((i) => (
          <div key={i} style={{ background: "var(--bg-2)", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <Skeleton width="55%" height={12} />
              <Skeleton width="35%" height={10} />
            </div>
            <Skeleton width={42} height={20} radius={6} />
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <EmptyState
            title={query || maxPrice ? "No services match your filter" : "No services registered yet"}
            description={query || maxPrice ? "Try a different keyword or remove the price cap." : "Click \"Register\" above to publish your first paid API."}
          />
        )}
        {!loading && filtered.map((s) => (
          <div key={s.serviceId} style={{ background: "var(--bg-2)", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink)", marginBottom: 2 }}>{s.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                <span style={{ fontSize: ".65rem", fontFamily: "monospace", color: "var(--muted)" }}>{s.serviceId}</span>
                <span style={{ fontSize: ".65rem", padding: "1px 6px", borderRadius: 999, background: "transparent", border: `1px solid ${netColor(s.network)}`, color: netColor(s.network), fontWeight: 700 }}>
                  {s.network}
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: ".92rem", color: "var(--ink)" }}>${s.priceUsd.toFixed(2)}</div>
              <div style={{ fontSize: ".6rem", color: "var(--muted)" }}>per call</div>
            </div>
            <a href={s.endpoint} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: ".72rem", color: "var(--muted)", textDecoration: "none" }}>
              <ExternalLink size={10} />
            </a>
          </div>
        ))}
      </div>

      {/* Register form */}
      {showRegister && (
        <div style={{ borderTop: "1px solid var(--line-2)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <Zap size={11} /> Register a paid API endpoint
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={col}><span style={lbl}>Service ID</span><input style={inp} value={form.serviceId} onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))} placeholder="svc_myapi" /></div>
            <div style={col}><span style={lbl}>Name</span><input style={inp} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My API · Feature" /></div>
            <div style={col}><span style={lbl}>Price (USD)</span><input style={inp} value={form.priceUsd} onChange={(e) => setForm((f) => ({ ...f, priceUsd: e.target.value }))} placeholder="0.05" /></div>
            <div style={col}>
              <span style={lbl}>Network</span>
              <select style={inp} value={form.network} onChange={(e) => setForm((f) => ({ ...f, network: e.target.value }))}>
                <option value="0g-galileo">0G Galileo testnet</option>
                <option value="arbitrum-sepolia">Arbitrum Sepolia</option>
                <option value="mantle-mainnet">Mantle mainnet</option>
                <option value="qie-mainnet">QIE mainnet</option>
              </select>
            </div>
          </div>
          <div style={col}><span style={lbl}>Endpoint URL</span><input style={inp} value={form.endpoint} onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))} placeholder="https://my-api.example.com/v1/feature" /></div>
          <div style={col}><span style={lbl}>Provider wallet</span><input style={inp} value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} placeholder="0x…" /></div>
          <button className="btn sm" onClick={register} disabled={regBusy} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5 }}>
            {regBusy ? <><Loader2 size={12} className="wallet-spin" /> Registering on-chain…</> : registered ? "✓ Registered" : "Register on 0G (MetaMask)"}
          </button>

          {regErr && (
            <div style={{ padding: "6px 10px", background: "color-mix(in srgb, #f87171 12%, transparent)", border: "1px solid #f8717155", borderRadius: 8, fontSize: ".7rem", color: "#f87171", fontWeight: 600 }}>
              {regErr}
            </div>
          )}
        </div>
      )}

      <p style={{ margin: "12px 0 0", fontSize: ".73rem", color: "var(--muted)", lineHeight: 1.55 }}>
        On-chain: <code>ServiceRegistry.register(serviceId, priceWei, endpoint, agentCardUri)</code> — emits <code>ServiceRegistered</code>.
        Agents call <code>getService(serviceId)</code> to resolve endpoint + price before paying.
      </p>
    </ActionPanel>
  );
}
