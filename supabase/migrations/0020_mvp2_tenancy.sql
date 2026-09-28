-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · MVP 2 — a fundação multi-parceiro (TEN-01, TEN-03, TEN-06)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O que esta migração serve, da `WeeFly_MVP2_Specification_v5.2.md`:
--
--   TEN-01 · três níveis: parceiro → organização → caso. Todo o caso ganha
--            `partner_id` (nunca nulo) e `organisation_id` (opcional: os casos
--            de retalho da própria WeeFly não têm ministério).
--
--   TEN-03 · isolamento na base de dados, não só no código. Cada tabela do
--            back-office ganha uma política `restrictive`.
--
--   TEN-06 · toda a conta pertence a um parceiro, e o parceiro vem da sessão.
--
--   E o modelo de contas da spec ("two menus"): fornecer e vender são duas
--   capacidades da mesma conta, não dois tipos de conta.
--
-- ── Porque é que isto não parte nada do que existe ─────────────────────────
--
-- 1. **Políticas restritivas.** O Postgres junta as políticas `permissive` com
--    OR e as `restrictive` com AND. As políticas de hoje (`is_platform_staff`,
--    `is_bo_allowed`) ficam intactas; esta migração acrescenta, em cada tabela,
--    "…e o caso é de um parceiro que podes ver". Para a equipa WeeFly a
--    resposta é sempre sim, e o back-office comporta-se como antes.
--
-- 2. **A service role ignora o RLS.** As páginas públicas (`/pc/{token}`), o
--    cron e os webhooks não têm sessão e continuam a ler pela service role — o
--    token já as limita a um caso. O isolamento que esta migração garante é o
--    do back-office, que é onde vão existir utilizadores de parceiros
--    diferentes. As leituras do back-office que hoje passam pela service role
--    têm de passar para o cliente da sessão antes de a primeira conta do Alô
--    existir. Até lá, `getBoAccess` recusa contas que não sejam da WeeFly.
--
-- 3. **O default de `partner_id` é temporário.** O código que hoje cria casos
--    não sabe o que é um parceiro, e não pode partir enquanto o MVP 1 está em
--    teste. `default_partner_id()` preenche a WeeFly; a 0021 retira o default
--    quando todo o `insert` passar o parceiro explicitamente. Enquanto
--    existir, é a única linha do sistema que "assume que o parceiro é a
--    WeeFly" — e está aqui, e não espalhada pelo código, para ser fácil de
--    encontrar e de apagar.
--
-- Idempotente. Pode correr duas vezes.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0020_mvp2_tenancy.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · Parceiros
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partners (
  id                uuid primary key default gen_random_uuid(),
  -- O subdomínio (TEN-04): `alo` → alo.weefly.africa. Só minúsculas, dígitos e
  -- hífen, porque é um rótulo de DNS.
  slug              text not null unique
                      check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),

  -- ADM-01 · registo
  commercial_name   text not null,
  legal_name        text,
  nif               text,
  country           text,
  address           text,
  contact_name      text,
  contact_email     text,
  contact_phone     text,
  contract_start    date,
  -- Suspender não apaga: bloqueia o login e congela os links (ADM-01).
  status            text not null default 'active'
                      check (status in ('active', 'suspended')),

  -- Os dois menus. Fornecer abre depois da aprovação e auditoria do Admin;
  -- vender está fechado até o Admin o abrir.
  supply_enabled    boolean not null default false,
  sell_enabled      boolean not null default false,
  -- Distintos nos dados desde o primeiro dia: mudam o logótipo, o remetente,
  -- o domínio e, quase de certeza, a comissão.
  sell_mode         text check (sell_mode in ('reseller', 'white_label')),
  -- A quem vende. B2B não entra aqui: é uma licença, não um canal.
  channels          text[] not null default '{}'
                      check (channels <@ array['B2C', 'B2G']::text[]),
  -- A licença B2B: só a WeeFly a dá, depois de um acordo fora da plataforma.
  b2b_licence       boolean not null default false,
  -- O que o link do cliente mostra, para um white label: a frente própria ou
  -- o ecrã WeeFly sem alterações.
  customer_front    text not null default 'own'
                      check (customer_front in ('own', 'weefly')),

  -- TEN-02 · marca, ao nível do parceiro. Sem cores no código: tudo daqui.
  logo_url          text,
  color_primary     text check (color_primary ~ '^#[0-9a-fA-F]{6}$'),
  color_dark        text check (color_dark ~ '^#[0-9a-fA-F]{6}$'),
  sender_name       text,
  sender_email      text,
  reply_to          text,
  footer_text       text,
  -- TEN-05 · por omissão, ligado.
  powered_by_weefly boolean not null default true,
  -- MIN-04 · o botão de WhatsApp da frente do ministério chega ao parceiro.
  whatsapp_number   text,

  -- O operador da plataforma. Só um parceiro o é (índice abaixo), e só as
  -- contas dele podem ter `cross_partner`. É uma coluna e não o slug
  -- 'weefly' escrito em regras, para que nenhuma regra dependa de um nome.
  is_operator       boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint partners_seller_has_mode
    check (not sell_enabled or sell_mode is not null)
);

