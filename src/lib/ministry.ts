/**
 * WeeFly · MVP 2 · MIN-01 · B2G-06 · B2G-07 · o link do ministério, resolvido.
 *
 * `/ministerios/<ministério>/<token>` (DOM-01) no endereço do parceiro (TEN-04).
 * Desde a 0034 o token é o **link pessoal de uma secretária**
 * (`ministry_secretaries.link_token`, 192+ bits), e já não o do ministério: o
 * `organisations.link_token` deixou de ser credencial.
 *
 * O link sozinho não chega (B2G-07): abre o ecrã do PIN. As páginas e as
 * acções do espaço do ministério pedem uma sessão aberta com o PIN dessa
 * secretária (`loadSecretarySpace`, `lib/secretary-auth`).
 *
 * Lido pela service role: a secretária não tem sessão no back-office.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { createAdminClient } from "@/utils/supabase/admin"
import { clientBrandForPartner, type Brand } from "@/lib/brand"
import { hostPartnerSlug } from "@/lib/host-partner"
import { hasChannel } from "@/lib/channels"
import { sessionSecretaryId } from "@/lib/secretary-auth"

export const SECRETARY_LINK_TOKEN = /^[A-Za-z0-9_-]{32,64}$/

export interface MinistryContext {
  org: {
    id: string
    slug: string
    name: string
    logoUrl: string | null
    /** B2G-05 · o brasão (ícone). Nunca sozinho numa lista. */
    crestUrl: string | null
    /** O token do link pessoal desta secretária (o segmento do endereço). */
    token: string
    currency: string
    secretaryName: string | null
    secretaryEmail: string | null
    secretaryPhone: string | null
    secretarySeesBalance: boolean
  }
  /** B2G-06 · a secretária dona deste link. */
  secretary: { id: string; name: string; email: string | null; phone: string | null }
  partner: { id: string; slug: string; name: string }
  brand: Brand
}

export type MinistryLookup =
  | { ok: true; ministry: MinistryContext }
  /** `brand`: com que marca mostrar o "não encontrado" (TEN-04). */
  | { ok: false; brand: Brand | null }

export const resolveMinistry = cache(async (slug: string, token: string): Promise<MinistryLookup> => {
  const admin = createAdminClient()
  if (!admin || !SECRETARY_LINK_TOKEN.test(token)) return { ok: false, brand: null }

  const { data } = await admin
    .from("ministry_secretaries")
    .select(
      "id, name, email, phone, active, link_token, organisation:organisations(id, slug, name, logo_url, crest_url, active, currency, secretary_sees_balance, partner:partners(id, slug, commercial_name, status, channels))"
    )
    .eq("link_token", token)
    .maybeSingle()
  const sec = data as Record<string, any> | null
  const row = sec ? (Array.isArray(sec.organisation) ? sec.organisation[0] : sec.organisation) : null
  const partner = row ? (Array.isArray(row.partner) ? row.partner[0] : row.partner) : null

  /* O subdomínio também tem de bater certo: o link de um ministério do Alô
     não abre no endereço de outro parceiro. */
  const host = hostPartnerSlug()
  const hostBrand = host
    ? await (async () => {
        const { data: p } = await admin.from("partners").select("id").eq("slug", host).maybeSingle()
        return p ? clientBrandForPartner((p as { id: string }).id) : null
      })()
    : null

  if (
    !sec ||
    !sec.active ||
    !row ||
    !partner ||
    row.slug !== slug ||
    !row.active ||
    partner.status !== "active" ||
    /* B2G-02 · sem o canal Ministérios, o espaço do ministério não abre. */
    !hasChannel(partner.channels, "B2G") ||
    (host && host !== partner.slug)
  ) {
    return { ok: false, brand: hostBrand }
  }

  const base = await clientBrandForPartner(partner.id)
  const brand: Brand = { ...base, organisation: { name: row.name, logoUrl: row.logo_url ?? null } }

  return {
    ok: true,
    ministry: {
      org: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        logoUrl: row.logo_url ?? null,
        crestUrl: row.crest_url ?? null,
        token,
        currency: row.currency ?? "CVE",
        secretaryName: sec.name ?? null,
        secretaryEmail: sec.email ?? null,
        secretaryPhone: sec.phone ?? null,
        secretarySeesBalance: Boolean(row.secretary_sees_balance),
      },
      secretary: { id: sec.id, name: sec.name, email: sec.email ?? null, phone: sec.phone ?? null },
      partner: { id: partner.id, slug: partner.slug, name: partner.commercial_name },
      brand,
    },
  }
})

/**
 * B2G-07 · o espaço do ministério para este pedido: o link resolvido e, se o
 * cookie tiver uma sessão válida **desta** secretária, `signedIn`. A sessão de
 * outra secretária (outro link) não conta.
 */
