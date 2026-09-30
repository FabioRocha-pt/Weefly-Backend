/**
 * WeeFly · MIG-02 · o endereço de todos os links gerados.
 *
 * "Todos os links gerados leem o endereço base da configuração. Mudar de
 * domínio no futuro não exige alterar código." Nenhum domínio vive aqui: o
 * endereço vem do ambiente, e este ficheiro é o único que o lê.
 *
 * Antes cada envio escolhia o seu — uns o `origin` do pedido, outros
 * `NEXT_PUBLIC_SITE_URL`, o construtor de links o `window.location`. O `origin`
 * era o defeito: um agente que abrisse o back-office pelo endereço antigo
 * gerava links para o endereço antigo, e o cliente recebia-os por email.
 *
 * As variáveis, todas `NEXT_PUBLIC_` porque o construtor de links corre no
 * browser (são lidas no build, e o build é feito no servidor com o
 * `.env.production`):
 *
 *   NEXT_PUBLIC_SITE_URL          o WeeFly Pro e o concierge da WeeFly
 *   NEXT_PUBLIC_PARTNER_SITE_URL  o de um parceiro, com `{slug}` no lugar do
 *                                 subdomínio (TEN-04). Sem ela, os parceiros
 *                                 usam o endereço da WeeFly — é o que fica
 *                                 enquanto o DNS e o certificado wildcard não
 *                                 existirem.
 *   NEXT_PUBLIC_WEBSITE_URL       o site público. Sem ela, o do concierge.
 *
 * Sem imports de servidor: é lido pelos dois lados.
 */

function clean(value: string | undefined | null): string {
  return (value ?? "").trim().replace(/\/+$/, "")
}

/** O endereço base da WeeFly, sem barra no fim. Vazio se não estiver configurado. */
export function siteUrl(): string {
  return clean(process.env.NEXT_PUBLIC_SITE_URL)
}

/** O site público (a pesquisa). */
export function websiteUrl(): string {
  return clean(process.env.NEXT_PUBLIC_WEBSITE_URL) || siteUrl()
}

export interface LinkPartner {
  slug: string
  isOperator: boolean
}

/**
 * TEN-04 · o endereço base de um parceiro.
 *
 * O operador usa o endereço da WeeFly. Um parceiro usa o subdomínio dele
 * quando o modelo estiver configurado; sem modelo, o da WeeFly.
 */
export function partnerSiteUrl(partner: LinkPartner | null | undefined): string {
  if (!partner || partner.isOperator) return siteUrl()
  const template = clean(process.env.NEXT_PUBLIC_PARTNER_SITE_URL)
  if (!template || !template.includes("{slug}")) return siteUrl()
  return template.replace("{slug}", partner.slug)
}

/** O link do cliente para um caso: `/pc/{token}` no endereço do parceiro. */
export function caseClientUrl(token: string, partner?: LinkPartner | null): string {
  const base = partnerSiteUrl(partner)
  return base ? `${base}/pc/${token}` : ""
}

/**
 * O endereço de um parceiro, sem o protocolo, para o ecrã o mostrar enquanto
 * se escolhe o subdomínio. `null` quando o modelo ainda não está configurado.
 */
export function partnerHostPreview(slug: string): string | null {
  const template = clean(process.env.NEXT_PUBLIC_PARTNER_SITE_URL)
  if (!template || !template.includes("{slug}")) return null
  return template.replace("{slug}", slug || "…").replace(/^https?:\/\//, "")
}
