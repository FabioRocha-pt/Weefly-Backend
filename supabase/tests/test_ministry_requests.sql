-- B2G-23 · D-10 · o parceiro pede ministérios; só o master os cria.
--
--   R1  uma sessão de parceiro (admin ou agente) não cria nem apaga ministérios
--   R2  o Admin do parceiro muda os limites, e não o nome, o endereço, os logótipos ou o estado
--   R3  o master (cross_partner) cria e muda ministérios de qualquer empresa
--   R4  uma sessão não escreve pedidos de ministério (só a service role)
--   R5  o pedido fica pendente, a empresa vê os seus, a outra não, o master vê todos
--   R6  só depois de aprovado há ministério; recusar pede motivo; aprovar pede o ministério
--   R7  o mesmo nome não fica pendente duas vezes na mesma empresa
--
-- Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'admin@alo.req'),
  ('c0000000-0000-0000-0000-00000000000b', 'agent@alo.req'),
  ('c0000000-0000-0000-0000-00000000000c', 'agent@beta.req'),
  ('c0000000-0000-0000-0000-00000000000d', 'master@weefly.req');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('c1000000-0000-0000-0000-00000000000a', 'alo-req',  'Alô Req',  true, 'white_label', array['B2C', 'B2G']),
  ('c1000000-0000-0000-0000-00000000000b', 'beta-req', 'Beta Req', true, 'reseller',    array['B2C', 'B2G']);

insert into public.organisations (id, partner_id, slug, name) values
  ('c2000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-00000000000a', 'teste-saude', 'TESTE Saúde');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('admin@alo.req',  'Alô admin', 'c1000000-0000-0000-0000-00000000000a', 'partner_admin'),
  ('agent@alo.req',  'Alô agent', 'c1000000-0000-0000-0000-00000000000a', 'partner_agent'),
  ('agent@beta.req', 'Beta',      'c1000000-0000-0000-0000-00000000000b', 'partner_agent');
insert into public.bo_allowlist (email, label, partner_id, role_id, cross_partner) values
  ('master@weefly.req', 'Master', public.default_partner_id(), 'weefly_admin', true);

create function pg_temp.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU · %', p_label; end if;
  raise notice 'ok · %', p_label;
end $$;

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
end $$;

-- ── R1 · R2 · R4 · o parceiro ───────────────────────────────────────────────

do $$
declare n int;
begin
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000a');

  begin
    insert into public.organisations (partner_id, slug, name)
    values ('c1000000-0000-0000-0000-00000000000a', 'teste-quarto', 'TESTE Quarto');
    raise exception 'FALHOU · R1 · o Admin do parceiro criou um ministério';
  exception when insufficient_privilege then
    raise notice 'ok · R1 · o Admin do parceiro não cria ministérios';
  end;

  delete from public.organisations where id = 'c2000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform pg_temp.ok('R1 · nem os apaga', n = 0);

  update public.organisations set alert_threshold_amount = 50000, secretary_sees_balance = true
   where id = 'c2000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform pg_temp.ok('R2 · o Admin do parceiro muda os limites', n = 1);

  begin
    update public.organisations set name = 'Outro nome' where id = 'c2000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · R2 · o parceiro mudou o nome';
  exception when insufficient_privilege then
    raise notice 'ok · R2 · o parceiro não muda o nome';
  end;
  begin
    update public.organisations set slug = 'outro' where id = 'c2000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · R2 · o parceiro mudou o endereço';
  exception when insufficient_privilege then
    raise notice 'ok · R2 · o parceiro não muda o endereço';
  end;
  begin
    update public.organisations set crest_url = 'https://x/brasao.png' where id = 'c2000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · R2 · o parceiro mudou o brasão';
  exception when insufficient_privilege then
    raise notice 'ok · R2 · o parceiro não muda os logótipos';
  end;
  begin
    update public.organisations set active = false where id = 'c2000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · R2 · o parceiro desactivou o ministério';
  exception when insufficient_privilege then
    raise notice 'ok · R2 · o parceiro não desactiva o ministério';
  end;

  begin
    insert into public.organisation_requests (partner_id, name, requested_by_email)
    values ('c1000000-0000-0000-0000-00000000000a', 'TESTE Cultura', 'admin@alo.req');
    raise exception 'FALHOU · R4 · a sessão escreveu um pedido';
  exception when insufficient_privilege then
    raise notice 'ok · R4 · a sessão não escreve pedidos (só a service role)';
  end;
  execute 'reset role';

  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000b');
  begin
    insert into public.organisations (partner_id, slug, name)
    values ('c1000000-0000-0000-0000-00000000000a', 'teste-quinto', 'TESTE Quinto');
    raise exception 'FALHOU · R1 · o agente do parceiro criou um ministério';
  exception when insufficient_privilege then
    raise notice 'ok · R1 · o agente do parceiro não cria ministérios';
  end;
  execute 'reset role';
end $$;

