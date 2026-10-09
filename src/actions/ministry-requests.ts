"use server"

/**
 * WeeFly · B2G v2 · B2G-23 · D-10 · pedir um ministério novo.
 *
 * "No menu Ministérios, a empresa pede um ministério: nome e logótipo. A
 * empresa não o cria: o pedido vai ao master. No Admin, o master aprova ou
 * recusa, com motivo. Ao aprovar, o ministério aparece na empresa, com o
 * endereço /ministerios/<slug>. A empresa recebe aviso da decisão."
 *
 * Pedir: qualquer conta do back-office da empresa (decisão 5), na empresa da
 * sessão e com o canal Ministérios ligado. Os logótipos sobem para o bucket
 * `brand` pela service role, depois de verificados (PNG ou JPEG, até 2 MB, e
 * a assinatura do ficheiro tem de bater com o tipo).
 *
 * Decidir: só a WeeFly (`cross_partner`). O ministério é criado pelo cliente
 * da sessão (o RLS da 0034 só deixa a WeeFly), o pedido é fechado pela
 * service role.
 */

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity, type BoIdentity } from "@/lib/bo-access"
import { partnerHasChannel } from "@/lib/channel-gate"
import { sendMinistryRequestDecision } from "@/lib/emails/ministry-request-decision"
import { getBoI18n } from "@/i18n/bo-server"

export type MinistryRequestResult = { ok: true; notice?: string; id?: string } | { ok: false; error: string }

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const MAX_BYTES = 2 * 1024 * 1024
const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" }

function touch() {
  revalidatePath("/agente/ministerios")
  revalidatePath("/gestao/b2g", "layout")
}

/** O ficheiro é mesmo o que diz ser? (PNG: 89 50 4E 47; JPEG: FF D8 FF.) */
function signatureMatches(type: string, body: Buffer): boolean {
  if (type === "image/png") return body.length > 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (type === "image/jpeg") return body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
  return false
}

type ImageCheck = { ok: true; body: Buffer; type: string } | { ok: false; key: string } | null

async function readImage(value: FormDataEntryValue | null): Promise<ImageCheck> {
  if (!(value instanceof File) || value.size === 0) return null
  if (!IMAGE_EXT[value.type]) return { ok: false, key: "bo.ministryRequests.errors.imageType" }
  if (value.size > MAX_BYTES) return { ok: false, key: "bo.ministryRequests.errors.imageSize" }
  const body = Buffer.from(await value.arrayBuffer())
  if (!signatureMatches(value.type, body)) return { ok: false, key: "bo.ministryRequests.errors.imageType" }
  return { ok: true, body, type: value.type }
}

async function audit(
  admin: Admin,
  identity: BoIdentity,
  partnerId: string,
  action: "ministry_requested" | "ministry_request_approved" | "ministry_request_rejected" | "organisation_created",
  target: string,
  after?: Record<string, unknown>,
  reason?: string | null
) {
  const { error } = await admin.from("access_audit").insert({
    actor_user_id: identity.userId,
    actor_email: identity.email,
    action,
    partner_id: partnerId,
    target,
    reason: reason ?? null,
    after: after ?? null,
  })
  if (error) console.error("[pedidos de ministério] registo falhou:", error.message)
}

/** B2G-23 · a empresa pede um ministério: nome, logótipo horizontal e brasão. */
export async function requestMinistry(formData: FormData): Promise<MinistryRequestResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  const partnerId = identity?.tenant?.partnerId
  if (!identity || !partnerId || !identity.profile?.backoffice) return { ok: false, error: t("bo.ministryRequests.errors.notAllowed") }
  if (!(await partnerHasChannel(partnerId, "B2G"))) return { ok: false, error: t("bo.b2g.errors.channelOff") }

  const name = String(formData.get("name") ?? "").trim()
  if (name.length < 2 || name.length > 160) return { ok: false, error: t("bo.ministryRequests.errors.nameMissing") }

  const logo = await readImage(formData.get("logo"))
  if (!logo) return { ok: false, error: t("bo.ministryRequests.errors.logoMissing") }
  if (!logo.ok) return { ok: false, error: t(logo.key) }
  const crest = await readImage(formData.get("crest"))
  if (crest && !crest.ok) return { ok: false, error: t(crest.key) }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.ministryRequests.errors.unavailable") }

  const { data: dup } = await admin
    .from("organisation_requests")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("status", "pending")
    .ilike("name", name.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle()
  if (dup) return { ok: false, error: t("bo.ministryRequests.errors.duplicate") }

  const id = randomUUID()
  const bucket = admin.storage.from("brand")
  const put = async (kind: "logo" | "crest", img: { body: Buffer; type: string }) => {
    const path = `ministry-requests/${partnerId}/${id}/${kind}.${IMAGE_EXT[img.type]}`
    const { error } = await bucket.upload(path, img.body, { contentType: img.type, cacheControl: "31536000", upsert: false })
    if (error) throw new Error(error.message)
    return path
  }

  let logoPath: string
  let crestPath: string | null = null
  try {
    logoPath = await put("logo", logo)
    if (crest?.ok) crestPath = await put("crest", crest)
  } catch (err) {
    console.error("[pedidos de ministério] upload falhou:", err)
    return { ok: false, error: t("bo.ministryRequests.errors.uploadFailed") }
  }

  const { error } = await admin.from("organisation_requests").insert({
    id,
    partner_id: partnerId,
    name,
    logo_path: logoPath,
    crest_path: crestPath,
    requested_by_email: identity.email,
  })
  if (error) {
    console.error("[pedidos de ministério] gravar falhou:", error.code)
    return {
      ok: false,
      error: error.code === "23505" ? t("bo.ministryRequests.errors.duplicate") : t("bo.ministryRequests.errors.saveFailed"),
    }
  }

  await audit(admin, identity, partnerId, "ministry_requested", id, { name, logo_path: logoPath, crest_path: crestPath })
  touch()
  return { ok: true, id, notice: t("bo.ministryRequests.notice.requested") }
}

