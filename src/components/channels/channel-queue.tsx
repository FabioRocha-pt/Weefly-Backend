import Link from "next/link"

import type { BoQueueRow } from "@/lib/pc/bo-queue"
import { elapsedSince } from "@/lib/case-status"
import { formatMoney } from "@/lib/proposal-math"
import type { Translator } from "@/i18n/translate"

/**
 * B2G-21 · "Cada menu tem a sua fila de pedidos." A fila de um canal (ou de
 * um VIP, ou de um ministério) dentro do terminal de vendas, com a mesma
 * leitura que a fila do Concierge (`loadBoQueue`). Cada linha abre a ficha
 * do caso no Concierge, onde se trata.
 */
export function ChannelQueue({
  rows,
  t,
  title,
  empty,
  showWho = false,
}: {
  rows: BoQueueRow[]
  t: Translator
  title: string
  empty: string
  /** Mostra o VIP ou o ministério de cada pedido (na fila do canal inteiro). */
  showWho?: boolean
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="text-sm text-slate-500">{t("bo.channelQueue.count", { count: String(rows.length) })}</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">{empty}</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.reference")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.client")}</th>
                {showWho && <th className="px-4 py-3 font-semibold">{t("bo.channelQueue.who")}</th>}
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.route")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.state")}</th>
                <th className="px-4 py-3 font-semibold text-right">{t("bo.queue.table.amount")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.inQueueFor")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.caseId} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/price-checker/${row.caseId}`}
                      className="font-mono font-semibold text-orange-700 hover:underline"
                    >
                      {row.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.clientName}</div>
                    <div className="text-xs text-slate-500">{row.clientPhone}</div>
                  </td>
                  {showWho && (
                    <td className="px-4 py-3 text-slate-600">{row.vipName ?? row.organisationName ?? "—"}</td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-mono text-slate-900">
                      {row.origin} → {row.destination}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.departDate}
                      {row.returnDate ? ` – ${row.returnDate}` : ""} · {row.paxLabel}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{t(`bo.queue.state.${row.state}`)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.amount ? formatMoney(row.amount, row.currency) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.closedAt ? "—" : elapsedSince(row.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
