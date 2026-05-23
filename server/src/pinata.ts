/**
 * Pinata IPFS pinning — env-gated client.
 *
 * Pins arbitrary JSON (decision payloads, reasoning traces) via the official
 * Pinata REST API: POST https://api.pinata.cloud/pinning/pinJSONToIPFS
 *
 * Auth: `Authorization: Bearer ${PINATA_JWT}`.
 * When PINATA_JWT is absent, every call returns ok=false / reason='not_configured'
 * — no mock CIDs are ever returned.
 */

export interface PinResult {
  ok: boolean;
  reason?: string;
  cid?: string;
  pinSize?: number;
  timestamp?: string;
  gatewayUrl?: string;
}

const PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const DEFAULT_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export function isPinataConfigured(): boolean {
  return Boolean(process.env["PINATA_JWT"]);
}

export async function pinJson(name: string, payload: unknown): Promise<PinResult> {
  const jwt = process.env["PINATA_JWT"];
  if (!jwt) return { ok: false, reason: "not_configured" };
  const trimmedName = (name ?? "").trim().slice(0, 128);
  if (!trimmedName) return { ok: false, reason: "name_required" };

  try {
    const res = await fetch(PINATA_PIN_JSON_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        pinataContent: payload,
        pinataMetadata: { name: trimmedName },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, reason: `http_${res.status}_${txt.slice(0, 80)}` };
    }
    const json = await res.json() as { IpfsHash?: string; PinSize?: number; Timestamp?: string };
    if (!json.IpfsHash) return { ok: false, reason: "no_cid_returned" };
    const result: PinResult = {
      ok: true,
      cid: json.IpfsHash,
      gatewayUrl: `${process.env["PINATA_GATEWAY"] ?? DEFAULT_GATEWAY}/${json.IpfsHash}`,
    };
    if (typeof json.PinSize === "number") result.pinSize = json.PinSize;
    if (typeof json.Timestamp === "string") result.timestamp = json.Timestamp;
    return result;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch_failed" };
  }
}
