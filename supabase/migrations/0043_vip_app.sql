-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · Fechar o VIP — a app VIP (APP-01 a APP-05, VIP-01) e o E2
-- ═══════════════════════════════════════════════════════════════════════════
--
-- VIP-01 · "`/pc/<nome>-<código>`. O código não muda quando o nome é editado."
--   · `vip_clients.code` · o código curto do endereço novo. Oito caracteres de
--     um alfabeto sem letras que se confundem (sem i, l, o, 0, 1): cerca de
--     40 bits. É curto para se ler num link e comprido para não se adivinhar
--     — o link abre dados de passaporte (APP-04), e quatro caracteres
--     percorrem-se numa tarde. Distingue-se do token de um pedido (32
--     caracteres) pelo tamanho. Gerado pela base, único, e imutável (o
--     gatilho `vip_clients_guard` passa a recusá-lo também).
--   · O `link_token` fica: os links `/vip/<token>` já enviados resolvem por
--     ele e redireccionam para o endereço novo.
--
-- APP-04 · "Meus dados": o cliente altera os seus dados, e eles preenchem a
-- passagem (decisão D-A).
--   · As colunas do perfil em `vip_clients`: a língua da app, e os dados da
--     passagem (como em `case_passengers`). `passport_consent_at` é o
--     consentimento do próprio cliente, marcado ao guardá-los.
--   · `vip_client_changes` · "Cada alteração fica registada, com a data, e
--     aparece ao agente na ficha do cliente." Uma linha por gravação, com os
--     campos que mudaram. Os valores de contacto vão por extenso (é o agente
--     da empresa do cliente que os lê); o número do passaporte vai mascarado.
--     Leitura pelo RLS, como `vip_clients`; escrita só pela service role.
--
-- E2 · "Pedir as instruções e declarar que pagou são duas ações separadas."
--   · `case_payments.pay_details_requested_at` · quando o cliente pediu as
--     instruções da via escolhida. Não mexe em `proof_status` nem em
--     `client_declared_paid_at`: o caso continua à espera de pagamento.
--   · O caso WF-2611-0094 (teste de 19 de novembro) ficou com uma declaração
--     de pagamento que ninguém fez; a limpeza está em
--     `scripts/cleanup/vip-teste-2026-11-19.sql`, à parte desta migração.
--
-- Depende da 0033. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0043_vip_app.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── VIP-01 · o código curto ─────────────────────────────────────────────────

create or replace function public.vip_mint_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
  i int;
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end;
$$;

alter table public.vip_clients
  add column if not exists code text;

-- Os VIP que já existem ganham o seu código (um a um: a função é volátil).
do $$
declare
  r record;
  candidate text;
begin
  for r in select id from public.vip_clients where code is null loop
    loop
      candidate := public.vip_mint_code();
      exit when not exists (select 1 from public.vip_clients where code = candidate);
    end loop;
    -- O gatilho de guarda só olha para a empresa e para o link: passa.
    update public.vip_clients set code = candidate where id = r.id;
  end loop;
end;
$$;

alter table public.vip_clients
  alter column code set default public.vip_mint_code(),
  alter column code set not null;

alter table public.vip_clients
  drop constraint if exists vip_clients_code_check;
alter table public.vip_clients
  add constraint vip_clients_code_check check (code ~ '^[a-z0-9]{6,16}$');

create unique index if not exists vip_clients_code_key on public.vip_clients (code);

-- ── APP-04 · os dados do cliente ────────────────────────────────────────────

alter table public.vip_clients
  add column if not exists locale              text,
  add column if not exists title               text,
  add column if not exists given_names         text,
  add column if not exists surname             text,
  add column if not exists birth_date          date,
  add column if not exists gender              text,
  add column if not exists nationality         text,
  add column if not exists passport_number     text,
  add column if not exists passport_expiry     date,
  add column if not exists issuing_country     text,
  add column if not exists passport_consent_at timestamptz,
  add column if not exists profile_updated_at  timestamptz;

alter table public.vip_clients
  drop constraint if exists vip_clients_locale_check,
  drop constraint if exists vip_clients_title_check,
  drop constraint if exists vip_clients_gender_check,
  drop constraint if exists vip_clients_passport_check;
alter table public.vip_clients
  add constraint vip_clients_locale_check check (locale is null or locale in ('pt', 'en', 'fr', 'nl')),
  add constraint vip_clients_title_check  check (title is null or title in ('mr', 'mrs', 'ms')),
  add constraint vip_clients_gender_check check (gender is null or gender in ('m', 'f')),
  add constraint vip_clients_passport_check
    check (passport_number is null or passport_number ~ '^[A-Za-z0-9]{5,12}$');

comment on column public.vip_clients.code is
  'VIP-01 · o código curto do endereço /pc/<nome>-<código>. Gerado pela base, único, imutável.';
comment on column public.vip_clients.passport_consent_at is
  'APP-04 · o consentimento do próprio cliente para guardar os dados do passaporte.';

/*
 * O que não muda depois de criado: a empresa, o link antigo e, agora, o
 * código. O nome pode mudar — o endereço resolve pelo código.
 */
create or replace function public.vip_clients_guard()
returns trigger
language plpgsql
as $$
begin
  if new.partner_id <> old.partner_id then
    raise exception 'um cliente VIP não muda de empresa' using errcode = 'check_violation';
  end if;
  if new.link_token <> old.link_token then
    raise exception 'o link de um cliente VIP é permanente' using errcode = 'check_violation';
  end if;
  if old.code is not null and new.code is distinct from old.code then
    raise exception 'o código de um cliente VIP é permanente' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ── APP-04 · o registo das alterações ───────────────────────────────────────

create table if not exists public.vip_client_changes (
  id             uuid primary key default gen_random_uuid(),
  vip_client_id  uuid not null,
  partner_id     uuid not null,
  -- Quem alterou: o próprio cliente, na app, ou um agente no back-office.
  actor_kind     text not null default 'client',
  actor_email    text,
  -- De onde: 'profile' (Meus dados) ou 'request' (guardado a partir de um pedido).
  source         text not null default 'profile',
  case_id        uuid references public.booking_cases (id) on delete set null,
  -- Os campos que mudaram, e o antes e o depois de cada um.
  fields         text[] not null,
  before         jsonb not null default '{}'::jsonb,
  after          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint vip_client_changes_actor_check  check (actor_kind in ('client', 'staff')),
  constraint vip_client_changes_source_check check (source in ('profile', 'request', 'backoffice')),
  constraint vip_client_changes_vip_fk
    foreign key (vip_client_id, partner_id)
    references public.vip_clients (id, partner_id)
    on delete cascade
);

create index if not exists vip_client_changes_vip_idx
  on public.vip_client_changes (vip_client_id, created_at desc);

comment on table public.vip_client_changes is
  'APP-04 · cada alteração aos dados de um cliente VIP, com a data. Aparece ao agente na ficha do cliente.';

alter table public.vip_client_changes enable row level security;

drop policy if exists vip_client_changes_select on public.vip_client_changes;
create policy vip_client_changes_select on public.vip_client_changes
  for select to authenticated
  using (public.can_see_partner(partner_id) and public.is_bo_allowed());

revoke insert, update, delete on public.vip_client_changes from anon, authenticated;

-- ── E2 · pedir as instruções não é declarar que pagou ───────────────────────

alter table public.case_payments
  add column if not exists pay_details_requested_at timestamptz;

comment on column public.case_payments.pay_details_requested_at is
  'E2 · quando o cliente pediu as instruções da via escolhida. Não é uma declaração de pagamento.';

commit;

notify pgrst, 'reload schema';
