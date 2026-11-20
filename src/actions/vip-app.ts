"use server"

/**
 * WeeFly · APP-04 · as ações da app do cliente VIP ("Meus dados").
 *
 * "O cliente altera os seus dados aqui, e estes dados preenchem a passagem
 * automaticamente, a não ser que ele os mude nesse pedido." (decisão D-A)
 *
 * Nenhuma destas ações tem sessão: quem as chama é um cliente com o seu link
 * pessoal. A autorização é o endereço (`/pc/<nome>-<código>`), resolvido por
 * `resolveVipHandle` — que é também quem recusa um VIP desativado, uma
 * empresa sem o canal VIP e o endereço de outra empresa. O `id` do cliente
 * nunca vem do browser.
 *
 * Cada gravação deixa uma linha em `vip_client_changes` (0043), com a data e
 * os campos que mudaram: é o que o agente vê na ficha do cliente.
 *
 * D-D (pedir um código para mudar o telefone ou o email) está por decidir e
 * **não está feito**: hoje os contactos editam-se como os outros campos. O
 * sítio onde o código entraria está marcado em `saveVipProfile`.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { resolveVipHandle, vipLocale, type VipContext } from "@/lib/vip"
import { maskPassport } from "@/lib/vip-address"
import { NATIONALITIES } from "@/lib/pc/catalog"
import { COUNTRY_BY_ISO, toE164 } from "@/lib/countries"
import { getTranslator } from "@/i18n/server"
import { isLocale, type Locale } from "@/i18n/config"

export type VipAppResult = { ok: true; notice?: string } | { ok: false; error: string }

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const blank = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable())

const profileSchema = z.object({
  /* Contacto */
  country: z.string().trim().toUpperCase(),
  phone: z.string().trim().max(40),
  email: z.string().trim().toLowerCase().max(200),
  /* Para a passagem — tudo opcional: o cliente preenche o que tiver à mão. */
  title: blank(z.enum(["mr", "mrs", "ms"])),
  givenNames: blank(z.string().trim().min(2).max(80)),
  surname: blank(z.string().trim().min(2).max(80)),
  birthDate: blank(isoDate),
  gender: blank(z.enum(["m", "f"])),
  nationality: blank(z.string().refine((v) => NATIONALITIES.includes(v))),
  passportNumber: blank(z.string().trim().regex(/^[A-Za-z0-9]{5,12}$/)),
  passportExpiry: blank(isoDate),
  issuingCountry: blank(z.string().refine((v) => NATIONALITIES.includes(v))),
  /* Preferências */
  locale: z.string(),
  /** O consentimento do próprio cliente para guardar os dados do passaporte. */
  passportConsent: z.boolean().optional(),
})

export type VipProfileInput = z.input<typeof profileSchema>

/** A que campo do formulário pertence cada erro de validação. */
const FIELD_ERROR: Record<string, string> = {
  email: "email",
  givenNames: "names",
  surname: "names",
  birthDate: "birthDate",
  passportNumber: "passport",
  passportExpiry: "passportExpiry",
}

type Snapshot = Record<string, string | null>

/** O que fica escrito no registo: o passaporte mascarado, o resto por extenso. */
function snapshot(row: Record<string, any>): Snapshot {
  return {
    phone: row.phone ?? null,
    email: row.email ?? null,
    locale: row.locale ?? null,
    title: row.title ?? null,
    given_names: row.given_names ?? null,
    surname: row.surname ?? null,
    birth_date: row.birth_date ?? null,
    gender: row.gender ?? null,
    nationality: row.nationality ?? null,
    passport_number: row.passport_number ? maskPassport(row.passport_number) : null,
    passport_expiry: row.passport_expiry ?? null,
    issuing_country: row.issuing_country ?? null,
  }
}

const PROFILE_SELECT =
  "id, partner_id, phone, email, locale, title, given_names, surname, birth_date, gender, nationality, passport_number, passport_expiry, issuing_country, passport_consent_at"

/**
 * Grava as diferenças e regista-as. Devolve os campos que mudaram.
 * O número do passaporte compara-se em claro e regista-se mascarado.
 */
