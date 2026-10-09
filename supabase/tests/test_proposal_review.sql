-- B2G-15 · B2G-16 · B2G-17 · D-2 · a revisão da empresa, provada na base de dados.
--
--   P1  um agente da empresa não envia para revisão (não é o master); o master
--       não publica directamente uma proposta de ministério de outra empresa
--   P2  o master envia à empresa para revisão: estado, carimbo, case_events e
--       access_audit; enviar outra vez não duplica
--   P3  outra empresa não vê nem mexe na proposta em revisão
--   P4  o agente da empresa do caso edita uma oferta e publica; fica quem reviu
--   P5  a secretária (conta) e `anon` não veem rascunho, revisão nem publicada
--       pela sessão (o servidor só lê a `publicada`, pela service role)
--   P6  o master no operador e no canal público publica directamente; nesses
--       não há revisão; só se vai à revisão a partir do rascunho
--   P7  pronto a emitir (`ready_to_issue_at`) e a mistura real de passageiros
--       (D-7: só crianças é possível; zero pessoas não)
--   P8  a ficha do viajante aceita a origem `secretary`
--
-- Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-00000000000a', 'master@weefly.rev'),
  ('e0000000-0000-0000-0000-00000000000b', 'agent@alo.rev'),
  ('e0000000-0000-0000-0000-00000000000c', 'agent2@alo.rev'),
  ('e0000000-0000-0000-0000-00000000000d', 'agent@beta.rev'),
  ('e0000000-0000-0000-0000-00000000000e', 'sec@alo.rev'),
  ('e0000000-0000-0000-0000-00000000000f', 'agent@weefly.rev');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('e1000000-0000-0000-0000-00000000000a', 'alo-rev',  'Alô REV',  true, 'white_label', array['B2C', 'B2G']),
  ('e1000000-0000-0000-0000-00000000000b', 'beta-rev', 'Beta REV', true, 'reseller',    array['B2C', 'B2G']);

insert into public.organisations (id, partner_id, slug, name) values
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-00000000000a', 'rev-saude', 'REV Saúde'),
  ('e2000000-0000-0000-0000-00000000000f', public.default_partner_id(),            'rev-wf',    'REV WeeFly');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('master@weefly.rev', 'Dominik REV',   public.default_partner_id(),            'weefly_admin'),
  ('agent@weefly.rev',  'Agente WeeFly', public.default_partner_id(),            'weefly_agent'),
  ('agent@alo.rev',     'Agente Alô',    'e1000000-0000-0000-0000-00000000000a', 'partner_agent'),
  ('agent2@alo.rev',    'Agente Alô 2',  'e1000000-0000-0000-0000-00000000000a', 'partner_agent'),
  ('agent@beta.rev',    'Agente Beta',   'e1000000-0000-0000-0000-00000000000b', 'partner_agent');

insert into public.bo_allowlist (email, label, partner_id, role_id, organisation_id) values
  ('sec@alo.rev', 'Sec', 'e1000000-0000-0000-0000-00000000000a', 'secretary', 'e2000000-0000-0000-0000-00000000000a');

-- M: ministério da Alô · P: público da Alô · W: ministério da WeeFly (operador)
insert into public.booking_cases (id, token, partner_id, organisation_id) values
  ('e3000000-0000-0000-0000-0000000000aa', 'tok-rev-m', 'e1000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a'),
  ('e3000000-0000-0000-0000-0000000000ab', 'tok-rev-p', 'e1000000-0000-0000-0000-00000000000a', null),
  ('e3000000-0000-0000-0000-0000000000ff', 'tok-rev-w', public.default_partner_id(),            'e2000000-0000-0000-0000-00000000000f');

insert into public.case_proposals (id, case_id) values
  ('e4000000-0000-0000-0000-0000000000aa', 'e3000000-0000-0000-0000-0000000000aa'),
  ('e4000000-0000-0000-0000-0000000000ab', 'e3000000-0000-0000-0000-0000000000ab'),
  ('e4000000-0000-0000-0000-0000000000ff', 'e3000000-0000-0000-0000-0000000000ff');

insert into public.case_offers (id, proposal_id, name, price_adult, cost_total) values
  ('e5000000-0000-0000-0000-0000000000aa', 'e4000000-0000-0000-0000-0000000000aa', 'TP Lisboa', 5000000, 4200000),
  ('e5000000-0000-0000-0000-0000000000ab', 'e4000000-0000-0000-0000-0000000000ab', 'TP Lisboa', 5000000, 4200000),
  ('e5000000-0000-0000-0000-0000000000ff', 'e4000000-0000-0000-0000-0000000000ff', 'TP Lisboa', 5000000, 4200000);

