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
