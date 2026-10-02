/**
 * WeeFly · MVP 2 · TEN-02 · TEN-05 · a marca de um ecrã ou de um email.
 *
 * Dois níveis, como o documento pede:
 *
 *   · parceiro — logótipo, cor principal, cor escura, remetente, endereço de
 *     resposta, rodapé, WhatsApp, e o interruptor `powered_by_weefly`;
 *   · organização (o ministério) — só o nome e o brasão, por cima do desenho
 *     do parceiro. Um ministério não tem cores.
 *
 * Nenhuma cor vive no código: vêm da linha do parceiro (a da WeeFly incluída,
 * migração 0027). Um valor que o parceiro ainda não tem fica nulo, e quem
 * desenha usa o que a folha de estilos já tem — nunca um valor inventado.
 *
 * O que o cliente vê depende de como o parceiro vende: um revendedor oficial,
 * ou um white label que escolheu o ecrã WeeFly (`customer_front = 'weefly'`),
 * mostra a WeeFly. Só um white label com ecrã próprio mostra a sua marca.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { createAdminClient } from "@/utils/supabase/admin"
import { siteUrl } from "@/lib/site-url"

export interface Brand {
  /** `weefly` quando o que se mostra é a WeeFly, mesmo num caso de parceiro. */
  kind: "weefly" | "partner"
  partnerId: string | null
  partnerSlug: string | null
  name: string
  logoUrl: string | null
  colorPrimary: string | null
  colorDark: string | null
  /** OCT-13 · a cor de destaque (o laranja do Alô). */
  colorAccent: string | null
  /** SEO-04 · o ícone quadrado de origem, e a pasta dos ícones gerados. */
  iconUrl: string | null
  iconsBaseUrl: string | null
  /** SEO-04 · a imagem de partilha (1200 × 630). */
  ogImageUrl: string | null
  /** SEO-04 · o `?v=` dos ícones. */
  brandVersion: number
  /** SEO-02 · ⚠ editáveis no Admin. Nulos: os textos por defeito. */
  seoTitle: string | null
  seoDescription: string | null
  footerText: string | null
  /** TEN-05 · só faz sentido numa marca de parceiro. */
  poweredByWeefly: boolean
  /** MIN-04 · o apoio do parceiro. Nulo: não há botão de WhatsApp. */
  whatsapp: string | null
  senderName: string | null
  senderEmail: string | null
  replyTo: string | null
  /** Nível da organização: o ministério e o brasão, quando há. */
  organisation: { name: string; logoUrl: string | null } | null
}

const COLUMNS =
  "id, slug, commercial_name, is_operator, sell_mode, customer_front, logo_url, color_primary, color_dark, color_accent, icon_url, icons_base_url, og_image_url, brand_version, seo_title, seo_description, footer_text, powered_by_weefly, whatsapp_number, sender_name, sender_email, reply_to"

/** As colunas de antes da 0031: enquanto ela não estiver aplicada, a marca
    continua a ler-se (sem ícones nem textos de SEO próprios). */
const LEGACY_COLUMNS =
  "id, slug, commercial_name, is_operator, sell_mode, customer_front, logo_url, color_primary, color_dark, footer_text, powered_by_weefly, whatsapp_number, sender_name, sender_email, reply_to"

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

async function readPartnerRow(
  admin: Admin,
  column: "is_operator" | "id" | "slug",
  value: string | boolean
): Promise<PartnerBrandRow | null> {
  const first = await admin.from("partners").select(COLUMNS).eq(column, value).maybeSingle()
  if (!first.error) return first.data as PartnerBrandRow | null
  if (first.error.code !== "42703") return null
  const legacy = await admin.from("partners").select(LEGACY_COLUMNS).eq(column, value).maybeSingle()
  return (legacy.data as PartnerBrandRow | null) ?? null
}

interface PartnerBrandRow {
  id: string
  slug: string
  commercial_name: string
  is_operator: boolean
  sell_mode: string | null
  customer_front: string | null
  logo_url: string | null
  color_primary: string | null
  color_dark: string | null
  color_accent?: string | null
  icon_url?: string | null
  icons_base_url?: string | null
  og_image_url?: string | null
  brand_version?: number | null
  seo_title?: string | null
  seo_description?: string | null
  footer_text: string | null
  powered_by_weefly: boolean | null
  whatsapp_number: string | null
  sender_name: string | null
  sender_email: string | null
  reply_to: string | null
}

/**
 * OCT-13 · um caminho da própria aplicação (`/brand/alo/alo-logo.png`) passa a
 * endereço absoluto: um email e o WhatsApp não sabem resolver um relativo.
 */
export function absoluteAssetUrl(url: string | null | undefined): string | null {
  const value = (url ?? "").trim()
  if (!value) return null
  if (value.startsWith("/") && !value.startsWith("//")) {
    const base = siteUrl()
    return base ? `${base}${value}` : value
  }
  return value
}

