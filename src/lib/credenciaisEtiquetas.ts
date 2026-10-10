import { normalizeCNPJ } from "@/lib/cnpj";
import { getApi, requireDesktop } from "@/lib/ipc";

export type CredencialEtiqueta = {
  cnpj: string;
  codigo_cliente: string | null;
  senha?: string;
  created_at?: string;
};

export type EtiquetaDetalhe = { cnpj: string; codigo_cliente: string | null; senha: string };

// Detalhe (com senha descriptografada no main) sob demanda.
export async function fetchEtiquetaByCnpj(cnpjRaw: string): Promise<EtiquetaDetalhe | null> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return null;
  const api = getApi();
  if (!api) return null;
  const res = await api.obterEtiqueta({ cnpj });
  if (!res.ok) {
    if (res.errorCode === "NOT_FOUND") return null;
    throw new Error(res.error);
  }
  return res.data;
}

export async function upsertEtiqueta(
  cnpjRaw: string,
  senhaRaw: string,
  codigoCliente: string,
): Promise<{ error?: string }> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return { error: "CNPJ deve ter 14 dígitos" };
  if (!senhaRaw.trim()) return { error: "Senha obrigatória" };
  if (!codigoCliente.trim()) return { error: "Código do cliente obrigatório" };
  const api = requireDesktop("Salvar credencial de etiqueta");
  const res = await api.upsertEtiqueta({ cnpj, senha: senhaRaw.trim(), codigo_cliente: codigoCliente.trim() });
  return res.ok ? {} : { error: res.error };
}

// Lista paginada (sem senha).
export async function fetchCredenciaisEtiquetas({
  search,
  page,
  pageSize,
}: {
  search?: string;
  page: number;
  pageSize: number;
}): Promise<{ data: CredencialEtiqueta[]; count: number | null }> {
  const api = requireDesktop("Listar credenciais de etiqueta");
  const res = await api.listarEtiquetas({ search, page, pageSize });
  if (!res.ok) throw new Error(res.error);
  return { data: res.data as CredencialEtiqueta[], count: res.count ?? null };
}
