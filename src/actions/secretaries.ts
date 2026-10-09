"use server"

/**
 * WeeFly · B2G v2 · B2G-06 · as secretárias de um ministério.
 *
 * "A WeeFly ou a empresa cria a secretária no menu Ministérios, ligada a um
 * ministério. Cada secretária recebe um link pessoal e um PIN de 6 dígitos
 * gerado pelo sistema, mostrado uma só vez a quem a criou. Fica registado
 * quem gerou o PIN. PIN esquecido: quem a criou gera um novo, e o antigo
 * deixa de funcionar. Desativar corta o acesso de imediato; o histórico fica."
 *
 * Quem pode (decisão 5): a WeeFly (`cross_partner`), e qualquer conta do
 * back-office da empresa do ministério (Admin ou agente). Gerar um PIN novo:
 * quem criou a secretária, um Admin da empresa, ou a WeeFly.
 *
 * O PIN volta **só** na resposta destas acções, para o ecrã de quem o gerou o
 * mostrar uma vez. Não é guardado em claro, não vai por email, não vai para o
 * `access_audit` nem para nenhum log.
 *
 * As escritas vão pela service role (não há política de escrita nas tabelas
 * das secretárias), depois desta verificação.
 */

import { randomBytes } from "crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity, type BoIdentity } from "@/lib/bo-access"
import { partnerHasChannel } from "@/lib/channel-gate"
import { generatePin, hashPin } from "@/lib/secretary-auth"
import { ministryLink, sendMinistryWelcome } from "@/lib/emails/ministry-welcome"
import { getBoI18n } from "@/i18n/bo-server"

export type SecretaryResult =
  | { ok: true; notice?: string; id?: string; pin?: string; link?: string }
  | { ok: false; error: string }

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

function mintLinkToken(): string {
  /* 192 bits, como o do /pc e o do VIP: sem nome, sem nada sequencial. */
  return randomBytes(24).toString("base64url")
}

function touch(orgId: string) {
  revalidatePath(`/agente/ministerios/${orgId}`)
  revalidatePath(`/gestao/b2g/m/${orgId}`)
  revalidatePath("/admin/price-checker", "layout")
}

interface OrgRow {
  id: string
  partner_id: string
  slug: string
  name: string
  active: boolean
  partner: { id: string; slug: string; is_operator: boolean }
}

/**
 * O ministério, se esta conta puder gerir as secretárias dele: do back-office,
 * da empresa do ministério (ou WeeFly), e com o canal Ministérios ligado.
 */
async function manageableOrg(admin: Admin, identity: BoIdentity, orgId: string): Promise<OrgRow | null> {
  if (!z.string().uuid().safeParse(orgId).success) return null
  if (!identity.profile?.backoffice) return null
  const { data } = await admin
    .from("organisations")
    .select("id, partner_id, slug, name, active, partner:partners(id, slug, is_operator)")
    .eq("id", orgId)
    .maybeSingle()
  const row = data as Record<string, any> | null
  if (!row) return null
  const crossPartner = Boolean(identity.profile.crossPartner)
  if (!crossPartner && identity.tenant?.partnerId !== row.partner_id) return null
  if (!(await partnerHasChannel(row.partner_id, "B2G"))) return null
  return { ...row, partner: Array.isArray(row.partner) ? row.partner[0] : row.partner } as OrgRow
}

async function secretaryRow(admin: Admin, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null
  const { data } = await admin
    .from("ministry_secretaries")
    .select("id, organisation_id, partner_id, name, email, phone, active, link_token, created_by_email")
    .eq("id", id)
    .maybeSingle()
  return data as {
    id: string
    organisation_id: string
    partner_id: string
    name: string
    email: string | null
    phone: string | null
    active: boolean
    link_token: string
    created_by_email: string
  } | null
}

