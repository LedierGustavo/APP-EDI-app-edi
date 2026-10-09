import { supabase } from "@/lib/supabase";
import { normalizeCNPJ } from "@/lib/cnpj";

export type CredencialSoap = { id?: number; cnpj: string; token: string; created_at?: string };

const cache = new Map<string, { token: string | null; ts: number }>();
const TTL = 5 * 60 * 1000;

const DEFAULT_SECRET = "4hG7@89Kx#pLmN2zQ!vR5sT8";

function base64ToBytes(b64: string): Uint8Array {
  let b = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function decryptFernetWeb(token: string, secret: string): Promise<string | null> {
  try {
    const enc = new TextEncoder().encode(secret);
    const hashBuf = await crypto.subtle.digest("SHA-256", enc as BufferSource);
    const hashBytes = new Uint8Array(hashBuf);
    const signingKeyBytes = hashBytes.slice(0, 16);
    const encryptionKeyBytes = hashBytes.slice(16, 32);
    const data = base64ToBytes(token);
    if (data[0] !== 0x80) return null;
    if (data.length < 1 + 8 + 16 + 32 + 16) return null;
    const iv = data.slice(9, 25);
    const ciphertext = data.slice(25, data.length - 32);
    const hmac = data.slice(data.length - 32);
    const hmacData = data.slice(0, data.length - 32);
    const hmacKey = await crypto.subtle.importKey("raw", signingKeyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expectedHmacBuf = await crypto.subtle.sign("HMAC", hmacKey, hmacData as BufferSource);
    const expectedHmac = new Uint8Array(expectedHmacBuf);
    if (hmac.length !== expectedHmac.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac[i] ^ expectedHmac[i];
    if (diff !== 0) return null;
    const aesKey = await crypto.subtle.importKey("raw", encryptionKeyBytes as BufferSource, { name: "AES-CBC" }, false, ["decrypt"]);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv as BufferSource }, aesKey, ciphertext as BufferSource);
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

async function decryptIfNeeded(token: string): Promise<string> {
  const trimmed = token.trim();
  if (trimmed.startsWith("gAAAAA")) {
    if ((window as any).api?.resolveSenha) {
      try {
        return await (window as any).api.resolveSenha(trimmed);
      } catch {}
    }
    const dec = await decryptFernetWeb(trimmed, DEFAULT_SECRET);
    if (dec) return dec;
    return trimmed;
  }
  return trimmed;
}

export async function fetchTokenByCnpj(cnpjRaw: string): Promise<string | null> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return null;
  const cached = cache.get(cnpj);
  if (cached && Date.now() - cached.ts < TTL) return cached.token;
  const { data, error } = await supabase.from("credenciais_soap").select("cnpj,token").eq("cnpj", cnpj).maybeSingle();
  if (error) {
    console.warn("[credenciais_soap] fetch erro:", error.message);
    return null;
  }
  const raw = (data as any)?.token ?? null;
  if (!raw) {
    cache.set(cnpj, { token: null, ts: Date.now() });
    return null;
  }
  const dec = await decryptIfNeeded(raw);
  cache.set(cnpj, { token: dec, ts: Date.now() });
  return dec;
}

export async function fetchTokensBatch(cnpjs: string[]): Promise<Map<string, string | null>> {
  const norm = [...new Set(cnpjs.map(normalizeCNPJ).filter((c) => c.length === 14))];
  const missing = norm.filter((c) => {
    const hit = cache.get(c);
    return !hit || Date.now() - hit.ts >= TTL;
  });
  if (missing.length > 0) {
    const { data, error } = await supabase.from("credenciais_soap").select("cnpj,token").in("cnpj", missing);
    if (!error && data) {
      for (const r of data as any[]) {
        const dec = await decryptIfNeeded(r.token);
        cache.set(r.cnpj, { token: dec, ts: Date.now() });
      }
      missing.forEach((c) => {
        if (!cache.has(c)) cache.set(c, { token: null, ts: Date.now() });
      });
    }
  }
  const map = new Map<string, string | null>();
  norm.forEach((c) => map.set(c, cache.get(c)?.token ?? null));
  return map;
}

export async function upsertTokenSoap(cnpjRaw: string, tokenRaw: string): Promise<{ error?: string }> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return { error: "CNPJ deve ter 14 dígitos" };
  if (!tokenRaw.trim()) return { error: "Token obrigatório" };
  let tokenEnc = tokenRaw.trim();
  if ((window as any).api?.encryptSenha) {
    try {
      const enc = await (window as any).api.encryptSenha(tokenRaw.trim());
      if (enc) tokenEnc = enc;
    } catch {}
  }
  const { error } = await supabase.from("credenciais_soap").upsert({ cnpj, token: tokenEnc }, { onConflict: "cnpj" });
  if (error) return { error: error.message };
  cache.set(cnpj, { token: tokenRaw.trim(), ts: Date.now() });
  return {};
}

export async function insertTokenSoap(cnpjRaw: string, tokenRaw: string): Promise<{ error?: string }> {
  return upsertTokenSoap(cnpjRaw, tokenRaw);
}

export async function fetchCredenciaisSoap({ search, page, pageSize }: { search?: string; page: number; pageSize: number }): Promise<{ data: CredencialSoap[]; count: number | null }> {
  const cols = "cnpj,token,created_at";
  if (!search) {
    const { data, error, count } = await supabase.from("credenciais_soap").select(cols, { count: "exact" }).order("cnpj", { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    return { data: (data as CredencialSoap[]) ?? [], count };
  }
  const digits = search.replace(/\D/g, "");
  const { data: clientes } = await supabase.from("cliente_cache").select("cnpj").ilike("nome_cliente", `%${search}%`).limit(50);
  const cnpjs = (clientes as any[] | null)?.map((r) => r.cnpj) ?? [];
  const parts: string[] = [];
  if (digits) parts.push(`cnpj.ilike.%${digits}%`);
  cnpjs.forEach((c) => parts.push(`cnpj.ilike.${c}%`));
  if (parts.length === 0) return { data: [], count: 0 };
  const { data, error, count } = await supabase.from("credenciais_soap").select(cols, { count: "exact" }).or(parts.join(",")).order("cnpj", { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) throw error;
  return { data: (data as CredencialSoap[]) ?? [], count };
}
