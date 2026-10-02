/**
 * WeeFly · SEO-01 · SEO-02 · SEO-03 · o `<head>` de cada endereço.
 *
 * A empresa vem do subdomínio (`lib/site-host`), e dela saem o nome, o ícone,
 * a cor, a imagem de partilha e os textos. Nada disto está escrito no código
 * para uma empresa: a WeeFly é o operador (os ficheiros por defeito estão em
 * `public/brand/weefly/`), e qualquer outra vem da linha dela em `partners`.
 *
 *   pro.weefly.africa        → WeeFly PRO, `site-pro.webmanifest`, og-image-pro
 *   weefly.africa/pc         → WeeFly, og-image
 *   <empresa>.weefly.africa  → a marca da empresa (white label com frente
 *                              própria); as outras mostram a WeeFly
 *
 * O texto segue a língua escolhida no cookie e, sem cookie (o WhatsApp, o
 * Google), o português: é o "português por defeito" do SEO-02.
 *
 * SÓ SERVIDOR.
 */

import type { Metadata } from "next"
import { cookies, headers } from "next/headers"

import { clientBrandForSlug, weeflyBrand, type Brand } from "@/lib/brand"
import { requestOrigin } from "@/lib/request-origin"
import { classifyHost, indexingAllowed, type SiteHost } from "@/lib/site-host"
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config"
import { getTranslator } from "@/i18n/server"

export const WEEFLY_THEME = "#EF5129"
const WEEFLY_ASSETS = "/brand/weefly"

/** SEO-02 · `og:locale` por língua. */
export const OG_LOCALE: Record<Locale, string> = {
  pt: "pt_PT",
  en: "en_GB",
  fr: "fr_FR",
}

export interface SiteContext {
  site: SiteHost
  /** O endereço por onde o pedido chegou, sem barra no fim. */
  origin: string
  brand: Brand
  /** A empresa tem marca própria neste endereço. */
  partnerBrand: boolean
  locale: Locale
}

export async function siteContext(): Promise<SiteContext> {
  const h = headers()
  const site = classifyHost(h.get("x-forwarded-host") || h.get("host"))
  const origin = requestOrigin(h)
  const fromCookie = cookies().get(LOCALE_COOKIE)?.value
  const locale: Locale = isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE

  let brand: Brand | null = null
  if (site.kind === "partner" && site.slug) brand = await clientBrandForSlug(site.slug)
  if (!brand) brand = await weeflyBrand()

  return { site, origin, brand, partnerBrand: brand.kind === "partner", locale }
}

/** Um endereço absoluto: o WhatsApp não aceita `og:image` relativo. */
export function absolute(origin: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`
}

/** A imagem de partilha deste endereço. */
export function shareImage(ctx: SiteContext): string {
  if (ctx.partnerBrand && ctx.brand.ogImageUrl) return absolute(ctx.origin, ctx.brand.ogImageUrl)
  const file = ctx.site.kind === "pro" ? "og-image-pro.jpg" : "og-image.jpg"
  return absolute(ctx.origin, `${WEEFLY_ASSETS}/${file}`)
}

export function themeColor(ctx: SiteContext): string {
  return (ctx.partnerBrand && ctx.brand.colorPrimary) || WEEFLY_THEME
}

/** O título e a descrição por defeito deste endereço. */
export function defaultTexts(ctx: SiteContext): { title: string; description: string; siteName: string } {
  const t = getTranslator(ctx.locale)
  if (ctx.partnerBrand) {
    return {
      siteName: ctx.brand.name,
      title: ctx.brand.seoTitle || t("seo.partnerTitle", { name: ctx.brand.name }),
      description: ctx.brand.seoDescription || t("seo.partnerDescription", { name: ctx.brand.name }),
    }
  }
  if (ctx.site.kind === "pro") {
    return { siteName: "WeeFly PRO", title: t("seo.proTitle"), description: t("seo.proDescription") }
  }
  return { siteName: "WeeFly", title: t("seo.pcTitle"), description: t("seo.pcDescription") }
}

/**
 * SEO-01 · os ícones e o manifesto. Os caminhos são os da raiz (`/favicon.ico`,
 * …), servidos por `api/brand/[file]` para a empresa do endereço; o `?v=` muda
 * quando a empresa troca o ícone.
 */
function iconMetadata(ctx: SiteContext): Pick<Metadata, "icons" | "manifest"> {
  const v = `?v=${ctx.partnerBrand ? ctx.brand.brandVersion : 1}`
  const svg = !ctx.partnerBrand
  return {
    icons: {
      icon: [
        { url: `/favicon.ico${v}`, sizes: "48x48" },
        ...(svg ? [{ url: `/favicon.svg${v}`, type: "image/svg+xml" }] : []),
        { url: `/favicon-32x32.png${v}`, sizes: "32x32", type: "image/png" },
        { url: `/favicon-16x16.png${v}`, sizes: "16x16", type: "image/png" },
      ],
      apple: [{ url: `/apple-touch-icon.png${v}`, sizes: "180x180" }],
    },
    manifest: `/site.webmanifest${v}`,
  }
}

/**
 * SEO-02 · os metadados completos de uma página. `path` é o caminho da página
 * (para o `canonical` e o `og:url`); `indexable` só a página inicial do price
 * checker (SEO-03).
 */
export function pageMetadata(
  ctx: SiteContext,
  input: { path?: string; title?: string; description?: string; indexable?: boolean } = {}
): Metadata {
  const texts = defaultTexts(ctx)
  const title = input.title ?? texts.title
  const description = input.description ?? texts.description
  const image = shareImage(ctx)
  const url = input.path ? absolute(ctx.origin, input.path) : undefined
  const indexable = Boolean(input.indexable) && indexingAllowed() && ctx.site.kind !== "pro"

  let metadataBase: URL | undefined
  try {
    metadataBase = new URL(ctx.origin)
  } catch {
    metadataBase = undefined
  }

  return {
    metadataBase,
    title,
    description,
    applicationName: texts.siteName,
    ...(url ? { alternates: { canonical: url } } : {}),
    ...iconMetadata(ctx),
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: texts.siteName,
      title,
      description,
      ...(url ? { url } : {}),
      locale: OG_LOCALE[ctx.locale],
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: getTranslator(ctx.locale)("seo.imageAlt", { name: texts.siteName }),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  }
}
