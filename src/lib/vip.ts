/**
 * WeeFly · B2G v2 · B2G-22 · os clientes VIP.
 *
 * Um VIP é um cliente de uma empresa com um link pessoal (`/vip/<token>`):
 * opaco (192 bits, como o `/pc` e o ministério), permanente, e com a marca da
 * empresa. O formulário abre com o contacto dele preenchido, e o pedido entra
 * na fila VIP da empresa (`booking_cases.channel = 'vip'`, migração 0033).
 *
 * Duas leituras, duas portas:
 *   · o terminal (`resolveVipLink`) lê pela service role, como o `/pc` — o
 *     cliente não tem sessão, o token é a autorização;
 *   · o back-office (`listVipClients`, `getVipClient`) lê pelo cliente da
 *     sessão, com o RLS (`vip_clients_select`) a decidir.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { createAdminClient } from "@/utils/supabase/admin"
import { clientBrandForPartner, type Brand } from "@/lib/brand"
import { hostPartnerSlug } from "@/lib/host-partner"
import { hasChannel } from "@/lib/channels"
import type { BoScope } from "@/lib/bo-scope"

/** O formato do token: 24 bytes em base64url (32 caracteres), no mínimo. */
export const VIP_TOKEN = /^[A-Za-z0-9_-]{32,64}$/

export interface VipClient {
  id: string
  partnerId: string
  partnerName: string | null
  name: string
  email: string | null
  phone: string | null
  level: string | null
  token: string
  active: boolean
  deactivatedAt: string | null
  deactivatedByEmail: string | null
  createdByEmail: string | null
  createdAt: string
}

const COLUMNS =
  "id, partner_id, name, email, phone, level, link_token, active, deactivated_at, deactivated_by_email, created_by_email, created_at, partner:partners(commercial_name)"

function fromRow(row: Record<string, any>): VipClient {
  const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner
  return {
    id: row.id,
    partnerId: row.partner_id,
    partnerName: partner?.commercial_name ?? null,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    level: row.level ?? null,
    token: row.link_token,
    active: Boolean(row.active),
    deactivatedAt: row.deactivated_at ?? null,
    deactivatedByEmail: row.deactivated_by_email ?? null,
    createdByEmail: row.created_by_email ?? null,
    createdAt: row.created_at,
  }
}

/**
 * Os VIP que a sessão vê. Por omissão os da empresa da sessão (o terminal de
 * vendas); `allPartners` só serve ao Admin WeeFly, a quem o RLS já mostra
 * todos (B2G-22 · "o master vê os VIP de todas as empresas").
 */
export async function listVipClients(
  scope: BoScope | null,
  opts: { allPartners?: boolean; partnerId?: string | null; activeOnly?: boolean; q?: string } = {}
): Promise<VipClient[]> {
  if (!scope) return []
  let query = scope.db.from("vip_clients").select(COLUMNS).order("active", { ascending: false }).order("name").limit(500)
  const cross = Boolean(scope.identity.profile?.crossPartner)
  if (opts.allPartners && cross) {
    if (opts.partnerId) query = query.eq("partner_id", opts.partnerId)
  } else if (scope.partnerId) {
    query = query.eq("partner_id", scope.partnerId)
  }
  if (opts.activeOnly) query = query.eq("active", true)
  const { data, error } = await query
  if (error) {
    /* Numa base sem a 0033 a tabela não existe: lista vazia, não um 500. */
    console.error("[vip] lista ilegível:", error.message)
    return []
  }
  let rows = ((data ?? []) as Record<string, any>[]).map(fromRow)
  const q = opts.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((v) =>
      [v.name, v.email ?? "", v.phone ?? "", v.level ?? "", v.partnerName ?? ""].join(" ").toLowerCase().includes(q)
    )
  }
  return rows
}

/** Um VIP, se a sessão o vir e for da empresa dela. */
export async function getVipClient(scope: BoScope | null, id: string): Promise<VipClient | null> {
  if (!scope || !/^[0-9a-f-]{36}$/i.test(id)) return null
  let query = scope.db.from("vip_clients").select(COLUMNS).eq("id", id)
  if (scope.partnerId) query = query.eq("partner_id", scope.partnerId)
  const { data, error } = await query.maybeSingle()
  if (error || !data) return null
  return fromRow(data as Record<string, any>)
}

// ── o terminal ───────────────────────────────────────────────────────────────

export interface VipContext {
  vip: { id: string; name: string; email: string | null; phone: string | null; token: string }
  partner: { id: string; slug: string; name: string }
  brand: Brand
}

export type VipLookup = { ok: true; context: VipContext } | { ok: false }

/**
 * O link de um VIP, resolvido. "Não encontrado" (sem dizer porquê) quando o
 * token não existe, o VIP está desactivado, a empresa está suspensa ou não
 * tem o canal VIP ligado, ou o endereço é o de outra empresa (TEN-04).
 */
export const resolveVipLink = cache(async (token: string): Promise<VipLookup> => {
  const admin = createAdminClient()
  if (!admin || !VIP_TOKEN.test(token)) return { ok: false }

  const { data, error } = await admin
    .from("vip_clients")
    .select("id, name, email, phone, link_token, active, partner:partners(id, slug, commercial_name, status, channels)")
    .eq("link_token", token)
    .maybeSingle()
  if (error) {
    console.error("[vip] link ilegível:", error.message)
    return { ok: false }
  }
  const row = data as Record<string, any> | null
  const partner = row ? (Array.isArray(row.partner) ? row.partner[0] : row.partner) : null

  const host = hostPartnerSlug()
  if (
    !row ||
    !partner ||
    !row.active ||
    partner.status !== "active" ||
    /* B2G-02 · sem o canal VIP, o link não abre. */
    !hasChannel(partner.channels, "VIP") ||
    (host && host !== partner.slug)
  ) {
    return { ok: false }
  }

  return {
    ok: true,
    context: {
      vip: { id: row.id, name: row.name, email: row.email ?? null, phone: row.phone ?? null, token },
      partner: { id: partner.id, slug: partner.slug, name: partner.commercial_name },
      brand: await clientBrandForPartner(partner.id),
    },
  }
})
