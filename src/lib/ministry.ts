/**
 * WeeFly · MVP 2 · MIN-01 · o link do ministério, resolvido.
 *
 * `/ministerios/<ministério>/<token>` (DOM-01) no endereço do parceiro (TEN-04). O token é a
 * autorização, como o do `/pc`: 192 bits, sem nada sequencial, e regenerar o
 * link mata o antigo de imediato (PAR-04).
 *
 * ⚠ O4 · a secretária entra só pelo link, ou com link e password? Enquanto a
 * decisão não vem, a entrada é o link. Uma password acrescenta-se aqui, à
 * frente do token, sem mexer em mais nada.
 *
 * Lido pela service role, como o `/pc`: não há sessão do lado da secretária.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { createAdminClient } from "@/utils/supabase/admin"
import { clientBrandForPartner, type Brand } from "@/lib/brand"
import { hostPartnerSlug } from "@/lib/host-partner"
import { hasChannel } from "@/lib/channels"

export interface MinistryContext {
  org: {
    id: string
    slug: string
    name: string
    logoUrl: string | null
    token: string
    currency: string
    secretaryName: string | null
    secretaryEmail: string | null
    secretaryPhone: string | null
    secretarySeesBalance: boolean
  }
  partner: { id: string; slug: string; name: string }
  brand: Brand
}

export type MinistryLookup =
  | { ok: true; ministry: MinistryContext }
  /** `brand`: com que marca mostrar o "não encontrado" (TEN-04). */
  | { ok: false; brand: Brand | null }

export const resolveMinistry = cache(async (slug: string, token: string): Promise<MinistryLookup> => {
  const admin = createAdminClient()
  if (!admin || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false, brand: null }

  const { data } = await admin
    .from("organisations")
    .select(
      "id, slug, name, logo_url, link_token, active, currency, secretary_name, secretary_email, secretary_phone, secretary_sees_balance, partner:partners(id, slug, commercial_name, status, channels)"
    )
    .eq("link_token", token)
    .maybeSingle()
  const row = data as Record<string, any> | null
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
        token,
        currency: row.currency ?? "CVE",
        secretaryName: row.secretary_name ?? null,
        secretaryEmail: row.secretary_email ?? null,
        secretaryPhone: row.secretary_phone ?? null,
        secretarySeesBalance: Boolean(row.secretary_sees_balance),
      },
      partner: { id: partner.id, slug: partner.slug, name: partner.commercial_name },
      brand,
    },
  }
})

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
