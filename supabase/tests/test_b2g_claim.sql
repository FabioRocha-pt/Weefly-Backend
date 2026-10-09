-- B2G-13 · B2G-11 · D-12 · reclamar, libertar e a urgência, provados na base de dados.
--
--   C1  o segundo a reclamar perde e fica a saber quem ganhou; fica registado
--       (claimed_at, claimed_by_email, case_events, access_audit)
--   C2  um agente não reclama um caso de outra empresa (nem a WeeFly sem ser master)
--   C3  o master reclama um caso de qualquer empresa; num white label, o vendedor
--       (`seller_*`) não muda; a empresa vê "reclamado por <master>" e não reclama
--   C4  o master num caso do operador passa a vendedor, como qualquer agente
--   C5  só um administrador liberta (o do parceiro ou o master), com motivo; fica registado
--   C6  a urgência: o agente muda-a num caso de ministério, fica registada; outra
--       empresa não; fora de 0–2 e fora do canal ministério recusado
--   C7  sem sessão, secretária e `anon`: nada
--   C8  reclamar o que já é seu não muda nada
--
-- Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-00000000000a', 'master@weefly.clm'),
  ('d0000000-0000-0000-0000-00000000000b', 'agent@weefly.clm'),
  ('d0000000-0000-0000-0000-00000000000c', 'agent@alo.clm'),
  ('d0000000-0000-0000-0000-00000000000d', 'admin@alo.clm'),
  ('d0000000-0000-0000-0000-00000000000e', 'agent@beta.clm'),
  ('d0000000-0000-0000-0000-00000000000f', 'sec@alo.clm');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('d1000000-0000-0000-0000-00000000000a', 'alo-clm',  'Alô CLM',  true, 'white_label', array['B2C', 'B2G']),
  ('d1000000-0000-0000-0000-00000000000b', 'beta-clm', 'Beta CLM', true, 'reseller',    array['B2C']);

insert into public.organisations (id, partner_id, slug, name) values
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-00000000000a', 'clm-saude', 'CLM Saúde');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('master@weefly.clm', 'Dominik Master', public.default_partner_id(), 'weefly_admin'),
  ('agent@weefly.clm',  'Agente WeeFly',  public.default_partner_id(), 'weefly_agent'),
  ('agent@alo.clm',     'Agente Alô',     'd1000000-0000-0000-0000-00000000000a', 'partner_agent'),
  ('admin@alo.clm',     'Admin Alô',      'd1000000-0000-0000-0000-00000000000a', 'partner_admin'),
  ('agent@beta.clm',    'Agente Beta',    'd1000000-0000-0000-0000-00000000000b', 'partner_agent');

insert into public.bo_allowlist (email, label, partner_id, role_id, organisation_id) values
  ('sec@alo.clm', 'Sec', 'd1000000-0000-0000-0000-00000000000a', 'secretary', 'd2000000-0000-0000-0000-00000000000a');

-- A1 público da Alô, com vendedor já escrito (o do white label); A2 ministério
-- da Alô; A3 público da Alô (a corrida); B1 da Beta; W1 da WeeFly.
insert into public.booking_cases (id, token, partner_id, organisation_id, seller_email, seller_label) values
  ('d3000000-0000-0000-0000-0000000000a1', 'tok-clm-a1', 'd1000000-0000-0000-0000-00000000000a', null,
   'vendedor@alo.clm', 'Vendedor Alô'),
  ('d3000000-0000-0000-0000-0000000000a2', 'tok-clm-a2', 'd1000000-0000-0000-0000-00000000000a',
   'd2000000-0000-0000-0000-00000000000a', null, null),
  ('d3000000-0000-0000-0000-0000000000a3', 'tok-clm-a3', 'd1000000-0000-0000-0000-00000000000a', null, null, null),
  ('d3000000-0000-0000-0000-0000000000b1', 'tok-clm-b1', 'd1000000-0000-0000-0000-00000000000b', null, null, null);
insert into public.booking_cases (id, token, partner_id) values
  ('d3000000-0000-0000-0000-0000000000f1', 'tok-clm-w1', public.default_partner_id());

create function pg_temp.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU · %', p_label; end if;
  raise notice 'ok · %', p_label;
