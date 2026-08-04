-- =============================================================================
-- WeeFly Concierge — SETUP COMPLETO (colar no SQL Editor do Supabase)
--
-- Junta as migrações 0002 + 0003 pela ordem correta e concede acesso ao
-- back-office no fim. Pode ser corrido mais do que uma vez sem estragar nada:
-- cada `create policy` leva um `drop policy if exists` antes, porque ao
-- contrário de `create table`, o Postgres não tem `create policy if not exists`.
--
-- Este ficheiro é uma conveniência para o arranque — as migrações 0002 e 0003
-- continuam a ser a fonte da verdade para deploys futuros.
-- =============================================================================


-- =============================================================================
-- PARTE 1 — Intake de pedidos + back-office (migração 0002)
-- =============================================================================

-- Equipa da plataforma --------------------------------------------------------
-- O acesso ao back-office é pertença explícita, não um padrão de email.

create table if not exists public.platform_staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'manager' check (role in ('manager', 'admin')),
  created_at timestamptz not null default now()
);

/*
 * SECURITY DEFINER para a função poder ler platform_staff enquanto a política
 * RLS dessa mesma tabela a está a chamar — uma query normal aqui recorreria
 * infinitamente. O search_path é fixado para a função não poder ser sequestrada
 * por um schema malicioso.
 */
create or replace function public.is_platform_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.platform_staff where user_id = auth.uid()
  );
$$;

alter table public.platform_staff enable row level security;

drop policy if exists "Staff can read the staff list" on public.platform_staff;
create policy "Staff can read the staff list"
  on public.platform_staff for select
  to authenticated
  using (public.is_platform_staff());

-- Leads -----------------------------------------------------------------------

create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  title          text check (title in ('mr', 'ms')),
  full_name      text not null,
  email          text not null,
  phone_prefix   text,
  phone          text,
  source_channel text not null default 'browser'
                   check (source_channel in ('browser', 'whatsapp', 'chat', 'manual')),
  consent        boolean not null default false,
  consent_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Um lead por email: clientes recorrentes acumulam pedidos em vez de se
-- fragmentarem em contactos duplicados.
create unique index if not exists leads_email_key on public.leads (lower(email));

-- Pedidos de viagem -----------------------------------------------------------

-- Referência legível para conversas por telefone/email: WF-2608-0001
create sequence if not exists public.trip_request_ref_seq;

