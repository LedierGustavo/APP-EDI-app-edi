import { contextBridge, ipcRenderer } from "electron";

type IpcOk<T> = { ok: true; data: T; count?: number | null };
type IpcErr = { ok: false; error: string; errorCode?: string };

function subscribe(channel: string, cb: () => void): () => void {
  const listener = () => cb();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("api", {
  // Credenciais (cofre): list sem senha, get com senha sob demanda
  listarCredenciais: (args: unknown) => ipcRenderer.invoke("listar-credenciais", args),
  obterCredencial: (usuario: string) => ipcRenderer.invoke("obter-credencial", usuario),
  criarCredencial: (args: unknown) => ipcRenderer.invoke("criar-credencial", args),

  listarEtiquetas: (args: unknown) => ipcRenderer.invoke("listar-etiquetas", args),
  obterEtiqueta: (args: { cnpj: string }) => ipcRenderer.invoke("obter-etiqueta", args),
  upsertEtiqueta: (args: unknown) => ipcRenderer.invoke("upsert-etiqueta", args),

  listarSoap: (args: unknown) => ipcRenderer.invoke("listar-soap", args),
  obterToken: (args: { cnpj: string }) => ipcRenderer.invoke("obter-token", args),
  upsertToken: (args: unknown) => ipcRenderer.invoke("upsert-token", args),

  // Cliente cache (nomes) - agora também via cofre
  obterClienteNome: (args: { cnpj: string }) => ipcRenderer.invoke("obter-cliente-nome", args),
  listarClienteNomes: (args: { cnpjs: string[] }) => ipcRenderer.invoke("listar-cliente-nomes", args),
  upsertClienteCache: (args: unknown) => ipcRenderer.invoke("upsert-cliente-cache", args),
  buscarCnpjsPorNome: (args: { nome: string }) => ipcRenderer.invoke("buscar-cnpjs-por-nome", args),

  // Integrações Braspress
  callCotacao: (args: unknown) => ipcRenderer.invoke("call-cotacao", args),
  callTracking: (args: unknown) => ipcRenderer.invoke("call-tracking", args),
  callTrackingSoap: (args: unknown) => ipcRenderer.invoke("call-tracking-soap", args),
  callRotaCep: (args: { cep: string; cnpj: string }) => ipcRenderer.invoke("call-rota-cep", args),
  lookupCnpj: (cnpj: string) => ipcRenderer.invoke("lookup-cnpj", cnpj),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  restartToUpdate: () => ipcRenderer.invoke("restart-to-update"),
  onUpdateAvailable: (cb: () => void) => subscribe("update-available", cb),
  onUpdateDownloaded: (cb: () => void) => subscribe("update-downloaded", cb),
});

declare global {
  interface Window {
    api: {
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
      lookupCnpj: (cnpj: string) => Promise<{ cep: string | null; nome?: string | null; source?: string }>;

      checkForUpdates: () => Promise<unknown>;
      restartToUpdate: () => Promise<void>;
      onUpdateAvailable: (cb: () => void) => () => void;
      onUpdateDownloaded: (cb: () => void) => () => void;
    };
  }
}
