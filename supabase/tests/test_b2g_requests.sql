-- B2G-09 · B2G-10 · B2G-08 · o pedido do ministério, provado na base de dados.
--
--   Q1  a urgência: Normal por omissão, só 0, 1 ou 2
--   Q2  um pedido de ministério leva até 50 pessoas (e não 51)
--   Q3  três pedidos seguidos da mesma secretária, mesma rota e data: os três ficam,
--       e as duas secretárias do ministério veem-nos todos (D-4)
--   Q4  o registo aceita `secretary`, só com a secretária, e só do ministério do caso;
--       os outros `actor_kind` continuam a valer
--   Q5  a ficha do viajante: a autora é do ministério da ficha, não muda, e entra no histórico;
--       uma alteração do back-office não fica em nome de uma secretária
--   Q6  o índice da fila por urgência existe
--
-- Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('c1000000-0000-0000-0000-00000000000a', 'alo-req', 'Alô Req', true, 'white_label', array['B2C', 'B2G']);

insert into public.organisations (id, partner_id, slug, name) values
  ('c2000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-00000000000a', 'req-saude',    'REQ Saúde'),
  ('c2000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-00000000000a', 'req-educacao', 'REQ Educação');

insert into public.ministry_secretaries (id, organisation_id, name, email, link_token, created_by_email) values
  ('c3000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'Ana Req',   'ana@req.sec',   'REQaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 't@req'),
  ('c3000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000a', 'Berta Req', 'berta@req.sec', 'REQbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 't@req'),
  ('c3000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000b', 'Carla Req', null,            'REQcccccccccccccccccccccccccccccc', 't@req');

insert into public.leads (id, full_name, email, partner_id) values
  ('c5000000-0000-0000-0000-00000000000a', 'Ana Req', 'ana@req.sec', 'c1000000-0000-0000-0000-00000000000a');

create function pg_temp.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU · %', p_label; end if;
  raise notice 'ok · %', p_label;
end $$;

-- ── Q1 · a urgência ─────────────────────────────────────────────────────────

do $$
begin
  insert into public.booking_cases (id, token, partner_id, organisation_id, secretary_id) values
    ('c4000000-0000-0000-0000-00000000000a', 'tok-req-1', 'c1000000-0000-0000-0000-00000000000a',
     'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('Q1 · urgência Normal por omissão',
    (select urgency from public.booking_cases where id = 'c4000000-0000-0000-0000-00000000000a') = 0);

  update public.booking_cases set urgency = 2 where id = 'c4000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('Q1 · Muito urgente aceite',
    (select urgency from public.booking_cases where id = 'c4000000-0000-0000-0000-00000000000a') = 2);

  begin
    update public.booking_cases set urgency = 3 where id = 'c4000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · Q1 · urgência 3 aceite';
  exception when check_violation then
    raise notice 'ok · Q1 · urgência fora de 0–2 recusada';
  end;
end $$;

-- ── Q2 · até 50 pessoas ─────────────────────────────────────────────────────

