-- ============================================================================
-- LOCKDOWN DE CREDENCIAIS (P0 - Segurança)
-- Objetivo: impedir que a role `anon` (chave pública embarcada no app) leia ou
-- escreva credenciais. Todo acesso sensível passa a ser feito pelo main process
-- do Electron usando a `service_role` (bypass de RLS), e a senha nunca sai do
-- main em texto puro por canais públicos.
--
-- Rodar no SQL Editor do Supabase (ou `supabase db push`).
-- Depois de aplicar, valide:
--   curl "<URL>/rest/v1/credenciais?select=senha" -H "apikey: <ANON_KEY>" \
--        -H "Authorization: Bearer <ANON_KEY>"
--   -> deve retornar 401 / permission denied / [] (RLS bloqueando).
-- ============================================================================

-- 1) Remover policies anon abertas criadas anteriormente
drop policy if exists "anon_select_credenciais_etiquetas" on public.credenciais_etiquetas;
drop policy if exists "anon_insert_credenciais_etiquetas" on public.credenciais_etiquetas;
drop policy if exists "anon_update_credenciais_etiquetas" on public.credenciais_etiquetas;

-- 2) Garantir RLS habilitado em TODAS as tabelas sensíveis
alter table public.credenciais           enable row level security;
alter table public.credenciais_etiquetas enable row level security;
alter table public.credenciais_soap      enable row level security;
alter table public.cliente_cache         enable row level security;

-- 3) Revogar privilégios diretos da role anon/authenticated.
--    Sem policy e sem GRANT, o PostgREST nega por padrão (deny by default).
revoke all on public.credenciais           from anon, authenticated;
revoke all on public.credenciais_etiquetas from anon, authenticated;
revoke all on public.credenciais_soap      from anon, authenticated;
revoke all on public.cliente_cache         from anon, authenticated;

-- 4) Nenhuma policy criada de propósito: apenas a `service_role`
--    (que faz bypass de RLS) consegue ler/escrever. O app desktop usa
--    SUPABASE_SERVICE_ROLE_KEY, isolada via safeStorage no main process.
--
-- OBS: se, no futuro, um modo web puro for necessário, exponha SOMENTE uma
-- view sem colunas sensíveis, por exemplo:
--
--   create view public.credenciais_publicas as
--     select cnpj, codigo_cliente from public.credenciais_etiquetas;
--   grant select on public.credenciais_publicas to anon;
--   alter view public.credenciais_publicas set (security_invoker = on);
--
-- Nunca exponha as colunas `senha` / `token`.
