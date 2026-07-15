-- WeeFly PRO — companies table (clean install)
--
-- ⚠️ THIS DROPS AND RECREATES public.companies.
-- The pre-existing table used different column names (company_type, etc.) than
-- the app, which caused a cascade of NOT-NULL errors. Since there is no real
-- data yet (every insert had been failing), we recreate the table so its
-- columns match the app exactly (src/actions/company.ts + src/lib/companies.ts).
--
-- If you have OTHER tables with a foreign key to companies, `cascade` drops
-- those FK constraints (not the other tables' rows). Re-add them afterwards if
-- needed.

drop table if exists public.companies cascade;

create table public.companies (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  type             text not null check (type in ('rental', 'housing', 'tourism')),
  legal_name       text not null,
  commercial_name  text not null,
  nif              text,
  country          text,
  city             text,
  address          text,
  email            text,
  phone            text,
  bank_name        text,
  iban             text,
  created_at       timestamptz not null default now()
);

create index companies_user_id_idx on public.companies (user_id);

-- Row Level Security ---------------------------------------------------------
alter table public.companies enable row level security;

create policy "Owners can read their companies"
  on public.companies for select
  using (auth.uid() = user_id);

create policy "Owners can insert their companies"
  on public.companies for insert
  with check (auth.uid() = user_id);

create policy "Owners can update their companies"
  on public.companies for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners can delete their companies"
  on public.companies for delete
  using (auth.uid() = user_id);

-- Reload the PostgREST schema cache -----------------------------------------
notify pgrst, 'reload schema';
