import { notFound } from "next/navigation"

import { loadAccessAdmin, type AuditEntry } from "@/lib/access-admin"
import { UsersAdmin, type UsersAdminAudit } from "@/components/pro/users-admin"
import { LOCALE_TAGS } from "@/i18n/config"
import { getBoI18n } from "@/i18n/bo-server"
import type { Translator } from "@/i18n/translate"

/**
 * ADM-02 · o ecrã de Utilizadores e permissões, para as duas portas por onde
 * se chega a ele: o Admin (`/gestao/utilizadores`, Admin WeeFly) e o Agente
 * (`/agente/equipa`, Admin do parceiro). Quem não gere ninguém recebe 404 —
 * TEN-06: "inacessíveis pelo endereço direto".
 */
export async function UsersAdminPage({ title, subtitle }: { title: string; subtitle: string }) {
  const data = await loadAccessAdmin()
  if (!data) notFound()
  const { t, locale } = await getBoI18n()

  const dt = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "short", timeStyle: "short" })
  const partnerName = new Map(data.partners.map((p) => [p.id, p.commercialName]))
  const roleName = new Map(data.roles.map((r) => [r.id, locale === "pt" ? r.labelPt : r.labelEn]))
  const orgName = new Map(data.organisations.map((o) => [o.id, o.name]))

  const audit: UsersAdminAudit[] = data.audit
    .filter((a) => a.action.startsWith("user_"))
    .map((a) => ({
      id: a.id,
      createdLabel: dt.format(new Date(a.createdAt)),
      actorEmail: a.actorEmail,
      action: a.action,
      target: a.target,
      partnerName: a.partnerId ? (partnerName.get(a.partnerId) ?? null) : null,
      changes: describe(a, { partnerName, roleName, orgName }, t),
      reason: a.reason,
    }))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500 mt-1">{subtitle}</p>
      </div>
      <UsersAdmin
        actorEmail={data.identity.email}
        actor={data.actor}
        actorPartnerId={data.identity.tenant?.partnerId ?? null}
        roles={data.roles}
        partners={data.partners.map((p) => ({
          id: p.id,
          name: p.commercialName,
          isOperator: p.isOperator,
          status: p.status,
          agentMenus: p.agentMenus,
        }))}
        organisations={data.organisations}
        users={data.users}
        audit={audit}
      />
    </div>
  )
}

/* Os campos que o registo mostra, pela ordem; a etiqueta vem de
   `bo.pro.users.field.<campo>`. */
const FIELDS = ["label", "role_id", "partner_id", "organisation_id", "agent_menus", "active", "role"]

/** "Perfil: Agente do parceiro → Admin do parceiro", uma linha por campo. */
function describe(
  a: AuditEntry,
  names: {
    partnerName: Map<string, string>
    roleName: Map<string, string>
    orgName: Map<string, string>
  },
  t: Translator
): string {
  const show = (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "—"
    if (key === "partner_id") return names.partnerName.get(String(value)) ?? String(value)
    if (key === "role_id") return names.roleName.get(String(value)) ?? String(value)
    if (key === "organisation_id") return names.orgName.get(String(value)) ?? String(value)
    if (key === "active") return value ? t("bo.pro.common.yes") : t("bo.pro.common.no")
    if (key === "role") return value === "manager" ? t("bo.pro.common.yes") : t("bo.pro.common.no")
    if (Array.isArray(value)) return value.join(", ") || t("bo.pro.common.none")
    return String(value)
  }

  const after = a.after ?? {}
  const before = a.before ?? {}
  const label = (k: string) => t(`bo.pro.users.field.${k}`)
  return FIELDS
    .filter((k) => (a.before ? JSON.stringify(before[k]) !== JSON.stringify(after[k]) : after[k] != null))
    .map((k) =>
      a.before
        ? `${label(k)}: ${show(k, before[k])} → ${show(k, after[k])}`
        : `${label(k)}: ${show(k, after[k])}`
    )
    .join("\n")
}
