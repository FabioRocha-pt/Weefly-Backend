import Link from "next/link"

import type { ActivityRow } from "@/lib/b2g-activity"
import { LOCALE_TAGS } from "@/i18n/config"
import type { Translator } from "@/i18n/translate"

/**
 * B2G-19 · o registo: a tabela e o filtro, partilhados entre o backoffice do
 * parceiro e o Admin (por ministério, e na visão geral).
 *
 * Um `<form role="search">` por GET, como o `/gestao/concierge`: o filtro
 * vive no endereço, e por isso a exportação (que lê o mesmo endereço) nunca
 * mostra outra coisa que o ecrã.
 */
export function ActivityLog({
  rows,
  t,
  locale,
  basePath,
  filters,
  organisations,
  secretaries,
  partners,
  exportHref,
}: {
  rows: ActivityRow[]
  t: Translator
  locale: "pt" | "en"
  basePath: string
  filters: { organisationId?: string; secretaryId?: string; from?: string; to?: string; partnerId?: string }
  /** Omitir quando o registo já está preso a um ministério (a ficha dele). */
  organisations?: { id: string; name: string }[]
  secretaries: { id: string; name: string; organisationId: string }[]
  /** Só na visão geral do Admin. */
  partners?: { id: string; commercial_name: string }[]
  exportHref: string
}) {
  const dt = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "short", timeStyle: "short" })
  const orgNames = new Map((organisations ?? []).map((o) => [o.id, o.name]))
  const field =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"

  /* As secretárias do filtro: se já há um ministério escolhido, só as dele. */
  const secretaryOptions = filters.organisationId
    ? secretaries.filter((s) => s.organisationId === filters.organisationId)
    : secretaries

  return (
    <div className="space-y-4">
      <form action={basePath} method="get" role="search" className="flex flex-wrap items-end gap-2">
        {partners && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t("bo.activity.filters.company")}
            <select name="empresa" defaultValue={filters.partnerId ?? ""} className={field}>
              <option value="">{t("bo.activity.filters.allCompanies")}</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.commercial_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {organisations && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t("bo.activity.filters.ministry")}
            <select name="ministerio" defaultValue={filters.organisationId ?? ""} className={field}>
              <option value="">{t("bo.activity.filters.allMinistries")}</option>
              {organisations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          {t("bo.activity.filters.secretary")}
          <select name="secretaria" defaultValue={filters.secretaryId ?? ""} className={field}>
            <option value="">{t("bo.activity.filters.allSecretaries")}</option>
            {secretaryOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          {t("bo.activity.filters.from")}
          <input type="date" name="de" defaultValue={filters.from ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          {t("bo.activity.filters.to")}
          <input type="date" name="ate" defaultValue={filters.to ?? ""} className={field} />
        </label>
        <button type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
          {t("bo.activity.filters.submit")}
        </button>
        <Link
          href={exportHref}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t("bo.activity.export")}
        </Link>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          {t("bo.activity.empty")}
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("bo.activity.table.when")}</th>
                {organisations && <th className="px-4 py-3">{t("bo.activity.table.ministry")}</th>}
                <th className="px-4 py-3">{t("bo.activity.table.author")}</th>
                <th className="px-4 py-3">{t("bo.activity.table.action")}</th>
                <th className="px-4 py-3">{t("bo.activity.table.reference")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">{dt.format(new Date(r.at))}</td>
                  {organisations && (
                    <td className="px-4 py-2 text-slate-600">{(r.organisationId && orgNames.get(r.organisationId)) ?? "—"}</td>
                  )}
                  <td className="px-4 py-2 text-slate-600">{r.author ?? "—"}</td>
                  <td className="px-4 py-2">{r.description ?? r.action}</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{r.caseReference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
