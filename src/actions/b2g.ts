"use server"

/**
 * WeeFly · MVP 2 · B2G · as acções dos ministérios e da bolsa.
 *
 * PAR-02 · gerir ministérios (B2G-23 · criar é só da WeeFly; a empresa pede).
 * PAR-03 · crédito manual (reforço), com a referência do documento.
 * PAR-04 · B2G-06 · as secretárias passaram para `actions/secretaries` (uma
 *          por pessoa, com link pessoal e PIN).
 * PAR-05 · o limite de alerta.
 * PAR-07 · confirmar o pagamento externo (desconta da bolsa e liberta a
 *          emissão) e revertê-lo (repõe o saldo).
 * ADM-06 · os destinatários dos alertas.
 * ADM-08 · a correcção de saldo pelo Admin WeeFly, com motivo, registada.
 *
 * Quem pode o quê vem do perfil (ADM-02), e cada ministério é aberto primeiro
 * pelo cliente da sessão — um ministério de outro parceiro não existe aqui.
 * As escritas na bolsa vão pela service role (não há política de escrita nos
 * movimentos): é o servidor que decide, e a função `budget_debit` que garante
 * que o saldo cobre.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity, type BoIdentity } from "@/lib/bo-access"
import { boCaseIdentity, getBoScope } from "@/lib/bo-scope"
import { partnerHasChannel } from "@/lib/channel-gate"
import { applyPaymentStatus } from "@/lib/payments"
import { logCaseEvent } from "@/lib/case-events"
import { parseMoney } from "@/lib/proposal-math"
import { checkBudgetAlert } from "@/lib/budget-alerts"
import { getBoI18n } from "@/i18n/bo-server"
import { translateMessage } from "@/i18n/translate"

export type B2gResult = { ok: true; notice?: string } | { ok: false; error: string }

const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

function touch(orgId?: string) {
  revalidatePath("/agente/ministerios")
  revalidatePath("/gestao/b2g", "layout")
  if (orgId) revalidatePath(`/agente/ministerios/${orgId}`)
}

/** Um administrador (do parceiro, ou WeeFly): quem gere ministérios e bolsas. */
function isManager(identity: BoIdentity | null): identity is BoIdentity {
  return Boolean(identity?.profile && identity.profile.manageUsers !== "none")
}

/**
 * O ministério, visto pela sessão. `null` se o RLS não o mostrar — ou se a
 * empresa dele não tiver o canal Ministérios ligado (B2G-02): desligado, o
 * ministério deixa de existir para todas as acções daqui.
 */
async function visibleOrg(orgId: string) {
  if (!z.string().uuid().safeParse(orgId).success) return null
  const scope = await getBoScope()
  if (!scope) return null
  let q = scope.db
    .from("organisations")
    .select("id, partner_id, slug, name, secretary_email, secretary_name, currency")
    .eq("id", orgId)
  /* No Admin WeeFly a área é "todos"; num parceiro, só o seu. */
  if (scope.partnerId && !scope.identity.profile?.crossPartner) q = q.eq("partner_id", scope.partnerId)
  const { data } = await q.maybeSingle()
  if (!data || !(await partnerHasChannel((data as { partner_id: string }).partner_id, "B2G"))) return null
  return data as {
    id: string
    partner_id: string
    slug: string
    name: string
    secretary_email: string | null
    secretary_name: string | null
    currency: string
  } | null
}

// ── PAR-02 · B2G-23 · ministérios ────────────────────────────────────────────
//
// D-10 · a empresa não cria nem renomeia ministérios: pede-os ao master
// (`actions/ministry-requests`). Aqui, a empresa muda só o que não é
// identidade (limites, o que a secretária vê); a WeeFly (`cross_partner`)
// cria ministérios directamente no Admin e muda tudo. O RLS e o gatilho da
// 0034 dizem o mesmo por baixo.

