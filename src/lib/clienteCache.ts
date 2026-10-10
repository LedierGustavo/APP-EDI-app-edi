import { normalizeCNPJ } from "@/lib/cnpj";
import { getApi } from "@/lib/ipc";

export type ClienteCache = { cnpj: string; nome_cliente: string | null; atualizado_em: string | null };

// Cache de nomes de cliente (não sensível), resolvido pelo cofre no main.
export async function fetchClienteNome(cnpjRaw: string): Promise<string | null> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return null;
  const api = getApi();
  if (!api) return null;
  const res = await api.obterClienteNome({ cnpj });
  return res.ok ? res.data : null;
}

export async function fetchClientesBatch(cnpjs: string[]): Promise<Map<string, string | null>> {
  const norm = [...new Set(cnpjs.map(normalizeCNPJ).filter((c) => c.length === 14))];
  const map = new Map<string, string | null>();
  const api = getApi();
  if (norm.length === 0 || !api) {
    norm.forEach((c) => map.set(c, null));
    return map;
  }
  const res = await api.listarClienteNomes({ cnpjs: norm });
  if (!res.ok) {
    norm.forEach((c) => map.set(c, null));
    return map;
  }
  norm.forEach((c) => map.set(c, res.data[c] ?? null));
  return map;
}

export async function upsertClienteCache(cnpjRaw: string, nome: string): Promise<void> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14 || !nome) return;
  const api = getApi();
  if (!api) return;
  await api.upsertClienteCache({ cnpj, nome: nome.trim().slice(0, 200) });
}

export async function searchCnpjsByNome(nome: string): Promise<string[]> {
  const term = nome.trim();
  if (term.length < 2) return [];
  const api = getApi();
  if (!api) return [];
  const res = await api.buscarCnpjsPorNome({ nome: term });
  return res.ok ? res.data : [];
}