function fromRow(row: PartnerBrandRow, kind: Brand["kind"]): Brand {
  return {
    kind,
    partnerId: row.id,
    partnerSlug: row.slug,
    name: row.commercial_name,
    logoUrl: absoluteAssetUrl(row.logo_url),
    colorPrimary: row.color_primary,
    colorDark: row.color_dark,
    colorAccent: row.color_accent ?? null,
    iconUrl: absoluteAssetUrl(row.icon_url),
    iconsBaseUrl: absoluteAssetUrl(row.icons_base_url),
    ogImageUrl: absoluteAssetUrl(row.og_image_url),
    brandVersion: row.brand_version ?? 1,
    seoTitle: row.seo_title ?? null,
    seoDescription: row.seo_description ?? null,
    footerText: row.footer_text,
    poweredByWeefly: kind === "partner" && row.powered_by_weefly !== false,
    whatsapp: row.whatsapp_number,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    replyTo: row.reply_to,
    organisation: null,
  }
}

/** A marca da WeeFly, que é a do operador. Sem base de dados, só o nome. */
export const weeflyBrand = cache(async (): Promise<Brand> => {
  const admin = createAdminClient()
  if (admin) {
    const data = await readPartnerRow(admin, "is_operator", true)
    if (data) return fromRow(data, "weefly")
  }
  return {
    kind: "weefly",
    partnerId: null,
    partnerSlug: null,
    name: "WeeFly",
    logoUrl: null,
    colorPrimary: null,
    colorDark: null,
    colorAccent: null,
    iconUrl: null,
    iconsBaseUrl: null,
    ogImageUrl: null,
    brandVersion: 1,
    seoTitle: null,
    seoDescription: null,
    footerText: null,
    poweredByWeefly: false,
    whatsapp: null,
    senderName: null,
    senderEmail: null,
    replyTo: null,
    organisation: null,
  }
})

/** Mostra este parceiro a sua própria marca ao cliente? */
function showsOwnBrand(row: PartnerBrandRow): boolean {
  return !row.is_operator && row.sell_mode === "white_label" && row.customer_front !== "weefly"
}

/**
 * A marca que o cliente vê para um parceiro (`/pc`, emails ao cliente,
 * aplicação do ministério).
 */
export const clientBrandForPartner = cache(async (partnerId: string | null): Promise<Brand> => {
  if (!partnerId) return weeflyBrand()
  const admin = createAdminClient()
  if (!admin) return weeflyBrand()
  const row = await readPartnerRow(admin, "id", partnerId)
  if (!row || !showsOwnBrand(row)) return weeflyBrand()
  return fromRow(row, "partner")
})

/** O mesmo, pelo slug (o subdomínio do TEN-04). `null` se não existir. */
export const clientBrandForSlug = cache(async (slug: string): Promise<Brand | null> => {
  const admin = createAdminClient()
  if (!admin) return null
  const row = await readPartnerRow(admin, "slug", slug)
  if (!row) return null
  return showsOwnBrand(row) ? fromRow(row, "partner") : weeflyBrand()
})

/** A marca do cliente de um caso, com o ministério quando o caso tem um. */
export const clientBrandForCase = cache(async (caseId: string): Promise<Brand> => {
  const admin = createAdminClient()
  if (!admin) return weeflyBrand()
  const { data } = await admin
    .from("booking_cases")
    .select("partner_id, organisation:organisations(name, logo_url)")
    .eq("id", caseId)
    .maybeSingle()
  const row = data as {
    partner_id: string | null
    organisation: { name: string; logo_url: string | null } | { name: string; logo_url: string | null }[] | null
  } | null
  const brand = await clientBrandForPartner(row?.partner_id ?? null)
  const org = Array.isArray(row?.organisation) ? row?.organisation[0] : row?.organisation
  if (brand.kind !== "partner" || !org) return brand
  return { ...brand, organisation: { name: org.name, logoUrl: org.logo_url } }
})

/**
 * As variáveis CSS que a marca preenche no `/pc` (e na aplicação do
 * ministério). Só as que a marca tem: as outras ficam com o valor da folha.
 */
export function brandCssVars(brand: Brand): Record<string, string> {
  const vars: Record<string, string> = {}
  if (brand.colorPrimary) {
    vars["--ember"] = brand.colorPrimary
    vars["--ember-tint"] = `color-mix(in srgb, ${brand.colorPrimary} 8%, white)`
  }
  if (brand.colorDark) {
    vars["--ember-dk"] = brand.colorDark
  }
  if (brand.colorAccent) {
    vars["--brand-accent"] = brand.colorAccent
  }
  return vars
}

/** O que o browser precisa da marca (sem remetentes). */
export interface ClientBrand {
  kind: Brand["kind"]
  name: string
  logoUrl: string | null
  footerText: string | null
  poweredByWeefly: boolean
  whatsapp: string | null
  organisation: Brand["organisation"]
}

export function toClientBrand(brand: Brand): ClientBrand {
  return {
    kind: brand.kind,
    name: brand.name,
    logoUrl: brand.logoUrl,
    footerText: brand.footerText,
    poweredByWeefly: brand.poweredByWeefly,
    whatsapp: brand.whatsapp,
    organisation: brand.organisation,
  }
}
