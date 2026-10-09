# B2G v2 · Implementation plan (working file for implementation agents)

Spec: `docs/b2g-v2/WeeFly_B2G_Ministerios_v2.md` (26 reqs). Tests/personas: `WeeFly_Teste_por_Persona_B2G.md`, `PREPARAR_TESTES.md`, `weefly_test_fixtures.json`.
Ministry logos: `public/brand/ministerios/ministerio_{saude,educacao,financas}_{horizontal,brasao}.png`. Alô brand: `public/brand/alo/`.

## Ground rules for every agent
- Work on branch `main` in the repo. Commit your block when green (message in Portuguese, project style: starts with `-`, plus the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer). **Do not push. Do not touch production (no SUPABASE_DB_URL use, no ssh).**
- Migrations: next numbers 0032+ (check what exists first), idempotent (`if not exists`, `create or replace`, `drop policy if exists`), because `run.sh` re-runs the last one. Every new table: RLS enabled; writes go through server actions with the service role after a scope check.
- DB tests: `bash supabase/tests/run.sh` (Docker Postgres; Docker Desktop is running). New test files in `begin … rollback`, unique slugs (never `alo`, `weefly` – those are seeded by migrations).
- Also must pass: `npm run build`, `npm run i18n:check` (keep PT/EN/FR dictionaries in sync), and update `scripts/check-migrations.mjs` probes for new tables/columns if that script exists.
- Never break the public B2C channel (B2G-04 regression). Never hardcode `alo`; everything per partner (B2G-26).
- Match the code style around you (Portuguese comments, same idioms).
- Append a short section to `docs/b2g-v2/PROGRESSO.md` at the end of your block: what was done per requirement, what is left, anything a human must decide.

