-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · dados de teste do B2G v2 (persona por persona)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Não é uma migração: não vive em `supabase/migrations/`, não corre no
-- `supabase/tests/run.sh` e não se aplica com `scripts/apply-all.sql`. É um
-- script de DADOS, para um humano correr à mão, uma vez, contra a produção —
-- depois de ler `docs/b2g-v2/PREPARAR_TESTES.md` e
-- `docs/b2g-v2/weefly_test_fixtures.json`.
--
--   psql "$DATABASE_URL" -f scripts/seed-b2g-test.sql
--
-- ⚠ Nunca correr com `SUPABASE_DB_URL` (é a variável do `apply-all.sql` e dos
--   testes). Use a ligação direta de produção que o Ivandro/Fábio escolherem
--   para este passo, depois de confirmada a cópia de segurança do `P-01`.
--
-- O que este script faz (idempotente — pode correr tantas vezes quantas
-- forem precisas; cada escrita é um upsert ou verifica antes de inserir):
--
--   · Parceiros — garante os canais de cada um (B2C/VIP/B2G), sem renomear
--     ninguém: o operador (`weefly`) ganha VIP; nasce o `mz` (WeeFly
--     Moçambique); a Alô ganha B2C+VIP ao lado do B2G que já tinha; a
--     Empresa Teste fica só com B2C e com a ferramenta Viagens ligada.
--   · Os três ministérios de teste da Alô (Saúde/Educação/Finanças), com
--     logótipo horizontal e brasão.
--   · O Dominik com o perfil Admin WeeFly (`bo_allowlist`) e, se a conta dele
--     já existir em `auth.users`, a ficha `pro_accounts` aprovada e master.
--
-- O que este script NÃO faz, de propósito:
--
--   · Não cria secretárias nem clientes VIP — nascem na interface, durante o
--     próprio teste (P-06, menu VIP).
--   · Não mexe em `auth.users` nem em passwords, em ninguém.
--   · Não cria as contas de agente da Alô nem da Empresa Teste — essas
--     nascem em Admin › Utilizadores (ver o bloco comentado ao fundo).
--
-- Depende de as migrações 0020 a 0037 já terem corrido (partners, organisations,
-- bo_allowlist/access_roles, pro_accounts, vip_clients, ministry_secretaries).
--
-- ═══════════════════════════════════════════════════════════════════════════

-- `gen_random_bytes` (para o link_token dos ministérios, 192 bits como o
-- resto do código) vive no pgcrypto. Em produção já está ligado (é um dos
-- extensões por omissão do Supabase); `if not exists` torna isto inofensivo
-- também numa base onde já esteja.
create extension if not exists pgcrypto;

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · Parceiros e os seus canais
-- ═══════════════════════════════════════════════════════════════════════════

-- O operador (`weefly`): B2C e B2G já vinham da 0020; falta o VIP. Não se
-- renomeia nada (a decisão 6 do bloco 1 do PROGRESSO.md é clara nisso).
update public.partners
   set channels         = array['B2C', 'VIP', 'B2G']::text[],
       changed_by_email  = 'scripts/seed-b2g-test.sql'
 where is_operator
   and channels is distinct from array['B2C', 'VIP', 'B2G']::text[];

-- `mz` · WeeFly Moçambique (B2G-20). Nasce com os defaults sensatos de uma
-- marca da própria WeeFly — o mesmo molde de `sell_mode`/`customer_front` do
-- operador, mas sem ser o operador (só um parceiro pode ter `is_operator`) —
-- tal como a 0031 semeou a Alô: um `insert … on conflict (slug) do update`,
-- para que correr o script outra vez não apague o que um Admin já tiver
-- ajustado na marca (logótipos, cores, NIF…), mas garanta sempre o estado e
-- os canais que o teste precisa.
insert into public.partners
  (slug, commercial_name, country, status,
   supply_enabled, sell_enabled, sell_mode, channels, customer_front,
   powered_by_weefly, is_operator, changed_by_email)
values
  ('mz', 'WeeFly Moçambique', 'MZ', 'active',
   false, true, 'reseller', array['B2C', 'VIP']::text[], 'weefly',
   false, false, 'scripts/seed-b2g-test.sql')
on conflict (slug) do update
  set commercial_name  = excluded.commercial_name,
      status           = 'active',
      channels         = array['B2C', 'VIP']::text[],
      sell_mode        = coalesce(public.partners.sell_mode, excluded.sell_mode),
      customer_front   = coalesce(public.partners.customer_front, excluded.customer_front),
      changed_by_email = 'scripts/seed-b2g-test.sql';

