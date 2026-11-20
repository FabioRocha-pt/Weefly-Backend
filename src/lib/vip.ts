/**
 * WeeFly · B2G v2 · B2G-22 · os clientes VIP.
 *
 * Um VIP é um cliente de uma empresa com um link pessoal: opaco, permanente,
 * e com a marca da empresa. O pedido entra na fila VIP da empresa
 * (`booking_cases.channel = 'vip'`, migração 0033).
 *
 * VIP-01 · o endereço é `/pc/<nome>-<código>` (`lib/vip-address`, 0043), e
 * abre a app do cliente (APP-01): Fazer pedido, Minhas passagens, Meus dados.
 * O `/vip/<token>` dos links já enviados continua a resolver, e redirecciona.
 *
 * Duas leituras, duas portas:
 *   · o terminal (`resolveVipHandle`, `resolveVipLink`) lê pela service role,
 *     como o `/pc` — o cliente não tem sessão, o endereço é a autorização;
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
import { isLocale, type Locale } from "@/i18n/config"
import { vipCodeOfHandle, vipHandle } from "@/lib/vip-address"

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
  /** VIP-01 · o código curto do endereço novo (0043). Vazio numa base sem ela. */
  code: string
  active: boolean
  deactivatedAt: string | null
  deactivatedByEmail: string | null
  createdByEmail: string | null
  createdAt: string
}

const BASE_COLUMNS =
  "id, partner_id, name, email, phone, level, link_token, active, deactivated_at, deactivated_by_email, created_by_email, created_at, partner:partners(commercial_name)"
/* VIP-01 · com o código (0043). Numa base sem ela a leitura repete-se sem ele
   (42703), e os links continuam a ser os antigos. */
const COLUMNS = `${BASE_COLUMNS}, code`

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
    code: row.code ?? "",
    active: Boolean(row.active),
    deactivatedAt: row.deactivated_at ?? null,
    deactivatedByEmail: row.deactivated_by_email ?? null,
    createdByEmail: row.created_by_email ?? null,
    createdAt: row.created_at,
  }
}

/**
 * VIP-01 · o caminho do link pessoal de um VIP: o endereço novo, ou o antigo
 * numa base que ainda não tem o código.
 */
export function vipClientPath(vip: Pick<VipClient, "name" | "code" | "token">): string {
  return vip.code ? `/pc/${vipHandle(vip)}` : `/vip/${vip.token}`
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
  const cross = Boolean(scope.identity.profile?.crossPartner)
  const run = (columns: string) => {
    let query = scope.db.from("vip_clients").select(columns).order("active", { ascending: false }).order("name").limit(500)
    if (opts.allPartners && cross) {
      if (opts.partnerId) query = query.eq("partner_id", opts.partnerId)
    } else if (scope.partnerId) {
      query = query.eq("partner_id", scope.partnerId)
    }
    if (opts.activeOnly) query = query.eq("active", true)
    return query
  }
  let { data, error } = await run(COLUMNS)
  if (error?.code === "42703") ({ data, error } = await run(BASE_COLUMNS))
  if (error) {
    /* Numa base sem a 0033 a tabela não existe: lista vazia, não um 500. */
    console.error("[vip] lista ilegível:", error.message)
    return []
  }
  let rows = ((data ?? []) as unknown as Record<string, any>[]).map(fromRow)
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
  const run = (columns: string) => {
    let query = scope.db.from("vip_clients").select(columns).eq("id", id)
    if (scope.partnerId) query = query.eq("partner_id", scope.partnerId)
    return query.maybeSingle()
  }
  let { data, error } = await run(COLUMNS)
  if (error?.code === "42703") ({ data, error } = await run(BASE_COLUMNS))
  if (error || !data) return null
  return fromRow(data as unknown as Record<string, any>)
}

// ── APP-04 · o registo das alterações, para a ficha do agente ────────────────

export interface VipChange {
  id: string
  actorKind: "client" | "staff"
  actorEmail: string | null
  source: "profile" | "request" | "backoffice"
  fields: string[]
  before: Record<string, string | null>
  after: Record<string, string | null>
  createdAt: string
}

/**
 * "Cada alteração fica registada, com a data, e aparece ao agente na ficha do
 * cliente." Lido pela sessão (o RLS da 0043 decide). Vazio numa base sem ela.
 */
export async function listVipChanges(scope: BoScope | null, vipClientId: string, limit = 30): Promise<VipChange[]> {
  if (!scope) return []
  const { data, error } = await scope.db
    .from("vip_client_changes")
    .select("id, actor_kind, actor_email, source, fields, before, after, created_at")
    .eq("vip_client_id", vipClientId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) return []
  return ((data ?? []) as Record<string, any>[]).map((row) => ({
    id: row.id,
    actorKind: row.actor_kind === "staff" ? "staff" : "client",
    actorEmail: row.actor_email ?? null,
    source: row.source,
    fields: Array.isArray(row.fields) ? row.fields : [],
    before: (row.before ?? {}) as Record<string, string | null>,
    after: (row.after ?? {}) as Record<string, string | null>,
    createdAt: row.created_at,
  }))
}

// ── o terminal ───────────────────────────────────────────────────────────────

/**
 * APP-04 · os dados do cliente para a passagem. São os campos de
 * `case_passengers`, guardados uma vez em `vip_clients` (0043): preenchem o
 * primeiro passageiro de cada pedido.
 */
