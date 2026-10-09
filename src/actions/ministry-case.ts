"use server"

/**
 * WeeFly · B2G v2 · B2G-16 · B2G-25 · as escritas da secretária no caso e nas
 * fichas dos passageiros.
 *
 * Todas pedem a sessão do PIN da secretária dona do link (B2G-07) e um caso —
 * ou uma ficha — **do ministério dela** (`secretaryCaseAuth`). O corpo de
 * escolher a opção e de gravar os passageiros é o mesmo do canal público
 * (`lib/pc/case-steps.ts`), com a secretária como autora: o registo do caso
 * diz que foi ela (`actor_kind secretary`), o tipo de cada passageiro sai da
 * data de nascimento (D-7), a ficha do ministério guarda quem registou
 * (B2G-25) e o caso fica pronto a emitir, sem pagamento (B2G-17).
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { getTranslator } from "@/i18n/server"
import { resolveMinistry, secretaryForLinkToken, SECRETARY_LINK_TOKEN } from "@/lib/ministry"
import { secretaryCaseAuth } from "@/lib/ministry-case"
import {
  chooseOfferForState,
  savePassengersForState,
  type PcPassengerInput,
  type PcResult,
  type StepContext,
} from "@/lib/pc/case-steps"
import { NATIONALITIES } from "@/lib/pc/catalog"

function ctxFor(
  ministry: NonNullable<Awaited<ReturnType<typeof secretaryCaseAuth>>>["ministry"],
  caseId: string
): StepContext {
  const t = getTranslator("pt")
  const base = `/ministerios/${ministry.org.slug}/${ministry.org.token}`
  return {
    actor: {
      kind: "secretary",
      secretaryId: ministry.secretary.id,
      name: ministry.secretary.name,
      email: ministry.secretary.email,
    },
    error: (key) => t(`pc.errors.${key}`),
    revalidate: [`${base}/pedidos/${caseId}`, `${base}/pedidos`, `${base}/passageiros`],
  }
}

/** B2G-16 · a secretária escolhe uma oferta publicada. */
export async function secretaryChooseOffer(
  orgSlug: string,
  linkToken: string,
  caseId: string,
  offerId: string
): Promise<PcResult> {
  const t = getTranslator("pt")
  const auth = await secretaryCaseAuth(orgSlug, linkToken, caseId)
  if (!auth) return { ok: false, error: t("pc.errors.ministrySession") }
  return chooseOfferForState(auth.state, String(offerId ?? ""), ctxFor(auth.ministry, caseId))
}

/** B2G-16 · um bloco por pessoa; o tipo sai da data de nascimento. */
export async function secretarySavePassengers(
  orgSlug: string,
  linkToken: string,
  caseId: string,
  rows: PcPassengerInput[]
): Promise<PcResult> {
  const t = getTranslator("pt")
  const auth = await secretaryCaseAuth(orgSlug, linkToken, caseId)
  if (!auth) return { ok: false, error: t("pc.errors.ministrySession") }
  return savePassengersForState(auth.state, rows, ctxFor(auth.ministry, caseId))
}

// ── B2G-25 · corrigir uma ficha na área Passageiros ─────────────────────────

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "date")
const optionalCountry = z
  .string()
  .trim()
  .refine((v) => v === "" || NATIONALITIES.includes(v), "country")

const travellerSchema = z.object({
  id: z.string().uuid(),
  title: z.enum(["", "mr", "mrs", "ms"]),
  firstName: z.string().trim().min(2, "name").max(80),
  lastName: z.string().trim().min(2, "name").max(80),
  gender: z.enum(["", "f", "m"]),
  birthDate: optionalDate,
  nationality: optionalCountry,
  passportNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z0-9]{5,12}$/.test(v), "passport"),
  passportExpiry: optionalDate,
  issuingCountry: optionalCountry,
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\+?[0-9][0-9 ()-]{5,22}$/.test(v), "phone"),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v), "email"),
})

export type SecretaryTravellerInput = z.input<typeof travellerSchema>

export async function secretaryUpdateTraveller(
  orgSlug: string,
  linkToken: string,
  input: SecretaryTravellerInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = getTranslator("pt")
  if (!SECRETARY_LINK_TOKEN.test(linkToken)) return { ok: false, error: t("pc.errors.ministrySession") }
  const secretaryId = await secretaryForLinkToken(linkToken)
  if (!secretaryId) return { ok: false, error: t("pc.errors.ministrySession") }
  const lookup = await resolveMinistry(orgSlug, linkToken)
  if (!lookup.ok || lookup.ministry.secretary.id !== secretaryId) {
    return { ok: false, error: t("pc.errors.ministrySession") }
  }
  const { org, secretary } = lookup.ministry

  const parsed = travellerSchema.safeParse(input)
  if (!parsed.success) {
    const message = String(parsed.error.issues[0]?.message ?? "")
    const field = ["name", "date", "country", "passport", "phone", "email"].includes(message) ? message : "invalid"
    return { ok: false, error: t(`ministry.travellers.errors.${field}`) }
  }
  const v = parsed.data

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("pc.errors.unavailable") }

  /* A ficha tem de ser deste ministério: a de outro não existe aqui. */
  const { data: row } = await admin
    .from("ministry_travellers")
    .select("id")
    .eq("id", v.id)
    .eq("organisation_id", org.id)
    .maybeSingle()
  if (!row) return { ok: false, error: t("ministry.travellers.errors.notFound") }

  const nul = (s: string) => (s === "" ? null : s)
  /* O histórico (`ministry_traveller_changes`) é o gatilho que o escreve, com
     o antes, o depois, a secretária e a hora (0030, 0035, 0037). */
  const { error } = await admin
    .from("ministry_travellers")
    .update({
      title: nul(v.title),
      first_name: v.firstName,
      last_name: v.lastName,
      gender: nul(v.gender),
      birth_date: nul(v.birthDate),
      nationality: nul(v.nationality),
      passport_number: v.passportNumber ? v.passportNumber.toUpperCase() : null,
      passport_expiry: nul(v.passportExpiry),
      issuing_country: nul(v.issuingCountry),
      phone: nul(v.phone),
      email: v.email ? v.email.toLowerCase() : null,
      last_source: "secretary",
      last_case_id: null,
      updated_by_email: secretary.email,
      updated_by_secretary_id: secretary.id,
    })
    .eq("id", v.id)
    .eq("organisation_id", org.id)

  if (error) {
    if (error.code === "23505") return { ok: false, error: t("ministry.travellers.errors.duplicatePassport") }
    console.error("[ministério] ficha:", error.message)
    return { ok: false, error: t("pc.errors.unavailable") }
  }

  const base = `/ministerios/${org.slug}/${org.token}/passageiros`
  revalidatePath(base)
  revalidatePath(`${base}/${v.id}`)
  return { ok: true }
}