const orgSchema = z.object({
  id: z.string().uuid().optional(),
  /** Só a WeeFly: a empresa onde nasce o ministério (no Admin). */
  partnerId: z.string().uuid().optional(),
  name: z.string().trim().min(2, "bo.b2g.errors.nameMissing").max(160),
  slug: z.string().trim().toLowerCase().regex(SLUG, "bo.b2g.errors.slugShape"),
  logoUrl: z.string().trim().max(500).optional().transform((v) => v || null),
  crestUrl: z.string().trim().max(500).optional().transform((v) => v || null),
  alertThresholdAmount: z.string().trim().max(30).optional(),
  alertThresholdPercent: z.string().trim().max(10).optional(),
  secretarySeesBalance: z.boolean().optional(),
})

export async function saveOrganisation(input: z.input<typeof orgSchema>): Promise<B2gResult & { id?: string }> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  if (!isManager(identity) || !identity.tenant) return { ok: false, error: t("bo.b2g.errors.onlyManagers") }
  const crossPartner = Boolean(identity.profile?.crossPartner)

  const parsed = orgSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.b2g.errors.invalid") }
  }
  const v = parsed.data

  const amount = v.alertThresholdAmount ? parseMoney(v.alertThresholdAmount) : null
  const percent = v.alertThresholdPercent ? Number(v.alertThresholdPercent.replace(",", ".")) : null
  if (percent != null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
    return { ok: false, error: t("bo.b2g.errors.percentRange") }
  }

  /* O que a empresa pode mudar. */
  const settings = {
    alert_threshold_amount: amount,
    alert_threshold_percent: amount != null ? null : percent,
    secretary_sees_balance: Boolean(v.secretarySeesBalance),
  }
  /* B2G-05 · a identidade do ministério: só a WeeFly. */
  const identityFields = {
    name: v.name,
    slug: v.slug,
    logo_url: v.logoUrl,
    crest_url: v.crestUrl,
  }

  const db = createClient()
  if (v.id) {
    const org = await visibleOrg(v.id)
    if (!org) return { ok: false, error: t("bo.b2g.errors.notFound") }
    const { error } = await db
      .from("organisations")
      .update(crossPartner ? { ...settings, ...identityFields } : settings)
      .eq("id", v.id)
    if (error) return { ok: false, error: error.code === "23505" ? t("bo.b2g.errors.slugTaken") : error.message }
    await audit(identity, org.partner_id, "organisation_updated", org.slug)
    touch(v.id)
    return { ok: true, notice: t("bo.b2g.notice.saved"), id: v.id }
  }

  /* D-10 · criar directamente é só da WeeFly (no Admin, para qualquer
     empresa). As outras empresas pedem (`requestMinistry`). */
  if (!crossPartner) return { ok: false, error: t("bo.ministryRequests.errors.onlyMaster") }
  const partnerId = v.partnerId ?? identity.tenant.partnerId
  if (!(await partnerHasChannel(partnerId, "B2G"))) {
    return { ok: false, error: t("bo.b2g.errors.channelOff") }
  }
  const { data, error } = await db
    .from("organisations")
    .insert({
      ...settings,
      ...identityFields,
      partner_id: partnerId,
      created_by_email: identity.email,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.code === "23505" ? t("bo.b2g.errors.slugTaken") : error.message }
  const id = (data as { id: string }).id

  await audit(identity, partnerId, "organisation_created", v.slug)
  touch(id)
  return { ok: true, notice: t("bo.b2g.notice.created"), id }
}

// ── PAR-03 · a bolsa ─────────────────────────────────────────────────────────

const creditSchema = z.object({
  orgId: z.string().uuid(),
  amount: z.string().trim().min(1, "bo.b2g.errors.amountMissing"),
  documentRef: z.string().trim().min(2, "bo.b2g.errors.documentMissing").max(200),
  reason: z.string().trim().max(500).optional(),
})

/** Crédito manual: o ministério reforçou. Leva a referência do documento. */
export async function creditBudget(input: z.input<typeof creditSchema>): Promise<B2gResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  if (!isManager(identity)) return { ok: false, error: t("bo.b2g.errors.onlyManagers") }

  const parsed = creditSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.b2g.errors.invalid") }
  }
  const v = parsed.data
  const amount = parseMoney(v.amount)
  if (!(amount > 0)) return { ok: false, error: t("bo.b2g.errors.amountMissing") }

  const org = await visibleOrg(v.orgId)
  if (!org) return { ok: false, error: t("bo.b2g.errors.notFound") }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.b2g.errors.unavailable") }
  const { error } = await admin.from("budget_movements").insert({
    organisation_id: org.id,
    partner_id: org.partner_id,
    kind: "credit",
    delta: amount,
    currency: org.currency,
    document_ref: v.documentRef,
    reason: v.reason || null,
    created_by: identity.userId,
    created_by_email: identity.email,
  })
  if (error) return { ok: false, error: error.message }

  touch(org.id)
  return { ok: true, notice: t("bo.b2g.notice.credited") }
}