-- Alô · ganha B2C e VIP ao lado do B2G que a 0031 já lhe deu (decisão 1 do
-- bloco 1 e decisão 1 do bloco 2 do PROGRESSO.md: sem isto, o agente da Alô
-- não vê o menu Público nem a opção Público no construtor de links).
update public.partners
   set channels          = array['B2C', 'VIP', 'B2G']::text[],
       powered_by_weefly = true,
       changed_by_email  = 'scripts/seed-b2g-test.sql'
 where slug = 'alo';

-- Empresa Teste · já existe em produção (P-04). É o controlo do teste: só
-- B2C, nunca vê nada do B2G nem da Alô. Procurada pelo nome comercial (não
-- há slug fixo combinado); se não existir, avisa e não falha o resto do
-- script.
do $$
declare
  v_partner_id uuid;
begin
  select id into v_partner_id
    from public.partners
   where commercial_name ilike 'Empresa Teste%'
   order by created_at asc
   limit 1;

  if v_partner_id is null then
    raise notice 'seed-b2g-test: nenhum parceiro com commercial_name ilike ''Empresa Teste%%'' — a saltar (P-04 não encontrado)';
  else
    update public.partners
       set channels = array['B2C']::text[],
           -- A ferramenta Viagens (hoje "flights" em agent_menus) tem de
           -- estar ligada, como nos outros parceiros — sem apagar outros
           -- menus que já estejam ligados.
           agent_menus = case
             when 'flights' = any(agent_menus) then agent_menus
             else agent_menus || array['flights']::text[]
           end,
           changed_by_email = 'scripts/seed-b2g-test.sql'
     where id = v_partner_id;

    raise notice 'seed-b2g-test: Empresa Teste (%) actualizada — canal B2C, ferramenta Viagens confirmada', v_partner_id;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · Os três ministérios de teste, na Alô
-- ═══════════════════════════════════════════════════════════════════════════
--
-- P-05 do PREPARAR_TESTES.md · TESTE Ministério da Saúde / Educação /
-- Finanças, todos activos, com o brasão e o logótipo horizontal já
-- carregados em `public/brand/ministerios/` (fora deste script). O
-- `link_token` é histórico (0034: "deixou de ser credencial"), mas gera-se
-- na mesma, como o resto do código gera os seus (192 bits, base64url).

do $$
declare
  v_alo uuid;
