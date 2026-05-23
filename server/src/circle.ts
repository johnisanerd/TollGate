/**
 * Circle integrations — env-gated scaffold.
 *
 * Each surface (Paymaster, Programmable Wallets, USYC router) reports its
 * configuration state without making any external calls until the relevant
 * env keys are set. When keys ARE set the helpers proxy real Circle REST API
 * calls — no fabricated values, no mock responses.
 *
 * Docs:
 *   Paymaster:            https://developers.circle.com/stablecoins/docs/paymaster
 *   Programmable Wallets: https://developers.circle.com/w3s/docs/programmable-wallets
 *   USYC:                 https://www.circle.com/usyc
 */

export interface CircleStatus {
  paymaster: { configured: boolean; policyId?: string };
  wallets:   { configured: boolean; apiKeyMasked?: string };
  usyc:      { configured: boolean; router?: string };
  any:       boolean;
}

function maskKey(k: string | undefined): string | undefined {
  if (!k) return undefined;
  if (k.length <= 8) return "***";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function getCircleStatus(): CircleStatus {
  const apiKey = process.env["CIRCLE_API_KEY"];
  const policyId = process.env["CIRCLE_PAYMASTER_POLICY_ID"];
  const usycRouter = process.env["CIRCLE_USYC_ROUTER_ADDRESS"];

  const paymaster: CircleStatus["paymaster"] = { configured: !!(apiKey && policyId) };
  if (policyId) paymaster.policyId = policyId;
  const wallets: CircleStatus["wallets"] = { configured: !!apiKey };
  const masked = maskKey(apiKey);
  if (masked) wallets.apiKeyMasked = masked;
  const usyc: CircleStatus["usyc"] = { configured: !!usycRouter };
  if (usycRouter) usyc.router = usycRouter;

  return {
    paymaster, wallets, usyc,
    any: paymaster.configured || wallets.configured || usyc.configured,
  };
}

export interface CircleWalletCreateResult {
  ok: boolean;
  reason?: string;
  walletId?: string;
  address?: string;
  raw?: Record<string, unknown>;
}

/**
 * Create a Programmable Wallet via Circle's W3S API.
 * Real network call when CIRCLE_API_KEY + CIRCLE_WALLET_SET_ID are set;
 * otherwise returns ok=false with a reason — never fabricates a wallet.
 */
export async function createProgrammableWallet(name: string): Promise<CircleWalletCreateResult> {
  const apiKey = process.env["CIRCLE_API_KEY"];
  if (!apiKey) return { ok: false, reason: "not_configured" };
  const walletSetId = process.env["CIRCLE_WALLET_SET_ID"];
  if (!walletSetId) return { ok: false, reason: "wallet_set_id_missing" };

  try {
    const base = apiKey.startsWith("TEST_API_KEY") ? "https://api-sandbox.circle.com" : "https://api.circle.com";
    const res = await fetch(`${base}/v1/w3s/developer/wallets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        walletSetId,
        blockchains: ["ARB-SEPOLIA"],
        accountType: "SCA",
        metadata: [{ name }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, reason: `http_${res.status}_${txt.slice(0, 80)}` };
    }
    const json = await res.json() as { data?: { wallets?: Array<{ id?: string; address?: string }> } };
    const first = json.data?.wallets?.[0];
    if (!first?.id || !first.address) return { ok: false, reason: "no_wallet_returned" };
    return { ok: true, walletId: first.id, address: first.address, raw: json as Record<string, unknown> };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch_failed" };
  }
}

export const _testing = { maskKey };
