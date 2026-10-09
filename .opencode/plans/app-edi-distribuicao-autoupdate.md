# Plano: Distribuição + Auto-Update APP EDI (Electron)

**Data:** 2026-10-09
**Decisões aprovadas:**
- Hospedagem: GitHub Releases (repo privado com token) - provider `github`
- Assinatura: sem assinatura por hora (sem CSC, SmartScreen alerta aceito)
- Canal: `latest` único
- Janela: download silencioso em background + modal confirmação (não interromper cotação)
- Plataforma: só Windows NSIS

## 1. Arquitetura

```
GitHub Releases (privado) -> latest.yml + APP EDI Setup 1.x.x.exe (NSIS) + blockMap
        ^ token GH_TOKEN (env)                |
        | publish                             | download diff
        |                                     v
  electron-builder --publish always    Electron autoUpdater (main.ts)
                                          checkForUpdatesAndNotify() no ready
                                          update-available (silent)
                                          update-downloaded -> dialog "Reiniciar?"
                                          quitAndInstall() só após confirmação
```

## 2. Configuração electron-builder (package.json:build)

```json
"build": {
  "appId": "com.appedi.desktop",
  "productName": "APP EDI",
  "directories": { "output": "release" },
  "files": ["dist/**", "dist-electron/**", "package.json"],
  "win": { "target": [{ "target": "nsis", "arch": ["x64"] }], "sign": null },
  "nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true, "createDesktopShortcut": true, " differentialPackage": true },
  "publish": { "provider": "github", "owner": "<owner>", "repo": "<repo>", "private": true, "releaseType": "release" }
}
```

Token: `GH_TOKEN` env var (nunca commitado). Para repo privado, autoUpdater precisa `requestHeaders: { Authorization: "token ${GH_TOKEN}" }` ou `private: true` com updater configurado para usar token via `publish`.

Scripts:
- `build` -> vite + tsc electron -> dist
- `dist` -> `electron-builder --win --publish never` (teste local)
- `release` -> `electron-builder --win --publish always` (publica no GitHub, requer GH_TOKEN)

## 3. AutoUpdater (electron/main.ts)

```ts
import { autoUpdater } from "electron-updater";
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => autoUpdater.checkForUpdates(), 4*60*60*1000);
  }
});
autoUpdater.on("update-available", () => win?.webContents.send("update-available"));
autoUpdater.on("update-downloaded", () => win?.webContents.send("update-downloaded"));
ipcMain.handle("restart-to-update", () => autoUpdater.quitAndInstall());
```

Renderer modal: escuta `update-downloaded` via preload, mostra dialog "Atualização baixada. Reiniciar agora?" -> ipc invoke restart.

## 4. Pipeline Release

1. Bump `package.json:version` (semver)
2. `git tag v1.0.1 && git push origin v1.0.1`
3. Set `GH_TOKEN` (PAT classic com `repo` scope)
4. `npm run release` -> gera `release/APP EDI Setup 1.0.1.exe` + `latest.yml` + `blockMap`, publica no GitHub Releases
5. Clientes com 1.0.0 instalado recebem silent download + modal

## 5. Testes

- Instalar 1.0.0 local, publicar 1.0.1, verificar `update-downloaded` modal e `quitAndInstall`
- Teste offline: sem internet, app abre normal, tenta novamente em 4h
- Teste sem token: app instalado sem GH_TOKEN ainda consegue checar se `publish.private:true` + token embutido via `requestHeaders` (alternativa: gerar token de leitura no build)

## 6. Futuro

- Adicionar `CSC_LINK` quando cert .pfx disponível
- Adicionar `nsis differentialPackage` para updates menores
- GitHub Action para release automático em push de tag