begin
  select id into v_alo from public.partners where slug = 'alo';

  if v_alo is null then
    raise notice 'seed-b2g-test: parceiro "alo" não encontrado — a saltar os três ministérios de teste';
  else
    insert into public.organisations
      (partner_id, slug, name, logo_url, crest_url, active, created_by_email, link_token)
    values
      (v_alo, 'teste-saude', 'TESTE Ministério da Saúde',
       '/brand/ministerios/ministerio_saude_horizontal.png',
       '/brand/ministerios/ministerio_saude_brasao.png',
       true, 'dominik@weefly.africa',
       rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=')),
      (v_alo, 'teste-educacao', 'TESTE Ministério da Educação',
       '/brand/ministerios/ministerio_educacao_horizontal.png',
       '/brand/ministerios/ministerio_educacao_brasao.png',
       true, 'dominik@weefly.africa',
       rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=')),
      (v_alo, 'teste-financas', 'TESTE Ministério das Finanças',
       '/brand/ministerios/ministerio_financas_horizontal.png',
       '/brand/ministerios/ministerio_financas_brasao.png',
       true, 'dominik@weefly.africa',
       rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '='))
    on conflict (partner_id, slug) do update
      set name      = excluded.name,
          logo_url  = excluded.logo_url,
          crest_url = excluded.crest_url,
          active    = true;
      -- `link_token` fica como estava: não se regenera a cada corrida (não é
      -- `excluded.*` acima, por isso o `do update` não lhe toca).

    raise notice 'seed-b2g-test: três ministérios de teste confirmados na Alô (%)', v_alo;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · O Dominik — master, sem passar pela fila de aprovação
-- ═══════════════════════════════════════════════════════════════════════════
--
-- P-02 do PREPARAR_TESTES.md. `bo_allowlist` não depende de `auth.users` (a
-- chave é o email) — esta parte corre sempre. `pro_accounts.user_id` TEM uma
-- FK para `auth.users`, por isso só se escreve se a conta já existir (o
-- registo dele, feito por fora deste script); se ainda não existir, avisa e
-- não falha.

insert into public.bo_allowlist (email, label, role, active, partner_id, role_id, changed_by_email)
select 'dominik@weefly.africa', 'Dominik', 'admin', true, p.id, 'weefly_admin', 'scripts/seed-b2g-test.sql'
  from public.partners p
 where p.is_operator
on conflict (email) do update
  set role_id          = 'weefly_admin',
      active           = true,
      partner_id       = excluded.partner_id,
      changed_by_email = 'scripts/seed-b2g-test.sql';
-- O gatilho `bo_allowlist_apply_role` (0026) alinha `cross_partner = true`
-- sozinho, a partir do perfil `weefly_admin`.

do $$
declare
  v_weefly uuid;
  v_user   uuid;
begin
  select id into v_weefly from public.partners where is_operator;
  select id into v_user   from auth.users where lower(email) = 'dominik@weefly.africa';

  if v_user is null then
    raise notice 'seed-b2g-test: dominik@weefly.africa ainda não existe em auth.users — pro_accounts fica por fazer (este script não cria contas de autenticação)';
  else
    insert into public.pro_accounts (user_id, email, status, partner_id, is_master, decided_at)
    values (v_user, 'dominik@weefly.africa', 'approved', v_weefly, true, now())
    on conflict (user_id) do update
      set status     = 'approved',
          partner_id = excluded.partner_id,
          is_master  = true,
          -- Os três módulos (Fornecedor/Agente/Admin) não são uma lista à
          -- parte: o Fornecedor e o Agente vêm de `supply_enabled`/
          -- `sell_enabled` do operador (já ligados pela 0020) e o Admin vem
          -- de `is_master`. Aprovado + master + partner_id do operador é
          -- tudo o que o schema exige para os três aparecerem.
          decided_at = coalesce(public.pro_accounts.decided_at, now());

    raise notice 'seed-b2g-test: pro_accounts do Dominik aprovada e master (user_id %)', v_user;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Agentes da Alô e da Empresa Teste — NÃO criados aqui
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `ivandrodebarros+alo@gmail.com` (Alô) e
-- `ivandrodebarros+empresateste@gmail.com` (Empresa Teste) nascem em
-- Admin › Utilizadores: isso cria o `auth.users` e, por gatilho (0022,
-- `create_pro_account`), a ficha em `pro_accounts`. Este script não toca em
-- `auth.users` nem em passwords, por isso não os cria.
--
-- `bo_allowlist` não tem FK para `auth.users` (a chave é o email): dava para
-- pré-criar aqui a linha do perfil antes de a conta existir. Não o faço,
-- para não deixar uma conta "fantasma" com perfil mas sem ninguém lá dentro
-- — e o ecrã de Utilizadores deixaria de a mostrar como "por criar".
-- `pro_accounts.user_id` tem FK para `auth.users` (`on delete cascade`):
-- essa linha não pode mesmo ser escrita antes de o utilizador existir.
--
-- Ficam aqui comentadas, para quem preferir fazer ao contrário:
--
-- insert into public.bo_allowlist (email, label, role, active, partner_id, role_id, changed_by_email)
-- select 'ivandrodebarros+alo@gmail.com', 'TESTE Agente Alô', 'manager', true, p.id, 'partner_agent', 'scripts/seed-b2g-test.sql'
--   from public.partners p where p.slug = 'alo'
-- on conflict (email) do nothing;
--
-- insert into public.bo_allowlist (email, label, role, active, partner_id, role_id, changed_by_email)
-- select 'ivandrodebarros+empresateste@gmail.com', 'TESTE Agente Empresa', 'manager', true, p.id, 'partner_agent', 'scripts/seed-b2g-test.sql'
--   from public.partners p where p.commercial_name ilike 'Empresa Teste%'
-- on conflict (email) do nothing;
--
-- (pro_accounts para estes dois: só depois de existir auth.users — a FK
-- recusa de qualquer forma, por isso nem vale a pena deixar o insert aqui.)

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferir o resultado
-- ═══════════════════════════════════════════════════════════════════════════

\echo '— Parceiros e canais —'
select slug, commercial_name, status, channels, is_operator, powered_by_weefly, agent_menus
  from public.partners
 where slug in ('weefly', 'mz', 'alo')
    or commercial_name ilike 'Empresa Teste%'
 order by (slug = 'weefly') desc, commercial_name;

\echo '— Ministérios de teste da Alô —'
select p.slug as parceiro, o.slug, o.name, o.active, o.logo_url, o.crest_url
  from public.organisations o
  join public.partners p on p.id = o.partner_id
 where o.slug in ('teste-saude', 'teste-educacao', 'teste-financas')
 order by o.slug;

\echo '— Dominik —'
select a.email, a.role_id, a.cross_partner, a.active,
       p.slug as partner_slug, p.supply_enabled, p.sell_enabled,
       pa.status as pro_status, pa.is_master
  from public.bo_allowlist a
  left join public.partners p on p.id = a.partner_id
  left join public.pro_accounts pa on lower(pa.email) = a.email
 where a.email = 'dominik@weefly.africa';