create function pg_temp.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU · %', p_label; end if;
  raise notice 'ok · %', p_label;
end $$;

-- Corre `p_sql` como a sessão `p_user` (como o PostgREST) e devolve o jsonb.
create function pg_temp.call_as(p_user uuid, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute 'set local role authenticated';
  execute p_sql into r;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return r;
end $$;

-- Corre uma escrita como a sessão; devolve quantas linhas mudou.
create function pg_temp.exec_as(p_user uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute 'set local role authenticated';
  execute p_sql;
  get diagnostics n = row_count;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return n;
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

-- ── P1 · quem não pode ──────────────────────────────────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as('e0000000-0000-0000-0000-00000000000b',
    'select public.request_proposal_review(''e3000000-0000-0000-0000-0000000000aa''::uuid)');
  perform pg_temp.ok('P1 · o agente da Alô não envia para revisão (não é o master)', r->>'outcome' = 'forbidden');

  r := pg_temp.call_as('e0000000-0000-0000-0000-00000000000d',
    'select public.request_proposal_review(''e3000000-0000-0000-0000-0000000000aa''::uuid)');
  perform pg_temp.ok('P1 · a Beta não vê o caso', r->>'outcome' = 'not_found');

  begin
    perform pg_temp.exec_as('e0000000-0000-0000-0000-00000000000a',
      'update public.case_proposals set status = ''publicada'', published_at = now() where id = ''e4000000-0000-0000-0000-0000000000aa''');
    raise exception 'FALHOU · P1 · o master publicou directamente um ministério da Alô';
  exception when check_violation then
    raise notice 'ok · P1 · o master não publica directamente um ministério de outra empresa (D-2)';
  end;

  begin
    perform pg_temp.exec_as('e0000000-0000-0000-0000-00000000000b',
      'update public.case_proposals set status = ''revisao_parceiro'' where id = ''e4000000-0000-0000-0000-0000000000aa''');
    raise exception 'FALHOU · P1 · o agente da Alô pôs a proposta em revisão';
  exception when check_violation then
    raise notice 'ok · P1 · revisao_parceiro à mão por quem não é o master: recusado';
  end;

  perform pg_temp.ok('P1 · a proposta continua em rascunho',
    (select status from public.case_proposals where id = 'e4000000-0000-0000-0000-0000000000aa') = 'rascunho');
end $$;

-- ── P2 · o master envia à empresa ───────────────────────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as('e0000000-0000-0000-0000-00000000000a',
    'select public.request_proposal_review(''e3000000-0000-0000-0000-0000000000aa''::uuid)');
  perform pg_temp.ok('P2 · o master envia para revisão', r->>'outcome' = 'requested');
  perform pg_temp.ok('P2 · estado revisao_parceiro, com quem e quando',
    exists (select 1 from public.case_proposals where id = 'e4000000-0000-0000-0000-0000000000aa'
             and status = 'revisao_parceiro' and review_requested_by_email = 'master@weefly.rev'
             and review_requested_at is not null and reviewed_at is null));
  perform pg_temp.ok('P2 · proposal_review_requested no case_events (staff, com o email)',
    (select count(*) from public.case_events where case_id = 'e3000000-0000-0000-0000-0000000000aa'
      and kind = 'proposal_review_requested' and actor_kind = 'staff'
      and actor_email = 'master@weefly.rev' and actor_id = 'e0000000-0000-0000-0000-00000000000a') = 1);
  perform pg_temp.ok('P2 · proposal_review_requested no access_audit, na empresa do caso',
    (select count(*) from public.access_audit where action = 'proposal_review_requested'
      and target = 'e3000000-0000-0000-0000-0000000000aa'
      and partner_id = 'e1000000-0000-0000-0000-00000000000a') = 1);

  r := pg_temp.call_as('e0000000-0000-0000-0000-00000000000a',
    'select public.request_proposal_review(''e3000000-0000-0000-0000-0000000000aa''::uuid)');
  perform pg_temp.ok('P2 · enviar outra vez não duplica', r->>'outcome' = 'already'
    and (select count(*) from public.case_events where case_id = 'e3000000-0000-0000-0000-0000000000aa'
          and kind = 'proposal_review_requested') = 1);

  begin
    perform pg_temp.exec_as('e0000000-0000-0000-0000-00000000000a',
      'update public.case_proposals set status = ''publicada'' where id = ''e4000000-0000-0000-0000-0000000000aa''');
    raise exception 'FALHOU · P2 · o master publicou a proposta em revisão';
  exception when check_violation then
    raise notice 'ok · P2 · o master não publica a proposta em revisão';
  end;
end $$;

-- ── P3 · outra empresa não vê nem mexe ──────────────────────────────────────

do $$
begin
  perform pg_temp.ok('P3 · a Beta não vê a proposta em revisão',
    pg_temp.count_as('e0000000-0000-0000-0000-00000000000d',
      'select 1 from public.case_proposals where id = ''e4000000-0000-0000-0000-0000000000aa''') = 0);
  perform pg_temp.ok('P3 · nem as ofertas',
    pg_temp.count_as('e0000000-0000-0000-0000-00000000000d',
      'select 1 from public.case_offers where proposal_id = ''e4000000-0000-0000-0000-0000000000aa''') = 0);
  perform pg_temp.ok('P3 · a Beta não publica (0 linhas)',
    pg_temp.exec_as('e0000000-0000-0000-0000-00000000000d',
      'update public.case_proposals set status = ''publicada'' where id = ''e4000000-0000-0000-0000-0000000000aa''') = 0);
  perform pg_temp.ok('P3 · nem muda o preço (0 linhas)',
    pg_temp.exec_as('e0000000-0000-0000-0000-00000000000d',
      'update public.case_offers set price_adult = 1 where id = ''e5000000-0000-0000-0000-0000000000aa''') = 0);
  perform pg_temp.ok('P3 · um agente WeeFly (sem ser master) também não',
    pg_temp.count_as('e0000000-0000-0000-0000-00000000000f',
      'select 1 from public.case_proposals where id = ''e4000000-0000-0000-0000-0000000000aa''') = 0);
  perform pg_temp.ok('P3 · continua em revisão e com o preço do master',
    (select status from public.case_proposals where id = 'e4000000-0000-0000-0000-0000000000aa') = 'revisao_parceiro'
    and (select price_adult from public.case_offers where id = 'e5000000-0000-0000-0000-0000000000aa') = 5000000);
end $$;

-- ── P5 · a secretária e o anon não veem nada pela sessão ────────────────────

do $$
begin
  perform pg_temp.ok('P5 · a conta da secretária não vê a proposta em revisão',
    pg_temp.count_as('e0000000-0000-0000-0000-00000000000e',
      'select 1 from public.case_proposals where case_id = ''e3000000-0000-0000-0000-0000000000aa''') = 0);
  perform pg_temp.ok('P5 · nem as ofertas (nem o custo)',
    pg_temp.count_as('e0000000-0000-0000-0000-00000000000e',
      'select 1 from public.case_offers where proposal_id = ''e4000000-0000-0000-0000-0000000000aa''') = 0);
  -- Sem política para `anon`: zero linhas (ou nem a permissão de ler).
  begin
    perform pg_temp.ok('P5 · anon não lê propostas',
      pg_temp.count_as(null, 'select 1 from public.case_proposals') = 0);
    perform pg_temp.ok('P5 · nem ofertas',
      pg_temp.count_as(null, 'select 1 from public.case_offers') = 0);
  exception when insufficient_privilege then
    raise notice 'ok · P5 · anon não lê propostas (sem permissão)';
  end;
end $$;

-- ── P4 · a empresa revê e envia ─────────────────────────────────────────────

do $$
begin
  perform pg_temp.ok('P4 · outro agente da Alô (não dono) edita o preço em revisão',
    pg_temp.exec_as('e0000000-0000-0000-0000-00000000000c',
      'update public.case_offers set price_adult = 5200000 where id = ''e5000000-0000-0000-0000-0000000000aa''') = 1);
  perform pg_temp.ok('P4 · e publica (envia à secretária)',
    pg_temp.exec_as('e0000000-0000-0000-0000-00000000000c',
      'update public.case_proposals set status = ''publicada'', published_at = now() where id = ''e4000000-0000-0000-0000-0000000000aa''') = 1);
  perform pg_temp.ok('P4 · fica quem reviu e quando; o pedido do master continua lá',
    exists (select 1 from public.case_proposals where id = 'e4000000-0000-0000-0000-0000000000aa'
             and status = 'publicada' and reviewed_by_email = 'agent2@alo.rev' and reviewed_at is not null
             and review_requested_by_email = 'master@weefly.rev'));
  perform pg_temp.ok('P5 · publicada, a secretária continua a não a ler pela sessão',
    pg_temp.count_as('e0000000-0000-0000-0000-00000000000e',
      'select 1 from public.case_proposals where case_id = ''e3000000-0000-0000-0000-0000000000aa''') = 0);
end $$;

-- ── P6 · o operador e o público ─────────────────────────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as('e0000000-0000-0000-0000-00000000000a',
    'select public.request_proposal_review(''e3000000-0000-0000-0000-0000000000ff''::uuid)');
  perform pg_temp.ok('P6 · num ministério do operador não há revisão', r->>'outcome' = 'forbidden');
  r := pg_temp.call_as('e0000000-0000-0000-0000-00000000000a',
    'select public.request_proposal_review(''e3000000-0000-0000-0000-0000000000ab''::uuid)');
  perform pg_temp.ok('P6 · num pedido público da Alô também não (só ministérios)', r->>'outcome' = 'forbidden');

  perform pg_temp.ok('P6 · o master publica directamente o ministério do operador',
    pg_temp.exec_as('e0000000-0000-0000-0000-00000000000a',
      'update public.case_proposals set status = ''publicada'', published_at = now() where id = ''e4000000-0000-0000-0000-0000000000ff''') = 1);
  perform pg_temp.ok('P6 · e o público da Alô (como antes)',
    pg_temp.exec_as('e0000000-0000-0000-0000-00000000000a',
      'update public.case_proposals set status = ''publicada'', published_at = now() where id = ''e4000000-0000-0000-0000-0000000000ab''') = 1);

  begin
    perform pg_temp.exec_as('e0000000-0000-0000-0000-00000000000a',
      'update public.case_proposals set status = ''revisao_parceiro'' where id = ''e4000000-0000-0000-0000-0000000000ff''');
    raise exception 'FALHOU · P6 · publicada → revisao_parceiro aceite';
  exception when check_violation then
    raise notice 'ok · P6 · só se vai à revisão a partir do rascunho (e de outra empresa)';
  end;

  begin
    update public.case_proposals set status = 'pendente' where id = 'e4000000-0000-0000-0000-0000000000ff';
    raise exception 'FALHOU · P6 · estado inventado aceite';
  exception when check_violation then
    raise notice 'ok · P6 · só rascunho, revisao_parceiro e publicada';
  end;
end $$;

-- ── P7 · pronto a emitir e a mistura de passageiros ─────────────────────────

do $$
begin
  update public.booking_cases set ready_to_issue_at = now() where id = 'e3000000-0000-0000-0000-0000000000aa';
  perform pg_temp.ok('P7 · ready_to_issue_at no caso',
    (select ready_to_issue_at is not null from public.booking_cases where id = 'e3000000-0000-0000-0000-0000000000aa'));

  insert into public.leads (id, full_name, email, partner_id) values
    ('e6000000-0000-0000-0000-00000000000a', 'Sec REV', 'sec@alo.rev', 'e1000000-0000-0000-0000-00000000000a');
  insert into public.trip_requests (id, trip_type, cabin_class, lead_id, origin, destination, depart_date, adults, partner_id) values
    ('e7000000-0000-0000-0000-00000000000a', 'one_way', 'economy', 'e6000000-0000-0000-0000-00000000000a', 'RAI', 'LIS',
     current_date + 10, 12, 'e1000000-0000-0000-0000-00000000000a');

  update public.trip_requests set adults = 0, children = 11, infants_on_lap = 1, infants = 1
   where id = 'e7000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('P7 · D-7 · 12 pessoas: 0 adultos, 11 crianças, 1 bebé',
    (select adults + children + infants_on_lap from public.trip_requests where id = 'e7000000-0000-0000-0000-00000000000a') = 12);

  begin
    update public.trip_requests set adults = 0, children = 0, infants_on_lap = 0, infants = 0
     where id = 'e7000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · P7 · pedido sem ninguém aceite';
  exception when check_violation then
    raise notice 'ok · P7 · um pedido tem pelo menos uma pessoa';
  end;
end $$;

-- ── P8 · a ficha corrigida pela secretária ──────────────────────────────────

do $$
declare v_sec uuid; v_id uuid;
begin
  insert into public.ministry_secretaries (organisation_id, name, email, link_token, created_by_email)
  values ('e2000000-0000-0000-0000-00000000000a', 'Ana REV', 'ana@rev.sec', 'REVaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 't@rev')
  returning id into v_sec;

  insert into public.ministry_travellers (organisation_id, first_name, last_name, passport_number,
                                          created_by_secretary_id, updated_by_secretary_id)
  values ('e2000000-0000-0000-0000-00000000000a', 'Maria', 'Lopes', 'PA1234567', v_sec, v_sec)
  returning id into v_id;

  update public.ministry_travellers
     set passport_expiry = current_date + 400, last_source = 'secretary', updated_by_secretary_id = v_sec
   where id = v_id;
  perform pg_temp.ok('P8 · last_source secretary aceite, e no histórico com a secretária',
    exists (select 1 from public.ministry_traveller_changes
             where traveller_id = v_id and source = 'secretary' and changed_by_secretary_id = v_sec));
end $$;

rollback;
