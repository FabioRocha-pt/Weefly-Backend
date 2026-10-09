import { NextResponse } from "next/server"

import { loadBrandAsset } from "@/lib/brand-asset-load"
import { crestIcon, type CrestIconFile } from "@/lib/brand-icons"
import { resolveMinistry } from "@/lib/ministry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * B2G-08 · B2G-24 · o ícone da aplicação do ministério: o brasão
 * (`organisations.crest_url`), em cada tamanho que o manifesto e o iPhone
 * pedem — gerado aqui, para os tamanhos declarados serem os verdadeiros
 * (instalável). Sem brasão, ou ilegível, os ícones da empresa.
 *
 * Só com um link de secretária válido (como o manifesto); o ícone não precisa
 * da sessão do PIN — é a marca, não um dado.
 */

const FILES: CrestIconFile[] = [
  "icon-192.png",
  "icon-512.png",
  "icon-512-maskable.png",
  "apple-touch-icon.png",
  "favicon-32x32.png",
]

export async function GET(_: Request, { params }: { params: { org: string; token: string; file: string } }) {
  const file = params.file as CrestIconFile
  if (!FILES.includes(file)) return new NextResponse("Not found", { status: 404 })

  const lookup = await resolveMinistry(params.org, params.token)
  if (!lookup.ok) return new NextResponse("Not found", { status: 404 })
  const { org, brand } = lookup.ministry

  const source = org.crestUrl ? await loadBrandAsset(org.crestUrl) : null
  if (source) {
    try {
      const png = await crestIcon(source, file)
      return new NextResponse(new Uint8Array(png), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
      })
    } catch (err) {
      console.error("[ministério] brasão ilegível:", (err as Error).message)
    }
  }

  /* Sem brasão: os ícones da empresa (os mesmos de `api/brand`), ou os da WeeFly. */
  const fallback =
    (brand.iconsBaseUrl ? await loadBrandAsset(`${brand.iconsBaseUrl.replace(/\/+$/, "")}/${file}`) : null) ??
    (await loadBrandAsset(`/brand/weefly/${file}`))
  if (!fallback) return new NextResponse("Not found", { status: 404 })
  return new NextResponse(new Uint8Array(fallback), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  })
}
