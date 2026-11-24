import { requireDesktop } from "@/lib/ipc";
import type { ApiEnvironment } from "@/store/apiEnvironmentStore";

export type Credencial = { id: number; usuario: string; criado_em: string | null };

// Lista paginada (sem senha). A senha é obtida sob demanda via obterSenha().
export async function fetchCredenciais({
  search,
  page,
  pageSize,
  environment,
}: {
  search?: string;
  page: number;
  pageSize: number;
  environment: ApiEnvironment;
}): Promise<{ data: Credencial[]; count: number | null }> {
  const api = requireDesktop("Listar credenciais");
  const res = await api.listarCredenciais({ search, page, pageSize, environment });
  if (!res.ok) throw new Error(res.error);
  return { data: res.data as Credencial[], count: res.count ?? null };
}

// Descriptografa no main e devolve a senha em texto puro (para exibir na tela EDI).
export async function obterSenha(usuario: string, environment: ApiEnvironment): Promise<string> {
  const api = requireDesktop("Obter senha");
  const res = await api.obterCredencial({ usuario, environment });
  if (!res.ok) throw new Error(res.error);
  return res.data.senha;
}

export async function criarCredencial(
  usuario: string,
  senha: string,
  environment: ApiEnvironment,
): Promise<{ error?: string }> {
  const api = requireDesktop("Criar credencial");
  const res = await api.criarCredencial({ usuario, senha, environment });
  return res.ok ? {} : { error: res.error };
}

export async function atualizarCredencial(
  usuarioAtual: string,
  usuario: string,
  environment: ApiEnvironment,
  senha?: string,
): Promise<{ error?: string }> {
  const api = requireDesktop("Editar credencial");
  const res = await api.atualizarCredencial({ usuarioAtual, usuario, senha, environment });
  return res.ok ? {} : { error: res.error };
}

export type CredentialBatchResult = { ok: true } | { ok: false; error: string };

export async function createCredentialBatch(
  usuario: string,
  senha: string,
  environment: ApiEnvironment = "production",
): Promise<CredentialBatchResult> {
  try {
    const result = await criarCredencial(usuario, senha, environment);
    return result.error ? { ok: false, error: result.error } : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao salvar credencial" };
  }
}