create table if not exists public.trip_requests (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads (id) on delete cascade,
  reference     text not null unique
                  default 'WF-' || to_char(now(), 'YYMM') || '-' ||
                          lpad(nextval('public.trip_request_ref_seq')::text, 4, '0'),
  status        text not null default 'novo'
                  check (status in ('novo', 'em_tratamento', 'proposta_enviada',
                                    'fechado', 'perdido')),
  trip_type     text not null check (trip_type in ('round_trip', 'one_way', 'multi_city')),
  origin        text not null,
  destination   text not null,
  depart_date   date not null,
  return_date   date,
  adults        integer not null default 1 check (adults between 1 and 9),
  children      integer not null default 0 check (children between 0 and 9),
  infants       integer not null default 0 check (infants between 0 and 9),
  cabin_class   text not null check (cabin_class in ('economy', 'business', 'first')),
  -- Resultado do envio dos dois emails transacionais, para o back-office poder
  -- mostrar "o cliente nunca recebeu confirmação" em vez de fingir que sim.
  email_sent    boolean not null default false,
  team_notified boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists trip_requests_lead_id_idx on public.trip_requests (lead_id);
create index if not exists trip_requests_status_idx on public.trip_requests (status);
create index if not exists trip_requests_created_at_idx on public.trip_requests (created_at desc);

-- Notas internas --------------------------------------------------------------

create table if not exists public.trip_request_notes (
  id              uuid primary key default gen_random_uuid(),
  trip_request_id uuid not null references public.trip_requests (id) on delete cascade,
  author_id       uuid references auth.users (id) on delete set null,
  author_email    text,
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now()
);

create index if not exists trip_request_notes_request_idx
  on public.trip_request_notes (trip_request_id, created_at desc);

-- Manutenção do updated_at ----------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
  before update on public.leads
  for each row execute function public.touch_updated_at();

drop trigger if exists trip_requests_touch_updated_at on public.trip_requests;
create trigger trip_requests_touch_updated_at
  before update on public.trip_requests
  for each row execute function public.touch_updated_at();

-- Row Level Security ----------------------------------------------------------
-- Repare na ausência de políticas de INSERT em leads/trip_requests: o formulário
-- público insere com a service role key, que ignora o RLS. Nada acessível a
-- partir do browser consegue escrever aqui.

alter table public.leads enable row level security;
alter table public.trip_requests enable row level security;
alter table public.trip_request_notes enable row level security;

drop policy if exists "Staff can read leads" on public.leads;
create policy "Staff can read leads"
  on public.leads for select
  to authenticated using (public.is_platform_staff());

drop policy if exists "Staff can update leads" on public.leads;
create policy "Staff can update leads"
  on public.leads for update
  to authenticated using (public.is_platform_staff())
  with check (public.is_platform_staff());

drop policy if exists "Staff can read trip requests" on public.trip_requests;
create policy "Staff can read trip requests"
  on public.trip_requests for select
  to authenticated using (public.is_platform_staff());

drop policy if exists "Staff can update trip requests" on public.trip_requests;
create policy "Staff can update trip requests"
  on public.trip_requests for update
  to authenticated using (public.is_platform_staff())
  with check (public.is_platform_staff());

drop policy if exists "Staff can read notes" on public.trip_request_notes;
create policy "Staff can read notes"
  on public.trip_request_notes for select
  to authenticated using (public.is_platform_staff());

drop policy if exists "Staff can write notes as themselves" on public.trip_request_notes;
create policy "Staff can write notes as themselves"
  on public.trip_request_notes for insert
  to authenticated
  with check (public.is_platform_staff() and author_id = auth.uid());


-- =============================================================================
-- PARTE 2 — Casos com token, o fluxo dos 3 links (migração 0003)
--
--   /p/{token}               → Link 1: pedido de viagem
--   /p/{token}/passageiros   → Link 2: passageiros + passaporte
--   /p/{token}/pagamento     → Link 3: pagamento WeePay
--
-- Nada avança automaticamente: cada etapa fica 'bloqueado' até o admin a
-- desbloquear, porque a pesquisa de tarifa e o acordo com o cliente acontecem
-- fora da plataforma (WhatsApp / telefone / email).
-- =============================================================================

-- Casos -----------------------------------------------------------------------

create table if not exists public.booking_cases (
  id              uuid primary key default gen_random_uuid(),
  -- Segredo URL-safe gerado na app (RNG criptográfico), não adivinhável.
  token           text not null unique,
  stage           text not null default 'novo'
                    check (stage in ('novo', 'pedido_recebido', 'detalhes_pendentes',
                                     'detalhes_recebidos', 'pagamento_pendente',
                                     'pago', 'emitido', 'cancelado')),
  -- Preenchido quando o Link 1 é submetido; antes disso o caso é anónimo.
  trip_request_id uuid references public.trip_requests (id) on delete set null,
  lead_id         uuid references public.leads (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists booking_cases_stage_idx on public.booking_cases (stage);
create index if not exists booking_cases_created_at_idx
  on public.booking_cases (created_at desc);

-- Estado por etapa ------------------------------------------------------------

create table if not exists public.case_links (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.booking_cases (id) on delete cascade,
  stage        smallint not null check (stage in (1, 2, 3)),
  status       text not null default 'bloqueado'
                 check (status in ('bloqueado', 'ativo', 'submetido', 'expirado')),
  unlocked_at  timestamptz,
  first_opened_at timestamptz,
  submitted_at timestamptz,
  expires_at   timestamptz,
  unique (case_id, stage)
);

create index if not exists case_links_case_idx on public.case_links (case_id);

-- Passageiros (Link 2) --------------------------------------------------------

create table if not exists public.case_passengers (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references public.booking_cases (id) on delete cascade,
  -- Posição estável para que uma re-submissão atualize em vez de duplicar.
  position         smallint not null,
  passenger_type   text not null check (passenger_type in ('adult', 'child', 'infant')),
  first_name       text not null,
  last_name        text not null,
  gender           text check (gender in ('m', 'f', 'x')),
  birth_date       date,
  nationality      text,
  passport_number  text,
  passport_expiry  date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (case_id, position)
);

-- Pagamentos (Link 3 — a costura com a WeePay) --------------------------------
-- Espelha o modelo de transação da WeePay (manual §8.1) para o adaptador poder
-- mapear um-para-um quando a integração entrar. O valor está em UNIDADES
-- MENORES (bigint), tal como o `amount BIGINT` da WeePay.

create table if not exists public.case_payments (
  id                     uuid primary key default gen_random_uuid(),
  case_id                uuid not null references public.booking_cases (id) on delete cascade,
  amount                 bigint not null check (amount > 0),
  currency               char(3) not null default 'CVE',
  description            text,
  status                 text not null default 'STARTED'
                           check (status in ('STARTED', 'PENDING', 'AUTHORIZED', 'CAPTURED',
                                             'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED',
                                             'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED')),
  -- Preenchidos pelo adaptador WeePay quando integrado. Até lá o pagamento fica
  -- em STARTED e o admin marca-o como pago à mão.
  weepay_transaction_id  text unique,
  payment_url            text,
  instrument_expires_at  timestamptz,
  idempotency_key        text unique,
  provider               text,
  paid_at                timestamptz,
  /* Preenchido quando um humano regista o pagamento recebido fora do gateway
     (transferência, numerário) — mantém o rasto de auditoria honesto. */
  marked_manually_by     uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists case_payments_case_idx on public.case_payments (case_id);

-- Manutenção do updated_at ----------------------------------------------------

drop trigger if exists booking_cases_touch on public.booking_cases;
create trigger booking_cases_touch before update on public.booking_cases
  for each row execute function public.touch_updated_at();

drop trigger if exists case_passengers_touch on public.case_passengers;
create trigger case_passengers_touch before update on public.case_passengers
  for each row execute function public.touch_updated_at();

drop trigger if exists case_payments_touch on public.case_payments;
create trigger case_payments_touch before update on public.case_payments
  for each row execute function public.touch_updated_at();

-- Cria as três linhas de link automaticamente com cada novo caso.
-- A etapa 1 nasce ativa (o admin acabou de a gerar para enviar);
-- as etapas 2 e 3 esperam por um desbloqueio explícito.
create or replace function public.seed_case_links()
returns trigger
language plpgsql
as $$
begin
  insert into public.case_links (case_id, stage, status, unlocked_at)
  values
    (new.id, 1, 'ativo', now()),
    (new.id, 2, 'bloqueado', null),
    (new.id, 3, 'bloqueado', null);
  return new;
end;
$$;

drop trigger if exists booking_cases_seed_links on public.booking_cases;
create trigger booking_cases_seed_links after insert on public.booking_cases
  for each row execute function public.seed_case_links();

-- Row Level Security ----------------------------------------------------------
-- Sem qualquer política para `anon`: as páginas públicas leem e escrevem pela
-- service role, e o token é a credencial. O RLS aqui serve apenas a equipa.

alter table public.booking_cases enable row level security;
alter table public.case_links enable row level security;
alter table public.case_passengers enable row level security;
alter table public.case_payments enable row level security;

drop policy if exists "Staff read cases" on public.booking_cases;
create policy "Staff read cases" on public.booking_cases
  for select to authenticated using (public.is_platform_staff());

drop policy if exists "Staff write cases" on public.booking_cases;
create policy "Staff write cases" on public.booking_cases
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

drop policy if exists "Staff read case links" on public.case_links;
create policy "Staff read case links" on public.case_links
  for select to authenticated using (public.is_platform_staff());

drop policy if exists "Staff write case links" on public.case_links;
create policy "Staff write case links" on public.case_links
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

drop policy if exists "Staff read passengers" on public.case_passengers;
create policy "Staff read passengers" on public.case_passengers
  for select to authenticated using (public.is_platform_staff());

drop policy if exists "Staff read payments" on public.case_payments;
create policy "Staff read payments" on public.case_payments
  for select to authenticated using (public.is_platform_staff());

drop policy if exists "Staff write payments" on public.case_payments;
create policy "Staff write payments" on public.case_payments
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());


-- =============================================================================
-- PARTE 3 — Acesso ao back-office
--
-- Requer que a conta já exista em auth.users, ou seja, que já tenhas feito
-- registo/login na app pelo menos uma vez. Se ainda não fizeste, corre as
-- Partes 1 e 2 agora, faz login, e volta a correr só esta parte.
-- =============================================================================

insert into public.platform_staff (user_id, email, role)
select id, email, 'admin' from auth.users where email = 'fapirocha@gmail.com'
on conflict (user_id) do nothing;

-- Recarrega a cache de schema do PostgREST ------------------------------------
notify pgrst, 'reload schema';

-- =============================================================================
-- VERIFICAÇÃO — corre isto a seguir; deve devolver 1 linha com o teu email.
-- Se devolver 0 linhas, ainda não fizeste login na app: faz login e volta a
-- correr o insert da Parte 3.
--
--   select * from public.platform_staff;
--
-- E as 7 tabelas devem aparecer aqui:
--
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('platform_staff','leads','trip_requests',
--                         'trip_request_notes','booking_cases','case_links',
--                         'case_passengers','case_payments')
--    order by table_name;
-- =============================================================================
