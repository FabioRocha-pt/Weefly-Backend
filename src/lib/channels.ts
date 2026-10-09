/**
 * WeeFly · B2G v2 · os canais de cada empresa (B2G-02).
 *
 * `partners.channels` (migração 0032) guarda os canais ligados pelo master:
 *
 *   B2C · Público       o link público do price checker
 *   VIP · VIP           clientes VIP com link pessoal
 *   B2G · Ministérios   ministérios, secretárias e pedidos B2G
 *
 * E o caso diz por que canal entrou (`booking_cases.channel`): `publico`,
 * `vip` ou `ministerio`.
 *
 * Sem imports de servidor: o menu lateral e o formulário do Admin usam isto
 * no browser. A verificação no servidor está em `lib/channel-gate`.
 */

export type PartnerChannel = "B2C" | "VIP" | "B2G"
export const PARTNER_CHANNELS: readonly PartnerChannel[] = ["B2C", "VIP", "B2G"]

export type CaseChannel = "publico" | "vip" | "ministerio"

/** O canal da empresa que abre cada canal de caso. */
export const CASE_CHANNEL_OF: Record<PartnerChannel, CaseChannel> = {
  B2C: "publico",
  VIP: "vip",
  B2G: "ministerio",
}

export function isPartnerChannel(value: string): value is PartnerChannel {
  return (PARTNER_CHANNELS as readonly string[]).includes(value)
}

/** Só os canais que a plataforma conhece, pela ordem dos menus. */
export function normaliseChannels(values: readonly string[] | null | undefined): PartnerChannel[] {
  const set = new Set(values ?? [])
  return PARTNER_CHANNELS.filter((c) => set.has(c))
}

export function hasChannel(
  channels: readonly string[] | null | undefined,
  channel: PartnerChannel
): boolean {
  return Boolean(channels?.includes(channel))
}
