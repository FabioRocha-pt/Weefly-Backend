"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { reactivateUser, resendInvite, saveUser, suspendUser } from "@/actions/access"
import { canGrant, type AccessProfile } from "@/lib/access-roles"

/**
 * WeeFly · ADM-02 · Utilizadores e permissões.
 *
 * O mesmo ecrã para o Admin WeeFly (todos os parceiros) e para o Admin do
 * parceiro (só o seu): o que muda é o que o servidor lhe manda, e o que o RLS
 * aceita. Os perfis oferecidos são os que `canGrant` deixa — a mesma regra que
 * a base de dados impõe —, para que o ecrã não ofereça o que vai ser recusado.
 */

type Menu = "flights" | "cars" | "houses" | "experiences" | "food"

const MENUS: { id: Menu; label: string }[] = [
  { id: "flights", label: "Passagens" },
  { id: "cars", label: "Carros" },
  { id: "houses", label: "Casas" },
  { id: "experiences", label: "Experiências" },
  { id: "food", label: "Comida" },
]

export interface UsersAdminPartner {
  id: string
  name: string
  isOperator: boolean
  status: "active" | "suspended"
  agentMenus: string[]
}

export interface UsersAdminUser {
  email: string
  label: string | null
  roleId: string
  partnerId: string
  organisationId: string | null
  agentMenus: string[] | null
  active: boolean
  suspendedAt: string | null
  suspendedBy: string | null
  suspendReason: string | null
}

export interface UsersAdminAudit {
  id: string
  createdLabel: string
  actorEmail: string
  action: string
  target: string
  partnerName: string | null
  changes: string
  reason: string | null
}

interface Props {
  actorEmail: string
  actor: AccessProfile
  /** O parceiro do actor. Um Admin do parceiro só cria contas nele. */
  actorPartnerId: string | null
  roles: AccessProfile[]
  partners: UsersAdminPartner[]
  organisations: { id: string; partnerId: string; name: string }[]
  users: UsersAdminUser[]
  audit: UsersAdminAudit[]
}

const ACTION_LABEL: Record<string, string> = {
  user_created: "Conta criada",
  user_updated: "Conta alterada",
  user_suspended: "Conta suspensa",
  user_reactivated: "Conta reactivada",
  partner_created: "Parceiro criado",
  partner_updated: "Parceiro alterado",
  partner_suspended: "Parceiro suspenso",
  partner_reactivated: "Parceiro reactivado",
}

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100"

interface Draft {
  mode: "create" | "update"
  email: string
  label: string
  roleId: string
  partnerId: string
  organisationId: string
  /** `null`: os menus da empresa. */
  agentMenus: Menu[] | null
  invite: boolean
}

