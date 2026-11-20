import { NextResponse } from "next/server"

import { resolveVipHandle } from "@/lib/vip"
import { WEEFLY_THEME } from "@/lib/site-meta"

/**
 * APP-05 · instalar a app do cliente VIP no telemóvel.
 *
 * "Instalável no ecrã inicial, em Android e iPhone, com o ícone e o nome da
 * empresa. Abre em ecrã inteiro, sem a barra do browser. O link pessoal fica
 * guardado na app instalada."
 *
 * O manifesto é por cliente: o `start_url` é o link pessoal dele, e é isso
 * que o guarda na app — o cliente não precisa de o voltar a abrir pelo
 * WhatsApp. O `scope` é a raiz da app, e tudo o que ele faz (o pedido, as
 * ofertas, o pagamento, Meus dados) vive por baixo dela: nada abre a barra do
 * browser a meio. O endereço é o que foi aberto, e não o do nome atual, para
 * um nome corrigido não tirar uma app já instalada do seu âmbito.
 *
 * Os ícones são os da empresa do endereço (`/icon-192.png`, que o
 * `api/brand` resolve pelo subdomínio), nos tamanhos declarados.
 *
 * Um endereço que não é de um VIP ativo dá 404, como as páginas.
 */

export const dynamic = "force-dynamic"

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const lookup = await resolveVipHandle(params.token)
  if (!lookup.ok) return new NextResponse("Not found", { status: 404 })
  const { brand } = lookup.context
  const base = `/pc/${params.token}`
  const own = brand.kind === "partner"
  const v = `?v=${own ? brand.brandVersion : 1}`
  const name = brand.name

  return NextResponse.json(
    {
      id: base,
      name,
      /* O ecrã inicial corta nomes compridos: fica a primeira palavra. */
      short_name: name.length > 12 ? name.split(/\s+/)[0].slice(0, 12) : name,
      start_url: base,
      scope: base,
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: (own && brand.colorPrimary) || WEEFLY_THEME,
      icons: [
        { src: `/icon-192.png${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `/icon-512.png${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `/icon-512-maskable.png${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } }
  )
}
