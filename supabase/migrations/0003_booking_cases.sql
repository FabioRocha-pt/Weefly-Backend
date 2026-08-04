-- WeeFly Concierge — token-based booking cases (the 3-link flow)
--
-- An admin creates a Case, which mints ONE token. All three client-facing
-- links hang off that token:
--
--   /p/{token}               → Link 1: travel request  (the existing form)
--   /p/{token}/passageiros   → Link 2: passenger + passport details
--   /p/{token}/pagamento     → Link 3: WeePay payment
--
-- Nothing advances automatically. Each stage stays 'bloqueado' until the admin
-- unlocks it, because the fare search and the client's agreement both happen
-- off-platform (WhatsApp / phone / email).
--
-- The public pages have no signed-in user: the token IS the credential, and
-- those pages read and write through the service-role client. Hence no anon
-- policy anywhere below — RLS here only serves signed-in platform staff.

-- Cases ---------------------------------------------------------------------

create table if not exists public.booking_cases (
  id              uuid primary key default gen_random_uuid(),
  -- URL-safe secret minted in the app (crypto RNG), not guessable.
  token           text not null unique,
  stage           text not null default 'novo'
                    check (stage in ('novo', 'pedido_recebido', 'detalhes_pendentes',
                                     'detalhes_recebidos', 'pagamento_pendente',
                                     'pago', 'emitido', 'cancelado')),
  -- Populated when Link 1 is submitted; before that the case is anonymous.
  trip_request_id uuid references public.trip_requests (id) on delete set null,
  lead_id         uuid references public.leads (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists booking_cases_stage_idx on public.booking_cases (stage);
create index if not exists booking_cases_created_at_idx
  on public.booking_cases (created_at desc);

-- Per-stage link state ------------------------------------------------------

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

-- Passengers (Link 2) -------------------------------------------------------

create table if not exists public.case_passengers (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references public.booking_cases (id) on delete cascade,
  -- Stable slot so a re-submission updates rather than duplicates.
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

-- Payments (Link 3 — WeePay seam) -------------------------------------------
-- Mirrors the WeePay transaction model (manual §8.1) so the adapter can map
-- one-to-one when the integration lands. Amount is in MINOR UNITS (bigint),
-- matching WeePay's `amount BIGINT`.

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
  -- Filled by the WeePay adapter once integrated. Until then the payment sits
  -- in STARTED and the admin can mark it paid by hand.
  weepay_transaction_id  text unique,
  payment_url            text,
  instrument_expires_at  timestamptz,
  idempotency_key        text unique,
  provider               text,
  paid_at                timestamptz,
  /* Set when a human marks the payment received out-of-band (bank transfer,
     cash) rather than through the gateway — keeps the audit trail honest. */
  marked_manually_by     uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists case_payments_case_idx on public.case_payments (case_id);

-- updated_at maintenance ----------------------------------------------------
-- touch_updated_at() is defined in 0002.

drop trigger if exists booking_cases_touch on public.booking_cases;
create trigger booking_cases_touch before update on public.booking_cases
  for each row execute function public.touch_updated_at();

drop trigger if exists case_passengers_touch on public.case_passengers;
create trigger case_passengers_touch before update on public.case_passengers
  for each row execute function public.touch_updated_at();

drop trigger if exists case_payments_touch on public.case_payments;
create trigger case_payments_touch before update on public.case_payments
  for each row execute function public.touch_updated_at();

-- Create the three link rows automatically with every new case.
-- Stage 1 is live immediately (the admin just generated it to send out);
-- stages 2 and 3 wait for an explicit unlock.
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

-- Row Level Security --------------------------------------------------------

alter table public.booking_cases enable row level security;
alter table public.case_links enable row level security;
alter table public.case_passengers enable row level security;
alter table public.case_payments enable row level security;

create policy "Staff read cases" on public.booking_cases
  for select to authenticated using (public.is_platform_staff());
create policy "Staff write cases" on public.booking_cases
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

create policy "Staff read case links" on public.case_links
  for select to authenticated using (public.is_platform_staff());
create policy "Staff write case links" on public.case_links
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

create policy "Staff read passengers" on public.case_passengers
  for select to authenticated using (public.is_platform_staff());

create policy "Staff read payments" on public.case_payments
  for select to authenticated using (public.is_platform_staff());
create policy "Staff write payments" on public.case_payments
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

notify pgrst, 'reload schema';