const adjustSchema = z.object({
  orgId: z.string().uuid(),
  /** Com sinal: "-5000" tira, "5000" põe. */
  amount: z.string().trim().min(1, "bo.b2g.errors.amountMissing"),
  reason: z.string().trim().min(3, "bo.b2g.errors.reasonMissing").max(500),
})

/**
 * ADM-08 · corrigir um saldo. Só o Admin WeeFly, com motivo, e registado duas
 * vezes: como movimento da bolsa (o saldo) e no registo das intervenções.
 */
export async function adjustBudget(input: z.input<typeof adjustSchema>): Promise<B2gResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  if (!identity?.profile?.crossPartner || identity.profile.manageUsers !== "all") {
    return { ok: false, error: t("bo.b2g.errors.onlyWeefly") }
  }
  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.b2g.errors.invalid") }
  }
  const v = parsed.data
  const negative = v.amount.trim().startsWith("-")
  const amount = parseMoney(v.amount.replace(/^-/, ""))
  if (!(amount > 0)) return { ok: false, error: t("bo.b2g.errors.amountMissing") }

  const org = await visibleOrg(v.orgId)
  if (!org) return { ok: false, error: t("bo.b2g.errors.notFound") }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.b2g.errors.unavailable") }
  const { error } = await admin.from("budget_movements").insert({
    organisation_id: org.id,
    partner_id: org.partner_id,
    kind: "adjustment",
    delta: negative ? -amount : amount,
    currency: org.currency,
    reason: v.reason,
    created_by: identity.userId,
    created_by_email: identity.email,
  })
  if (error) return { ok: false, error: error.message }

  await audit(identity, org.partner_id, "budget_adjusted", org.slug, v.reason, {
    delta: negative ? -amount : amount,
  })
  void checkBudgetAlert(org.id)
  touch(org.id)
  return { ok: true, notice: t("bo.b2g.notice.adjusted") }
}

const thresholdSchema = z.object({
  orgId: z.string().uuid(),
  amount: z.string().trim().max(30).optional(),
  percent: z.string().trim().max(10).optional(),
})

/** PAR-05 · o limite, em valor ou em percentagem (vazio: sem alertas). */
export async function setAlertThreshold(input: z.input<typeof thresholdSchema>): Promise<B2gResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  if (!isManager(identity)) return { ok: false, error: t("bo.b2g.errors.onlyManagers") }
  const parsed = thresholdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t("bo.b2g.errors.invalid") }
  const org = await visibleOrg(parsed.data.orgId)
  if (!org) return { ok: false, error: t("bo.b2g.errors.notFound") }

  const amount = parsed.data.amount ? parseMoney(parsed.data.amount) : null
  const percent = parsed.data.percent ? Number(parsed.data.percent.replace(",", ".")) : null
  if (percent != null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
    return { ok: false, error: t("bo.b2g.errors.percentRange") }
  }

  const db = createClient()
  const { error } = await db
    .from("organisations")
    .update({ alert_threshold_amount: amount, alert_threshold_percent: amount != null ? null : percent })
    .eq("id", org.id)
  if (error) return { ok: false, error: error.message }
  void checkBudgetAlert(org.id)
  touch(org.id)
  return { ok: true, notice: t("bo.b2g.notice.thresholdSaved") }
}

// ── PAR-07 · pagamento externo ───────────────────────────────────────────────

const externalSchema = z.object({
  caseId: z.string().uuid(),
  amount: z.string().trim().min(1, "bo.b2g.errors.amountMissing"),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "bo.b2g.errors.dateInvalid"),
  method: z.enum(["transfer", "deposit", "cheque", "comfort_letter", "other"]),
  reference: z.string().trim().max(200).optional(),
})

