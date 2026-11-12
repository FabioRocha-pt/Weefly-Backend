-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · a língua do cliente passa a aceitar neerlandês
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O terminal público, os emails ao cliente e o PDF do bilhete saem em quatro
-- línguas: português, inglês, francês e neerlandês (especificação do MVP2, e
-- pedido do Ivandro em Novembro: os parceiros emitem para clientes nessas
-- línguas). A `0008` só deixava guardar as três primeiras no lead.
--
-- Só alarga a restrição: nenhuma linha existente muda.
--
-- APLICAR ANTES DO DEPLOY. Sem ela, um pedido feito em neerlandês falha ao
-- gravar o lead (a restrição antiga recusa 'nl').
--
-- Não toca na língua do back-office (`partners.default_locale`, 0041): esse
-- continua em português, inglês e francês.
--
-- Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0042_lead_locale_nl.sql

begin;

alter table public.leads
  drop constraint if exists leads_locale_check;
alter table public.leads
  add constraint leads_locale_check check (locale in ('pt', 'en', 'fr', 'nl'));

commit;

notify pgrst, 'reload schema';
