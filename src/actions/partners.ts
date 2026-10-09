"use server"

/**
 * WeeFly · MVP 2 · ADM-01 · o registo de parceiros.
 *
 * "Só um Admin WeeFly cria parceiros. Criar um parceiro cria a sua primeira
 * conta de administrador e envia o convite. Um parceiro pode ser suspenso sem
 * ser apagado; a suspensão bloqueia o login e congela os links dele."
 *
 * Escrito pelo cliente da sessão: a política `partners_admin_write` da 0020
 * (só quem vê todos os parceiros) é a porta, e o trigger da 0026 regista quem
 * o fez. A primeira conta passa pelo `saveUser`, que é a mesma porta de todas
 * as outras.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity } from "@/lib/bo-access"
import { saveUser, type AccessResult } from "@/actions/access"
import { getBoI18n } from "@/i18n/bo-server"
import { translateMessage } from "@/i18n/translate"
import { subdomainProblem } from "@/lib/subdomain"

const HEX = /^#[0-9a-fA-F]{6}$/
const MENUS = ["flights", "cars", "houses", "experiences", "food"] as const

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, "bo.actions.common.invalidEmail")

const optionalColor = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || HEX.test(v), "bo.actions.partners.colorHex")

const partnerSchema = z.object({
  commercialName: z.string().trim().min(2, "bo.actions.partners.nameMissing").max(120),
  legalName: optionalText(200),
  nif: optionalText(40),
  country: optionalText(2),
  address: optionalText(300),
  contactName: optionalText(120),
  contactEmail: optionalEmail,
  contactPhone: optionalText(40),
  contractStart: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "bo.actions.partners.dateInvalid"),
  // Os dois menus (o modelo de contas): fornecer e vender.
  supplyEnabled: z.boolean(),
  sellEnabled: z.boolean(),
  sellMode: z.enum(["reseller", "white_label"]).nullable(),
  /* B2G-02 · Público (B2C), VIP e Ministérios (B2G). */
  channels: z.array(z.enum(["B2C", "VIP", "B2G"])),
  customerFront: z.enum(["own", "weefly"]),
  agentMenus: z.array(z.enum(MENUS)),
  // TEN-02 · a marca, ao nível do parceiro.
  logoUrl: optionalText(500),
  colorPrimary: optionalColor,
  colorDark: optionalColor,
  /* OCT-13 · a cor de destaque. */
  colorAccent: optionalColor,
  /* SEO-02 · ⚠ os textos do price checker da empresa. Vazios: os por defeito. */
  seoTitle: optionalText(120),
  seoDescription: optionalText(300),
  senderName: optionalText(120),
  senderEmail: optionalEmail,
  replyTo: optionalEmail,
  footerText: optionalText(500),
  poweredByWeefly: z.boolean(),
  whatsappNumber: optionalText(40),
})

const createSchema = partnerSchema.extend({
  /* OCT-12 · as regras do subdomínio (`lib/subdomain`). */
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => subdomainProblem(v) !== "shape", "bo.actions.partners.slugShape")
    .refine((v) => subdomainProblem(v) !== "reserved", "bo.actions.partners.slugReserved"),
  /* OCT-14 · o primeiro administrador pode ficar para depois: os dados de
     uma empresa (o Alô) nem sempre chegam todos de uma vez. Se vier o email,
     vem também o nome. */
  firstAdminEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, "bo.actions.partners.firstAdminEmail"),
  firstAdminName: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
}).refine((v) => !v.firstAdminEmail || (v.firstAdminName?.length ?? 0) >= 2, {
  message: "bo.actions.partners.firstAdminName",
  path: ["firstAdminName"],
})

async function weefly() {
  const identity = await boIdentity()
  if (!identity?.profile || identity.profile.manageUsers !== "all" || !identity.profile.crossPartner) {
    return null
  }
  return identity
}

function columns(v: z.output<typeof partnerSchema>) {
  return {
    commercial_name: v.commercialName,
    legal_name: v.legalName,
    nif: v.nif,
    country: v.country?.toUpperCase() ?? null,
    address: v.address,
    contact_name: v.contactName,
    contact_email: v.contactEmail,
    contact_phone: v.contactPhone,
    contract_start: v.contractStart,
    supply_enabled: v.supplyEnabled,
    sell_enabled: v.sellEnabled,
    /* A base de dados exige um modo a quem vende (`partners_seller_has_mode`). */
    sell_mode: v.sellEnabled ? (v.sellMode ?? "white_label") : v.sellMode,
    channels: v.channels,
    customer_front: v.sellMode === "white_label" ? v.customerFront : "weefly",
    agent_menus: v.agentMenus,
    logo_url: v.logoUrl,
    color_primary: v.colorPrimary,
    color_dark: v.colorDark,
    color_accent: v.colorAccent,
    seo_title: v.seoTitle,
    seo_description: v.seoDescription,
    sender_name: v.senderName,
    sender_email: v.senderEmail,
    reply_to: v.replyTo,
    footer_text: v.footerText,
    powered_by_weefly: v.poweredByWeefly,
    whatsapp_number: v.whatsappNumber,
  }
}

