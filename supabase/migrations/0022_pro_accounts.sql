-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Pro · contas, módulos e menus (PRO-02, PRO-04, PRO-06, PRO-09)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A 0020 fez a empresa (`partners`): tipo de venda, marca, os dois menus. Esta
-- faz a **conta** que entra no WeeFly Pro e pertence a uma empresa:
--
--   PRO-09 · uma conta nova fica pendente até o Dominik a aprovar ou recusar.
--            A recusa leva motivo; cada decisão fica registada com data e autor.
--   PRO-02 · a conta master (o Dominik) é a única que vê o módulo Admin. É uma
--            coluna, não um email escrito no código.
--            O último módulo usado fica guardado na conta, não no browser.
--   PRO-04 · os menus do Agente ligados por empresa são dados: ligar um menu
--            é um `update`, não uma versão nova.
--
-- Depende da 0020 (`partners`). As contas que já existem — a equipa que hoje
-- usa o back-office — ficam aprovadas na WeeFly: esta migração não tranca
-- ninguém fora.
--
-- Sem esta migração o código continua a funcionar como antes: todas as contas
-- entram, e só a conta do Dominik vê o Admin (ver `lib/pro-account.ts`).
--
-- Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0022_pro_accounts.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── PRO-04 · os menus do Agente, por empresa ────────────────────────────────
--
-- Os cinco que existem. Ligado mas ainda sem conteúdo aparece "Brevemente";
-- desligado não aparece. Qual deles tem conteúdo é código (hoje só Passagens,
-- que é o Concierge); qual está ligado é isto.

alter table public.partners
  add column if not exists agent_menus text[] not null default array['flights']::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'partners_agent_menus_known'
  ) then
    alter table public.partners
      add constraint partners_agent_menus_known
      check (agent_menus <@ array['flights', 'cars', 'houses', 'experiences', 'food']::text[]);
  end if;
end $$;

comment on column public.partners.agent_menus is
  'PRO-04 · menus do módulo Agente ligados para esta empresa.';

-- A WeeFly Global vê os cinco; o Alô, quando nascer, só Passagens (o default).
update public.partners
   set agent_menus = array['flights', 'cars', 'houses', 'experiences', 'food']
 where is_operator
   and agent_menus = array['flights']::text[];

-- ── PRO-09 · a conta ────────────────────────────────────────────────────────

create table if not exists public.pro_accounts (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  email            text not null,
  -- O nome da empresa que a pessoa escreveu no registo. Só uma sugestão para o
  -- ecrã de aprovação: a empresa a sério é o `partner_id`.
  company_hint     text,
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  -- Nula enquanto pendente. Uma conta aprovada pertence sempre a uma empresa.
  partner_id       uuid references public.partners (id),
  -- PRO-02 · a conta master. Só ela vê o módulo Admin.
  is_master        boolean not null default false,
  -- PRO-02 · o último módulo por onde entrou.
  last_module      text check (last_module in ('supplier', 'agent', 'admin')),
  rejection_reason text,
  decided_by       uuid references auth.users (id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint pro_accounts_approved_has_partner
    check (status <> 'approved' or partner_id is not null),
  constraint pro_accounts_rejected_has_reason
    check (status <> 'rejected' or length(trim(coalesce(rejection_reason, ''))) > 0),
  -- A conta master é da empresa que opera a plataforma, e está aprovada.
  constraint pro_accounts_master_is_approved
    check (not is_master or status = 'approved')
);

create index if not exists pro_accounts_status_idx on public.pro_accounts (status, created_at);
create index if not exists pro_accounts_partner_idx on public.pro_accounts (partner_id);

drop trigger if exists pro_accounts_touch_updated_at on public.pro_accounts;
create trigger pro_accounts_touch_updated_at
  before update on public.pro_accounts
  for each row execute function public.touch_updated_at();

-- A master só pode estar numa empresa operadora (o mesmo raciocínio do
-- `guard_cross_partner` da 0020).
create or replace function public.guard_pro_master()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_master and not exists (
    select 1 from public.partners where id = new.partner_id and is_operator
  ) then
    raise exception 'a conta master só pode pertencer ao operador (%)', new.email
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pro_accounts_guard_master on public.pro_accounts;
create trigger pro_accounts_guard_master
  before insert or update of is_master, partner_id on public.pro_accounts
  for each row execute function public.guard_pro_master();

-- ── PRO-09 · o registo das decisões ─────────────────────────────────────────
--
-- Só se acrescenta. A linha em `pro_accounts` diz o estado de agora; esta diz
-- quem decidiu o quê, quando, e com que configuração.

create table if not exists public.pro_account_decisions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  decision         text not null check (decision in ('approved', 'rejected')),
  reason           text,
  partner_id       uuid references public.partners (id),
  -- A configuração escolhida no momento, tal como ficou.
  sell_mode        text,
  supply_enabled   boolean,
  sell_enabled     boolean,
  agent_menus      text[],
  decided_by       uuid references auth.users (id) on delete set null,
  decided_by_email text,
  created_at       timestamptz not null default now()
);

create index if not exists pro_account_decisions_user_idx
  on public.pro_account_decisions (user_id, created_at desc);

-- ── a conta nasce com o utilizador ──────────────────────────────────────────
--
-- Pendente. `security definer` porque quem insere em `auth.users` é o GoTrue,
-- que não tem permissão sobre `public`.

create or replace function public.create_pro_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pro_accounts (user_id, email, company_hint)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_pro_account on auth.users;
create trigger on_auth_user_created_pro_account
  after insert on auth.users
  for each row execute function public.create_pro_account();

-- O PRO-07 deixa corrigir o email de um registo por confirmar: a conta segue-o.
create or replace function public.sync_pro_account_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pro_accounts
     set email = lower(coalesce(new.email, ''))
   where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_pro_account on auth.users;
create trigger on_auth_user_email_pro_account
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_pro_account_email();

-- ── as contas que já existem ficam aprovadas na WeeFly ──────────────────────

insert into public.pro_accounts (user_id, email, status, partner_id, decided_at)
select u.id,
       lower(coalesce(u.email, '')),
       'approved',
       (select id from public.partners where is_operator),
       now()
  from auth.users u
on conflict (user_id) do nothing;

-- O Dominik é a conta master (PRO-02).
update public.pro_accounts
   set is_master = true
 where email = 'dominik@weefly.africa'
   and status = 'approved'
   and not is_master;

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Cada pessoa lê a sua conta. Escrever é só pelo servidor (service role),
-- depois de o código verificar quem pede: aprovar é da master, e o último
-- módulo é um campo que não vale a pena abrir ao browser.

alter table public.pro_accounts enable row level security;
alter table public.pro_account_decisions enable row level security;

drop policy if exists pro_accounts_read_own on public.pro_accounts;
create policy pro_accounts_read_own on public.pro_accounts
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists pro_account_decisions_read_own on public.pro_account_decisions;
create policy pro_account_decisions_read_own on public.pro_account_decisions
  for select to authenticated
  using (user_id = auth.uid());

commit;

notify pgrst, 'reload schema';
