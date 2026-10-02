/**
 * WeeFly · MVP 2 · ADM-02 · ADM-01 · o que os ecrãs de gestão precisam.
 *
 * Tudo lido pelo cliente da sessão: é o RLS da 0020 e da 0026 que decide o que
 * cada um vê. Um Admin WeeFly vê todos os parceiros e todas as contas; um
 * Admin do parceiro, só as do seu — e esta leitura não precisa de saber qual
 * dos dois é.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { getBoScope } from "@/lib/bo-scope"
import {
  ACCESS_ROLE_COLUMNS,
  profileFromRow,
  unwrapOne,
  type AccessProfile,
  type AccessRoleRow,
} from "@/lib/access-roles"
import type { BoIdentity } from "@/lib/bo-access"

export interface AdminPartner {
  id: string
  slug: string
  commercialName: string
  legalName: string | null
  nif: string | null
  country: string | null
  address: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  contractStart: string | null
  status: "active" | "suspended"
  suspendReason: string | null
  isOperator: boolean
  supplyEnabled: boolean
  sellEnabled: boolean
  sellMode: "reseller" | "white_label" | null
  channels: string[]
  customerFront: "own" | "weefly"
  agentMenus: string[]
  logoUrl: string | null
  colorPrimary: string | null
  colorDark: string | null
  /* OCT-13 · SEO-02 · SEO-04 · migração 0031. */
  colorAccent: string | null
  iconUrl: string | null
  iconsBaseUrl: string | null
  ogImageUrl: string | null
  brandVersion: number
  seoTitle: string | null
  seoDescription: string | null
  senderName: string | null
  senderEmail: string | null
  replyTo: string | null
  footerText: string | null
  poweredByWeefly: boolean
  whatsappNumber: string | null
  createdAt: string
}

export interface AdminUser {
  email: string
  label: string | null
  roleId: string
  partnerId: string
  organisationId: string | null
  agentMenus: string[] | null
  active: boolean
  suspendedAt: string | null
  suspendedBy: string | null
  suspendReason: string | null
  createdAt: string
}

export interface AdminOrganisation {
  id: string
  partnerId: string
  name: string
}

export interface AuditEntry {
  id: string
  createdAt: string
  actorEmail: string
  action: string
  partnerId: string | null
  target: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string | null
}

export interface AccessAdminData {
  identity: BoIdentity
  actor: AccessProfile
  roles: AccessProfile[]
  partners: AdminPartner[]
  users: AdminUser[]
  organisations: AdminOrganisation[]
  audit: AuditEntry[]
}

export const PARTNER_ADMIN_COLUMNS =
  "id, slug, commercial_name, legal_name, nif, country, address, contact_name, contact_email, contact_phone, contract_start, status, suspend_reason, is_operator, supply_enabled, sell_enabled, sell_mode, channels, customer_front, agent_menus, logo_url, color_primary, color_dark, color_accent, icon_url, icons_base_url, og_image_url, brand_version, seo_title, seo_description, sender_name, sender_email, reply_to, footer_text, powered_by_weefly, whatsapp_number, created_at"

