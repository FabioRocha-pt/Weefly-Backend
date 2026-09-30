-- ADM-02 · TEN-06 · os perfis, provados no RLS.
--
-- Os testes do Bloco B que a base de dados tem de garantir sozinha, sem o
-- servidor à frente:
--
--   B4  um Admin do parceiro não dá o perfil Admin WeeFly a ninguém
--   B5  suspender corta o acesso no pedido seguinte
--   B6  cada alteração fica registada, com autor, antes e depois
--
-- Tudo numa transacção que acaba em rollback: não deixa nada para o
-- test_tenancy.sql, que conta linhas.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-00000000000a', 'boss@weefly.rbac'),
  ('60000000-0000-0000-0000-00000000000b', 'agent@weefly.rbac'),
  ('60000000-0000-0000-0000-00000000000c', 'admin@alo.rbac'),
  ('60000000-0000-0000-0000-00000000000d', 'agent@alo.rbac'),
  ('60000000-0000-0000-0000-00000000000e', 'sec@alo.rbac');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels)
values
  ('70000000-0000-0000-0000-00000000000a', 'alo-rbac',  'Alô RBAC',  true, 'white_label', array['B2G']),
  ('70000000-0000-0000-0000-00000000000b', 'beta-rbac', 'Beta RBAC', true, 'reseller',    array['B2C']);

insert into public.organisations (id, partner_id, slug, name) values
  ('71000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-00000000000a', 'teste', 'Ministério de Teste');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('boss@weefly.rbac',  'Boss',  public.default_partner_id(), 'weefly_admin'),
  ('agent@weefly.rbac', 'Agent', public.default_partner_id(), 'weefly_agent'),
  ('admin@alo.rbac',    'Admin', '70000000-0000-0000-0000-00000000000a', 'partner_admin');

insert into public.bo_allowlist (email, label, partner_id, role_id, organisation_id) values
  ('sec@alo.rbac', 'Sec', '70000000-0000-0000-0000-00000000000a', 'secretary',
   '71000000-0000-0000-0000-00000000000a');

insert into public.booking_cases (id, token, partner_id) values
  ('72000000-0000-0000-0000-00000000000a', 'tok-rbac-alo', '70000000-0000-0000-0000-00000000000a');

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'FALHOU · %', p_label;
  end if;
  raise notice 'ok · %', p_label;
end $$;

-- ── O perfil decide o que era escrito à mão ─────────────────────────────────

do $$
begin
  perform pg_temp.ok('Admin WeeFly fica cross_partner',
    (select cross_partner from public.bo_allowlist where email = 'boss@weefly.rbac'));
  perform pg_temp.ok('Agente WeeFly não fica cross_partner',
    not (select cross_partner from public.bo_allowlist where email = 'agent@weefly.rbac'));

  begin
    insert into public.bo_allowlist (email, partner_id, role_id)
    values ('x@alo.rbac', '70000000-0000-0000-0000-00000000000a', 'weefly_admin');
    raise exception 'FALHOU · Admin WeeFly num parceiro';
  exception when check_violation then
    raise notice 'ok · o perfil Admin WeeFly só existe no operador';
  end;

  begin
    insert into public.bo_allowlist (email, partner_id, role_id)
    values ('y@weefly.rbac', public.default_partner_id(), 'partner_admin');
    raise exception 'FALHOU · Admin do parceiro no operador';
  exception when check_violation then
    raise notice 'ok · o perfil de parceiro não existe no operador';
  end;

  begin
    insert into public.bo_allowlist (email, partner_id, role_id)
    values ('z@alo.rbac', '70000000-0000-0000-0000-00000000000a', 'secretary');
    raise exception 'FALHOU · secretária sem ministério';
  exception when check_violation then
    raise notice 'ok · a secretária pertence a um ministério';
  end;
end $$;

-- ── A secretária não entra no back-office ───────────────────────────────────

do $$
declare allowed boolean; cases bigint;
begin
  perform pg_temp.as_user('60000000-0000-0000-0000-00000000000e');
  allowed := public.is_bo_allowed();
  select count(*) into cases from public.booking_cases;
  reset role;
  perform pg_temp.ok('a secretária não passa a porta do back-office', not allowed);
  perform pg_temp.ok('a secretária não lê casos pelo back-office', cases = 0);
end $$;

-- ── B4 · o Admin do parceiro gere só o seu, e nunca dá Admin WeeFly ─────────

do $$
declare n bigint;
begin
  perform pg_temp.as_user('60000000-0000-0000-0000-00000000000c');

  insert into public.bo_allowlist (email, label, partner_id, role_id)
  values ('agent@alo.rbac', 'Agente Alô', '70000000-0000-0000-0000-00000000000a', 'partner_agent');

  begin
    insert into public.bo_allowlist (email, partner_id, role_id)
    values ('intruso@alo.rbac', public.default_partner_id(), 'weefly_admin');
    raise exception 'FALHOU · o Admin do parceiro criou um Admin WeeFly';
  exception when insufficient_privilege or check_violation then
    null;
  end;

  begin
    insert into public.bo_allowlist (email, partner_id, role_id)
    values ('outro@beta.rbac', '70000000-0000-0000-0000-00000000000b', 'partner_agent');
    raise exception 'FALHOU · o Admin do parceiro criou uma conta de outro parceiro';
  exception when insufficient_privilege then
    null;
  end;

  -- Promover-se ou promover alguém: o `with check` recusa, ou o trigger.
  begin
    update public.bo_allowlist set role_id = 'weefly_admin' where email = 'agent@alo.rbac';
    raise exception 'FALHOU · o Admin do parceiro promoveu a Admin WeeFly';
  exception when insufficient_privilege or check_violation then
    null;
  end;

  -- Não vê, e por isso não edita, as contas da WeeFly.
  update public.bo_allowlist set label = 'pirata' where email = 'agent@weefly.rbac';
  get diagnostics n = row_count;
  reset role;

  perform pg_temp.ok('o Admin do parceiro cria agentes do seu parceiro',
    exists (select 1 from public.bo_allowlist where email = 'agent@alo.rbac'
                                             and role_id = 'partner_agent'));
  perform pg_temp.ok('B4 · o Admin do parceiro não dá o perfil Admin WeeFly', true);
  perform pg_temp.ok('o Admin do parceiro não toca nas contas da WeeFly',
    n = 0 and (select label from public.bo_allowlist where email = 'agent@weefly.rbac') = 'Agent');
