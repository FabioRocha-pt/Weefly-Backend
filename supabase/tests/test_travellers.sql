-- DAT-01 · DAT-02 · ADM-04 · a 0030, provada na base de dados.
--
--   T1  criar uma ficha escreve o histórico, com o parceiro do ministério
--   T2  mudar a ficha escreve o antes e o depois; gravar igual não escreve
--   T3  o histórico não se altera nem se apaga
--   T4  o mesmo passaporte duas vezes no mesmo ministério é recusado
--   T5  a Beta não vê as fichas do Alô; o Alô vê as suas
--   T6  as intervenções só o Admin WeeFly as lê
--
-- Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-00000000000a', 'agent@alo.dat'),
  ('90000000-0000-0000-0000-00000000000b', 'agent@beta.dat'),
  ('90000000-0000-0000-0000-00000000000c', 'boss@weefly.dat');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('91000000-0000-0000-0000-00000000000a', 'alo-dat',  'Alô DAT',  true, 'white_label', array['B2G']),
  ('91000000-0000-0000-0000-00000000000b', 'beta-dat', 'Beta DAT', true, 'reseller',    array['B2C']);

insert into public.organisations (id, partner_id, slug, name) values
  ('92000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'teste-dat', 'Ministério DAT');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('agent@alo.dat',   'Alô',  '91000000-0000-0000-0000-00000000000a', 'partner_agent'),
  ('agent@beta.dat',  'Beta', '91000000-0000-0000-0000-00000000000b', 'partner_agent'),
  ('boss@weefly.dat', 'Boss', public.default_partner_id(),             'weefly_admin');

insert into public.booking_cases (id, token, partner_id, organisation_id) values
  ('93000000-0000-0000-0000-00000000000a', 'tok-dat-1', '91000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-00000000000a');

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

do $$
declare
  org uuid := '92000000-0000-0000-0000-00000000000a';
  tr  uuid;
  n   int;
  p   uuid;
begin
  -- O parceiro vem do ministério, mesmo que a escrita diga outro.
  insert into public.ministry_travellers (organisation_id, partner_id, first_name, last_name, passport_number, passport_expiry, updated_by_email)
  values (org, '91000000-0000-0000-0000-00000000000b', 'Maria', 'Lopes', 'CV12345', current_date + 90, 'sec@m.cv')
  returning id, partner_id into tr, p;
  select count(*) into n from public.ministry_traveller_changes where traveller_id = tr and before is null;
  perform pg_temp.ok('T1 · a ficha nova escreve o histórico', n = 1);
  perform pg_temp.ok('T1 · o parceiro é o do ministério', p = '91000000-0000-0000-0000-00000000000a');

  update public.ministry_travellers set passport_expiry = current_date + 900, last_source = 'backoffice', updated_by_email = 'agent@alo.dat' where id = tr;
  select count(*) into n from public.ministry_traveller_changes
   where traveller_id = tr and source = 'backoffice' and (before ->> 'passport_expiry') is not null
     and (after ->> 'passport_expiry') = (current_date + 900)::text;
  perform pg_temp.ok('T2 · a alteração guarda o antes e o depois', n = 1);

  update public.ministry_travellers set expiry_alerted_for = current_date + 900 where id = tr;
  select count(*) into n from public.ministry_traveller_changes where traveller_id = tr;
  perform pg_temp.ok('T2 · o que não são dados não escreve histórico', n = 2);

  begin
    update public.ministry_traveller_changes set after = '{}'::jsonb where traveller_id = tr;
    raise exception 'FALHOU · histórico alterado';
  exception when check_violation then
    perform pg_temp.ok('T3 · o histórico não se altera', true);
  end;
  begin
    delete from public.ministry_traveller_changes where traveller_id = tr;
    raise exception 'FALHOU · histórico apagado';
  exception when check_violation then
    perform pg_temp.ok('T3 · o histórico não se apaga', true);
  end;

  begin
    insert into public.ministry_travellers (organisation_id, partner_id, first_name, last_name, passport_number)
    values (org, '91000000-0000-0000-0000-00000000000a', 'Outra', 'Pessoa', 'cv12345');
    raise exception 'FALHOU · passaporte repetido no ministério';
  exception when unique_violation then
    perform pg_temp.ok('T4 · um passaporte, uma ficha por ministério', true);
  end;

  insert into public.admin_interventions (case_id, partner_id, user_id, email, reason, expires_at)
  values ('93000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a',
          '90000000-0000-0000-0000-00000000000c', 'boss@weefly.dat', 'pedido do parceiro', now() + interval '4 hours');
end $$;

do $$
declare mine int; theirs int; iv_partner int; iv_admin int;
begin
  perform pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
  select count(*) into mine from public.ministry_travellers;
  select count(*) into iv_partner from public.admin_interventions;
  reset role;

  perform pg_temp.as_user('90000000-0000-0000-0000-00000000000b');
  select count(*) into theirs from public.ministry_travellers;
  reset role;

  perform pg_temp.as_user('90000000-0000-0000-0000-00000000000c');
  select count(*) into iv_admin from public.admin_interventions;
  reset role;

  perform pg_temp.ok('T5 · o Alô vê as suas fichas', mine = 1);
  perform pg_temp.ok('T5 · a Beta não vê as fichas do Alô', theirs = 0);
  perform pg_temp.ok('T6 · uma conta de parceiro não vê as intervenções', iv_partner = 0);
  perform pg_temp.ok('T6 · o Admin WeeFly vê as intervenções', iv_admin = 1);
end $$;

do $$ begin raise notice 'ok · test_travellers'; end $$;

rollback;
