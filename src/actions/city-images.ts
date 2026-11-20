"use server"

/**
 * WeeFly · Admin · IMG-01 · a biblioteca de imagens das cidades.
 *
 * "Gerida pelo master no Admin: carregar, substituir e desativar." Só o Admin
 * WeeFly, como as companhias. A tabela `city_images` não tem políticas:
 * escreve a service role, depois desta verificação.
 *
 * O que sobe é o original (JPG, PNG ou WebP); o que se guarda é o que a app
 * serve — nunca o original:
 *
 *   · 1600 × 1200 em WebP, abaixo de 200 KB (a qualidade desce até caber);
 *   · 800 × 600 em WebP, para telemóveis;
 *   · 32 × 24 em data URL, que aparece antes de qualquer pedido.
 *
 * O corte é 4:3 ao centro ("a parte importante ao centro"). Os ficheiros vão
 * para o bucket público `brand`, pasta `cities/`, com um nome novo a cada
 * upload — o browser guarda imagens em cache pelo endereço, e reescrever o
 * mesmo ficheiro deixava a antiga à vista.
 */

import { revalidatePath } from "next/cache"
import sharp from "sharp"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity } from "@/lib/bo-access"
import { invalidateCityImages } from "@/lib/city-images"
import { getBoI18n } from "@/i18n/bo-server"

export interface CityImageResult {
  ok: boolean
  error?: string
  notice?: string
}

/* O limite das server actions é 9 MB (`next.config.js`), com a folga do
   multipart. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const LARGE_MAX_BYTES = 200 * 1024
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"]
const BUCKET = "brand"

async function weefly() {
  const identity = await boIdentity()
  if (!identity?.profile || identity.profile.manageUsers !== "all" || !identity.profile.crossPartner) {
    return null
  }
  return identity
}

const citySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "bo.cityImages.errors.code"),
  cityName: z.string().trim().min(2, "bo.cityImages.errors.name").max(80, "bo.cityImages.errors.name"),
  airports: z
    .string()
    .transform((v) =>
      Array.from(
        new Set(
          v
            .toUpperCase()
            .split(/[\s,;]+/)
            .filter(Boolean)
        )
      )
    )
    .refine((list) => list.every((c) => /^[A-Z]{3}$/.test(c)) && list.length <= 20, "bo.cityImages.errors.airports"),
  alt: z
    .string()
    .trim()
    .max(160, "bo.cityImages.errors.alt")
    .transform((v) => v || null),
  active: z.boolean(),
  isNew: z.boolean(),
  removeImage: z.boolean(),
})

/** O original → as três versões servidas. */
async function buildVariants(input: Buffer): Promise<{ large: Buffer; small: Buffer; placeholder: string }> {
  /* `rotate()` sem argumentos aplica a orientação EXIF: uma fotografia de
     telemóvel deitada ficava deitada. */
  const base = sharp(input, { failOn: "none" }).rotate()

  let quality = 82
  let large = await base.clone().resize(1600, 1200, { fit: "cover", position: "centre" }).webp({ quality }).toBuffer()
  /* Uma fotografia cabe por volta dos 60-80; só uma imagem cheia de grão
     chega ao fundo da escala. */
  while (large.length > LARGE_MAX_BYTES && quality > 10) {
    quality -= 6
    large = await base.clone().resize(1600, 1200, { fit: "cover", position: "centre" }).webp({ quality }).toBuffer()
  }

  const small = await base
    .clone()
    .resize(800, 600, { fit: "cover", position: "centre" })
    .webp({ quality: Math.min(quality, 72) })
    .toBuffer()

  const tiny = await base
    .clone()
    .resize(32, 24, { fit: "cover", position: "centre" })
    .blur(1.2)
    .webp({ quality: 40 })
    .toBuffer()

  return { large, small, placeholder: `data:image/webp;base64,${tiny.toString("base64")}` }
}

/** O caminho dentro do bucket, a partir do endereço público guardado. */
function storagePath(publicUrl: string | null): string | null {
  if (!publicUrl) return null
  const marker = `/object/public/${BUCKET}/`
  const at = publicUrl.indexOf(marker)
  return at >= 0 ? decodeURIComponent(publicUrl.slice(at + marker.length)) : null
}

function refresh() {
  invalidateCityImages()
  revalidatePath("/gestao/imagens")
}