/**
 * Confirmar o pagamento externo: regista, desconta da bolsa do ministério e
 * liberta a emissão. Se o saldo não cobrir, nada acontece e o agente lê porquê
 * (PAR-03 · "bloqueio total, com mensagem clara").
 */
export async function confirmExternalPayment(input: z.input<typeof externalSchema>): Promise<B2gResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(String(input?.caseId ?? ""))
  if (!identity) return { ok: false, error: t("bo.b2g.errors.notFound") }

  const parsed = externalSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.b2g.errors.invalid") }
  }
  const v = parsed.data
  const amount = parseMoney(v.amount)
  if (!(amount > 0)) return { ok: false, error: t("bo.b2g.errors.amountMissing") }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.b2g.errors.unavailable") }

  const { data: bc } = await admin
    .from("booking_cases")
    .select("id, organisation_id, partner_id, trip_request:trip_requests(currency)")
    .eq("id", v.caseId)
    .maybeSingle()
  const bookingCase = bc as { id: string; organisation_id: string | null; partner_id: string | null; trip_request: unknown } | null
  if (!bookingCase?.organisation_id) return { ok: false, error: t("bo.b2g.errors.caseHasNoMinistry") }
  /* B2G-02 · com o canal Ministérios desligado, não se confirma nada. Reverter
     continua possível: desligar o canal não pode prender dinheiro na bolsa. */
  if (!(await partnerHasChannel(bookingCase.partner_id, "B2G"))) {
    return { ok: false, error: t("bo.b2g.errors.channelOff") }
  }

  const { data: live } = await admin
    .from("case_external_payments")
    .select("id")
    .eq("case_id", v.caseId)
    .is("reversed_at", null)
    .maybeSingle()
  if (live) return { ok: false, error: t("bo.b2g.errors.alreadyConfirmed") }

  const { data: org } = await admin
    .from("organisations")
    .select("currency")
    .eq("id", bookingCase.organisation_id)
    .maybeSingle()
  const currency = (org as { currency: string } | null)?.currency ?? "CVE"

  /* A bolsa primeiro: se não cobrir, não se regista nada. */
  const { data: movementId, error: debitError } = await admin.rpc("budget_debit", {
    p_org: bookingCase.organisation_id,
    p_case: v.caseId,
    p_amount: amount,
    p_actor: identity.userId,
    p_actor_email: identity.email,
    p_ref: v.reference || null,
  })
  if (debitError) {
    const insufficient = debitError.hint === "insufficient_funds" || /saldo insuficiente/.test(debitError.message)
    return {
      ok: false,
      error: insufficient ? t("bo.b2g.errors.insufficient") : debitError.message,
    }
  }

  const { error: extError } = await admin.from("case_external_payments").insert({
    case_id: v.caseId,
    amount,
    currency,
    paid_on: v.paidOn,
    method: v.method,
    reference: v.reference || null,
    budget_movement_id: movementId as string,
    confirmed_by: identity.userId,
    confirmed_by_email: identity.email,
  })
  if (extError) {
    /* O débito já entrou: estorna-se já, para o saldo não ficar a mentir. */
    await admin.from("budget_movements").insert({
      organisation_id: bookingCase.organisation_id,
      partner_id: (await getPartnerOf(bookingCase.organisation_id)) ?? undefined,
      kind: "reversal",
      delta: amount,
      currency,
      case_id: v.caseId,
      reverses_id: movementId as string,
      reason: "falha ao registar o pagamento externo",
      created_by_email: identity.email,
    })
    return { ok: false, error: extError.message }
  }

  /* Liberta a emissão: o pagamento do caso passa a confirmado, pelo mesmo
     caminho de estados que o resto da plataforma usa. */
  await markCasePaid(admin, v.caseId, amount, currency, identity)

  await logCaseEvent({
    caseId: v.caseId,
    kind: "external_payment_confirmed",
    title: "Pagamento externo confirmado",
    detail: `${v.method} · ${v.reference ?? "—"} · por ${identity.email}`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
    payload: { amount, currency, paidOn: v.paidOn, method: v.method },
  })

  void checkBudgetAlert(bookingCase.organisation_id)
  revalidatePath(`/admin/price-checker/${v.caseId}`)
  touch(bookingCase.organisation_id)
  return { ok: true, notice: t("bo.b2g.notice.externalConfirmed") }
}

