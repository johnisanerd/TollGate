import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, RotateCcw, ShieldCheck, Wallet } from "lucide-react";
import type { Workspace } from "../../types";
import { getChain } from "../../lib/chains";
import { useNetworkMode } from "../../hooks/useNetworkMode";
import { useSettings } from "../../hooks/useSettings";
import { chainLabel, shortAddr, useWallet } from "../../wallet";

type GateStep = "idle" | "connecting" | "switching";

function eqHex(a: string | null, b: string): boolean {
  return Boolean(a) && a!.toLowerCase() === b.toLowerCase();
}

export function WorkspaceWalletGate({
  workspace,
  children,
}: {
  workspace: Workspace;
  children: React.ReactNode;
}) {
  const wallet = useWallet();
  const { settings } = useSettings();
  const { mode } = useNetworkMode(workspace.id);
  const target = useMemo(() => getChain(workspace.id, mode), [workspace.id, mode]);
  const [step, setStep] = useState<GateStep>("idle");
  const [autoStarted, setAutoStarted] = useState(false);
  const switchedFor = useRef<string | null>(null);

  const isNonEvm = Boolean(target.isNonEvm);
  const connected = Boolean(wallet.address);
  const onTarget = isNonEvm || eqHex(wallet.chainId, target.hex);
  const ready = wallet.available && connected && onTarget;
  const currentName = wallet.chainId ? chainLabel(wallet.chainId) : "unknown network";

  const connectAndSwitch = async () => {
    if (!wallet.available) return;
    if (!wallet.address) {
      setStep("connecting");
      await wallet.connect();
      setStep("idle");
      return;
    }
    if (!isNonEvm && !eqHex(wallet.chainId, target.hex)) {
      setStep("switching");
      await wallet.switchChain(target.hex);
      switchedFor.current = `${workspace.id}:${target.hex}`;
      setStep("idle");
    }
  };

  useEffect(() => {
    setAutoStarted(false);
    switchedFor.current = null;
  }, [workspace.id, target.hex]);

  useEffect(() => {
    if (!settings.autoConnect || !wallet.available || ready || autoStarted) return;
    const id = window.setTimeout(() => {
      if (!ready) {
        setAutoStarted(true);
        void connectAndSwitch();
      }
    }, 300);
    return () => window.clearTimeout(id);
  // connectAndSwitch intentionally stays outside deps to avoid repeated wallet prompts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoConnect, wallet.available, ready, autoStarted, workspace.id, target.hex]);

  useEffect(() => {
    if (!settings.autoConnect || !wallet.available || !wallet.address || ready || isNonEvm) return;
    const key = `${workspace.id}:${target.hex}`;
    if (switchedFor.current === key) return;
    switchedFor.current = key;
    setStep("switching");
    wallet.switchChain(target.hex).finally(() => setStep("idle"));
  }, [settings.autoConnect, wallet, ready, isNonEvm, workspace.id, target.hex]);

  if (ready) {
    return <>{children}</>;
  }

  const primaryLabel = !wallet.available
    ? "Install wallet"
    : !wallet.address
      ? step === "connecting" || wallet.connecting ? "Connecting..." : "Connect wallet"
      : step === "switching"
        ? `Switching to ${target.name}...`
        : `Switch to ${target.name}`;
  const isAgora = workspace.id === "agora";

  return (
    <div className="workspace-wallet-gate" role="dialog" aria-modal="true" aria-label={`Connect wallet for ${workspace.shortName}`}>
      <div className="workspace-wallet-gate__card">
        <div className="workspace-wallet-gate__mark" style={{ color: workspace.accent }}>
          {wallet.available ? <ShieldCheck className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
        </div>
        <div>
          <div className="workspace-wallet-gate__eyebrow">Workspace access check</div>
          <h1>{isAgora ? "Start ArcMind CopyGuard with your wallet" : `${workspace.shortName} requires wallet context`}</h1>
          <p>
            {isAgora
              ? "Connect an Arc Testnet wallet before starting a copy session. Your USDC stake stays user-controlled; the agent can only spend its separate treasury for autonomous data/action costs."
              : "Before opening this workspace, connect a wallet and use the chain configured for this project. Wallet popups require your approval; the app cannot switch networks silently."}
          </p>
        </div>

        <div className="workspace-wallet-gate__steps">
          <div className={wallet.address ? "is-done" : ""}>
            <span>{wallet.address ? <CheckCircle2 className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}</span>
            <div>
              <b>Wallet</b>
              <small>{wallet.address ? shortAddr(wallet.address) : wallet.available ? "not connected" : "not detected"}</small>
            </div>
          </div>
          <div className={onTarget ? "is-done" : ""}>
            <span>{onTarget ? <CheckCircle2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}</span>
            <div>
              <b>{isNonEvm ? "Network" : target.name}</b>
              <small>{isNonEvm ? "non-EVM workspace, no MetaMask switch" : wallet.chainId ? `current: ${currentName}` : `expected: ${target.name}`}</small>
            </div>
          </div>
        </div>

        {wallet.error && <div className="workspace-wallet-gate__error">{wallet.error}</div>}

        <button
          type="button"
          className="workspace-wallet-gate__button"
          onClick={() => { void connectAndSwitch(); }}
          disabled={!wallet.available || step !== "idle" || wallet.connecting}
          style={{ ["--gate-accent" as string]: workspace.accent }}
        >
          {step !== "idle" || wallet.connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          {primaryLabel}
        </button>

        {!wallet.available && (
          <a className="workspace-wallet-gate__link" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            Download MetaMask
          </a>
        )}
      </div>
    </div>
  );
}
