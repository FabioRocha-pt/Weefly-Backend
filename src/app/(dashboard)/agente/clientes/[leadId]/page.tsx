import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { getProAccount } from "@/lib/pro-account"
import { loadProClient } from "@/lib/pro-clients"
import { LOCALE_TAGS } from "@/i18n/config"
import { getI18n } from "@/i18n/server"

/**
 * PRO-05 · um cliente e os casos dele. Um cliente de outra empresa, aberto
 * pelo endereço, não existe (TEN-03: not-found, não forbidden).
 */
export default async function ClientePage({ params }: { params: { leadId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.leadId)) notFound()

  const { t, locale } = getI18n()
  const account = await getProAccount()
  const client = account ? await loadProClient(account, params.leadId) : null
  if (!client) notFound()

  const date = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium" })

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link
        href="/agente/clientes"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("nav.clients")}
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
        <div className="mt-2 text-sm text-slate-600 space-y-0.5">
          {client.email && <div>{client.email}</div>}
          {client.phone && <div>{client.phone}</div>}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {t("pro.clientSummary", {
            count: String(client.requests),
            date: date.format(new Date(client.lastRequestAt)),
          })}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">{t("pro.caseReference")}</th>
              <th className="px-5 py-3 font-semibold">{t("pro.caseRoute")}</th>
              <th className="px-5 py-3 font-semibold">{t("pro.caseDepart")}</th>
              <th className="px-5 py-3 font-semibold">{t("pro.caseState")}</th>
              <th className="px-5 py-3 font-semibold">{t("pro.caseCreated")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {client.cases.map((c) => (
              <tr key={c.caseId} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-mono">
                  <Link
                    href={`/admin/price-checker/${c.caseId}`}
                    className="text-slate-900 hover:text-orange-600"
                  >
                    {c.reference ?? "—"}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  {c.origin && c.destination ? `${c.origin} → ${c.destination}` : "—"}
                </td>
                <td className="px-5 py-3">
                  {c.departDate ? date.format(new Date(c.departDate)) : "—"}
                </td>
                <td className="px-5 py-3">
                  {c.closed ? t("pro.caseClosed") : t(`caseStages.${c.stage}`)}
                </td>
                <td className="px-5 py-3 text-slate-600">{date.format(new Date(c.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
