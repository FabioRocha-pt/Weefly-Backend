"use server"

/**
 * WeeFly · MVP 2 · DAT-01 · editar a ficha de um viajante do ministério.
 *
 * No backoffice do parceiro, por quem trabalha os casos desse parceiro. A
 * ficha tem de estar na área da sessão (o RLS da 0030 a deixa ler, e é do
 * parceiro da sessão); a escrita vai pela service role, como a bolsa. O
 * histórico, com o antes e o depois, é o trigger da 0030 que o escreve.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { getBoScope } from "@/lib/bo-scope"
import { partnerHasChannel } from "@/lib/channel-gate"
import { NATIONALITIES } from "@/lib/pc/catalog"
import { getBoI18n } from "@/i18n/bo-server"
import { translateMessage } from "@/i18n/translate"

type Result = { ok: true } | { ok: false; error: string }

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "bo.travellers.errors.date")
const optionalCountry = z
  .string()
  .trim()
  .refine((v) => v === "" || NATIONALITIES.includes(v), "bo.travellers.errors.country")

const schema = z.object({
  id: z.string().uuid(),
  title: z.enum(["", "mr", "mrs", "ms"]),
  firstName: z.string().trim().min(2, "bo.travellers.errors.name").max(80),
  lastName: z.string().trim().min(2, "bo.travellers.errors.name").max(80),
  gender: z.enum(["", "f", "m"]),
  birthDate: optionalDate,
  nationality: optionalCountry,
  passportNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z0-9]{5,12}$/.test(v), "bo.travellers.errors.passport"),
  passportExpiry: optionalDate,
  issuingCountry: optionalCountry,
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\+?[0-9][0-9 ()-]{5,22}$/.test(v), "bo.travellers.errors.phone"),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v), "bo.travellers.errors.email"),
})

export type TravellerFormInput = z.input<typeof schema>

export async function updateMinistryTraveller(input: TravellerFormInput): Promise<Result> {
  const { t } = await getBoI18n()
  const scope = await getBoScope()
  if (!scope?.partnerId) return { ok: false, error: t("bo.travellers.errors.notFound") }

  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.travellers.errors.invalid") }
  }
  const v = parsed.data

  /* A ficha pela sessão, e do parceiro dela: o Admin WeeFly vê todas, mas
     muda-as só no seu parceiro (ADM-04 · só leitura por defeito). */
  const { data } = await scope.db
    .from("ministry_travellers")
    .select("id, organisation_id, partner_id")
    .eq("id", v.id)
    .eq("partner_id", scope.partnerId)
    .maybeSingle()
  const row = data as { id: string; organisation_id: string; partner_id: string } | null
  /* B2G-02 · sem o canal Ministérios, as fichas do ministério não existem aqui. */
  if (!row || !(await partnerHasChannel(row.partner_id, "B2G"))) {
    return { ok: false, error: t("bo.travellers.errors.notFound") }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.travellers.errors.unavailable") }

  const nul = (s: string) => (s === "" ? null : s)
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
      last_source: "backoffice",
      last_case_id: null,
      updated_by_email: scope.identity.email,
    })
    .eq("id", row.id)

  if (error) {
    /* O único índice único é o passaporte no ministério. */
    if (error.code === "23505") return { ok: false, error: t("bo.travellers.errors.duplicatePassport") }
    console.error("[fichas] edição:", error.message)
    return { ok: false, error: t("bo.travellers.errors.unavailable") }
  }

  revalidatePath(`/agente/ministerios/${row.organisation_id}`)
  revalidatePath(`/agente/ministerios/${row.organisation_id}/viajantes/${row.id}`)
  return { ok: true }
}
