"use server"

/**
 * WeeFly · B2G v2 · B2G-09 · B2G-10 · o pedido simples do ministério.
 *
 * "Só estes campos. Nenhum dado de passageiro neste passo": quantas pessoas
 * (1–50), de onde (Praia por omissão, D-1), para onde, ida, volta opcional,
 * urgência (Normal por omissão, D-6) e notas. Quem pede é a secretária da
 * sessão: é ela o contacto do caso.
 *
 * Autorização: o link pessoal **e** a sessão aberta com o PIN dessa
 * secretária (`secretaryForLinkToken`, B2G-07). O caso nasce pelo mesmo
 * intake do Price Checker (`createPriceCheckerCase`): canal `ministerio`, o
 * ministério, a secretária, a urgência, N adultos (D-7) e as notas.
 *
 * B2G-10 · sem deduplicação e sem o limite por IP: três pedidos iguais
 * seguidos são três pedidos. Fica um travão por secretária (`SECRETARY_FLOOD`).
 */

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"

import { getTranslator } from "@/i18n/server"
import { isKnownIata } from "@/lib/airports"
import { countryOfDial, toE164 } from "@/lib/countries"
import { hostPartnerSlug } from "@/lib/host-partner"
import { resolveMinistry, secretaryForLinkToken, SECRETARY_LINK_TOKEN } from "@/lib/ministry"
import { SECRETARY_FLOOD, countSecretaryRequests, createPriceCheckerCase } from "@/lib/pc/intake"

export type MinistryRequestField = "people" | "origin" | "destination" | "departDate" | "returnDate" | "urgency" | "notes"

export type MinistryRequestResult =
  | { ok: true; reference: string; token: string }
  | { ok: false; error: string; missing?: MinistryRequestField[]; invalid?: MinistryRequestField[] }

export interface MinistryRequestInput {
  people: number | string | null
  origin: string | null
  destination: string | null
  departDate: string | null
  returnDate?: string | null
  urgency: number | string | null
  notes?: string | null
}

const MINISTRY_MAX_PEOPLE = 50

const isoDate = /^\d{4}-\d{2}-\d{2}$/

/**
 * "Não no passado." O ecrã usa a data local de quem pede; aqui aceita-se a
 * data mais atrasada do planeta (UTC−12), para uma secretária às 23h de um
 * fuso a oeste não ver o pedido recusado pelo relógio do servidor.
 */
function earliestToday(): string {
  return new Date(Date.now() - 12 * 3600_000).toISOString().slice(0, 10)
}

const schema = z.object({
  people: z.coerce.number().int().min(1).max(MINISTRY_MAX_PEOPLE),
  origin: z.string().trim().toUpperCase().refine(isKnownIata),
  destination: z.string().trim().toUpperCase().refine(isKnownIata),
  departDate: z.string().regex(isoDate),
  returnDate: z.string().regex(isoDate).nullable(),
  urgency: z.coerce.number().int().min(0).max(2),
  notes: z.string().trim().max(1000).nullable(),
})

