import { notFound } from "next/navigation"

import { getBoScope } from "@/lib/bo-scope"
import { listIssuedTickets, periodRange } from "@/lib/finance"
import { FinanceFilters, FinanceReport, financeQuery } from "@/components/finance/finance-report"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * ADM-03 · a análise consolidada: passagens emitidas por parceiro e por
 * ministério, custo unitário e total, a linha temporal, quem emitiu, filtros
 * por período e exportação para CSV.
 *
 * Todos os parceiros, ou um. Só o Admin WeeFly (404 a quem não vê todos).
 * A comissão (ADM-07) aparece vazia até às decisões C1/D1/D7/D8.
 */

export const dynamic = "force-dynamic"

export default async function AdminNumbersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) notFound()
  const { t, locale } = await getBoI18n()

  const param = (k: string) => {
    const v = searchParams[k]
    return Array.isArray(v) ? v[0] : v
  }
  const range = periodRange({ period: param("period"), from: param("from"), to: param("to") })

  const { data } = await scope.db.from("partners").select("id, commercial_name").order("commercial_name")
  const partners = ((data ?? []) as { id: string; commercial_name: string }[]).map((p) => ({ id: p.id, name: p.commercial_name }))
  const wanted = param("partner")
  const partnerId = partners.some((p) => p.id === wanted) ? wanted! : null

  const rows = await listIssuedTickets(scope, { partnerId, range })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.finance.adminTitle")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.finance.adminSubtitle")}</p>
      </div>
      <FinanceFilters action="/gestao/numeros" range={range} partners={partners} partnerId={partnerId} t={t} />
      <FinanceReport
        rows={rows}
        range={range}
        mode="admin"
        exportHref={`/api/finance/export?${financeQuery(range, { scope: "admin", partner: partnerId })}`}
        t={t}
        locale={locale}
      />
    </div>
  )
}
