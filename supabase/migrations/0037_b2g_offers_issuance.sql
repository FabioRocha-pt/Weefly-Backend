-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · B2G v2 — das ofertas à emissão
-- (B2G-15, B2G-16, B2G-25, B2G-17, B2G-18 · D-2, D-3, D-7, D-11 · decisões 1, 3, 7)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B2G-15 · D-2 · "Quando é o master, o botão é Enviar à empresa para revisão.
--   A empresa vê, pode alterar, e envia." A proposta ganha um terceiro estado,
--   `revisao_parceiro`, entre o rascunho e a publicada:
--     · `request_proposal_review(p_case)` (SECURITY DEFINER, pela sessão): só
--       uma conta `cross_partner` (o master) num caso de **outra** empresa
--       (a empresa do caso não é a da sessão) e só no canal `ministerio`. Passa
--       de `rascunho` a `revisao_parceiro`, carimba quem e quando, e escreve
--       `proposal_review_requested` no `case_events` e no `access_audit`.
--     · o gatilho `case_proposals_review_guard` repete as regras em qualquer
--       `update` feito por uma sessão: o master não publica directamente uma
--       proposta de ministério de outra empresa (vai à revisão); uma proposta
--       em revisão só é publicada pela empresa do caso, e fica carimbado quem a
--       reviu e quando. A service role (o servidor) não é parada aqui.
--     · a secretária e o cliente nunca veem `rascunho` nem `revisao_parceiro`:
--       não têm sessão no back-office (o RLS não lhes mostra nada) e o servidor
--       só lê a proposta `publicada` (`getPublishedProposal`).
--   Genérico (B2G-26): "a empresa do caso não é a da sessão e a sessão é o
--   master" — nunca "a empresa é a Alô".
--
-- B2G-17 · decisão 1 · "Sem pagamento na plataforma." `booking_cases.
--   ready_to_issue_at`: o caso de ministério fica pronto a emitir quando a
--   secretária grava os passageiros completos. A emissão aceita-o sem
--   pagamento confirmado (a regra de quem emite — D-3, só o operador — está
--   no servidor, `boIssueTickets`).
--
-- B2G-16 · D-7 · o pedido do ministério guarda só N pessoas (como adultos); o
--   tipo de cada uma sai da data de nascimento quando os passageiros são
--   gravados, e o pedido passa a ter a mistura real. Um pedido só de crianças
--   (ou com mais de 9 crianças) deixa de ser recusado; continua a ter de ter
--   pelo menos uma pessoa.
--
-- B2G-25 · D-11 · a secretária corrige as fichas na área Passageiros:
--   `ministry_travellers.last_source` aceita `secretary` (o histórico da 0035
--   já grava a secretária).
--
-- Depende da 0005, 0020, 0026, 0030, 0032, 0034, 0035 e 0036. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0037_b2g_offers_issuance.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── B2G-15 · a revisão da empresa ───────────────────────────────────────────

alter table public.case_proposals
  drop constraint if exists case_proposals_status_check;
alter table public.case_proposals
  add constraint case_proposals_status_check
  check (status in ('rascunho', 'revisao_parceiro', 'publicada'));

alter table public.case_proposals
  add column if not exists review_requested_by_email text,
  add column if not exists review_requested_at       timestamptz,
  add column if not exists reviewed_by_email         text,
  add column if not exists reviewed_at               timestamptz;

comment on column public.case_proposals.review_requested_by_email is
  'B2G-15 · D-2 · o master que preparou as ofertas e as enviou à empresa do caso para revisão.';
comment on column public.case_proposals.reviewed_by_email is
  'B2G-15 · D-2 · quem, na empresa do caso, reviu e publicou (enviou à secretária).';

-- O email da sessão (nulo sem sessão: a service role).
create or replace function public.session_email()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid();
$$;

revoke execute on function public.session_email() from public, anon, authenticated;

create or replace function public.case_proposals_review_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner  uuid;
  v_channel  text;
  v_mine     uuid;
  v_foreign  boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Sem sessão é o servidor (service role) ou uma migração: confia-se.
  if auth.uid() is null then
    return new;
  end if;

  select bc.partner_id, bc.channel into v_partner, v_channel
    from public.booking_cases bc where bc.id = new.case_id;
  v_mine := public.current_partner_id();
  -- O master num caso de outra empresa.
  v_foreign := public.is_cross_partner() and v_partner is distinct from v_mine;

  if new.status = 'revisao_parceiro' then
    if old.status <> 'rascunho' or not v_foreign or v_channel is distinct from 'ministerio' then
      raise exception 'B2G-15 · só o master envia uma proposta de ministério de outra empresa para revisão, e só a partir do rascunho'
        using errcode = 'check_violation';
    end if;
    new.review_requested_by_email := public.session_email();
    new.review_requested_at := now();
    new.reviewed_by_email := null;
    new.reviewed_at := null;
    return new;
  end if;

  if new.status = 'publicada' then
    -- D-2 · num white label, a secretária não recebe nada da WeeFly: quem
    -- envia é a empresa do caso.
    if v_foreign and v_channel = 'ministerio' then
      raise exception 'B2G-15 · D-2 · a proposta preparada pelo master é revista e enviada pela empresa do caso'
        using errcode = 'check_violation';
    end if;
    if old.status = 'revisao_parceiro' then
      if v_partner is distinct from v_mine then
        raise exception 'B2G-15 · só a empresa do caso publica uma proposta em revisão'
          using errcode = 'check_violation';
      end if;
      new.reviewed_by_email := public.session_email();
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end $$;

