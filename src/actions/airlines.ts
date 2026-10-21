"use server"

/**
 * WeeFly · Admin · as companhias aéreas (pedido do Ivandro, 21 Out).
 *
 * "Acrescentar parametrização no back office admin, para podermos acrescentar
 * companhias aéreas: nome + logo." Só o Admin WeeFly, como os parceiros. A
 * tabela `airlines` não tem política de escrita: escreve a service role,
 * depois desta verificação.
 *
 * O logótipo sobe para o bucket público `brand`, pasta `airlines/`, com um
 * nome novo a cada upload — o browser e o WhatsApp guardam imagens em cache
 * pelo endereço, e reescrever o mesmo ficheiro deixava o antigo à vista.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity } from "@/lib/bo-access"
import { invalidateAirlines, loadAirlines } from "@/lib/airlines-server"
import { getBoI18n } from "@/i18n/bo-server"

export interface AirlineResult {
  ok: boolean
  error?: string
  notice?: string
}

const MAX_LOGO_BYTES = 1024 * 1024

async function weefly() {
  const identity = await boIdentity()
  if (!identity?.profile || identity.profile.manageUsers !== "all" || !identity.profile.crossPartner) {
    return null
  }
  return identity
}

const airlineSchema = z.object({
  iata: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2}$/, "bo.airlines.errors.iata"),
  name: z.string().trim().min(2, "bo.airlines.errors.name").max(80, "bo.airlines.errors.name"),
  priority: z.coerce.number().int().min(1).max(9),
  ticketPrefix: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[0-9]{3}$/.test(v), "bo.airlines.errors.prefix"),
  active: z.boolean(),
  isNew: z.boolean(),
  removeLogo: z.boolean(),
})

/** Depois de qualquer escrita: o catálogo do servidor e todas as páginas. */
async function refresh() {
  invalidateAirlines()
  await loadAirlines()
  revalidatePath("/", "layout")
}

export async function saveAirline(formData: FormData): Promise<AirlineResult> {
  const { t } = await getBoI18n()
  const actor = await weefly()
  if (!actor) return { ok: false, error: t("bo.airlines.errors.notAllowed") }
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.noServiceRole") }

  const parsed = airlineSchema.safeParse({
    iata: formData.get("iata") ?? "",
    name: formData.get("name") ?? "",
    priority: formData.get("priority") ?? 9,
    ticketPrefix: formData.get("ticketPrefix") ?? "",
    active: formData.get("active") === "1",
    isNew: formData.get("isNew") === "1",
    removeLogo: formData.get("removeLogo") === "1",
  })
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0]?.message ?? "bo.airlines.errors.invalid") }
  const v = parsed.data

  const { data: existing } = await admin.from("airlines").select("iata").eq("iata", v.iata).maybeSingle()
  if (v.isNew && existing) return { ok: false, error: t("bo.airlines.errors.exists", { code: v.iata }) }
  if (!v.isNew && !existing) return { ok: false, error: t("bo.airlines.errors.notFound") }

  const row: Record<string, unknown> = {
    iata: v.iata,
    name: v.name,
    priority: v.priority,
    active: v.active,
    ticket_prefix: v.ticketPrefix,
    updated_at: new Date().toISOString(),
    changed_by_email: actor.email,
  }

  const file = formData.get("logo")
  if (file instanceof File && file.size > 0) {
    if (file.type !== "image/png") return { ok: false, error: t("bo.airlines.errors.logoType") }
    if (file.size > MAX_LOGO_BYTES) return { ok: false, error: t("bo.airlines.errors.logoSize") }
    const path = `airlines/${v.iata.toLowerCase()}-${Date.now()}.png`
    const bucket = admin.storage.from("brand")
    const { error } = await bucket.upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    })
    if (error) {
      console.error("[companhias] upload falhou:", v.iata, error.message)
      return { ok: false, error: t("bo.airlines.errors.uploadFailed") }
    }
    row.logo_url = bucket.getPublicUrl(path).data.publicUrl
  } else if (v.removeLogo) {
    row.logo_url = null
  }

  const { error } = await admin.from("airlines").upsert(row, { onConflict: "iata" })
  if (error) {
    console.error("[companhias] gravar falhou:", v.iata, error.code, error.message)
    /* PGRST204 · uma coluna da 0040 não existe nesta base. */
    return { ok: false, error: error.code === "PGRST204" ? t("bo.airlines.errors.migration") : t("bo.airlines.errors.saveFailed") }
  }

  await refresh()
  return { ok: true, notice: t(v.isNew ? "bo.airlines.notice.created" : "bo.airlines.notice.saved", { code: v.iata }) }
}

export async function setAirlineActive(iata: string, active: boolean): Promise<AirlineResult> {
  const { t } = await getBoI18n()
  const actor = await weefly()
  if (!actor) return { ok: false, error: t("bo.airlines.errors.notAllowed") }
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.noServiceRole") }
  const code = iata.trim().toUpperCase()
  if (!/^[A-Z0-9]{2}$/.test(code)) return { ok: false, error: t("bo.airlines.errors.iata") }

  const { error } = await admin.from("airlines").update({ active }).eq("iata", code)
  if (error) return { ok: false, error: t("bo.airlines.errors.saveFailed") }

  await refresh()
  return { ok: true, notice: t(active ? "bo.airlines.notice.activated" : "bo.airlines.notice.deactivated", { code }) }
}
