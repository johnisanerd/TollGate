/**
 * Polymarket CLOB execution scaffold (env-gated, dry-run default).
 *
 * Per the integration plan: until POLYMARKET_DRY_RUN is explicitly set to
 * "false" AND a funded POLYMARKET_PRIVATE_KEY (Polygon wallet) is configured,
 * this module records validated intents only — it never signs and broadcasts
 * a real order. Strict $5 cap is enforced even in live mode.
 *
 * Why a scaffold and not a live signer right now: posting a CLOB order needs
 * an EIP-712 typed signature against the Polymarket CTF exchange domain plus
 * approvals on USDC / Conditional Tokens. That belongs in a separate signed
 * deployment, not in a generic server proxy. The intent payload returned here
 * matches the CLOB order schema so a future signer can pick it up verbatim.
 *
 * Docs: https://docs.polymarket.com/developers/clob/overview
 */

export interface PolymarketIntentInput {
  tokenId: string;
  side: "BUY" | "SELL";
  sizeUsdc: number;
  price?: number;
  marketSlug?: string;
}

export interface PolymarketIntentResult {
  ok: boolean;
  status: "intent_recorded" | "live_executed" | "rejected";
  reason?: string;
  intentId?: string;
  payload?: {
    tokenId: string;
    side: "BUY" | "SELL";
    sizeUsdc: number;
    price?: number;
    marketSlug?: string;
    createdAt: string;
  };
  txHash?: string;
}

const MAX_BET_USDC = 5;
const TOKEN_ID_RE = /^[0-9]{1,80}$/;

export interface PolymarketStatus {
  configured: boolean;
  dryRun: boolean;
  maxBetUsdc: number;
  hasPrivateKey: boolean;
  clobBase: string;
}

const CLOB_BASE_DEFAULT = "https://clob.polymarket.com";

export function isPolymarketConfigured(): boolean {
  return Boolean(process.env["POLYMARKET_PRIVATE_KEY"]);
}

function isDryRun(): boolean {
  const raw = (process.env["POLYMARKET_DRY_RUN"] ?? "true").toLowerCase();
  return raw !== "false" && raw !== "0";
}

export function getPolymarketStatus(): PolymarketStatus {
  return {
    configured: isPolymarketConfigured(),
    dryRun: isDryRun(),
    maxBetUsdc: MAX_BET_USDC,
    hasPrivateKey: Boolean(process.env["POLYMARKET_PRIVATE_KEY"]),
    clobBase: process.env["POLYMARKET_CLOB_BASE"] ?? CLOB_BASE_DEFAULT,
  };
}

export async function recordPolymarketIntent(input: PolymarketIntentInput): Promise<PolymarketIntentResult> {
  if (!input || typeof input !== "object") {
    return { ok: false, status: "rejected", reason: "invalid_input" };
  }
  if (!TOKEN_ID_RE.test(input.tokenId ?? "")) {
    return { ok: false, status: "rejected", reason: "invalid_token_id" };
  }
  if (input.side !== "BUY" && input.side !== "SELL") {
    return { ok: false, status: "rejected", reason: "invalid_side" };
  }
  if (typeof input.sizeUsdc !== "number" || !Number.isFinite(input.sizeUsdc) || input.sizeUsdc <= 0) {
    return { ok: false, status: "rejected", reason: "invalid_size" };
  }
  if (input.sizeUsdc > MAX_BET_USDC) {
    return { ok: false, status: "rejected", reason: `over_max_bet_${MAX_BET_USDC}` };
  }
  if (input.price !== undefined && (typeof input.price !== "number" || input.price < 0 || input.price > 1)) {
    return { ok: false, status: "rejected", reason: "invalid_price" };
  }

  const payload: NonNullable<PolymarketIntentResult["payload"]> = {
    tokenId: input.tokenId,
    side: input.side,
    sizeUsdc: input.sizeUsdc,
    createdAt: new Date().toISOString(),
  };
  if (input.price !== undefined) payload.price = input.price;
  if (input.marketSlug) payload.marketSlug = input.marketSlug;

  const intentId = `pm-intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Live execution is intentionally NOT wired here. The signer lives in a
  // separate process for safety; this endpoint records validated intents.
  if (!isDryRun() && isPolymarketConfigured()) {
    return {
      ok: false,
      status: "rejected",
      reason: "live_signer_not_implemented",
      intentId,
      payload,
    };
  }

  return {
    ok: true,
    status: "intent_recorded",
    intentId,
    payload,
  };
}

export const _testing = { MAX_BET_USDC, TOKEN_ID_RE };
