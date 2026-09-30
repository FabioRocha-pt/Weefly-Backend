import { NextResponse } from "next/server"

import { resolveMinistry } from "@/lib/ministry"

/**
 * MIN-06 · instalar como aplicação. O manifesto é por ministério: o
 * `start_url` é o link dele, para que o ícone no ecrã inicial abra sempre a
 * aplicação certa — e um link regenerado dá um manifesto que já não abre o
 * antigo.
 *
 * O ícone é a versão compacta do logótipo do parceiro (TEN-02) quando existir;
 * até lá, o logótipo que houver. Sem nenhum, o browser usa o dele.
 */

export const dynamic = "force-dynamic"

export async function GET(_: Request, { params }: { params: { org: string; token: string } }) {
  const lookup = await resolveMinistry(params.org, params.token)
  if (!lookup.ok) return new NextResponse("Not found", { status: 404 })
  const { org, brand } = lookup.ministry
  const base = `/m/${org.slug}/${org.token}`
  const icon = brand.logoUrl

  return NextResponse.json(
    {
      name: `${org.name} · ${brand.name}`,
      short_name: org.name.length > 12 ? brand.name : org.name,
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: brand.colorPrimary ?? "#ffffff",
      icons: icon
        ? [
            { src: icon, sizes: "192x192", purpose: "any" },
            { src: icon, sizes: "512x512", purpose: "any" },
          ]
        : [],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } }
  )
}
