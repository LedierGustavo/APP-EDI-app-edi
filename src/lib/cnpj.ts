// Lookup CEP via CNPJ. No Electron, toda a consulta e o cache de nome são
// feitos no main (evita CORS e mantém o renderer sem acesso ao Supabase).
// O fallback direto via fetch existe apenas para o modo web de desenvolvimento.

import { getApi } from "@/lib/ipc";

const cache = new Map<string, { cep: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function normalizeCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return digits.padStart(14, "0").slice(-14);
}

export async function lookupCepByCNPJ(cnpjRaw: string, signal?: AbortSignal): Promise<string | null> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return null;

  const cached = cache.get(cnpj);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.cep;

  // 1) Electron IPC (preferencial): o main consulta e faz upsert do nome.
  const api = getApi();
  if (api) {
    try {
      const res = await api.lookupCnpj(cnpj);
      if (res?.cep) {
        const cep = res.cep.replace(/\D/g, "");
        if (cep.length === 8) {
          cache.set(cnpj, { cep, ts: Date.now() });
          return cep;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // 2) Fallback web/dev (sem Supabase).
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal });
    if (r.ok) {
      const j = await r.json();
      if (j?.cep) {
        const cep = String(j.cep).replace(/\D/g, "");
        if (cep.length === 8) {
          cache.set(cnpj, { cep, ts: Date.now() });
          return cep;
        }
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
  }

  try {
    const r2 = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (r2.ok) {
      const j2 = await r2.json();
      const cepRaw = j2?.estabelecimento?.cep || j2?.cep || j2?.endereco?.cep;
      if (cepRaw) {
        const cep = String(cepRaw).replace(/\D/g, "");
        if (cep.length === 8) {
          cache.set(cnpj, { cep, ts: Date.now() });
          return cep;
        }
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
  }

  return null;
}