async function getPartnerOf(orgId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin!.from("organisations").select("partner_id").eq("id", orgId).maybeSingle()
  return (data as { partner_id: string } | null)?.partner_id ?? null
}

async function markCasePaid(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  caseId: string,
  amount: number,
  currency: string,
  identity: BoIdentity
) {
  const now = new Date().toISOString()
  const { data: latest } = await admin
    .from("case_payments")
    .select("id, status")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  let payment = latest as { id: string; status: string } | null

  if (!payment || ["FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(payment.status)) {
    const { data } = await admin
      .from("case_payments")
      .insert({ case_id: caseId, amount, currency, status: "PENDING", description: "Pagamento externo (B2G)" })
      .select("id, status")
      .single()
    payment = data as { id: string; status: string }
  }
  if (!payment) return

  await admin
    .from("case_payments")
    .update({
      admin_confirmed: true,
      admin_confirmed_at: now,
      admin_confirmed_by: identity.userId,
      received_amount: amount,
    })
    .eq("id", payment.id)

  if (payment.status === "STARTED") {
    await applyPaymentStatus(payment.id, "PENDING", { source: "admin", markedBy: identity.userId })
  }
  if (payment.status !== "COMPLETED") {
    await applyPaymentStatus(payment.id, "COMPLETED", { source: "admin", markedBy: identity.userId, paidAt: now })
  }
}

const reverseSchema = z.object({
  caseId: z.string().uuid(),
  reason: z.string().trim().min(3, "bo.b2g.errors.reasonMissing").max(500),
})

/** Reverter: só um administrador do parceiro (ou da WeeFly). Repõe o saldo. */
export async function reverseExternalPayment(input: z.input<typeof reverseSchema>): Promise<B2gResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(String(input?.caseId ?? ""))
  if (!identity) return { ok: false, error: t("bo.b2g.errors.notFound") }
  if (!isManager(identity)) return { ok: false, error: t("bo.b2g.errors.onlyManagers") }

  const parsed = reverseSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.b2g.errors.invalid") }
  }
  const v = parsed.data

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.b2g.errors.unavailable") }

  const { data: live } = await admin
    .from("case_external_payments")
    .select("id, amount, currency, budget_movement_id, case:booking_cases(organisation_id, partner_id)")
    .eq("case_id", v.caseId)
    .is("reversed_at", null)
    .maybeSingle()
  const ext = live as {
    id: string
    amount: number
    currency: string
    budget_movement_id: string | null
    case: { organisation_id: string; partner_id: string } | { organisation_id: string; partner_id: string }[]
  } | null
  if (!ext) return { ok: false, error: t("bo.b2g.errors.nothingToReverse") }
  const bc = Array.isArray(ext.case) ? ext.case[0] : ext.case

  let reversalId: string | null = null
  if (ext.budget_movement_id) {
    const { data: rev, error } = await admin
      .from("budget_movements")
      .insert({
        organisation_id: bc.organisation_id,
        partner_id: bc.partner_id,
        kind: "reversal",
        delta: Number(ext.amount),
        currency: ext.currency,
        case_id: v.caseId,
        reverses_id: ext.budget_movement_id,
        reason: v.reason,
        created_by: identity.userId,
        created_by_email: identity.email,
      })
      .select("id")
      .single()
    if (error) return { ok: false, error: error.message }
    reversalId = (rev as { id: string }).id
  }

  await admin
    .from("case_external_payments")
    .update({
      reversed_at: new Date().toISOString(),
      reversed_by_email: identity.email,
      reversal_reason: v.reason,
      reversal_movement_id: reversalId,
    })
    .eq("id", ext.id)

  /* A emissão volta a estar presa: o pagamento deixa de contar como pago. */
  const { data: payment } = await admin
    .from("case_payments")
    .select("id, status")
    .eq("case_id", v.caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (payment) {
    await admin.from("case_payments").update({ admin_confirmed: false }).eq("id", (payment as { id: string }).id)
    if ((payment as { status: string }).status === "COMPLETED") {
      await applyPaymentStatus((payment as { id: string }).id, "REFUNDED", { source: "admin", markedBy: identity.userId })
    }
  }

  await logCaseEvent({
    caseId: v.caseId,
    kind: "external_payment_reversed",
    title: "Pagamento externo revertido",
    detail: `${v.reason} · por ${identity.email}`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
    payload: { amount: Number(ext.amount), currency: ext.currency },
  })

  revalidatePath(`/admin/price-checker/${v.caseId}`)
  touch(bc.organisation_id)
  return { ok: true, notice: t("bo.b2g.notice.externalReversed") }
}