end $$;

-- ── Um agente não gere ninguém ──────────────────────────────────────────────

do $$
begin
  perform pg_temp.as_user('60000000-0000-0000-0000-00000000000b');
  begin
    insert into public.bo_allowlist (email, partner_id, role_id)
    values ('amigo@weefly.rbac', public.default_partner_id(), 'weefly_agent');
    raise exception 'FALHOU · um agente criou uma conta';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  perform pg_temp.ok('um agente não cria contas', true);
end $$;

-- ── O Admin WeeFly gere todos ───────────────────────────────────────────────

do $$
begin
  perform pg_temp.as_user('60000000-0000-0000-0000-00000000000a');
  insert into public.bo_allowlist (email, label, partner_id, role_id)
  values ('admin@beta.rbac', 'Admin Beta', '70000000-0000-0000-0000-00000000000b', 'partner_admin');
  reset role;
  perform pg_temp.ok('o Admin WeeFly cria o administrador de qualquer parceiro',
    exists (select 1 from public.bo_allowlist where email = 'admin@beta.rbac'));
end $$;

-- ── B5 · suspender corta no pedido seguinte ─────────────────────────────────

do $$
declare before_n bigint; after_n bigint;
begin
  perform pg_temp.as_user('60000000-0000-0000-0000-00000000000d');
  select count(*) into before_n from public.booking_cases;
  reset role;

  perform pg_temp.as_user('60000000-0000-0000-0000-00000000000c');
  update public.bo_allowlist
     set active = false, suspended_by = 'admin@alo.rbac', suspend_reason = 'saiu'
   where email = 'agent@alo.rbac';
  reset role;

  perform pg_temp.as_user('60000000-0000-0000-0000-00000000000d');
  select count(*) into after_n from public.booking_cases;
  reset role;

  perform pg_temp.ok('o agente do Alô via o caso do Alô', before_n = 1);
  perform pg_temp.ok('B5 · suspenso, deixa de ver no pedido seguinte', after_n = 0);
  perform pg_temp.ok('a suspensão guarda a data',
    (select suspended_at is not null from public.bo_allowlist where email = 'agent@alo.rbac'));
end $$;

-- ── B6 · o registo ──────────────────────────────────────────────────────────

do $$
begin
  perform pg_temp.ok('B6 · criação registada com o autor da sessão',
    exists (select 1 from public.access_audit
             where action = 'user_created' and target = 'agent@alo.rbac'
               and actor_email = 'admin@alo.rbac' and before is null
               and after ->> 'role_id' = 'partner_agent'));
  perform pg_temp.ok('B6 · suspensão registada com antes, depois e motivo',
    exists (select 1 from public.access_audit
             where action = 'user_suspended' and target = 'agent@alo.rbac'
               and actor_email = 'admin@alo.rbac'
               and (before ->> 'active')::boolean and not (after ->> 'active')::boolean
               and reason = 'saiu'));
  perform pg_temp.ok('uma escrita sem sessão fica com o autor que ela declara',
    exists (select 1 from public.access_audit
             where target = 'boss@weefly.rbac' and actor_email like 'sql:%'));

  begin
    update public.access_audit set actor_email = 'outro' where target = 'agent@alo.rbac';
    raise exception 'FALHOU · o registo foi alterado';
  exception when insufficient_privilege then
    raise notice 'ok · o registo não se altera';
  end;
end $$;

-- O Admin do parceiro lê o registo do seu parceiro, e só esse.
do $$
declare mine bigint; theirs bigint;
begin
  perform pg_temp.as_user('60000000-0000-0000-0000-00000000000c');
  select count(*) filter (where partner_id = '70000000-0000-0000-0000-00000000000a'),
         count(*) filter (where partner_id is distinct from '70000000-0000-0000-0000-00000000000a')
    into mine, theirs
    from public.access_audit;
  reset role;
  perform pg_temp.ok('o Admin do parceiro lê o registo do seu parceiro', mine > 0 and theirs = 0);
end $$;

-- ── ADM-01 · parceiros auditados ────────────────────────────────────────────

do $$
begin
  -- Sem sessão: a escrita vem pela service role e declara o autor.
  perform set_config('request.jwt.claim.sub', '', true);
  update public.partners
     set status = 'suspended', suspend_reason = 'contrato', changed_by_email = 'boss@weefly.rbac'
   where slug = 'beta-rbac';
  perform pg_temp.ok('a suspensão do parceiro fica registada',
    exists (select 1 from public.access_audit
             where action = 'partner_suspended' and target = 'beta-rbac'
               and actor_email = 'boss@weefly.rbac' and reason = 'contrato'));
end $$;

-- ── A conta do WeeFly Pro segue a allowlist ─────────────────────────────────

do $$
begin
  perform pg_temp.ok('uma conta criada no ADM-02 entra aprovada no parceiro dela',
    exists (select 1 from public.pro_accounts
             where email = 'admin@alo.rbac' and status = 'approved'
               and partner_id = '70000000-0000-0000-0000-00000000000a'));
end $$;

do $$ begin raise notice 'ok · test_rbac'; end $$;

rollback;