async function applyChanges(
  context: VipContext,
  next: Record<string, string | null>,
  source: "profile" | "request",
  extra: { caseId?: string; consent?: boolean } = {}
): Promise<{ ok: true; changed: string[] } | { ok: false }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false }

  const { data: current, error: readError } = await admin
    .from("vip_clients")
    .select(PROFILE_SELECT)
    .eq("id", context.vip.id)
    .maybeSingle()
  if (readError || !current) return { ok: false }
  const before = current as Record<string, any>

  const changed = Object.keys(next).filter((key) => (before[key] ?? null) !== (next[key] ?? null))
  if (changed.length === 0) return { ok: true, changed }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { profile_updated_at: now }
  for (const key of changed) patch[key] = next[key]
  /* O consentimento marca-se quando o cliente guarda dados de passaporte, e
     fica com a data da primeira vez (ou da última em que os voltou a dar). */
  const hasPassport = Boolean("passport_number" in next ? next.passport_number : before.passport_number)
  if (extra.consent && hasPassport) patch.passport_consent_at = now
  if (!hasPassport) patch.passport_consent_at = null

  const { error } = await admin.from("vip_clients").update(patch).eq("id", context.vip.id)
  if (error) {
    console.error("[vip-app] gravar falhou:", error.message)
    return { ok: false }
  }

  const beforeShot = snapshot(before)
  const afterShot = snapshot({ ...before, ...next })
  const pick = (shot: Snapshot) => Object.fromEntries(changed.map((key) => [key, shot[key] ?? null]))
  const { error: logError } = await admin.from("vip_client_changes").insert({
    vip_client_id: context.vip.id,
    partner_id: context.partner.id,
    actor_kind: "client",
    source,
    case_id: extra.caseId ?? null,
    fields: changed,
    before: pick(beforeShot),
    after: pick(afterShot),
  })
  if (logError) console.error("[vip-app] registo da alteração falhou:", logError.message)

  revalidatePath(`/agente/vip/${context.vip.id}`)
  return { ok: true, changed }
}

/** APP-04 · o cliente grava os seus dados em Meus dados. */
export async function saveVipProfile(handle: string, input: VipProfileInput): Promise<VipAppResult> {
  const lookup = await resolveVipHandle(handle)
  /* Sem cliente não há língua do cliente: o português é a da plataforma. */
  if (!lookup.ok) return { ok: false, error: getTranslator("pt")("vipApp.errors.notFound") }
  const context = lookup.context
  const t = getTranslator(vipLocale(context))

  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path?.[0] ?? "")
    return { ok: false, error: t(`vipApp.errors.${FIELD_ERROR[field] ?? "invalid"}`) }
  }
  const v = parsed.data

  /* E7 · o telefone no formato internacional, pelo país escolhido. */
  const dial = COUNTRY_BY_ISO[v.country]?.dial
  const phone = v.phone ? (dial ? toE164(dial, v.phone) : null) : null
  if (v.phone && !phone) return { ok: false, error: t("vipApp.errors.phone") }
  if (v.email && !z.string().email().safeParse(v.email).success) {
    return { ok: false, error: t("vipApp.errors.email") }
  }
  if (!phone && !v.email) return { ok: false, error: t("vipApp.errors.contactNeeded") }

  const today = new Date().toISOString().slice(0, 10)
  if (v.birthDate && v.birthDate > today) return { ok: false, error: t("vipApp.errors.birthDate") }
  if (v.passportNumber && !v.passportConsent && !context.vip.profile.passportConsentAt) {
    return { ok: false, error: t("vipApp.errors.consent") }
  }

  /*
   * D-D · é aqui que entraria o código de confirmação: quando `phone` ou
   * `email` diferem dos guardados, pedir o código enviado para o contacto
   * atual antes de gravar. Por decidir — hoje grava-se.
   */
  const locale: Locale = isLocale(v.locale) ? v.locale : vipLocale(context)
  const result = await applyChanges(
    context,
    {
      phone,
      email: v.email || null,
      locale,
      title: v.title,
      given_names: v.givenNames,
      surname: v.surname,
      birth_date: v.birthDate,
      gender: v.gender,
      nationality: v.nationality,
      passport_number: v.passportNumber ? v.passportNumber.toUpperCase() : null,
      passport_expiry: v.passportExpiry,
      issuing_country: v.issuingCountry,
    },
    "profile",
    { consent: Boolean(v.passportConsent) }
  )
  /* A confirmação sai na língua que ele acabou de escolher. */
  const tNext = getTranslator(locale)
  if (!result.ok) return { ok: false, error: t("vipApp.errors.saveFailed") }

  revalidatePath(`/pc/${handle}`, "layout")
  return { ok: true, notice: tNext(result.changed.length ? "vipApp.data.saved" : "vipApp.data.nothingChanged") }
}

