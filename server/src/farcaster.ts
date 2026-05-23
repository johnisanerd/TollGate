/**
 * Farcaster cast bot — env-gated client via Neynar API.
 *
 * Docs: https://docs.neynar.com — POST /v2/farcaster/cast
 *
 * Requires:
 *   NEYNAR_API_KEY     — API key from neynar.com (free tier ok)
 *   NEYNAR_SIGNER_UUID — UUID of the registered signer for the bot account
 *
 * When either env is missing, postCast returns ok=false reason='not_configured'.
 * Never fabricates a cast hash.
 */

export interface CastResult {
  ok: boolean;
  reason?: string;
  hash?: string;
  author?: string;
}

const NEYNAR_CAST_URL = "https://api.neynar.com/v2/farcaster/cast";

export function isFarcasterConfigured(): boolean {
  return Boolean(process.env["NEYNAR_API_KEY"] && process.env["NEYNAR_SIGNER_UUID"]);
}

export async function postCast(text: string, opts?: { channelId?: string; embedUrl?: string }): Promise<CastResult> {
  const apiKey = process.env["NEYNAR_API_KEY"];
  const signerUuid = process.env["NEYNAR_SIGNER_UUID"];
  if (!apiKey || !signerUuid) return { ok: false, reason: "not_configured" };
  const trimmed = (text ?? "").trim().slice(0, 320);
  if (!trimmed) return { ok: false, reason: "text_required" };

  const body: Record<string, unknown> = { signer_uuid: signerUuid, text: trimmed };
  if (opts?.channelId) body["channel_id"] = opts.channelId;
  if (opts?.embedUrl) body["embeds"] = [{ url: opts.embedUrl }];

  try {
    const res = await fetch(NEYNAR_CAST_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, reason: `http_${res.status}_${txt.slice(0, 80)}` };
    }
    const json = await res.json() as { cast?: { hash?: string; author?: { username?: string } } };
    if (!json.cast?.hash) return { ok: false, reason: "no_cast_hash" };
    const out: CastResult = { ok: true, hash: json.cast.hash };
    if (json.cast.author?.username) out.author = json.cast.author.username;
    return out;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch_failed" };
  }
}
