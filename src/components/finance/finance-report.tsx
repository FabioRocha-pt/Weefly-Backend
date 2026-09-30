import Link from "next/link"

import { formatAmount } from "@/lib/case-status"
import {
  groupBy,
  timeline,
  totalsOf,
  type IssuedTicket,
  type MinistryFinance,
  type MoneyTotals,
  type PeriodRange,
} from "@/lib/finance"
import { LOCALE_TAGS } from "@/i18n/config"
import type { Translator } from "@/i18n/translate"

/**
 * PAR-08 e ADM-03 · o mesmo relatório, com dois âmbitos. As somas vêm todas de
 * `lib/finance`, sobre as mesmas linhas — é o que faz "os números baterem".
 *
 * Sem JavaScript no browser: os filtros são um formulário GET, e o endereço
 * guarda o período — partilhável, e a exportação usa exactamente o mesmo.
 */

const PERIODS = ["today", "week", "month", "year", "custom"] as const

export function FinanceFilters({
  action,
  range,
  partners,
  partnerId,
  t,
}: {
  action: string
  range: PeriodRange
  /** ADM-03 · o filtro por parceiro, só no Admin. */
  partners?: { id: string; name: string }[]
  partnerId?: string | null
  t: Translator
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("bo.finance.period")}</span>
        <select name="period" defaultValue={range.period} className="rounded-lg border border-slate-300 px-3 py-2">
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {t(`bo.finance.periods.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("bo.finance.from")}</span>
        <input type="date" name="from" defaultValue={range.from} className="rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("bo.finance.to")}</span>
        <input type="date" name="to" defaultValue={range.to} className="rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      {partners && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("bo.finance.partner")}</span>
          <select name="partner" defaultValue={partnerId ?? ""} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t("bo.finance.allPartners")}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
        {t("bo.finance.apply")}
      </button>
      <p className="w-full text-xs text-slate-500">{t("bo.finance.customHint")}</p>
    </form>
  )
}

function Money({ totals, pick }: { totals: MoneyTotals[]; pick: (t: MoneyTotals) => number }) {
  if (totals.length === 0) return <>—</>
  return (
    <>
      {totals.map((x) => (
        <span key={x.currency} className="block whitespace-nowrap">
          {formatAmount(pick(x), x.currency)}
        </span>
      ))}
    </>
  )
}

function sum(totals: MoneyTotals[], key: "cases" | "tickets"): number {
  return totals.reduce((s, x) => s + x[key], 0)
}

export function FinanceReport({
  rows,
  range,
  mode,
  ministries,
  exportHref,
  t,
  locale,
}: {
  rows: IssuedTicket[]
  range: PeriodRange
  mode: "partner" | "admin"
  /** PAR-08 · por ministério: emitido, consumido, saldo. */
  ministries?: MinistryFinance[]
  exportHref: string
  t: Translator
  locale: "pt" | "en"
}) {
  const totals = totalsOf(rows)
  const byPartner = mode === "admin" ? groupBy(rows, "partner", "—") : []
  const byMinistry = groupBy(rows, "organisation", t("bo.finance.noMinistry"))
  const line = timeline(rows, range)
  const peak = Math.max(1, ...line.map((b) => b.tickets))
  const dt = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "short" })
  const missingCost = totals.reduce((s, x) => s + x.missingCost, 0)
  const missingCharged = totals.reduce((s, x) => s + x.missingCharged, 0)

  const card = (label: string, value: React.ReactNode, note?: string) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  )

  const groupTable = (groups: ReturnType<typeof groupBy>, head: string, showPartner: boolean) => (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">{head}</th>
            {showPartner && <th className="px-4 py-3">{t("bo.finance.partner")}</th>}
            <th className="px-4 py-3 text-right">{t("bo.finance.cases")}</th>
            <th className="px-4 py-3 text-right">{t("bo.finance.tickets")}</th>
            <th className="px-4 py-3 text-right">{t("bo.finance.cost")}</th>
            <th className="px-4 py-3 text-right">{t("bo.finance.unitCost")}</th>
            <th className="px-4 py-3 text-right">{t("bo.finance.charged")}</th>
            <th className="px-4 py-3 text-right">{t("bo.finance.commission")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((g) => (
            <tr key={g.key}>
              <td className="px-4 py-2 font-medium text-slate-900">{g.label}</td>
              {showPartner && <td className="px-4 py-2 text-slate-600">{g.partnerName}</td>}
              <td className="px-4 py-2 text-right">{sum(g.totals, "cases")}</td>
              <td className="px-4 py-2 text-right">{sum(g.totals, "tickets")}</td>
              <td className="px-4 py-2 text-right font-mono"><Money totals={g.totals} pick={(x) => x.cost} /></td>
              <td className="px-4 py-2 text-right font-mono">
                <Money totals={g.totals} pick={(x) => (x.tickets ? Math.round(x.cost / x.tickets) : 0)} />
              </td>
              <td className="px-4 py-2 text-right font-mono"><Money totals={g.totals} pick={(x) => x.charged} /></td>
              <td className="px-4 py-2 text-right font-mono text-slate-400">
                {g.totals.some((x) => x.commission) ? <Money totals={g.totals} pick={(x) => x.commission} /> : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {card(t("bo.finance.tickets"), sum(totals, "tickets"), t("bo.finance.casesNote", { count: sum(totals, "cases") }))}
        {card(t("bo.finance.cost"), <Money totals={totals} pick={(x) => x.cost} />, missingCost ? t("bo.finance.missingCost", { count: missingCost }) : undefined)}
        {card(t("bo.finance.charged"), <Money totals={totals} pick={(x) => x.charged} />, missingCharged ? t("bo.finance.missingCharged", { count: missingCharged }) : undefined)}
        {card(t("bo.finance.commission"), "—", t("bo.finance.commissionPending"))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t("bo.finance.rangeLine", { from: range.from, to: range.to })}</p>
        <a href={exportHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          {t("bo.finance.export")}
        </a>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.finance.timeline")}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {line.length === 0 ? (
            <p className="text-sm text-slate-500">—</p>
          ) : (
            <div className="flex items-end gap-1 h-32" role="img" aria-label={t("bo.finance.timeline")}>
              {line.map((b) => (
                <div key={b.bucket} className="flex-1 min-w-[3px] flex flex-col justify-end h-full" title={`${b.bucket} · ${b.tickets}`}>
                  <div className="rounded-t bg-orange-500" style={{ height: `${(b.tickets / peak) * 100}%`, minHeight: b.tickets ? 3 : 0 }} />
                </div>
              ))}
            </div>
          )}
          {line.length > 0 && (
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{line[0].bucket}</span>
              <span>{line[line.length - 1].bucket}</span>
            </div>
          )}
        </div>
      </section>

      {mode === "admin" && byPartner.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.finance.byPartner")}</h2>
          {groupTable(byPartner, t("bo.finance.partner"), false)}
        </section>
      )}

      {ministries && ministries.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.finance.byMinistryBudget")}</h2>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("bo.finance.ministry")}</th>
                  <th className="px-4 py-3 text-right">{t("bo.finance.tickets")}</th>
                  <th className="px-4 py-3 text-right">{t("bo.finance.issued")}</th>
                  <th className="px-4 py-3 text-right">{t("bo.finance.consumed")}</th>
                  <th className="px-4 py-3 text-right">{t("bo.finance.balance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ministries.map((m) => (
                  <tr key={m.organisationId}>
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/agente/ministerios/${m.organisationId}`} className="hover:text-orange-700">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">{m.tickets}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatAmount(m.issued, m.currency)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatAmount(m.consumed, m.currency)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatAmount(m.balance, m.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">{t("bo.finance.consumedNote")}</p>
        </section>
      )}

      {byMinistry.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.finance.byMinistry")}</h2>
          {groupTable(byMinistry, t("bo.finance.ministry"), mode === "admin")}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.finance.perTicket")}</h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{t("bo.finance.empty")}</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("bo.finance.issuedOn")}</th>
                  <th className="px-4 py-3">{t("bo.finance.reference")}</th>
                  {mode === "admin" && <th className="px-4 py-3">{t("bo.finance.partner")}</th>}
                  <th className="px-4 py-3">{t("bo.finance.ministry")}</th>
                  <th className="px-4 py-3">{t("bo.finance.route")}</th>
                  <th className="px-4 py-3 text-right">{t("bo.finance.tickets")}</th>
                  <th className="px-4 py-3 text-right">{t("bo.finance.cost")}</th>
                  <th className="px-4 py-3 text-right">{t("bo.finance.charged")}</th>
                  <th className="px-4 py-3 text-right">{t("bo.finance.commission")}</th>
                  <th className="px-4 py-3">{t("bo.finance.issuedBy")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.caseId}>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">{dt.format(new Date(r.issuedAt))}</td>
                    <td className="px-4 py-2 font-mono">
                      <Link
                        href={mode === "admin" ? `/gestao/casos/c/${r.caseId}` : `/admin/price-checker/${r.caseId}`}
                        className="text-orange-700 hover:underline"
                      >
                        {r.reference ?? r.caseId.slice(0, 8)}
                      </Link>
                    </td>
                    {mode === "admin" && <td className="px-4 py-2">{r.partnerName}</td>}
                    <td className="px-4 py-2">{r.organisationName ?? "—"}</td>
                    <td className="px-4 py-2">{r.route}</td>
                    <td className="px-4 py-2 text-right">{r.tickets}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.cost != null ? formatAmount(r.cost, r.currency) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.charged != null ? formatAmount(r.charged, r.currency) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-400">
                      {r.commissionAmount != null ? formatAmount(r.commissionAmount, r.currency) : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.issuedByEmail ?? "—"}</td>
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

export function financeQuery(range: PeriodRange, extra: Record<string, string | null | undefined> = {}): string {
  const q = new URLSearchParams({ period: range.period, from: range.from, to: range.to })
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
  return q.toString()
}