export async function submitMinistryRequest(
  orgSlug: string,
  linkToken: string,
  input: MinistryRequestInput
): Promise<MinistryRequestResult> {
  const t = getTranslator("pt")

  /* B2G-07 · sem a sessão do PIN desta secretária, nada. */
  if (!SECRETARY_LINK_TOKEN.test(linkToken)) return { ok: false, error: t("pc.errors.ministrySession") }
  const secretaryId = await secretaryForLinkToken(linkToken)
  if (!secretaryId) return { ok: false, error: t("pc.errors.ministrySession") }
  const lookup = await resolveMinistry(orgSlug, linkToken)
  if (!lookup.ok || lookup.ministry.secretary.id !== secretaryId) {
    return { ok: false, error: t("pc.errors.ministrySession") }
  }
  const { org, secretary } = lookup.ministry

  /* Os obrigatórios em falta, todos de uma vez (o ecrã lista-os e destaca-os). */
  const blank = (v: unknown) => v == null || String(v).trim() === ""
  const missing: MinistryRequestField[] = []
  if (blank(input.people)) missing.push("people")
  if (blank(input.origin)) missing.push("origin")
  if (blank(input.destination)) missing.push("destination")
  if (blank(input.departDate)) missing.push("departDate")
  if (blank(input.urgency)) missing.push("urgency")
  if (missing.length) return { ok: false, error: t("ministry.form.errors.missing"), missing }

  const parsed = schema.safeParse({
    people: input.people,
    origin: input.origin,
    destination: input.destination,
    departDate: input.departDate,
    returnDate: blank(input.returnDate) ? null : input.returnDate,
    urgency: input.urgency,
    notes: blank(input.notes) ? null : input.notes,
  })
  if (!parsed.success) {
    const invalid = Array.from(new Set(parsed.error.issues.map((i) => i.path[0] as MinistryRequestField)))
    return { ok: false, error: t("ministry.form.errors.invalid"), invalid }
  }
  const v = parsed.data

  const invalid: MinistryRequestField[] = []
  if (v.origin === v.destination) invalid.push("destination")
  if (v.departDate < earliestToday()) invalid.push("departDate")
  if (v.returnDate && v.returnDate < v.departDate) invalid.push("returnDate")
  if (invalid.length) return { ok: false, error: t("ministry.form.errors.invalid"), invalid }

  /* B2G-10 · o travão por secretária (e não por IP, nem por rota). */
  if ((await countSecretaryRequests(secretaryId)) >= SECRETARY_FLOOD.max) {
    return { ok: false, error: t("pc.errors.ministryFlood") }
  }

  /* O contacto do caso é a secretária. O telefone chega como foi escrito
     ("+238 991 23 45"); o lead quer o indicativo e o número nacional. */
  const raw = (secretary.phone ?? "").replace(/[\s().-]+/g, "")
  const dial = raw.startsWith("+") ? raw.match(/^\+\d{1,3}/)?.[0] ?? "+238" : "+238"
  const country = countryOfDial(dial) || "CV"
  const national = raw.startsWith("+") ? raw.slice(dial.length) : raw
  const phoneOk = Boolean(national && toE164(dial, national))
  /* O lead exige um email; uma secretária sem email fica com um endereço
     que nunca recebe nada (`.invalid`, ver `lib/emails/send.ts`). */
  const email = secretary.email?.trim() || `secretaria-${secretary.id}@ministerio.invalid`

  const head = headers()
  const ip = head.get("x-forwarded-for")?.split(",")[0]?.trim() ?? head.get("x-real-ip") ?? null

  const created = await createPriceCheckerCase({
    trip: v.returnDate ? "round" : "oneway",
    cabin: "economy",
    /* D-7 · só o número total; o tipo de cada passageiro sai da data de
       nascimento quando os passageiros forem registados. */
    adults: v.people,
    children: 0,
    infantsInSeat: 0,
    infantsOnLap: 0,
    baggageHold: 0,
    origin: v.origin,
    destination: v.destination,
    departDate: v.departDate,
    returnDate: v.returnDate,
    legs: [],
    name: secretary.name,
    dialCode: dial,
    country,
    phone: phoneOk ? national : "",
    email,
    specialRequests: v.notes,
    consent: true,
    locale: "pt",
    currency: org.currency,
    agentSlug: null,
    companySlug: null,
    hostPartnerSlug: hostPartnerSlug(),
    ministryToken: linkToken,
    ministrySecretaryId: secretaryId,
    urgency: v.urgency as 0 | 1 | 2,
    consentIp: ip,
    consentAgent: head.get("user-agent")?.slice(0, 300) ?? null,
  })

  if (!created) return { ok: false, error: t("pc.errors.saveRequest") }

  /* NT-01 · NT-02 · os mesmos avisos do formulário público (o email à
     secretária e à equipa); a campainha e o pulso do back-office acendem com
     o `request_submitted` que o intake já escreveu. Best-effort. */
  try {
    const mails = await import("@/lib/emails/send")
    await mails.sendRequestReceivedEmail(created.caseId).catch((err) => console.error("[ministério] confirmação falhou:", err))
    await mails.sendNewRequestAlert(created.caseId).catch((err) => console.error("[ministério] aviso à equipa falhou:", err))
  } catch (err) {
    console.error("[ministério] avisos falharam:", err)
  }

  revalidatePath("/admin/price-checker")
  revalidatePath(`/ministerios/${org.slug}/${linkToken}/pedidos`)

  return { ok: true, reference: created.reference, token: created.token }
}
