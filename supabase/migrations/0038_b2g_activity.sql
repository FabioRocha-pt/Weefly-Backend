-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · B2G v2 — o registo (B2G-19)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "No backoffice da empresa, por ministério: cada pedido, reclamação, oferta,
-- envio, escolha, passageiro registado e emissão, com hora e autor. No Admin,
-- o master vê o mesmo registo para todas as empresas. Filtros por ministério,
-- por secretária e por período. Exportável."
--
-- Três fontes, já escritas pelos blocos anteriores — esta migração não cria
-- nenhuma tabela nova, só a vista que as junta:
--
--   · `case_events`              · o que aconteceu a um pedido de ministério
--     (pedido, reclamação, urgência, revisão, oferta enviada/escolhida,
--     passageiros registados, pronto a emitir, bilhetes). `title` é o texto
--     já pensado para ser seguro de mostrar (nunca `detail` nem `payload`,
--     que podem levar notas internas, custos ou o email de um agente — ver o
--     comentário de `PUBLIC_TIMELINE_KINDS` em `lib/ministry.ts`).
--   · `ministry_traveller_changes` · cada ficha registada ou alterada, e por
--     quem (a secretária ou o backoffice).
--   · `access_audit`             · a vida do ministério e das secretárias que
--     não é de um caso: criar/editar o ministério, a bolsa ajustada, criar
--     secretária, gerar/bloquear PIN, (des)activar, pedir/aprovar/recusar um
--     ministério. **Não** inclui `case_claimed`, `case_released`,
--     `urgency_changed` nem `proposal_review_requested`: esses já estão no
--     `case_events` (a mesma acção escreve as duas tabelas na mesma
--     transacção, com o `case_id` certo) — repeti-los aqui duplicava a linha
--     no registo.
--
-- `security_invoker = true`: a vista não é dona dos dados, é só o SELECT.
-- Quem vê o quê continua a ser o RLS de cada tabela de base — quase nenhuma
-- política nova aqui:
--   · `case_events`                · `can_see_case(case_id)` (0020), já atrás
--     de `is_bo_allowed()` (0026: só um perfil com `backoffice`).
--   · `ministry_traveller_changes`  · `can_see_partner(partner_id)` (0030), sem
--     `is_bo_allowed()` — a 0030 não o exigia porque nenhuma conta chegava lá
--     sem ser `backoffice` (a app já o garantia). Esta migração acrescenta a
--     mesma restrição a `ministry_travellers`/`ministry_traveller_changes`,
--     por baixo: defesa a mais não dói, e fecha de vez uma conta `secretary`
--     na allowlist (hoje só histórico — o bloco 3 já as migrou para
--     `ministry_secretaries` com PIN) que viesse a ter sessão Supabase.
--   · `access_audit`                · o master vê tudo; o parceiro só com um
--     perfil que gere utilizadores (`manage_users <> 'none'`, 0026) — a mesma
--     regra que já valia para ver o registo de acessos directamente. Um
--     agente sem esse perfil continua a ver os pedidos e os passageiros
--     (as outras duas fontes), só não a parte de secretárias/ministério.
--   · a secretária não tem sessão Supabase (o PIN é outro mecanismo, 0034):
--     nunca lê esta vista pela sessão.
--
-- O `target` do `access_audit` não é sempre o mesmo tipo de coisa (o id do
-- pedido de ministério, o id da secretária, ou o slug do ministério — ver
-- `src/actions/secretaries.ts`, `src/actions/ministry-requests.ts` e
-- `src/actions/b2g.ts`); cada ramo junta-se à tabela certa para chegar ao
-- `organisation_id`. Nota: se o slug do ministério mudar depois de uma
-- `organisation_created`/`organisation_updated`/`budget_adjusted` antiga, essa
-- linha pode deixar de se juntar — aceitável (o slug quase nunca muda, e o
-- nome fica no resto da linha).
--
-- Depende da 0009, 0020, 0026, 0030, 0032, 0034, 0035. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0038_b2g_activity.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── Defesa a mais: `ministry_travellers`/`_changes` também só a backoffice ──

drop policy if exists ministry_travellers_bo_access on public.ministry_travellers;
create policy ministry_travellers_bo_access on public.ministry_travellers
  as restrictive for all
  to authenticated
  using ((select public.is_bo_allowed()))
  with check ((select public.is_bo_allowed()));

drop policy if exists ministry_traveller_changes_bo_access on public.ministry_traveller_changes;
create policy ministry_traveller_changes_bo_access on public.ministry_traveller_changes
  as restrictive for select
  to authenticated
  using ((select public.is_bo_allowed()));

drop view if exists public.b2g_activity;

create view public.b2g_activity
with (security_invoker = true)
as
-- ── Os pedidos: o que aconteceu a um caso de ministério ─────────────────────
select
  'case_event'::text                                                   as source,
  ce.id                                                                 as id,
  ce.created_at                                                        as at,
  bc.partner_id                                                        as partner_id,
  bc.organisation_id                                                   as organisation_id,
  bc.id                                                                 as case_id,
  tr.reference                                                         as case_reference,
  ce.actor_secretary_id                                                as secretary_id,
  ce.actor_kind                                                        as actor_kind,
  coalesce(sec.name, ce.actor_email,
           case when ce.actor_kind = 'system' then 'Sistema' end)      as author,
  ce.kind                                                              as action,
  ce.title                                                             as description
  from public.case_events ce
  join public.booking_cases bc on bc.id = ce.case_id
  left join public.trip_requests tr on tr.id = bc.trip_request_id
  left join public.ministry_secretaries sec on sec.id = ce.actor_secretary_id
 where bc.organisation_id is not null

