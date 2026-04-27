import crypto from "crypto";

const AES_KEY = process.env.PAYSPRINT_AES_KEY || "default_aes_key_for_uat_testing";
const AES_IV = process.env.PAYSPRINT_AES_IV || "default_iv_for_uat";

// Resolve AES key/IV from either hex-encoded (32 chars → 16 bytes)
// or plain ASCII (16 chars → 16 bytes) string.
function resolveAesBytes(str: string): Buffer {
  const s = str.trim();
  if (s.length === 32 && /^[0-9a-fA-F]+$/.test(s)) {
    return Buffer.from(s, "hex");
  }
  return Buffer.from(s).slice(0, 16);
}

// Startup diagnostic — printed once when the module is first loaded.
// Logs key/IV lengths and last-4 chars only (never the full secret).
(function logAesConfig() {
  const keyResolved = resolveAesBytes(AES_KEY);
  const ivResolved  = resolveAesBytes(AES_IV);
  const keyIsHex = AES_KEY.trim().length === 32 && /^[0-9a-fA-F]+$/.test(AES_KEY.trim());
  const ivIsHex  = AES_IV.trim().length === 32  && /^[0-9a-fA-F]+$/.test(AES_IV.trim());
  console.log(
    `[AES CONFIG] keyLen=${keyResolved.length} ivLen=${ivResolved.length}` +
    ` keyMode=${keyIsHex ? "hex32" : "ascii"} ivMode=${ivIsHex ? "hex32" : "ascii"}` +
    ` keyLast4=${AES_KEY.trim().slice(-4)} ivLast4=${AES_IV.trim().slice(-4)}`
  );
})();

export function encryptPayload(data: Record<string, unknown>): string {
  const text = JSON.stringify(data);
  const key = resolveAesBytes(AES_KEY);
  const iv = resolveAesBytes(AES_IV);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

export function decryptPayload(encrypted: string): Record<string, unknown> {
  const key = resolveAesBytes(AES_KEY);
  const iv = resolveAesBytes(AES_IV);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

export function generateJwtToken(payload: Record<string, unknown>): string {
  const secret = process.env.SESSION_SECRET || "rupyasetu_secret_key";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 7 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyJwtToken(token: string): Record<string, unknown> | null {
  try {
    const secret = process.env.SESSION_SECRET || "rupyasetu_secret_key";
    const [header, body, signature] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
