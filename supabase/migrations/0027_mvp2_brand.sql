-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · MVP 2 — a marca da WeeFly nos dados (TEN-02) e um cliente por
-- parceiro (TEN-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Nenhuma cor escrita no código; todas lidas de tokens preenchidos na
-- renderização." A marca de um ecrã vem da linha do parceiro (`lib/brand.ts`),
-- e a WeeFly também é um parceiro: as cores dela passam a estar aqui, com os
-- mesmos valores que a folha do /pc já usa. Só preenche o que está vazio —
-- quem já tiver escrito outra cor no ecrã do ADM-01 não a perde.
--
-- Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0027_mvp2_brand.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

update public.partners
   set color_primary    = coalesce(color_primary, '#EE5128'),
       color_dark       = coalesce(color_dark, '#CE3F19'),
       changed_by_email = 'migração 0027'
 where is_operator
   and (color_primary is null or color_dark is null);

-- ── TEN-03 · um cliente é por parceiro ──────────────────────────────────────
--
-- O índice da 0002 fazia o email único em toda a base. Um cliente da WeeFly que
-- pedisse uma viagem pelo link do Alô ficava ligado ao lead da WeeFly — e o
-- RLS do Alô não vê leads da WeeFly, pelo que o caso nascia invisível na fila
-- dele. O mesmo email passa a poder existir uma vez por parceiro.

drop index if exists public.leads_email_key;
create unique index if not exists leads_partner_email_key
  on public.leads (partner_id, lower(email));

commit;

notify pgrst, 'reload schema';
