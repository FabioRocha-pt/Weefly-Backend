import { NextResponse } from "next/server"

import { resolveMinistry } from "@/lib/ministry"

/**
 * MIN-06 · instalar como aplicação. O manifesto é por ministério: o
 * `start_url` é o link dele, para que o ícone no ecrã inicial abra sempre a
 * aplicação certa — e um link regenerado dá um manifesto que já não abre o
 * antigo.
 *
 * SEO-04 · os ícones são os da empresa (gerados a partir do ícone dela, ver
 * `api/brand/[file]`), que no endereço da empresa respondem na raiz. Sem
 * ícone próprio, os da WeeFly.
 */

export const dynamic = "force-dynamic"

export async function GET(_: Request, { params }: { params: { org: string; token: string } }) {
  const lookup = await resolveMinistry(params.org, params.token)
  if (!lookup.ok) return new NextResponse("Not found", { status: 404 })
  const { org, brand } = lookup.ministry
  const base = `/ministerios/${org.slug}/${org.token}`
  const v = `?v=${brand.brandVersion}`

  return NextResponse.json(
    {
      name: `${org.name} · ${brand.name}`,
      short_name: org.name.length > 12 ? brand.name : org.name,
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: brand.colorPrimary ?? "#ffffff",
      icons: [
        { src: `/icon-192.png${v}`, sizes: "192x192", type: "image/png" },
        { src: `/icon-512.png${v}`, sizes: "512x512", type: "image/png" },
        { src: `/icon-512-maskable.png${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } }
  )
}