async function audit(
  admin: Admin,
  identity: BoIdentity,
  partnerId: string,
  action:
    | "secretary_created"
    | "secretary_updated"
    | "secretary_pin_generated"
    | "secretary_deactivated"
    | "secretary_reactivated",
  target: string,
  after?: Record<string, unknown>,
  before?: Record<string, unknown>
) {
  const { error } = await admin.from("access_audit").insert({
    actor_user_id: identity.userId,
    actor_email: identity.email,
    action,
    partner_id: partnerId,
    target,
    before: before ?? null,
    after: after ?? null,
  })
  if (error) console.error("[secretárias] registo falhou:", error.message)
}

/** Um PIN novo: gerado, em hash, gravado (versão sobe, sessões morrem). */
async function issuePin(admin: Admin, secretaryId: string, by: string): Promise<string | null> {
  const pin = generatePin()
  const { error } = await admin.rpc("secretary_set_pin", {
    p_secretary: secretaryId,
    p_hash: await hashPin(pin),
    p_by: by,
  })
  if (error) {
    console.error("[secretárias] PIN não gravado:", error.code)
    return null
  }
  return pin
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

const secretarySchema = z.object({
  name: z.string().trim().min(2, "bo.secretaries.errors.nameMissing").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.string().email().safeParse(v).success, "bo.secretaries.errors.emailInvalid"),
  phone: optional(40).refine((v) => v === null || /^\+?[0-9 ()-]{6,40}$/.test(v), "bo.secretaries.errors.phoneInvalid"),
})

/** B2G-06 · criar a secretária: link pessoal + PIN (mostrado uma vez). */
export async function createSecretary(
  orgId: string,
  input: z.input<typeof secretarySchema> & { sendWelcome?: boolean }
): Promise<SecretaryResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  const admin = createAdminClient()
  if (!identity || !admin) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }
  const org = await manageableOrg(admin, identity, orgId)
  if (!org) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }
  if (!org.active) return { ok: false, error: t("bo.secretaries.errors.orgInactive") }

  const parsed = secretarySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0]?.message ?? "bo.secretaries.errors.invalid") }
  const v = parsed.data

  const linkToken = mintLinkToken()
  const { data, error } = await admin
    .from("ministry_secretaries")
    .insert({
      organisation_id: org.id,
      partner_id: org.partner_id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      link_token: linkToken,
      created_by_email: identity.email,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[secretárias] criar falhou:", error?.code)
    return { ok: false, error: t("bo.secretaries.errors.saveFailed") }
  }
  const id = (data as { id: string }).id
  await audit(admin, identity, org.partner_id, "secretary_created", id, {
    organisation_id: org.id,
    name: v.name,
    email: v.email,
    phone: v.phone,
  })

  const pin = await issuePin(admin, id, identity.email)
  if (!pin) return { ok: false, error: t("bo.secretaries.errors.pinFailed") }
  await audit(admin, identity, org.partner_id, "secretary_pin_generated", id, { organisation_id: org.id, first: true })

  let notice = t("bo.secretaries.notice.created")
  if (input.sendWelcome && v.email) {
    const sent = await sendMinistryWelcome(id)
    notice += " " + (sent.ok ? t("bo.secretaries.notice.welcomeSent") : t("bo.secretaries.notice.welcomeFailed", { reason: sent.reason }))
  }

  touch(org.id)
  return { ok: true, id, pin, link: ministryLink(org.partner, { slug: org.slug, link_token: linkToken }), notice }
}

/**
 * PIN esquecido: um novo, e o antigo deixa de funcionar (as sessões abertas
 * com ele morrem). Quem a criou, um Admin da empresa, ou a WeeFly.
 */
export async function regenerateSecretaryPin(secretaryId: string): Promise<SecretaryResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  const admin = createAdminClient()
  if (!identity || !admin) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }
  const sec = await secretaryRow(admin, secretaryId)
  if (!sec) return { ok: false, error: t("bo.secretaries.errors.notFound") }
  const org = await manageableOrg(admin, identity, sec.organisation_id)
  if (!org) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }

  const isCreator = sec.created_by_email.toLowerCase() === identity.email.toLowerCase()
  const isManager = identity.profile?.manageUsers !== "none"
  if (!identity.profile?.crossPartner && !isManager && !isCreator) {
    return { ok: false, error: t("bo.secretaries.errors.pinNotAllowed") }
  }
  if (!sec.active) return { ok: false, error: t("bo.secretaries.errors.inactive") }

  const pin = await issuePin(admin, sec.id, identity.email)
  if (!pin) return { ok: false, error: t("bo.secretaries.errors.pinFailed") }
  await audit(admin, identity, sec.partner_id, "secretary_pin_generated", sec.id, { organisation_id: sec.organisation_id })

  touch(sec.organisation_id)
  return { ok: true, id: sec.id, pin, notice: t("bo.secretaries.notice.pinRegenerated") }
}