do $$
begin
  insert into public.trip_requests (id, trip_type, cabin_class, lead_id, origin, destination, depart_date, adults, partner_id) values
    ('c6000000-0000-0000-0000-00000000000a', 'one_way', 'economy', 'c5000000-0000-0000-0000-00000000000a', 'RAI', 'LIS',
     current_date + 10, 50, 'c1000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('Q2 · 50 pessoas num pedido', true);

  begin
    insert into public.trip_requests (trip_type, cabin_class, lead_id, origin, destination, depart_date, adults, partner_id) values
      ('one_way', 'economy', 'c5000000-0000-0000-0000-00000000000a', 'RAI', 'LIS', current_date + 10, 51, 'c1000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU · Q2 · 51 pessoas aceites';
  exception when check_violation then
    raise notice 'ok · Q2 · 51 pessoas recusadas';
  end;
end $$;

-- ── Q3 · três pedidos seguidos, todos listados às duas secretárias ──────────

do $$
declare
  i int;
  v_trip uuid;
begin
  for i in 1..3 loop
    insert into public.trip_requests (trip_type, cabin_class, lead_id, origin, destination, depart_date, adults, partner_id)
    values ('one_way', 'economy', 'c5000000-0000-0000-0000-00000000000a', 'RAI', 'LIS', current_date + 20, 3, 'c1000000-0000-0000-0000-00000000000a')
    returning id into v_trip;
    insert into public.booking_cases (token, partner_id, organisation_id, secretary_id, trip_request_id, lead_id)
    values ('tok-req-rep-' || i, 'c1000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a',
            'c3000000-0000-0000-0000-00000000000a', v_trip, 'c5000000-0000-0000-0000-00000000000a');
  end loop;

  perform pg_temp.ok('Q3 · três pedidos iguais seguidos ficam os três',
    (select count(*) from public.booking_cases where token like 'tok-req-rep-%') = 3);
  perform pg_temp.ok('Q3 · são todos do canal ministerio',
    (select bool_and(channel = 'ministerio') from public.booking_cases where token like 'tok-req-rep-%'));
  -- "Os meus pedidos" lê por ministério, não por secretária: a Berta vê os da Ana.
  perform pg_temp.ok('Q3 · o ministério tem os quatro pedidos (o do Q1 e os três)',
    (select count(*) from public.booking_cases where organisation_id = 'c2000000-0000-0000-0000-00000000000a') = 4);
  perform pg_temp.ok('Q3 · o outro ministério não tem nenhum',
    (select count(*) from public.booking_cases where organisation_id = 'c2000000-0000-0000-0000-00000000000b') = 0);
end $$;

-- ── Q4 · a secretária no registo ────────────────────────────────────────────

do $$
begin
  insert into public.case_events (case_id, kind, title, actor_kind, actor_secretary_id) values
    ('c4000000-0000-0000-0000-00000000000a', 'request_submitted', 'Pedido submetido por Ana Req', 'secretary',
     'c3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('Q4 · request_submitted com actor_kind secretary',
    exists (select 1 from public.case_events where case_id = 'c4000000-0000-0000-0000-00000000000a'
             and actor_kind = 'secretary' and actor_secretary_id = 'c3000000-0000-0000-0000-00000000000a'));

  -- D-4 · a outra secretária do mesmo ministério também pode agir no caso.
  insert into public.case_events (case_id, kind, title, actor_kind, actor_secretary_id) values
    ('c4000000-0000-0000-0000-00000000000a', 'offer_selected', 'Escolheu', 'secretary',
     'c3000000-0000-0000-0000-00000000000b');
  perform pg_temp.ok('Q4 · a colega do mesmo ministério também fica no registo', true);

  begin
    insert into public.case_events (case_id, kind, title, actor_kind, actor_secretary_id) values
      ('c4000000-0000-0000-0000-00000000000a', 'request_submitted', 'x', 'secretary',
       'c3000000-0000-0000-0000-00000000000c');
    raise exception 'FALHOU · Q4 · secretária de outro ministério no registo';
  exception when check_violation then
    raise notice 'ok · Q4 · secretária de outro ministério recusada';
  end;

  begin
    insert into public.case_events (case_id, kind, title, actor_kind) values
      ('c4000000-0000-0000-0000-00000000000a', 'request_submitted', 'x', 'secretary');
    raise exception 'FALHOU · Q4 · secretary sem secretária';
  exception when check_violation then
    raise notice 'ok · Q4 · secretary sem secretária recusado';
  end;

  begin
    insert into public.case_events (case_id, kind, title, actor_kind, actor_secretary_id) values
      ('c4000000-0000-0000-0000-00000000000a', 'note_added', 'x', 'staff', 'c3000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU · Q4 · staff com secretária';
  exception when check_violation then
    raise notice 'ok · Q4 · secretária só com actor_kind secretary';
  end;

  begin
    insert into public.case_events (case_id, kind, title, actor_kind) values
      ('c4000000-0000-0000-0000-00000000000a', 'x', 'x', 'robot');
    raise exception 'FALHOU · Q4 · actor_kind desconhecido';
  exception when check_violation then
    raise notice 'ok · Q4 · actor_kind desconhecido recusado';
  end;

  insert into public.case_events (case_id, kind, title, actor_kind) values
    ('c4000000-0000-0000-0000-00000000000a', 'note_added', 'nota', 'staff'),
    ('c4000000-0000-0000-0000-00000000000a', 'client_notified', 'email', 'system'),
    ('c4000000-0000-0000-0000-00000000000a', 'client_message', 'msg', 'client');
  perform pg_temp.ok('Q4 · client, staff e system continuam a valer', true);
end $$;

-- ── Q5 · a ficha do viajante ────────────────────────────────────────────────

do $$
declare
  v_id uuid;
begin
  insert into public.ministry_travellers (organisation_id, first_name, last_name, passport_number, created_by_secretary_id, updated_by_secretary_id)
  values ('c2000000-0000-0000-0000-00000000000a', 'Rui', 'Req', 'P0001', 'c3000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a')
  returning id into v_id;
  perform pg_temp.ok('Q5 · o histórico diz a secretária que registou',
    (select changed_by_secretary_id from public.ministry_traveller_changes where traveller_id = v_id)
      = 'c3000000-0000-0000-0000-00000000000a');

  update public.ministry_travellers
     set passport_expiry = current_date + 90, created_by_secretary_id = 'c3000000-0000-0000-0000-00000000000b',
         updated_by_secretary_id = 'c3000000-0000-0000-0000-00000000000b'
   where id = v_id;
  perform pg_temp.ok('Q5 · a autora não muda',
    (select created_by_secretary_id from public.ministry_travellers where id = v_id) = 'c3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('Q5 · a alteração fica em nome da colega',
    (select count(*) from public.ministry_traveller_changes
      where traveller_id = v_id and before is not null
        and changed_by_secretary_id = 'c3000000-0000-0000-0000-00000000000b') = 1);

  update public.ministry_travellers
     set phone = '+2389910000', last_source = 'backoffice', updated_by_email = 'agent@req'
   where id = v_id;
  perform pg_temp.ok('Q5 · uma alteração do back-office não fica em nome de uma secretária',
    (select count(*) from public.ministry_traveller_changes
      where traveller_id = v_id and changed_by_email = 'agent@req' and changed_by_secretary_id is null) = 1);

  begin
    insert into public.ministry_travellers (organisation_id, first_name, last_name, created_by_secretary_id)
    values ('c2000000-0000-0000-0000-00000000000b', 'Zé', 'Req', 'c3000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU · Q5 · ficha da Educação registada por uma secretária da Saúde';
  exception when foreign_key_violation then
    raise notice 'ok · Q5 · a autora é do ministério da ficha';
  end;
end $$;

-- ── Q6 · o índice da fila ───────────────────────────────────────────────────

do $$
begin
  perform pg_temp.ok('Q6 · índice (partner_id, channel, closed_at, urgency desc, created_at)',
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'booking_cases_queue_urgency_idx'));
end $$;

rollback;
