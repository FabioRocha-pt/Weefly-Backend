-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · B2G v2 — ministérios pedidos ao master e secretárias com PIN
-- (B2G-05, B2G-23, B2G-06, B2G-07)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B2G-05 · o ministério tem dois logótipos: o horizontal (`logo_url`, já
--   existia) e o brasão (`crest_url`, novo). O brasão nunca aparece sozinho
--   numa lista: leva sempre o nome (B2G-24).
--
-- B2G-23 · D-10 · "O parceiro não cria ministérios: pede-os ao master." A
--   `organisation_requests` guarda o pedido (pendente, aprovado, recusado,
--   com motivo e quem decidiu). Só a WeeFly (`cross_partner`) cria e apaga
--   ministérios; o parceiro continua a mudar o que não é identidade (limites,
--   o que a secretária vê) — o gatilho `organisations_guard_identity` recusa
--   o resto a uma sessão que não seja da WeeFly.
--
-- B2G-06 · D-5 · cada secretária tem o seu acesso:
--   · `ministry_secretaries` · a secretária, de um ministério (a empresa vem
--     do ministério, por gatilho), com o link pessoal (`link_token`, ≥ 192
--     bits, permanente). Desactivar corta o acesso e guarda o histórico.
--   · `ministry_secretary_secrets` · o hash do PIN e o contador de falhas.
--     RLS ligado e **sem políticas**, e sem privilégios para `anon` e
--     `authenticated`: só a service role lá chega.
--   · `ministry_secretary_sessions` · as sessões abertas com o PIN: só o hash
--     do token do cookie. 30 min sem uso ou 12 h no total, e só enquanto o
--     `pin_version` for o actual (um PIN novo mata as sessões todas).
--   · `secretary_pin_failure` / `secretary_pin_success` · o contador, atómico:
--     5 falhas seguidas bloqueiam 15 minutos.
--   · `secretary_set_pin` · grava o hash novo, sobe a versão e apaga as
--     sessões, num só gesto.
--   · `secretary_session_check` · valida e refresca uma sessão.
--
-- B2G-07 · o token do link deixa de bastar: sem sessão aberta com o PIN não
--   se faz pedido. O `organisations.link_token` fica (histórico), mas já não
--   é credencial de nada.
--
-- Migração dos dados: cada ministério com secretária (`organisations.
-- secretary_*`) e cada conta `secretary` na allowlist passam a uma linha de
-- `ministry_secretaries`, **sem PIN** — não entram até alguém gerar um.
--
-- `booking_cases.secretary_id` · quem fez o pedido (B2G-06: "o histórico diz
-- quem fez cada um"). Chave composta `(secretary_id, organisation_id)`: a
-- secretária é do ministério do caso.
--
-- Depende da 0020, 0026, 0028, 0031 e 0032. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0034_ministry_secretaries.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── B2G-05 · o brasão ───────────────────────────────────────────────────────

alter table public.organisations
  add column if not exists crest_url text;

comment on column public.organisations.crest_url is
  'B2G-05 · o brasão do ministério (quadrado, para ícone). Em listas e seletores leva sempre o nome ao lado (B2G-24).';
comment on column public.organisations.link_token is
  'Histórico (MIN-01). Desde a 0034 não é credencial: o espaço do ministério abre pelo link pessoal de cada secretária (ministry_secretaries.link_token) e PIN.';

-- ── B2G-23 · só a WeeFly cria ministérios ──────────────────────────────────

drop policy if exists organisations_manage on public.organisations;
drop policy if exists organisations_insert on public.organisations;
drop policy if exists organisations_update on public.organisations;
drop policy if exists organisations_delete on public.organisations;

create policy organisations_insert on public.organisations
  for insert to authenticated
  with check (public.is_cross_partner() and public.can_manage_partner(partner_id));

create policy organisations_update on public.organisations
  for update to authenticated
  using (public.can_manage_partner(partner_id))
  with check (public.can_manage_partner(partner_id));

create policy organisations_delete on public.organisations
  for delete to authenticated
  using (public.is_cross_partner() and public.can_manage_partner(partner_id));

/*
 * O que é identidade do ministério: a empresa, o nome, o endereço, os
 * logótipos e se está activo. Uma sessão de parceiro não os muda (D-10); a
 * WeeFly sim, e a service role também (não passa por aqui como
 * `authenticated`).
 */
create or replace function public.organisations_guard_identity()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_cross_partner() then
    if new.partner_id is distinct from old.partner_id
       or new.name is distinct from old.name
       or new.slug is distinct from old.slug
       or new.logo_url is distinct from old.logo_url
       or new.crest_url is distinct from old.crest_url
       or new.active is distinct from old.active then
      raise exception 'só a WeeFly muda o nome, o endereço, os logótipos ou o estado de um ministério'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organisations_guard_identity on public.organisations;
create trigger organisations_guard_identity
  before update on public.organisations
  for each row execute function public.organisations_guard_identity();

-- ── B2G-23 · o pedido de um ministério novo ────────────────────────────────

create table if not exists public.organisation_requests (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid not null references public.partners (id) on delete restrict,
  name                text not null,
  -- Os ficheiros enviados, no bucket `brand` (caminhos dentro do bucket).
  logo_path           text,
  crest_path          text,
  status              text not null default 'pending',
  reason              text,
  requested_by_email  text not null,
  decided_by_email    text,
  decided_at          timestamptz,
  -- O ministério criado na aprovação.
  organisation_id     uuid references public.organisations (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint organisation_requests_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint organisation_requests_name_check check (char_length(btrim(name)) between 2 and 160),
  constraint organisation_requests_decision_check check (
    (status = 'pending' and decided_at is null and decided_by_email is null)
    or (status <> 'pending' and decided_at is not null and decided_by_email is not null)
  ),
  constraint organisation_requests_reject_reason check (
    status <> 'rejected' or char_length(btrim(coalesce(reason, ''))) >= 3
  ),
  constraint organisation_requests_approved_org check (status <> 'approved' or organisation_id is not null)
);

create index if not exists organisation_requests_partner_idx
  on public.organisation_requests (partner_id, created_at desc);
create index if not exists organisation_requests_pending_idx
  on public.organisation_requests (created_at) where status = 'pending';
-- O mesmo ministério não fica pendente duas vezes na mesma empresa.
create unique index if not exists organisation_requests_one_pending
  on public.organisation_requests (partner_id, lower(btrim(name))) where status = 'pending';

comment on table public.organisation_requests is
  'B2G-23 · D-10 · um ministério pedido por uma empresa ao master. Só a WeeFly aprova (cria o ministério) ou recusa, com motivo.';

alter table public.organisation_requests enable row level security;

drop policy if exists organisation_requests_select on public.organisation_requests;
create policy organisation_requests_select on public.organisation_requests
  for select to authenticated
  using (public.can_see_partner(partner_id) and public.is_bo_allowed());

-- Sem políticas de escrita: pede-se e decide-se pela service role, depois de
-- a server action verificar a sessão.
revoke insert, update, delete on public.organisation_requests from anon, authenticated;

-- ── B2G-06 · a secretária ───────────────────────────────────────────────────

create table if not exists public.ministry_secretaries (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null,
  -- Forçado pelo gatilho a partir do ministério: nunca vem do browser.
  partner_id            uuid not null,
  name                  text not null,
  phone                 text,
  email                 text,
  -- O link pessoal: /ministerios/<slug>/<link_token>. ≥ 192 bits, permanente.
  link_token            text not null,
  active                boolean not null default true,
  deactivated_at        timestamptz,
  deactivated_by_email  text,
  created_by_email      text not null,
  last_access_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (organisation_id, partner_id)
    references public.organisations (id, partner_id) on delete restrict,
  constraint ministry_secretaries_name_check   check (char_length(btrim(name)) between 2 and 120),
  constraint ministry_secretaries_email_check  check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint ministry_secretaries_phone_check  check (phone is null or char_length(phone) <= 40),
  constraint ministry_secretaries_token_check  check (link_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  constraint ministry_secretaries_active_check check (active = (deactivated_at is null))
);

create unique index if not exists ministry_secretaries_link_token_key on public.ministry_secretaries (link_token);
-- A chave composta que `booking_cases` referencia.
create unique index if not exists ministry_secretaries_id_org_key on public.ministry_secretaries (id, organisation_id);
create index if not exists ministry_secretaries_org_idx on public.ministry_secretaries (organisation_id, created_at);
create index if not exists ministry_secretaries_partner_idx on public.ministry_secretaries (partner_id);

comment on table public.ministry_secretaries is
  'B2G-06 · as secretárias de um ministério, cada uma com link pessoal e PIN (o hash está em ministry_secretary_secrets, só para a service role).';

/*
 * A empresa vem do ministério. O ministério e o link não mudam depois de
 * criados (os casos apontam para o par `(id, organisation_id)`).
 */
create or replace function public.ministry_secretaries_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organisation_id <> old.organisation_id then
      raise exception 'uma secretária não muda de ministério' using errcode = 'check_violation';
    end if;
    if new.link_token <> old.link_token then
      raise exception 'o link pessoal de uma secretária é permanente' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;
  select o.partner_id into new.partner_id from public.organisations o where o.id = new.organisation_id;
  if new.partner_id is null then
    raise exception 'ministério desconhecido' using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ministry_secretaries_guard on public.ministry_secretaries;
create trigger ministry_secretaries_guard
  before insert or update on public.ministry_secretaries
  for each row execute function public.ministry_secretaries_guard();

alter table public.ministry_secretaries enable row level security;

-- Lê quem entra no back-office e vê a empresa (o master vê todas). A
-- secretária não tem sessão no back-office: não lê nada daqui.
drop policy if exists ministry_secretaries_select on public.ministry_secretaries;
create policy ministry_secretaries_select on public.ministry_secretaries
  for select to authenticated
  using (public.can_see_partner(partner_id) and public.is_bo_allowed());

revoke insert, update, delete on public.ministry_secretaries from anon, authenticated;

-- ── B2G-06 · B2G-07 · o PIN, fora do alcance de qualquer sessão ─────────────

create table if not exists public.ministry_secretary_secrets (
  secretary_id      uuid primary key references public.ministry_secretaries (id) on delete cascade,
  -- scrypt com sal próprio (ver src/lib/secretary-auth.ts). Nulo: sem PIN, não entra.
  pin_hash          text,
  pin_version       integer not null default 0,
  pin_set_by_email  text,
  pin_set_at        timestamptz,
  failed_attempts   integer not null default 0 check (failed_attempts >= 0),
  locked_until      timestamptz
);

comment on table public.ministry_secretary_secrets is
  'B2G-06 · o hash do PIN e o bloqueio. RLS sem políticas e sem privilégios para anon/authenticated: só a service role.';

alter table public.ministry_secretary_secrets enable row level security;
revoke all on public.ministry_secretary_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.ministry_secretary_secrets to service_role;

create table if not exists public.ministry_secretary_sessions (
  id            uuid primary key default gen_random_uuid(),
  -- sha256 (hex) do token que está no cookie. O token nunca é guardado.
  token_hash    text not null,
  secretary_id  uuid not null references public.ministry_secretaries (id) on delete cascade,
  pin_version   integer not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '12 hours',
  constraint ministry_secretary_sessions_hash_check check (token_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists ministry_secretary_sessions_hash_key on public.ministry_secretary_sessions (token_hash);
create index if not exists ministry_secretary_sessions_secretary_idx on public.ministry_secretary_sessions (secretary_id);

alter table public.ministry_secretary_sessions enable row level security;
revoke all on public.ministry_secretary_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.ministry_secretary_sessions to service_role;

-- Cada secretária nasce com a sua linha de segredos, sem PIN.
create or replace function public.ministry_secretaries_seed_secret()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ministry_secretary_secrets (secretary_id) values (new.id)
  on conflict (secretary_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ministry_secretaries_seed_secret on public.ministry_secretaries;
create trigger ministry_secretaries_seed_secret
  after insert on public.ministry_secretaries
  for each row execute function public.ministry_secretaries_seed_secret();

-- Desactivar corta já: as sessões abertas morrem com a desactivação.
create or replace function public.ministry_secretaries_kill_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active and not new.active then
    delete from public.ministry_secretary_sessions where secretary_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists ministry_secretaries_kill_sessions on public.ministry_secretaries;
create trigger ministry_secretaries_kill_sessions
  after update of active on public.ministry_secretaries
  for each row execute function public.ministry_secretaries_kill_sessions();

/*
 * Uma falha de PIN, contada de forma atómica (a linha fica bloqueada durante
 * a contagem: dois pedidos ao mesmo tempo não contam os dois como a 4.ª).
 * Com o bloqueio expirado, recomeça do zero. À 5.ª seguida: 15 minutos.
 */
create or replace function public.secretary_pin_failure(p_secretary uuid)
returns table (locked boolean, locked_until timestamptz, failed_attempts integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.ministry_secretary_secrets%rowtype;
begin
  select * into s from public.ministry_secretary_secrets x where x.secretary_id = p_secretary for update;
  if not found then
    return query select false, null::timestamptz, 0;
    return;
  end if;

  if s.locked_until is not null and s.locked_until > now() then
    return query select true, s.locked_until, s.failed_attempts;
    return;
  end if;

  if s.locked_until is not null then
    s.failed_attempts := 0;
    s.locked_until := null;
  end if;

  s.failed_attempts := s.failed_attempts + 1;
  if s.failed_attempts >= 5 then
    s.locked_until := now() + interval '15 minutes';
  end if;

  update public.ministry_secretary_secrets x
     set failed_attempts = s.failed_attempts,
         locked_until = s.locked_until
   where x.secretary_id = p_secretary;

  return query select s.locked_until is not null, s.locked_until, s.failed_attempts;
end;
$$;

-- O PIN certo: o contador volta a zero.
create or replace function public.secretary_pin_success(p_secretary uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ministry_secretary_secrets
     set failed_attempts = 0, locked_until = null
   where secretary_id = p_secretary;
$$;

/*
 * Um PIN novo (gerado no servidor, já em hash): a versão sobe, o bloqueio
 * limpa-se e todas as sessões abertas com o PIN antigo morrem.
 */
create or replace function public.secretary_set_pin(p_secretary uuid, p_hash text, p_by text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  if p_hash is null or p_hash !~ '^scrypt\$' then
    raise exception 'hash de PIN inválido' using errcode = 'check_violation';
  end if;
  insert into public.ministry_secretary_secrets (secretary_id) values (p_secretary)
  on conflict (secretary_id) do nothing;
  update public.ministry_secretary_secrets
     set pin_hash = p_hash,
         pin_version = pin_version + 1,
         pin_set_by_email = p_by,
         pin_set_at = now(),
         failed_attempts = 0,
         locked_until = null
   where secretary_id = p_secretary
  returning pin_version into v;
  delete from public.ministry_secretary_sessions where secretary_id = p_secretary;
  return v;
end;
$$;

/*
 * A sessão do cookie, validada: existe, não passou das 12 h, teve uso nos
 * últimos 30 min, o PIN é o mesmo com que foi aberta, e a secretária, o
 * ministério e a empresa estão activos. Válida: refresca o último uso e
 * devolve a secretária. Inválida: apaga-a e devolve nulo.
 */
create or replace function public.secretary_session_check(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select ss.id, ss.secretary_id, ss.pin_version, ss.last_seen_at, ss.expires_at,
         sec.pin_version as current_version, sec.pin_hash,
         m.active as secretary_active, o.active as org_active, p.status as partner_status
    into s
    from public.ministry_secretary_sessions ss
    join public.ministry_secretaries m on m.id = ss.secretary_id
    join public.ministry_secretary_secrets sec on sec.secretary_id = m.id
    join public.organisations o on o.id = m.organisation_id
    join public.partners p on p.id = m.partner_id
   where ss.token_hash = p_token_hash;

  if not found then
    return null;
  end if;

  if s.expires_at <= now()
     or s.last_seen_at <= now() - interval '30 minutes'
     or s.pin_version <> s.current_version
     or s.pin_hash is null
     or not s.secretary_active
     or not s.org_active
     or s.partner_status <> 'active' then
    delete from public.ministry_secretary_sessions where id = s.id;
    return null;
  end if;

  update public.ministry_secretary_sessions set last_seen_at = now() where id = s.id;
  return s.secretary_id;
end;
$$;

revoke execute on function public.secretary_pin_failure(uuid) from public, anon, authenticated;
revoke execute on function public.secretary_pin_success(uuid) from public, anon, authenticated;
revoke execute on function public.secretary_set_pin(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.secretary_session_check(text) from public, anon, authenticated;
grant execute on function public.secretary_pin_failure(uuid) to service_role;
grant execute on function public.secretary_pin_success(uuid) to service_role;
grant execute on function public.secretary_set_pin(uuid, text, text) to service_role;
grant execute on function public.secretary_session_check(text) to service_role;

-- ── B2G-06 · quem fez o pedido ──────────────────────────────────────────────

alter table public.booking_cases
  add column if not exists secretary_id uuid;

alter table public.booking_cases
  drop constraint if exists booking_cases_secretary_fk;
alter table public.booking_cases
  add constraint booking_cases_secretary_fk
    foreign key (secretary_id, organisation_id)
    references public.ministry_secretaries (id, organisation_id)
    on delete restrict;

-- Uma chave composta com um lado nulo não é verificada: a secretária só
-- existe num caso de ministério.
alter table public.booking_cases
  drop constraint if exists booking_cases_secretary_needs_org;
alter table public.booking_cases
  add constraint booking_cases_secretary_needs_org
  check (secretary_id is null or organisation_id is not null);

create index if not exists booking_cases_secretary_idx
  on public.booking_cases (secretary_id) where secretary_id is not null;

-- ── Os dados que já existiam: uma secretária por pessoa, sem PIN ───────────

-- 32 caracteres hexadecimais por uuid (122 bits aleatórios): dois = 244 bits.
create or replace function pg_temp.mint_token() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- A secretária que estava no próprio ministério (PAR-02).
insert into public.ministry_secretaries (organisation_id, partner_id, name, email, phone, link_token, created_by_email)
select o.id,
       o.partner_id,
       left(coalesce(nullif(btrim(o.secretary_name), ''), nullif(btrim(o.secretary_email), ''), 'Secretária'), 120),
       case when o.secretary_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then lower(btrim(o.secretary_email)) end,
       left(nullif(btrim(o.secretary_phone), ''), 40),
       pg_temp.mint_token(),
       'migração 0034'
  from public.organisations o
 where (nullif(btrim(o.secretary_name), '') is not null or nullif(btrim(o.secretary_email), '') is not null)
   and char_length(btrim(coalesce(nullif(btrim(o.secretary_name), ''), nullif(btrim(o.secretary_email), ''), 'Secretária'))) >= 2
   and not exists (
     select 1 from public.ministry_secretaries m
      where m.organisation_id = o.id
        and (lower(m.email) = lower(btrim(o.secretary_email))
             or (m.email is null and o.secretary_email is null and m.name = btrim(o.secretary_name)))
   );

-- As contas com o perfil Secretária (PAR-04): as suspensas entram desactivadas.
insert into public.ministry_secretaries
  (organisation_id, partner_id, name, email, link_token, created_by_email, active, deactivated_at, deactivated_by_email)
select a.organisation_id,
       o.partner_id,
       left(coalesce(nullif(btrim(a.label), ''), a.email), 120),
       case when a.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then lower(a.email) end,
       pg_temp.mint_token(),
       'migração 0034',
       a.active,
       case when a.active then null else coalesce(a.suspended_at, now()) end,
       case when a.active then null else coalesce(a.suspended_by, 'migração 0034') end
  from public.bo_allowlist a
  join public.organisations o on o.id = a.organisation_id
 where a.role_id = 'secretary'
   and a.organisation_id is not null
   and char_length(btrim(coalesce(nullif(btrim(a.label), ''), a.email))) >= 2
   and not exists (
     select 1 from public.ministry_secretaries m
      where m.organisation_id = a.organisation_id
        and lower(m.email) = lower(a.email)
   );

commit;

notify pgrst, 'reload schema';
