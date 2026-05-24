import { motion } from "framer-motion";
import { Link, Navigate } from "react-router-dom";
import { ArrowUpRight, Bot } from "lucide-react";
import { workspaces } from "../data";
import { ConnectWalletButton } from "../wallet";
import { slugifyTab } from "../components/ui/AppSidebar";
import { useAppState } from "../app-state";
import { DottedGlobe } from "../components/visual/DottedGlobe";
import { HexGrid } from "../components/visual/HexGrid";
import { fadeInUp, fadeInUpSmall, fadeInScale, staggerFast } from "../lib/motion";
import { CHAIN_LOGOS } from "../lib/chain-logos";
import { useSettings } from "../hooks/useSettings";

function prettyChain(net: string): string {
  const base = net.replace(/-sepolia$/, "").replace(/-testnet$/, "");
  if (base === "0g") return "0G";
  if (base === "qie") return "QIE";
  if (base === "frontier") return "Frontier";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function ProjectLauncher() {
  const { settings } = useSettings();
  const { theme } = useAppState();
  const isDark = theme === "dark";
  const markerCss = isDark ? "#b7fc72" : "#ef6b78";
  const markerColor: [number, number, number] = isDark ? [0.72, 0.99, 0.45] : [0.94, 0.42, 0.47];
  const haloCss = isDark ? "rgba(183, 252, 114, 0.10)" : "rgba(239, 107, 120, 0.10)";
  const defaultWorkspace = workspaces.find((ws) => ws.id === settings.defaultWorkspace);

  if (defaultWorkspace) {
    return <Navigate to={`/app/${defaultWorkspace.id}/${slugifyTab(defaultWorkspace.tabs[0] ?? "Overview")}`} replace />;
  }

  return (
    <div className="relative min-h-screen bg-bg-base text-text-primary overflow-x-hidden">
      <HexGrid />

      {/* Header strip */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5 border-b border-border-default backdrop-blur-sm bg-bg-base/60">
        <div className="flex items-center gap-3">
          <img
            src="/logo0g.png"
            alt="TollGate"
            aria-hidden="true"
            className="w-10 h-10 rounded-xl shrink-0 object-contain"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-base font-extrabold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>TollGate</span>
            <span className="text-[10px] text-text-muted uppercase tracking-[0.25em]">x402 launcher</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/fleet"
            className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border-default bg-surface-2 text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
          >
            <Bot className="w-3 h-3" />
            Fleet
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 pt-16 pb-24">
        {/* Atmospheric globe behind the hero */}
        <div className="pointer-events-none absolute -top-10 right-0 w-[640px] max-w-[55vw] opacity-50 hidden md:block">
          <DottedGlobe markerCss={markerCss} markerColor={markerColor} haloCss={haloCss} />
        </div>

        <motion.div variants={staggerFast} initial="hidden" animate="show" className="relative max-w-3xl">
          <motion.span
            variants={fadeInUpSmall}
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            x402 payment rail · live on 0G
          </motion.span>
          <motion.h1 variants={fadeInUp} className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-4" style={{ fontFamily: "var(--font-display)" }}>
            The payment rail for the 0G AI economy.
            <br />
            <span className="gradient-text">Agents pay per call. Receipts on-chain.</span>
          </motion.h1>
          <motion.p variants={fadeInUpSmall} className="text-base md:text-lg text-text-secondary leading-relaxed max-w-2xl">
            Agents pay for <b className="text-text-primary">0G Compute</b> inference and <b className="text-text-primary">0G Storage</b> over HTTP&nbsp;402 — every payment a verifiable receipt anchored on <b className="text-text-primary">0G Galileo testnet</b>. The same gateway runs on Mantle, Arbitrum, Sui &amp; more — it&apos;s infrastructure, not a one-off.
          </motion.p>
          <motion.div variants={fadeInUpSmall} className="mt-5 flex flex-wrap items-center gap-2">
            <a
              href="https://chainscan-galileo.0g.ai/address/0x801ddc5a54E5a7F1d0D6900AA996A04E26D0307f"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border border-primary/25 bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              AgentReceiptRegistry — live on 0G Galileo testnet
              <ArrowUpRight size={11} />
            </a>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border border-border-default bg-surface-1 text-text-muted">
              HTTP 402 · ERC-8004 · MCP server
            </span>
          </motion.div>
        </motion.div>

        <motion.div
          variants={staggerFast}
          initial="hidden"
          animate="show"
          className="relative mt-12 grid gap-4 sm:grid-cols-2"
        >
          {workspaces.map((ws) => {
            const Icon = ws.Icon;
            const firstTabSlug = slugifyTab(ws.tabs[0] ?? "Overview");
            const featured = ws.id === "0g";
            return (
              <motion.div key={ws.id} variants={fadeInScale}>
                <Link
                  to={`/app/${ws.id}/${firstTabSlug}`}
                  className="group relative flex h-full rounded-2xl border border-border-default bg-surface-1 overflow-hidden transition-all duration-300 hover:border-[var(--ws-c)] hover:shadow-[0_0_28px_-8px_var(--ws-c)]"
                  style={{ ["--ws-c" as string]: ws.accent }}
                >
                  {/* Accent stripe */}
                  <span
                    className="w-1.5 shrink-0 rounded-l-2xl transition-all duration-300 group-hover:w-2.5"
                    style={{ background: ws.accent, boxShadow: `0 0 12px 2px ${ws.accent}99` }}
                  />

                  <div className="flex flex-col flex-1 px-5 py-4">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className="grid place-items-center w-14 h-14 rounded-2xl shrink-0 overflow-hidden"
                        style={{ background: `color-mix(in srgb, ${ws.accent} 15%, transparent)`, color: ws.accent }}
                      >
                        {CHAIN_LOGOS[ws.id] ? (
                          <img src={CHAIN_LOGOS[ws.id]} alt={ws.name} width={40} height={40} className="rounded-lg object-contain"
                            onError={(e) => { e.currentTarget.style.display = "none"; const fb = e.currentTarget.nextElementSibling as HTMLElement | null; if (fb) fb.style.display = "flex"; }} />
                        ) : null}
                        <span style={{ display: CHAIN_LOGOS[ws.id] ? "none" : "flex", alignItems: "center", justifyContent: "center" }}><Icon size={26} /></span>
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[14px] font-extrabold leading-tight group-hover:text-[var(--ws-c)] transition-colors" style={{ fontFamily: "var(--font-display)" }}>
                            {ws.name}
                          </h3>
                          {featured && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary shrink-0">
                              <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />Live · 0G
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-secondary font-mono uppercase tracking-wider">{ws.networks.slice(0, 2).join(" · ")}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: ws.accent }}>
                        Open <ArrowUpRight size={13} />
                      </span>
                    </div>

                    {/* Pitch */}
                    <p className="text-[12.5px] text-text-primary leading-relaxed flex-1">{ws.pitch}</p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border-default">
                      {ws.tags.slice(0, 4).map((t) => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-surface-2 border border-border-default text-text-secondary font-medium">{t}</span>
                      ))}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

      </main>
    </div>
  );
}
