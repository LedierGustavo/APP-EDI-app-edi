# Plano: APP EDI Desktop - Tauri v2 + Supabase + API Braspress v3

**Data:** 2026-10-09
**Workspace:** `C:/Users/ledie/OneDrive/Documentos/APP-EDI`
**Status:** Aprovado - Em execução

## 1. Contexto e Objetivo
App desktop moderno **APP EDI** (sem menção Braspress por regra da empresa) para testar API Braspress em produção. Tela inicial puxa `usuario/senha` do Supabase (`public.credenciais`, 700+ linhas, mix texto puro / AES-256-GCM criptografado). Escopo: Cotação + Tracking v3 (byNf e byNumPedido). Temas claro/escuro.

Documentação base: https://api.braspress.com/home
- Auth: `Authorization: Basic base64(user:pass)`
- Cotação: `POST https://api.braspress.com/v1/cotacao/calcular/{json|xml}` com body JSON (cnpjRemetente, cnpjDestinatario, modal R/A, tipoFrete 1/2/3, cepOrigem/Destino, vlrMercadoria, peso, volumes, cubagem[])
- Tracking v3: `GET /v3/tracking/byNf/{cnpj}/{notaFiscal}/{json}` e `GET /v3/tracking/byNumPedido/{cnpj}/{numPedido}/{json}`

## 2. Decisões Aprovadas
- **Plataforma:** Desktop Tauri v2 (Recomendado vs Electron) - leve (~5-10MB), sem CORS via Rust
- **Stack:** Tauri v2 + Vite + React 19 + TypeScript + Tailwind + shadcn/ui + Zustand + TanStack Query + Zod + React Hook Form + `@supabase/supabase-js`
- **Ambiente:** Só produção
- **Credenciais:** Supabase `public.credenciais (id serial pk, usuario text unique, senha text, criado_em timestamptz)` - 700 linhas paginadas, combobox pesquisável
- **Criptografia:** AES-256-GCM padrão com `SECRET_KEY`, heurística fallback para texto puro se decrypt falhar
- **Segurança:** `anon key` no frontend (RLS SELECT), `SECRET_KEY` e `service_role` NUNCA no bundle JS - apenas em Rust via `invoke`
- **Branding:** APP EDI, `com.appedi.desktop`, tema light/dark/system

## 3. Arquitetura
```
Frontend (React) --supabase-js(anon)--> Supabase (RLS)
Frontend --invoke("resolve_senha")--> Rust (SECRET_KEY, AES-GCM) --> plain em memória
Frontend --invoke("call_cotacao/tracking")--> Rust reqwest --> api.braspress.com
```

**Estrutura:**
```
APP-EDI/
  src/
    lib/supabase.ts
    lib/braspress.ts (tipos)
    lib/validators.ts
    features/auth/credentialsService.ts, useCredentials.ts
    features/cotacao/CotacaoPage.tsx, CubagemField.tsx
    features/tracking/TrackingV3Page.tsx, Timeline.tsx
    components/ui/*, ThemeToggle.tsx, layout/
  src-tauri/
    src/commands/credentials.rs (decrypt híbrido)
    src/commands/braspress.rs (proxy)
    tauri.conf.json (APP EDI, 1180x760)
  .env.example
```

**RLS:**
```sql
alter table public.credenciais enable row level security;
create policy "app_edi_anon_select" on public.credenciais for select to anon using (true);
```

**Env:**
```
VITE_SUPABASE_URL=https://ynunxrvepaokkafxhzda.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ... (anon)
# SECRET_KEY apenas em src-tauri/.env
```

## 4. UI/UX
- **Conexão:** Combobox 700 usuários paginado + search ilike + Testar Conexão
- **Cotação:** Form 2 colunas + cubagem dinâmica + preview JSON + cURL + Result Cards (id/prazo/totalFrete)
- **Tracking v3:** Abas byNf/byNumPedido + tabela conhecimentos + timeline + ocorrências + notasFiscais
- **Histórico:** Drawer 50 últimas chamadas

## 5. Fases
1. Setup Tauri+React+Tailwind+shadcn+Theme (0.5d)
2. Supabase anon + combobox + decrypt Rust (1d)
3. Cotação + proxy (1.5d)
4. Tracking v3 (1d)
5. Polimento + build .msi/.exe + README (1d)

## 6. Credenciais Fornecidas (não versionar)
- SUPABASE_URL: https://ynunxrvepaokkafxhzda.supabase.co
- SUPABASE anon key: eyJ... (role=anon)
- service_role descartado do app
- SECRET_KEY: apenas em Rust backend

## 7. Próximos Passos
- [ ] Inicializar projeto
- [ ] Implementar conforme fases
- [ ] Build e entrega
