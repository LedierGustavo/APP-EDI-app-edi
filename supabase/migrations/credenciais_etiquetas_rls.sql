-- RLS para credenciais_etiquetas
-- Rodar no SQL Editor do Supabase

alter table public.credenciais_etiquetas enable row level security;

create policy "anon_select_credenciais_etiquetas"
  on public.credenciais_etiquetas for select
  to anon
  using (true);

create policy "anon_insert_credenciais_etiquetas"
  on public.credenciais_etiquetas for insert
  to anon
  with check (true);

create policy "anon_update_credenciais_etiquetas"
  on public.credenciais_etiquetas for update
  to anon
  using (true)
  with check (true);
