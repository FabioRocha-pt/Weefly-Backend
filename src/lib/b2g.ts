/**
 * WeeFly · MVP 2 · B2G · o que os ecrãs dos ministérios e da bolsa leem.
 *
 * Tudo pelo cliente da sessão (`getBoScope`): é o RLS da 0028 que decide que
 * ministérios, movimentos e alertas cada conta vê. O saldo é a soma dos
 * movimentos, feita aqui a partir das linhas que a sessão pode ler — e não
 * pela função `organisation_balance`, que é da service role.
 *
 * `partnerId` restringe à área de trabalho de um parceiro (o backoffice da
 * Alô). O espaço B2G do Admin (ADM-08) passa-o por parceiro, e o RLS deixa-o
 * ver todos.
 *
 * SÓ SERVIDOR.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { getBoScope, type BoScope } from "@/lib/bo-scope"
import { createAdminClient } from "@/utils/supabase/admin"

export interface Organisation {
  id: string
  partnerId: string
  slug: string
  name: string
  logoUrl: string | null
  /** B2G-05 · o brasão. Numa lista, sempre ao lado do nome (B2G-24). */
  crestUrl: string | null
  secretaryName: string | null
  secretaryEmail: string | null
  secretaryPhone: string | null
  active: boolean
  linkToken: string | null
  linkRotatedAt: string | null
  currency: string
  alertThresholdAmount: number | null
  alertThresholdPercent: number | null
  secretarySeesBalance: boolean
  createdAt: string
}

export interface BudgetMovement {
  id: string
  kind: "credit" | "debit" | "reversal" | "adjustment"
  delta: number
  currency: string
  caseId: string | null
  reference: string | null
  reversesId: string | null
  documentRef: string | null
  reason: string | null
  createdByEmail: string
  createdAt: string
}

export interface BudgetAlert {
  id: string
  alertDay: string
  balance: number
  threshold: number
  emailSent: number
  whatsappSent: number
  createdAt: string
}

export interface OrganisationSummary extends Organisation {
  balance: number
  /** O limite em valor, já calculado (valor directo, ou % do último crédito). */
  threshold: number | null
  requests: number
  lastAlertAt: string | null
  /** B2G-06 · as secretárias activas (nomes). */
  activeSecretaries: string[]
}

export const ORG_COLUMNS =
  "id, partner_id, slug, name, logo_url, crest_url, secretary_name, secretary_email, secretary_phone, active, link_token, link_rotated_at, currency, alert_threshold_amount, alert_threshold_percent, secretary_sees_balance, created_at"

export function orgFromRow(r: Record<string, any>): Organisation {
  return {
    id: r.id,
    partnerId: r.partner_id,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logo_url ?? null,
    crestUrl: r.crest_url ?? null,
    secretaryName: r.secretary_name ?? null,
    secretaryEmail: r.secretary_email ?? null,
    secretaryPhone: r.secretary_phone ?? null,
    active: r.active !== false,
    linkToken: r.link_token ?? null,
    linkRotatedAt: r.link_rotated_at ?? null,
    currency: r.currency ?? "CVE",
    alertThresholdAmount: r.alert_threshold_amount ?? null,
    alertThresholdPercent: r.alert_threshold_percent != null ? Number(r.alert_threshold_percent) : null,
    secretarySeesBalance: Boolean(r.secretary_sees_balance),
    createdAt: r.created_at,
  }
}

function movementFromRow(r: Record<string, any>): BudgetMovement {
  const bc = Array.isArray(r.booking_case) ? r.booking_case[0] : r.booking_case
  const trip = bc ? (Array.isArray(bc.trip_request) ? bc.trip_request[0] : bc.trip_request) : null
  return {
    id: r.id,
    kind: r.kind,
    delta: Number(r.delta),
    currency: r.currency,
    caseId: r.case_id ?? null,
    reference: trip?.reference ?? null,
    reversesId: r.reverses_id ?? null,
    documentRef: r.document_ref ?? null,
    reason: r.reason ?? null,
    createdByEmail: r.created_by_email,
    createdAt: r.created_at,
  }
}

/**
 * O limite em valor. Em percentagem é sobre o último reforço (o crédito mais
 * recente): é o montante que o ministério pôs à disposição da última vez.
 */
export function thresholdOf(org: Organisation, movements: { kind: string; delta: number }[]): number | null {
  if (org.alertThresholdAmount != null) return org.alertThresholdAmount
  if (org.alertThresholdPercent != null) {
    const lastCredit = movements.find((m) => m.kind === "credit")
    if (!lastCredit) return null
    return Math.round((lastCredit.delta * org.alertThresholdPercent) / 100)
  }
  return null
}