export async function saveCityImage(formData: FormData): Promise<CityImageResult> {
  const { t } = await getBoI18n()
  const actor = await weefly()
  if (!actor) return { ok: false, error: t("bo.cityImages.errors.notAllowed") }
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.noServiceRole") }

  const parsed = citySchema.safeParse({
    code: formData.get("code") ?? "",
    cityName: formData.get("cityName") ?? "",
    airports: String(formData.get("airports") ?? ""),
    alt: String(formData.get("alt") ?? ""),
    active: formData.get("active") === "1",
    isNew: formData.get("isNew") === "1",
    removeImage: formData.get("removeImage") === "1",
  })
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0]?.message ?? "bo.cityImages.errors.invalid") }
  const v = parsed.data

  const { data: existing, error: readError } = await admin
    .from("city_images")
    .select("code, image_large, image_small")
    .eq("code", v.code)
    .maybeSingle()
  if (readError) {
    console.error("[imagens] leitura falhou:", readError.code, readError.message)
    return {
      ok: false,
      error:
        readError.code === "PGRST205" || readError.code === "42P01"
          ? t("bo.cityImages.errors.migration")
          : t("bo.cityImages.errors.saveFailed"),
    }
  }
  if (v.isNew && existing) return { ok: false, error: t("bo.cityImages.errors.exists", { code: v.code }) }
  if (!v.isNew && !existing) return { ok: false, error: t("bo.cityImages.errors.notFound") }

  /* Um aeroporto só pode apontar para uma cidade: senão a imagem que ele
     mostra dependia da ordem das linhas. */
  if (v.airports.length) {
    const { data: clash } = await admin
      .from("city_images")
      .select("code, airport_codes")
      .overlaps("airport_codes", v.airports)
      .neq("code", v.code)
      .limit(1)
    const other = (clash ?? [])[0] as { code: string; airport_codes: string[] } | undefined
    if (other) {
      const airport = other.airport_codes.find((c) => v.airports.includes(c)) ?? ""
      return { ok: false, error: t("bo.cityImages.errors.airportTaken", { airport, code: other.code }) }
    }
  }

  const row: Record<string, unknown> = {
    code: v.code,
    city_name: v.cityName,
    airport_codes: v.airports,
    alt: v.alt,
    active: v.active,
    updated_at: new Date().toISOString(),
    changed_by_email: actor.email,
  }

  const bucket = admin.storage.from(BUCKET)
  const previous = existing as { image_large: string | null; image_small: string | null } | null
  const stale: string[] = []
  const uploaded: string[] = []

  const file = formData.get("image")
  if (file instanceof File && file.size > 0) {
    if (!ACCEPTED.includes(file.type)) return { ok: false, error: t("bo.cityImages.errors.imageType") }
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: t("bo.cityImages.errors.imageSize") }

    let variants: Awaited<ReturnType<typeof buildVariants>>
    try {
      variants = await buildVariants(Buffer.from(await file.arrayBuffer()))
    } catch (err) {
      console.error("[imagens] imagem ilegível:", v.code, (err as Error).message)
      return { ok: false, error: t("bo.cityImages.errors.imageUnreadable") }
    }

    const stamp = Date.now()
    const largePath = `cities/${v.code.toLowerCase()}-${stamp}-1600.webp`
    const smallPath = `cities/${v.code.toLowerCase()}-${stamp}-800.webp`
    for (const [path, body] of [
      [largePath, variants.large],
      [smallPath, variants.small],
    ] as const) {
      const { error } = await bucket.upload(path, body, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      })
      if (error) {
        console.error("[imagens] upload falhou:", v.code, error.message)
        if (uploaded.length) await bucket.remove(uploaded)
        return { ok: false, error: t("bo.cityImages.errors.uploadFailed") }
      }
      uploaded.push(path)
    }

    row.image_large = bucket.getPublicUrl(largePath).data.publicUrl
    row.image_small = bucket.getPublicUrl(smallPath).data.publicUrl
    row.placeholder = variants.placeholder
    stale.push(...[previous?.image_large, previous?.image_small].map((u) => storagePath(u ?? null)).filter((p): p is string => Boolean(p)))
  } else if (v.removeImage) {
    row.image_large = null
    row.image_small = null
    row.placeholder = null
    stale.push(...[previous?.image_large, previous?.image_small].map((u) => storagePath(u ?? null)).filter((p): p is string => Boolean(p)))
  }

  const { error } = await admin.from("city_images").upsert(row, { onConflict: "code" })
  if (error) {
    console.error("[imagens] gravar falhou:", v.code, error.code, error.message)
    /* A linha não ficou a apontar para os ficheiros novos: não ficam órfãos. */
    if (uploaded.length) await bucket.remove(uploaded)
    return { ok: false, error: t("bo.cityImages.errors.saveFailed") }
  }

  /* Só depois de a linha apontar para os novos é que os antigos saem. */
  if (stale.length) {
    const { error: removeError } = await bucket.remove(stale)
    if (removeError) console.error("[imagens] ficheiros antigos ficaram:", v.code, removeError.message)
  }

  refresh()
  return { ok: true, notice: t(v.isNew ? "bo.cityImages.notice.created" : "bo.cityImages.notice.saved", { city: v.cityName }) }
}

export async function setCityImageActive(code: string, active: boolean): Promise<CityImageResult> {
  const { t } = await getBoI18n()
  const actor = await weefly()
  if (!actor) return { ok: false, error: t("bo.cityImages.errors.notAllowed") }
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.noServiceRole") }
  const key = code.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(key)) return { ok: false, error: t("bo.cityImages.errors.code") }

  const { error } = await admin
    .from("city_images")
    .update({ active, updated_at: new Date().toISOString(), changed_by_email: actor.email })
    .eq("code", key)
  if (error) return { ok: false, error: t("bo.cityImages.errors.saveFailed") }

  refresh()
  return { ok: true, notice: t(active ? "bo.cityImages.notice.activated" : "bo.cityImages.notice.deactivated", { code: key }) }
}