function touch() {
  revalidatePath("/gestao/parceiros")
  revalidatePath("/gestao/utilizadores")
}

export async function createPartner(input: z.input<typeof createSchema>): Promise<AccessResult> {
  const { t } = await getBoI18n()
  const actor = await weefly()
  if (!actor) return { ok: false, error: t("bo.actions.partners.onlyAdminCreates") }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.common.invalidData") }
  const v = parsed.data

  const db = createClient()
  const { data, error } = await db
    .from("partners")
    .insert({ ...columns(v), slug: v.slug, status: "active", changed_by_email: actor.email })
    .select("id")
    .single()
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? t("bo.actions.partners.slugTaken")
          : error.code === "42501"
            ? t("bo.actions.partners.onlyAdminCreates")
            : error.message,
    }
  }

  const partnerId = (data as { id: string }).id
  if (!v.firstAdminEmail) {
    touch()
    return { ok: true, notice: t("bo.actions.partners.createdNoAdmin") }
  }
  const first = await saveUser({
    mode: "create",
    email: v.firstAdminEmail,
    label: v.firstAdminName ?? v.firstAdminEmail,
    roleId: "partner_admin",
    partnerId,
    invite: true,
  })

  touch()
  return first.ok
    ? { ok: true, notice: t("bo.actions.partners.created", { notice: first.notice ?? "" }).trim() }
    : { ok: false, error: t("bo.actions.partners.createdAccountFailed", { error: first.error }) }
}

export async function updatePartner(
  id: string,
  input: z.input<typeof partnerSchema>
): Promise<AccessResult> {
  const { t } = await getBoI18n()
  const actor = await weefly()
  if (!actor) return { ok: false, error: t("bo.actions.partners.onlyAdminEdits") }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: t("bo.actions.partners.invalid") }

  const parsed = partnerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.common.invalidData") }

  const db = createClient()
  const { data, error } = await db
    .from("partners")
    .update({ ...columns(parsed.data), changed_by_email: actor.email })
    .eq("id", id)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: t("bo.actions.partners.notFound") }

  touch()
  return { ok: true, notice: t("bo.actions.partners.updated") }
}

/**
 * Suspender não apaga. O RLS deixa de reconhecer as contas do parceiro
 * (`current_partner_id`), o `getBoAccess` recusa-as, e o /pc dos casos dele
 * deixa de abrir.
 */
export async function setPartnerStatus(input: {
  id: string
  status: "active" | "suspended"
  reason?: string
}): Promise<AccessResult> {
  const { t } = await getBoI18n()
  const actor = await weefly()
  if (!actor) return { ok: false, error: t("bo.actions.partners.onlyAdminSuspends") }
  if (!z.string().uuid().safeParse(input.id).success) return { ok: false, error: t("bo.actions.partners.invalid") }

  const reason = (input.reason ?? "").trim()
  if (input.status === "suspended" && reason.length < 3) {
    return { ok: false, error: t("bo.actions.partners.suspendNeedsReason") }
  }

  const db = createClient()
  const { data: current } = await db
    .from("partners")
    .select("is_operator")
    .eq("id", input.id)
    .maybeSingle()
  if (!current) return { ok: false, error: t("bo.actions.partners.notFound") }
  if ((current as { is_operator: boolean }).is_operator) {
    return { ok: false, error: t("bo.actions.partners.operatorNotSuspendable") }
  }

  const { error } = await db
    .from("partners")
    .update({
      status: input.status,
      suspend_reason: input.status === "suspended" ? reason : null,
      changed_by_email: actor.email,
    })
    .eq("id", input.id)
  if (error) return { ok: false, error: error.message }

  touch()
  return {
    ok: true,
    notice:
      input.status === "suspended"
        ? t("bo.actions.partners.suspended")
        : t("bo.actions.partners.reactivated"),
  }
}

// ── OCT-13 · SEO-04 · logótipo, ícone e imagem de partilha ──────────────────

export type BrandUploadKind = "logo" | "icon" | "share"

