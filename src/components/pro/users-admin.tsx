"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { reactivateUser, resendInvite, saveUser, suspendUser } from "@/actions/access"
import { canGrant, type AccessProfile } from "@/lib/access-roles"
import { useI18n } from "@/i18n/provider"
import { translateOr } from "@/i18n/translate"

/**
 * WeeFly · ADM-02 · Utilizadores e permissões.
 *
 * O mesmo ecrã para o Admin WeeFly (todos os parceiros) e para o Admin do
 * parceiro (só o seu): o que muda é o que o servidor lhe manda, e o que o RLS
 * aceita. Os perfis oferecidos são os que `canGrant` deixa — a mesma regra que
 * a base de dados impõe —, para que o ecrã não ofereça o que vai ser recusado.
 */

type Menu = "flights" | "cars" | "houses" | "experiences" | "food"

/* A etiqueta de cada menu vem de `pro.menu.<id>`. */
const MENUS: Menu[] = ["flights", "cars", "houses", "experiences", "food"]

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
  const { t, locale } = useI18n()
  const roleLabel = (r: AccessProfile) => (locale === "pt" ? r.labelPt : r.labelEn)
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
      setMessage(result.ok ? { ok: true, text: result.notice ?? t("bo.pro.common.done") } : { ok: false, text: result.error })
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
              <option value="all">{t("bo.pro.users.allPartners")}</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <input
            className={`${field} w-64`}
            placeholder={t("bo.pro.users.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex-1" />
          <Button size="sm" onClick={openCreate} disabled={pending || creatablePartners.length === 0}>
            {t("bo.pro.users.newUser")}
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
              {draft.mode === "create" ? t("bo.pro.users.newUser") : t("bo.pro.common.editNamed", { name: draft.email })}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-slate-600">{t("bo.pro.common.email")}</span>
                <input
                  className={field}
                  type="email"
                  value={draft.email}
                  disabled={draft.mode === "update"}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-600">{t("bo.pro.common.name")}</span>
                <input
                  className={field}
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-600">{t("bo.pro.common.partner")}</span>
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
                      {p.isOperator ? t("bo.pro.common.operatorSuffix") : ""}
                      {p.status === "suspended" ? t("bo.pro.users.suspendedSuffix") : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-600">{t("bo.pro.common.profile")}</span>
                <select
                  className={field}
                  value={draft.roleId}
                  onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}
                >
                  {grantable(draft.partnerId).map((r) => (
                    <option key={r.id} value={r.id}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
              {draftRole?.needsOrganisation && (
                <label className="text-sm space-y-1 md:col-span-2">
                  <span className="text-slate-600">{t("bo.pro.common.ministry")}</span>
                  <select
                    className={field}
                    value={draft.organisationId}
                    onChange={(e) => setDraft({ ...draft, organisationId: e.target.value })}
                  >
                    <option value="">{t("bo.pro.users.chooseOption")}</option>
                    {draftOrgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  {draftOrgs.length === 0 && (
                    <span className="text-xs text-amber-700">
                      {t("bo.pro.users.noMinistries")}
                    </span>
                  )}
                </label>
              )}
            </div>

            {draftRole?.backoffice && draftPartner && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-slate-900">{t("bo.pro.common.agentMenus")}</legend>
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
                  {t("bo.pro.users.sameAsCompany")}
                </label>
                {draft.agentMenus !== null && (
                  <div className="flex flex-wrap gap-3 pl-6">
                    {MENUS.filter((m) => draftPartner.agentMenus.includes(m)).map((m) => (
                      <label key={m} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.agentMenus!.includes(m)}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              agentMenus: draft.agentMenus!.includes(m)
                                ? draft.agentMenus!.filter((x) => x !== m)
                                : [...draft.agentMenus!, m],
                            })
                          }
                        />
                        {t(`pro.menu.${m}`)}
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
                {t("bo.pro.users.sendInvite")}
              </label>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={pending || !draft.roleId}>
                {draft.mode === "create" ? t("bo.pro.common.create") : t("bo.pro.common.save")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDraft(null)} disabled={pending}>
                {t("bo.pro.common.cancel")}
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("bo.pro.users.colUser")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.pro.common.profile")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.pro.common.partner")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.pro.common.state")}</th>
                <th className="px-4 py-3 font-semibold text-right">{t("bo.pro.common.actions")}</th>
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
                      {role ? roleLabel(role) : u.roleId}
                      {org && <p className="text-xs text-slate-500">{org.name}</p>}
                      {u.agentMenus && (
                        <p className="text-xs text-slate-500">
                          {t("bo.pro.users.menusList", {
                            menus:
                              u.agentMenus.map((m) => translateOr(t, `pro.menu.${m}`, m)).join(", ") ||
                              t("bo.pro.common.none"),
                          })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">{partner?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {u.active ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {t("bo.pro.users.active")}
                        </span>
                      ) : (
                        <div>
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                            {t("bo.pro.users.suspended")}
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
                        <p className="text-right text-xs text-slate-400">{t("bo.pro.users.yourAccount")}</p>
                      ) : editable ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => openEdit(u)}>
                            {t("bo.pro.common.edit")}
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
                                  {t("bo.pro.users.resendInvite")}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={pending}
                                onClick={() => setSuspending({ email: u.email, reason: "" })}
                              >
                                {t("bo.pro.common.suspend")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm(t("bo.pro.common.reactivateConfirm", { name: u.email }))) run(() => reactivateUser(u.email))
                              }}
                            >
                              {t("bo.pro.common.reactivate")}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <p className="text-right text-xs text-slate-400">{t("bo.pro.users.readOnly")}</p>
                      )}
                      {suspending?.email === u.email && (
                        <div className="mt-3 space-y-2 rounded-xl bg-red-50 p-3">
                          <textarea
                            className={`${field} min-h-[70px]`}
                            placeholder={t("bo.pro.common.reasonPlaceholder")}
                            value={suspending.reason}
                            onChange={(e) => setSuspending({ ...suspending, reason: e.target.value })}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={pending}
                              onClick={() => {
                                if (!window.confirm(t("bo.pro.users.suspendConfirm", { email: u.email }))) return
                                run(
                                  () => suspendUser({ email: u.email, reason: suspending.reason }),
                                  () => setSuspending(null)
                                )
                              }}
                            >
                              {t("bo.pro.common.confirmSuspension")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setSuspending(null)}>
                              {t("bo.pro.common.cancel")}
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
                    {t("bo.pro.users.noUsers")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t("bo.pro.users.changeLog")}
        </h2>
        {audit.length === 0 ? (
          <p className="text-sm text-slate-500">{t("bo.pro.users.noChanges")}</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t("bo.pro.common.date")}</th>
                  <th className="px-4 py-3 font-semibold">{t("bo.pro.users.colWho")}</th>
                  <th className="px-4 py-3 font-semibold">{t("bo.pro.users.colWhat")}</th>
                  <th className="px-4 py-3 font-semibold">{t("bo.pro.users.colBeforeAfter")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{a.createdLabel}</td>
                    <td className="px-4 py-3 text-slate-600">{a.actorEmail}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{translateOr(t, `bo.pro.users.action.${a.action}`, a.action)}</p>
                      <p className="text-xs text-slate-500">
                        {a.target}
                        {a.partnerName ? ` · ${a.partnerName}` : ""}
                      </p>
                      {a.reason && <p className="text-xs text-slate-500">{t("bo.pro.users.reason", { reason: a.reason })}</p>}
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
