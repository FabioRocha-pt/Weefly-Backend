-- B2G-22 · B2G-21 · os clientes VIP, provados na base de dados.
--
--   V1  cada empresa vê só os seus VIP; o master vê os de todas
--   V2  uma sessão não cria, não muda e não apaga VIP (só a service role)
--   V3  o link é único, tem pelo menos 192 bits e não muda
--   V4  um caso com VIP é `vip`; sem VIP não o é; com ministério e VIP não entra
--   V5  o VIP de um caso é da empresa do caso
--   V6  desactivar guarda o histórico; um VIP com casos não se apaga
--   V7  a secretária (sem back-office) não vê VIP
--
-- Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'agent@alo.vip'),
  ('a0000000-0000-0000-0000-00000000000b', 'agent@beta.vip'),
  ('a0000000-0000-0000-0000-00000000000c', 'master@weefly.vip'),
  ('a0000000-0000-0000-0000-00000000000d', 'sec@alo.vip');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('a1000000-0000-0000-0000-00000000000a', 'alo-vip',  'Alô VIP',  true, 'white_label', array['B2C', 'VIP', 'B2G']),
  ('a1000000-0000-0000-0000-00000000000b', 'beta-vip', 'Beta VIP', true, 'reseller',    array['B2C', 'VIP']);

