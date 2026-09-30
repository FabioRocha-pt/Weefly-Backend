-- PAR-03 · PAR-07 · a bolsa, provada na base de dados.
--
--   C2  crédito de 100 000 → saldo 100 000
--   C4  débito de 85 000   → saldo 15 000
--   C5  débito de 20 000   → recusado, saldo intacto
--   C6  estorno do débito  → saldo 100 000, e só uma vez
--
-- E: os movimentos não se alteram; o Alô vê só os seus; um agente não gere
-- ministérios. Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('80000000-0000-0000-0000-00000000000a', 'admin@alo.b2g'),
  ('80000000-0000-0000-0000-00000000000b', 'agent@alo.b2g'),
  ('80000000-0000-0000-0000-00000000000c', 'agent@beta.b2g');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('81000000-0000-0000-0000-00000000000a', 'alo-b2g',  'Alô B2G',  true, 'white_label', array['B2G']),
  ('81000000-0000-0000-0000-00000000000b', 'beta-b2g', 'Beta B2G', true, 'reseller',    array['B2C']);

insert into public.organisations (id, partner_id, slug, name) values
  ('82000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-00000000000a', 'teste', 'Ministério de Teste');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('admin@alo.b2g',  'Admin', '81000000-0000-0000-0000-00000000000a', 'partner_admin'),
  ('agent@alo.b2g',  'Agent', '81000000-0000-0000-0000-00000000000a', 'partner_agent'),
  ('agent@beta.b2g', 'Beta',  '81000000-0000-0000-0000-00000000000b', 'partner_agent');

insert into public.booking_cases (id, token, partner_id, organisation_id) values
  ('83000000-0000-0000-0000-00000000000a', 'tok-b2g-1', '81000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-00000000000a'),
  ('83000000-0000-0000-0000-00000000000b', 'tok-b2g-2', '81000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-00000000000a'),
  ('83000000-0000-0000-0000-00000000000c', 'tok-b2g-3', '81000000-0000-0000-0000-00000000000a', null);

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
declare org uuid := '82000000-0000-0000-0000-00000000000a'; d uuid;
begin
  insert into public.budget_movements (organisation_id, partner_id, kind, delta, document_ref, created_by_email)
  values (org, '81000000-0000-0000-0000-00000000000a', 'credit', 100000, 'CARTA-001', 'admin@alo.b2g');
  perform pg_temp.ok('C2 · crédito de 100 000', public.organisation_balance(org) = 100000);

  d := public.budget_debit(org, '83000000-0000-0000-0000-00000000000a', 85000, null, 'agent@alo.b2g', 'PAG-1');
  perform pg_temp.ok('C4 · débito de 85 000 deixa 15 000', public.organisation_balance(org) = 15000);

  begin
    perform public.budget_debit(org, '83000000-0000-0000-0000-00000000000b', 20000, null, 'agent@alo.b2g', 'PAG-2');
    raise exception 'FALHOU · débito acima do saldo passou';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
    perform pg_temp.ok('C5 · débito acima do saldo recusado', public.organisation_balance(org) = 15000);
  end;

  begin
    perform public.budget_debit(org, '83000000-0000-0000-0000-00000000000c', 1000, null, 'x', null);
    raise exception 'FALHOU · débito de um caso sem ministério';
  exception when check_violation then
    perform pg_temp.ok('um caso de outro ministério não desconta', true);
  end;

  insert into public.budget_movements (organisation_id, partner_id, kind, delta, case_id, reverses_id, reason, created_by_email)
  values (org, '81000000-0000-0000-0000-00000000000a', 'reversal', 85000, '83000000-0000-0000-0000-00000000000a', d, 'reverter', 'admin@alo.b2g');
  perform pg_temp.ok('C6 · estorno repõe 100 000', public.organisation_balance(org) = 100000);

  begin
    insert into public.budget_movements (organisation_id, partner_id, kind, delta, case_id, reverses_id, reason, created_by_email)
    values (org, '81000000-0000-0000-0000-00000000000a', 'reversal', 85000, '83000000-0000-0000-0000-00000000000a', d, 'outra vez', 'x');
    raise exception 'FALHOU · o mesmo débito estornado duas vezes';
  exception when unique_violation then
    perform pg_temp.ok('um débito só se estorna uma vez', true);
  end;

  begin
    update public.budget_movements set delta = 1 where organisation_id = org;
    raise exception 'FALHOU · movimento alterado';
  exception when insufficient_privilege then
    perform pg_temp.ok('os movimentos não se alteram', true);
  end;
end $$;

do $$
declare mine bigint; theirs bigint; wrote boolean := true; bal boolean := true;
begin
  perform pg_temp.as_user('80000000-0000-0000-0000-00000000000b');
  select count(*) into mine from public.budget_movements;
  begin
    update public.organisations set name = 'pirata' where slug = 'teste';
    get diagnostics theirs = row_count;
    wrote := theirs > 0;
  exception when insufficient_privilege then wrote := false;
  end;
  begin
    perform public.organisation_balance('82000000-0000-0000-0000-00000000000a');
  exception when insufficient_privilege then bal := false;
  end;
  reset role;
  perform pg_temp.ok('o agente do Alô vê os movimentos do Alô', mine = 3);
  perform pg_temp.ok('o agente do Alô não gere ministérios', not wrote);
  perform pg_temp.ok('o saldo não se pede de fora do servidor', not bal);

  perform pg_temp.as_user('80000000-0000-0000-0000-00000000000c');
  select count(*) into theirs from public.budget_movements;
  reset role;
  perform pg_temp.ok('a Beta não vê a bolsa do Alô', theirs = 0);

  perform pg_temp.as_user('80000000-0000-0000-0000-00000000000a');
  update public.organisations set alert_threshold_amount = 20000 where slug = 'teste';
  get diagnostics theirs = row_count;
  reset role;
  perform pg_temp.ok('o Admin do parceiro gere os seus ministérios', theirs = 1);
end $$;

do $$ begin raise notice 'ok · test_b2g'; end $$;

rollback;
