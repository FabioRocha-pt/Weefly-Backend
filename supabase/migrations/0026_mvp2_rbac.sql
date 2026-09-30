-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · MVP 2 — perfis e permissões, versão mínima (ADM-02, TEN-06, ADM-09)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Do `WeeFly_MVP2_Para_Developer.md` (30 de setembro):
--
--   ADM-02 · cinco perfis fixos, guardados como dados. Cada utilizador tem um
--            perfil, um parceiro e os módulos ligados. Suspender, nunca apagar.
--            Cada alteração fica registada com autor, data e hora, antes e
--            depois. O perfil é verificado no servidor **e no RLS**.
--   TEN-06 · o Admin aparece em qualquer conta com o perfil Admin WeeFly, e não
--            só na do Dominik. Nenhuma permissão vem de um nome escrito no
--            código.
--   ADM-09 · o Admilson passa a ter o perfil Admin WeeFly.
--   ADM-01 · o registo de parceiros fica auditado da mesma forma.
--   ADM-07 · o campo da comissão no caso, a nulo: não se calcula nada até haver
--            decisão (C1).
--
-- ── Onde vive o perfil ─────────────────────────────────────────────────────
--
-- Na `bo_allowlist`, que já é o registo por email de quem entra, de que
-- parceiro é e se está activo — e é o que o RLS da 0020 já lê
-- (`current_partner_id`, `is_cross_partner`, `is_bo_allowed`). Pôr o perfil
-- noutra tabela criava uma segunda resposta à pergunta "quem é esta pessoa".
-- `pro_accounts` (0022) passa a seguir a allowlist: o trigger desta migração
-- mantém o parceiro e a aprovação alinhados.
--
-- `cross_partner` deixa de se escrever à mão: é o perfil que o decide. A coluna
-- fica, porque as funções da 0020 a leem.
--
-- `role` (admin/manager) fica com o único significado que ainda tem: quem
-- aparece no seletor de vendedor (C-21). O poder de uma conta vem do perfil.
--
-- ── Suspender ──────────────────────────────────────────────────────────────
--
-- `active = false`, com data, autor e motivo. É a mesma coluna que o RLS já lê,
-- por isso uma conta suspensa deixa de ver dados no pedido seguinte.
-- `revoke_user_sessions` apaga as sessões no GoTrue; o servidor bane a conta.
--
-- Depende da 0020, 0022 e 0025. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0026_mvp2_rbac.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · Os perfis
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.access_roles (
  id                    text primary key,
  label_pt              text not null,
  label_en              text not null,
  -- De que parceiro pode ser uma conta com este perfil: só o operador, só um
  -- parceiro que não é o operador, ou qualquer um.
  partner_kind          text not null check (partner_kind in ('operator', 'partner', 'any')),
  -- Entra no WeeFly Pro e no back-office. A secretária não: só o link do
  -- ministério (MIN-01).
  backoffice            boolean not null,
  -- O módulo Admin (TEN-06).
  admin_module          boolean not null,
  -- Vê todos os parceiros (ADM-04). Copiado para `bo_allowlist.cross_partner`.
  cross_partner         boolean not null,
  -- Quem gere utilizadores: ninguém, só os do seu parceiro, ou todos.
  manage_users          text not null check (manage_users in ('none', 'own_partner', 'all')),
  -- Um Admin do parceiro só pode dar estes. Nunca o Admin WeeFly (ADM-02).
  grantable_by_partner  boolean not null,
  -- Pode reabrir casos fechados, revogar links e publicar propostas alheias,
  -- dentro do seu parceiro. Era `bo_allowlist.role = 'admin'`.
  supervises_cases      boolean not null,
  -- A secretária pertence a um ministério (PAR-04: o histórico fica nele).
  needs_organisation    boolean not null,
  sort                  smallint not null
);

insert into public.access_roles
  (id, label_pt, label_en, partner_kind, backoffice, admin_module, cross_partner,
   manage_users, grantable_by_partner, supervises_cases, needs_organisation, sort)
values
  ('weefly_admin',  'Admin WeeFly',      'WeeFly admin',  'operator', true,  true,  true,  'all',         false, true,  false, 1),
  ('weefly_agent',  'Agente WeeFly',     'WeeFly agent',  'operator', true,  false, false, 'none',        false, false, false, 2),
  ('partner_admin', 'Admin do parceiro', 'Partner admin', 'partner',  true,  false, false, 'own_partner', true,  true,  false, 3),
  ('partner_agent', 'Agente do parceiro','Partner agent', 'partner',  true,  false, false, 'none',        true,  false, false, 4),
  ('secretary',     'Secretária',        'Secretary',     'any',      false, false, false, 'none',        true,  false, true,  5)