async function summarise(db: SupabaseClient, orgs: Organisation[]): Promise<OrganisationSummary[]> {
  if (orgs.length === 0) return []
  const ids = orgs.map((o) => o.id)

  const [movRes, caseRes, alertRes, secRes] = await Promise.all([
    db
      .from("budget_movements")
      .select("organisation_id, kind, delta, created_at")
      .in("organisation_id", ids)
      .order("created_at", { ascending: false }),
    db.from("booking_cases").select("organisation_id").in("organisation_id", ids),
    db
      .from("budget_alerts")
      .select("organisation_id, created_at")
      .in("organisation_id", ids)
      .order("created_at", { ascending: false }),
    db.from("ministry_secretaries").select("organisation_id, name").in("organisation_id", ids).eq("active", true).order("created_at"),
  ])
  const secretaries = (secRes.data ?? []) as { organisation_id: string; name: string }[]

  const movements = (movRes.data ?? []) as { organisation_id: string; kind: string; delta: number }[]
  const cases = (caseRes.data ?? []) as { organisation_id: string }[]
  const alerts = (alertRes.data ?? []) as { organisation_id: string; created_at: string }[]

  return orgs.map((org) => {
    const own = movements.filter((m) => m.organisation_id === org.id).map((m) => ({ ...m, delta: Number(m.delta) }))
    return {
      ...org,
      balance: own.reduce((sum, m) => sum + m.delta, 0),
      threshold: thresholdOf(org, own),
      requests: cases.filter((c) => c.organisation_id === org.id).length,
      lastAlertAt: alerts.find((a) => a.organisation_id === org.id)?.created_at ?? null,
      activeSecretaries: secretaries.filter((x) => x.organisation_id === org.id).map((x) => x.name),
    }
  })
}

/** Os ministérios de um parceiro (ou do parceiro da sessão). */
export async function listOrganisations(
  scopeArg?: BoScope | null,
  partnerId?: string | null
): Promise<OrganisationSummary[]> {
  const scope = scopeArg ?? (await getBoScope())
  if (!scope) return []
  const target = partnerId ?? scope.partnerId
  let query = scope.db.from("organisations").select(ORG_COLUMNS).order("name")
  if (target) query = query.eq("partner_id", target)
  const { data, error } = await query
  if (error) {
    console.error("[b2g] ministérios:", error.message)
    return []
  }
  return summarise(scope.db, ((data ?? []) as Record<string, any>[]).map(orgFromRow))
}

export interface OrganisationDetail {
  org: OrganisationSummary
  movements: BudgetMovement[]
  alerts: BudgetAlert[]
  cases: {
    caseId: string
    reference: string | null
    route: string
    stage: string
    createdAt: string
    externalPaid: boolean
  }[]
  /** B2G-06 · as secretárias deste ministério (activas e desactivadas). */
  secretaries: MinistrySecretary[]
}

/** B2G-06 · uma secretária, como o back-office a vê (nunca o PIN nem o hash). */
export interface MinistrySecretary {
  id: string
  name: string
  email: string | null
  phone: string | null
  active: boolean
  /** `/ministerios/<slug>/<token>` */
  path: string
  createdByEmail: string
  createdAt: string
  lastAccessAt: string | null
  deactivatedAt: string | null
  deactivatedByEmail: string | null
  hasPin: boolean
  pinSetByEmail: string | null
  pinSetAt: string | null
  lockedUntil: string | null
}

/**
 * As secretárias de um ministério já aberto pela sessão. As linhas vêm pelo
 * RLS; o estado do PIN (quem o gerou, quando, se está bloqueado — nunca o
 * hash) pela service role, só para estas linhas.
 */
