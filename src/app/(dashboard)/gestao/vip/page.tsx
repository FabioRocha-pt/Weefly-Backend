import { notFound } from "next/navigation"

import { getBoScope } from "@/lib/bo-scope"
import { listVipClients } from "@/lib/vip"
import { LOCALE_TAGS } from "@/i18n/config"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * B2G-22 · "O master vê os VIP de todas as empresas no Admin."
 *
 * Só o perfil Admin WeeFly (`crossPartner`): qualquer outro recebe 404. A
 * leitura é a da sessão, e o RLS (`vip_clients_select`) já lhe mostra todas
 * as empresas. Só leitura: quem cria e desactiva é a empresa (decisão D-9).
 * Filtro por empresa e pesquisa no endereço (`?parceiro=` e `?q=`).
 */

export const dynamic = "force-dynamic"

export default async function AdminVipPage({
  searchParams,
}: {
  searchParams: { parceiro?: string; q?: string }
}) {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) notFound()
  const { t, locale } = await getBoI18n()

  const partnerId = /^[0-9a-f-]{36}$/i.test(searchParams.parceiro ?? "") ? searchParams.parceiro! : null
  const q = (searchParams.q ?? "").trim().slice(0, 100)

  const [{ data: partnerRows }, vips] = await Promise.all([
    scope.db.from("partners").select("id, commercial_name, is_operator").order("is_operator", { ascending: false }).order("commercial_name"),
    listVipClients(scope, { allPartners: true, partnerId, q }),
  ])
  const partners = (partnerRows ?? []) as { id: string; commercial_name: string }[]

  const date = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium" })
  const field =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.vip.admin.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.vip.admin.subtitle", { count: String(vips.length) })}</p>
      </div>

      <form className="flex flex-wrap gap-2" role="search">
        <select name="parceiro" defaultValue={partnerId ?? ""} className={field} aria-label={t("bo.adminClients.partner")}>
          <option value="">{t("bo.adminClients.allPartners")}</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.commercial_name}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t("bo.vip.admin.searchPlaceholder")}
          aria-label={t("bo.vip.admin.searchPlaceholder")}
          className={`${field} flex-1 min-w-[220px]`}
        />
        <button type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
          {t("bo.adminClients.search")}
        </button>
      </form>

      {vips.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
          {q || partnerId ? t("bo.adminClients.noMatch") : t("bo.vip.admin.empty")}
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">{t("bo.vip.list.client")}</th>
                <th className="px-5 py-3 font-semibold">{t("bo.adminClients.partner")}</th>
                <th className="px-5 py-3 font-semibold">{t("bo.vip.list.contacts")}</th>
                <th className="px-5 py-3 font-semibold">{t("bo.vip.admin.state")}</th>
                <th className="px-5 py-3 font-semibold">{t("bo.vip.list.since")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vips.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50 align-top">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-900">{v.name}</div>
                    <div className="text-xs text-slate-500">{v.level ?? "—"}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{v.partnerName ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {v.email && <div className="truncate max-w-[16rem]">{v.email}</div>}
                    {v.phone && <div className="text-slate-500">{v.phone}</div>}
                  </td>
                  <td className="px-5 py-3">
                    {v.active ? (
                      <span className="text-emerald-700">{t("bo.vip.admin.active")}</span>
                    ) : (
                      <span className="text-slate-500">{t("bo.vip.list.inactive")}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {date.format(new Date(v.createdAt))}
                    {v.createdByEmail && <div className="text-xs text-slate-500">{v.createdByEmail}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
