/**
 * WeeFly · MVP 2 — de que parceiro é a sessão (TEN-06).
 *
 * "The current user's partner comes from the session, never from a
 * parameter." Este ficheiro é o único sítio do código que responde a essa
 * pergunta, e responde a partir da `bo_allowlist` (migração 0020). Nenhuma
 * ação recebe um `partnerId` do browser: lê-o da identidade.
 *
 * O isolamento a sério está na base de dados — as políticas restritivas da
 * 0020 e as funções `can_see_*`. O que está aqui serve o código: saber a quem
 * atribuir um caso novo, que marca mostrar, e se a conta pode entrar.
 *
 * SÓ SERVIDOR.
 */

export type PartnerStatus = "active" | "suspended"

export interface Tenant {
  partnerId: string
  partnerSlug: string
  partnerName: string
  partnerStatus: PartnerStatus
  /** O parceiro que opera a plataforma. Hoje, a WeeFly. */
  isOperator: boolean
  /** ADM-04 · uma conta do operador que vê todos os parceiros. */
  crossPartner: boolean
  /** TEN-05 · o rodapé do back-office do parceiro diz "Powered by WeeFly". */
  poweredByWeefly: boolean
}

/** A linha que o `select` da allowlist traz, com o parceiro embutido. */
export interface AllowlistTenantRow {
  partner_id?: string | null
  cross_partner?: boolean | null
  partner?: {
    id: string
    slug: string
    commercial_name: string
    status: PartnerStatus
    is_operator: boolean
    powered_by_weefly?: boolean | null
  } | null
}

/** As colunas a pedir à `bo_allowlist` para montar um `Tenant`. */
export const ALLOWLIST_TENANT_COLUMNS =
  "partner_id, cross_partner, partner:partners(id, slug, commercial_name, status, is_operator, powered_by_weefly)"

export function tenantFromRow(row: AllowlistTenantRow): Tenant | null {
  const p = row.partner
  if (!p || !row.partner_id) return null
  return {
    partnerId: p.id,
    partnerSlug: p.slug,
    partnerName: p.commercial_name,
    partnerStatus: p.status,
    isOperator: p.is_operator,
    // A base de dados já recusa `cross_partner` fora do operador (trigger da
    // 0020); repetir aqui custa uma linha e impede que um dado mal migrado
    // abra tudo.
    crossPartner: Boolean(row.cross_partner) && p.is_operator,
    poweredByWeefly: !p.is_operator && p.powered_by_weefly !== false,
  }
}

/**
 * Pode esta conta entrar no back-office hoje?
 *
 * **Parceiro suspenso** (ADM-01): "suspension blocks login". Definitiva até o
 * Admin reactivar.
 *
 * A trava que aqui existia — recusar toda a conta que não fosse do operador —
 * saiu com o TEN-03: as leituras do back-office passaram para o cliente da
 * sessão (`lib/bo-scope`), e cada caso é aberto só depois de o RLS dizer que a
 * sessão o vê. Uma conta do Alô entra e vê o Alô.
 */
export function tenantMayEnter(tenant: Tenant): { ok: true } | { ok: false; why: string } {
  if (tenant.partnerStatus !== "active") {
    return { ok: false, why: `parceiro ${tenant.partnerSlug} suspenso` }
  }
  return { ok: true }
}
