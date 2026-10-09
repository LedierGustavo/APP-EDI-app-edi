import { supabase } from "@/lib/supabase";
import { normalizeCNPJ } from "@/lib/cnpj";

export type CredencialEtiqueta = { id?: number; cnpj: string; senha: string; codigo_cliente: string; created_at?: string };

const cache = new Map<string, { senha: string | null; codigo_cliente: string | null; ts: number }>();
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

async function decryptIfNeeded(senha: string): Promise<string> {
  const trimmed = senha.trim();
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

export async function fetchEtiquetaByCnpj(cnpjRaw: string): Promise<{ senha: string | null; codigo_cliente: string | null } | null> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return null;
  const cached = cache.get(cnpj);
  if (cached && Date.now() - cached.ts < TTL) return { senha: cached.senha, codigo_cliente: cached.codigo_cliente };
  const { data, error } = await supabase.from("credenciais_etiquetas").select("cnpj,senha,codigo_cliente").eq("cnpj", cnpj).maybeSingle();
  if (error) {
    console.warn("[credenciais_etiquetas] fetch erro:", error.message);
    return null;
  }
  if (!data) {
    cache.set(cnpj, { senha: null, codigo_cliente: null, ts: Date.now() });
    return null;
  }
  const senha = await decryptIfNeeded((data as any).senha ?? "");
  const codigo_cliente = (data as any)?.codigo_cliente ?? null;
  cache.set(cnpj, { senha, codigo_cliente, ts: Date.now() });
  return { senha, codigo_cliente };
}

export async function upsertEtiqueta(cnpjRaw: string, senhaRaw: string, codigoCliente: string): Promise<{ error?: string }> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return { error: "CNPJ deve ter 14 dígitos" };
  if (!senhaRaw.trim()) return { error: "Senha obrigatória" };
  if (!codigoCliente.trim()) return { error: "Código do cliente obrigatório" };
  let senhaEnc = senhaRaw.trim();
  if ((window as any).api?.encryptSenha) {
    try {
      const enc = await (window as any).api.encryptSenha(senhaRaw.trim());
      if (enc) senhaEnc = enc;
    } catch {}
  }
  const { error } = await supabase.from("credenciais_etiquetas").upsert({ cnpj, senha: senhaEnc, codigo_cliente: codigoCliente.trim() }, { onConflict: "cnpj" });
  if (error) return { error: error.message };
  cache.set(cnpj, { senha: senhaRaw.trim(), codigo_cliente: codigoCliente.trim(), ts: Date.now() });
  return {};
}

export async function fetchCredenciaisEtiquetas({ search, page, pageSize }: { search?: string; page: number; pageSize: number }): Promise<{ data: CredencialEtiqueta[]; count: number | null }> {
  const cols = "cnpj,codigo_cliente,created_at";
  if (!search) {
    const { data, error, count } = await supabase.from("credenciais_etiquetas").select(cols, { count: "exact" }).order("cnpj", { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    return { data: (data as CredencialEtiqueta[]) ?? [], count };
  }
  const digits = search.replace(/\D/g, "");
  const { data: clientes } = await supabase.from("cliente_cache").select("cnpj").ilike("nome_cliente", `%${search}%`).limit(50);
  const cnpjs = (clientes as any[] | null)?.map((r) => r.cnpj) ?? [];
  const parts: string[] = [];
  if (digits) parts.push(`cnpj.ilike.%${digits}%`);
  cnpjs.forEach((c) => parts.push(`cnpj.ilike.${c}%`));
  if (parts.length === 0) return { data: [], count: 0 };
  const { data, error, count } = await supabase.from("credenciais_etiquetas").select(cols, { count: "exact" }).or(parts.join(",")).order("cnpj", { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) throw error;
  return { data: (data as CredencialEtiqueta[]) ?? [], count };
}
