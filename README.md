# APP EDI - Desktop (Electron + Vite + React)

App desktop moderno para teste da API Braspress em **produção** (sem menção Braspress por regra da empresa). Suporta **Cotação**, **Tracking v3 (byNf / byNumPedido)**, **SOAP (lote múltiplas ocorrências)** e **RotaCep**, tema claro/escuro e roteamento com `HashRouter` (suporta refresh).

## Arquitetura de segurança (chaves embutidas)

O renderer (Vite/React) **não conhece nenhuma chave** e **não fala com o Supabase**. Todo acesso a dados sensíveis e às APIs Braspress passa pelo **main process** do Electron via IPC:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (e a chave interna do Fernet) ficam **embutidas no binário** no momento do build (equivalente à macro `env!()` do Rust), definidas em `electron/security.ts`. Não há cofre (`safeStorage`), `.env` ou variáveis de ambiente do SO.
- O app é 100% autônomo: funciona em qualquer computador da equipe sem configuração extra.
- As senhas/tokens no Supabase são **Fernet** (`sha256(SECRET_KEY)` -> AES-128-CBC + HMAC-SHA256), descriptografadas apenas no main. Ver `electron/crypto.ts` e `electron/security.ts`.
- RLS **trancado**: nenhuma policy para `anon`/`authenticated`; só a `service_role` (bypass de RLS) lê/escreve. Ver `supabase/migrations/20261010_lockdown_credentials.sql`.

> NUNCA versione valores reais de `service_role` no repositório público. Este app é de uso interno.

## Stack
- Electron + Vite + React 19 + TypeScript + Tailwind + shadcn/ui
- Supabase acessado apenas pelo main (`service_role`)
- Zustand + TanStack Query + Zod + React Hook Form + sonner (toasts) + react-router-dom

## Configuração

```bash
npm install
```

As chaves do Supabase ficam embutidas no backend no momento do build (ver `electron/security.ts`). **Não é necessário** `.env`, variáveis de ambiente do SO nem cofre (`safeStorage`).

Para apontar para outro projeto Supabase, altere as constantes em `electron/security.ts` antes de `npm run build`.

### Scripts de desenvolvimento
- `npm run dev` — sobe o Vite **e** o Electron juntos (HMR). É o modo com acesso ao cofre (a lista de credenciais funciona).
- `npm run dev:web` — só o Vite no navegador. Sem cofre, as telas que exigem credenciais ficam indisponíveis.
- `npm run dev:electron` — compila e abre o Electron contra os arquivos buildados (`dist/`), sem HMR.
- `npm run build:main` — compila apenas o processo main/preload (`dist-electron/`).

## Rotação de chaves (SECRET_KEY)

Quando a `SECRET_KEY` muda, os dados já cifrados no banco precisam ser re-criptografados **antes** de o app usar a chave nova:

1. Gere uma nova chave de 32 bytes em base64:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. Rode a migração (dry-run por padrão; requer o `service_role` **atual**, ainda não rotacionado):
   ```powershell
   $env:OLD_SECRET_KEY = "<chave antiga>"
   $env:NEW_SECRET_KEY = "<chave nova>"
   node scripts/migracao-chaves.mjs            # simulação
   node scripts/migracao-chaves.mjs --commit   # aplica
   ```
   O script cobre `credenciais.senha`, `credenciais_etiquetas.senha` e `credenciais_soap.token`, e salva um backup dos originais em `scripts/_backups/` (ignorado pelo git).
3. Rotacione as chaves do Supabase e defina a **nova** `SECRET_KEY` para o app (Passo 4).
4. **Apague `scripts/migracao-chaves.mjs`** após concluir.

## Lockdown do RLS

Cole o conteúdo de `supabase/migrations/20261010_lockdown_credentials.sql` no SQL Editor do Supabase e execute (deve retornar "Success. No rows returned"). Depois valide que a `anon key` recebe 401/`[]` ao tentar ler `credenciais`.

## Estrutura
```
src/
  lib/ipc.ts (ponte IPC tipada), braspress.ts, validators.ts, cnpj.ts
  features/auth/CredentialSelector.tsx
  features/cotacao/CotacaoPage.tsx
  features/tracking/TrackingPage.tsx
  features/soap/SoapPage.tsx
  features/rotacep/RotaCepPage.tsx
  components/ErrorBoundary.tsx, ui/PasswordField.tsx, ui/*
  store/authStore.ts
electron/
  main.ts (IPCs, cofre, proxy Braspress)
  preload.ts (expõe window.api)
  security.ts (SecurityVault: safeStorage + service_role)
  crypto.ts (Fernet), soapParser.ts
```

## API Braspress
- Cotação: `POST /v1/cotacao/calcular/json` (payload conforme doc, cubagem em metros)
- Tracking v3: `GET /v3/tracking/byNf/{cnpj}/{notaFiscal}/json` e `byNumPedido/{cnpj}/{numPedido}/json`
- Auth: `Authorization: Basic base64(usuario:senha)` montado no main após resolver a senha no cofre
- O main faz `fetch` direto (sem CORS); o renderer chama `window.api.callCotacao/callTracking/callTrackingSoap/callRotaCep`

## Distribuição (formato padrão: NSIS per-user)

O formato oficial para a equipe é o **instalador NSIS per-user** (`APP EDI Setup x.y.z.exe`):

- Não exige privilégio de Administrador (`perMachine: false`, `allowElevation: false`).
- Instala em `%LOCALAPPDATA%\Programs\APP EDI` e abre em cerca de 1 s.
- Atualiza automaticamente pelo GitHub Releases (`electron-updater`).

O **Portable** (`APP EDI-Portable-x.y.z.exe`) é apenas alternativa pontual para máquinas onde o instalador é bloqueado. Ele extrai os arquivos em `%TEMP%` a cada execução, por isso abre mais devagar.

## Build
```bash
npm run build:electron     # tsc (electron) + vite build -> dist/ e dist-electron/
npm run dist               # instalador NSIS + Portable (electron-builder -> release/)
npm run build:portable     # somente o Portable
```

## Notas
- As chaves são embutidas no build, sem Rust/Tauri nem cofre, garantindo execução autônoma.
- Tema claro/escuro persiste em `localStorage`.
- Auto-update via GitHub Releases (`electron-updater`).