drop trigger if exists case_proposals_review_guard on public.case_proposals;
create trigger case_proposals_review_guard
  before update of status on public.case_proposals
  for each row execute function public.case_proposals_review_guard();

-- "Enviar à empresa para revisão", pela sessão.
create or replace function public.request_proposal_review(p_case uuid)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  me     record;
  c      record;
  p      record;
  v_now  timestamptz := now();
begin
  select * into me from public.case_actor();
  if me.user_id is null or not public.is_bo_allowed() then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select bc.id, bc.partner_id, bc.channel into c
    from public.booking_cases bc where bc.id = p_case;
  if c.id is null or not public.can_see_case(p_case) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Genérico: o master num caso de outra empresa, no canal ministério.
  if not public.is_cross_partner()
     or c.partner_id is not distinct from public.current_partner_id()
     or c.channel is distinct from 'ministerio' then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  select cp.id, cp.status, cp.revision into p
    from public.case_proposals cp where cp.case_id = p_case;
  if p.id is null then
    return jsonb_build_object('outcome', 'no_proposal');
  end if;
  if p.status = 'revisao_parceiro' then
    return jsonb_build_object('outcome', 'already');
  end if;
  if p.status <> 'rascunho' then
    return jsonb_build_object('outcome', 'not_draft');
  end if;
  if not exists (select 1 from public.case_offers o where o.proposal_id = p.id and o.include_in_proposal) then
    return jsonb_build_object('outcome', 'no_offers');
  end if;

  update public.case_proposals set status = 'revisao_parceiro' where id = p.id and status = 'rascunho';

  insert into public.case_events (case_id, kind, title, detail, actor_id, actor_email, actor_kind, payload)
  values (p_case, 'proposal_review_requested', 'Ofertas enviadas à empresa para revisão',
          me.label || ' · R' || p.revision,
          me.user_id, me.email, 'staff',
          jsonb_build_object('proposalId', p.id, 'revision', p.revision, 'crossPartner', me.cross_partner));

  insert into public.access_audit (actor_user_id, actor_email, action, partner_id, target, before, after, reason)
  values (me.user_id, me.email, 'proposal_review_requested', c.partner_id, p_case::text,
          jsonb_build_object('status', 'rascunho'),
          jsonb_build_object('status', 'revisao_parceiro', 'proposal_id', p.id, 'revision', p.revision,
                             'requested_at', v_now),
          null);

  return jsonb_build_object('outcome', 'requested', 'requested_at', v_now, 'revision', p.revision);
end;
$$;

revoke execute on function public.request_proposal_review(uuid) from public, anon;
grant execute on function public.request_proposal_review(uuid) to authenticated;

-- ── B2G-17 · pronto a emitir ────────────────────────────────────────────────

alter table public.booking_cases
  add column if not exists ready_to_issue_at timestamptz;

comment on column public.booking_cases.ready_to_issue_at is
  'B2G-17 · decisão 1 · caso de ministério com a opção escolhida e os passageiros completos: a emissão não pede pagamento confirmado.';

create index if not exists booking_cases_ready_to_issue_idx
  on public.booking_cases (partner_id, ready_to_issue_at)
  where ready_to_issue_at is not null and pnr is null;

-- ── B2G-16 · D-7 · a mistura real de passageiros ────────────────────────────

alter table public.trip_requests drop constraint if exists trip_requests_adults_check;
alter table public.trip_requests
  add constraint trip_requests_adults_check check (adults between 0 and 50);
alter table public.trip_requests drop constraint if exists trip_requests_children_check;
alter table public.trip_requests
  add constraint trip_requests_children_check check (children between 0 and 50);
alter table public.trip_requests drop constraint if exists trip_requests_infants_check;
alter table public.trip_requests
  add constraint trip_requests_infants_check check (infants between 0 and 50);
alter table public.trip_requests drop constraint if exists trip_requests_pax_total_check;
alter table public.trip_requests
  add constraint trip_requests_pax_total_check
  check (adults + children + infants_in_seat + infants_on_lap between 1 and 50);

-- ── B2G-25 · a secretária corrige a ficha ───────────────────────────────────

alter table public.ministry_travellers drop constraint if exists ministry_travellers_last_source_check;
alter table public.ministry_travellers
  add constraint ministry_travellers_last_source_check
  check (last_source in ('case', 'backoffice', 'import', 'secretary'));

commit;

notify pgrst, 'reload schema';
