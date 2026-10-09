-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · B2G v2 — o pedido do ministério e o espaço da secretária
-- (B2G-09, B2G-10, B2G-08, B2G-24)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B2G-09 · D-6 · a urgência do pedido: 0 Normal, 1 Urgente, 2 Muito urgente.
--   Escolhida pela secretária (Normal por omissão) e alterável pelo agente
--   (bloco 5): `urgency_changed_at` / `urgency_changed_by_email` guardam a
--   última mudança; o histórico completo vai para o `case_events`.
--   Índice para a fila por canal ordenada por urgência e depois espera (B2G-11).
--
-- B2G-09 · D-7 · o pedido guarda só o número de pessoas (como adultos), de 1
--   a 50. A coluna `trip_requests.adults` aceitava 1–9 (o limite de uma
--   reserva de companhia); passa a 1–50. O formulário público continua a
--   limitar a 9 no servidor (`actions/pc.ts`).
--
-- B2G-08 · o registo de actividade diz quem fez o quê: `case_events.actor_kind`
--   aceita `secretary`, com `actor_secretary_id` — uma secretária do
--   ministério do caso (gatilho), e só com esse `actor_kind`.
--
-- B2G-25 · a ficha do viajante e o histórico dela guardam a secretária que a
--   criou ou mudou (`created_by_secretary_id`, `updated_by_secretary_id`,
--   `changed_by_secretary_id`), sempre do mesmo ministério (chave composta).
--
-- Depende da 0009, 0030, 0032 e 0034. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0035_b2g_requests.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── B2G-09 · a urgência ─────────────────────────────────────────────────────

alter table public.booking_cases
  add column if not exists urgency                  smallint not null default 0,
  add column if not exists urgency_changed_at       timestamptz,
  add column if not exists urgency_changed_by_email text;

alter table public.booking_cases
  drop constraint if exists booking_cases_urgency_check;
alter table public.booking_cases
  add constraint booking_cases_urgency_check check (urgency between 0 and 2);

comment on column public.booking_cases.urgency is
  'B2G-09 · D-6 · 0 Normal, 1 Urgente, 2 Muito urgente. Escolhida pela secretária; alterável pelo agente.';

-- B2G-11 · a fila de um canal: abertos primeiro, mais urgentes, mais antigos.
create index if not exists booking_cases_queue_urgency_idx
  on public.booking_cases (partner_id, channel, closed_at, urgency desc, created_at);

-- ── B2G-09 · D-7 · até 50 pessoas num pedido ────────────────────────────────

alter table public.trip_requests
  drop constraint if exists trip_requests_adults_check;
alter table public.trip_requests
  add constraint trip_requests_adults_check check (adults between 1 and 50);

-- ── B2G-08 · a secretária no registo do caso ────────────────────────────────

alter table public.case_events
  add column if not exists actor_secretary_id uuid
    references public.ministry_secretaries (id) on delete restrict;

alter table public.case_events
  drop constraint if exists case_events_actor_kind_check;
alter table public.case_events
  add constraint case_events_actor_kind_check
  check (actor_kind in ('client', 'staff', 'system', 'secretary'));

-- Uma secretária no registo é sempre `secretary`, e `secretary` diz sempre qual.
alter table public.case_events
  drop constraint if exists case_events_secretary_actor_check;
alter table public.case_events
  add constraint case_events_secretary_actor_check
  check ((actor_kind = 'secretary') = (actor_secretary_id is not null));

create index if not exists case_events_secretary_idx
  on public.case_events (actor_secretary_id) where actor_secretary_id is not null;

-- A secretária do acontecimento é do ministério do caso.
create or replace function public.case_events_secretary_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_secretary_id is null then return new; end if;
  if not exists (
    select 1
      from public.booking_cases bc
      join public.ministry_secretaries s on s.organisation_id = bc.organisation_id
     where bc.id = new.case_id
       and s.id = new.actor_secretary_id
  ) then
    raise exception 'a secretária não é do ministério deste caso' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists case_events_secretary_scope on public.case_events;
create trigger case_events_secretary_scope
  before insert or update of actor_secretary_id, case_id on public.case_events
  for each row execute function public.case_events_secretary_scope();

-- ── B2G-25 · quem registou e quem mudou a ficha do viajante ─────────────────

alter table public.ministry_travellers
  add column if not exists created_by_secretary_id uuid,
  add column if not exists updated_by_secretary_id uuid;

alter table public.ministry_travellers
  drop constraint if exists ministry_travellers_created_by_secretary_fk;
alter table public.ministry_travellers
  add constraint ministry_travellers_created_by_secretary_fk
    foreign key (created_by_secretary_id, organisation_id)
    references public.ministry_secretaries (id, organisation_id)
    on delete restrict;

alter table public.ministry_travellers
  drop constraint if exists ministry_travellers_updated_by_secretary_fk;
alter table public.ministry_travellers
  add constraint ministry_travellers_updated_by_secretary_fk
    foreign key (updated_by_secretary_id, organisation_id)
    references public.ministry_secretaries (id, organisation_id)
    on delete restrict;

alter table public.ministry_traveller_changes
  add column if not exists changed_by_secretary_id uuid;

alter table public.ministry_traveller_changes
  drop constraint if exists ministry_traveller_changes_secretary_fk;
alter table public.ministry_traveller_changes
  add constraint ministry_traveller_changes_secretary_fk
    foreign key (changed_by_secretary_id, organisation_id)
    references public.ministry_secretaries (id, organisation_id)
    on delete restrict;

-- A autora não muda depois de a ficha nascer. Uma alteração do back-office
-- nunca fica em nome de uma secretária (a da última alteração dela não passa
-- para a seguinte).
create or replace function public.ministry_travellers_keep_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by_secretary_id := old.created_by_secretary_id;
  end if;
  if new.last_source = 'backoffice' then
    new.updated_by_secretary_id := null;
  end if;
  return new;
end $$;

drop trigger if exists ministry_travellers_keep_author on public.ministry_travellers;
create trigger ministry_travellers_keep_author
  before insert or update on public.ministry_travellers
  for each row execute function public.ministry_travellers_keep_author();

-- O histórico passa a dizer também a secretária (as colunas novas não contam
-- como "os dados" da ficha).
create or replace function public.ministry_traveller_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_skip   text[] := array['id', 'organisation_id', 'partner_id', 'last_source', 'last_case_id',
                           'updated_by_email', 'expiry_alerted_for', 'expiry_alerted_at',
                           'created_at', 'updated_at',
                           'created_by_secretary_id', 'updated_by_secretary_id'];
begin
  v_after := to_jsonb(new) - v_skip;
  if tg_op = 'UPDATE' then
    v_before := to_jsonb(old) - v_skip;
    if v_before = v_after then return new; end if;
  end if;
  insert into public.ministry_traveller_changes
    (traveller_id, organisation_id, partner_id, source, case_id, changed_by_email, changed_by_secretary_id, before, after)
  values
    (new.id, new.organisation_id, new.partner_id, new.last_source, new.last_case_id, new.updated_by_email,
     coalesce(new.updated_by_secretary_id, case when tg_op = 'INSERT' then new.created_by_secretary_id end),
     v_before, v_after);
  return new;
end $$;

commit;

notify pgrst, 'reload schema';
