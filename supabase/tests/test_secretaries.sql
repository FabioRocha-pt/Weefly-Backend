-- B2G-06 · B2G-07 · as secretárias e o PIN, provados na base de dados.
--
--   S1  o hash do PIN e as sessões não se leem nem escrevem de uma sessão (anon/authenticated)
--   S2  as funções do PIN e da sessão só a service role as chama
--   S3  a empresa da secretária vem do ministério; ministério e link não mudam; link ≥ 192 bits e único
--   S4  5 PIN errados seguidos bloqueiam 15 min; o PIN certo repõe o contador; o bloqueio expira
--   S5  um PIN novo sobe a versão e mata as sessões; a sessão expira (30 min sem uso, 12 h no total)
--   S6  desactivar corta o acesso de imediato (as sessões morrem) e guarda o histórico
--   S7  isolamento: cada empresa vê só as suas secretárias; o master vê todas; a secretária não vê nada
--   S8  uma sessão não cria, não muda e não apaga secretárias
--   S9  a secretária de um caso é do ministério do caso
--
-- Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-00000000000a', 'admin@alo.sec'),
  ('b0000000-0000-0000-0000-00000000000b', 'agent@beta.sec'),
  ('b0000000-0000-0000-0000-00000000000c', 'master@weefly.sec'),
  ('b0000000-0000-0000-0000-00000000000d', 'sec@alo.sec'),
  ('b0000000-0000-0000-0000-00000000000e', 'agent@alo.sec');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('b1000000-0000-0000-0000-00000000000a', 'alo-sec',  'Alô Sec',  true, 'white_label', array['B2C', 'B2G']),
  ('b1000000-0000-0000-0000-00000000000b', 'beta-sec', 'Beta Sec', true, 'reseller',    array['B2C', 'B2G']);

insert into public.organisations (id, partner_id, slug, name) values
  ('b2000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000a', 'teste-saude',    'TESTE Saúde'),
  ('b2000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-00000000000a', 'teste-educacao', 'TESTE Educação'),
  ('b2000000-0000-0000-0000-00000000000c', 'b1000000-0000-0000-0000-00000000000b', 'teste-financas', 'TESTE Finanças');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('admin@alo.sec',  'Alô admin', 'b1000000-0000-0000-0000-00000000000a', 'partner_admin'),
  ('agent@alo.sec',  'Alô agent', 'b1000000-0000-0000-0000-00000000000a', 'partner_agent'),
  ('agent@beta.sec', 'Beta',      'b1000000-0000-0000-0000-00000000000b', 'partner_agent');
insert into public.bo_allowlist (email, label, partner_id, role_id, organisation_id) values
  ('sec@alo.sec', 'Sec', 'b1000000-0000-0000-0000-00000000000a', 'secretary', 'b2000000-0000-0000-0000-00000000000a');
insert into public.bo_allowlist (email, label, partner_id, role_id, cross_partner) values
  ('master@weefly.sec', 'Master', public.default_partner_id(), 'weefly_admin', true);

