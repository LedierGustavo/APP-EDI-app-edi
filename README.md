# APP EDI - Desktop (Electron + Vite + React)

App desktop moderno para teste da API Braspress em **produção** (sem menção Braspress por regra da empresa). Suporta **Cotação** e **Tracking v3 (byNf / byNumPedido)**, tema claro/escuro, 742+ credenciais do Supabase com senhas híbridas (texto puro / Fernet AES-128-CBC).

## Stack
- Electron + Vite + React 19 + TypeScript + Tailwind + shadcn/ui
- Supabase (`public.credenciais`) via `anon key` (RLS)
- Zustand + TanStack Query + Zod + React Hook Form
- `SECRET_KEY` apenas no **main process** (nunca no renderer) - descriptografia Fernet via `sha256(SECRET_KEY) -> base64`

## Configuração

```bash
npm install
cp .env.example .env
# .env já contém VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev        # web apenas (Vite)
npm run dev:electron # Electron (recomendado)
```

### Supabase - RLS
A tabela `public.credenciais` já tem 742 linhas. Se o SELECT via `anon` falhar, rode no SQL Editor do Supabase:
```sql
alter table public.credenciais enable row level security;
create policy "app_edi_anon_select" on public.credenciais
  for select to anon using (true);
```
Verificado: `anon` já consegue ler (count 742).

### SECRET_KEY
- Valor padrão em `electron/main.ts`: `4hG7@89Kx#pLmN2zQ!vR5sT8`
- Derive Fernet key: `base64(sha256(SECRET))` - compatível com Python `cryptography.fernet`
- Tokens Fernet começam com `gAAAAA...` (ex: `gAAAAABqvrDor...`). Senhas em texto puro são retornadas como estão (heurística).
- Produção: defina `SECRET_KEY` como variável de ambiente do sistema antes de buildar o `.exe` para não hardcodar.

## Estrutura
```
src/
  lib/supabase.ts, braspress.ts, validators.ts
  features/auth/CredentialSelector.tsx (combobox 700+ paginado)
  features/cotacao/CotacaoPage.tsx (cubagem dinâmica, preview, cURL)
  features/tracking/TrackingPage.tsx (abas byNf/byNumPedido, timeline, ocorrências)
  components/ui/*, layout/ThemeProvider.tsx
  store/authStore.ts
electron/
  main.ts (Fernet decrypt + proxy Braspress via fetch)
  preload.ts (expose window.api)
```

## API Braspress
- Cotação: `POST /v1/cotacao/calcular/json` (payload conforme doc, cubagem em metros)
- Tracking v3: `GET /v3/tracking/byNf/{cnpj}/{notaFiscal}/json` e `byNumPedido/{cnpj}/{numPedido}/json`
- Auth: `Authorization: Basic base64(usuario:senha)` - montado após resolver senha via IPC
- Proxy: Electron `main` faz `fetch` direto (sem CORS), frontend chama `window.api.callCotacao/callTracking`

## Build
```bash
npm run build              # Vite build (dist/)
npx tsc -p tsconfig.electron.json  # Electron main -> dist-electron/
npm run electron           # rodar Electron com dist/
npm run electron:build     # gerar instalador (electron-builder)
```

## Notas
- Electron exigido: sem Rust (Tauri) por limitação do ambiente. Pivotado de Tauri para Electron mantendo segurança (SECRET_KEY isolado).
- Tema claro/escuro persiste em `localStorage`.
- Histórico de requisições pode ser adicionado (drawer).
