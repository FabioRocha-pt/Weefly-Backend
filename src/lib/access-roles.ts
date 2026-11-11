/**
 * WeeFly · MVP 2 · ADM-02 · os cinco perfis.
 *
 * Os perfis são dados (`access_roles`, migração 0026), e o que cada um pode é
 * uma coluna, não um `if` com o nome de alguém. Este ficheiro só dá forma à
 * linha: nenhuma regra de acesso vive aqui que não venha da base de dados.
 *
 * Sem imports de servidor: os ecrãs de gestão também o leem.
 */

export type AccessRoleId =
  | "weefly_admin"
  | "weefly_agent"
  | "partner_admin"
  | "partner_agent"
  | "secretary"

export const ACCESS_ROLE_IDS: readonly AccessRoleId[] = [
  "weefly_admin",
  "weefly_agent",
  "partner_admin",
  "partner_agent",
  "secretary",
]

export interface AccessProfile {
  id: AccessRoleId
  labelPt: string
  labelEn: string
  /** De que parceiro pode ser uma conta com este perfil. */
  partnerKind: "operator" | "partner" | "any"
  /** Entra no WeeFly Pro e no back-office. */
  backoffice: boolean
  /** TEN-06 · o módulo Admin. */
  adminModule: boolean
  /** ADM-04 · vê todos os parceiros. */
  crossPartner: boolean
  manageUsers: "none" | "own_partner" | "all"
  /** Um Admin do parceiro pode dar este perfil. */
  grantableByPartner: boolean
  /** Reabrir casos fechados, revogar links, publicar propostas alheias. */
  supervisesCases: boolean
  needsOrganisation: boolean
  sort: number
}

/**
 * I18N-02 · o nome do perfil na língua de quem lê. A tabela só guarda PT e EN
 * (e o master pode tê-los mudado); as outras línguas vêm do dicionário
 * (`bo.roles.<id>`).
 */
export function accessProfileLabel(
  profile: Pick<AccessProfile, "id" | "labelPt" | "labelEn">,
  locale: string,
  t: (key: string) => string
): string {
  if (locale === "pt") return profile.labelPt
  if (locale === "en") return profile.labelEn
  const key = `bo.roles.${profile.id}`
  const label = t(key)
  return label === key ? profile.labelEn : label
}

/** As colunas de `access_roles`, para um `select` embutido. */
export const ACCESS_ROLE_COLUMNS =
  "id, label_pt, label_en, partner_kind, backoffice, admin_module, cross_partner, manage_users, grantable_by_partner, supervises_cases, needs_organisation, sort"

export interface AccessRoleRow {
  id: string
  label_pt: string
  label_en: string
  partner_kind: AccessProfile["partnerKind"]
  backoffice: boolean
  admin_module: boolean
  cross_partner: boolean
  manage_users: AccessProfile["manageUsers"]
  grantable_by_partner: boolean
  supervises_cases: boolean
  needs_organisation: boolean
  sort: number
}

export function profileFromRow(row: AccessRoleRow | null | undefined): AccessProfile | null {
  if (!row || !(ACCESS_ROLE_IDS as readonly string[]).includes(row.id)) return null
  return {
    id: row.id as AccessRoleId,
    labelPt: row.label_pt,
    labelEn: row.label_en,
    partnerKind: row.partner_kind,
    backoffice: row.backoffice,
    adminModule: row.admin_module,
    crossPartner: row.cross_partner,
    manageUsers: row.manage_users,
    grantableByPartner: row.grantable_by_partner,
    supervisesCases: row.supervises_cases,
    needsOrganisation: row.needs_organisation,
    sort: row.sort,
  }
}

/** Um `select` embutido pode chegar como objecto ou como lista de um. */
export function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * Pode quem tem `actor` dar `target` a uma conta deste tipo de parceiro?
 *
 * A mesma regra que `can_manage_access` impõe no RLS. Repetida aqui só para o
 * ecrã não oferecer o que a base de dados vai recusar.
 */
export function canGrant(
  actor: AccessProfile,
  target: AccessProfile,
  partner: { isOperator: boolean; isOwn: boolean }
): boolean {
  const kindOk =
    target.partnerKind === "any" ||
    (target.partnerKind === "operator") === partner.isOperator
  if (!kindOk) return false
  if (actor.manageUsers === "all") return true
  if (actor.manageUsers === "own_partner") return partner.isOwn && target.grantableByPartner
  return false
}
