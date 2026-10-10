import { normalizeCNPJ } from "@/lib/cnpj";
import { getApi, requireDesktop } from "@/lib/ipc";

export type CredencialSoap = {
  cnpj: string;
  token?: string;
  created_at?: string;
};

// Detalhe do token (descriptografado no main) sob demanda.
export async function fetchTokenByCnpj(cnpjRaw: string): Promise<string | null> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return null;
  const api = getApi();
  if (!api) return null;
  const res = await api.obterToken({ cnpj });
  if (!res.ok) {
    if (res.errorCode === "NOT_FOUND") return null;
    throw new Error(res.error);
  }
  return res.data.token;
}

// Compat: busca em lote (não mais em cache local).
export async function fetchTokensBatch(cnpjs: string[]): Promise<Map<string, string | null>> {
  const norm = [...new Set(cnpjs.map(normalizeCNPJ).filter((c) => c.length === 14))];
  const map = new Map<string, string | null>();
  const api = getApi();
  if (!api) {
    norm.forEach((c) => map.set(c, null));
    return map;
  }
  await Promise.all(
    norm.map(async (c) => {
      try {
        map.set(c, await fetchTokenByCnpj(c));
      } catch {
        map.set(c, null);
      }
    }),
  );
  return map;
}

export async function upsertTokenSoap(cnpjRaw: string, tokenRaw: string): Promise<{ error?: string }> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return { error: "CNPJ deve ter 14 dígitos" };
  if (!tokenRaw.trim()) return { error: "Token obrigatório" };
  const api = requireDesktop("Salvar token SOAP");
  const res = await api.upsertToken({ cnpj, token: tokenRaw.trim() });
  return res.ok ? {} : { error: res.error };
}

export async function insertTokenSoap(cnpjRaw: string, tokenRaw: string): Promise<{ error?: string }> {
  return upsertTokenSoap(cnpjRaw, tokenRaw);
}

export async function fetchCredenciaisSoap({
  search,
  page,
  pageSize,
}: {
  search?: string;
  page: number;
  pageSize: number;
}): Promise<{ data: CredencialSoap[]; count: number | null }> {
  const api = requireDesktop("Listar credenciais SOAP");
  const res = await api.listarSoap({ search, page, pageSize });
  if (!res.ok) throw new Error(res.error);
  return { data: res.data as CredencialSoap[], count: res.count ?? null };
}
