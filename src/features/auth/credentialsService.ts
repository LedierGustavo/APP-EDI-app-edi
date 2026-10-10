import { requireDesktop } from "@/lib/ipc";

export type Credencial = { id: number; usuario: string; criado_em: string | null };

// Lista paginada (sem senha). A senha é obtida sob demanda via obterSenha().
export async function fetchCredenciais({
  search,
  page,
  pageSize,
}: {
  search?: string;
  page: number;
  pageSize: number;
}): Promise<{ data: Credencial[]; count: number | null }> {
  const api = requireDesktop("Listar credenciais");
  const res = await api.listarCredenciais({ search, page, pageSize });
  if (!res.ok) throw new Error(res.error);
  return { data: res.data as Credencial[], count: res.count ?? null };
}

// Descriptografa no main e devolve a senha em texto puro (para exibir na tela EDI).
export async function obterSenha(usuario: string): Promise<string> {
  const api = requireDesktop("Obter senha");
  const res = await api.obterCredencial(usuario);
  if (!res.ok) throw new Error(res.error);
  return res.data.senha;
}

export async function criarCredencial(usuario: string, senha: string): Promise<{ error?: string }> {
  const api = requireDesktop("Criar credencial");
  const res = await api.criarCredencial({ usuario, senha });
  return res.ok ? {} : { error: res.error };
}
