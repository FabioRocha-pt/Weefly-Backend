-- WeeFly Concierge — travel request intake + back-office
--
-- Channel-agnostic intake from the technical spec: a Lead (the person) owns
-- many TripRequests (what they asked for). The public form writes here through
-- a SERVICE ROLE client, so no policy ever grants the public `anon` key access
-- to this data — RLS below is strictly for signed-in platform staff.
--
-- Adding the WhatsApp channel later means inserting with a different
-- `source_channel`; no schema change required.

-- Platform staff ------------------------------------------------------------
-- Back-office access is explicit membership, not an email pattern. Seed it
-- with the SQL at the bottom of this file after the user has signed up.

create table if not exists public.platform_staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'manager' check (role in ('manager', 'admin')),
  created_at timestamptz not null default now()
);

/*
 * SECURITY DEFINER so the function can read platform_staff while that table's
 * own RLS policy is calling it — a plain query here would recurse infinitely.
 * search_path is pinned so the function can't be hijacked by a rogue schema.
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

create policy "Staff can read the staff list"
  on public.platform_staff for select
  to authenticated
  using (public.is_platform_staff());

-- Leads ---------------------------------------------------------------------

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

-- One lead per email address: repeat customers accumulate trip requests
-- instead of fragmenting into duplicate contacts.
create unique index if not exists leads_email_key on public.leads (lower(email));

-- Trip requests -------------------------------------------------------------

-- Human-friendly reference for phone/email conversations: WF-2608-0001
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
  -- Delivery outcome of the two transactional emails, so the back-office can
  -- show "client never got a confirmation" instead of silently pretending.
  email_sent    boolean not null default false,
  team_notified boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists trip_requests_lead_id_idx on public.trip_requests (lead_id);
create index if not exists trip_requests_status_idx on public.trip_requests (status);
create index if not exists trip_requests_created_at_idx on public.trip_requests (created_at desc);

-- Internal notes ------------------------------------------------------------

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

-- updated_at maintenance ----------------------------------------------------

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

-- Row Level Security --------------------------------------------------------
-- Note the absence of INSERT policies on leads/trip_requests: the public form
-- inserts with the service role key, which bypasses RLS. Nothing reachable
-- from the browser can write here.

alter table public.leads enable row level security;
alter table public.trip_requests enable row level security;
alter table public.trip_request_notes enable row level security;

create policy "Staff can read leads"
  on public.leads for select
  to authenticated using (public.is_platform_staff());

create policy "Staff can update leads"
  on public.leads for update
  to authenticated using (public.is_platform_staff())
  with check (public.is_platform_staff());

create policy "Staff can read trip requests"
  on public.trip_requests for select
  to authenticated using (public.is_platform_staff());

create policy "Staff can update trip requests"
  on public.trip_requests for update
  to authenticated using (public.is_platform_staff())
  with check (public.is_platform_staff());

create policy "Staff can read notes"
  on public.trip_request_notes for select
  to authenticated using (public.is_platform_staff());

create policy "Staff can write notes as themselves"
  on public.trip_request_notes for insert
  to authenticated
  with check (public.is_platform_staff() and author_id = auth.uid());

-- Reload the PostgREST schema cache -----------------------------------------
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- GRANT YOURSELF ACCESS
--
-- Sign up / log in through the app first, then run this once in the Supabase
-- SQL editor (replace the address with the account you logged in with):
--
--   insert into public.platform_staff (user_id, email, role)
--   select id, email, 'admin' from auth.users where email = 'fapirocha@gmail.com'
--   on conflict (user_id) do nothing;
--
-- Verify with:  select * from public.platform_staff;
-- ---------------------------------------------------------------------------
