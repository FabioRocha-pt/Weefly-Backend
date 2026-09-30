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

export interface Organisation {
  id: string
  partnerId: string
  slug: string
  name: string
  logoUrl: string | null
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
}

export const ORG_COLUMNS =
  "id, partner_id, slug, name, logo_url, secretary_name, secretary_email, secretary_phone, active, link_token, link_rotated_at, currency, alert_threshold_amount, alert_threshold_percent, secretary_sees_balance, created_at"

export function orgFromRow(r: Record<string, any>): Organisation {
  return {
    id: r.id,
    partnerId: r.partner_id,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logo_url ?? null,
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

  const [movRes, caseRes, alertRes] = await Promise.all([
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
  ])

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
  /** As contas de secretária deste ministério (a activa e as que saíram). */
  secretaries: { email: string; label: string | null; active: boolean; suspendedAt: string | null }[]
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

  const [movRes, alertRes, caseRes, secRes, extRes] = await Promise.all([
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
    scope.db
      .from("bo_allowlist")
      .select("email, label, active, suspended_at")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false }),
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
    secretaries: ((secRes.data ?? []) as Record<string, any>[]).map((s) => ({
      email: s.email,
      label: s.label ?? null,
      active: Boolean(s.active),
      suspendedAt: s.suspended_at ?? null,
    })),
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
