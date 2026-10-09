// Lookup CEP via CNPJ - BrasilAPI (primária) + publica.cnpj.ws (fallback)
// Normaliza CNPJ com padStart 14, debounce e cache, trata 503 BrasilAPI

const cache = new Map<string, { cep: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function normalizeCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length === 0) return "";
  // padStart para casos como 406859000103 (12) ou 8624588000166 (13) vindos do Supabase
  return digits.padStart(14, "0").slice(-14);
}

export async function lookupCepByCNPJ(cnpjRaw: string, signal?: AbortSignal): Promise<string | null> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return null;

  const cached = cache.get(cnpj);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.cep;

  // 1) Tenta via Electron IPC se disponível (evita CORS/firewall)
  if (typeof window !== "undefined" && (window as any).api?.lookupCnpj) {
    try {
      const res = await (window as any).api.lookupCnpj(cnpj);
      if (res?.cep) {
        const cep = res.cep.replace(/\D/g, "");
        if (cep.length === 8) {
          cache.set(cnpj, { cep, ts: Date.now() });
          return cep;
        }
      }
    } catch {}
  }

  // 2) Direto BrasilAPI
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
    } else if (r.status === 404) {
      console.warn(`[CNPJ] ${cnpj} não encontrado na BrasilAPI`);
      return null;
    } else {
      console.warn(`[CNPJ] BrasilAPI status ${r.status} para ${cnpj}, tentando fallback`);
    }
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    console.warn(`[CNPJ] BrasilAPI erro para ${cnpj}:`, e?.message);
  }

  // 3) Fallback publica.cnpj.ws (mais estável para Itaú 60701190000104)
  try {
    const r2 = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, { signal, headers: { Accept: "application/json" } });
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
    console.warn(`[CNPJ] publica.cnpj.ws erro para ${cnpj}:`, e?.message);
  }

  return null;
}
