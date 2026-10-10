// Ponte única entre o renderer e o "cofre" (main process do Electron).
// O renderer NÃO conhece Supabase, SECRET_KEY nem criptografia: só envia/recebe
// mensagens IPC. Sem Electron, as funções que dependem de credenciais falham
// de forma explícita em vez de cair em fallback inseguro (texto puro).

export type IpcOk<T> = { ok: true; data: T; count?: number | null };
export type IpcErr = { ok: false; error: string; errorCode?: string };
export type IpcResult<T> = IpcOk<T> | IpcErr;

// Mantido em sincronia com a declaração em electron/preload.ts.
export interface ElectronApi {
  listarCredenciais: (args: { search?: string; page: number; pageSize: number }) => Promise<IpcOk<unknown[]> | IpcErr>;
  obterCredencial: (usuario: string) => Promise<IpcOk<{ usuario: string; senha: string }> | IpcErr>;
  criarCredencial: (args: { usuario: string; senha: string }) => Promise<IpcOk<unknown> | IpcErr>;

  listarEtiquetas: (args: { search?: string; page: number; pageSize: number }) => Promise<IpcOk<unknown[]> | IpcErr>;
  obterEtiqueta: (args: { cnpj: string }) => Promise<IpcOk<{ cnpj: string; codigo_cliente: string | null; senha: string }> | IpcErr>;
  upsertEtiqueta: (args: { cnpj: string; senha: string; codigo_cliente: string }) => Promise<IpcOk<unknown> | IpcErr>;

  listarSoap: (args: { search?: string; page: number; pageSize: number }) => Promise<IpcOk<unknown[]> | IpcErr>;
  obterToken: (args: { cnpj: string }) => Promise<IpcOk<{ cnpj: string; token: string }> | IpcErr>;
  upsertToken: (args: { cnpj: string; token: string }) => Promise<IpcOk<unknown> | IpcErr>;

  obterClienteNome: (args: { cnpj: string }) => Promise<IpcOk<string | null> | IpcErr>;
  listarClienteNomes: (args: { cnpjs: string[] }) => Promise<IpcOk<Record<string, string | null>> | IpcErr>;
  upsertClienteCache: (args: { cnpj: string; nome: string }) => Promise<IpcOk<unknown> | IpcErr>;
  buscarCnpjsPorNome: (args: { nome: string }) => Promise<IpcOk<string[]> | IpcErr>;

  callCotacao: (args: unknown) => Promise<{ status: number; ok: boolean; data: unknown; raw?: string; parsed?: unknown; headers?: Record<string, string> }>;
  callTracking: (args: unknown) => Promise<{ status: number; ok: boolean; data: unknown; raw?: string }>;
  callTrackingSoap: (args: unknown) => Promise<{ status: number; ok: boolean; data: unknown; raw: string; parsed?: unknown }>;
  callRotaCep: (args: { cep: string; cnpj: string }) => Promise<{ status: number; ok: boolean; data: unknown; raw?: string }>;
  lookupCnpj: (cnpj: string) => Promise<
    | { ok: true; data: { cep: string | null; nome: string | null; source: string } }
    | { ok: false; error_type: "not_found" | "rate_limited" | "timeout" | "invalid" }
  >;

  checkForUpdates: () => Promise<unknown>;
  restartToUpdate: () => Promise<void>;
  onUpdateAvailable: (cb: () => void) => () => void;
  onUpdateDownloaded: (cb: () => void) => () => void;
}

export function getApi(): ElectronApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { api?: ElectronApi }).api;
}

export function hasDesktop(): boolean {
  return !!getApi();
}

export function requireDesktop(feature: string): ElectronApi {
  const api = getApi();
  if (!api) {
    throw new Error(
      `"${feature}" exige o app desktop (Electron). Rode com "npm run dev:electron". ` +
        `Acesso direto pelo navegador foi desativado por segurança.`,
    );
  }
  return api;
}

export function unwrap<T>(res: IpcResult<T> | undefined, ctx: string): T {
  if (!res) throw new Error(`${ctx}: sem resposta do cofre.`);
  if (!res.ok) throw new Error(res.error || `${ctx}: falha desconhecida.`);
  return res.data;
}
