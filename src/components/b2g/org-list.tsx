import Link from "next/link"

import { formatAmount } from "@/lib/case-status"
import type { OrganisationSummary } from "@/lib/b2g"
import { LOCALE_TAGS } from "@/i18n/config"
import type { Translator } from "@/i18n/translate"

/**
 * PAR-02 · ADM-08 · a lista dos ministérios: secretárias, saldo, limite,
 * último alerta, número de pedidos.
 *
 * B2G-05 · B2G-24 · cada ministério com o brasão (ou o logótipo) **e** o nome:
 * os brasões são todos iguais, sozinhos não distinguem nada.
 */
export function OrganisationList({
  orgs,
  hrefFor,
  t,
  locale,
}: {
  orgs: OrganisationSummary[]
  hrefFor: (id: string) => string
  t: Translator
  locale: "pt" | "en"
}) {
  const dt = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "short" })
  if (orgs.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
        {t("bo.b2g.list.empty")}
      </p>
    )
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">{t("bo.b2g.list.ministry")}</th>
            <th className="px-4 py-3">{t("bo.secretaries.title")}</th>
            <th className="px-4 py-3 text-right">{t("bo.b2g.detail.balance")}</th>
            <th className="px-4 py-3 text-right">{t("bo.b2g.list.threshold")}</th>
            <th className="px-4 py-3">{t("bo.b2g.list.lastAlert")}</th>
            <th className="px-4 py-3 text-right">{t("bo.b2g.detail.requests")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orgs.map((o) => {
            const below = o.threshold != null && o.balance < o.threshold
            return (
              <tr key={o.id} className={o.active ? "" : "text-slate-400"}>
                <td className="px-4 py-3">
                  <Link href={hrefFor(o.id)} className="inline-flex items-center gap-2 font-medium text-slate-900 hover:text-orange-700">
                    {(o.crestUrl ?? o.logoUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={(o.crestUrl ?? o.logoUrl)!} alt="" className="h-7 w-7 object-contain" />
                    )}
                    <span>{o.name}</span>
                  </Link>
                  <p className="text-xs font-mono text-slate-500">{o.slug}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{o.activeSecretaries.join(", ") || "—"}</td>
                <td className={`px-4 py-3 text-right font-mono ${below ? "text-red-700 font-semibold" : ""}`}>
                  {formatAmount(o.balance, o.currency)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-600">
                  {o.threshold != null ? formatAmount(o.threshold, o.currency) : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">{o.lastAlertAt ? dt.format(new Date(o.lastAlertAt)) : "—"}</td>
                <td className="px-4 py-3 text-right">{o.requests}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