on conflict (id) do update set
  label_pt             = excluded.label_pt,
  label_en             = excluded.label_en,
  partner_kind         = excluded.partner_kind,
  backoffice           = excluded.backoffice,
  admin_module         = excluded.admin_module,
  cross_partner        = excluded.cross_partner,
  manage_users         = excluded.manage_users,
  grantable_by_partner = excluded.grantable_by_partner,
  supervises_cases     = excluded.supervises_cases,
  needs_organisation   = excluded.needs_organisation,
  sort                 = excluded.sort;

alter table public.access_roles enable row level security;

drop policy if exists access_roles_read on public.access_roles;
create policy access_roles_read on public.access_roles
  for select to authenticated using (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · O perfil na conta
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.bo_allowlist
  add column if not exists role_id          text references public.access_roles (id),
  add column if not exists organisation_id  uuid,
  -- PRO-04 · os menus do Agente desta pessoa. Nulo: os da empresa.
  add column if not exists agent_menus      text[],
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_by     text,
  add column if not exists suspend_reason   text,
  -- Quem fez a última escrita, para o registo quando ela vem pela service role
  -- (sem `auth.uid()`). Pelo cliente da sessão o registo usa a sessão.
  add column if not exists changed_by_email text,
  add column if not exists updated_at       timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bo_allowlist_agent_menus_known') then
    alter table public.bo_allowlist
      add constraint bo_allowlist_agent_menus_known
      check (agent_menus is null
             or agent_menus <@ array['flights', 'cars', 'houses', 'experiences', 'food']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bo_allowlist_organisation_fk') then
    -- O ministério tem de ser do parceiro da conta (a mesma chave composta que
    -- `booking_cases` usa na 0020).
    alter table public.bo_allowlist
      add constraint bo_allowlist_organisation_fk
      foreign key (organisation_id, partner_id)
      references public.organisations (id, partner_id)
      on delete restrict;
  end if;
end $$;

-- O perfil de quem já existe, pelo que já se sabe dele: quem via todos os
-- parceiros administra; o resto da WeeFly é agente; o resto, agente do
-- parceiro.
update public.bo_allowlist a
   set role_id = case
         when a.cross_partner then 'weefly_admin'
         when p.is_operator    then 'weefly_agent'
         else 'partner_agent'
       end
  from public.partners p
 where p.id = a.partner_id
   and a.role_id is null;

-- Antes de qualquer outro trigger da tabela (a ordem é alfabética): deriva
-- o que o perfil decide e recusa o que ele não permite.
create or replace function public.bo_allowlist_apply_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  r        public.access_roles;
  operator boolean;
begin
  select is_operator into operator from public.partners where id = new.partner_id;

  -- Sem perfil, o mesmo critério do preenchimento acima.
  if new.role_id is null then
    new.role_id := case
      when new.cross_partner and operator then 'weefly_admin'
      when operator then 'weefly_agent'
      else 'partner_agent'
    end;
  end if;

  select * into r from public.access_roles where id = new.role_id;
  if not found then
    raise exception 'perfil desconhecido: %', new.role_id using errcode = 'check_violation';
  end if;

  if r.partner_kind = 'operator' and not coalesce(operator, false) then
    raise exception 'o perfil % só existe no operador (%)', r.id, new.email
      using errcode = 'check_violation';
  end if;
  if r.partner_kind = 'partner' and coalesce(operator, false) then
    raise exception 'o perfil % é de um parceiro, não do operador (%)', r.id, new.email
      using errcode = 'check_violation';
  end if;
  if r.needs_organisation and new.organisation_id is null then
    raise exception 'o perfil % pertence a um ministério (%)', r.id, new.email
      using errcode = 'check_violation';
  end if;
  if not r.needs_organisation then
    new.organisation_id := null;
  end if;

  new.cross_partner := r.cross_partner;
  new.email := lower(trim(new.email));

  -- Suspender e reactivar são a mesma coluna que o RLS lê.
  if tg_op = 'UPDATE' then
    if old.active and not new.active then
      new.suspended_at := coalesce(new.suspended_at, now());
    elsif not old.active and new.active then
      new.suspended_at := null;
      new.suspended_by := null;
      new.suspend_reason := null;
    end if;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists bo_allowlist_apply_role on public.bo_allowlist;
create trigger bo_allowlist_apply_role
  before insert or update on public.bo_allowlist
  for each row execute function public.bo_allowlist_apply_role();

-- Com o trigger no sítio, uma passagem sobre todas as linhas alinha o
-- `cross_partner` com o perfil, e o default deixa de ser necessário.
update public.bo_allowlist set role_id = role_id;
alter table public.bo_allowlist alter column role_id set not null;

create index if not exists bo_allowlist_role_idx on public.bo_allowlist (partner_id, role_id);

-- ── ADM-09 · o Admilson ─────────────────────────────────────────────────────

insert into public.bo_allowlist (email, label, role, active, partner_id, role_id, changed_by_email)
select 'admilsonborges@bonako.com', 'Admilson Borges', 'admin', true, p.id, 'weefly_admin', 'migração 0026'
  from public.partners p where p.is_operator
on conflict (email) do update
  set role_id = 'weefly_admin',
      active = true,
      changed_by_email = 'migração 0026';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · As funções que o RLS usa
-- ═══════════════════════════════════════════════════════════════════════════

-- O perfil da sessão. Nulo sem sessão ou com a conta suspensa.
create or replace function public.current_access_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select a.role_id
    from public.bo_allowlist a
    join auth.users u on lower(u.email) = lower(a.email)
   where u.id = auth.uid()
     and a.active;
$$;

-- A porta do back-office passa a pedir um perfil que entre nele. A
-- secretária tem linha na allowlist e não entra (ADM-02).
create or replace function public.is_bo_allowed()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.bo_allowlist a
      join auth.users u on lower(u.email) = lower(a.email)
      join public.access_roles r on r.id = a.role_id
     where u.id = auth.uid()
       and a.active
       and r.backoffice
  );
$$;

-- Pode a sessão criar ou editar uma conta deste parceiro com este perfil?
create or replace function public.can_manage_access(p_partner uuid, p_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select case r.manage_users
             when 'all' then true
             when 'own_partner' then
               p_partner = public.current_partner_id()
               and exists (select 1 from public.access_roles t
                            where t.id = p_role and t.grantable_by_partner)
             else false
           end
      from public.access_roles r
     where r.id = public.current_access_role()
  ), false);