-- ── R5 · R6 · R7 · o pedido ─────────────────────────────────────────────────

-- A service role regista o pedido (a server action, depois da sessão e do canal).
insert into public.organisation_requests (id, partner_id, name, logo_path, crest_path, requested_by_email) values
  ('c3000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-00000000000a', 'TESTE Cultura',
   'ministry-requests/c3/logo.png', 'ministry-requests/c3/crest.png', 'agent@alo.req'),
  ('c3000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-00000000000b', 'TESTE Beta', null, null, 'agent@beta.req');

do $$
declare n int; s text;
begin
  begin
    insert into public.organisation_requests (partner_id, name, requested_by_email)
    values ('c1000000-0000-0000-0000-00000000000a', '  teste cultura ', 'admin@alo.req');
    raise exception 'FALHOU · R7 · o mesmo ministério pendente duas vezes';
  exception when unique_violation then
    raise notice 'ok · R7 · o mesmo nome não fica pendente duas vezes';
  end;

  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000b');
  select status into s from public.organisation_requests where id = 'c3000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('R5 · a Alô vê o seu pedido, pendente', s = 'pending');
  select count(*) into n from public.organisation_requests;
  perform pg_temp.ok('R5 · e não vê o da Beta', n = 1);
  perform pg_temp.ok('R5 · pendente, não há ministério novo na Alô',
    not exists (select 1 from public.organisations where name = 'TESTE Cultura'));
  execute 'reset role';

  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.organisation_requests;
  perform pg_temp.ok('R5 · a Beta vê só o seu', n = 1);
  execute 'reset role';

  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000d');
  select count(*) into n from public.organisation_requests
   where partner_id in ('c1000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-00000000000b')
     and status = 'pending';
  perform pg_temp.ok('R5 · o master vê os pedidos pendentes de todas as empresas', n = 2);

  -- R3 · o master aprova: cria o ministério na empresa que pediu.
  insert into public.organisations (id, partner_id, slug, name, logo_url, crest_url)
  values ('c2000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-00000000000a', 'teste-cultura', 'TESTE Cultura',
          'https://x/logo.png', 'https://x/crest.png');
  perform pg_temp.ok('R3 · o master cria o ministério na empresa que pediu', true);
  update public.organisations set name = 'TESTE Cultura e Desporto' where id = 'c2000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  perform pg_temp.ok('R3 · e muda-lhe o nome', n = 1);
  execute 'reset role';

  begin
    update public.organisation_requests set status = 'approved', decided_at = now(), decided_by_email = 'master@weefly.req'
     where id = 'c3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · R6 · aprovado sem ministério';
  exception when check_violation then
    raise notice 'ok · R6 · aprovar pede o ministério criado';
  end;

  update public.organisation_requests
     set status = 'approved', decided_at = now(), decided_by_email = 'master@weefly.req',
         organisation_id = 'c2000000-0000-0000-0000-00000000000b'
   where id = 'c3000000-0000-0000-0000-00000000000a';

  begin
    update public.organisation_requests set status = 'rejected', decided_at = now(), decided_by_email = 'master@weefly.req'
     where id = 'c3000000-0000-0000-0000-00000000000b';
    raise exception 'FALHOU · R6 · recusado sem motivo';
  exception when check_violation then
    raise notice 'ok · R6 · recusar pede motivo';
  end;
  begin
    update public.organisation_requests set status = 'rejected'
     where id = 'c3000000-0000-0000-0000-00000000000b';
    raise exception 'FALHOU · R6 · decidido sem quem nem quando';
  exception when check_violation then
    raise notice 'ok · R6 · uma decisão diz quem e quando';
  end;
  update public.organisation_requests
     set status = 'rejected', reason = 'Já existe', decided_at = now(), decided_by_email = 'master@weefly.req'
   where id = 'c3000000-0000-0000-0000-00000000000b';

  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000b');
  perform pg_temp.ok('R6 · aprovado, o ministério aparece na Alô',
    exists (select 1 from public.organisations where id = 'c2000000-0000-0000-0000-00000000000b'));
  select status into s from public.organisation_requests where id = 'c3000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('R6 · e a Alô vê o pedido aprovado', s = 'approved');
  execute 'reset role';

  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
  perform pg_temp.ok('R6 · a Beta não vê o ministério da Alô',
    not exists (select 1 from public.organisations where id = 'c2000000-0000-0000-0000-00000000000b'));
  select reason into s from public.organisation_requests where id = 'c3000000-0000-0000-0000-00000000000b';
  perform pg_temp.ok('R6 · a Beta lê o motivo da recusa', s = 'Já existe');
  execute 'reset role';

  insert into public.access_audit (actor_email, action, partner_id, target) values
    ('master@weefly.req', 'ministry_request_approved', 'c1000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('R6 · ministry_request_approved entra no registo', true);
end $$;

do $$ begin raise notice 'ok · test_ministry_requests'; end $$;

rollback;
