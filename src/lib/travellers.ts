/**
 * WeeFly · MVP 2 · DAT-01 · as fichas dos viajantes de um ministério.
 *
 * "As fichas pertencem ao ministério, não ao caso." A ficha nasce, ou
 * actualiza-se, quando a secretária grava os passageiros de um caso; edita-se
 * no backoffice do parceiro. O histórico é da base de dados (trigger da 0030),
 * por isso aqui só se escreve a ficha e quem a escreveu.
 *
 * A mesma pessoa: o mesmo passaporte no mesmo ministério. Sem passaporte, o
 * mesmo nome e a mesma data de nascimento. Nada mais — juntar duas pessoas
 * diferentes numa ficha seria pior do que ter duas fichas da mesma.
 *
 * SÓ SERVIDOR.
 */

import type { createAdminClient } from "@/utils/supabase/admin"
import type { BoScope } from "@/lib/bo-scope"

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

export const TRAVELLER_COLUMNS =
  "id, organisation_id, title, first_name, last_name, gender, birth_date, nationality, passport_number, passport_expiry, issuing_country, phone, email, last_source, updated_by_email, expiry_alerted_at, updated_at, created_at"

export interface Traveller {
  id: string
  organisationId: string
  title: string | null
  firstName: string
  lastName: string
  gender: string | null
  birthDate: string | null
  nationality: string | null
  passportNumber: string | null
  passportExpiry: string | null
  issuingCountry: string | null
  phone: string | null
  email: string | null
  lastSource: string
  updatedByEmail: string | null
  expiryAlertedAt: string | null
  updatedAt: string
}

export function travellerFromRow(r: Record<string, any>): Traveller {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    title: r.title ?? null,
    firstName: r.first_name,
    lastName: r.last_name,
    gender: r.gender ?? null,
    birthDate: r.birth_date ?? null,
    nationality: r.nationality ?? null,
    passportNumber: r.passport_number ?? null,
    passportExpiry: r.passport_expiry ?? null,
    issuingCountry: r.issuing_country ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    lastSource: r.last_source,
    updatedByEmail: r.updated_by_email ?? null,
    expiryAlertedAt: r.expiry_alerted_at ?? null,
    updatedAt: r.updated_at,
  }
}

/** DAT-02 · o passaporte expira em menos de seis meses (ou já expirou)? */
export function passportExpiringSoon(expiry: string | null, today = new Date()): boolean {
  if (!expiry) return false
  const limit = new Date(today)
  limit.setMonth(limit.getMonth() + 6)
  return expiry < limit.toISOString().slice(0, 10)
}