/** Corrigir o nome ou o contacto. O link não muda. */
export async function updateSecretary(secretaryId: string, input: z.input<typeof secretarySchema>): Promise<SecretaryResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  const admin = createAdminClient()
  if (!identity || !admin) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }
  const sec = await secretaryRow(admin, secretaryId)
  if (!sec) return { ok: false, error: t("bo.secretaries.errors.notFound") }
  if (!(await manageableOrg(admin, identity, sec.organisation_id))) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }

  const parsed = secretarySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0]?.message ?? "bo.secretaries.errors.invalid") }
  const v = parsed.data

  const { error } = await admin
    .from("ministry_secretaries")
    .update({ name: v.name, email: v.email, phone: v.phone })
    .eq("id", sec.id)
  if (error) return { ok: false, error: t("bo.secretaries.errors.saveFailed") }

  await audit(
    admin,
    identity,
    sec.partner_id,
    "secretary_updated",
    sec.id,
    { name: v.name, email: v.email, phone: v.phone },
    { name: sec.name, email: sec.email, phone: sec.phone }
  )
  touch(sec.organisation_id)
  return { ok: true, id: sec.id, notice: t("bo.secretaries.notice.updated") }
}

/**
 * Desactivar corta o acesso de imediato (o gatilho da 0034 apaga as sessões
 * abertas); os pedidos dela ficam. Reactivar devolve o mesmo link, e o PIN
 * que tinha.
 */
export async function setSecretaryActive(secretaryId: string, active: boolean): Promise<SecretaryResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  const admin = createAdminClient()
  if (!identity || !admin) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }
  const sec = await secretaryRow(admin, secretaryId)
  if (!sec) return { ok: false, error: t("bo.secretaries.errors.notFound") }
  if (!(await manageableOrg(admin, identity, sec.organisation_id))) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }
  if (sec.active === active) return { ok: true, id: sec.id }

  const { error } = await admin
    .from("ministry_secretaries")
    .update(
      active
        ? { active: true, deactivated_at: null, deactivated_by_email: null }
        : { active: false, deactivated_at: new Date().toISOString(), deactivated_by_email: identity.email }
    )
    .eq("id", sec.id)
  if (error) return { ok: false, error: t("bo.secretaries.errors.saveFailed") }

  await audit(admin, identity, sec.partner_id, active ? "secretary_reactivated" : "secretary_deactivated", sec.id, { active }, { active: !active })
  touch(sec.organisation_id)
  return { ok: true, id: sec.id, notice: t(active ? "bo.secretaries.notice.reactivated" : "bo.secretaries.notice.deactivated") }
}

/** Reenviar o email de boas-vindas (só o link; o PIN nunca vai por email). */
export async function resendSecretaryWelcome(secretaryId: string): Promise<SecretaryResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  const admin = createAdminClient()
  if (!identity || !admin) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }
  const sec = await secretaryRow(admin, secretaryId)
  if (!sec) return { ok: false, error: t("bo.secretaries.errors.notFound") }
  if (!(await manageableOrg(admin, identity, sec.organisation_id))) return { ok: false, error: t("bo.secretaries.errors.notAllowed") }
  const sent = await sendMinistryWelcome(sec.id)
  return sent.ok
    ? { ok: true, id: sec.id, notice: t("bo.secretaries.notice.welcomeSent") }
    : { ok: false, error: t("bo.secretaries.notice.welcomeFailed", { reason: sent.reason }) }
}