// ── ADM-06 · destinatários dos alertas ───────────────────────────────────────

const recipientSchema = z
  .object({
    partnerId: z.string().uuid(),
    organisationId: z.string().uuid().nullable().optional(),
    side: z.enum(["partner", "weefly"]),
    name: z.string().trim().max(120).optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || z.string().email().safeParse(v).success, "bo.b2g.errors.emailInvalid"),
    whatsapp: z.string().trim().max(40).optional().transform((v) => v || null),
  })
  .refine((v) => v.email || v.whatsapp, { message: "bo.b2g.errors.recipientChannel" })

export async function saveAlertRecipient(input: z.input<typeof recipientSchema>): Promise<B2gResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  if (!isManager(identity)) return { ok: false, error: t("bo.b2g.errors.onlyManagers") }
  const parsed = recipientSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.b2g.errors.invalid") }
  }
  const v = parsed.data

  const weefly = identity.profile?.crossPartner === true
  /* Um parceiro gere os do seu lado; os da WeeFly são do Admin WeeFly. */
  if (!weefly && (v.partnerId !== identity.tenant?.partnerId || v.side !== "partner")) {
    return { ok: false, error: t("bo.b2g.errors.onlyManagers") }
  }
  /* B2G-02 · os alertas da bolsa são do canal Ministérios. */
  if (!(await partnerHasChannel(v.partnerId, "B2G"))) return { ok: false, error: t("bo.b2g.errors.channelOff") }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.b2g.errors.unavailable") }
  const { error } = await admin.from("alert_recipients").insert({
    partner_id: v.partnerId,
    organisation_id: v.organisationId ?? null,
    side: v.side,
    name: v.name || null,
    email: v.email,
    whatsapp: v.whatsapp,
    created_by_email: identity.email,
  })
  if (error) return { ok: false, error: error.message }
  touch()
  return { ok: true, notice: t("bo.b2g.notice.recipientSaved") }
}

export async function removeAlertRecipient(id: string): Promise<B2gResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  if (!isManager(identity)) return { ok: false, error: t("bo.b2g.errors.onlyManagers") }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: t("bo.b2g.errors.invalid") }

  /* Visível pela sessão (RLS), e do lado que ela gere. */
  const scope = await getBoScope()
  const { data } = await scope!.db.from("alert_recipients").select("id, partner_id, side").eq("id", id).maybeSingle()
  const row = data as { id: string; partner_id: string; side: string } | null
  const weefly = identity.profile?.crossPartner === true
  if (!row || (!weefly && (row.partner_id !== identity.tenant?.partnerId || row.side !== "partner"))) {
    return { ok: false, error: t("bo.b2g.errors.notFound") }
  }

  const admin = createAdminClient()
  const { error } = await admin!.from("alert_recipients").update({ active: false }).eq("id", id)
  if (error) return { ok: false, error: error.message }
  touch()
  return { ok: true, notice: t("bo.b2g.notice.recipientRemoved") }
}

// ── registo ──────────────────────────────────────────────────────────────────

async function audit(
  identity: BoIdentity,
  partnerId: string,
  action: "organisation_created" | "organisation_updated" | "organisation_link_rotated" | "budget_adjusted",
  target: string,
  reason?: string,
  after?: Record<string, unknown>
) {
  const admin = createAdminClient()
  if (!admin) return
  const { error } = await admin.from("access_audit").insert({
    actor_user_id: identity.userId,
    actor_email: identity.email,
    action,
    partner_id: partnerId,
    target,
    reason: reason ?? null,
    after: after ?? null,
  })
  if (error) console.error("[b2g] registo falhou:", error.message)
}
