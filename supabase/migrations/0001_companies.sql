-- WeeFly PRO — companies table (idempotent / repair-safe)
--
-- Run this in the Supabase SQL Editor. Safe to run multiple times:
--   * creates the table if it doesn't exist;
--   * ADDS any missing columns to an existing `companies` table;
--   * drops the old RLS policies, then the stray `owner_id` column;
--   * (re)creates the RLS policies keyed on `user_id`;
--   * reloads the PostgREST schema cache.
--
-- The owner column is `user_id` (matches the pre-existing table + the app code
-- in src/actions/company.ts and src/lib/companies.ts).

-- 1. Base table (no-op if it already exists) --------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid()
);

-- 2. Ensure every column the app needs exists -------------------------------
alter table public.companies
  add column if not exists user_id         uuid references auth.users (id) on delete cascade,
  add column if not exists type            text,
  add column if not exists legal_name      text,
  add column if not exists commercial_name text,
  add column if not exists nif             text,
  add column if not exists country         text,
  add column if not exists city            text,
  add column if not exists address         text,
  add column if not exists email           text,
  add column if not exists phone           text,
  add column if not exists bank_name       text,
  add column if not exists iban            text,
  add column if not exists created_at      timestamptz not null default now();

-- 3. Drop old policies FIRST (they may depend on the stray owner_id column) --
drop policy if exists "Owners can read their companies" on public.companies;
drop policy if exists "Owners can insert their companies" on public.companies;
drop policy if exists "Owners can update their companies" on public.companies;
drop policy if exists "Owners can delete their companies" on public.companies;

-- 4. Now the stray column can be removed safely -----------------------------
alter table public.companies drop column if exists owner_id;

create index if not exists companies_user_id_idx on public.companies (user_id);

-- 5. Row Level Security (keyed on user_id) ----------------------------------
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

-- 6. Force PostgREST to pick up the changes immediately ---------------------
notify pgrst, 'reload schema';