create unique index if not exists partners_one_operator
  on public.partners (is_operator) where is_operator;

drop trigger if exists partners_touch_updated_at on public.partners;
create trigger partners_touch_updated_at
  before update on public.partners
  for each row execute function public.touch_updated_at();

-- A própria WeeFly é o primeiro parceiro: fornece o Concierge e vende-o em B2C
-- e B2G. O Alô não nasce aqui — nasce pelo ecrã do ADM-01.
insert into public.partners
  (slug, commercial_name, legal_name, country, status,
   supply_enabled, sell_enabled, sell_mode, channels, customer_front,
   powered_by_weefly, is_operator)
values
  ('weefly', 'WeeFly', 'WeeFly', 'CV', 'active',
   true, true, 'reseller', array['B2C', 'B2G'], 'weefly',
   false, true)
on conflict (slug) do nothing;

-- Transitório — ver o ponto 3 do cabeçalho. A 0021 apaga os defaults que o
-- usam, e depois esta função.
create or replace function public.default_partner_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select id from public.partners where is_operator;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · Organizações (os ministérios)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.organisations (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partners (id) on delete restrict,
  -- O caminho (TEN-04): alo.weefly.africa/m/saude
  slug            text not null
                    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  name            text not null,
  -- TEN-02 · ao nível da organização, só o nome e o brasão. Sem cores.
  logo_url        text,
  -- PAR-02 · o contacto do ministério. O histórico fica na organização, não
  -- na pessoa (PAR-04), e por isso a secretária é um campo e não a dona.
  secretary_name  text,
  secretary_email text,
  secretary_phone text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (partner_id, slug),
  -- Alvo da chave composta de `booking_cases`: garante que o ministério de um
  -- caso é do mesmo parceiro que o caso.
  unique (id, partner_id)
);

create index if not exists organisations_partner_idx
  on public.organisations (partner_id);

drop trigger if exists organisations_touch_updated_at on public.organisations;
create trigger organisations_touch_updated_at
  before update on public.organisations
  for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · Produtos e quem os pode vender
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só voos são construídos nesta versão. Carros, casas, experiências e comida
-- ficam listados e por fazer, mas o modelo já os aceita — é essa a razão de o
-- construir assim. O Concierge não tem inventário nem calendário: a fonte são
-- as companhias, pelo GDS e pelo consolidador.

create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  supplier_partner_id uuid not null references public.partners (id) on delete restrict,
  kind                text not null
                        check (kind in ('flights', 'cars', 'houses', 'experiences', 'food')),
  name                text not null,
  -- As três opções da spec: só o fornecedor, uma lista, ou qualquer vendedor
  -- aprovado.
  availability        text not null default 'only_me'
                        check (availability in ('only_me', 'authorised', 'open')),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (supplier_partner_id, kind, name)
);

create table if not exists public.product_sellers (
  product_id        uuid not null references public.products (id) on delete cascade,
  seller_partner_id uuid not null references public.partners (id) on delete cascade,
  -- Por onde este vendedor o pode vender: a WeeFly em B2C e B2G, o Alô em B2G.
  channels          text[] not null default '{}'
                      check (channels <@ array['B2C', 'B2G']::text[]),
  created_at        timestamptz not null default now(),
  primary key (product_id, seller_partner_id)
);

