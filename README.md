# APP EDI - Desktop (Electron + Vite + React)

App desktop moderno para teste da API Braspress em **produção** (sem menção Braspress por regra da empresa). Suporta **Cotação**, **Tracking v3 (byNf / byNumPedido)**, **SOAP (lote múltiplas ocorrências)** e **RotaCep**, tema claro/escuro e roteamento com `HashRouter` (suporta refresh).

## Arquitetura de segurança (cofre)

O renderer (Vite/React) **não conhece nenhuma chave** e **não fala com o Supabase**. Todo acesso a dados sensíveis e às APIs Braspress passa pelo **main process** do Electron via IPC:

- `SUPABASE_SERVICE_ROLE_KEY` e `SECRET_KEY` são lidas do **ambiente do sistema** na primeira execução e persistidas criptografadas via `safeStorage` (DPAPI no Windows) em `userData/secure_keys.enc`.
- A partir daí o app não precisa mais das variáveis de ambiente — o cofre reabre sozinho.
- As senhas/tokens no Supabase são **Fernet** (`sha256(SECRET_KEY)` -> AES-128-CBC + HMAC-SHA256), descriptografadas apenas no main. Ver `electron/crypto.ts` e `electron/security.ts`.
- RLS **trancado**: nenhuma policy para `anon`/`authenticated`; só a `service_role` (bypass de RLS) lê/escreve. Ver `supabase/migrations/20261010_lockdown_credentials.sql`.

> NUNCA versione valores reais de `service_role`/`SECRET_KEY`. Este repo não contém chaves.

## Stack
- Electron + Vite + React 19 + TypeScript + Tailwind + shadcn/ui
- Supabase acessado apenas pelo main (`service_role`)
- Zustand + TanStack Query + Zod + React Hook Form + sonner (toasts) + react-router-dom

## Configuração

```bash
npm install
```

Defina as variáveis **na máquina** (não em `.env` — o Electron não carrega `.env`):

```powershell
# PowerShell (fixe com setx para persistir no SO)
$env:SUPABASE_URL              = "https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role>"
$env:SECRET_KEY                = "<chave Fernet>"
npm run dev:electron
```

Em execuções seguintes não é preciso repetir as variáveis (o cofre já persistiu).

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

## Build
```bash
npm run build:electron     # tsc (electron) + vite build -> dist/ e dist-electron/
npm run dist               # instalador (electron-builder -> release/)
```

## Notas
- Electron exigido (sem Rust/Tauri por limitação do ambiente).
- Tema claro/escuro persiste em `localStorage`.
- Auto-update via GitHub Releases (`electron-updater`).
