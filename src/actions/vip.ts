"use server"

/**
 * WeeFly · B2G v2 · B2G-22 · as acções dos clientes VIP.
 *
 * "No menu VIP, o agente cria um cliente: nome, telefone, email. O cliente
 * recebe um link pessoal, opaco e permanente. O agente pode desativar um VIP;
 * o link deixa de funcionar e o histórico fica." (decisão D-9)
 *
 * Quem pode: qualquer conta do back-office da empresa (decisão 5 · o agente
 * da Alô cria VIPs), sempre na empresa da sessão e só com o canal VIP ligado
 * (B2G-02). A escrita vai pela service role — não há política de escrita em
 * `vip_clients` — e cada uma fica no registo de acessos (`vip_*`).
 */

import { randomBytes } from "crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity, type BoIdentity } from "@/lib/bo-access"
import { partnerHasChannel } from "@/lib/channel-gate"
import { getBoI18n } from "@/i18n/bo-server"

export type VipResult = { ok: true; id?: string; notice?: string } | { ok: false; error: string }

function mintVipToken(): string {
  /* 192 bits, como o token do /pc e o do ministério: sem nome, sem nada
     sequencial. */
  return randomBytes(24).toString("base64url")
}

function touch(id?: string) {
  revalidatePath("/agente/vip")
  revalidatePath("/gestao/vip")
  if (id) revalidatePath(`/agente/vip/${id}`)
}

/**
 * A conta, se puder gerir VIP na empresa dela: no back-office, com empresa, e
 * com o canal VIP ligado. A empresa é sempre a da sessão — nunca do browser.
 */
async function vipIdentity(): Promise<{ identity: BoIdentity; partnerId: string } | null> {
  const identity = await boIdentity()
  const partnerId = identity?.tenant?.partnerId
  if (!identity || !partnerId) return null
  if (identity.profile && !identity.profile.backoffice) return null
  if (!(await partnerHasChannel(partnerId, "VIP"))) return null
  return { identity, partnerId }
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

const vipSchema = z.object({
  name: z.string().trim().min(2, "bo.vip.errors.nameMissing").max(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.string().email().safeParse(v).success, "bo.vip.errors.emailInvalid"),
  phone: optional(40).refine((v) => v === null || /^\+?[0-9 ()-]{6,40}$/.test(v), "bo.vip.errors.phoneInvalid"),
  level: optional(60),
})

async function audit(
  identity: BoIdentity,
  partnerId: string,
  action: "vip_created" | "vip_updated" | "vip_deactivated" | "vip_reactivated",
  target: string,
  after?: Record<string, unknown>,
  before?: Record<string, unknown>
) {
  const admin = createAdminClient()
  if (!admin) return
  const { error } = await admin.from("access_audit").insert({
    actor_user_id: identity.userId,
    actor_email: identity.email,
    action,
    partner_id: partnerId,
    target,
    before: before ?? null,
    after: after ?? null,
  })
  if (error) console.error("[vip] registo falhou:", error.message)
}

/** B2G-22 · criar um cliente VIP, com o link pessoal dele. */
export async function createVipClient(input: z.input<typeof vipSchema>): Promise<VipResult> {
  const { t } = await getBoI18n()
  const who = await vipIdentity()
  if (!who) return { ok: false, error: t("bo.vip.errors.notAllowed") }

  const parsed = vipSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0]?.message ?? "bo.vip.errors.invalid") }
  const v = parsed.data

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.vip.errors.unavailable") }

  const { data, error } = await admin
    .from("vip_clients")
    .insert({
      partner_id: who.partnerId,
      name: v.name,
      email: v.email,
      phone: v.phone,
      level: v.level,
      link_token: mintVipToken(),
      created_by_email: who.identity.email,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[vip] criar falhou:", error?.message)
    return { ok: false, error: t("bo.vip.errors.saveFailed") }
  }

  const id = (data as { id: string }).id
  await audit(who.identity, who.partnerId, "vip_created", id, { name: v.name, email: v.email, phone: v.phone, level: v.level })
  touch(id)
  return { ok: true, id, notice: t("bo.vip.notice.created") }
}

/** O VIP, se for da empresa da sessão. Lido pela service role, filtrado aqui. */
async function ownVip(id: string, partnerId: string) {
  if (!z.string().uuid().safeParse(id).success) return null
  const admin = createAdminClient()
  if (!admin) return null
  const { data } = await admin
    .from("vip_clients")
    .select("id, partner_id, name, email, phone, level, active")
    .eq("id", id)
    .eq("partner_id", partnerId)
    .maybeSingle()
  return data as {
    id: string
    partner_id: string
    name: string
    email: string | null
    phone: string | null
    level: string | null
    active: boolean
  } | null
}

/** Corrigir o nome, o contacto ou o nível. O link não muda. */
export async function updateVipClient(id: string, input: z.input<typeof vipSchema>): Promise<VipResult> {
  const { t } = await getBoI18n()
  const who = await vipIdentity()
  if (!who) return { ok: false, error: t("bo.vip.errors.notAllowed") }
  const current = await ownVip(id, who.partnerId)
  if (!current) return { ok: false, error: t("bo.vip.errors.notFound") }

  const parsed = vipSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0]?.message ?? "bo.vip.errors.invalid") }
  const v = parsed.data

  const admin = createAdminClient()
  const { error } = await admin!
    .from("vip_clients")
    .update({ name: v.name, email: v.email, phone: v.phone, level: v.level })
    .eq("id", id)
    .eq("partner_id", who.partnerId)
  if (error) return { ok: false, error: t("bo.vip.errors.saveFailed") }

  await audit(
    who.identity,
    who.partnerId,
    "vip_updated",
    id,
    { name: v.name, email: v.email, phone: v.phone, level: v.level },
    { name: current.name, email: current.email, phone: current.phone, level: current.level }
  )
  touch(id)
  return { ok: true, id, notice: t("bo.vip.notice.updated") }
}

/**
 * Desactivar (o link deixa de abrir, o histórico fica) ou reactivar (o mesmo
 * link volta a abrir: é permanente).
 */
export async function setVipActive(id: string, active: boolean): Promise<VipResult> {
  const { t } = await getBoI18n()
  const who = await vipIdentity()
  if (!who) return { ok: false, error: t("bo.vip.errors.notAllowed") }
  const current = await ownVip(id, who.partnerId)
  if (!current) return { ok: false, error: t("bo.vip.errors.notFound") }
  if (current.active === active) return { ok: true, id }

  const admin = createAdminClient()
  const { error } = await admin!
    .from("vip_clients")
    .update(
      active
        ? { active: true, deactivated_at: null, deactivated_by_email: null }
        : { active: false, deactivated_at: new Date().toISOString(), deactivated_by_email: who.identity.email }
    )
    .eq("id", id)
    .eq("partner_id", who.partnerId)
  if (error) return { ok: false, error: t("bo.vip.errors.saveFailed") }

  await audit(who.identity, who.partnerId, active ? "vip_reactivated" : "vip_deactivated", id, { active }, { active: !active })
  touch(id)
  return { ok: true, id, notice: t(active ? "bo.vip.notice.reactivated" : "bo.vip.notice.deactivated") }
}
