import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  resolveSenha: (senhaBruta: string) => ipcRenderer.invoke("resolve-senha", senhaBruta),
  encryptSenha: (senhaBruta: string) => ipcRenderer.invoke("encrypt-senha", senhaBruta),
  callCotacao: (args: any) => ipcRenderer.invoke("call-cotacao", args),
  callTracking: (args: any) => ipcRenderer.invoke("call-tracking", args),
  lookupCnpj: (cnpj: string) => ipcRenderer.invoke("lookup-cnpj", cnpj),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  restartToUpdate: () => ipcRenderer.invoke("restart-to-update"),
  onUpdateAvailable: (cb: () => void) => ipcRenderer.on("update-available", cb),
  onUpdateDownloaded: (cb: () => void) => ipcRenderer.on("update-downloaded", cb),
});

declare global {
  interface Window {
    api: {
      resolveSenha: (s: string) => Promise<string>;
      encryptSenha: (s: string) => Promise<string>;
      callCotacao: (args: any) => Promise<{ status: number; ok: boolean; data: any }>;
      callTracking: (args: any) => Promise<{ status: number; ok: boolean; data: any }>;
      lookupCnpj: (cnpj: string) => Promise<{ cep: string | null; source?: string }>;
      checkForUpdates: () => Promise<any>;
      restartToUpdate: () => Promise<void>;
      onUpdateAvailable: (cb: () => void) => void;
      onUpdateDownloaded: (cb: () => void) => void;
    };
  }
}
