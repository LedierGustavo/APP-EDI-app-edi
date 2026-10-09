import { supabase, type Credencial } from "@/lib/supabase";

// Precomputed Fernet key para SECRET_KEY padrão "4hG7@89Kx#pLmN2zQ!vR5sT8" -> base64(sha256(secret))
const DEFAULT_FERNET_KEY_B64 = "n/YTLABxzK35k8TOComzjP3+5SVCcp4XuN7fAUPA43k=";
const DEFAULT_SECRET = "4hG7@89Kx#pLmN2zQ!vR5sT8";

function base64UrlToBytes(b64url: string): Uint8Array {
  // Fernet usa base64url (-/_), mas também pode vir standard (+/)
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function base64ToBytes(b64: string): Uint8Array {
  return base64UrlToBytes(b64);
}
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

async function importAesKey(keyBytes: Uint8Array, usages: KeyUsage[]) {
  return crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-CBC" }, false, usages);
}
async function importHmacKey(keyBytes: Uint8Array) {
  return crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function decryptFernetWeb(token: string, secret: string): Promise<string | null> {
  try {
    // Deriva Fernet key: sha256(secret) -> 32B -> split 16 signing / 16 encryption
    const enc = new TextEncoder().encode(secret);
    const hashBuf = await crypto.subtle.digest("SHA-256", enc as BufferSource);
    const hashBytes = new Uint8Array(hashBuf);
    const signingKeyBytes = hashBytes.slice(0, 16);
    const encryptionKeyBytes = hashBytes.slice(16, 32);

    // Token é base64 standard (gAAAAA...)
    const data = base64ToBytes(token);
    if (data[0] !== 0x80) return null;
    // data: 0x80 + 8B timestamp + 16B IV + ciphertext + 32B HMAC
    if (data.length < 1 + 8 + 16 + 32 + 16) return null;
    const iv = data.slice(9, 25);
    const ciphertext = data.slice(25, data.length - 32);
    const hmac = data.slice(data.length - 32);
    const hmacData = data.slice(0, data.length - 32);

    const hmacKey = await importHmacKey(signingKeyBytes);
    const expectedHmacBuf = await crypto.subtle.sign("HMAC", hmacKey, hmacData as BufferSource);
    const expectedHmac = new Uint8Array(expectedHmacBuf);
    // timing safe compare
    if (hmac.length !== expectedHmac.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac[i] ^ expectedHmac[i];
    if (diff !== 0) return null;

    const aesKey = await importAesKey(encryptionKeyBytes, ["decrypt"]);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv as BufferSource }, aesKey, ciphertext as BufferSource);
    // Web Crypto AES-CBC já remove PKCS7 padding automaticamente
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

export async function fetchCredenciais({ search, page, pageSize }: { search?: string; page: number; pageSize: number }): Promise<{ data: Credencial[]; count: number | null }> {
  let query = supabase.from("credenciais").select("id, usuario, senha, criado_em", { count: "exact" }).order("usuario", { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
  if (search) query = query.ilike("usuario", `%${search}%`);
  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data as Credencial[]) ?? [], count };
}

export async function resolveSenha(senhaRaw: string): Promise<string> {
  if (!senhaRaw) return "";
  const trimmed = senhaRaw.trim();
  // 1) Electron IPC - SECRET_KEY isolada no main (desktop)
  if (typeof window !== "undefined" && (window as any).api?.resolveSenha) {
    return await (window as any).api.resolveSenha(trimmed);
  }
  // 2) Fallback web (dev): descriptografia via Web Crypto (sem fernet Node)
  if (trimmed.startsWith("gAAAAA")) {
    // tenta com secret padrão (precomputado) e com VITE_SECRET_KEY se custom
    const secrets = [DEFAULT_SECRET];
    const viteSecret = (import.meta as any).env?.VITE_SECRET_KEY;
    if (viteSecret && viteSecret !== DEFAULT_SECRET) secrets.push(viteSecret);
    for (const sec of secrets) {
      const dec = await decryptFernetWeb(trimmed, sec);
      if (dec) return dec;
    }
    // tenta também com chave precomputada via atob direto (evita subtle se já temos)
    // fallback já coberto acima
    console.warn("[resolveSenha] Falha ao descriptografar Fernet web, retornando raw.");
  }
  return trimmed;
}

// Export para testes (não usado no bundle)
export const _testUtils = { base64ToBytes, bytesToBase64, decryptFernetWeb, DEFAULT_FERNET_KEY_B64 };
