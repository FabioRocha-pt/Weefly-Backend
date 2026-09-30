/**
 * WeeFly · MVP 2 · TEN-04 · o parceiro que o endereço identifica.
 *
 * "O subdomínio identifica o parceiro; o caminho identifica o ministério."
 * O modelo do endereço de um parceiro é o mesmo que os links usam
 * (`NEXT_PUBLIC_PARTNER_SITE_URL`, ex.: `https://{slug}.weefly.africa`): se o
 * pedido chegou por um endereço com essa forma, o `{slug}` é o parceiro.
 *
 * Sem o modelo configurado — ou num pedido pelo endereço da WeeFly — não há
 * parceiro no endereço, e a resposta é `null`. É o que acontece hoje, enquanto
 * o DNS e o certificado wildcard não existem.
 *
 * SÓ SERVIDOR.
 */

import { headers } from "next/headers"

import { siteUrl } from "@/lib/site-url"

/** O slug que um `host` identifica, dado o modelo. Puro: testável sem pedido. */
export function slugFromHost(host: string | null | undefined, template: string | undefined): string | null {
  const h = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "")
  const t = (template ?? "").trim().toLowerCase()
  if (!h || !t.includes("{slug}")) return null

  let pattern: string
  try {
    pattern = new URL(t.replace("{slug}", "slug-placeholder")).hostname
  } catch {
    return null
  }
  const [prefix, suffix] = pattern.split("slug-placeholder")
  if (!h.startsWith(prefix) || !h.endsWith(suffix)) return null
  const slug = h.slice(prefix.length, h.length - suffix.length)
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return null

  /* O endereço da própria WeeFly não é um parceiro, mesmo que tenha a mesma
     forma (ex.: `concierge.weefly.africa` com o modelo `{slug}.weefly.africa`). */
  try {
    if (new URL(siteUrl()).hostname === h) return null
  } catch {
    /* sem NEXT_PUBLIC_SITE_URL: nada a excluir */
  }
  return slug
}

export function hostPartnerSlug(): string | null {
  return slugFromHost(headers().get("host"), process.env.NEXT_PUBLIC_PARTNER_SITE_URL)
}