export async function listSecretaries(db: SupabaseClient, org: { id: string; slug: string }): Promise<MinistrySecretary[]> {
  const { data, error } = await db
    .from("ministry_secretaries")
    .select("id, name, email, phone, active, link_token, created_by_email, created_at, last_access_at, deactivated_at, deactivated_by_email")
    .eq("organisation_id", org.id)
    .order("created_at")
  if (error) {
    console.error("[b2g] secretárias:", error.message)
    return []
  }
  const rows = (data ?? []) as Record<string, any>[]
  const admin = createAdminClient()
  const secrets = new Map<string, Record<string, any>>()
  if (admin && rows.length) {
    const { data: s } = await admin
      .from("ministry_secretary_secrets")
      .select("secretary_id, pin_set_by_email, pin_set_at, locked_until, pin_version")
      .in("secretary_id", rows.map((r) => r.id))
    for (const r of (s ?? []) as Record<string, any>[]) secrets.set(r.secretary_id, r)
  }
  return rows.map((r) => {
    const sec = secrets.get(r.id)
    return {
      id: r.id,
      name: r.name,
      email: r.email ?? null,
      phone: r.phone ?? null,
      active: Boolean(r.active),
      path: `/ministerios/${org.slug}/${r.link_token}`,
      createdByEmail: r.created_by_email,
      createdAt: r.created_at,
      lastAccessAt: r.last_access_at ?? null,
      deactivatedAt: r.deactivated_at ?? null,
      deactivatedByEmail: r.deactivated_by_email ?? null,
      hasPin: Boolean(sec && Number(sec.pin_version) > 0),
      pinSetByEmail: sec?.pin_set_by_email ?? null,
      pinSetAt: sec?.pin_set_at ?? null,
      lockedUntil: sec?.locked_until && new Date(sec.locked_until).getTime() > Date.now() ? sec.locked_until : null,
    }
  })
}

/**
 * Um ministério, visto por esta sessão. `null` se o RLS não o deixar ver — o
 * 404 do TEN-03. `partnerId` obriga-o a ser desse parceiro (a área de
 * trabalho); no Admin passa-se `null`.
 */
export async function loadOrganisation(
  orgId: string,
  options: { partnerId?: string | null } = {}
): Promise<OrganisationDetail | null> {
  const scope = await getBoScope()
  if (!scope || !/^[0-9a-f-]{36}$/i.test(orgId)) return null
  const partner = options.partnerId === undefined ? scope.partnerId : options.partnerId

  let q = scope.db.from("organisations").select(ORG_COLUMNS).eq("id", orgId)
  if (partner) q = q.eq("partner_id", partner)
  const { data } = await q.maybeSingle()
  if (!data) return null
  const org = orgFromRow(data as Record<string, any>)

  const [movRes, alertRes, caseRes, secretaries, extRes] = await Promise.all([
    scope.db
      .from("budget_movements")
      .select(
        "id, kind, delta, currency, case_id, reverses_id, document_ref, reason, created_by_email, created_at, booking_case:booking_cases(trip_request:trip_requests(reference))"
      )
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500),
    scope.db
      .from("budget_alerts")
      .select("id, alert_day, balance, threshold, email_sent, whatsapp_sent, created_at")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    scope.db
      .from("booking_cases")
      .select("id, stage, created_at, trip_request:trip_requests(reference, origin, destination)")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(300),
    listSecretaries(scope.db, org),
    scope.db
      .from("case_external_payments")
      .select("case_id, case:booking_cases!inner(organisation_id)")
      .eq("case.organisation_id", orgId)
      .is("reversed_at", null),
  ])

  const movements = ((movRes.data ?? []) as Record<string, any>[]).map(movementFromRow)
  const paid = new Set(((extRes.data ?? []) as { case_id: string }[]).map((r) => r.case_id))
  const [summary] = await summarise(scope.db, [org])

  return {
    org: summary,
    movements,
    alerts: ((alertRes.data ?? []) as Record<string, any>[]).map((a) => ({
      id: a.id,
      alertDay: a.alert_day,
      balance: Number(a.balance),
      threshold: Number(a.threshold),
      emailSent: a.email_sent,
      whatsappSent: a.whatsapp_sent,
      createdAt: a.created_at,
    })),
    cases: ((caseRes.data ?? []) as Record<string, any>[]).map((c) => {
      const trip = Array.isArray(c.trip_request) ? c.trip_request[0] : c.trip_request
      return {
        caseId: c.id,
        reference: trip?.reference ?? null,
        route: trip ? `${trip.origin} → ${trip.destination}` : "—",
        stage: c.stage,
        createdAt: c.created_at,
        externalPaid: paid.has(c.id),
      }
    }),
    secretaries,
  }
}

export interface ExternalPayment {
  id: string
  amount: number
  currency: string
  paidOn: string
  method: string
  reference: string | null
  confirmedByEmail: string
  confirmedAt: string
  reversedAt: string | null
  reversedByEmail: string | null
  reversalReason: string | null
}

/** PAR-07 · os pagamentos externos de um caso (o vivo em primeiro). */
export async function listExternalPayments(caseId: string): Promise<ExternalPayment[]> {
  const scope = await getBoScope()
  if (!scope) return []
  const { data } = await scope.db
    .from("case_external_payments")
    .select(
      "id, amount, currency, paid_on, method, reference, confirmed_by_email, confirmed_at, reversed_at, reversed_by_email, reversal_reason"
    )
    .eq("case_id", caseId)
    .order("confirmed_at", { ascending: false })
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    currency: r.currency,
    paidOn: r.paid_on,
    method: r.method,
    reference: r.reference ?? null,
    confirmedByEmail: r.confirmed_by_email,
    confirmedAt: r.confirmed_at,
    reversedAt: r.reversed_at ?? null,
    reversedByEmail: r.reversed_by_email ?? null,
    reversalReason: r.reversal_reason ?? null,
  }))
}

