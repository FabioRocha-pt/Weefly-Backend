-- TEN-03 · "One explicit test per partner proves it."
--
-- Três parceiros (WeeFly, Alô, e um terceiro, Beta, para provar que o Alô não
-- vê outro parceiro que não seja a WeeFly), um caso cada, e cinco contas:
--
--   admin   WeeFly, cross_partner   — vê tudo, como hoje
--   seller  WeeFly, sem cross       — só a WeeFly
--   alo     Alô                     — só o Alô
--   beta    Beta                    — só a Beta, e nada depois de suspensa
--   ghost   sessão sem conta        — nada
--
-- Cada verificação corre como o PostgREST corre: `role authenticated` e o
-- `sub` do JWT na sessão. Uma falha levanta exceção e o run.sh pára.

\set ON_ERROR_STOP 1

-- ── Dados, como superutilizador ────────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@weefly.test'),
  ('00000000-0000-0000-0000-00000000000b', 'seller@weefly.test'),
  ('00000000-0000-0000-0000-00000000000c', 'agent@alo.test'),
  ('00000000-0000-0000-0000-00000000000d', 'agent@beta.test'),
  ('00000000-0000-0000-0000-00000000000e', 'ghost@nowhere.test'),
  ('00000000-0000-0000-0000-00000000000f', 'solo@weefly.test');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels)
values
  ('10000000-0000-0000-0000-00000000000a', 'alo-ten', 'Alô',  true, 'white_label', array['B2G']),
  ('10000000-0000-0000-0000-00000000000b', 'beta', 'Beta', true, 'reseller',    array['B2C']);

insert into public.organisations (id, partner_id, slug, name) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'saude', 'Ministério da Saúde'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'geral', 'Beta Geral');

insert into public.bo_allowlist (email, label, role, active, partner_id, cross_partner) values
  ('admin@weefly.test',  'Admin',  'admin',   true, public.default_partner_id(), true),
  ('seller@weefly.test', 'Seller', 'manager', true, public.default_partner_id(), false),
  ('agent@alo.test',     'Alô',    'manager', true, '10000000-0000-0000-0000-00000000000a', false),
  ('agent@beta.test',    'Beta',   'manager', true, '10000000-0000-0000-0000-00000000000b', false),
  -- Só na allowlist, sem linha em platform_staff — como o Ivandro.
  ('solo@weefly.test',   'Solo',   'manager', true, public.default_partner_id(), false);

insert into public.platform_staff (user_id, email, role, partner_id) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@weefly.test',  'admin',   public.default_partner_id()),
  ('00000000-0000-0000-0000-00000000000b', 'seller@weefly.test', 'manager', public.default_partner_id()),
  ('00000000-0000-0000-0000-00000000000c', 'agent@alo.test',     'manager', '10000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000d', 'agent@beta.test',    'manager', '10000000-0000-0000-0000-00000000000b');

-- Um caso da WeeFly sem partner_id explícito: prova que o default transitório
-- preenche, e que o código do MVP 1 continua a criar casos.
insert into public.booking_cases (id, token) values
  ('30000000-0000-0000-0000-00000000000a', 'tok-weefly');
insert into public.booking_cases (id, token, partner_id, organisation_id) values
  ('30000000-0000-0000-0000-00000000000b', 'tok-alo',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-00000000000c', 'tok-beta',
   '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b');

insert into public.case_events (case_id, kind, title)
select id, 'test', 'evento ' || token from public.booking_cases;

insert into public.case_proposals (id, case_id)
select gen_random_uuid(), id from public.booking_cases;

insert into public.case_offers (id, proposal_id)
select gen_random_uuid(), id from public.case_proposals;

insert into public.case_offer_segments (offer_id, direction)
select id, 'ida' from public.case_offers;

-- ── Ajudante: quantas linhas vê cada conta ─────────────────────────────────

