-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · MVP 2 — o contacto de cada passageiro (MIN-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Telefone e email são campos novos no contrato de dados", marcados como só
-- para apoio operacional: existem para que a equipa do parceiro chegue ao
-- viajante durante uma perturbação, e para que o viajante chegue à equipa.
-- Não vão para a companhia nem para o bilhete.
--
-- Opcionais: o link de um cliente particular continua sem os pedir.
--
-- O índice serve o "reutilizar os dados" do MIN-03: dentro de um ministério,
-- um nome que coincide com um viajante anterior. A procura é por caso, e o
-- caso já diz o ministério (`booking_cases.organisation_id`, 0020).
--
-- Depende da 0009 e da 0020. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0029_mvp2_passenger_contacts.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.case_passengers
  add column if not exists phone  text,
  add column if not exists email  text;

alter table public.case_passengers
  drop constraint if exists case_passengers_email_check;
alter table public.case_passengers
  add constraint case_passengers_email_check
  check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$');

create index if not exists case_passengers_name_idx
  on public.case_passengers (lower(last_name), lower(first_name));

commit;
