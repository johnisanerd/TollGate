import { useCallback, useEffect, useState } from "react";
import {
  Wallet, LogOut, Loader2, AlertTriangle, RefreshCw, Link2, Activity,
  Coins, ArrowDownLeft, ArrowUpRight, ExternalLink, ChevronDown, ChevronRight,
} from "lucide-react";
import { WORKSPACE_CHAINS, chainAddParams, type ChainConfig } from "./lib/chains";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

const WALLET_REFRESH_EVENT = "tollgate:wallet-refresh";

function emitWalletRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WALLET_REFRESH_EVENT));
  }
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const CHAIN_NAMES: Record<string, string> = {
  "0x1": "Ethereum",
  "0x2105": "Base",
  "0x14a34": "Base Sepolia",
  "0xaa36a7": "Sepolia",
  "0xa4b1": "Arbitrum One",
  "0x66eee": "Arbitrum Sepolia",
  "0x1388": "Mantle",
  "0x138b": "Mantle Sepolia",
  "0x4115": "0G Legacy",
  "0x40da": "0G Galileo",
  "0x40d9": "0G Testnet",
  "0x7bf": "QIE Mainnet",
  "0x4cef52": "Arc Testnet",
  "0x44d": "Polygon zkEVM",
  "0x985": "Polygon Cardona",
};

