import { NextResponse } from "next/server"

import { resolveMinistry } from "@/lib/ministry"

/**
 * MIN-06 · B2G-08 · instalar como aplicação. O manifesto é por ministério: o
 * `start_url` é o link dele, para que o ícone no ecrã inicial abra sempre a
 * aplicação certa — e um link regenerado dá um manifesto que já não abre o
 * antigo.
 *
 * B2G-08 · "Ícone da aplicação com o brasão, e o nome do ministério no
 * título": o nome é o do ministério, e os ícones são o brasão
 * (`organisations.crest_url`) gerado nos tamanhos declarados
 * (`./icon/<ficheiro>`). Sem brasão, a rota do ícone devolve os da empresa.
 */

export const dynamic = "force-dynamic"

export async function GET(_: Request, { params }: { params: { org: string; token: string } }) {
  const lookup = await resolveMinistry(params.org, params.token)
  if (!lookup.ok) return new NextResponse("Not found", { status: 404 })
  const { org, brand } = lookup.ministry
  const base = `/ministerios/${org.slug}/${org.token}`
  const icon = (file: string) => `${base}/icon/${file}?v=${brand.brandVersion}`

  return NextResponse.json(
    {
      id: base,
      name: org.name,
      /* O ecrã inicial corta nomes compridos: "Ministério da Saúde" → "Saúde". */
      short_name: org.name.length > 12 ? shortName(org.name) : org.name,
      description: `${org.name} · ${brand.name}`,
      lang: "pt",
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: brand.colorPrimary ?? "#ffffff",
      icons: [
        { src: icon("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
        { src: icon("icon-512-maskable.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } }
  )
}

/** A última palavra que diz alguma coisa: "Ministério das Finanças" → "Finanças". */
function shortName(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length > 3)
  const last = words[words.length - 1] ?? name
  return last.length <= 12 ? last : last.slice(0, 12)
}
