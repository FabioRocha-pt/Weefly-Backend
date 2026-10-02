import { notFound } from "next/navigation"
import { Users } from "lucide-react"

import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getBoScope } from "@/lib/bo-scope"
import { getProAccount } from "@/lib/pro-account"
import { loadProClients } from "@/lib/pro-clients"
import { LOCALE_TAGS } from "@/i18n/config"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * OCT-17 · os clientes de todos os parceiros, no Admin.
 *
 * Só o perfil Admin WeeFly (`crossPartner`) vê clientes de mais de um
 * parceiro (TEN-03): qualquer outro recebe 404, e a leitura volta a filtrar
 * pelo parceiro da sessão (`lib/pro-clients`). Filtro por parceiro e pesquisa
 * por nome, telefone ou email, no endereço (`?parceiro=` e `?q=`), para que um
 * resultado se possa partilhar e recarregar.
 */

export const dynamic = "force-dynamic"

export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams: { parceiro?: string; q?: string }
}) {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) notFound()
  const { t, locale } = await getBoI18n()
  const account = await getProAccount()

  const partnerId = /^[0-9a-f-]{36}$/i.test(searchParams.parceiro ?? "") ? searchParams.parceiro! : null
  const q = (searchParams.q ?? "").trim().slice(0, 100)

  const [{ data: partnerRows }, result] = await Promise.all([
    scope.db.from("partners").select("id, commercial_name, is_operator").order("is_operator", { ascending: false }).order("commercial_name"),
    account ? loadProClients(account, { partnerId, q }) : Promise.resolve(null),
  ])
  const partners = (partnerRows ?? []) as { id: string; commercial_name: string }[]

  if (!result || !result.ok) {
    return (
      <SectionPlaceholder
        icon={<Users className="w-8 h-8 text-orange-600" />}
        title={t("bo.adminClients.title")}
        description={result && result.reason === "error" ? t("pro.clientsError") : t("pro.clientsNoAccess")}
      />
    )
  }

  const date = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium" })
  const field =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.adminClients.title")}</h1>
        <p className="text-slate-500 mt-1">{t("pro.clientsCount", { count: String(result.clients.length) })}</p>
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
          placeholder={t("bo.adminClients.searchPlaceholder")}
          aria-label={t("bo.adminClients.searchPlaceholder")}
          className={`${field} flex-1 min-w-[220px]`}
        />
        <button type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
          {t("bo.adminClients.search")}
        </button>
      </form>

      {result.clients.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
          {q || partnerId ? t("bo.adminClients.noMatch") : t("pro.clientsEmpty")}
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">{t("pro.clientName")}</th>
                <th className="px-5 py-3 font-semibold">{t("bo.adminClients.partner")}</th>
                <th className="px-5 py-3 font-semibold">{t("pro.clientContacts")}</th>
                <th className="px-5 py-3 font-semibold text-right">{t("pro.clientRequests")}</th>
                <th className="px-5 py-3 font-semibold">{t("pro.clientLastRequest")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.clients.map((c) => (
                <tr key={`${c.partnerId}-${c.leadId}`} className="hover:bg-slate-50 align-top">
                  <td className="px-5 py-3 font-semibold text-slate-900">{c.name}</td>
                  <td className="px-5 py-3 text-slate-600">{c.partnerName ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {c.email && <div className="truncate max-w-[16rem]">{c.email}</div>}
                    {c.phone && <div className="text-slate-500">{c.phone}</div>}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{c.requests}</td>
                  <td className="px-5 py-3 text-slate-600">{date.format(new Date(c.lastRequestAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