export function chainLabel(hex: string | null): string {
  if (!hex) return "";
  return CHAIN_NAMES[hex.toLowerCase()] ?? `Chain ${parseInt(hex, 16)}`;
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── ERC-20 token registry (the stablecoins x402 actually settles in) ──────────
export type TokenDef = { symbol: string; address: string; decimals: number };

const TOKENS_BY_CHAIN: Record<string, TokenDef[]> = {
  "0x1": [
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  ],
  "0x2105": [
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
    { symbol: "USDbC", address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", decimals: 6 },
  ],
  "0x14a34": [
    { symbol: "USDC", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
  ],
  "0xaa36a7": [
    { symbol: "USDC", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
  ],
  "0xa4b1": [
    { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
  ],
  "0x66eee": [
    { symbol: "USDC", address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", decimals: 6 },
  ],
  "0x1388": [
    { symbol: "USDC", address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", decimals: 6 },
    { symbol: "USDT", address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE", decimals: 6 },
  ],
};

export function tokensForChain(chainId: string | null): TokenDef[] {
  if (!chainId) return [];
  return TOKENS_BY_CHAIN[chainId.toLowerCase()] ?? [];
}

// ── Native gas token symbol per chain ────────────────────────────────────────
const NATIVE_SYMBOL: Record<string, string> = {
  "0x1": "ETH",
  "0x2105": "ETH",
  "0x14a34": "ETH",
  "0xaa36a7": "ETH",
  "0xa4b1": "ETH",
  "0x66eee": "ETH",
  "0x1388": "MNT",
  "0x138b": "MNT",
  "0x4115": "0G",
  "0x40da": "0G",
  "0x40d9": "0G",
  "0x7bf": "QIE",
  "0x4cef52": "USDC",
  "0x44d": "ETH",
  "0x985": "ETH",
};
export function nativeSymbolForChain(chainId: string | null): string {
  if (!chainId) return "ETH";
  return NATIVE_SYMBOL[chainId.toLowerCase()] ?? "ETH";
}

// ── Preferred chain per workspace (used for "Switch to X" in the sidebar) ────
// Mode-aware switching is handled by AppSidebar via useNetworkMode + getChain.
// This map provides a stable fallback for components that don't have mode context.
export const WORKSPACE_CHAIN: Record<string, { hex: string; name: string; native: string }> = {
  "0g":      { hex: "0x40da",   name: "0G Galileo",       native: "0G"   },
  qie:       { hex: "0x7bf",    name: "QIE Mainnet",       native: "QIE"  },
  arbitrum:  { hex: "0x66eee",  name: "Arbitrum Sepolia",  native: "ETH"  },
  mantle:    { hex: "0x1388",   name: "Mantle",            native: "MNT"  },
  sui:       { hex: "0x101",    name: "Sui Mainnet",       native: "SUI"  },
  agora:     { hex: "0x4cef52", name: "Arc Testnet",       native: "USDC" },
  polygon:   { hex: "0x985",    name: "Polygon Cardona",   native: "ETH"  },
};

const EXPLORERS: Record<string, string> = {
  "0x1": "https://etherscan.io",
  "0x2105": "https://basescan.org",
  "0x14a34": "https://sepolia.basescan.org",
  "0xaa36a7": "https://sepolia.etherscan.io",
  "0xa4b1": "https://arbiscan.io",
  "0x66eee": "https://sepolia.arbiscan.io",
  "0x1388": "https://explorer.mantle.xyz",
  "0x138b": "https://explorer.sepolia.mantle.xyz",
  "0x4115": "https://chainscan-galileo.0g.ai",
  "0x40da": "https://chainscan-galileo.0g.ai",
  "0x7bf": "https://testnet.qie.digital",
  "0x4cef52": "https://testnet.arcscan.app",
  "0x44d": "https://zkevm.polygonscan.com",
  "0x985": "https://cardona-zkevm.polygonscan.com",
};

function chainConfigForHex(hex: string): ChainConfig | null {
  const target = hex.toLowerCase();
  for (const chains of Object.values(WORKSPACE_CHAINS)) {
    for (const cfg of [chains.mainnet, chains.testnet]) {
      if (!cfg.isNonEvm && cfg.hex.toLowerCase() === target) return cfg;
    }
  }
  return null;
}

export function explorerTxUrl(chainId: string | null, hash: string): string | null {
  if (!chainId) return null;
  const base = EXPLORERS[chainId.toLowerCase()];
  return base ? `${base}/tx/${hash}` : null;
}
export function explorerAddrUrl(chainId: string | null, addr: string): string | null {
  if (!chainId) return null;
  const base = EXPLORERS[chainId.toLowerCase()];
  return base ? `${base}/address/${addr}` : null;
}

function padAddr32(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function padUint32(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

/** Build ERC-20 transfer(address,uint256) calldata. */
export function buildErc20TransferData(to: string, amount: bigint): string {
  return "0xa9059cbb" + padAddr32(to) + padUint32(amount);
}

/** Parse a decimal string like "12.5" into integer units (12500000 for decimals=6). */
export function parseUnits(decimalStr: string, decimals: number): bigint {
  const trimmed = decimalStr.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Invalid amount");
  const [intPart, fracPart = ""] = trimmed.split(".");
  const fracPadded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(intPart + fracPadded);
}

/** Send an ERC-20 transfer via the connected EIP-1193 provider. Returns the tx hash. */
export async function sendErc20Transfer(
  provider: Eip1193Provider,
  from: string,
  tokenAddress: string,
  to: string,
  amount: bigint,
): Promise<string> {
  const data = buildErc20TransferData(to, amount);
  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: tokenAddress, data, value: "0x0" }],
  })) as string;
  return txHash;
}

function fmtUnits(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  if (frac === 0n) return whole.toLocaleString("en-US");
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fracStr ? `.${fracStr}` : ""}`;
}

export type TokenBalance = TokenDef & { raw: bigint; display: string };

export function useErc20Balances(address: string | null, chainId: string | null) {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!provider || !address) { setBalances([]); return; }
    const list = tokensForChain(chainId);
    if (list.length === 0) { setBalances([]); return; }
    setLoading(true);
    try {
      const out = await Promise.all(list.map(async (t) => {
        try {
          const data = "0x70a08231" + padAddr32(address);
          const res = (await provider.request({
            method: "eth_call",
            params: [{ to: t.address, data }, "latest"],
          })) as string;
          const raw = res && res !== "0x" ? BigInt(res) : 0n;
          return { ...t, raw, display: fmtUnits(raw, t.decimals) };
        } catch {
          return { ...t, raw: 0n, display: "—" };
        }
      }));
      setBalances(out);
    } catch {
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [provider, address, chainId]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { balances, loading, refresh };
}

// ── Recent on-chain activity — scans the last N blocks for txs touching addr ──
export type OnchainTx = {
  hash: string;
  from: string;
  to: string | null;
  valueEth: string;
  blockNumber: number;
  direction: "in" | "out" | "self";
};

type RawTx = { hash: string; from: string; to: string | null; value: string };
type RawBlock = { number: string; transactions: RawTx[] } | null;

export function useRecentTxs(address: string | null, chainId: string | null, depth = 20) {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const [txs, setTxs] = useState<OnchainTx[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!provider || !address) return;
    setScanning(true);
    setError(null);
    setTxs([]);
    setScanned(0);
    try {
      const tipHex = (await provider.request({ method: "eth_blockNumber" })) as string;
      const tip = parseInt(tipHex, 16);
      const lower = address.toLowerCase();
      const found: OnchainTx[] = [];
      for (let i = 0; i < depth && found.length < 25; i++) {
        const bn = tip - i;
        if (bn < 0) break;
        let block: RawBlock = null;
        try {
          block = (await provider.request({
            method: "eth_getBlockByNumber",
            params: ["0x" + bn.toString(16), true],
          })) as RawBlock;
        } catch { block = null; }
        setScanned(i + 1);
        if (!block?.transactions) continue;
        for (const t of block.transactions) {
          const from = (t.from ?? "").toLowerCase();
          const to = (t.to ?? "").toLowerCase();
          if (from !== lower && to !== lower) continue;
          let valueEth = "0";
          try {
            const v = t.value && t.value !== "0x" ? BigInt(t.value) : 0n;
            valueEth = fmtUnits(v, 18);
          } catch { valueEth = "0"; }
          found.push({
            hash: t.hash,
            from: t.from,
            to: t.to,
            valueEth,
            blockNumber: bn,
            direction: from === lower && to === lower ? "self" : from === lower ? "out" : "in",
          });
        }
      }
      setTxs(found);
      if (found.length === 0) setError(`No transactions in the last ${depth} blocks`);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Scan failed");
    } finally {
      setScanning(false);
    }
  }, [provider, address, depth]);

  return { txs, scanning, scanned, depth, error, scan };
}

export type WalletState = {
  available: boolean;
  address: string | null;
  chainId: string | null;
  balanceEth: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Re-fetch the native balance for the connected address. */
  refresh: () => Promise<void>;
  /** Ask the wallet to switch to a chain by hex id (e.g. "0xa4b1"). */
  switchChain: (hex: string) => Promise<void>;
};

export function useWallet(): WalletState {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const available = Boolean(provider);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [balanceEth, setBalanceEth] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(async (addr: string) => {
    if (!provider) return;
    try {
      const wei = (await provider.request({ method: "eth_getBalance", params: [addr, "latest"] })) as string;
      const eth = Number(BigInt(wei)) / 1e18;
      setBalanceEth(eth.toFixed(eth < 1 ? 5 : 4));
    } catch {
      setBalanceEth(null);
    }
  }, [provider]);

  const hydrate = useCallback(async () => {
    if (!provider) return;
    try {
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        const cid = (await provider.request({ method: "eth_chainId" })) as string;
        setChainId(cid);
        void refreshBalance(accounts[0]);
      }
    } catch {}
  }, [provider, refreshBalance]);

  useEffect(() => { void hydrate(); }, [hydrate]);

  useEffect(() => {
    const onRefresh = () => { void hydrate(); };
    window.addEventListener(WALLET_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(WALLET_REFRESH_EVENT, onRefresh);
  }, [hydrate]);

  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        setAddress(null);
        setBalanceEth(null);
      } else {
        setAddress(accounts[0]);
        void refreshBalance(accounts[0]);
      }
    };
    const onChain = (...args: unknown[]) => {
      const cid = args[0] as string;
      setChainId(cid);
      if (address) void refreshBalance(address);
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [provider, address, refreshBalance]);

  const connect = useCallback(async () => {
    if (!provider) {
      setError("No wallet detected");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        const cid = (await provider.request({ method: "eth_chainId" })) as string;
        setChainId(cid);
        void refreshBalance(accounts[0]);
        emitWalletRefresh();
      }
    } catch (err) {
      const e = err as { code?: number; message?: string };
      setError(e.code === 4001 ? "Connection rejected" : e.message ?? "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }, [provider, refreshBalance]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setBalanceEth(null);
    setError(null);
    emitWalletRefresh();
  }, []);

  const refresh = useCallback(async () => {
    if (address) await refreshBalance(address);
  }, [address, refreshBalance]);

  const switchChain = useCallback(async (hex: string) => {
    if (!provider) { setError("No wallet detected"); return; }
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      setChainId(hex);
      if (address) void refreshBalance(address);
      emitWalletRefresh();
    } catch (err) {
      const e = err as { code?: number; message?: string };
      if (e.code === 4902) {
        const cfg = chainConfigForHex(hex);
        if (!cfg) {
          setError("Chain not added to your wallet — add it manually");
          return;
        }
        try {
          await provider.request({ method: "wallet_addEthereumChain", params: [chainAddParams(cfg)] });
          const cid = (await provider.request({ method: "eth_chainId" })) as string;
          setChainId(cid);
          if (address) void refreshBalance(address);
          emitWalletRefresh();
          return;
        } catch (addErr) {
          const add = addErr as { code?: number; message?: string };
          setError(add.code === 4001 ? "Network add rejected" : add.message ?? "Failed to add chain");
          return;
        }
      }
      setError(e.message ?? "Failed to switch chain");
    }
  }, [provider, address, refreshBalance]);

  return { available, address, chainId, balanceEth, connecting, error, connect, disconnect, refresh, switchChain };
}

export function ConnectWalletButton({
  compact = false,
  wallet,
}: {
  compact?: boolean;
  wallet?: WalletState;
}) {
  const internal = useWallet();
  const w = wallet ?? internal;
  const chipNativeSym = nativeSymbolForChain(w.chainId);

  if (!w.available) {
    return (
      <button
        className="wallet-btn wallet-btn--unavailable"
        type="button"
        title="Install MetaMask or another EIP-1193 wallet"
        onClick={() => window.open("https://metamask.io/download/", "_blank")}
      >
        <AlertTriangle size={14} />
        {!compact && <span>No wallet</span>}
      </button>
    );
  }

  if (w.address) {
    return (
      <div className="wallet-chip" title={`${w.address}\n${chainLabel(w.chainId)}`}>
        <span className="wallet-chip__dot" />
        <span className="wallet-chip__addr">{shortAddr(w.address)}</span>
        {!compact && w.balanceEth != null && (
          <span className="wallet-chip__bal">{w.balanceEth} {chipNativeSym}</span>
        )}
        {!compact && w.chainId && <span className="wallet-chip__net">{chainLabel(w.chainId)}</span>}
        <button className="wallet-chip__x" type="button" aria-label="Disconnect" onClick={w.disconnect}>
          <LogOut size={12} />
        </button>
      </div>
    );
  }

  return (
    <button className="wallet-btn" type="button" onClick={() => void w.connect()} disabled={w.connecting}>
      {w.connecting ? <Loader2 size={14} className="wallet-spin" /> : <Wallet size={14} />}
      <span>{w.connecting ? "Connecting…" : compact ? "Connect" : "Connect Wallet"}</span>
    </button>
  );
}

export function WalletLiveStrip() {
  const w = useWallet();
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const [block, setBlock] = useState<number | null>(null);
  const [gasGwei, setGasGwei] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nativeSym = nativeSymbolForChain(w.chainId);
  const { balances, loading: balLoading, refresh: refreshTokens } = useErc20Balances(w.address, w.chainId);
  const { txs, scanning, scanned, depth, error: txErr, scan } = useRecentTxs(w.address, w.chainId);
  const [feedOpen, setFeedOpen] = useState(false);

  const pull = useCallback(async () => {
    if (!provider || !w.address) return;
    setBusy(true);
    try {
      const bn = (await provider.request({ method: "eth_blockNumber" })) as string;
      setBlock(parseInt(bn, 16));
      try {
        const gp = (await provider.request({ method: "eth_gasPrice" })) as string;
        setGasGwei((Number(BigInt(gp)) / 1e9).toFixed(2));
      } catch { setGasGwei(null); }
    } catch {} finally { setBusy(false); }
  }, [provider, w.address]);

  useEffect(() => {
    if (!w.address) { setBlock(null); setGasGwei(null); return; }
    void pull();
    const t = window.setInterval(() => { void pull(); }, 15000);
    return () => window.clearInterval(t);
  }, [w.address, pull]);

  if (!w.available) {
    return (
      <div className="wlive wlive--off">
        <Link2 size={15} />
        <span>No EIP-1193 wallet detected — install MetaMask to see live on-chain data here.</span>
        <button type="button" onClick={() => window.open("https://metamask.io/download/", "_blank")}>Get a wallet</button>
      </div>
    );
  }

  if (!w.address) {
    return (
      <div className="wlive wlive--idle">
        <Wallet size={15} />
        <span>Connect a wallet to mirror this agent against a real address.</span>
        <button type="button" onClick={() => void w.connect()} disabled={w.connecting}>
          {w.connecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {w.error && <em className="wlive__err">{w.error}</em>}
      </div>
    );
  }

  const explorerAddr = explorerAddrUrl(w.chainId, w.address);
  const hasTokenList = tokensForChain(w.chainId).length > 0;

  return (
    <div className="wlive wlive--on">
      <div className="wlive__row">
        <span className="wlive__k"><Activity size={13} /> Live</span>
        <span className="wlive__net">{chainLabel(w.chainId)}</span>
        {explorerAddr && (
          <a className="wlive__explorer" href={explorerAddr} target="_blank" rel="noreferrer">
            Explorer <ExternalLink size={11} />
          </a>
        )}
        <button className="wlive__refresh" type="button" onClick={() => { void pull(); void refreshTokens(); }} aria-label="Refresh">
          <RefreshCw size={12} className={busy || balLoading ? "wallet-spin" : undefined} />
        </button>
      </div>
      <div className="wlive__grid">
        <div className="wlive__cell">
          <span className="wlive__cell-k">Address</span>
          <span className="wlive__cell-v wlive__mono">{shortAddr(w.address)}</span>
        </div>
        <div className="wlive__cell">
          <span className="wlive__cell-k">Native balance</span>
          <span className="wlive__cell-v">{w.balanceEth != null ? `${w.balanceEth} ${nativeSym}` : "—"}</span>
        </div>
        <div className="wlive__cell">
          <span className="wlive__cell-k">Block</span>
          <span className="wlive__cell-v wlive__mono">{block != null ? `#${block.toLocaleString()}` : "—"}</span>
        </div>
        <div className="wlive__cell">
          <span className="wlive__cell-k">Gas price</span>
          <span className="wlive__cell-v">{gasGwei != null ? `${gasGwei} gwei` : "—"}</span>
        </div>
      </div>

      <div className="wlive__tokens">
        <div className="wlive__tokens-head">
          <span className="wlive__k"><Coins size={13} /> Stablecoins (ERC-20)</span>
          {balLoading && <Loader2 size={12} className="wallet-spin" />}
        </div>
        {!hasTokenList ? (
          <p className="wlive__hint">No stablecoin registry for {chainLabel(w.chainId) || "this network"} yet — switch to Ethereum, Base, Arbitrum or Mantle.</p>
        ) : balances.length === 0 ? (
          <p className="wlive__hint">Reading <code>balanceOf</code>…</p>
        ) : (
          <div className="wlive__token-grid">
            {balances.map((b) => (
              <div key={b.symbol} className="wlive__token">
                <span className="wlive__token-sym">{b.symbol}</span>
                <span className="wlive__token-bal">{b.display}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wlive__feed">
        <button className="wlive__feed-toggle" type="button" onClick={() => { const n = !feedOpen; setFeedOpen(n); if (n && txs.length === 0 && !scanning) void scan(); }}>
          {feedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span>Recent on-chain activity</span>
          {scanning && <span className="wlive__feed-prog">scanning block {scanned}/{depth}…</span>}
          {!scanning && txs.length > 0 && <span className="wlive__feed-count">{txs.length}</span>}
        </button>
        {feedOpen && (
          <div className="wlive__feed-body">
            {scanning && txs.length === 0 && <p className="wlive__hint"><Loader2 size={12} className="wallet-spin" /> Walking the last {depth} blocks for transactions touching this address…</p>}
            {!scanning && txErr && txs.length === 0 && (
              <p className="wlive__hint">{txErr}. <button type="button" className="wlive__relink" onClick={() => void scan()}>Re-scan</button></p>
            )}
            {txs.map((t) => {
              const url = explorerTxUrl(w.chainId, t.hash);
              return (
                <div key={t.hash} className={`wlive__tx wlive__tx--${t.direction}`}>
                  <span className="wlive__tx-dir">
                    {t.direction === "in" ? <ArrowDownLeft size={13} /> : t.direction === "out" ? <ArrowUpRight size={13} /> : <RefreshCw size={12} />}
                  </span>
                  <span className="wlive__tx-hash wlive__mono">{url ? <a href={url} target="_blank" rel="noreferrer">{t.hash.slice(0, 10)}…{t.hash.slice(-6)}</a> : `${t.hash.slice(0, 10)}…`}</span>
                  <span className="wlive__tx-peer wlive__mono">{t.direction === "in" ? `from ${shortAddr(t.from)}` : t.to ? `to ${shortAddr(t.to)}` : "contract deploy"}</span>
                  <span className="wlive__tx-val">{t.valueEth} {nativeSym}</span>
                  <span className="wlive__tx-blk wlive__mono">#{t.blockNumber.toLocaleString()}</span>
                </div>
              );
            })}
            {!scanning && txs.length > 0 && (
              <button type="button" className="wlive__relink" onClick={() => void scan()}>Re-scan latest {depth} blocks</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