insert into public.organisations (id, partner_id, slug, name) values
  ('a2000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'saude', 'Ministério da Saúde');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('agent@alo.vip',  'Alô',  'a1000000-0000-0000-0000-00000000000a', 'partner_agent'),
  ('agent@beta.vip', 'Beta', 'a1000000-0000-0000-0000-00000000000b', 'partner_agent');
insert into public.bo_allowlist (email, label, partner_id, role_id, organisation_id) values
  ('sec@alo.vip',    'Sec',  'a1000000-0000-0000-0000-00000000000a', 'secretary', 'a2000000-0000-0000-0000-00000000000a');
insert into public.bo_allowlist (email, label, partner_id, role_id, cross_partner) values
  ('master@weefly.vip', 'Master', public.default_partner_id(), 'weefly_admin', true);

insert into public.vip_clients (id, partner_id, name, email, phone, level, link_token, created_by_email) values
  ('a3000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Cliente Ouro', 'ouro@cliente.vip', '+2389911111', 'Ouro',
   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAa', 'agent@alo.vip'),
  ('a3000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-00000000000a', 'Cliente Prata', null, null, null,
   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAb', 'agent@alo.vip'),
  ('a3000000-0000-0000-0000-00000000000c', 'a1000000-0000-0000-0000-00000000000b', 'Cliente Beta', null, null, null,
   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAc', 'agent@beta.vip');

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

-- ── V1 · V2 · V7 · como cada sessão ─────────────────────────────────────────

do $$
declare n int;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  select count(*) into n from public.vip_clients;
  perform pg_temp.ok('V1 · a Alô vê os seus dois VIP', n = 2);
  perform pg_temp.ok('V1 · e não vê o da Beta',
    not exists (select 1 from public.vip_clients where id = 'a3000000-0000-0000-0000-00000000000c'));

  begin
    insert into public.vip_clients (partner_id, name, link_token)
    values ('a1000000-0000-0000-0000-00000000000a', 'Pela sessão', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
    raise exception 'FALHOU · V2 · a sessão criou um VIP';
  exception when insufficient_privilege then
    raise notice 'ok · V2 · a sessão não cria VIP';
  end;

  begin
    update public.vip_clients set name = 'Mudado' where id = 'a3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · V2 · a sessão mudou um VIP';
  exception when insufficient_privilege then
    raise notice 'ok · V2 · a sessão não muda VIP';
  end;

  begin
    delete from public.vip_clients where id = 'a3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · V2 · a sessão apagou um VIP';
  exception when insufficient_privilege then
    raise notice 'ok · V2 · a sessão não apaga VIP';
  end;
  execute 'reset role';

  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.vip_clients;
  perform pg_temp.ok('V1 · a Beta vê só o seu', n = 1);
  execute 'reset role';

  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.vip_clients
   where partner_id in ('a1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000b');
  perform pg_temp.ok('V1 · o master vê os VIP de todas as empresas', n = 3);
  execute 'reset role';

  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000d');
  select count(*) into n from public.vip_clients;
  perform pg_temp.ok('V7 · a secretária não vê VIP', n = 0);
  execute 'reset role';
end $$;

-- ── V3 · o link ─────────────────────────────────────────────────────────────

do $$
begin
  begin
    insert into public.vip_clients (partner_id, name, link_token)
    values ('a1000000-0000-0000-0000-00000000000b', 'Repetido', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAa');
    raise exception 'FALHOU · V3 · dois VIP com o mesmo link';
  exception when unique_violation then
    raise notice 'ok · V3 · o link é único, também entre empresas';
  end;

  begin
    insert into public.vip_clients (partner_id, name, link_token)
    values ('a1000000-0000-0000-0000-00000000000a', 'Curto', 'abc123');
    raise exception 'FALHOU · V3 · um link curto entrou';
  exception when check_violation then
    raise notice 'ok · V3 · um link com menos de 192 bits é recusado';
  end;

  begin
    update public.vip_clients set link_token = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
     where id = 'a3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · V3 · o link mudou';
  exception when check_violation then
    raise notice 'ok · V3 · o link é permanente';
  end;

  begin
    update public.vip_clients set partner_id = 'a1000000-0000-0000-0000-00000000000b'
     where id = 'a3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · V3 · o VIP mudou de empresa';
  exception when check_violation then
    raise notice 'ok · V3 · o VIP não muda de empresa';
  end;
end $$;

-- ── V4 · V5 · o caso ────────────────────────────────────────────────────────

do $$
declare c text;
begin
  insert into public.booking_cases (id, token, partner_id, vip_client_id) values
    ('a4000000-0000-0000-0000-00000000000a', 'tok-vip-1', 'a1000000-0000-0000-0000-00000000000a',
     'a3000000-0000-0000-0000-00000000000a');
  select channel into c from public.booking_cases where id = 'a4000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('V4 · um caso com VIP nasce vip', c = 'vip');

  update public.booking_cases set channel = 'publico' where id = 'a4000000-0000-0000-0000-00000000000a';
  select channel into c from public.booking_cases where id = 'a4000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('V4 · e não deixa de o ser', c = 'vip');

  insert into public.booking_cases (id, token, partner_id, channel) values
    ('a4000000-0000-0000-0000-00000000000b', 'tok-vip-2', 'a1000000-0000-0000-0000-00000000000a', 'vip');
  select channel into c from public.booking_cases where id = 'a4000000-0000-0000-0000-00000000000b';
  perform pg_temp.ok('V4 · sem VIP não é vip', c = 'publico');

  begin
    insert into public.booking_cases (id, token, partner_id, organisation_id, vip_client_id) values
      ('a4000000-0000-0000-0000-00000000000c', 'tok-vip-3', 'a1000000-0000-0000-0000-00000000000a',
       'a2000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-00000000000b');
    raise exception 'FALHOU · V4 · um caso com ministério e VIP entrou';
  exception when check_violation then
    raise notice 'ok · V4 · ministério e VIP ao mesmo tempo é recusado';
  end;

  begin
    insert into public.booking_cases (id, token, partner_id, vip_client_id) values
      ('a4000000-0000-0000-0000-00000000000d', 'tok-vip-4', 'a1000000-0000-0000-0000-00000000000b',
       'a3000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU · V5 · um caso da Beta com um VIP da Alô';
  exception when foreign_key_violation then
    raise notice 'ok · V5 · o VIP do caso é da empresa do caso';
  end;

  -- V6 · desactivar: o link morre (active = false), o caso fica.
  update public.vip_clients
     set active = false, deactivated_at = now(), deactivated_by_email = 'agent@alo.vip'
   where id = 'a3000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('V6 · desactivado, o caso continua do VIP',
    exists (select 1 from public.booking_cases
             where id = 'a4000000-0000-0000-0000-00000000000a'
               and vip_client_id = 'a3000000-0000-0000-0000-00000000000a'
               and channel = 'vip'));

  begin
    update public.vip_clients set active = false, deactivated_at = null
     where id = 'a3000000-0000-0000-0000-00000000000b';
    raise exception 'FALHOU · V6 · inactivo sem data';
  exception when check_violation then
    raise notice 'ok · V6 · inactivo leva a data';
  end;

  begin
    delete from public.vip_clients where id = 'a3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · V6 · um VIP com casos foi apagado';
  exception when foreign_key_violation then
    raise notice 'ok · V6 · um VIP com casos não se apaga';
  end;

  -- O registo aceita as acções VIP.
  insert into public.access_audit (actor_email, action, partner_id, target) values
    ('agent@alo.vip', 'vip_deactivated', 'a1000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('V6 · vip_deactivated entra no registo', true);
end $$;

-- V1 · a sessão da Alô vê o caso VIP e o VIP dele na mesma leitura.
do $$
declare n text;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  select v.name into n
    from public.booking_cases c join public.vip_clients v on v.id = c.vip_client_id
   where c.id = 'a4000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('V1 · a Alô lê o VIP do seu caso', n = 'Cliente Ouro');
  execute 'reset role';

  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000b');
  perform pg_temp.ok('V1 · a Beta não vê o caso VIP da Alô',
    not exists (select 1 from public.booking_cases where id = 'a4000000-0000-0000-0000-00000000000a'));
  execute 'reset role';
end $$;

do $$ begin raise notice 'ok · test_vip'; end $$;

rollback;