/**
 * APP-04 · "Se mudar os dados no pedido, a app pergunta se quer guardar a
 * alteração em Meus dados." O cliente disse que sim: o primeiro passageiro
 * **deste pedido** passa a ser o que está em Meus dados.
 *
 * Lê-se o passageiro gravado no caso (e verifica-se que o caso é deste
 * cliente) em vez de aceitar os campos do browser: o que vai para Meus dados
 * é exatamente o que ficou no pedido.
 */
export async function saveVipProfileFromRequest(handle: string, caseToken: string): Promise<VipAppResult> {
  const lookup = await resolveVipHandle(handle)
  if (!lookup.ok) return { ok: false, error: getTranslator("pt")("vipApp.errors.notFound") }
  const context = lookup.context
  const t = getTranslator(vipLocale(context))

  const admin = createAdminClient()
  if (!admin || !/^[A-Za-z0-9_-]{16,64}$/.test(caseToken)) {
    return { ok: false, error: t("vipApp.errors.saveFailed") }
  }

  const { data: bookingCase } = await admin
    .from("booking_cases")
    .select("id")
    .eq("token", caseToken)
    .eq("vip_client_id", context.vip.id)
    .maybeSingle()
  const caseId = (bookingCase as { id: string } | null)?.id
  if (!caseId) return { ok: false, error: t("vipApp.errors.notFound") }

  const { data: passenger } = await admin
    .from("case_passengers")
    .select("title, first_name, last_name, gender, birth_date, nationality, passport_number, passport_expiry, issuing_country")
    .eq("case_id", caseId)
    .eq("position", 1)
    .maybeSingle()
  const p = passenger as Record<string, any> | null
  if (!p) return { ok: false, error: t("vipApp.errors.saveFailed") }

  const result = await applyChanges(
    context,
    {
      title: p.title ?? null,
      given_names: p.first_name ?? null,
      surname: p.last_name ?? null,
      birth_date: p.birth_date ?? null,
      gender: p.gender === "m" || p.gender === "f" ? p.gender : null,
      nationality: p.nationality ?? null,
      passport_number: p.passport_number ? String(p.passport_number).toUpperCase() : null,
      passport_expiry: p.passport_expiry ?? null,
      issuing_country: p.issuing_country ?? null,
    },
    "request",
    /* Responder "guardar" a esta pergunta é o consentimento. */
    { caseId, consent: true }
  )
  if (!result.ok) return { ok: false, error: t("vipApp.errors.saveFailed") }

  revalidatePath(`/pc/${handle}`, "layout")
  return { ok: true, notice: t("vipApp.data.savedFromRequest") }
}

/** APP-01 · a língua da app, escolhida em Meus dados. Muda logo, sem o resto do formulário. */
export async function setVipLocale(handle: string, locale: string): Promise<VipAppResult> {
  const lookup = await resolveVipHandle(handle)
  if (!lookup.ok) return { ok: false, error: getTranslator("pt")("vipApp.errors.notFound") }
  if (!isLocale(locale)) return { ok: false, error: getTranslator(vipLocale(lookup.context))("vipApp.errors.invalid") }

  const result = await applyChanges(lookup.context, { locale }, "profile")
  if (!result.ok) return { ok: false, error: getTranslator(locale)("vipApp.errors.saveFailed") }

  revalidatePath(`/pc/${handle}`, "layout")
  return { ok: true }
}
