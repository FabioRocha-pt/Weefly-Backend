-- B2G-19 · o registo (`b2g_activity`), provado na base de dados.
--
--   G1  a empresa (Admin do parceiro, que gere utilizadores) vê o registo do
--       seu ministério inteiro: o pedido (case_events), as fichas
--       (ministry_traveller_changes) e a secretária/o pedido de ministério
--       (access_audit) — cinco linhas, com autor e organisation_id certos
--   G2  o master vê o mesmo registo, de qualquer empresa
--   G3  outra empresa não vê nada deste ministério
--   G4  `anon` não vê nada
--   G5  um agente sem perfil de gestão de utilizadores vê os pedidos e as
--       fichas, mas não a parte de secretárias/pedidos de ministério
--       (a mesma regra que já valia para `access_audit` directamente)
--   G6  `claim_case`/`urgency_changed` não duplicam: só aparecem pelo
--       `case_events` (a view não repete o `access_audit` deles)
--
-- Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-00000000000a', 'admin@alo.b7'),
  ('f0000000-0000-0000-0000-00000000000b', 'agent@alo.b7'),
  ('f0000000-0000-0000-0000-00000000000c', 'admin@beta.b7'),
  ('f0000000-0000-0000-0000-00000000000d', 'master@weefly.b7');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('f1000000-0000-0000-0000-00000000000a', 'alo-b7',  'Alô B7',  true, 'white_label', array['B2C', 'B2G']),
  ('f1000000-0000-0000-0000-00000000000b', 'beta-b7', 'Beta B7', true, 'reseller',    array['B2C', 'B2G']);

insert into public.organisations (id, partner_id, slug, name) values
  ('f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-00000000000a', 'b7-saude', 'B7 Saúde');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('admin@alo.b7',     'Admin Alô B7',   'f1000000-0000-0000-0000-00000000000a', 'partner_admin'),
  ('agent@alo.b7',     'Agente Alô B7',  'f1000000-0000-0000-0000-00000000000a', 'partner_agent'),
  ('admin@beta.b7',    'Admin Beta B7',  'f1000000-0000-0000-0000-00000000000b', 'partner_admin'),
  ('master@weefly.b7', 'Master B7',      public.default_partner_id(),            'weefly_admin');

insert into public.ministry_secretaries (id, organisation_id, name, email, link_token, created_by_email)
values ('f3000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'Ana B7', 'ana@b7.sec',
        'B7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'admin@alo.b7');

insert into public.leads (id, full_name, email, partner_id) values
  ('f6000000-0000-0000-0000-00000000000a', 'Ana B7', 'ana@b7.sec', 'f1000000-0000-0000-0000-00000000000a');
insert into public.trip_requests (id, trip_type, cabin_class, lead_id, reference, origin, destination, depart_date, adults, partner_id) values
  ('f7000000-0000-0000-0000-00000000000a', 'one_way', 'economy', 'f6000000-0000-0000-0000-00000000000a', 'WF-B7-001',
   'RAI', 'LIS', current_date + 10, 3, 'f1000000-0000-0000-0000-00000000000a');

insert into public.booking_cases (id, token, partner_id, organisation_id, trip_request_id) values
  ('f4000000-0000-0000-0000-00000000000a', 'tok-b7-m', 'f1000000-0000-0000-0000-00000000000a',
   'f2000000-0000-0000-0000-00000000000a', 'f7000000-0000-0000-0000-00000000000a');

-- ── case_events · o pedido ───────────────────────────────────────────────────

insert into public.case_events (case_id, kind, title, actor_kind, actor_secretary_id) values
  ('f4000000-0000-0000-0000-00000000000a', 'request_submitted', 'Pedido submetido por Ana B7',
   'secretary', 'f3000000-0000-0000-0000-00000000000a');

-- ── ministry_traveller_changes · a ficha registada e depois alterada ────────

do $$
declare v_id uuid;
begin
  insert into public.ministry_travellers (organisation_id, first_name, last_name, passport_number,
                                          created_by_secretary_id, updated_by_secretary_id, last_source, last_case_id)
  values ('f2000000-0000-0000-0000-00000000000a', 'Maria', 'Lopes', 'B7123456',
          'f3000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'secretary',
          'f4000000-0000-0000-0000-00000000000a')
  returning id into v_id;

  update public.ministry_travellers
     set passport_expiry = current_date + 400, last_source = 'secretary',
         updated_by_secretary_id = 'f3000000-0000-0000-0000-00000000000a'
   where id = v_id;
end $$;

-- ── access_audit · a secretária e o pedido de ministério ────────────────────

insert into public.organisation_requests (id, partner_id, name, requested_by_email) values
  ('f5000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-00000000000a', 'B7 Educação', 'admin@alo.b7');

insert into public.access_audit (actor_user_id, actor_email, action, partner_id, target, after) values
  ('f0000000-0000-0000-0000-00000000000a', 'admin@alo.b7', 'secretary_created',
   'f1000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a',
   jsonb_build_object('organisation_id', 'f2000000-0000-0000-0000-00000000000a', 'name', 'Ana B7')),
  ('f0000000-0000-0000-0000-00000000000a', 'admin@alo.b7', 'ministry_requested',
   'f1000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-00000000000a',
   jsonb_build_object('name', 'B7 Educação'));

-- O que a view NÃO deve repetir: já está no case_events pela mesma acção.
insert into public.access_audit (actor_user_id, actor_email, action, partner_id, target, after) values
  ('f0000000-0000-0000-0000-00000000000a', 'admin@alo.b7', 'case_claimed',
   'f1000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-00000000000a',
   jsonb_build_object('claimed_by_email', 'admin@alo.b7'));

create function pg_temp.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU · %', p_label; end if;
  raise notice 'ok · %', p_label;
end $$;

-- Conta linhas como a sessão (ou como `anon`, sem utilizador).
create function pg_temp.count_as(p_user uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  if p_user is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
  execute 'select count(*) from (' || p_sql || ') q' into n;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return n;
end $$;

-- ── G1 · a empresa (Admin do parceiro) vê tudo do seu ministério ───────────

do $$
declare
  admin_alo  uuid := 'f0000000-0000-0000-0000-00000000000a';
  org        text := 'f2000000-0000-0000-0000-00000000000a';
  partner    text := 'f1000000-0000-0000-0000-00000000000a';
  -- O pedido de ministério ainda não tem organisation_id (o ministério nasce
  -- só na aprovação): conta-se pelo parceiro, não pelo ministério.
  q          text := 'select * from public.b2g_activity where partner_id = ''' || 'f1000000-0000-0000-0000-00000000000a' || '''';
begin
  perform pg_temp.ok('G1 · a Alô vê as 5 linhas da sua empresa (pedido + 2 fichas + secretária + pedido de ministério)',
    pg_temp.count_as(admin_alo, q) = 5);
  perform pg_temp.ok('G1 · o pedido (case_event) tem a referência do caso e o autor é a secretária',
    pg_temp.count_as(admin_alo,
      'select 1 from public.b2g_activity where organisation_id = ''' || org || '''' ||
      ' and source = ''case_event'' and case_reference = ''WF-B7-001'' and author = ''Ana B7'' and actor_kind = ''secretary''') = 1);
  perform pg_temp.ok('G1 · a ficha nova e a alteração aparecem, com a secretária como autora',
    pg_temp.count_as(admin_alo,
      'select 1 from public.b2g_activity where organisation_id = ''' || org || '''' ||
      ' and source = ''traveller_change'' and action = ''traveller_registered'' and author = ''Ana B7''') = 1
    and
    pg_temp.count_as(admin_alo,
      'select 1 from public.b2g_activity where organisation_id = ''' || org || '''' ||
      ' and source = ''traveller_change'' and action = ''traveller_changed'' and author = ''Ana B7''') = 1);
  perform pg_temp.ok('G1 · a secretária criada (access_audit) resolve o organisation_id certo pelo target',
    pg_temp.count_as(admin_alo,
      'select 1 from public.b2g_activity where organisation_id = ''' || org || '''' ||
      ' and source = ''access_audit'' and action = ''secretary_created'' and secretary_id = ''f3000000-0000-0000-0000-00000000000a''') = 1);
  perform pg_temp.ok('G1 · o pedido de ministério aparece (sem organisation_id, ainda não existe)',
    pg_temp.count_as(admin_alo,
      'select 1 from public.b2g_activity where source = ''access_audit'' and action = ''ministry_requested'' and organisation_id is null') = 1);
  perform pg_temp.ok('G6 · case_claimed não se repete: só no case_events (zero no access_audit da view)',
    pg_temp.count_as(admin_alo,
      'select 1 from public.b2g_activity where source = ''access_audit'' and action = ''case_claimed''') = 0);
