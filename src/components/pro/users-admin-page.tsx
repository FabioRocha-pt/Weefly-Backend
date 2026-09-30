import { notFound } from "next/navigation"

import { loadAccessAdmin, type AuditEntry } from "@/lib/access-admin"
import { UsersAdmin, type UsersAdminAudit } from "@/components/pro/users-admin"

/**
 * ADM-02 · o ecrã de Utilizadores e permissões, para as duas portas por onde
 * se chega a ele: o Admin (`/gestao/utilizadores`, Admin WeeFly) e o Agente
 * (`/agente/equipa`, Admin do parceiro). Quem não gere ninguém recebe 404 —
 * TEN-06: "inacessíveis pelo endereço direto".
 */
export async function UsersAdminPage({ title, subtitle }: { title: string; subtitle: string }) {
  const data = await loadAccessAdmin()
  if (!data) notFound()

  const dt = new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" })
  const partnerName = new Map(data.partners.map((p) => [p.id, p.commercialName]))
  const roleName = new Map(data.roles.map((r) => [r.id, r.labelPt]))
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
      changes: describe(a, { partnerName, roleName, orgName }),
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

const FIELD_LABEL: Record<string, string> = {
  label: "Nome",
  role_id: "Perfil",
  partner_id: "Parceiro",
  organisation_id: "Ministério",
  agent_menus: "Menus",
  active: "Activa",
  role: "Vendedor",
}

/** "Perfil: Agente do parceiro → Admin do parceiro", uma linha por campo. */
function describe(
  a: AuditEntry,
  names: {
    partnerName: Map<string, string>
    roleName: Map<string, string>
    orgName: Map<string, string>
  }
): string {
  const show = (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "—"
    if (key === "partner_id") return names.partnerName.get(String(value)) ?? String(value)
    if (key === "role_id") return names.roleName.get(String(value)) ?? String(value)
    if (key === "organisation_id") return names.orgName.get(String(value)) ?? String(value)
    if (key === "active") return value ? "sim" : "não"
    if (key === "role") return value === "manager" ? "sim" : "não"
    if (Array.isArray(value)) return value.join(", ") || "nenhum"
    return String(value)
  }

  const after = a.after ?? {}
  const before = a.before ?? {}
  return Object.keys(FIELD_LABEL)
    .filter((k) => (a.before ? JSON.stringify(before[k]) !== JSON.stringify(after[k]) : after[k] != null))
    .map((k) =>
      a.before
        ? `${FIELD_LABEL[k]}: ${show(k, before[k])} → ${show(k, after[k])}`
        : `${FIELD_LABEL[k]}: ${show(k, after[k])}`
    )
    .join("\n")
}