export const loadSecretarySpace = cache(
  async (slug: string, token: string): Promise<{ lookup: MinistryLookup; signedIn: boolean }> => {
    const lookup = await resolveMinistry(slug, token)
    if (!lookup.ok) return { lookup, signedIn: false }
    const sessionId = await sessionSecretaryId()
    return { lookup, signedIn: sessionId === lookup.ministry.secretary.id }
  }
)

/**
 * Para as server actions do espaço do ministério: a secretária do link, só se
 * a sessão do cookie for dela. Nulo em qualquer outro caso.
 */
export async function secretaryForLinkToken(token: string | null | undefined): Promise<string | null> {
  if (!token || !SECRETARY_LINK_TOKEN.test(token)) return null
  const admin = createAdminClient()
  if (!admin) return null
  const sessionId = await sessionSecretaryId()
  if (!sessionId) return null
  const { data } = await admin
    .from("ministry_secretaries")
    .select("id")
    .eq("link_token", token)
    .eq("id", sessionId)
    .eq("active", true)
    .maybeSingle()
  return data ? (data as { id: string }).id : null
}

export interface MinistryTrip {
  caseId: string
  token: string
  reference: string | null
  origin: string | null
  destination: string | null
  departDate: string | null
  returnDate: string | null
  pnr: string | null
  status: "active" | "issued" | "used" | "expired" | "cancelled"
  createdAt: string
}

/**
 * MIN-01 · "Minhas passagens": a viagem activa em cima, depois o arquivo das
 * emitidas, usadas e expiradas desse ministério — e só desse.
 */
export async function listMinistryTrips(orgId: string): Promise<MinistryTrip[]> {
  const admin = createAdminClient()
  if (!admin) return []
  const { data } = await admin
    .from("booking_cases")
    .select(
      "id, token, stage, pnr, closed_at, created_at, trip_request:trip_requests(reference, origin, destination, depart_date, return_date), payments:case_payments(status)"
    )
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false })
    .limit(300)

  const today = new Date().toISOString().slice(0, 10)
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const trip = Array.isArray(r.trip_request) ? r.trip_request[0] : r.trip_request
    const payments = ((r.payments ?? []) as { status: string }[]).map((p) => p.status)
    const lastDay = trip?.return_date ?? trip?.depart_date ?? null
    let status: MinistryTrip["status"]
    if (r.stage === "cancelado") status = "cancelled"
    else if (r.pnr) status = lastDay && lastDay < today ? "used" : "issued"
    else if (r.closed_at || payments.includes("EXPIRED") || (trip?.depart_date && trip.depart_date < today))
      status = "expired"
    else status = "active"
    return {
      caseId: r.id,
      token: r.token,
      reference: trip?.reference ?? null,
      origin: trip?.origin ?? null,
      destination: trip?.destination ?? null,
      departDate: trip?.depart_date ?? null,
      returnDate: trip?.return_date ?? null,
      pnr: r.pnr ?? null,
      status,
      createdAt: r.created_at,
    }
  })
}

/** O saldo da bolsa, só quando o ministério o pode ver (decisão O2). */
export async function ministryBalance(orgId: string): Promise<number | null> {
  const admin = createAdminClient()
  if (!admin) return null
  const { data, error } = await admin.rpc("organisation_balance", { p_org: orgId })
  if (error) return null
  return Number(data)
}

// ── B2G-08 · B2G-10 · "Os meus pedidos" ─────────────────────────────────────

/** B2G-09 · D-6 · 0 Normal, 1 Urgente, 2 Muito urgente. */
export type Urgency = 0 | 1 | 2

export type MinistryRequestStatus =
  | "received"
  | "handling"
  | "options"
  | "chosen"
  /** B2G-17 · passageiros completos, sem pagamento: a empresa emite. */
  | "ready"
  | "issued"
  | "used"
  | "closed"
  | "cancelled"

/**
 * O registo de actividade que a secretária vê: uma lista **fechada** de
 * acontecimentos, cada um com a frase do dicionário (`ministry.timeline.*`).
 * Nunca o título, o detalhe nem o payload gravados: são escritos para o
 * back-office e podem levar notas internas, custos ou o email de um agente.
 */
export const PUBLIC_TIMELINE_KINDS = [
  "request_submitted",
  "case_claimed",
  "urgency_changed",
  "proposal_published",
  "offer_selected",
  "passengers_submitted",
  "pax_mix_updated",
  "ministry_ready_to_issue",
  "tickets_issued",
  "request_cancelled",
  "case_closed",
  "case_reopened",
] as const
export type PublicTimelineKind = (typeof PUBLIC_TIMELINE_KINDS)[number]

