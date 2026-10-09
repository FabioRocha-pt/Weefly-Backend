import { redirect } from "next/navigation"

/**
 * MIN-01 · "Minhas passagens" passou a "Os meus pedidos" (B2G-08). O endereço
 * antigo (instalado no ecrã de alguém, ou num email) leva à aba nova.
 */

export const dynamic = "force-dynamic"

export default function MinistryTripsRedirect({ params }: { params: { org: string; token: string } }) {
  redirect(`/ministerios/${params.org}/${params.token}/pedidos`)
}