-- A empresa vai errada de propósito: o gatilho põe a do ministério.
insert into public.ministry_secretaries (id, organisation_id, partner_id, name, email, link_token, created_by_email) values
  ('b3000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000b',
   'Ana Saúde', 'ana@saude.sec', 'SECaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'admin@alo.sec'),
  ('b3000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000a', null,
   'Berta Saúde', 'berta@saude.sec', 'SECbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'agent@alo.sec'),
  ('b3000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-00000000000c', null,
   'Carla Finanças', null, 'SECccccccccccccccccccccccccccccc', 'agent@beta.sec');

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

create function pg_temp.hash(p text) returns text language sql as $$
  select rpad(md5(p) || md5(p || 'x'), 64, '0')
$$;

-- ── S3 · a empresa, o ministério e o link ──────────────────────────────────

do $$
begin
  perform pg_temp.ok('S3 · a empresa da secretária é a do ministério',
    (select partner_id from public.ministry_secretaries where id = 'b3000000-0000-0000-0000-00000000000a')
      = 'b1000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('S3 · cada secretária nasce com a linha de segredos, sem PIN',
    (select count(*) from public.ministry_secretary_secrets
      where secretary_id in ('b3000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000b')
        and pin_hash is null and pin_version = 0) = 2);

  begin
    update public.ministry_secretaries set organisation_id = 'b2000000-0000-0000-0000-00000000000b'
     where id = 'b3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · S3 · a secretária mudou de ministério';
  exception when check_violation then
    raise notice 'ok · S3 · a secretária não muda de ministério';
  end;

  update public.ministry_secretaries set partner_id = 'b1000000-0000-0000-0000-00000000000b'
   where id = 'b3000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('S3 · nem de empresa (o gatilho repõe a do ministério)',
    (select partner_id from public.ministry_secretaries where id = 'b3000000-0000-0000-0000-00000000000a')
      = 'b1000000-0000-0000-0000-00000000000a');

  begin
    update public.ministry_secretaries set link_token = 'SECzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
     where id = 'b3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · S3 · o link mudou';
  exception when check_violation then
    raise notice 'ok · S3 · o link pessoal é permanente';
  end;

  begin
    insert into public.ministry_secretaries (organisation_id, name, link_token, created_by_email)
    values ('b2000000-0000-0000-0000-00000000000c', 'Repetida', 'SECaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'x');
    raise exception 'FALHOU · S3 · dois links iguais';
  exception when unique_violation then
    raise notice 'ok · S3 · o link é único, também entre empresas';
  end;

  begin
    insert into public.ministry_secretaries (organisation_id, name, link_token, created_by_email)
    values ('b2000000-0000-0000-0000-00000000000a', 'Curta', 'abc123', 'x');
    raise exception 'FALHOU · S3 · um link curto entrou';
  exception when check_violation then
    raise notice 'ok · S3 · um link com menos de 192 bits é recusado';
  end;
end $$;

-- ── S1 · S2 · S7 · S8 · como cada sessão ────────────────────────────────────

do $$
declare n int;
begin
  -- anon
  execute 'set local role anon';
  begin
    perform 1 from public.ministry_secretary_secrets;
    raise exception 'FALHOU · S1 · anon leu os segredos';
  exception when insufficient_privilege then
    raise notice 'ok · S1 · anon não lê os segredos';
  end;
  begin
    perform 1 from public.ministry_secretary_sessions;
    raise exception 'FALHOU · S1 · anon leu as sessões';
  exception when insufficient_privilege then
    raise notice 'ok · S1 · anon não lê as sessões';
  end;
  begin
    perform public.secretary_pin_success('b3000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU · S2 · anon chamou secretary_pin_success';
  exception when insufficient_privilege then
    raise notice 'ok · S2 · anon não chama secretary_pin_success';
  end;
  begin
    perform public.secretary_session_check(pg_temp.hash('x'));
    raise exception 'FALHOU · S2 · anon chamou secretary_session_check';
  exception when insufficient_privilege then
    raise notice 'ok · S2 · anon não chama secretary_session_check';
  end;
  select count(*) into n from public.ministry_secretaries;
  perform pg_temp.ok('S7 · anon não vê secretárias', n = 0);
  execute 'reset role';

  -- O Admin da Alô
  perform pg_temp.as_user('b0000000-0000-0000-0000-00000000000a');
  begin
    perform pin_hash from public.ministry_secretary_secrets;
    raise exception 'FALHOU · S1 · o Admin do parceiro leu o hash do PIN';
  exception when insufficient_privilege then
    raise notice 'ok · S1 · o Admin do parceiro não lê o hash do PIN';
  end;
  begin
    update public.ministry_secretary_secrets set pin_hash = null;
    raise exception 'FALHOU · S1 · uma sessão escreveu nos segredos';
  exception when insufficient_privilege then
    raise notice 'ok · S1 · uma sessão não escreve nos segredos';
  end;
  begin
    insert into public.ministry_secretary_sessions (token_hash, secretary_id, pin_version)
    values (pg_temp.hash('forjada'), 'b3000000-0000-0000-0000-00000000000a', 0);
    raise exception 'FALHOU · S1 · uma sessão forjou uma sessão de secretária';
  exception when insufficient_privilege then
    raise notice 'ok · S1 · uma sessão não cria sessões de secretária';
  end;
  begin
    perform * from public.secretary_pin_failure('b3000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU · S2 · authenticated chamou secretary_pin_failure';
  exception when insufficient_privilege then
    raise notice 'ok · S2 · authenticated não chama secretary_pin_failure';
  end;
  begin
    perform public.secretary_set_pin('b3000000-0000-0000-0000-00000000000a', 'scrypt$x', 'eu');
    raise exception 'FALHOU · S2 · authenticated mudou o PIN';
  exception when insufficient_privilege then
    raise notice 'ok · S2 · authenticated não muda o PIN';
  end;

  select count(*) into n from public.ministry_secretaries;
  perform pg_temp.ok('S7 · a Alô vê as suas duas secretárias', n = 2);

  begin
    insert into public.ministry_secretaries (organisation_id, name, link_token, created_by_email)
    values ('b2000000-0000-0000-0000-00000000000a', 'Pela sessão', 'SECddddddddddddddddddddddddddddd', 'admin@alo.sec');
    raise exception 'FALHOU · S8 · a sessão criou uma secretária';
  exception when insufficient_privilege then
    raise notice 'ok · S8 · a sessão não cria secretárias';
  end;
  begin
    update public.ministry_secretaries set name = 'Mudada' where id = 'b3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · S8 · a sessão mudou uma secretária';
  exception when insufficient_privilege then
    raise notice 'ok · S8 · a sessão não muda secretárias';
  end;
  begin
    delete from public.ministry_secretaries where id = 'b3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · S8 · a sessão apagou uma secretária';
  exception when insufficient_privilege then
    raise notice 'ok · S8 · a sessão não apaga secretárias';
  end;
  execute 'reset role';

  perform pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.ministry_secretaries;
  perform pg_temp.ok('S7 · a Beta vê só a sua', n = 1);
  perform pg_temp.ok('S7 · e não vê as da Alô',
    not exists (select 1 from public.ministry_secretaries where partner_id = 'b1000000-0000-0000-0000-00000000000a'));
  execute 'reset role';

  perform pg_temp.as_user('b0000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.ministry_secretaries
   where partner_id in ('b1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000b');
  perform pg_temp.ok('S7 · o master vê as secretárias de todas as empresas', n = 3);
  execute 'reset role';

  perform pg_temp.as_user('b0000000-0000-0000-0000-00000000000d');
  select count(*) into n from public.ministry_secretaries;
  perform pg_temp.ok('S7 · a conta secretária (sem back-office) não vê secretárias', n = 0);
  execute 'reset role';
end $$;

-- ── S4 · o bloqueio ─────────────────────────────────────────────────────────

do $$
declare r record; i int;
begin
  execute 'set local role service_role';
  for i in 1..4 loop
    select * into r from public.secretary_pin_failure('b3000000-0000-0000-0000-00000000000a');
  end loop;
  perform pg_temp.ok('S4 · 4 falhas não bloqueiam', not r.locked and r.failed_attempts = 4);

  perform public.secretary_pin_success('b3000000-0000-0000-0000-00000000000a');
  select * into r from public.secretary_pin_failure('b3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('S4 · o PIN certo repõe o contador', not r.locked and r.failed_attempts = 1);

  for i in 1..4 loop
    select * into r from public.secretary_pin_failure('b3000000-0000-0000-0000-00000000000a');
  end loop;
  perform pg_temp.ok('S4 · a 5.ª falha seguida bloqueia', r.locked and r.failed_attempts = 5);
  perform pg_temp.ok('S4 · durante 15 minutos',
    r.locked_until between now() + interval '14 minutes' and now() + interval '16 minutes');

  select * into r from public.secretary_pin_failure('b3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('S4 · bloqueada continua bloqueada (o prazo não estica)',
    r.locked and r.failed_attempts = 5 and r.locked_until < now() + interval '16 minutes');

  perform pg_temp.ok('S4 · o bloqueio é só desta secretária',
    (select failed_attempts from public.ministry_secretary_secrets
      where secretary_id = 'b3000000-0000-0000-0000-00000000000b') = 0);

  -- O bloqueio passou: a contagem recomeça.
  update public.ministry_secretary_secrets set locked_until = now() - interval '1 second'
   where secretary_id = 'b3000000-0000-0000-0000-00000000000a';
  select * into r from public.secretary_pin_failure('b3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('S4 · passado o bloqueio, a contagem recomeça', not r.locked and r.failed_attempts = 1);
  execute 'reset role';

  -- O registo aceita o bloqueio.
  insert into public.access_audit (actor_email, action, partner_id, target) values
    ('sistema', 'secretary_pin_locked', 'b1000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('S4 · secretary_pin_locked entra no registo', true);
end $$;

-- ── S5 · PIN novo e sessões ─────────────────────────────────────────────────

do $$
declare v int; sid uuid;
begin
  execute 'set local role service_role';
  v := public.secretary_set_pin('b3000000-0000-0000-0000-00000000000a', 'scrypt$16384$8$1$c2FsdA$aGFzaA', 'admin@alo.sec');
  perform pg_temp.ok('S5 · o primeiro PIN é a versão 1', v = 1);

  insert into public.ministry_secretary_sessions (token_hash, secretary_id, pin_version) values
    (pg_temp.hash('s-ok'), 'b3000000-0000-0000-0000-00000000000a', 1);
  sid := public.secretary_session_check(pg_temp.hash('s-ok'));
  perform pg_temp.ok('S5 · a sessão aberta com o PIN actual vale', sid = 'b3000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok('S5 · uma sessão desconhecida não vale', public.secretary_session_check(pg_temp.hash('nada')) is null);

  -- A sessão de uma secretária não serve a outra: a sessão diz de quem é.
  perform pg_temp.ok('S5 · a sessão é de uma secretária só',
    public.secretary_session_check(pg_temp.hash('s-ok')) <> 'b3000000-0000-0000-0000-00000000000b');

  -- 30 minutos sem uso.
  insert into public.ministry_secretary_sessions (token_hash, secretary_id, pin_version, last_seen_at) values
    (pg_temp.hash('s-idle'), 'b3000000-0000-0000-0000-00000000000a', 1, now() - interval '31 minutes');
  perform pg_temp.ok('S5 · 30 min sem uso: expirada', public.secretary_session_check(pg_temp.hash('s-idle')) is null);
  perform pg_temp.ok('S5 · e apagada',
    not exists (select 1 from public.ministry_secretary_sessions where token_hash = pg_temp.hash('s-idle')));

  -- 12 horas no total.
  insert into public.ministry_secretary_sessions (token_hash, secretary_id, pin_version, created_at, expires_at) values
    (pg_temp.hash('s-old'), 'b3000000-0000-0000-0000-00000000000a', 1, now() - interval '13 hours', now() - interval '1 hour');
  perform pg_temp.ok('S5 · passadas as 12 h: expirada', public.secretary_session_check(pg_temp.hash('s-old')) is null);

  -- Um PIN novo mata as sessões abertas com o antigo.
  v := public.secretary_set_pin('b3000000-0000-0000-0000-00000000000a', 'scrypt$16384$8$1$c2FsdDI$aGFzaDI', 'admin@alo.sec');
  perform pg_temp.ok('S5 · o PIN novo sobe a versão', v = 2);
  perform pg_temp.ok('S5 · e apaga as sessões',
    not exists (select 1 from public.ministry_secretary_sessions where secretary_id = 'b3000000-0000-0000-0000-00000000000a'));
  insert into public.ministry_secretary_sessions (token_hash, secretary_id, pin_version) values
    (pg_temp.hash('s-stale'), 'b3000000-0000-0000-0000-00000000000a', 1);
  perform pg_temp.ok('S5 · uma sessão com a versão antiga não vale', public.secretary_session_check(pg_temp.hash('s-stale')) is null);

  begin
    perform public.secretary_set_pin('b3000000-0000-0000-0000-00000000000a', '123456', 'admin@alo.sec');
    raise exception 'FALHOU · S5 · um PIN em claro entrou';
  exception when check_violation then
    raise notice 'ok · S5 · só entra um hash scrypt, nunca o PIN em claro';
  end;

  -- Sem PIN, nem uma sessão forjada abre.
  insert into public.ministry_secretary_sessions (token_hash, secretary_id, pin_version) values
    (pg_temp.hash('s-nopin'), 'b3000000-0000-0000-0000-00000000000b', 0);
  perform pg_temp.ok('S5 · secretária sem PIN não tem sessão válida', public.secretary_session_check(pg_temp.hash('s-nopin')) is null);
  execute 'reset role';
end $$;

-- ── S6 · desactivar ─────────────────────────────────────────────────────────

do $$
begin
  execute 'set local role service_role';
  insert into public.ministry_secretary_sessions (token_hash, secretary_id, pin_version) values
    (pg_temp.hash('s-live'), 'b3000000-0000-0000-0000-00000000000a', 2);
  perform pg_temp.ok('S6 · antes de desactivar, a sessão vale',
    public.secretary_session_check(pg_temp.hash('s-live')) = 'b3000000-0000-0000-0000-00000000000a');
  execute 'reset role';

  insert into public.booking_cases (id, token, partner_id, organisation_id, secretary_id) values
    ('b4000000-0000-0000-0000-00000000000a', 'tok-sec-1', 'b1000000-0000-0000-0000-00000000000a',
     'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a');

  update public.ministry_secretaries
     set active = false, deactivated_at = now(), deactivated_by_email = 'admin@alo.sec'
   where id = 'b3000000-0000-0000-0000-00000000000a';

  perform pg_temp.ok('S6 · desactivar apaga as sessões',
    not exists (select 1 from public.ministry_secretary_sessions where secretary_id = 'b3000000-0000-0000-0000-00000000000a'));

  execute 'set local role service_role';
  insert into public.ministry_secretary_sessions (token_hash, secretary_id, pin_version) values
    (pg_temp.hash('s-after'), 'b3000000-0000-0000-0000-00000000000a', 2);
  perform pg_temp.ok('S6 · desactivada, nenhuma sessão vale', public.secretary_session_check(pg_temp.hash('s-after')) is null);
  execute 'reset role';

  perform pg_temp.ok('S6 · o histórico fica: o caso continua da secretária',
    exists (select 1 from public.booking_cases
             where id = 'b4000000-0000-0000-0000-00000000000a'
               and secretary_id = 'b3000000-0000-0000-0000-00000000000a'));

  begin
    update public.ministry_secretaries set active = false, deactivated_at = null
     where id = 'b3000000-0000-0000-0000-00000000000b';
    raise exception 'FALHOU · S6 · inactiva sem data';
  exception when check_violation then
    raise notice 'ok · S6 · inactiva leva a data';
  end;

  begin
    delete from public.ministry_secretaries where id = 'b3000000-0000-0000-0000-00000000000a';
    raise exception 'FALHOU · S6 · uma secretária com pedidos foi apagada';
  exception when foreign_key_violation then
    raise notice 'ok · S6 · uma secretária com pedidos não se apaga';
  end;

  -- O ministério desactivado também corta.
  update public.ministry_secretaries set active = true, deactivated_at = null, deactivated_by_email = null
   where id = 'b3000000-0000-0000-0000-00000000000a';
  execute 'set local role service_role';
  insert into public.ministry_secretary_sessions (token_hash, secretary_id, pin_version) values
    (pg_temp.hash('s-org'), 'b3000000-0000-0000-0000-00000000000a', 2);
  execute 'reset role';
  update public.organisations set active = false where id = 'b2000000-0000-0000-0000-00000000000a';
  execute 'set local role service_role';
  perform pg_temp.ok('S6 · ministério inactivo: nenhuma sessão vale', public.secretary_session_check(pg_temp.hash('s-org')) is null);
  execute 'reset role';
  update public.organisations set active = true where id = 'b2000000-0000-0000-0000-00000000000a';
end $$;

-- ── S9 · a secretária do caso ───────────────────────────────────────────────

do $$
begin
  begin
    insert into public.booking_cases (id, token, partner_id, organisation_id, secretary_id) values
      ('b4000000-0000-0000-0000-00000000000b', 'tok-sec-2', 'b1000000-0000-0000-0000-00000000000a',
       'b2000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU · S9 · um caso da Educação com uma secretária da Saúde';
  exception when foreign_key_violation then
    raise notice 'ok · S9 · a secretária do caso é do ministério do caso';
  end;

  begin
    insert into public.booking_cases (id, token, partner_id, secretary_id) values
      ('b4000000-0000-0000-0000-00000000000c', 'tok-sec-3', 'b1000000-0000-0000-0000-00000000000a',
       'b3000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU · S9 · um caso sem ministério com secretária';
  exception when check_violation then
    raise notice 'ok · S9 · sem ministério não há secretária';
  end;

  -- D-4 · as duas secretárias do mesmo ministério: os casos são do ministério.
  insert into public.booking_cases (id, token, partner_id, organisation_id, secretary_id) values
    ('b4000000-0000-0000-0000-00000000000d', 'tok-sec-4', 'b1000000-0000-0000-0000-00000000000a',
     'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000b');
  perform pg_temp.ok('S9 · dois pedidos do mesmo ministério, cada um com a sua autora',
    (select count(distinct secretary_id) from public.booking_cases
      where organisation_id = 'b2000000-0000-0000-0000-00000000000a') = 2);
end $$;

do $$ begin raise notice 'ok · test_secretaries'; end $$;

rollback;