insert into public.products (supplier_partner_id, kind, name, availability)
select id, 'flights', 'Concierge', 'authorised'
  from public.partners where slug = 'weefly'
on conflict (supplier_partner_id, kind, name) do nothing;

insert into public.product_sellers (product_id, seller_partner_id, channels)
select p.id, w.id, array['B2C', 'B2G']
  from public.products p
  join public.partners w on w.slug = 'weefly'
 where p.supplier_partner_id = w.id and p.kind = 'flights' and p.name = 'Concierge'
on conflict (product_id, seller_partner_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 · O parceiro nas contas (TEN-06)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `bo_allowlist` é quem entra no back-office e `platform_staff` é quem as
-- políticas antigas reconhecem. As duas ganham o parceiro, para que nenhuma
-- das portas responda "sim" sem saber de quem é a pessoa.

alter table public.bo_allowlist
  add column if not exists partner_id uuid not null
    default public.default_partner_id() references public.partners (id);

-- ADM-02 · "WeeFly staff accounts belong to the WeeFly partner and carry a
-- cross-partner flag". Vê todos os parceiros (ADM-04). Só faz sentido numa
-- conta da WeeFly — a restrição impede que chegue a outra por engano.
alter table public.bo_allowlist
  add column if not exists cross_partner boolean not null default false;

create or replace function public.guard_cross_partner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cross_partner and not exists (
    select 1 from public.partners where id = new.partner_id and is_operator
  ) then
    raise exception 'cross_partner só é permitido em contas do operador (%)', new.email
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists bo_allowlist_guard_cross_partner on public.bo_allowlist;
create trigger bo_allowlist_guard_cross_partner
  before insert or update of cross_partner, partner_id on public.bo_allowlist
  for each row execute function public.guard_cross_partner();

-- Quem administra hoje: as contas de administração e o Dominik, que é o dono.
update public.bo_allowlist
   set cross_partner = true
 where active
   and (role = 'admin' or lower(email) = 'dominik@weefly.africa')
   and not cross_partner;

alter table public.platform_staff
  add column if not exists partner_id uuid not null
    default public.default_partner_id() references public.partners (id);

create index if not exists bo_allowlist_partner_idx on public.bo_allowlist (partner_id);
create index if not exists platform_staff_partner_idx on public.platform_staff (partner_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 · O parceiro nos casos (TEN-01)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Nos quatro sítios onde um pedido começa: o lead, o pedido de viagem, o caso
-- e a conversa do chatbot. O resto (passageiros, pagamentos, propostas…)
-- chega ao parceiro pelo caso, e não copia a coluna — uma cópia é uma coluna
-- que pode discordar.
--
-- `add column … not null default` preenche as linhas existentes com a WeeFly,
-- que é o backfill que o TEN-01 pede.

alter table public.leads
  add column if not exists partner_id uuid not null
    default public.default_partner_id() references public.partners (id);

alter table public.trip_requests
  add column if not exists partner_id uuid not null
    default public.default_partner_id() references public.partners (id);

alter table public.chat_conversations
  add column if not exists partner_id uuid not null
    default public.default_partner_id() references public.partners (id);

alter table public.booking_cases
  add column if not exists partner_id uuid not null
    default public.default_partner_id() references public.partners (id);

alter table public.booking_cases
  add column if not exists organisation_id uuid;

-- A chave composta garante que o ministério é do parceiro do caso. Com
-- `organisation_id` nulo (retalho), a chave não é verificada — MATCH SIMPLE.
alter table public.booking_cases
  drop constraint if exists booking_cases_organisation_fk;
alter table public.booking_cases
  add constraint booking_cases_organisation_fk
    foreign key (organisation_id, partner_id)
    references public.organisations (id, partner_id)
    on delete restrict;

create index if not exists leads_partner_idx          on public.leads (partner_id);
create index if not exists trip_requests_partner_idx  on public.trip_requests (partner_id);
create index if not exists chat_conversations_partner_idx on public.chat_conversations (partner_id);
create index if not exists booking_cases_partner_idx
  on public.booking_cases (partner_id, created_at desc);
create index if not exists booking_cases_organisation_idx
  on public.booking_cases (organisation_id) where organisation_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 6 · Quem pode ver o quê
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Todas SECURITY DEFINER, pela mesma razão de `is_platform_staff`: são
-- chamadas pelas políticas das tabelas que leem, e uma leitura normal entraria
-- em recursão. `search_path` fixo para não poderem ser desviadas.

-- O parceiro da sessão. Nulo quando não há sessão, quando a conta está
-- desactivada, ou quando o parceiro está suspenso — e nulo não vê nada.
create or replace function public.current_partner_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  -- A allowlist manda: é ela a porta do back-office. `platform_staff` só
  -- responde por quem não tem linha nenhuma na allowlist — uma linha
  -- desactivada é uma resposta ("não"), não uma ausência, e não pode cair
  -- para a outra tabela e voltar a abrir a porta.
  with me as (
    select a.partner_id, a.active
      from public.bo_allowlist a
      join auth.users u on lower(u.email) = lower(a.email)
     where u.id = auth.uid()
  )
  select p.id
    from public.partners p
   where p.status = 'active'
     and p.id = case
       when exists (select 1 from me)
         then (select partner_id from me where active)
       else (select s.partner_id
               from public.platform_staff s
              where s.user_id = auth.uid())
     end;
$$;

create or replace function public.is_cross_partner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.bo_allowlist a
      join auth.users u on lower(u.email) = lower(a.email)
     where u.id = auth.uid()
       and a.active
       and a.cross_partner
  );
$$;

create or replace function public.can_see_partner(p_partner uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_cross_partner()
      or (p_partner is not null and p_partner = public.current_partner_id());
$$;

create or replace function public.can_see_case(p_case uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.booking_cases c
     where c.id = p_case and public.can_see_partner(c.partner_id)
  );
$$;

create or replace function public.can_see_trip_request(p_trip uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trip_requests t
     where t.id = p_trip and public.can_see_partner(t.partner_id)
  );
$$;

create or replace function public.can_see_proposal(p_proposal uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.case_proposals p
     where p.id = p_proposal and public.can_see_case(p.case_id)
  );
$$;

create or replace function public.can_see_offer(p_offer uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.case_offers o
     where o.id = p_offer and public.can_see_proposal(o.proposal_id)
  );
$$;

create or replace function public.can_see_segment(p_segment uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.case_offer_segments s
     where s.id = p_segment and public.can_see_offer(s.offer_id)
  );
$$;

create or replace function public.can_see_conversation(p_conversation uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.chat_conversations c
     where c.id = p_conversation and public.can_see_partner(c.partner_id)
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 7 · As políticas restritivas (TEN-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Uma por tabela, `for all`, com `using` e `with check` iguais: não se lê, não
-- se escreve e não se move uma linha para um parceiro que não se pode ver.
-- O Realtime do back-office respeita-as também, porque lê como o utilizador.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- tabela                        condição
      ('booking_cases',              '(select public.is_cross_partner()) or partner_id = (select public.current_partner_id())'),
      ('leads',                      '(select public.is_cross_partner()) or partner_id = (select public.current_partner_id())'),
      ('trip_requests',              '(select public.is_cross_partner()) or partner_id = (select public.current_partner_id())'),
      ('chat_conversations',         '(select public.is_cross_partner()) or partner_id = (select public.current_partner_id())'),
      ('trip_request_notes',         'public.can_see_trip_request(trip_request_id)'),
      ('trip_request_legs',          'public.can_see_trip_request(trip_request_id)'),
      ('case_links',                 'public.can_see_case(case_id)'),
      ('case_passengers',            'public.can_see_case(case_id)'),
      ('case_payments',              'public.can_see_case(case_id)'),
      ('case_proposals',             'public.can_see_case(case_id)'),
      ('case_payment_proofs',        'public.can_see_case(case_id)'),
      ('case_events',                'public.can_see_case(case_id)'),
      ('case_notifications',         'public.can_see_case(case_id)'),
      ('case_passenger_seats',       'public.can_see_case(case_id)'),
      ('case_ticket_documents',      'public.can_see_case(case_id)'),
      ('case_token_history',         'public.can_see_case(case_id)'),
      ('case_segment_issuance',      'public.can_see_case(case_id)'),
      ('case_passenger_baggage',     'public.can_see_case(case_id)'),
      ('case_offers',                'public.can_see_proposal(proposal_id)'),
      ('case_offer_segments',        'public.can_see_offer(offer_id)'),
      ('case_offer_segment_baggage', 'public.can_see_segment(segment_id)'),
      ('chat_messages',              'public.can_see_conversation(conversation_id)'),
      ('bo_allowlist',               '(select public.is_cross_partner()) or partner_id = (select public.current_partner_id())'),
      ('platform_staff',             'public.can_see_partner(partner_id)')
    ) as t(tbl, cond)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('drop policy if exists tenant_isolation on public.%I', r.tbl);
    execute format(
      'create policy tenant_isolation on public.%I as restrictive for all '
      'to authenticated using (%s) with check (%s)',
      r.tbl, r.cond, r.cond);

    -- A porta, igual em todas as tabelas: estar na allowlist. Hoje umas
    -- tabelas pedem `platform_staff` e outras `is_bo_allowed`, e é por isso
    -- que a fila lê pela service role — com o cliente da sessão, uma conta que
    -- só estivesse numa das listas via embeds vazios, sem erro (ver a nota da
    -- 0011). Não alarga nada: estas contas já veem tudo pela service role. O
    -- que passa a limitar é a política restritiva acima.
    --
    -- As contas não se escrevem por aqui: gerir utilizadores é o ADM-02, que
    -- fica para depois, e até lá é a service role que o faz.
    execute format('drop policy if exists bo_access on public.%I', r.tbl);
    if r.tbl in ('bo_allowlist', 'platform_staff') then
      execute format(
        'create policy bo_access on public.%I for select '
        'to authenticated using ((select public.is_bo_allowed()))', r.tbl);
    else
      execute format(
        'create policy bo_access on public.%I for all to authenticated '
        'using ((select public.is_bo_allowed())) '
        'with check ((select public.is_bo_allowed()))', r.tbl);
    end if;
  end loop;
end $$;

-- ── As tabelas novas: aqui as políticas são permissivas, porque não há outras

alter table public.partners        enable row level security;
alter table public.organisations   enable row level security;
alter table public.products        enable row level security;
alter table public.product_sellers enable row level security;

drop policy if exists partners_read on public.partners;
create policy partners_read on public.partners
  for select to authenticated using (public.can_see_partner(id));

-- ADM-01 · só um Admin WeeFly cria, edita ou suspende um parceiro.
drop policy if exists partners_admin_write on public.partners;
create policy partners_admin_write on public.partners
  for all to authenticated
  using (public.is_cross_partner()) with check (public.is_cross_partner());

-- PAR-02 · o parceiro gere os seus ministérios sem a WeeFly.
drop policy if exists organisations_partner on public.organisations;
create policy organisations_partner on public.organisations
  for all to authenticated
  using (public.can_see_partner(partner_id))
  with check (public.can_see_partner(partner_id));

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select to authenticated
  using (
    public.can_see_partner(supplier_partner_id)
    or exists (
      select 1 from public.product_sellers ps
       where ps.product_id = products.id
         and public.can_see_partner(ps.seller_partner_id)
    )
  );

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all to authenticated
  using (public.is_cross_partner()) with check (public.is_cross_partner());

drop policy if exists product_sellers_read on public.product_sellers;
create policy product_sellers_read on public.product_sellers
  for select to authenticated
  using (public.can_see_partner(seller_partner_id));

drop policy if exists product_sellers_admin_write on public.product_sellers;
create policy product_sellers_admin_write on public.product_sellers
  for all to authenticated
  using (public.is_cross_partner()) with check (public.is_cross_partner());

commit;

notify pgrst, 'reload schema';
