import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { resolveVipLink } from "@/lib/vip"

/**
 * VIP-01 · o link antigo de um cliente VIP: `/vip/<token>`.
 *
 * "Os links `/vip/<código>` já enviados redirecionam para o novo." O endereço
 * de um VIP passou a ser `/pc/<nome>-<código>`, e é lá que vive a app dele
 * (Fazer pedido, Minhas passagens, Meus dados). Quem abre o link que recebeu
 * antes vai parar ao mesmo sítio.
 *
 * Um VIP desativado, uma empresa sem o canal VIP ou o endereço de outra
 * empresa dão "não encontrado", sem dizer porquê — como sempre deram.
 *
 * (Numa base sem a migração 0043 não há endereço novo para onde ir: o link
 * dá "não encontrado" até ela ser aplicada. A 0043 aplica-se antes do deploy.)
 */

export const dynamic = "force-dynamic"

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function VipLegacyLinkPage({ params }: { params: { token: string } }) {
  const lookup = await resolveVipLink(params.token)
  if (!lookup.ok || !lookup.context.vip.code) notFound()
  redirect(lookup.context.base)
}