end $$;

-- ── G2 · o master vê o mesmo registo ────────────────────────────────────────

do $$
declare master uuid := 'f0000000-0000-0000-0000-00000000000d';
begin
  perform pg_temp.ok('G2 · o master vê as 5 linhas da Alô (pelo parceiro)',
    pg_temp.count_as(master,
      'select * from public.b2g_activity where partner_id = ''f1000000-0000-0000-0000-00000000000a''') = 5);
  perform pg_temp.ok('G2 · e as 4 do ministério (uma delas, o pedido de ministério, ainda não tem organisation_id)',
    pg_temp.count_as(master,
      'select * from public.b2g_activity where organisation_id = ''f2000000-0000-0000-0000-00000000000a''') = 4);
end $$;

-- ── G3 · outra empresa não vê nada ──────────────────────────────────────────

do $$
declare beta uuid := 'f0000000-0000-0000-0000-00000000000c';
begin
  perform pg_temp.ok('G3 · o Admin da Beta não vê nenhuma linha deste ministério',
    pg_temp.count_as(beta, 'select * from public.b2g_activity where organisation_id = ''f2000000-0000-0000-0000-00000000000a''') = 0);
  perform pg_temp.ok('G3 · nem vendo tudo (sem filtro): zero linhas da Alô',
    pg_temp.count_as(beta, 'select * from public.b2g_activity where partner_id = ''f1000000-0000-0000-0000-00000000000a''') = 0);
end $$;

-- ── G4 · anon não vê nada ────────────────────────────────────────────────────

do $$
begin
  begin
    perform pg_temp.ok('G4 · anon não vê nenhuma linha',
      pg_temp.count_as(null, 'select * from public.b2g_activity') = 0);
  exception when insufficient_privilege then
    raise notice 'ok · G4 · anon não lê a vista (sem permissão)';
  end;
end $$;

-- ── G5 · um agente sem gestão de utilizadores não vê a parte de secretárias ─

do $$
declare agent uuid := 'f0000000-0000-0000-0000-00000000000b';
begin
  perform pg_temp.ok('G5 · o agente da Alô vê o pedido e as fichas (3 linhas)',
    pg_temp.count_as(agent,
      'select * from public.b2g_activity where organisation_id = ''f2000000-0000-0000-0000-00000000000a'' and source <> ''access_audit''') = 3);
  perform pg_temp.ok('G5 · mas não vê a secretária criada nem o pedido de ministério (access_audit)',
    pg_temp.count_as(agent,
      'select * from public.b2g_activity where source = ''access_audit'' and action in (''secretary_created'', ''ministry_requested'')') = 0);
end $$;

rollback;
