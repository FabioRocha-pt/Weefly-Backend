/**
 * WeeFly · B2G v2 · B2G-02 · o canal está ligado para esta empresa?
 *
 * "Uma empresa sem o canal Ministérios não vê ministérios, secretárias nem
 * pedidos B2G." O menu esconde; isto é o que fecha: as páginas dão 404 e as
 * server actions recusam. Esconder no menu e abrir pelo endereço é o que o
 * PRO-03 e o PRO-04 pedem que não aconteça.
 *
 * Lido pela service role, a partir de um `partnerId` que vem sempre da sessão
 * ou de uma linha já aberta pelo RLS — nunca do browser.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"
import { notFound } from "next/navigation"

import { createAdminClient } from "@/utils/supabase/admin"
import { getBoAccess } from "@/lib/bo-access"
import { hasChannel, normaliseChannels, type PartnerChannel } from "@/lib/channels"

/** Os canais ligados de uma empresa. Vazio se não se conseguir ler. */
export const partnerChannels = cache(async (partnerId: string): Promise<PartnerChannel[]> => {
  const admin = createAdminClient()
  if (!admin || !partnerId) return []
  const { data, error } = await admin.from("partners").select("channels").eq("id", partnerId).maybeSingle()
  if (error) {
    console.error("[channels] canais ilegíveis", error.message)
    return []
  }
  return normaliseChannels((data as { channels: string[] | null } | null)?.channels)
})

export async function partnerHasChannel(partnerId: string | null | undefined, channel: PartnerChannel): Promise<boolean> {
  if (!partnerId) return false
  return hasChannel(await partnerChannels(partnerId), channel)
}

/**
 * Para as páginas do terminal de vendas: o canal ligado na empresa da sessão,
 * ou 404. Devolve o acesso, que a página quase sempre precisa a seguir.
 */
export async function requirePartnerChannel(channel: PartnerChannel) {
  const access = await getBoAccess()
  if (!access.ok || !access.identity.tenant) notFound()
  if (!(await partnerHasChannel(access.identity.tenant.partnerId, channel))) notFound()
  return access
}