export interface VipProfile {
  title: "mr" | "mrs" | "ms" | null
  givenNames: string | null
  surname: string | null
  birthDate: string | null
  gender: "m" | "f" | null
  nationality: string | null
  passportNumber: string | null
  passportExpiry: string | null
  issuingCountry: string | null
  /** O consentimento do próprio cliente para guardar o passaporte. */
  passportConsentAt: string | null
  updatedAt: string | null
}

export interface VipContext {
  vip: {
    id: string
    name: string
    email: string | null
    phone: string | null
    /** O token do link antigo: é ele que o intake resolve. Nunca vai no endereço novo. */
    token: string
    code: string
    /** APP-01 · a língua que o cliente escolheu em Meus dados. Nula: a da empresa. */
    locale: Locale | null
    profile: VipProfile
  }
  partner: {
    id: string
    slug: string
    name: string
    isOperator: boolean
    defaultLocale: Locale | null
    /** O país da empresa (ISO-2): decide a cidade do fundo antes de haver partida (IMG-01). */
    country: string | null
    /** APP-04 · "a empresa que acompanha o cliente, com o WhatsApp e o email". */
    whatsapp: string | null
    email: string | null
  }
  brand: Brand
  /** VIP-01 · `/pc/<nome>-<código>`: a raiz da app deste cliente. */
  base: string
}

export type VipLookup = { ok: true; context: VipContext } | { ok: false }

const PARTNER_BASE =
  "id, slug, commercial_name, status, channels, is_operator, country, whatsapp_number, contact_phone, contact_email, reply_to, sender_email"
const TERMINAL_BASE = `id, name, email, phone, link_token, active, partner:partners(${PARTNER_BASE})`
const TERMINAL_COLUMNS = `id, name, email, phone, link_token, active, code, locale, title, given_names, surname, birth_date, gender, nationality, passport_number, passport_expiry, issuing_country, passport_consent_at, profile_updated_at, partner:partners(${PARTNER_BASE}, default_locale)`

function profileOf(row: Record<string, any>): VipProfile {
  return {
    title: row.title === "mr" || row.title === "mrs" || row.title === "ms" ? row.title : null,
    givenNames: row.given_names ?? null,
    surname: row.surname ?? null,
    birthDate: row.birth_date ?? null,
    gender: row.gender === "m" || row.gender === "f" ? row.gender : null,
    nationality: row.nationality ?? null,
    passportNumber: row.passport_number ?? null,
    passportExpiry: row.passport_expiry ?? null,
    issuingCountry: row.issuing_country ?? null,
    passportConsentAt: row.passport_consent_at ?? null,
    updatedAt: row.profile_updated_at ?? null,
  }
}

/**
 * Um VIP, lido pela service role e verificado: "não encontrado" (sem dizer
 * porquê) quando não existe, está desactivado, a empresa está suspensa ou não
 * tem o canal VIP ligado, ou o endereço é o de outra empresa (TEN-04).
 */
async function loadVipTerminal(column: "link_token" | "code", value: string): Promise<VipLookup> {
  const admin = createAdminClient()
  if (!admin) return { ok: false }

  let { data, error } = await admin.from("vip_clients").select(TERMINAL_COLUMNS).eq(column, value).maybeSingle()
  if (error?.code === "42703" && column === "link_token") {
    /* Uma base sem a 0043: o link antigo continua a resolver, sem perfil. */
    ;({ data, error } = (await admin.from("vip_clients").select(TERMINAL_BASE).eq(column, value).maybeSingle()) as any)
  }
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

  const code = String(row.code ?? "")
  return {
    ok: true,
    context: {
      vip: {
        id: row.id,
        name: row.name,
        email: row.email ?? null,
        phone: row.phone ?? null,
        token: row.link_token,
        code,
        locale: isLocale(row.locale) ? row.locale : null,
        profile: profileOf(row),
      },
      partner: {
        id: partner.id,
        slug: partner.slug,
        name: partner.commercial_name,
        isOperator: Boolean(partner.is_operator),
        defaultLocale: isLocale(partner.default_locale) ? partner.default_locale : null,
        country: partner.country ?? null,
        whatsapp: partner.whatsapp_number ?? partner.contact_phone ?? null,
        email: partner.reply_to ?? partner.contact_email ?? partner.sender_email ?? null,
      },
      brand: await clientBrandForPartner(partner.id),
      base: code ? `/pc/${vipHandle({ name: row.name, code })}` : `/vip/${row.link_token}`,
    },
  }
}

/** O link antigo de um VIP (`/vip/<token>`), resolvido. É também o que o intake usa. */
export const resolveVipLink = cache(async (token: string): Promise<VipLookup> => {
  if (!VIP_TOKEN.test(token)) return { ok: false }
  return loadVipTerminal("link_token", token)
})

/**
 * VIP-01 · o endereço novo, resolvido: `/pc/<nome>-<código>`.
 *
 * Só o código decide. O nome é a parte que se lê, e por isso não se verifica:
 * um nome corrigido no back-office não parte o link que o cliente já guardou
 * nem a app que já instalou ("o código não muda quando o nome é editado").
 */
export const resolveVipHandle = cache(async (handle: string): Promise<VipLookup> => {
  const code = vipCodeOfHandle(handle)
  if (!code) return { ok: false }
  return loadVipTerminal("code", code)
})

/** A língua da app de um VIP: a que ele escolheu, senão a da empresa, senão português. */
export function vipLocale(context: VipContext): Locale {
  return context.vip.locale ?? context.partner.defaultLocale ?? "pt"
}