export interface MinistryTimelineEntry {
  kind: PublicTimelineKind
  at: string
  /** Só no `request_submitted`: a secretária que enviou. */
  secretaryName: string | null
}

export interface MinistryRequest {
  caseId: string
  token: string
  reference: string | null
  origin: string | null
  destination: string | null
  departDate: string | null
  returnDate: string | null
  people: number
  urgency: Urgency
  notes: string | null
  status: MinistryRequestStatus
  /** D-4 · quem fez o pedido (as colegas veem os pedidos umas das outras). */
  secretaryName: string | null
  pnr: string | null
  createdAt: string
  timeline: MinistryTimelineEntry[]
}

/**
 * B2G-08 · D-4 · todos os pedidos do ministério — de todas as secretárias
 * dele, e só dele —, do mais recente para o mais antigo, com o estado e o
 * registo de actividade (lista fechada) de cada um.
 */
export async function listMinistryRequests(orgId: string): Promise<MinistryRequest[]> {
  const admin = createAdminClient()
  if (!admin) return []

  const columns = (withUrgency: boolean) =>
    `id, token, stage, pnr, closed_at, claimed_at, created_at, secretary_id,${withUrgency ? " urgency, ready_to_issue_at," : ""}
     trip_request:trip_requests (reference, origin, destination, depart_date, return_date, adults, special_requests),
     proposals:case_proposals (status, selected_offer_id)`
  const run = (withUrgency: boolean) =>
    admin
      .from("booking_cases")
      .select(columns(withUrgency))
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(300)

  /* Numa base sem a 0035 (ou sem a 0037) a lista abre na mesma, tudo Normal. */
  let { data, error } = await run(true)
  if (error?.code === "42703") ({ data, error } = await run(false))
  if (error) {
    console.error("[ministério] pedidos:", error.message)
    return []
  }
  const rows = (data ?? []) as Record<string, any>[]
  if (!rows.length) return []

  const [{ data: secs }, { data: events }] = await Promise.all([
    admin.from("ministry_secretaries").select("id, name").eq("organisation_id", orgId),
    admin
      .from("case_events")
      .select("case_id, kind, created_at, payload")
      .in("case_id", rows.map((r) => r.id as string))
      .in("kind", [...PUBLIC_TIMELINE_KINDS])
      .order("created_at", { ascending: true })
      .limit(3000),
  ])
  const names = new Map(((secs ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]))

  const timelines = new Map<string, MinistryTimelineEntry[]>()
  for (const e of (events ?? []) as Record<string, any>[]) {
    const list = timelines.get(e.case_id) ?? []
    const payloadSec = e.kind === "request_submitted" ? (e.payload?.secretaryId as string | undefined) : undefined
    list.push({
      kind: e.kind as PublicTimelineKind,
      at: e.created_at,
      secretaryName: payloadSec ? names.get(payloadSec) ?? null : null,
    })
    timelines.set(e.case_id, list)
  }

  const today = new Date().toISOString().slice(0, 10)
  return rows.map((r) => {
    const trip = Array.isArray(r.trip_request) ? r.trip_request[0] : r.trip_request
    const proposals = (Array.isArray(r.proposals) ? r.proposals : r.proposals ? [r.proposals] : []) as {
      status: string
      selected_offer_id: string | null
    }[]
    const lastDay = trip?.return_date ?? trip?.depart_date ?? null
    let status: MinistryRequestStatus
    if (r.stage === "cancelado") status = "cancelled"
    else if (r.pnr) status = lastDay && lastDay < today ? "used" : "issued"
    else if (r.closed_at) status = "closed"
    else if (r.ready_to_issue_at && proposals.some((p) => p.selected_offer_id)) status = "ready"
    else if (proposals.some((p) => p.selected_offer_id)) status = "chosen"
    else if (proposals.some((p) => p.status === "publicada")) status = "options"
    else if (r.claimed_at) status = "handling"
    else status = "received"
    const urgency = Number(r.urgency ?? 0)
    return {
      caseId: r.id,
      token: r.token,
      reference: trip?.reference ?? null,
      origin: trip?.origin ?? null,
      destination: trip?.destination ?? null,
      departDate: trip?.depart_date ?? null,
      returnDate: trip?.return_date ?? null,
      people: Number(trip?.adults ?? 1),
      urgency: (urgency === 1 || urgency === 2 ? urgency : 0) as Urgency,
      notes: trip?.special_requests ?? null,
      status,
      secretaryName: r.secretary_id ? names.get(r.secretary_id) ?? null : null,
      pnr: r.pnr ?? null,
      createdAt: r.created_at,
      timeline: timelines.get(r.id) ?? [],
    }
  })
}

// ── B2G-25 · Passageiros ────────────────────────────────────────────────────