export interface AlertRecipient {
  id: string
  partnerId: string
  organisationId: string | null
  side: "partner" | "weefly"
  name: string | null
  email: string | null
  whatsapp: string | null
  active: boolean
}

export async function listAlertRecipients(partnerId: string): Promise<AlertRecipient[]> {
  const scope = await getBoScope()
  if (!scope) return []
  const { data } = await scope.db
    .from("alert_recipients")
    .select("id, partner_id, organisation_id, side, name, email, whatsapp, active")
    .eq("partner_id", partnerId)
    .order("created_at")
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r.id,
    partnerId: r.partner_id,
    organisationId: r.organisation_id ?? null,
    side: r.side,
    name: r.name ?? null,
    email: r.email ?? null,
    whatsapp: r.whatsapp ?? null,
    active: Boolean(r.active),
  }))
}

// ── B2G-23 · os pedidos de ministério ────────────────────────────────────────

export interface OrganisationRequest {
  id: string
  partnerId: string
  partnerName: string | null
  name: string
  logoUrl: string | null
  crestUrl: string | null
  status: "pending" | "approved" | "rejected"
  reason: string | null
  requestedByEmail: string
  decidedByEmail: string | null
  decidedAt: string | null
  organisationId: string | null
  createdAt: string
}

/**
 * Os pedidos que esta sessão vê (RLS: a empresa os seus, o master todos).
 * `partnerId` restringe a uma empresa; `status`, a um estado.
 */
export async function listOrganisationRequests(
  scope: BoScope,
  options: { partnerId?: string | null; status?: OrganisationRequest["status"] } = {}
): Promise<OrganisationRequest[]> {
  let q = scope.db
    .from("organisation_requests")
    .select(
      "id, partner_id, name, logo_path, crest_path, status, reason, requested_by_email, decided_by_email, decided_at, organisation_id, created_at, partner:partners(commercial_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200)
  if (options.partnerId) q = q.eq("partner_id", options.partnerId)
  if (options.status) q = q.eq("status", options.status)
  const { data, error } = await q
  if (error) {
    /* Numa base sem a 0034 não há pedidos: a página abre na mesma. */
    if (error.code !== "PGRST205" && error.code !== "42P01") console.error("[b2g] pedidos:", error.message)
    return []
  }
  const admin = createAdminClient()
  const url = (path: string | null) => (path && admin ? admin.storage.from("brand").getPublicUrl(path).data.publicUrl : null)
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const partner = Array.isArray(r.partner) ? r.partner[0] : r.partner
    return {
      id: r.id,
      partnerId: r.partner_id,
      partnerName: partner?.commercial_name ?? null,
      name: r.name,
      logoUrl: url(r.logo_path ?? null),
      crestUrl: url(r.crest_path ?? null),
      status: r.status,
      reason: r.reason ?? null,
      requestedByEmail: r.requested_by_email,
      decidedByEmail: r.decided_by_email ?? null,
      decidedAt: r.decided_at ?? null,
      organisationId: r.organisation_id ?? null,
      createdAt: r.created_at,
    }
  })
}

// ── B2G-03 · os ministérios no construtor de links ──────────────────────────

export interface LinkMinistryRow {
  id: string
  name: string
  crestUrl: string | null
  secretaries: { id: string; name: string; path: string }[]
}

/** Os ministérios activos de uma empresa com as secretárias activas e o link de cada uma. */
export async function listLinkMinistries(scope: BoScope, partnerId: string): Promise<LinkMinistryRow[]> {
  const { data, error } = await scope.db
    .from("organisations")
    .select("id, slug, name, crest_url, active, secretaries:ministry_secretaries(id, name, link_token, active)")
    .eq("partner_id", partnerId)
    .eq("active", true)
    .order("name")
  if (error) {
    console.error("[b2g] link de ministérios:", error.message)
    return []
  }
  return ((data ?? []) as Record<string, any>[]).map((o) => ({
    id: o.id,
    name: o.name,
    crestUrl: o.crest_url ?? null,
    secretaries: ((o.secretaries ?? []) as Record<string, any>[])
      .filter((s) => s.active)
      .map((s) => ({ id: s.id, name: s.name, path: `/ministerios/${o.slug}/${s.link_token}` })),
  }))
}
