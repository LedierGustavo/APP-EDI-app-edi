import crypto from "crypto";

// Fernet (compatível com Python `cryptography.fernet`):
//   key = sha256(secret)  -> 32 bytes
//   signingKey = key[0..16]   (HMAC-SHA256)
//   encryptionKey = key[16..32] (AES-128-CBC)
// Token: base64url( 0x80 | timestamp(8B BE) | IV(16B) | ciphertext | HMAC(32B) )
// O HMAC cobre 0x80|timestamp|IV|ciphertext.

const FERNET_VERSION = 0x80;

export function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function base64UrlDecode(input: string): Buffer {
  let b = input.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return Buffer.from(b, "base64");
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decryptFernet(token: string, secret: string): string | null {
  try {
    const key = deriveKey(secret);
    const signingKey = key.subarray(0, 16);
    const encryptionKey = key.subarray(16, 32);

    const data = base64UrlDecode(token);
    if (data.length < 1 + 8 + 16 + 16 + 32) return null;
    if (data[0] !== FERNET_VERSION) return null;

    const hmacData = data.subarray(0, data.length - 32);
    const hmac = data.subarray(data.length - 32);
    const expected = crypto.createHmac("sha256", signingKey).update(hmacData).digest();
    if (hmac.length !== expected.length || !crypto.timingSafeEqual(hmac, expected)) return null;

    const iv = data.subarray(9, 25);
    const ciphertext = data.subarray(25, data.length - 32);
    const decipher = crypto.createDecipheriv("aes-128-cbc", encryptionKey, iv);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function encryptFernet(plain: string, secret: string): string {
  const key = deriveKey(secret);
  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16, 32);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-128-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);

  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const version = Buffer.from([FERNET_VERSION]);

  const hmacData = Buffer.concat([version, timestamp, iv, ciphertext]);
  const hmac = crypto.createHmac("sha256", signingKey).update(hmacData).digest();

  return base64UrlEncode(Buffer.concat([hmacData, hmac]));
}

// Legado: AES-256-GCM com layout base64(nonce[12] | ciphertext | tag[16])
export function decryptAESGCM(encryptedBase64: string, secret: string): string | null {
  try {
    const key = deriveKey(secret);
    const data = Buffer.from(encryptedBase64, "base64");
    if (data.length < 28) return null;
    const nonce = data.subarray(0, 12);
    const rest = data.subarray(12);
    if (rest.length < 16) return null;
    const authTag = rest.subarray(rest.length - 16);
    const ciphertext = rest.subarray(0, rest.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

// Heurística de resolução: Fernet -> AES-GCM -> texto puro.
// IMPORTANTE: retorna null quando parece criptografado mas nenhuma chave
// descriptografa, para o chamador decidir (nunca falhar em silêncio devolvendo
// o token criptografado como se fosse senha).
export function resolvePassword(raw: string, secret: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("gAAAAA")) {
    const f = decryptFernet(trimmed, secret);
    if (f !== null) return f;
    return null;
  }
  const isBase64 = /^[A-Za-z0-9+/=_-]+$/.test(trimmed) && trimmed.length >= 20;
  if (isBase64) {
    const f = decryptFernet(trimmed, secret);
    if (f !== null) return f;
    const g = decryptAESGCM(trimmed, secret);
    if (g !== null) return g;
    // base64 longo que não descriptografa: pode ser senha legítima em base64.
    return trimmed;
  }
  return trimmed;
}