export interface MinistryTraveller {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  nationality: string | null
  /** Só os últimos caracteres: a lista não precisa do número inteiro. */
  passportTail: string | null
  passportExpiry: string | null
  /** Expirado ou a menos de seis meses de expirar (B2G-25). */
  passportWarning: "expired" | "soon" | null
  updatedAt: string
}

/** `months` meses depois de `today` (AAAA-MM-DD). */
function plusMonths(today: string, months: number): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

const foldText = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()

/**
 * B2G-25 · os passageiros guardados do ministério — só desse —, por apelido.
 * `query` filtra por nome ou passaporte (sem acentos, sem maiúsculas).
 */
export async function listMinistryTravellers(orgId: string, query?: string | null): Promise<MinistryTraveller[]> {
  const admin = createAdminClient()
  if (!admin) return []
  const { data, error } = await admin
    .from("ministry_travellers")
    .select("id, first_name, last_name, birth_date, nationality, passport_number, passport_expiry, updated_at")
    .eq("organisation_id", orgId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .limit(1000)
  if (error) {
    console.error("[ministério] passageiros:", error.message)
    return []
  }

  const q = query ? foldText(query) : ""
  const today = new Date().toISOString().slice(0, 10)
  const horizon = plusMonths(today, 6)

  return ((data ?? []) as Record<string, any>[])
    .filter((r) => {
      if (!q) return true
      const hay = foldText(`${r.first_name ?? ""} ${r.last_name ?? ""} ${r.passport_number ?? ""}`)
      return q.split(/\s+/).every((part) => hay.includes(part))
    })
    .map((r) => {
      const expiry = (r.passport_expiry as string | null) ?? null
      const passport = (r.passport_number as string | null) ?? null
      return {
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        birthDate: r.birth_date ?? null,
        nationality: r.nationality ?? null,
        passportTail: passport ? `•••${passport.slice(-3)}` : null,
        passportExpiry: expiry,
        passportWarning: !expiry ? null : expiry < today ? "expired" : expiry < horizon ? "soon" : null,
        updatedAt: r.updated_at,
      }
    })
}

/** O aviso do passaporte: expirado, ou a menos de seis meses de expirar. */
export function passportWarning(expiry: string | null, today = new Date().toISOString().slice(0, 10)): "expired" | "soon" | null {
  if (!expiry) return null
  if (expiry < today) return "expired"
  return expiry < plusMonths(today, 6) ? "soon" : null
}

export interface MinistryTravellerCard {
  id: string
  title: string | null
  firstName: string
  lastName: string
  gender: string | null
  birthDate: string | null
  nationality: string | null
  passportNumber: string | null
  passportExpiry: string | null
  issuingCountry: string | null
  phone: string | null
  email: string | null
  passportWarning: "expired" | "soon" | null
}

const CARD_COLUMNS =
  "id, title, first_name, last_name, gender, birth_date, nationality, passport_number, passport_expiry, issuing_country, phone, email"

function cardFromRow(r: Record<string, any>): MinistryTravellerCard {
  return {
    id: r.id,
    title: r.title ?? null,
    firstName: r.first_name,
    lastName: r.last_name,
    gender: r.gender ?? null,
    birthDate: r.birth_date ?? null,
    nationality: r.nationality ?? null,
    passportNumber: r.passport_number ?? null,
    passportExpiry: r.passport_expiry ?? null,
    issuingCountry: r.issuing_country ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    passportWarning: passportWarning(r.passport_expiry ?? null),
  }
}

/**
 * B2G-25 · B2G-16 · as fichas completas do ministério — só desse —, para
 * escolher ao preencher os passageiros de um pedido. Só para a página do caso,
 * com a sessão do PIN de uma secretária desse ministério.
 */
export async function listMinistryTravellerCards(orgId: string): Promise<MinistryTravellerCard[]> {
  const admin = createAdminClient()
  if (!admin) return []
  const { data, error } = await admin
    .from("ministry_travellers")
    .select(CARD_COLUMNS)
    .eq("organisation_id", orgId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .limit(1000)
  if (error) {
    console.error("[ministério] fichas:", error.message)
    return []
  }
  return ((data ?? []) as Record<string, any>[]).map(cardFromRow)
}

/** B2G-25 · uma ficha, para a corrigir — só se for deste ministério. */
export async function loadMinistryTravellerCard(orgId: string, travellerId: string): Promise<MinistryTravellerCard | null> {
  const admin = createAdminClient()
  if (!admin || !/^[0-9a-f-]{36}$/i.test(travellerId)) return null
  const { data } = await admin
    .from("ministry_travellers")
    .select(CARD_COLUMNS)
    .eq("id", travellerId)
    .eq("organisation_id", orgId)
    .maybeSingle()
  return data ? cardFromRow(data as Record<string, any>) : null
}