create function pg_temp.visible(p_user uuid, p_table text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  execute format('select count(*) from public.%I', p_table) into n;
  reset role;
  return n;
end $$;

create function pg_temp.expect(p_label text, p_got bigint, p_want bigint)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU · %: esperava %, obteve %', p_label, p_want, p_got;
  end if;
  raise notice 'ok · %', p_label;
end $$;

-- ── Leitura ────────────────────────────────────────────────────────────────

begin;
do $$
declare
  admin  uuid := '00000000-0000-0000-0000-00000000000a';
  seller uuid := '00000000-0000-0000-0000-00000000000b';
  alo    uuid := '00000000-0000-0000-0000-00000000000c';
  beta   uuid := '00000000-0000-0000-0000-00000000000d';
  ghost  uuid := '00000000-0000-0000-0000-00000000000e';
  solo   uuid := '00000000-0000-0000-0000-00000000000f';
  t text;
begin
  -- Cada tabela, descendo a árvore: caso → proposta → oferta → segmento.
  foreach t in array array['booking_cases', 'case_events', 'case_proposals',
                           'case_offers', 'case_offer_segments'] loop
    perform pg_temp.expect('admin vê os 3 em '  || t, pg_temp.visible(admin,  t), 3);
    perform pg_temp.expect('seller vê 1 em '    || t, pg_temp.visible(seller, t), 1);
    perform pg_temp.expect('alo vê 1 em '       || t, pg_temp.visible(alo,    t), 1);
    perform pg_temp.expect('beta vê 1 em '      || t, pg_temp.visible(beta,   t), 1);
    perform pg_temp.expect('ghost vê 0 em '     || t, pg_temp.visible(ghost,  t), 0);
    -- A política bo_access: a allowlist chega, sem platform_staff.
    perform pg_temp.expect('solo vê 1 em '      || t, pg_temp.visible(solo,   t), 1);
  end loop;

  perform pg_temp.expect('alo vê só os seus ministérios', pg_temp.visible(alo, 'organisations'), 1);
  perform pg_temp.expect('admin vê todos os ministérios', pg_temp.visible(admin, 'organisations'), 2);
  perform pg_temp.expect('alo vê só o seu parceiro', pg_temp.visible(alo, 'partners'), 1);
  perform pg_temp.expect('alo vê só as contas do Alô', pg_temp.visible(alo, 'bo_allowlist'), 1);
  -- As contas reais que as migrações 0009–0018 semeiam contam também.
  perform pg_temp.expect('admin vê todas as contas', pg_temp.visible(admin, 'bo_allowlist'),
                         (select count(*) from public.bo_allowlist));
end $$;
rollback;

-- O caso certo, não só o número certo.
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
set local role authenticated;
do $$
begin
  if (select token from public.booking_cases) <> 'tok-alo' then
    raise exception 'FALHOU · o caso que o alo vê não é o do Alô';
  end if;
  -- "Opening another partner's case by direct URL returns not-found": com RLS,
  -- o caso da WeeFly pedido pelo id simplesmente não existe.
  if exists (select 1 from public.booking_cases
              where id = '30000000-0000-0000-0000-00000000000a') then
    raise exception 'FALHOU · o alo abre o caso da WeeFly pelo id';
  end if;
  raise notice 'ok · alo vê o tok-alo e o caso da WeeFly é not-found';
end $$;
rollback;

-- ── Escrita ────────────────────────────────────────────────────────────────

-- O alo não cria um caso noutro parceiro.
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
set local role authenticated;
do $$
begin
  begin
    insert into public.booking_cases (token, partner_id)
    values ('tok-intruso', '10000000-0000-0000-0000-00000000000b');
    raise exception 'FALHOU · o alo criou um caso da Beta';
  exception when insufficient_privilege then
    raise notice 'ok · o alo não cria casos da Beta';
  end;
end $$;
rollback;

-- O alo não muda o seu caso para outro parceiro.
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
set local role authenticated;
do $$
begin
  begin
    update public.booking_cases
       set partner_id = '10000000-0000-0000-0000-00000000000b', organisation_id = null
     where token = 'tok-alo';
    raise exception 'FALHOU · o alo passou o caso para a Beta';
  exception when insufficient_privilege then
    raise notice 'ok · o alo não passa casos para a Beta';
  end;
end $$;
rollback;

-- O alo não mexe num caso que não vê: o update toca zero linhas.
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
set local role authenticated;
do $$
declare n int;
begin
  update public.booking_cases set stage = 'cancelado' where token = 'tok-beta';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU · o alo alterou o caso da Beta'; end if;
  raise notice 'ok · o alo não altera o caso da Beta';
end $$;
rollback;

-- As contas não se criam pela sessão (ADM-02 fica para depois).
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
set local role authenticated;
do $$
begin
  begin
    insert into public.bo_allowlist (email, label, role, partner_id)
    values ('novo@alo.test', 'Novo', 'admin', '10000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU · o alo criou uma conta';
  exception when insufficient_privilege then
    raise notice 'ok · o alo não cria contas';
  end;
end $$;
rollback;

-- ── Integridade, como superutilizador ─────────────────────────────────────

-- O ministério de um caso é do mesmo parceiro que o caso.
do $$
begin
  begin
    insert into public.booking_cases (token, partner_id, organisation_id)
    values ('tok-misto', '10000000-0000-0000-0000-00000000000a',
                         '20000000-0000-0000-0000-00000000000b');
    raise exception 'FALHOU · caso do Alô com ministério da Beta';
  exception when foreign_key_violation then
    raise notice 'ok · ministério e caso têm de ser do mesmo parceiro';
  end;
end $$;

-- cross_partner só em contas do operador. Desde a 0026 é o perfil que o
-- decide: escrevê-lo à mão não pega.
do $$
begin
  begin
    update public.bo_allowlist set cross_partner = true where email = 'agent@alo.test';
    if (select cross_partner from public.bo_allowlist where email = 'agent@alo.test') then
      raise exception 'FALHOU · uma conta do Alô ficou cross_partner';
    end if;
    raise notice 'ok · cross_partner recusado fora do operador';
  exception when check_violation then
    raise notice 'ok · cross_partner recusado fora do operador';
  end;
end $$;

-- Todas as linhas existentes ficaram com parceiro (TEN-01).
do $$
begin
  if exists (select 1 from public.booking_cases where partner_id is null) then
    raise exception 'FALHOU · caso sem parceiro';
  end if;
  if (select partner_id from public.booking_cases where token = 'tok-weefly')
     is distinct from public.default_partner_id() then
    raise exception 'FALHOU · o caso sem parceiro explícito não ficou na WeeFly';
  end if;
  raise notice 'ok · o default transitório põe os casos antigos na WeeFly';
end $$;

-- ── Suspensão (ADM-01) ─────────────────────────────────────────────────────

begin;
update public.partners set status = 'suspended' where slug = 'beta';
do $$
begin
  perform pg_temp.expect('beta suspensa não vê nada',
    pg_temp.visible('00000000-0000-0000-0000-00000000000d', 'booking_cases'), 0);
  perform pg_temp.expect('admin continua a ver o caso da Beta suspensa',
    pg_temp.visible('00000000-0000-0000-0000-00000000000a', 'booking_cases'), 3);
end $$;
rollback;

-- Desactivar na allowlist chega. A linha do platform_staff fica, e não pode
-- voltar a abrir a porta.
begin;
update public.bo_allowlist set active = false where email = 'agent@alo.test';
do $$
begin
  perform pg_temp.expect('alo desactivado não vê nada',
    pg_temp.visible('00000000-0000-0000-0000-00000000000c', 'booking_cases'), 0);
end $$;
rollback;
