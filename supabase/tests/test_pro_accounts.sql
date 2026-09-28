-- PRO-02 / PRO-04 / PRO-09 · as contas do WeeFly Pro (migração 0022).
--
-- Uma falha levanta exceção e o run.sh pára.

\set ON_ERROR_STOP 1

-- ── A conta nasce pendente, com a empresa do registo ───────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('50000000-0000-0000-0000-00000000000a', 'Nova@Empresa.test', '{"company": "  Empresa Nova  "}'),
  ('50000000-0000-0000-0000-00000000000b', 'outra@empresa.test', '{}');

do $$
declare r record;
begin
  select * into r from public.pro_accounts where user_id = '50000000-0000-0000-0000-00000000000a';
  if r is null then raise exception 'PRO-09: o registo não criou a conta'; end if;
  if r.status <> 'pending' then raise exception 'PRO-09: conta nova não está pendente (%)', r.status; end if;
  if r.email <> 'nova@empresa.test' then raise exception 'email não normalizado: %', r.email; end if;
  if r.company_hint is distinct from 'Empresa Nova' then raise exception 'company_hint: %', r.company_hint; end if;
  if r.partner_id is not null or r.is_master then raise exception 'conta nova já com empresa ou master'; end if;
  raise notice 'ok · conta nova pendente com a empresa do registo';
end $$;

-- ── As regras da linha ─────────────────────────────────────────────────────

do $$
begin
  begin
    update public.pro_accounts set status = 'approved'
     where user_id = '50000000-0000-0000-0000-00000000000a';
    raise exception 'aprovou sem empresa';
  exception when check_violation then null;
  end;

  begin
    update public.pro_accounts set status = 'rejected', rejection_reason = '   '
     where user_id = '50000000-0000-0000-0000-00000000000a';
    raise exception 'recusou sem motivo';
  exception when check_violation then null;
  end;

  begin
    update public.pro_accounts set is_master = true
     where user_id = '50000000-0000-0000-0000-00000000000a';
    raise exception 'master numa conta pendente';
  exception when check_violation then null;
  end;
  raise notice 'ok · aprovada tem empresa, recusada tem motivo, master está aprovada';
end $$;

insert into public.partners (id, slug, commercial_name, sell_enabled, sell_mode)
values ('60000000-0000-0000-0000-00000000000a', 'gamma', 'Gamma', true, 'white_label');

do $$
begin
  update public.pro_accounts
     set status = 'approved', partner_id = '60000000-0000-0000-0000-00000000000a'
   where user_id = '50000000-0000-0000-0000-00000000000a';

  begin
    update public.pro_accounts set is_master = true
     where user_id = '50000000-0000-0000-0000-00000000000a';
    raise exception 'master fora do operador';
  exception when check_violation then null;
  end;
  raise notice 'ok · a conta master só existe no operador';
end $$;

-- ── PRO-04 · menus por empresa ─────────────────────────────────────────────

do $$
declare menus text[];
begin
  select agent_menus into menus from public.partners where is_operator;
  if menus <> array['flights', 'cars', 'houses', 'experiences', 'food'] then
    raise exception 'PRO-04: a WeeFly Global não tem os cinco menus (%)', menus;
  end if;

  select agent_menus into menus from public.partners where slug = 'gamma';
  if menus <> array['flights'] then
    raise exception 'PRO-04: uma empresa nova devia nascer só com Passagens (%)', menus;
  end if;

  begin
    update public.partners set agent_menus = array['flights', 'boats'] where slug = 'gamma';
    raise exception 'aceitou um menu que não existe';
  exception when check_violation then null;
  end;
  raise notice 'ok · menus: cinco na WeeFly, Passagens por omissão, só os conhecidos';
end $$;

-- ── O email corrigido no registo (PRO-07) segue para a conta ───────────────

update auth.users set email = 'Corrigido@Empresa.test'
 where id = '50000000-0000-0000-0000-00000000000b';

do $$
begin
  if (select email from public.pro_accounts
       where user_id = '50000000-0000-0000-0000-00000000000b') <> 'corrigido@empresa.test' then
    raise exception 'PRO-07: a conta não seguiu o email corrigido';
  end if;
  raise notice 'ok · o email corrigido segue para a conta';
end $$;

-- ── RLS · cada um lê a sua, ninguém escreve pelo browser ──────────────────

set role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-00000000000b', false);

do $$
declare n int;
begin
  select count(*) into n from public.pro_accounts;
  if n <> 1 then raise exception 'RLS: a conta vê % contas, devia ver só a sua', n; end if;

  select count(*) into n from public.pro_account_decisions;
  if n <> 0 then raise exception 'RLS: vê decisões que não são suas'; end if;

  update public.pro_accounts set status = 'approved', is_master = true
   where user_id = '50000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS: a conta aprovou-se a si própria'; end if;
  raise notice 'ok · RLS: lê a sua, não se aprova';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  if (select status from public.pro_accounts
       where user_id = '50000000-0000-0000-0000-00000000000b') <> 'pending' then
    raise exception 'RLS: o update pelo browser passou';
  end if;
  raise notice 'ok · test_pro_accounts';
end $$;


-- ── 0025 · quem está na allowlist entra aprovado; o Dominik como master ────

insert into public.bo_allowlist (email, label, role, active, partner_id)
values ('dominik@weefly.africa', 'Dominik', 'manager', true, public.default_partner_id())
on conflict (email) do update set active = true, partner_id = excluded.partner_id;

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-00000000000c', 'Dominik@WeeFly.africa');

do $$
declare r record;
begin
  select * into r from public.pro_accounts where user_id = '50000000-0000-0000-0000-00000000000c';
  if r.status <> 'approved' then raise exception '0025: allowlist não aprovou (%)', r.status; end if;
  if not r.is_master then raise exception '0025: o Dominik não ficou master'; end if;
  if r.partner_id is distinct from public.default_partner_id() then raise exception '0025: empresa errada'; end if;
  raise notice 'ok · allowlist entra aprovada, Dominik master';
end $$;

delete from auth.users where id = '50000000-0000-0000-0000-00000000000c';
delete from public.bo_allowlist where email = 'dominik@weefly.africa';

-- Limpar, para não mexer nas contagens do test_tenancy.
delete from auth.users where id in (
  '50000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000b');
delete from public.partners where slug = 'gamma';
