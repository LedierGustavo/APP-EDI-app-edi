import { supabase } from "@/lib/supabase";
import { normalizeCNPJ } from "@/lib/cnpj";

export type ClienteCache = { cnpj: string; nome_cliente: string | null; atualizado_em: string | null };

const memoryCache = new Map<string, { nome: string | null; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function fetchClienteNome(cnpjRaw: string): Promise<string | null> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return null;
  const cached = memoryCache.get(cnpj);
  if (cached && Date.now() - cached.ts < TTL) return cached.nome;
  const { data, error } = await supabase.from("cliente_cache").select("cnpj,nome_cliente").eq("cnpj", cnpj).maybeSingle();
  if (error) {
    console.warn("[clienteCache] fetch erro:", error.message);
    return null;
  }
  const nome = (data as any)?.nome_cliente ?? null;
  memoryCache.set(cnpj, { nome, ts: Date.now() });
  return nome;
}

export async function fetchClientesBatch(cnpjs: string[]): Promise<Map<string, string | null>> {
  const norm = [...new Set(cnpjs.map(normalizeCNPJ).filter((c) => c.length === 14))];
  const missing = norm.filter((c) => {
    const hit = memoryCache.get(c);
    return !hit || Date.now() - hit.ts >= TTL;
  });
  if (missing.length > 0) {
    const { data, error } = await supabase.from("cliente_cache").select("cnpj,nome_cliente").in("cnpj", missing);
    if (!error && data) {
      (data as any[]).forEach((r) => memoryCache.set(r.cnpj, { nome: r.nome_cliente, ts: Date.now() }));
      missing.forEach((c) => {
        if (!memoryCache.has(c)) memoryCache.set(c, { nome: null, ts: Date.now() });
      });
    } else if (error) {
      console.warn("[clienteCache] batch erro:", error.message);
    }
  }
  const map = new Map<string, string | null>();
  norm.forEach((c) => map.set(c, memoryCache.get(c)?.nome ?? null));
  return map;
}

export async function upsertClienteCache(cnpjRaw: string, nome: string): Promise<void> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14 || !nome) return;
  const clean = nome.trim().slice(0, 200);
  const { error } = await supabase.from("cliente_cache").upsert({ cnpj, nome_cliente: clean, atualizado_em: new Date().toISOString() }, { onConflict: "cnpj" });
  if (error) {
    console.warn("[clienteCache] upsert erro:", error.message);
  } else {
    memoryCache.set(cnpj, { nome: clean, ts: Date.now() });
  }
}

// Busca CNPJs por nome (para filtro combinado)
export async function searchCnpjsByNome(nome: string): Promise<string[]> {
  const term = nome.trim();
  if (term.length < 2) return [];
  const { data, error } = await supabase.from("cliente_cache").select("cnpj").ilike("nome_cliente", `%${term}%`).limit(50);
  if (error || !data) return [];
  return (data as any[]).map((r) => r.cnpj);
}