end $$;

-- Chama uma das funções como a sessão `p_user` (como o PostgREST), e volta.
create function pg_temp.call_as(p_user uuid, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute 'set local role authenticated';
  execute p_sql into r;
  execute 'reset role';
  return r;
end $$;

-- ── C1 · a corrida ──────────────────────────────────────────────────────────

do $$
declare
  r jsonb;
  a3 constant text := '''d3000000-0000-0000-0000-0000000000a3''::uuid';
begin
  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000c', 'select public.claim_case(' || a3 || ')');
  perform pg_temp.ok('C1 · o agente da Alô reclama', r->>'outcome' = 'claimed');
  perform pg_temp.ok('C1 · fica o dono, a hora e o email',
    exists (select 1 from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a3'
             and created_by = 'd0000000-0000-0000-0000-00000000000c'
             and claimed_at is not null and claimed_by_email = 'agent@alo.clm'));
  perform pg_temp.ok('C1 · o vendedor passa a ser quem reclamou (empresa própria)',
    (select seller_email from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a3') = 'agent@alo.clm');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000d', 'select public.claim_case(' || a3 || ')');
  perform pg_temp.ok('C1 · o segundo perde', r->>'outcome' = 'taken');
  perform pg_temp.ok('C1 · e sabe quem ganhou',
    r->>'claimed_by_email' = 'agent@alo.clm' and r->>'claimed_by_label' = 'Agente Alô');
  perform pg_temp.ok('C1 · o dono não mudou',
    (select created_by from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a3')
      = 'd0000000-0000-0000-0000-00000000000c');

  perform pg_temp.ok('C1 · case_claimed no registo do caso (um só)',
    (select count(*) from public.case_events where case_id = 'd3000000-0000-0000-0000-0000000000a3'
      and kind = 'case_claimed' and actor_email = 'agent@alo.clm' and actor_kind = 'staff') = 1);
  perform pg_temp.ok('C1 · case_claimed no access_audit, na empresa do caso',
    (select count(*) from public.access_audit where action = 'case_claimed'
      and target = 'd3000000-0000-0000-0000-0000000000a3'
      and partner_id = 'd1000000-0000-0000-0000-00000000000a' and actor_email = 'agent@alo.clm') = 1);
end $$;

-- ── C2 · outra empresa não reclama ──────────────────────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000e',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000a1''::uuid)');
  perform pg_temp.ok('C2 · a Beta não reclama um caso da Alô (não existe)', r->>'outcome' = 'not_found');
  perform pg_temp.ok('C2 · e não sabe de quem é', r->>'claimed_by_email' is null);

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000c',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000b1''::uuid)');
  perform pg_temp.ok('C2 · a Alô não reclama um caso da Beta', r->>'outcome' = 'not_found');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000b',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000a1''::uuid)');
  perform pg_temp.ok('C2 · um agente WeeFly (sem ser master) não reclama a Alô', r->>'outcome' = 'not_found');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000c',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000f1''::uuid)');
  perform pg_temp.ok('C2 · a Alô não reclama um caso da WeeFly', r->>'outcome' = 'not_found');

  perform pg_temp.ok('C2 · os casos continuam sem dono',
    (select count(*) from public.booking_cases
      where id in ('d3000000-0000-0000-0000-0000000000a1', 'd3000000-0000-0000-0000-0000000000b1',
                   'd3000000-0000-0000-0000-0000000000f1') and created_by is null) = 3);
  perform pg_temp.ok('C2 · nada no registo',
    not exists (select 1 from public.access_audit where action = 'case_claimed'
                 and target in ('d3000000-0000-0000-0000-0000000000a1', 'd3000000-0000-0000-0000-0000000000b1',
                                'd3000000-0000-0000-0000-0000000000f1')));
end $$;

-- ── C3 · o master reclama em qualquer empresa (D-12) ────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000a',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000a1''::uuid)');
  perform pg_temp.ok('C3 · o master reclama um caso da Alô', r->>'outcome' = 'claimed');
  perform pg_temp.ok('C3 · white label: o vendedor fica o da Alô',
    exists (select 1 from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a1'
             and seller_email = 'vendedor@alo.clm' and seller_label = 'Vendedor Alô' and seller_set_by is null));
  perform pg_temp.ok('C3 · e o master é o dono, registado',
    exists (select 1 from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a1'
             and created_by = 'd0000000-0000-0000-0000-00000000000a' and claimed_by_email = 'master@weefly.clm'));
  perform pg_temp.ok('C3 · a intervenção fica no access_audit (cross_partner)',
    exists (select 1 from public.access_audit where action = 'case_claimed'
             and target = 'd3000000-0000-0000-0000-0000000000a1'
             and (after->>'cross_partner')::boolean and (after->>'seller_kept')::boolean));

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000c',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000a1''::uuid)');
  perform pg_temp.ok('C3 · a Alô vê "reclamado por Dominik" e não reclama',
    r->>'outcome' = 'taken' and r->>'claimed_by_label' = 'Dominik Master');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000a',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000b1''::uuid)');
  perform pg_temp.ok('C3 · o master reclama um caso da Beta', r->>'outcome' = 'claimed');
end $$;

-- ── C4 · o master num caso do operador ──────────────────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000a',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000f1''::uuid)');
  perform pg_temp.ok('C4 · o master reclama um caso da WeeFly', r->>'outcome' = 'claimed');
  perform pg_temp.ok('C4 · e passa a vendedor',
    (select seller_email from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000f1') = 'master@weefly.clm');
end $$;

-- ── C5 · libertar ───────────────────────────────────────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000c',
    'select public.release_case(''d3000000-0000-0000-0000-0000000000a1''::uuid, ''quero eu'')');
  perform pg_temp.ok('C5 · um agente não liberta', r->>'outcome' = 'forbidden');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000e',
    'select public.release_case(''d3000000-0000-0000-0000-0000000000a1''::uuid, ''motivo qualquer'')');
  perform pg_temp.ok('C5 · outra empresa não liberta (não existe)', r->>'outcome' = 'not_found');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000d',
    'select public.release_case(''d3000000-0000-0000-0000-0000000000b1''::uuid, ''motivo qualquer'')');
  perform pg_temp.ok('C5 · o Admin da Alô não liberta um caso da Beta', r->>'outcome' = 'not_found');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000d',
    'select public.release_case(''d3000000-0000-0000-0000-0000000000a1''::uuid, ''  '')');
  perform pg_temp.ok('C5 · sem motivo não', r->>'outcome' = 'reason_required');

  perform pg_temp.ok('C5 · o caso continua do master',
    (select created_by from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a1')
      = 'd0000000-0000-0000-0000-00000000000a');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000d',
    'select public.release_case(''d3000000-0000-0000-0000-0000000000a1''::uuid, ''o cliente é nosso'')');
  perform pg_temp.ok('C5 · o Admin da Alô liberta um caso da Alô', r->>'outcome' = 'released'
    and r->>'previous_owner_email' = 'master@weefly.clm');
  perform pg_temp.ok('C5 · o caso fica sem dono',
    exists (select 1 from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a1'
             and created_by is null and claimed_at is null and claimed_by_email is null));
  perform pg_temp.ok('C5 · case_released no caso e no access_audit, com o motivo',
    exists (select 1 from public.case_events where case_id = 'd3000000-0000-0000-0000-0000000000a1'
             and kind = 'case_released' and actor_email = 'admin@alo.clm')
    and exists (select 1 from public.access_audit where action = 'case_released'
             and target = 'd3000000-0000-0000-0000-0000000000a1' and reason = 'o cliente é nosso'
             and before->>'claimed_by_email' = 'master@weefly.clm'));

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000d',
    'select public.release_case(''d3000000-0000-0000-0000-0000000000a1''::uuid, ''outra vez'')');
  perform pg_temp.ok('C5 · libertar um caso sem dono não faz nada', r->>'outcome' = 'not_claimed');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000a',
    'select public.release_case(''d3000000-0000-0000-0000-0000000000a3''::uuid, ''reequilibrar a fila'')');
  perform pg_temp.ok('C5 · o master liberta um caso de qualquer empresa', r->>'outcome' = 'released');

  -- Depois de libertado, volta a poder ser reclamado.
  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000d',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000a3''::uuid)');
  perform pg_temp.ok('C5 · libertado volta a ser reclamável', r->>'outcome' = 'claimed');
end $$;

-- ── C6 · a urgência ─────────────────────────────────────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000c',
    'select public.set_case_urgency(''d3000000-0000-0000-0000-0000000000a2''::uuid, 2::smallint)');
  perform pg_temp.ok('C6 · o agente muda a urgência de um pedido de ministério', r->>'outcome' = 'changed');
  perform pg_temp.ok('C6 · fica no caso, com quem e quando',
    exists (select 1 from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a2'
             and urgency = 2 and urgency_changed_by_email = 'agent@alo.clm' and urgency_changed_at is not null));
  perform pg_temp.ok('C6 · urgency_changed no registo do caso, de 0 para 2',
    exists (select 1 from public.case_events where case_id = 'd3000000-0000-0000-0000-0000000000a2'
             and kind = 'urgency_changed' and payload->>'from' = '0' and payload->>'to' = '2'));
  perform pg_temp.ok('C6 · urgency_changed no access_audit',
    exists (select 1 from public.access_audit where action = 'urgency_changed'
             and target = 'd3000000-0000-0000-0000-0000000000a2'
             and before->>'urgency' = '0' and after->>'urgency' = '2'));

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000e',
    'select public.set_case_urgency(''d3000000-0000-0000-0000-0000000000a2''::uuid, 0::smallint)');
  perform pg_temp.ok('C6 · outra empresa não muda (não existe)', r->>'outcome' = 'not_found');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000c',
    'select public.set_case_urgency(''d3000000-0000-0000-0000-0000000000a2''::uuid, 3::smallint)');
  perform pg_temp.ok('C6 · urgência 3 recusada', r->>'outcome' = 'invalid');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000c',
    'select public.set_case_urgency(''d3000000-0000-0000-0000-0000000000a1''::uuid, 1::smallint)');
  perform pg_temp.ok('C6 · fora do canal ministério recusado', r->>'outcome' = 'not_ministry');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000c',
    'select public.set_case_urgency(''d3000000-0000-0000-0000-0000000000a2''::uuid, 2::smallint)');
  perform pg_temp.ok('C6 · a mesma urgência não regista nada', r->>'outcome' = 'unchanged'
    and (select count(*) from public.case_events where case_id = 'd3000000-0000-0000-0000-0000000000a2'
          and kind = 'urgency_changed') = 1);

  perform pg_temp.ok('C6 · a urgência continua 2',
    (select urgency from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a2') = 2);
end $$;

-- ── C7 · sem sessão, secretária, anon ───────────────────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as(null,
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000a2''::uuid)');
  perform pg_temp.ok('C7 · sem sessão: nada', r->>'outcome' = 'not_found');

  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000f',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000a2''::uuid)');
  perform pg_temp.ok('C7 · a secretária não reclama', r->>'outcome' = 'not_found');

  perform pg_temp.ok('C7 · anon não executa nenhuma das três',
    not has_function_privilege('anon', 'public.claim_case(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.release_case(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.set_case_urgency(uuid, smallint)', 'execute'));
  perform pg_temp.ok('C7 · as auxiliares não são chamáveis por sessões',
    not has_function_privilege('authenticated', 'public.case_actor()', 'execute')
    and not has_function_privilege('authenticated', 'public.case_owner_label(text)', 'execute'));
  perform pg_temp.ok('C7 · o caso A2 continua sem dono',
    (select created_by from public.booking_cases where id = 'd3000000-0000-0000-0000-0000000000a2') is null);
end $$;

-- ── C8 · já é seu ───────────────────────────────────────────────────────────

do $$
declare r jsonb;
begin
  r := pg_temp.call_as('d0000000-0000-0000-0000-00000000000a',
    'select public.claim_case(''d3000000-0000-0000-0000-0000000000f1''::uuid)');
  perform pg_temp.ok('C8 · reclamar o que já é seu', r->>'outcome' = 'already_yours');
  perform pg_temp.ok('C8 · sem segundo registo',
    (select count(*) from public.case_events where case_id = 'd3000000-0000-0000-0000-0000000000f1'
      and kind = 'case_claimed') = 1);
end $$;

rollback;
