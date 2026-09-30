-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · MVP 2 — B2G: ministérios, bolsa, pagamento externo, alertas
-- (PAR-02, PAR-03, PAR-04, PAR-05, PAR-07, ADM-06, ADM-08)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PAR-03 · "É assim que o dinheiro público funciona em Cabo Verde." O
-- ministério deposita (bolsa) ou emite uma carta conforto; o montante fica
-- registado e **cada emissão validada desconta dele**. Não há passo de
-- aprovação: a autorização da despesa é o próprio financiamento.
--
-- ── O saldo não é uma coluna ───────────────────────────────────────────────
--
-- É a soma dos movimentos. Uma coluna de saldo é uma segunda resposta que pode
-- discordar dos movimentos; a soma não. Os movimentos só se acrescentam: um
-- erro corrige-se com outro movimento, com motivo, e o histórico fica.
--
-- ── Onde desconta ──────────────────────────────────────────────────────────
--
-- Na confirmação do pagamento externo (PAR-07: "confirmar liberta a emissão e
-- desconta da bolsa"). É o gesto que diz "este dinheiro está comprometido com
-- esta passagem", e é o único que liberta a emissão — por isso o PAR-03
-- ("a emissão desconta no momento da emissão") e o PAR-07 descrevem o mesmo
-- instante. `budget_debit` bloqueia a linha do ministério, soma, e recusa se o
-- saldo não cobrir: dois agentes a confirmar ao mesmo tempo não passam os dois.
--
-- ── Decisões em aberto, sem valores inventados ─────────────────────────────
--
--   O2 · a secretária vê o saldo? `organisations.secretary_sees_balance`, por
--        omissão desligado.
--   D9 · o viajante que não voa: até haver resposta, crédito manual com motivo
--        (`kind = 'credit'`, `reason` obrigatório). Nada automático.
--   O1 · quem recebe os alertas: `alert_recipients` fica vazio até alguém o
--        preencher no ecrã do ADM-06.
--
-- Depende da 0020 e da 0026. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0028_mvp2_b2g.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · O ministério (PAR-02)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.organisations
  -- O link único da aplicação do ministério (MIN-01). Regenera-se; o antigo
  -- deixa de funcionar de imediato (PAR-04).
  add column if not exists link_token          text,
  add column if not exists link_rotated_at     timestamptz,
  add column if not exists currency            char(3) not null default 'CVE',
  -- PAR-05 · o limite, em valor ou em percentagem do último reforço. Os dois
  -- podem estar vazios: sem limite, não há alerta.
  add column if not exists alert_threshold_amount  bigint check (alert_threshold_amount is null or alert_threshold_amount >= 0),
  add column if not exists alert_threshold_percent numeric(5, 2) check (alert_threshold_percent is null or (alert_threshold_percent >= 0 and alert_threshold_percent <= 100)),
  -- O2 · por omissão, só a Alô e a WeeFly veem o saldo.
  add column if not exists secretary_sees_balance boolean not null default false,
  add column if not exists created_by_email    text;

create unique index if not exists organisations_link_token_key
  on public.organisations (link_token) where link_token is not null;

-- Quem gere ministérios: os administradores (do parceiro, ou a WeeFly). Um
-- agente do parceiro vê-os, e não os muda — "não mexe em bolsas nem em
-- utilizadores" (ADM-02). A 0020 deixava escrever a quem via o parceiro.
create or replace function public.can_manage_partner(p_partner uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.can_see_partner(p_partner)
     and exists (select 1 from public.access_roles r
                  where r.id = public.current_access_role()
                    and r.manage_users <> 'none');
$$;

drop policy if exists organisations_partner on public.organisations;
drop policy if exists organisations_read on public.organisations;
create policy organisations_read on public.organisations
  for select to authenticated
  using (public.can_see_partner(partner_id));

drop policy if exists organisations_manage on public.organisations;
create policy organisations_manage on public.organisations
  for all to authenticated
  using (public.can_manage_partner(partner_id))
  with check (public.can_manage_partner(partner_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · A bolsa (PAR-03)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.budget_movements (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null,
  partner_id       uuid not null,
  -- credit  · o ministério reforçou (bolsa ou carta conforto)
  -- debit   · uma passagem foi paga contra a bolsa (PAR-07)
  -- reversal· um débito anulado (PAR-07, reverter)
  -- adjustment · correcção explícita do Admin WeeFly (ADM-08), com motivo
  kind             text not null check (kind in ('credit', 'debit', 'reversal', 'adjustment')),
  -- Com sinal: positivo entra, negativo sai. O saldo é a soma.
  delta            bigint not null check (delta <> 0),
  currency         char(3) not null default 'CVE',
  case_id          uuid references public.booking_cases (id) on delete restrict,
  -- O débito que um estorno anula.
  reverses_id      uuid references public.budget_movements (id) on delete restrict,
  -- A referência do documento: a carta conforto, o comprovativo do depósito.
  document_ref     text,
  reason           text,
  created_by       uuid references auth.users (id) on delete set null,
  created_by_email text not null,
  created_at       timestamptz not null default now(),

  foreign key (organisation_id, partner_id)
    references public.organisations (id, partner_id) on delete restrict,

  constraint budget_movements_sign check (
    (kind = 'credit' and delta > 0) or
    (kind = 'debit' and delta < 0) or
    (kind = 'reversal' and delta > 0) or
    kind = 'adjustment'
  ),
  constraint budget_movements_debit_has_case check (kind not in ('debit', 'reversal') or case_id is not null),
  constraint budget_movements_reversal_links check (kind <> 'reversal' or reverses_id is not null),
  constraint budget_movements_adjustment_reason check (
    kind <> 'adjustment' or length(trim(coalesce(reason, ''))) >= 3
  )
);

create index if not exists budget_movements_org_idx on public.budget_movements (organisation_id, created_at desc);
create index if not exists budget_movements_case_idx on public.budget_movements (case_id) where case_id is not null;
-- Um débito só se estorna uma vez.
create unique index if not exists budget_movements_one_reversal
  on public.budget_movements (reverses_id) where reverses_id is not null;

create or replace function public.budget_movements_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'os movimentos da bolsa só se acrescentam' using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists budget_movements_no_update on public.budget_movements;
create trigger budget_movements_no_update
  before update or delete on public.budget_movements
  for each row execute function public.budget_movements_immutable();

create or replace function public.organisation_balance(p_org uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::bigint from public.budget_movements where organisation_id = p_org;
$$;

-- Security definer para somar sem depender do RLS; por isso fechada a quem
-- não é a service role — senão dava o saldo de qualquer ministério a qualquer
-- sessão.
revoke all on function public.organisation_balance(uuid) from public, anon, authenticated;
grant execute on function public.organisation_balance(uuid) to service_role;

/*
 * Descontar da bolsa, ou recusar. Bloqueia a linha do ministério para que dois
 * débitos simultâneos não passem os dois com o mesmo saldo.
 *
 * Chamada pela service role, depois de o servidor verificar quem pede e que o
 * caso é deste ministério.
 */
create or replace function public.budget_debit(
  p_org uuid,
  p_case uuid,
  p_amount bigint,
  p_actor uuid,
  p_actor_email text,
  p_ref text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid;
  v_currency char(3);
  v_balance bigint;
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'valor inválido' using errcode = 'check_violation';
  end if;

  select partner_id, currency into v_partner, v_currency
    from public.organisations where id = p_org for update;
  if not found then
    raise exception 'ministério desconhecido' using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from public.booking_cases
     where id = p_case and organisation_id = p_org and partner_id = v_partner
  ) then
    raise exception 'o caso não é deste ministério' using errcode = 'check_violation';
  end if;

  v_balance := public.organisation_balance(p_org);
  if v_balance < p_amount then
    raise exception 'saldo insuficiente: % disponível, % pedido', v_balance, p_amount
      using errcode = 'P0001', hint = 'insufficient_funds';
  end if;

  insert into public.budget_movements
    (organisation_id, partner_id, kind, delta, currency, case_id, document_ref, created_by, created_by_email)
  values
    (p_org, v_partner, 'debit', -p_amount, v_currency, p_case, p_ref, p_actor, p_actor_email)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.budget_debit(uuid, uuid, bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.budget_debit(uuid, uuid, bigint, uuid, text, text) to service_role;

alter table public.budget_movements enable row level security;

drop policy if exists budget_movements_read on public.budget_movements;
create policy budget_movements_read on public.budget_movements
  for select to authenticated
  using (public.can_see_partner(partner_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · O pagamento externo (PAR-07)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O ministério paga à Alô fora da plataforma. A plataforma regista, liberta a
-- emissão e desconta da bolsa. Um administrador do parceiro pode reverter: o
-- saldo é reposto e a reversão fica registada.

create table if not exists public.case_external_payments (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references public.booking_cases (id) on delete restrict,
  amount            bigint not null check (amount > 0),
  currency          char(3) not null default 'CVE',
  paid_on           date not null,
  method            text not null check (method in ('transfer', 'deposit', 'cheque', 'comfort_letter', 'other')),
  reference         text,
  -- O documento de suporte é opcional: a bolsa é o verdadeiro controlo.
  document_path     text,
  budget_movement_id uuid references public.budget_movements (id) on delete restrict,
  confirmed_by      uuid references auth.users (id) on delete set null,
  confirmed_by_email text not null,
  confirmed_at      timestamptz not null default now(),
  reversed_at       timestamptz,
  reversed_by_email text,
  reversal_reason   text,
  reversal_movement_id uuid references public.budget_movements (id) on delete restrict,
  constraint case_external_payments_reversal_reason check (
    reversed_at is null or length(trim(coalesce(reversal_reason, ''))) >= 3
  )
);

-- Um pagamento externo vivo por caso.
create unique index if not exists case_external_payments_one_live
  on public.case_external_payments (case_id) where reversed_at is null;

alter table public.case_external_payments enable row level security;

drop policy if exists case_external_payments_read on public.case_external_payments;
create policy case_external_payments_read on public.case_external_payments
  for select to authenticated
  using (public.can_see_case(case_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 · Alertas de saldo (PAR-05, ADM-06)
-- ═══════════════════════════════════════════════════════════════════════════

-- ADM-06 · quem recebe. Por parceiro, e opcionalmente só para um ministério.
-- `side` diz se é do parceiro ou da WeeFly, para o ecrã os separar.
create table if not exists public.alert_recipients (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partners (id) on delete restrict,
  organisation_id uuid references public.organisations (id) on delete cascade,
  side            text not null check (side in ('partner', 'weefly')),
  name            text,
  email           text,
  whatsapp        text,
  active          boolean not null default true,
  created_by_email text not null,
  created_at      timestamptz not null default now(),
  constraint alert_recipients_has_channel check (email is not null or whatsapp is not null)
);

create index if not exists alert_recipients_partner_idx on public.alert_recipients (partner_id);

alter table public.alert_recipients enable row level security;

drop policy if exists alert_recipients_read on public.alert_recipients;
create policy alert_recipients_read on public.alert_recipients
  for select to authenticated
  using (public.can_see_partner(partner_id));

-- PAR-05 · os alertas enviados, registados no ministério. Um por dia, no
-- máximo: o índice único é o que o garante, e é o que faz um segundo envio no
-- mesmo dia não sair (a mesma regra do T-22).
create table if not exists public.budget_alerts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  partner_id      uuid not null references public.partners (id) on delete restrict,
  alert_day       date not null,
  balance         bigint not null,
  threshold       bigint not null,
  recipients      jsonb not null default '[]'::jsonb,
  email_sent      integer not null default 0,
  whatsapp_sent   integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (organisation_id, alert_day)
);

create index if not exists budget_alerts_org_idx on public.budget_alerts (organisation_id, created_at desc);

alter table public.budget_alerts enable row level security;

drop policy if exists budget_alerts_read on public.budget_alerts;
create policy budget_alerts_read on public.budget_alerts
  for select to authenticated
  using (public.can_see_partner(partner_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 · O registo das intervenções do Admin (ADM-04, ADM-08)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Só leitura por defeito. Intervir exige uma ação explícita, que fica
-- registada com quem, quando e porquê." As intervenções entram no mesmo
-- registo dos acessos.

alter table public.access_audit drop constraint if exists access_audit_action_check;
alter table public.access_audit add constraint access_audit_action_check check (action in (
  'user_created', 'user_updated', 'user_suspended', 'user_reactivated',
  'partner_created', 'partner_updated', 'partner_suspended', 'partner_reactivated',
  'organisation_created', 'organisation_updated', 'organisation_link_rotated',
  'budget_adjusted', 'admin_intervention'));

commit;

notify pgrst, 'reload schema';