/** Só a WeeFly decide. */
async function master(): Promise<BoIdentity | null> {
  const identity = await boIdentity()
  return identity?.profile?.crossPartner ? identity : null
}

async function pendingRequest(admin: Admin, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null
  const { data } = await admin
    .from("organisation_requests")
    .select("id, partner_id, name, logo_path, crest_path, requested_by_email, status")
    .eq("id", id)
    .maybeSingle()
  const row = data as {
    id: string
    partner_id: string
    name: string
    logo_path: string | null
    crest_path: string | null
    requested_by_email: string
    status: string
  } | null
  return row && row.status === "pending" ? row : null
}

const approveSchema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(2, "bo.ministryRequests.errors.nameMissing").max(160),
  slug: z.string().trim().toLowerCase().regex(SLUG, "bo.b2g.errors.slugShape"),
})

/**
 * Aprovar: o ministério nasce na empresa que o pediu, com o endereço escolhido
 * (editável) e os logótipos enviados; o pedido fecha-se como aprovado.
 */
export async function approveMinistryRequest(input: z.input<typeof approveSchema>): Promise<MinistryRequestResult> {
  const { t } = await getBoI18n()
  const identity = await master()
  const admin = createAdminClient()
  if (!identity || !admin) return { ok: false, error: t("bo.ministryRequests.errors.onlyMaster") }

  const parsed = approveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0]?.message ?? "bo.b2g.errors.invalid") }
  const v = parsed.data

  const request = await pendingRequest(admin, v.requestId)
  if (!request) return { ok: false, error: t("bo.ministryRequests.errors.notPending") }

  const bucket = admin.storage.from("brand")
  const url = (path: string | null) => (path ? bucket.getPublicUrl(path).data.publicUrl : null)

  const db = createClient()
  const { data: org, error } = await db
    .from("organisations")
    .insert({
      partner_id: request.partner_id,
      name: v.name,
      slug: v.slug,
      logo_url: url(request.logo_path),
      crest_url: url(request.crest_path),
      created_by_email: identity.email,
    })
    .select("id")
    .single()
  if (error || !org) {
    return {
      ok: false,
      error: error?.code === "23505" ? t("bo.b2g.errors.slugTaken") : t("bo.ministryRequests.errors.saveFailed"),
    }
  }
  const orgId = (org as { id: string }).id

  const { data: closed } = await admin
    .from("organisation_requests")
    .update({
      status: "approved",
      decided_by_email: identity.email,
      decided_at: new Date().toISOString(),
      organisation_id: orgId,
    })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("id")
  if (!closed || closed.length === 0) {
    /* Outra pessoa decidiu entretanto: o ministério acabado de criar sai. */
    await db.from("organisations").delete().eq("id", orgId)
    return { ok: false, error: t("bo.ministryRequests.errors.notPending") }
  }

  await audit(admin, identity, request.partner_id, "organisation_created", v.slug, { organisation_id: orgId, name: v.name })
  await audit(admin, identity, request.partner_id, "ministry_request_approved", request.id, {
    organisation_id: orgId,
    name: v.name,
    slug: v.slug,
  })

  const sent = await sendMinistryRequestDecision({ to: request.requested_by_email, ministryName: v.name, approved: true, slug: v.slug })
  touch()
  return {
    ok: true,
    id: orgId,
    notice: t("bo.ministryRequests.notice.approved") + (sent.ok ? ` ${t("bo.ministryRequests.notice.notified")}` : ""),
  }
}

const rejectSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().min(3, "bo.ministryRequests.errors.reasonMissing").max(500),
})

export async function rejectMinistryRequest(input: z.input<typeof rejectSchema>): Promise<MinistryRequestResult> {
  const { t } = await getBoI18n()
  const identity = await master()
  const admin = createAdminClient()
  if (!identity || !admin) return { ok: false, error: t("bo.ministryRequests.errors.onlyMaster") }

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0]?.message ?? "bo.b2g.errors.invalid") }
  const v = parsed.data

  const request = await pendingRequest(admin, v.requestId)
  if (!request) return { ok: false, error: t("bo.ministryRequests.errors.notPending") }

  const { data: closed } = await admin
    .from("organisation_requests")
    .update({ status: "rejected", reason: v.reason, decided_by_email: identity.email, decided_at: new Date().toISOString() })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("id")
  if (!closed || closed.length === 0) return { ok: false, error: t("bo.ministryRequests.errors.notPending") }

  await audit(admin, identity, request.partner_id, "ministry_request_rejected", request.id, { name: request.name }, v.reason)
  const sent = await sendMinistryRequestDecision({
    to: request.requested_by_email,
    ministryName: request.name,
    approved: false,
    reason: v.reason,
  })
  touch()
  return {
    ok: true,
    notice: t("bo.ministryRequests.notice.rejected") + (sent.ok ? ` ${t("bo.ministryRequests.notice.notified")}` : ""),
  }
}