union all

-- ── As fichas: registadas ou alteradas, por quem ────────────────────────────
select
  'traveller_change'::text                                            as source,
  tc.id                                                                as id,
  tc.created_at                                                       as at,
  tc.partner_id                                                       as partner_id,
  tc.organisation_id                                                  as organisation_id,
  tc.case_id                                                          as case_id,
  tr.reference                                                        as case_reference,
  tc.changed_by_secretary_id                                          as secretary_id,
  case when tc.changed_by_secretary_id is not null then 'secretary' else 'staff' end as actor_kind,
  coalesce(sec.name, tc.changed_by_email, 'Sistema')                  as author,
  case when tc.before is null then 'traveller_registered' else 'traveller_changed' end as action,
  (case when tc.before is null then 'Passageiro registado: ' else 'Passageiro alterado: ' end)
    || coalesce(nullif(btrim(coalesce(tc.after ->> 'first_name', '') || ' ' || coalesce(tc.after ->> 'last_name', '')), ''), '—')
  as description
  from public.ministry_traveller_changes tc
  left join public.booking_cases bc on bc.id = tc.case_id
  left join public.trip_requests tr on tr.id = bc.trip_request_id
  left join public.ministry_secretaries sec on sec.id = tc.changed_by_secretary_id

union all

-- ── O ministério e as secretárias: criar, editar, PIN, pedidos ──────────────
select
  'access_audit'::text                                                as source,
  aa.id                                                                as id,
  aa.created_at                                                       as at,
  aa.partner_id                                                       as partner_id,
  coalesce(oreq.organisation_id, oslug.id, sec.organisation_id)       as organisation_id,
  null::uuid                                                          as case_id,
  null::text                                                          as case_reference,
  sec.id                                                               as secretary_id,
  case when aa.actor_user_id is not null then 'staff' else 'system' end as actor_kind,
  coalesce(sec.name, aa.actor_email, 'Sistema')                       as author,
  aa.action                                                           as action,
  case aa.action
    when 'organisation_created'        then 'Ministério criado'
    when 'organisation_updated'        then 'Ministério actualizado'
    when 'organisation_link_rotated'   then 'Link do ministério renovado'
    when 'budget_adjusted'             then 'Bolsa ajustada' || coalesce(' · ' || nullif(aa.reason, ''), '')
    when 'secretary_created'           then 'Secretária criada: '          || coalesce(sec.name, '—')
    when 'secretary_updated'           then 'Secretária actualizada: '     || coalesce(sec.name, '—')
    when 'secretary_pin_generated'     then 'PIN gerado: '                 || coalesce(sec.name, '—')
    when 'secretary_pin_locked'        then 'PIN bloqueado (5 tentativas): ' || coalesce(sec.name, '—')
    when 'secretary_deactivated'       then 'Secretária desactivada: '     || coalesce(sec.name, '—')
    when 'secretary_reactivated'       then 'Secretária reactivada: '      || coalesce(sec.name, '—')
    when 'ministry_requested'          then 'Ministério pedido: '              || coalesce(aa.after ->> 'name', '—')
    when 'ministry_request_approved'   then 'Pedido de ministério aprovado: '  || coalesce(aa.after ->> 'name', '—')
    when 'ministry_request_rejected'   then 'Pedido de ministério recusado: ' || coalesce(aa.after ->> 'name', '—')
                                             || coalesce(' · ' || nullif(aa.reason, ''), '')
    else aa.action
  end                                                                  as description
  from public.access_audit aa
  left join public.organisation_requests oreq
    on aa.action in ('ministry_requested', 'ministry_request_approved', 'ministry_request_rejected')
   and oreq.id = (case when aa.target ~ '^[0-9a-fA-F-]{36}$' then aa.target::uuid end)
  left join public.organisations oslug
    on aa.action in ('organisation_created', 'organisation_updated', 'organisation_link_rotated', 'budget_adjusted')
   and oslug.partner_id = aa.partner_id
   and oslug.slug = aa.target
  left join public.ministry_secretaries sec
    on aa.action in ('secretary_created', 'secretary_updated', 'secretary_pin_generated', 'secretary_pin_locked',
                      'secretary_deactivated', 'secretary_reactivated')
   and sec.id = (case when aa.target ~ '^[0-9a-fA-F-]{36}$' then aa.target::uuid end)
 where aa.action in (
   'organisation_created', 'organisation_updated', 'organisation_link_rotated', 'budget_adjusted',
   'secretary_created', 'secretary_updated', 'secretary_pin_generated', 'secretary_pin_locked',
   'secretary_deactivated', 'secretary_reactivated',
   'ministry_requested', 'ministry_request_approved', 'ministry_request_rejected'
 );

comment on view public.b2g_activity is
  'B2G-19 · o registo do ministério (pedidos, fichas e secretárias), por RLS das tabelas de base.';

commit;

notify pgrst, 'reload schema';
