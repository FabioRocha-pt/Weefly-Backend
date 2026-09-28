import Link from "next/link"
import { Users } from "lucide-react"

import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getProAccount } from "@/lib/pro-account"
import { loadProClients } from "@/lib/pro-clients"
import { LOCALE_TAGS } from "@/i18n/config"
import { getI18n } from "@/i18n/server"

/**
 * PRO-05 · os clientes da empresa: nome, contactos, número de pedidos e data do
 * último. Construída a partir dos casos — ver `lib/pro-clients.ts`.
 */
export default async function ClientesPage() {
  const { t, locale } = getI18n()
  const account = await getProAccount()
  const result = account ? await loadProClients(account) : null

  if (!result || !result.ok) {
    return (
      <SectionPlaceholder
        icon={<Users className="w-8 h-8 text-orange-600" />}
        title={t("dashboard.clientsTitle")}
        description={
          result && result.reason === "error" ? t("pro.clientsError") : t("pro.clientsNoAccess")
        }
      />
    )
  }

  if (result.clients.length === 0) {
    return (
      <SectionPlaceholder
        icon={<Users className="w-8 h-8 text-orange-600" />}
        title={t("dashboard.clientsTitle")}
        description={t("pro.clientsEmpty")}
      />
    )
  }

  const date = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium" })

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("dashboard.clientsTitle")}</h1>
        <p className="text-slate-500 mt-1">
          {t("pro.clientsCount", { count: String(result.clients.length) })}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">{t("pro.clientName")}</th>
              <th className="px-5 py-3 font-semibold">{t("pro.clientContacts")}</th>
              <th className="px-5 py-3 font-semibold text-right">{t("pro.clientRequests")}</th>
              <th className="px-5 py-3 font-semibold">{t("pro.clientLastRequest")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.clients.map((c) => (
              <tr key={c.leadId} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link
                    href={`/agente/clientes/${c.leadId}`}
                    className="font-semibold text-slate-900 hover:text-orange-600"
                  >
                    {c.name}
                  </Link>
                </td>
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
    </div>
  )
}