export function foldName(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

export interface TravellerInput {
  title: string | null
  firstName: string
  lastName: string
  gender: string | null
  birthDate: string | null
  nationality: string | null
  passportNumber: string | null
  passportExpiry: string | null
  issuingCountry: string | null
  phone: string | null
  email: string | null
}

function toRow(p: TravellerInput) {
  return {
    title: p.title,
    first_name: p.firstName,
    last_name: p.lastName,
    gender: p.gender,
    birth_date: p.birthDate,
    nationality: p.nationality,
    passport_number: p.passportNumber ? p.passportNumber.toUpperCase() : null,
    passport_expiry: p.passportExpiry,
    issuing_country: p.issuingCountry,
    phone: p.phone,
    email: p.email ? p.email.toLowerCase() : null,
  }
}

/**
 * Depois de a secretária gravar os passageiros de um caso: cada um vira (ou
 * actualiza) a ficha do ministério. Best-effort — se a 0030 não estiver
 * aplicada, o caso continua gravado, só não há ficha.
 */
export async function syncMinistryTravellers(
  admin: Admin,
  input: {
    organisationId: string
    caseId: string
    byEmail: string | null
    /** B2G-25 · a secretária da sessão do PIN que registou (autora na ficha nova). */
    bySecretaryId?: string | null
    passengers: TravellerInput[]
  }
): Promise<void> {
  const { data, error } = await admin
    .from("ministry_travellers")
    .select("id, first_name, last_name, birth_date, passport_number")
    .eq("organisation_id", input.organisationId)
  if (error) {
    if (error.code !== "PGRST205" && error.code !== "42P01") console.error("[fichas] leitura:", error.message)
    return
  }
  const existing = (data ?? []) as { id: string; first_name: string; last_name: string; birth_date: string | null; passport_number: string | null }[]

  /* O trigger da 0030 volta a pôr o parceiro do ministério; mandá-lo certo
     poupa a surpresa a quem ler o pedido. */
  const { data: org } = await admin.from("organisations").select("partner_id").eq("id", input.organisationId).maybeSingle()
  const partnerId = (org as { partner_id: string } | null)?.partner_id
  if (!partnerId) return

  for (const p of input.passengers) {
    const passport = p.passportNumber?.toUpperCase() ?? null
    const match =
      (passport && existing.find((e) => e.passport_number?.toUpperCase() === passport)) ||
      existing.find(
        (e) =>
          foldName(e.first_name) === foldName(p.firstName) &&
          foldName(e.last_name) === foldName(p.lastName) &&
          (e.birth_date ?? null) === (p.birthDate ?? null) &&
          /* Um passaporte diferente é outra pessoa com o mesmo nome — ou a mesma
             com um passaporte novo, e o nome e a data não chegam para o saber. */
          (!e.passport_number || !passport)
      )

    const row = {
      ...toRow(p),
      /* O contacto é opcional: não se apaga o que a ficha já tinha só porque
         desta vez não foi escrito. */
      ...(p.phone ? {} : { phone: undefined }),
      ...(p.email ? {} : { email: undefined }),
      last_source: "case",
      last_case_id: input.caseId,
      updated_by_email: input.byEmail,
      /* B2G-25 · quem registou e quem mudou (0035). Sem secretária, a coluna
         nem vai: uma base sem a 0035 continua a aceitar a ficha. */
      ...(input.bySecretaryId ? { updated_by_secretary_id: input.bySecretaryId } : {}),
    }
    const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined))

    if (match) {
      const { error: upErr } = await admin.from("ministry_travellers").update(clean).eq("id", match.id)
      if (upErr) console.error("[fichas] actualizar:", upErr.message)
    } else {
      const { data: created, error: insErr } = await admin
        .from("ministry_travellers")
        .insert({
          ...clean,
          organisation_id: input.organisationId,
          partner_id: partnerId,
          ...(input.bySecretaryId ? { created_by_secretary_id: input.bySecretaryId } : {}),
        })
        .select("id, first_name, last_name, birth_date, passport_number")
        .single()
      if (insErr) console.error("[fichas] criar:", insErr.message)
      else existing.push(created as (typeof existing)[number])
    }
  }
}

/** As fichas de um ministério, pela sessão (o RLS da 0030 decide). */
export async function listTravellers(scope: BoScope, organisationId: string): Promise<Traveller[]> {
  const { data, error } = await scope.db
    .from("ministry_travellers")
    .select(TRAVELLER_COLUMNS)
    .eq("organisation_id", organisationId)
    .order("last_name")
    .order("first_name")
    .limit(2000)
  if (error) return []
  return ((data ?? []) as Record<string, any>[]).map(travellerFromRow)
}

export interface TravellerChange {
  id: string
  source: string
  changedByEmail: string | null
  caseId: string | null
  /** Os campos que mudaram: [campo, antes, depois]. */
  fields: [string, unknown, unknown][]
  createdAt: string
}

