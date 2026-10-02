/**
 * WeeFly · MVP 2 · TEN-04 · DOM-01 · o parceiro que o endereço identifica.
 *
 * "O subdomínio identifica a empresa." O modelo do endereço de um parceiro é
 * o mesmo que os links usam (`NEXT_PUBLIC_PARTNER_SITE_URL`, ex.:
 * `https://{slug}.weefly.africa`): se o pedido chegou por um endereço com essa
 * forma, o `{slug}` é o parceiro. A classificação é a de `lib/site-host`, a
 * mesma que o middleware usa.
 *
 * Sem o modelo configurado, ou num pedido por `pro.weefly.africa` ou por
 * `weefly.africa`, não há parceiro no endereço e a resposta é `null`.
 *
 * SÓ SERVIDOR.
 */

import { headers } from "next/headers"
import { notFound } from "next/navigation"

import { classifyHost } from "@/lib/site-host"
import type { ProAccount } from "@/lib/pro-account"

export function hostPartnerSlug(): string | null {
  const h = headers()
  return classifyHost(h.get("x-forwarded-host") || h.get("host")).slug
}

/**
 * DOM-01 · "uma conta só vê a sua empresa; em `<outra>.weefly.africa/admin`
 * recebe 404". É sempre o mesmo backoffice: por `pro.weefly.africa` entra-se
 * em tudo o que a conta pode ver; pelo subdomínio de uma empresa, só se a
 * conta for dessa empresa. O Admin WeeFly (que vê todas) entra em qualquer.
 */
export function assertHostAllowsAccount(account: ProAccount | null): void {
  const slug = hostPartnerSlug()
  if (!slug || !account || account.legacy) return
  if (account.profile?.crossPartner) return
  if (account.partner?.slug !== slug) notFound()
}