$$;

-- ADM-02 · escrever contas pelo cliente da sessão. A política restritiva
-- `tenant_isolation` da 0020 continua a valer por cima desta.
drop policy if exists access_manage_insert on public.bo_allowlist;
create policy access_manage_insert on public.bo_allowlist
  for insert to authenticated
  with check (public.can_manage_access(partner_id, role_id));

drop policy if exists access_manage_update on public.bo_allowlist;
create policy access_manage_update on public.bo_allowlist
  for update to authenticated
  using (public.can_manage_access(partner_id, role_id))
  with check (public.can_manage_access(partner_id, role_id));

-- Terminar as sessões de uma conta suspensa. Só pela service role.
create or replace function public.revoke_user_sessions(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id::text = $1::text' using p_user;
  end if;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 · A conta do WeeFly Pro segue a allowlist
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Uma conta criada ou movida no ADM-02 entra aprovada, no parceiro certo. Uma
-- conta suspensa não se desaprova: suspender é reversível, e é a allowlist
-- que o diz.

create or replace function public.sync_pro_account_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active then
    update public.pro_accounts
       set partner_id = new.partner_id,
           status = 'approved',
           rejection_reason = null,
           decided_at = coalesce(decided_at, now())
     where lower(email) = new.email
       and (partner_id is distinct from new.partner_id or status <> 'approved');
  end if;
  return new;
end;
$$;

drop trigger if exists bo_allowlist_sync_pro_account on public.bo_allowlist;
create trigger bo_allowlist_sync_pro_account
  after insert or update of partner_id, active on public.bo_allowlist
  for each row execute function public.sync_pro_account_from_allowlist();

-- O Admilson, se já se tiver registado.
update public.pro_accounts p
   set partner_id = a.partner_id, status = 'approved', decided_at = coalesce(p.decided_at, now())
  from public.bo_allowlist a
 where a.email = p.email and a.active and a.role_id = 'weefly_admin'
   and (p.partner_id is distinct from a.partner_id or p.status <> 'approved');

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 · O registo (ADM-02 · ADM-01)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só se acrescenta. Escrito por trigger, e não pela aplicação, para que
-- nenhuma escrita — nem uma feita à mão no SQL Editor — fique de fora.

create table if not exists public.access_audit (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  actor_user_id uuid,
  actor_email   text not null,
  action        text not null check (action in (
                  'user_created', 'user_updated', 'user_suspended', 'user_reactivated',
                  'partner_created', 'partner_updated', 'partner_suspended', 'partner_reactivated')),
  -- O parceiro a que a alteração diz respeito: é por ele que o Admin do
  -- parceiro lê o registo. Sem chave estrangeira de propósito: o registo não
  -- se altera, nem quando o que ele descreve desaparece.
  partner_id    uuid,
  target        text not null,
  before        jsonb,
  after         jsonb,
  reason        text
);

create index if not exists access_audit_partner_idx on public.access_audit (partner_id, created_at desc);
create index if not exists access_audit_created_idx on public.access_audit (created_at desc);

create or replace function public.access_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'o registo de acessos só aceita linhas novas' using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists access_audit_no_update on public.access_audit;
create trigger access_audit_no_update
  before update or delete on public.access_audit
  for each row execute function public.access_audit_immutable();

create or replace function public.audit_actor(p_fallback text)
returns table (user_id uuid, email text)
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid(),
         coalesce(
           (select lower(u.email) from auth.users u where u.id = auth.uid()),
           nullif(trim(p_fallback), ''),
           'sql:' || session_user
         );
$$;

create or replace function public.audit_bo_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor  record;
  keys   text[] := array['email', 'label', 'role_id', 'partner_id', 'organisation_id',
                         'agent_menus', 'active', 'role'];
  b      jsonb;
  a      jsonb;
  act    text;
begin
  -- `changed_by_email` só conta quando esta escrita o mudou: um valor que
  -- ficou de uma escrita anterior não é o autor desta.
  select * into actor from public.audit_actor(
    case when tg_op = 'INSERT' or new.changed_by_email is distinct from old.changed_by_email
         then new.changed_by_email end);
  a := (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(keys) k);

  if tg_op = 'INSERT' then
    act := 'user_created';
  else
    b := (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(keys) k);
    if a = b then
      return new;
    end if;
    act := case
      when old.active and not new.active then 'user_suspended'
      when not old.active and new.active then 'user_reactivated'
      else 'user_updated'
    end;
  end if;

  insert into public.access_audit (actor_user_id, actor_email, action, partner_id, target, before, after, reason)
  values (actor.user_id, actor.email, act, new.partner_id, new.email, b, a,
          case when act = 'user_suspended' then new.suspend_reason end);
  return new;
end;
$$;

drop trigger if exists bo_allowlist_audit on public.bo_allowlist;
create trigger bo_allowlist_audit
  after insert or update on public.bo_allowlist
  for each row execute function public.audit_bo_allowlist();

alter table public.partners
  add column if not exists changed_by_email text,
  add column if not exists suspend_reason   text;

create or replace function public.audit_partners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  b     jsonb;
  a     jsonb;
  act   text;
begin
  select * into actor from public.audit_actor(
    case when tg_op = 'INSERT' or new.changed_by_email is distinct from old.changed_by_email
         then new.changed_by_email end);
  a := to_jsonb(new) - array['created_at', 'updated_at', 'changed_by_email'];

  if tg_op = 'INSERT' then
    act := 'partner_created';
  else
    b := to_jsonb(old) - array['created_at', 'updated_at', 'changed_by_email'];
    if a = b then
      return new;
    end if;
    act := case
      when old.status = 'active' and new.status = 'suspended' then 'partner_suspended'
      when old.status = 'suspended' and new.status = 'active' then 'partner_reactivated'
      else 'partner_updated'
    end;
  end if;

  insert into public.access_audit (actor_user_id, actor_email, action, partner_id, target, before, after, reason)
  values (actor.user_id, actor.email, act, new.id, new.slug, b, a,
          case when act = 'partner_suspended' then new.suspend_reason end);
  return new;
end;
$$;

drop trigger if exists partners_audit on public.partners;
create trigger partners_audit
  after insert or update on public.partners
  for each row execute function public.audit_partners();

alter table public.access_audit enable row level security;

-- O Admin WeeFly lê tudo; o Admin do parceiro, o do seu parceiro.
drop policy if exists access_audit_read on public.access_audit;
create policy access_audit_read on public.access_audit
  for select to authenticated
  using (
    public.is_cross_partner()
    or (
      partner_id = public.current_partner_id()
      and exists (select 1 from public.access_roles r
                   where r.id = public.current_access_role()
                     and r.manage_users <> 'none')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 6 · ADM-07 · o lugar da comissão, vazio
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Prepara o campo no caso, mas não calcules nada." Guardado no caso para que
-- mudar a taxa mais tarde não reescreva o histórico.

alter table public.booking_cases
  add column if not exists commission_rate   numeric(7, 4),
  add column if not exists commission_amount numeric(12, 2);

commit;

notify pgrst, 'reload schema';