export async function loadTraveller(
  scope: BoScope,
  organisationId: string,
  travellerId: string
): Promise<{ traveller: Traveller; changes: TravellerChange[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(travellerId)) return null
  const { data } = await scope.db
    .from("ministry_travellers")
    .select(TRAVELLER_COLUMNS)
    .eq("id", travellerId)
    .eq("organisation_id", organisationId)
    .maybeSingle()
  if (!data) return null

  const { data: ch } = await scope.db
    .from("ministry_traveller_changes")
    .select("id, source, changed_by_email, case_id, before, after, created_at")
    .eq("traveller_id", travellerId)
    .order("created_at", { ascending: false })
    .limit(200)

  const changes = ((ch ?? []) as Record<string, any>[]).map((c) => {
    const before = (c.before ?? {}) as Record<string, unknown>
    const after = (c.after ?? {}) as Record<string, unknown>
    const keys = Array.from(new Set(Object.keys(before).concat(Object.keys(after))))
    return {
      id: c.id,
      source: c.source,
      changedByEmail: c.changed_by_email ?? null,
      caseId: c.case_id ?? null,
      fields: keys
        .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
        .map((k) => [k, c.before ? (before[k] ?? null) : null, after[k] ?? null] as [string, unknown, unknown]),
      createdAt: c.created_at,
    }
  })

  return { traveller: travellerFromRow(data as Record<string, any>), changes }
}

/** B2G-25 · D-11 · uma linha do histórico das fichas de um ministério. */
export interface MinistryTravellerChange {
  id: string
  travellerId: string
  travellerName: string
  source: string
  /** Quem: a secretária (nome), ou o email do back-office. */
  by: string | null
  bySecretary: boolean
  caseId: string | null
  created: boolean
  fields: string[]
  createdAt: string
}

/**
 * B2G-25 · "Cada registo e cada alteração ficam no Admin, com quem fez e
 * quando." O histórico das fichas de um ministério, pela sessão (o RLS da 0030
 * decide: a empresa vê as suas, o master todas), do mais recente para o mais
 * antigo.
 */
export async function listTravellerChanges(
  scope: BoScope,
  organisationId: string,
  limit = 200
): Promise<MinistryTravellerChange[]> {
  const run = (cols: string) =>
    scope.db
      .from("ministry_traveller_changes")
      .select(cols)
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(limit)
  let { data, error } = await run(
    "id, traveller_id, source, case_id, changed_by_email, changed_by_secretary_id, before, after, created_at"
  )
  if (error?.code === "42703") {
    ;({ data, error } = await run("id, traveller_id, source, case_id, changed_by_email, before, after, created_at"))
  }
  if (error || !data) return []
  const rows = data as unknown as Record<string, any>[]
  if (!rows.length) return []

  const travellerIds = Array.from(new Set(rows.map((r) => r.traveller_id as string)))
  const secretaryIds = Array.from(
    new Set(rows.map((r) => r.changed_by_secretary_id as string | null).filter((v): v is string => Boolean(v)))
  )
  const [{ data: trs }, { data: secs }] = await Promise.all([
    scope.db.from("ministry_travellers").select("id, first_name, last_name").in("id", travellerIds),
    secretaryIds.length
      ? scope.db.from("ministry_secretaries").select("id, name").in("id", secretaryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const names = new Map(
    ((trs ?? []) as { id: string; first_name: string; last_name: string }[]).map((t) => [
      t.id,
      `${t.last_name.toUpperCase()}, ${t.first_name}`,
    ])
  )
  const secNames = new Map(((secs ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]))

  return rows.map((c) => {
    const before = (c.before ?? null) as Record<string, unknown> | null
    const after = (c.after ?? {}) as Record<string, unknown>
    const keys = Array.from(new Set(Object.keys(before ?? {}).concat(Object.keys(after))))
    const secretary = c.changed_by_secretary_id ? secNames.get(c.changed_by_secretary_id) ?? null : null
    return {
      id: c.id,
      travellerId: c.traveller_id,
      travellerName: names.get(c.traveller_id) ?? "—",
      source: c.source,
      by: secretary ?? c.changed_by_email ?? null,
      bySecretary: Boolean(secretary),
      caseId: c.case_id ?? null,
      created: !before,
      fields: before
        ? keys.filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
        : [],
      createdAt: c.created_at,
    }
  })
}