export function partnerFromAdminRow(r: Record<string, any>): AdminPartner {
  return {
    id: r.id,
    slug: r.slug,
    commercialName: r.commercial_name,
    legalName: r.legal_name ?? null,
    nif: r.nif ?? null,
    country: r.country ?? null,
    address: r.address ?? null,
    contactName: r.contact_name ?? null,
    contactEmail: r.contact_email ?? null,
    contactPhone: r.contact_phone ?? null,
    contractStart: r.contract_start ?? null,
    status: r.status,
    suspendReason: r.suspend_reason ?? null,
    isOperator: Boolean(r.is_operator),
    supplyEnabled: Boolean(r.supply_enabled),
    sellEnabled: Boolean(r.sell_enabled),
    sellMode: r.sell_mode ?? null,
    channels: r.channels ?? [],
    customerFront: r.customer_front ?? "own",
    agentMenus: r.agent_menus ?? [],
    logoUrl: r.logo_url ?? null,
    colorPrimary: r.color_primary ?? null,
    colorDark: r.color_dark ?? null,
    colorAccent: r.color_accent ?? null,
    iconUrl: r.icon_url ?? null,
    iconsBaseUrl: r.icons_base_url ?? null,
    ogImageUrl: r.og_image_url ?? null,
    brandVersion: r.brand_version ?? 1,
    seoTitle: r.seo_title ?? null,
    seoDescription: r.seo_description ?? null,
    senderName: r.sender_name ?? null,
    senderEmail: r.sender_email ?? null,
    replyTo: r.reply_to ?? null,
    footerText: r.footer_text ?? null,
    poweredByWeefly: r.powered_by_weefly !== false,
    whatsappNumber: r.whatsapp_number ?? null,
    createdAt: r.created_at,
  }
}

/**
 * Os dados dos ecrãs de gestão, ou `null` quando a sessão não gere ninguém.
 *
 * `null` e não um erro: a página responde com 404 (TEN-06 · "inacessíveis pelo
 * endereço direto").
 */
export const loadAccessAdmin = cache(async (): Promise<AccessAdminData | null> => {
  const scope = await getBoScope()
  const actor = scope?.identity.profile
  if (!scope || !actor || actor.manageUsers === "none") return null

  const { db } = scope

  const [rolesRes, partnersRes, usersRes, orgsRes, auditRes] = await Promise.all([
    db.from("access_roles").select(ACCESS_ROLE_COLUMNS).order("sort"),
    db.from("partners").select(PARTNER_ADMIN_COLUMNS).order("is_operator", { ascending: false }).order("commercial_name"),
    db
      .from("bo_allowlist")
      .select(
        "email, label, role_id, partner_id, organisation_id, agent_menus, active, suspended_at, suspended_by, suspend_reason, created_at"
      )
      .order("active", { ascending: false })
      .order("label", { ascending: true, nullsFirst: false }),
    db.from("organisations").select("id, partner_id, name").order("name"),
    db
      .from("access_audit")
      .select("id, created_at, actor_email, action, partner_id, target, before, after, reason")
      .order("created_at", { ascending: false })
      .limit(200),
  ])

  const failed = [rolesRes, partnersRes, usersRes, orgsRes, auditRes].find((r) => r.error)
  if (failed?.error) {
    console.error("[gestão] leitura falhou:", failed.error.message)
    return null
  }

  return {
    identity: scope.identity,
    actor,
    roles: ((rolesRes.data ?? []) as unknown as AccessRoleRow[])
      .map((r) => profileFromRow(unwrapOne(r)))
      .filter((r): r is AccessProfile => Boolean(r)),
    partners: ((partnersRes.data ?? []) as Record<string, any>[]).map(partnerFromAdminRow),
    users: ((usersRes.data ?? []) as Record<string, any>[]).map((u) => ({
      email: u.email,
      label: u.label ?? null,
      roleId: u.role_id,
      partnerId: u.partner_id,
      organisationId: u.organisation_id ?? null,
      agentMenus: u.agent_menus ?? null,
      active: Boolean(u.active),
      suspendedAt: u.suspended_at ?? null,
      suspendedBy: u.suspended_by ?? null,
      suspendReason: u.suspend_reason ?? null,
      createdAt: u.created_at,
    })),
    organisations: ((orgsRes.data ?? []) as Record<string, any>[]).map((o) => ({
      id: o.id,
      partnerId: o.partner_id,
      name: o.name,
    })),
    audit: ((auditRes.data ?? []) as Record<string, any>[]).map((a) => ({
      id: a.id,
      createdAt: a.created_at,
      actorEmail: a.actor_email,
      action: a.action,
      partnerId: a.partner_id ?? null,
      target: a.target,
      before: a.before ?? null,
      after: a.after ?? null,
      reason: a.reason ?? null,
    })),
  }
})
