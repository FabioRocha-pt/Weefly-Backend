/**
 * WeeFly · DOM-01 · que endereço é este.
 *
 *   pro.weefly.africa        → `pro`      o backoffice WeeFly PRO
 *   weefly.africa (/pc)      → `weefly`   o price checker da WeeFly Global
 *   <empresa>.weefly.africa  → `partner`  o price checker, o /admin e os
 *                                          /ministerios de uma empresa
 *
 * Nenhum domínio vive aqui: tudo sai das variáveis de `lib/site-url`. Um
 * endereço que não bate com nenhuma (localhost, um IP) é tratado como `pro`,
 * que é o que sempre foi.
 *
 * Sem imports de servidor: corre no middleware (edge).
 */

import { RESERVED_SUBDOMAINS, SUBDOMAIN } from "@/lib/subdomain"

export type SiteKind = "pro" | "weefly" | "partner"

export interface SiteHost {
  kind: SiteKind
  /** O subdomínio, quando `partner`. */
  slug: string | null
  host: string
}

function hostnameOf(url: string | undefined): string | null {
  const value = (url ?? "").trim()
  if (!value) return null
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function normaliseHost(host: string | null | undefined): string {
  return (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "")
}

/** O slug que o modelo `https://{slug}.weefly.africa` reconhece em `host`. */
export function partnerSlugFromHost(host: string, template: string | undefined): string | null {
  const tpl = (template ?? "").trim().toLowerCase()
  if (!host || !tpl.includes("{slug}")) return null
  const pattern = hostnameOf(tpl.replace("{slug}", "slug-placeholder"))
  if (!pattern) return null
  const [prefix, suffix] = pattern.split("slug-placeholder")
  if (!host.startsWith(prefix) || !host.endsWith(suffix)) return null
  const slug = host.slice(prefix.length, host.length - suffix.length)
  if (!SUBDOMAIN.test(slug) || RESERVED_SUBDOMAINS.includes(slug)) return null
  return slug
}

export function classifyHost(rawHost: string | null | undefined): SiteHost {
  const host = normaliseHost(rawHost)
  const pro = hostnameOf(process.env.NEXT_PUBLIC_SITE_URL)
  const pc = hostnameOf(process.env.NEXT_PUBLIC_PC_SITE_URL)

  if (host && host === pro) return { kind: "pro", slug: null, host }
  if (host && host === pc) return { kind: "weefly", slug: null, host }

  const slug = partnerSlugFromHost(host, process.env.NEXT_PUBLIC_PARTNER_SITE_URL)
  if (slug) return { kind: "partner", slug, host }

  return { kind: "pro", slug: null, host }
}

/**
 * SEO-03 · este ambiente pode ser indexado? Só quando `ALLOW_INDEXING=true`:
 * o desenvolvimento (`weefly.duckdns.org`, ENV-01) e qualquer servidor sem a
 * variável respondem sempre `noindex`.
 */
export function indexingAllowed(): boolean {
  return (process.env.ALLOW_INDEXING ?? "").trim().toLowerCase() === "true"
}

/** SEO-03 · só a página inicial do price checker se indexa, e só fora do PRO. */
export function isIndexablePath(site: SiteHost, pathname: string): boolean {
  if (!indexingAllowed() || site.kind === "pro") return false
  return pathname === "/pc" || pathname === "/pc/"
}
