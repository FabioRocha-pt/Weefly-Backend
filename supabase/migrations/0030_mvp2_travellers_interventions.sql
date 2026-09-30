-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · MVP 2 — fichas dos passageiros (DAT-01, DAT-02) e intervenção do
-- Admin num parceiro (ADM-04)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DAT-01 · "As fichas pertencem ao ministério, não ao caso. Reutilizáveis num
-- pedido novo, com os dados pré-preenchidos e a confirmar. Editáveis, com
-- histórico de alterações."
--
--   `ministry_travellers` é a ficha. Nasce (ou actualiza-se) quando a
--   secretária grava os passageiros de um caso, e edita-se no backoffice do
--   parceiro. O passageiro do caso (`case_passengers`) continua a ser o que
--   foi para o bilhete — a ficha é o que o ministério sabe da pessoa hoje.
--
--   O histórico é escrito por trigger, e não pela aplicação: qualquer
--   caminho que mude a ficha deixa rasto, com o antes e o depois. Só se
--   acrescenta.
--
-- DAT-02 · o aviso de passaporte a expirar (seis meses) sai uma vez por
-- validade: `expiry_alerted_for` guarda a validade que já foi avisada. Um
-- passaporte renovado tem outra validade, e volta a poder ser avisado.
--
-- ADM-04 · "Só leitura por defeito. Intervir exige uma ação explícita, que
-- fica registada." `admin_interventions` é esse registo: quem, em que caso,
-- porquê, e até quando. Enquanto estiver válida, o Admin WeeFly trabalha o
-- caso como se fosse do parceiro dele. Só o Admin WeeFly lê a tabela; nunca
-- uma conta de parceiro.
--
-- ⚠ DAT-03 (conservação, base legal) continua à espera de L1–L3: nada aqui
-- apaga ou anonimiza.
--
-- Depende da 0020, 0026, 0028 e 0029. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0030_mvp2_travellers_interventions.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · A ficha do viajante (DAT-01)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.ministry_travellers (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations (id) on delete cascade,
  partner_id         uuid not null references public.partners (id) on delete cascade,
  title              text check (title is null or title in ('mr', 'mrs', 'ms')),
  first_name         text not null,
  last_name          text not null,
  gender             text check (gender is null or gender in ('m', 'f', 'x')),
  birth_date         date,
  nationality        text,
  passport_number    text,
  passport_expiry    date,
  issuing_country    text,
  -- MIN-03 · só para apoio operacional.
  phone              text,
  email              text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  -- De onde veio a última alteração, e quem — lidos pelo trigger do histórico.
  last_source        text not null default 'case' check (last_source in ('case', 'backoffice', 'import')),
  last_case_id       uuid references public.booking_cases (id) on delete set null,
  updated_by_email   text,
  -- DAT-02
  expiry_alerted_for date,
  expiry_alerted_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists ministry_travellers_passport_key
  on public.ministry_travellers (organisation_id, upper(passport_number))
  where passport_number is not null;
create index if not exists ministry_travellers_name_idx
  on public.ministry_travellers (organisation_id, lower(last_name), lower(first_name));
create index if not exists ministry_travellers_expiry_idx
  on public.ministry_travellers (passport_expiry)
  where passport_expiry is not null;

-- O parceiro da ficha é o do ministério — nunca o que a aplicação disser.
create or replace function public.ministry_travellers_partner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select partner_id into new.partner_id from public.organisations where id = new.organisation_id;
  if new.partner_id is null then
    raise exception 'ministério desconhecido' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ministry_travellers_partner on public.ministry_travellers;
create trigger ministry_travellers_partner
  before insert or update on public.ministry_travellers
  for each row execute function public.ministry_travellers_partner();

-- ── O histórico ────────────────────────────────────────────────────────────

create table if not exists public.ministry_traveller_changes (
  id               uuid primary key default gen_random_uuid(),
  traveller_id     uuid not null references public.ministry_travellers (id) on delete cascade,
  organisation_id  uuid not null,
  partner_id       uuid not null,
  source           text not null,
  case_id          uuid,
  changed_by_email text,
  before           jsonb,
  after            jsonb not null,
  created_at       timestamptz not null default now()
);

create index if not exists ministry_traveller_changes_idx
  on public.ministry_traveller_changes (traveller_id, created_at desc);

create or replace function public.ministry_traveller_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  -- O que conta como "os dados": o resto é contabilidade da própria linha.
  v_skip   text[] := array['id', 'organisation_id', 'partner_id', 'last_source', 'last_case_id',
                           'updated_by_email', 'expiry_alerted_for', 'expiry_alerted_at',
                           'created_at', 'updated_at'];
begin
  v_after := to_jsonb(new) - v_skip;
  if tg_op = 'UPDATE' then
    v_before := to_jsonb(old) - v_skip;
    if v_before = v_after then return new; end if;
  end if;
  insert into public.ministry_traveller_changes
    (traveller_id, organisation_id, partner_id, source, case_id, changed_by_email, before, after)
  values
    (new.id, new.organisation_id, new.partner_id, new.last_source, new.last_case_id, new.updated_by_email, v_before, v_after);
  return new;
end $$;

drop trigger if exists ministry_traveller_log on public.ministry_travellers;
create trigger ministry_traveller_log
  after insert or update on public.ministry_travellers
  for each row execute function public.ministry_traveller_log();

-- Só se acrescenta.
create or replace function public.ministry_traveller_changes_frozen()
returns trigger
language plpgsql
as $$
begin
  raise exception 'o histórico das fichas não se altera' using errcode = 'check_violation';
end $$;

drop trigger if exists ministry_traveller_changes_frozen on public.ministry_traveller_changes;
create trigger ministry_traveller_changes_frozen
  before update or delete on public.ministry_traveller_changes
  for each row execute function public.ministry_traveller_changes_frozen();

-- ── RLS: lê quem vê o parceiro; escreve o servidor ─────────────────────────
--
-- As escritas passam pelas server actions, pela service role, depois de o
-- servidor confirmar que o ministério está na área da sessão — como a bolsa.

alter table public.ministry_travellers enable row level security;
alter table public.ministry_traveller_changes enable row level security;

drop policy if exists ministry_travellers_read on public.ministry_travellers;
create policy ministry_travellers_read on public.ministry_travellers
  for select to authenticated
  using (public.can_see_partner(partner_id));

drop policy if exists ministry_traveller_changes_read on public.ministry_traveller_changes;
create policy ministry_traveller_changes_read on public.ministry_traveller_changes
  for select to authenticated
  using (public.can_see_partner(partner_id));

-- ── As fichas que já existem nos casos ─────────────────────────────────────
--
-- Uma por passaporte e ministério, a do caso mais recente. Os passageiros sem
-- número de passaporte ficam de fora: não há como saber se são a mesma pessoa.

insert into public.ministry_travellers
  (organisation_id, partner_id, title, first_name, last_name, gender, birth_date, nationality,
   passport_number, passport_expiry, issuing_country, phone, email, last_source, last_case_id, updated_by_email)
select distinct on (bc.organisation_id, upper(cp.passport_number))
  bc.organisation_id, bc.partner_id, cp.title, cp.first_name, cp.last_name, cp.gender, cp.birth_date,
  cp.nationality, upper(cp.passport_number), cp.passport_expiry, cp.issuing_country, cp.phone, cp.email,
  'import', bc.id, null
from public.case_passengers cp
join public.booking_cases bc on bc.id = cp.case_id
where bc.organisation_id is not null
  and cp.passport_number is not null
  and trim(cp.passport_number) <> ''
order by bc.organisation_id, upper(cp.passport_number), cp.updated_at desc
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · A intervenção do Admin WeeFly (ADM-04)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.admin_interventions (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.booking_cases (id) on delete cascade,
  partner_id  uuid not null references public.partners (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text not null,
  reason      text not null check (length(trim(reason)) >= 3),
  expires_at  timestamptz not null,
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists admin_interventions_live_idx
  on public.admin_interventions (user_id, case_id, expires_at desc);

alter table public.admin_interventions enable row level security;

drop policy if exists admin_interventions_read on public.admin_interventions;
create policy admin_interventions_read on public.admin_interventions
  for select to authenticated
  using ((select public.is_cross_partner()));

commit;

notify pgrst, 'reload schema';