export function UsersAdmin({
  actorEmail,
  actor,
  actorPartnerId,
  roles,
  partners,
  organisations,
  users,
  audit,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [suspending, setSuspending] = useState<{ email: string; reason: string } | null>(null)
  const [filter, setFilter] = useState<string>("all")
  const [query, setQuery] = useState("")

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners])
  const roleById = useMemo(() => new Map<string, AccessProfile>(roles.map((r) => [r.id, r])), [roles])
  const orgById = useMemo(() => new Map(organisations.map((o) => [o.id, o])), [organisations])

  const grantable = (partnerId: string) => {
    const partner = partnerById.get(partnerId)
    if (!partner) return []
    return roles.filter((r) =>
      canGrant(actor, r, { isOperator: partner.isOperator, isOwn: partnerId === actorPartnerId })
    )
  }

  const creatablePartners = partners.filter(
    (p) => actor.manageUsers === "all" || p.id === actorPartnerId
  )

  const openCreate = () => {
    const partnerId = creatablePartners[0]?.id ?? ""
    setDraft({
      mode: "create",
      email: "",
      label: "",
      roleId: grantable(partnerId)[0]?.id ?? "",
      partnerId,
      organisationId: "",
      agentMenus: null,
      invite: true,
    })
    setMessage(null)
  }

  const openEdit = (u: UsersAdminUser) => {
    setDraft({
      mode: "update",
      email: u.email,
      label: u.label ?? "",
      roleId: u.roleId,
      partnerId: u.partnerId,
      organisationId: u.organisationId ?? "",
      agentMenus: (u.agentMenus as Menu[] | null) ?? null,
      invite: false,
    })
    setMessage(null)
  }

  const run = (action: () => Promise<{ ok: true; notice?: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      setMessage(null)
      const result = await action()
      setMessage(result.ok ? { ok: true, text: result.notice ?? "Feito." } : { ok: false, text: result.error })
      if (result.ok) {
        after?.()
        router.refresh()
      }
    })

  const submit = () => {
    if (!draft) return
    run(
      () =>
        saveUser({
          mode: draft.mode,
          email: draft.email,
          label: draft.label,
          roleId: draft.roleId as never,
          partnerId: draft.partnerId,
          organisationId: draft.organisationId || null,
          agentMenus: draft.agentMenus,
          invite: draft.invite,
        }),
      () => setDraft(null)
    )
  }

  const visible = users.filter((u) => {
    if (filter !== "all" && u.partnerId !== filter) return false
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return `${u.email} ${u.label ?? ""}`.toLowerCase().includes(q)
  })

  const draftRole = draft ? roleById.get(draft.roleId) : undefined
  const draftPartner = draft ? partnerById.get(draft.partnerId) : undefined
  const draftOrgs = draft ? organisations.filter((o) => o.partnerId === draft.partnerId) : []

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {actor.manageUsers === "all" && (
            <select className={`${field} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Todos os parceiros</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <input
            className={`${field} w-64`}
            placeholder="Procurar por nome ou email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex-1" />
          <Button size="sm" onClick={openCreate} disabled={pending || creatablePartners.length === 0}>
            Novo utilizador
          </Button>
        </div>

        {message && (
          <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="status">
            {message.text}
          </p>
        )}

        {draft && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">
              {draft.mode === "create" ? "Novo utilizador" : `Editar ${draft.email}`}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-slate-600">Email</span>
                <input
                  className={field}
                  type="email"
                  value={draft.email}
                  disabled={draft.mode === "update"}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-600">Nome</span>
                <input
                  className={field}
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-600">Parceiro</span>
                <select
                  className={field}
                  value={draft.partnerId}
                  disabled={actor.manageUsers !== "all"}
                  onChange={(e) => {
                    const partnerId = e.target.value
                    const options = grantable(partnerId)
                    setDraft({
                      ...draft,
                      partnerId,
                      organisationId: "",
                      roleId: options.some((r) => r.id === draft.roleId)
                        ? draft.roleId
                        : (options[0]?.id ?? ""),
                    })
                  }}
                >
                  {creatablePartners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isOperator ? " (operador)" : ""}
                      {p.status === "suspended" ? " · suspenso" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-600">Perfil</span>
                <select
                  className={field}
                  value={draft.roleId}
                  onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}
                >
                  {grantable(draft.partnerId).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.labelPt}
                    </option>
                  ))}
                </select>
              </label>
              {draftRole?.needsOrganisation && (
                <label className="text-sm space-y-1 md:col-span-2">
                  <span className="text-slate-600">Ministério</span>
                  <select
                    className={field}
                    value={draft.organisationId}
                    onChange={(e) => setDraft({ ...draft, organisationId: e.target.value })}
                  >
                    <option value="">— escolha —</option>
                    {draftOrgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  {draftOrgs.length === 0 && (
                    <span className="text-xs text-amber-700">
                      Este parceiro ainda não tem ministérios (PAR-02).
                    </span>
                  )}
                </label>
              )}
            </div>

            {draftRole?.backoffice && draftPartner && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-slate-900">Menus do Agente</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.agentMenus === null}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        agentMenus: e.target.checked ? null : (draftPartner.agentMenus as Menu[]),
                      })
                    }
                  />
                  Os mesmos da empresa
                </label>
                {draft.agentMenus !== null && (
                  <div className="flex flex-wrap gap-3 pl-6">
                    {MENUS.filter((m) => draftPartner.agentMenus.includes(m.id)).map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.agentMenus!.includes(m.id)}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              agentMenus: draft.agentMenus!.includes(m.id)
                                ? draft.agentMenus!.filter((x) => x !== m.id)
                                : [...draft.agentMenus!, m.id],
                            })
                          }
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            )}

            {draft.mode === "create" && draftRole?.backoffice && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.invite}
                  onChange={(e) => setDraft({ ...draft, invite: e.target.checked })}
                />
                Enviar o convite por email agora
              </label>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={pending || !draft.roleId}>
                {draft.mode === "create" ? "Criar" : "Guardar"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDraft(null)} disabled={pending}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Utilizador</th>
                <th className="px-4 py-3 font-semibold">Perfil</th>
                <th className="px-4 py-3 font-semibold">Parceiro</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acções</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((u) => {
                const role = roleById.get(u.roleId)
                const partner = partnerById.get(u.partnerId)
                const org = u.organisationId ? orgById.get(u.organisationId) : undefined
                const editable =
                  u.email !== actorEmail &&
                  Boolean(role && partner) &&
                  canGrant(actor, role!, {
                    isOperator: partner!.isOperator,
                    isOwn: u.partnerId === actorPartnerId,
                  })
                return (
                  <tr key={u.email} className={u.active ? "" : "bg-slate-50 text-slate-500"}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{u.label ?? u.email}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {role?.labelPt ?? u.roleId}
                      {org && <p className="text-xs text-slate-500">{org.name}</p>}
                      {u.agentMenus && (
                        <p className="text-xs text-slate-500">
                          Menus: {u.agentMenus.map((m) => MENUS.find((x) => x.id === m)?.label ?? m).join(", ") || "nenhum"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">{partner?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {u.active ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Activa
                        </span>
                      ) : (
                        <div>
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Suspensa
                          </span>
                          {u.suspendReason && (
                            <p className="mt-1 text-xs text-slate-500">
                              {u.suspendReason}
                              {u.suspendedBy ? ` · ${u.suspendedBy}` : ""}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.email === actorEmail ? (
                        <p className="text-right text-xs text-slate-400">A sua conta</p>
                      ) : editable ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => openEdit(u)}>
                            Editar
                          </Button>
                          {u.active ? (
                            <>
                              {role?.backoffice && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending}
                                  onClick={() => run(() => resendInvite(u.email))}
                                >
                                  Reenviar convite
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={pending}
                                onClick={() => setSuspending({ email: u.email, reason: "" })}
                              >
                                Suspender
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm(`Reactivar ${u.email}?`)) run(() => reactivateUser(u.email))
                              }}
                            >
                              Reactivar
                            </Button>
                          )}
                        </div>
                      ) : (
                        <p className="text-right text-xs text-slate-400">Só leitura</p>
                      )}
                      {suspending?.email === u.email && (
                        <div className="mt-3 space-y-2 rounded-xl bg-red-50 p-3">
                          <textarea
                            className={`${field} min-h-[70px]`}
                            placeholder="Motivo (fica no registo)"
                            value={suspending.reason}
                            onChange={(e) => setSuspending({ ...suspending, reason: e.target.value })}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={pending}
                              onClick={() => {
                                if (!window.confirm(`Suspender ${u.email}? As sessões abertas terminam já.`)) return
                                run(
                                  () => suspendUser({ email: u.email, reason: suspending.reason }),
                                  () => setSuspending(null)
                                )
                              }}
                            >
                              Confirmar suspensão
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setSuspending(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Nenhum utilizador.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Registo de alterações
        </h2>
        {audit.length === 0 ? (
          <p className="text-sm text-slate-500">Ainda não há alterações registadas.</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Quem</th>
                  <th className="px-4 py-3 font-semibold">O quê</th>
                  <th className="px-4 py-3 font-semibold">Antes → depois</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{a.createdLabel}</td>
                    <td className="px-4 py-3 text-slate-600">{a.actorEmail}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{ACTION_LABEL[a.action] ?? a.action}</p>
                      <p className="text-xs text-slate-500">
                        {a.target}
                        {a.partnerName ? ` · ${a.partnerName}` : ""}
                      </p>
                      {a.reason && <p className="text-xs text-slate-500">Motivo: {a.reason}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-pre-line">{a.changes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