const UPLOAD_RULES: Record<BrandUploadKind, { types: string[]; maxBytes: number }> = {
  /* PNG ou SVG, até 2 MB. */
  logo: { types: ["image/png", "image/svg+xml"], maxBytes: 2 * 1024 * 1024 },
  /* Quadrado, PNG de pelo menos 512 × 512, ou SVG. */
  icon: { types: ["image/png", "image/svg+xml"], maxBytes: 2 * 1024 * 1024 },
  /* 1200 × 630, JPG ou PNG, até 1 MB. */
  share: { types: ["image/jpeg", "image/png"], maxBytes: 1024 * 1024 },
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/jpeg": "jpg",
}

/**
 * Carrega um ficheiro da marca de um parceiro para o bucket `brand` e grava o
 * endereço na linha dele. O ícone gera o conjunto inteiro (`lib/brand-icons`)
 * numa pasta nova por versão: trocar o ícone não fica preso em cache, porque
 * o endereço muda e o `brand_version` sobe.
 *
 * O ficheiro sobe pela service role (o bucket não tem política de escrita), e
 * a linha do parceiro é escrita pelo cliente da sessão, como o resto deste
 * ecrã: o RLS e o registo de alterações são os mesmos.
 */
export async function uploadPartnerBrandFile(formData: FormData): Promise<AccessResult & { url?: string }> {
  const { t } = await getBoI18n()
  const actor = await weefly()
  if (!actor) return { ok: false, error: t("bo.actions.partners.onlyAdminEdits") }

  const partnerId = String(formData.get("partnerId") ?? "")
  const kind = String(formData.get("kind") ?? "") as BrandUploadKind
  const file = formData.get("file")
  if (!z.string().uuid().safeParse(partnerId).success) return { ok: false, error: t("bo.actions.partners.invalid") }
  if (!(kind in UPLOAD_RULES)) return { ok: false, error: t("bo.actions.common.invalidData") }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: t("bo.actions.partners.upload.missing") }

  const rule = UPLOAD_RULES[kind]
  if (!rule.types.includes(file.type)) return { ok: false, error: t(`bo.actions.partners.upload.type.${kind}`) }
  if (file.size > rule.maxBytes) return { ok: false, error: t(`bo.actions.partners.upload.tooBig.${kind}`) }

  const body = Buffer.from(await file.arrayBuffer())
  const { checkIconSource, checkShareImage, generateIconSet } = await import("@/lib/brand-icons")

  if (kind === "icon") {
    const check = await checkIconSource(body, file.type === "image/svg+xml")
    if (check !== "ok") return { ok: false, error: t(`bo.actions.partners.upload.icon.${check}`) }
  }
  if (kind === "share") {
    const check = await checkShareImage(body)
    if (check !== "ok") return { ok: false, error: t(`bo.actions.partners.upload.share.${check}`) }
  }

  const db = createClient()
  const { data: current } = await db
    .from("partners")
    .select("id, color_primary, brand_version")
    .eq("id", partnerId)
    .maybeSingle()
  if (!current) return { ok: false, error: t("bo.actions.partners.notFound") }
  const row = current as { id: string; color_primary: string | null; brand_version: number | null }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.noServiceRole") }
  const bucket = admin.storage.from("brand")
  const version = (row.brand_version ?? 1) + 1
  const folder = `partners/${partnerId}/v${version}`

  const put = async (name: string, content: Buffer, contentType: string) => {
    const { error } = await bucket.upload(`${folder}/${name}`, content, {
      contentType,
      cacheControl: "31536000",
      upsert: true,
    })
    if (error) throw new Error(error.message)
    return bucket.getPublicUrl(`${folder}/${name}`).data.publicUrl
  }

  let update: Record<string, unknown>
  let url: string
  try {
    if (kind === "icon") {
      url = await put(`icon.${EXT[file.type]}`, body, file.type)
      for (const icon of await generateIconSet(body, row.color_primary)) {
        await put(icon.name, icon.body, icon.contentType)
      }
      update = { icon_url: url, icons_base_url: url.slice(0, url.lastIndexOf("/")), brand_version: version }
    } else {
      url = await put(`${kind}.${EXT[file.type]}`, body, file.type)
      update = kind === "logo" ? { logo_url: url } : { og_image_url: url, brand_version: version }
    }
  } catch (err) {
    console.error("[parceiros] upload falhou:", partnerId, kind, err)
    return { ok: false, error: t("bo.actions.partners.upload.failed") }
  }

  const { error } = await db
    .from("partners")
    .update({ ...update, changed_by_email: actor.email })
    .eq("id", partnerId)
  if (error) return { ok: false, error: error.message }

  touch()
  return { ok: true, notice: t(`bo.actions.partners.upload.done.${kind}`), url }
}
