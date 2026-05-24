/**
 * Circle Dev-Controlled Wallets — Entity Secret setup helper.
 *
 * Run:  node scripts/circle-entity-setup.cjs
 *
 * What it does:
 *   1. Generates a random 32-byte entity secret (store this permanently!)
 *   2. Fetches Circle sandbox entity public key via API
 *   3. Encrypts entity secret with RSA-OAEP-SHA256 → 684-char ciphertext
 *   4. Creates a wallet set and prints CIRCLE_WALLET_SET_ID
 *
 * Docs: https://developers.circle.com/w3s/docs/entity-secret-management
 */

const crypto = require("crypto");

const API_KEY = process.env.CIRCLE_API_KEY || "TEST_API_KEY:4a99d21949903f6ba97ce5d67b00c803:25bda346892d239995a31499e7d573f0";
const BASE = API_KEY.startsWith("TEST_API_KEY") ? "https://api-sandbox.circle.com" : "https://api.circle.com";

const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", Accept: "application/json" };

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) }, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function main() {
  // 1. Generate entity secret
  const entitySecretHex = crypto.randomBytes(32).toString("hex");
  console.log("\n=== SAVE THIS — ENTITY SECRET (never share) ===");
  console.log(entitySecretHex);
  console.log("================================================\n");

  // 2. Get Circle's RSA public key for this account
  console.log("Fetching Circle entity public key...");
  let publicKeyPem;
  try {
    const pkRes = await fetchJson(`${BASE}/v1/w3s/config/entity/publicKey`);
    publicKeyPem = pkRes.data?.publicKey;
    if (!publicKeyPem) throw new Error("no publicKey in response: " + JSON.stringify(pkRes));
  } catch (e) {
    console.error("Could not fetch public key:", e.message);
    console.error("If you see 'error code: 1009', Circle API is Cloudflare-blocked from this IP.");
    console.error("Try: mobile hotspot -> run this script again.");
    process.exit(1);
  }

  // 3. Encrypt entity secret with Circle's RSA public key (OAEP-SHA256)
  const entitySecretBuf = Buffer.from(entitySecretHex, "hex");
  const ciphertext = crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    entitySecretBuf
  ).toString("base64");

  console.log("Entity Secret Ciphertext (paste into Circle Console -> DEV CONTROLLED -> Configurator):");
  console.log(ciphertext);
  console.log(`Length: ${ciphertext.length}\n`);

  // 4. Register entity secret with Circle
  console.log("Registering entity secret...");
  try {
    await fetchJson(`${BASE}/v1/w3s/config/entity/secret`, {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), entitySecretCiphertext: ciphertext }),
    });
    console.log("Entity secret registered!\n");
  } catch (e) {
    console.error("Registration via API failed:", e.message);
    console.log("-> Paste the ciphertext above manually into Circle Console -> DEV CONTROLLED -> Configurator -> Entity Secret\n");
  }

  // 5. Create wallet set
  console.log("Creating wallet set...");
  try {
    const wsRes = await fetchJson(`${BASE}/v1/w3s/walletSets`, {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), name: "arcmind-operators" }),
    });
    const walletSetId = wsRes.data?.walletSet?.id;
    if (!walletSetId) throw new Error("no walletSet.id: " + JSON.stringify(wsRes));
    console.log("Wallet set created!");
    console.log("\nAdd to server/.env:");
    console.log(`CIRCLE_ENTITY_SECRET=${entitySecretHex}`);
    console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);
  } catch (e) {
    console.error("Wallet set creation failed:", e.message);
    console.log(`\nManually add to server/.env after completing Console setup:`);
    console.log(`CIRCLE_ENTITY_SECRET=${entitySecretHex}`);
    console.log(`CIRCLE_WALLET_SET_ID=<paste from Console after registering entity secret>`);
  }
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
