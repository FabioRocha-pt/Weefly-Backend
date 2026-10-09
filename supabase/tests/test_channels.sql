-- B2G-02 · B2G-21 · os canais de cada empresa, provados na base de dados.
--
--   K1  os três canais aceitam-se; um quarto não
--   K2  partner_has_channel diz sim e não, e não abre a linha a ninguém
--   K3  um caso com ministério é `ministerio`, sempre
--   K4  um caso sem ministério não pode ser `ministerio`
--   K5  `concierge` não serve de subdomínio
--   K6  as acções novas do registo de acessos entram
--
-- Numa transacção que acaba em rollback.

\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-00000000000a', 'agent@teste.chan');

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode, channels) values
  ('91000000-0000-0000-0000-00000000000a', 'alo-chan',   'Alô Canais',     true, 'white_label', array['B2C', 'VIP', 'B2G']),
  ('91000000-0000-0000-0000-00000000000b', 'teste-chan', 'Empresa Teste',  true, 'reseller',    array['B2C']);

insert into public.organisations (id, partner_id, slug, name) values
  ('92000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'saude', 'Ministério da Saúde');

insert into public.bo_allowlist (email, label, partner_id, role_id) values
  ('agent@teste.chan', 'Teste', '91000000-0000-0000-0000-00000000000b', 'partner_agent');

create function pg_temp.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU · %', p_label; end if;
  raise notice 'ok · %', p_label;
end $$;

do $$
declare c text;
begin
  -- K1
  perform pg_temp.ok('K1 · Público, VIP e Ministérios aceitam-se',
    (select channels from public.partners where id = '91000000-0000-0000-0000-00000000000a') = array['B2C', 'VIP', 'B2G']);
  begin
    update public.partners set channels = array['B2C', 'B2B'] where id = '91000000-0000-0000-0000-00000000000b';
    raise exception 'FALHOU · K1 · um canal desconhecido entrou';
  exception when check_violation then
    raise notice 'ok · K1 · um canal desconhecido é recusado';
  end;

  -- K2
  perform pg_temp.ok('K2 · a Alô tem Ministérios',
    public.partner_has_channel('91000000-0000-0000-0000-00000000000a', 'B2G'));
  perform pg_temp.ok('K2 · a Empresa Teste não tem Ministérios',
    not public.partner_has_channel('91000000-0000-0000-0000-00000000000b', 'B2G'));
  perform pg_temp.ok('K2 · a Empresa Teste tem Público',
    public.partner_has_channel('91000000-0000-0000-0000-00000000000b', 'B2C'));
  perform pg_temp.ok('K2 · uma empresa que não existe não tem nada',
    not public.partner_has_channel('91000000-0000-0000-0000-0000000000ff', 'B2C'));

  -- Ligar e desligar é um update, sem mais nada.
  update public.partners set channels = array['B2C', 'B2G'] where id = '91000000-0000-0000-0000-00000000000b';
  perform pg_temp.ok('K2 · ligar Ministérios vê-se logo',
    public.partner_has_channel('91000000-0000-0000-0000-00000000000b', 'B2G'));
  update public.partners set channels = array['B2C'] where id = '91000000-0000-0000-0000-00000000000b';

  -- K3
  insert into public.booking_cases (id, token, partner_id, organisation_id, channel) values
    ('93000000-0000-0000-0000-00000000000a', 'tok-chan-1', '91000000-0000-0000-0000-00000000000a',
     '92000000-0000-0000-0000-00000000000a', 'publico');
  select channel into c from public.booking_cases where id = '93000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('K3 · um caso com ministério nasce ministerio', c = 'ministerio');

  update public.booking_cases set channel = 'vip' where id = '93000000-0000-0000-0000-00000000000a';
  select channel into c from public.booking_cases where id = '93000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('K3 · e não deixa de o ser', c = 'ministerio');

  -- K4
  insert into public.booking_cases (id, token, partner_id) values
    ('93000000-0000-0000-0000-00000000000b', 'tok-chan-2', '91000000-0000-0000-0000-00000000000b');
  select channel into c from public.booking_cases where id = '93000000-0000-0000-0000-00000000000b';
  perform pg_temp.ok('K4 · por omissão, publico', c = 'publico');

  update public.booking_cases set channel = 'ministerio' where id = '93000000-0000-0000-0000-00000000000b';
  select channel into c from public.booking_cases where id = '93000000-0000-0000-0000-00000000000b';
  perform pg_temp.ok('K4 · sem ministério não é ministerio', c = 'publico');

  update public.booking_cases set channel = 'vip' where id = '93000000-0000-0000-0000-00000000000b';
  select channel into c from public.booking_cases where id = '93000000-0000-0000-0000-00000000000b';
  perform pg_temp.ok('K4 · vip fica como veio', c = 'vip');

  begin
    update public.booking_cases set channel = 'b2b' where id = '93000000-0000-0000-0000-00000000000b';
    raise exception 'FALHOU · K4 · um canal de caso desconhecido entrou';
  exception when check_violation then
    raise notice 'ok · K4 · um canal de caso desconhecido é recusado';
  end;

  -- K5
  begin
    insert into public.partners (slug, commercial_name) values ('concierge', 'Concierge');
    raise exception 'FALHOU · K5 · concierge entrou como subdomínio';
  exception when check_violation then
    raise notice 'ok · K5 · concierge é reservado';
  end;

  -- K6
  insert into public.access_audit (actor_email, action, partner_id, target) values
    ('agent@teste.chan', 'vip_created', '91000000-0000-0000-0000-00000000000a', 'vip'),
    ('agent@teste.chan', 'secretary_pin_generated', '91000000-0000-0000-0000-00000000000a', 'sec'),
    ('agent@teste.chan', 'ministry_requested', '91000000-0000-0000-0000-00000000000a', 'min'),
    ('agent@teste.chan', 'case_claimed', '91000000-0000-0000-0000-00000000000a', 'case');
  perform pg_temp.ok('K6 · as acções novas do registo entram', true);
end $$;

-- K2 · a função responde a uma sessão sem a deixar ler a empresa de outro.
do $$
begin
  perform set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-00000000000a', true);
  execute 'set local role authenticated';
  perform pg_temp.ok('K2 · a sessão pergunta e tem resposta',
    public.partner_has_channel('91000000-0000-0000-0000-00000000000a', 'B2G'));
  perform pg_temp.ok('K2 · mas a linha da outra empresa continua fechada',
    not exists (select 1 from public.partners where id = '91000000-0000-0000-0000-00000000000a'));
  execute 'reset role';
end $$;

do $$ begin raise notice 'ok · test_channels'; end $$;

rollback;