## Decisions taken for tonight (by Claude, to be confirmed by Fábio/Ivandro in the morning)
1. **Issuance without wallet (D-8):** ministry cases (`channel='ministerio'`) become issuable when passengers are complete (`ready_to_issue_at`); external payment confirmation and `budget_debit` are optional for them (if the org has a balance flow, keep it working but don't require it). No payment screen for the secretary.
2. **Master vs ADM-04:** accounts with `weefly_admin` (cross_partner) may claim and handle any partner's case directly (D-12); the claim itself is logged (case_events + access_audit) as the intervention record. ADM-04 interventions keep working for read-only access.
3. **D-3:** only operator (WeeFly) accounts issue **ministry** cases. Público/VIP issuance unchanged.
4. PIN: system-generated 6 digits (crypto.randomInt), shown once to the creator, hashed (scrypt) at rest; regeneration bumps `pin_version` and kills sessions. 5 wrong → locked 15 min. Session: httpOnly SameSite=Strict cookie, 30 min idle, 12 h absolute.
5. "Agente da Alô" = `partner_agent`; may create secretaries, VIPs and ministry requests. PIN regeneration: creator, partner admin, or WeeFly.
6. Do **not** rename the operator partner to "WeeFly Global" in data (customer-facing name). Master "without company": hide the company name/logo in the shell for cross_partner accounts. WeeFly Moçambique (`mz`) is created by the data seed script, not a migration.
7. D-7: request stores only N people (as adults); real pax mix derived from date of birth when passengers are saved, and logged.
8. Notifications on B2G events go to all active secretaries of the ministry (D-4).
9. Partners cannot create or rename ministries (D-10); they can edit thresholds only. Master creates via approving a request (or directly in Admin).
10. VIP `level`: free text.
11. Channels: `partners.channels` values `B2C` (=Público), `VIP`, `B2G` (=Ministérios). `booking_cases.channel` in (`publico`,`vip`,`ministerio`).

## Gap analysis (from the code survey, 2026-10-09)

Prereqs: OCT-01..04 done in code. TEN-03 done in code (`src/lib/tenancy.ts:66-82`, `src/lib/bo-scope.ts:47-90`, RLS `0020:485-546`). DOM-01 code done; certs cover only pro+alo (ops: add `mz` later). Baseline test failure: `supabase/tests/test_tenancy.sql:29` inserts slug `alo` which `0031` now seeds → change to `alo-ten`.

Data model today:
- `partners` (0020, 0026, 0031): slug, commercial_name, status, is_operator, sell_mode, `channels text[]` check `<@ {B2C,B2G}`, agent_menus (0022), brand fields, powered_by_weefly.
- `organisations` = ministries (0020:153-174, 0028:47-59): partner_id, slug, name, logo_url, active, single `secretary_*` fields, org-level `link_token`, budget fields.
- `bo_allowlist` + `access_roles` (0026): roles weefly_admin, weefly_agent, partner_admin, partner_agent, secretary. Trigger derives cross_partner. `pro_accounts.is_master`.
- RLS helpers: current_partner_id(), is_cross_partner(), can_see_partner/case/proposal/offer/segment/conversation, current_access_role(), is_bo_allowed(), can_manage_access(), can_manage_partner().
- App: reads via session client `getBoScope()`; writes via service role after `caseInScope()`; cross-partner limited to own partner unless ADM-04 `admin_interventions` live (0030:205-225).
- `booking_cases`: token, stage, trip_request_id, lead_id, created_by (owner/claim), claimed_at, claimed_by_email, seller_*, issuance cols, closed_*, partner_id, organisation_id. No channel/urgency/secretary/vip columns.
- `trip_requests`: reference, route, dates, pax counts, special_requests, intake, status, partner_id.
- `case_proposals` (status rascunho/publicada) → `case_offers` → `case_offer_segments` (0005).
- `case_events` (kind, actor_kind client/staff/system, actor_email, payload), `access_audit` (append-only), `case_notifications`, `bo_alert_reads` (bell kinds `src/lib/bo-alerts.ts:65-79`).
- `ministry_travellers` (+ `ministry_traveller_changes`) (0030). Budget tables (0028).
- Secretary today: no session; org-level token in URL is the only credential (`src/lib/ministry.ts:45-102`); intake resolves ministry by token (`src/lib/pc/intake.ts:488-507`).

Per-requirement status: B2G-01 done (cosmetic: shell shows company `src/app/(dashboard)/layout.tsx:49`). B2G-02 partial (only sidebar gated, `sidebar.tsx:212`; admin toggles `partners-admin.tsx:384`, `actions/partners.ts:72`). B2G-20 partial (no mz). B2G-14 missing (queue `bo-queue.ts:333`, pulse `api/bo/pulse/route.ts`, bell `bo-alerts.ts:131` all partner-scoped). B2G-21 partial (only Ministérios menu `sidebar.tsx:104-108`). B2G-03 missing (`components/bo/topbar-actions.tsx:108-187` only public link). B2G-22 missing. B2G-23 missing & contradicted (`actions/b2g.ts:103-176` saveOrganisation, RLS `organisations_manage 0028:86-90`, button `agente/ministerios/page.tsx:31`). B2G-05 partial (no crest column). B2G-06/07 missing (`actions/b2g.ts:212-304`). B2G-08 partial (`components/pc/chrome.tsx:100-102`, `:414`, `components/ministry/tab-bar.tsx`, manifest route). B2G-25 partial (`actions/pc.ts:786-808`, `:609-713`). B2G-09 missing (page renders full RequestWizard `ministerios/[org]/[token]/page.tsx:36-50`). B2G-10 bug risk: intake dedupe `actions/pc.ts:269` and IP limit `:284` apply to ministry. B2G-11 missing (sort `bo-queue.ts:599-604`). B2G-12 partial (per partner only). B2G-13 partial (atomic claim `actions/bo-price-checker.ts:293-388`; claim overwrites seller_* `:346-349` – leaks WeeFly on white-label). B2G-15 missing (`actions/proposals.ts:248-267`, `:995-1004`). B2G-16/17/18 partial (`actions/pc.ts:861-877`; issuance requires confirmed payment `bo-price-checker.ts:1027-1033`; `b2g.ts:450-552`). B2G-19 partial. B2G-24 partial. B2G-26 code generic.

## Work breakdown (blocks in order)

**Block 1 · Master & companies (B2G-01, 02, 20) + 0.1**
- 0.1 fix `test_tenancy.sql:29` slug → `alo-ten`.
- 0032_b2g_v2_channels.sql: widen channels check to {B2C,VIP,B2G}; `partner_has_channel(uuid,text)` SECURITY DEFINER; `booking_cases.channel` (default 'publico', check, backfill 'ministerio' where organisation_id not null, trigger forcing it); add 'concierge' to reserved slugs (not valid); extend access_audit actions. Test `test_channels.sql`.
- Channel gating helper; apply to sidebar, `/agente/ministerios*`, new `/agente/vip*`, `/agente/publico` (404 when off), B2G actions, link builder; admin partner form gets 3 checkboxes.
- Master without company in shell (cross_partner).

**Block 2 · Sales terminal (B2G-21, 03, 22)**
- 0033_vip_clients.sql: vip_clients(id, partner_id, name, email, phone, level, link_token unique 192-bit, active, deactivated_at/by, created_by_email, created_at); RLS select via can_see_partner; booking_cases.vip_client_id; audit action. Test `test_vip.sql`.
- VIP terminal `/vip/[token]` (PC wizard, contact prefilled, partner brand; intake sets channel='vip' + vip_client_id; partner from VIP row; inactive → 404). Middleware bypass.
- Menus `/agente/publico`, `/agente/vip`, `/agente/ministerios` each with its channel queue (`loadBoQueue` channel filter; add channel, partnerName, organisationName, urgency, claimedByLabel to queue columns).
- Link builder: Público / VIP (pick client) / Ministério (pick ministry + secretary – wire once secretaries exist in block 3) – only enabled channels.
- Admin: VIP list across partners.

**Block 3 · Ministries & secretaries (B2G-05, 23, 06, 07)** — security-critical
- 0034: organisations.crest_url; organisation_requests (pending/approved/rejected, reason, decided_by, logo paths, requested_by); replace organisations_manage (insert/delete only cross_partner). ministry_secretaries (org, partner forced by trigger, name, phone, email, link_token unique, active, deactivated_*, created_by_email, last_access_at); ministry_secretary_secrets (no policies, service-role only: pin_hash, pin_version, pin_set_by_email, pin_set_at, failed_attempts, locked_until); ministry_secretary_sessions (token_hash, secretary_id, pin_version, created_at, last_seen_at, expires_at); secretary_pin_failure()/secretary_pin_success() atomic; revoke from anon/authenticated; migrate existing secretary rows (no PIN). Tests.
- UI: partners "Pedir ministério" (logo upload), Admin approve/reject with reason (+ email); secretary management (create, PIN once, regenerate, deactivate, audit); welcome email sends link only.
- Secretary auth on `/ministerios/[org]/[token]` (token = secretary link_token, checks channel B2G), PIN screen, cookie session; `/ministerios/[org]` landing with no request capability. Link builder ministry option.

**Block 4 · Secretary space (B2G-08, 24, 09, 10)**
- 0035: booking_cases.secretary_id, urgency smallint (0 Normal,1 Urgente,2 Muito urgente), urgency_changed_*; index; case_events actor_kind 'secretary' + actor_secretary_id; traveller tables secretary authorship; trigger case secretary ∈ case ministry.
- Simple form (1–50 people, origin default RAI/Praia, destination from airport list, dates rules, urgency default Normal, notes; missing fields listed; bypass dedupe & IP limits; shows reference).
- Tabs Novo pedido / Os meus pedidos (all ministry cases, author, status, safe activity timeline) / Passageiros.
- Branding: separator between partner and ministry logos; manifest icon from crest; title = ministry name; crest always with name.

**Block 5 · Queues (B2G-11, 12, 13, 14)**
- claim_case()/release_case() SECURITY DEFINER RPCs (master claim does not overwrite seller_* on non-operator partners). Test.
- Master scope `workspace: "all"` for cross_partner; `/gestao/concierge` with partner & channel filters, partner column; pulse & bell master workspace.
- Ministry views sorted urgency desc then oldest; agent urgency change (logged); "reclamado por X"; admin release.
- Notify partner + master on new B2G request.

**Block 6 · Offers → issuance (B2G-15, 16, 25, 17, 18)**
- 0036: proposal status `revisao_parceiro` + review cols; booking_cases.ready_to_issue_at. Test.
- Review flow (master on non-operator case → "Enviar à empresa para revisão"; partner agents edit & publish).
- Secretary case view in ministry app (session + org check else 404; no cost/notes; printable; choose offer; passengers via session-gated wrappers; redirect `/pc/{token}` of ministry cases to the ministry app).
- Saved passengers tab (list/search/edit, logged), picker, passport < 6 months flag, pax type from DOB; Admin view of changes.
- No payment; ready_to_issue; issuance accepts it; D-3 enforced.
- Tickets in "Os meus pedidos"; notify secretaries + partner.

**Block 7 · Log (B2G-19)**: view `b2g_activity` (security_invoker) union of case_events, traveller changes, access_audit; pages per ministry (partner BO + Admin) with filters and CSV export. Test isolation.

**Block 8 · Proof & regression (B2G-26, 04)**: data seed script `scripts/seed-b2g-test.sql` (fixtures: mz partner, Empresa Teste B2C only, Alô channels all, TESTE ministries with logos, Dominik master) — not run against prod by agents; full build/tests; review for Alô-specific branching.
