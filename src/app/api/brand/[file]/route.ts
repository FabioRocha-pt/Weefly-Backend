import { NextResponse } from "next/server"

import { loadBrandAsset } from "@/lib/brand-asset-load"
import { clientBrandForSlug, weeflyBrand, type Brand } from "@/lib/brand"
import { classifyHost, type SiteHost } from "@/lib/site-host"
import { WEEFLY_THEME } from "@/lib/site-meta"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * WeeFly · SEO-01 · SEO-04 · os ícones, o manifesto e a imagem de partilha
 * da empresa do endereço.
 *
 * `/favicon.ico`, `/apple-touch-icon.png`, `/site.webmanifest`, … chegam aqui
 * pelo `rewrites` do `next.config.js`. A empresa sai do `Host`; sem ícone
 * próprio (ou num endereço da WeeFly), os ficheiros de `public/brand/weefly/`.
 *
 * Os ficheiros da empresa estão na pasta `icons_base_url` (no bucket `brand`,
 * ou em `public/brand/<slug>/` para o Alô). Um pedido com `?v=` é imutável e
 * fica em cache um ano; sem ele, um dia.
 */

const FILES: Record<string, string> = {
  "favicon.ico": "image/x-icon",
  "favicon.svg": "image/svg+xml",
  "favicon-16x16.png": "image/png",
  "favicon-32x32.png": "image/png",
  "favicon-48x48.png": "image/png",
  "apple-touch-icon.png": "image/png",
  "icon-192.png": "image/png",
  "icon-512.png": "image/png",
  "icon-512-maskable.png": "image/png",
  "og-image.jpg": "image/jpeg",
  "site.webmanifest": "application/manifest+json",
}

/** Lê um ficheiro nosso (`/brand/...`) do disco, e qualquer outro por HTTP. */
const load = loadBrandAsset

function manifest(site: SiteHost, brand: Brand, own: boolean, v: string): string {
  const name = own ? brand.name : site.kind === "pro" ? "WeeFly PRO" : "WeeFly"
  const icon = (file: string) => `/${file}${v}`
  return JSON.stringify(
    {
      name,
      short_name: name.length > 12 ? name.split(" ")[0] : name,
      start_url: site.kind === "pro" ? "/modulo" : "/pc",
      display: "standalone",
      background_color: "#FFFFFF",
      theme_color: (own && brand.colorPrimary) || WEEFLY_THEME,
      icons: [
        { src: icon("icon-192.png"), sizes: "192x192", type: "image/png" },
        { src: icon("icon-512.png"), sizes: "512x512", type: "image/png" },
        { src: icon("icon-512-maskable.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2
  )
}

export async function GET(request: Request, { params }: { params: { file: string } }) {
  const file = params.file
  const type = FILES[file]
  if (!type) return new NextResponse("Not found", { status: 404 })

  const versioned = new URL(request.url).searchParams.has("v")
  const cache = versioned ? "public, max-age=31536000, immutable" : "public, max-age=86400"

  const site = classifyHost(request.headers.get("x-forwarded-host") || request.headers.get("host"))
  const brand = (site.kind === "partner" && site.slug ? await clientBrandForSlug(site.slug) : null) ?? (await weeflyBrand())
  const own = brand.kind === "partner"
  const v = `?v=${own ? brand.brandVersion : 1}`

  if (file === "site.webmanifest") {
    return new NextResponse(manifest(site, brand, own, v), {
      headers: { "Content-Type": type, "Cache-Control": cache },
    })
  }

  let source: string | null = null
  if (file === "og-image.jpg") {
    source = own && brand.ogImageUrl ? brand.ogImageUrl : `/brand/weefly/${site.kind === "pro" ? "og-image-pro.jpg" : "og-image.jpg"}`
  } else if (own && brand.iconsBaseUrl && file !== "favicon.svg") {
    source = `${brand.iconsBaseUrl.replace(/\/+$/, "")}/${file}`
  }

  const body = (source ? await load(source) : null) ?? (file === "favicon.svg" && own ? null : await load(`/brand/weefly/${file}`))
  if (!body) return new NextResponse("Not found", { status: 404 })

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": source?.endsWith(".png") && file === "og-image.jpg" ? "image/png" : type,
      "Cache-Control": cache,
    },
  })
}
