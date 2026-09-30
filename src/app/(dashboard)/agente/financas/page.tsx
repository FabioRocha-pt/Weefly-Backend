import { notFound } from "next/navigation"

import { getBoScope } from "@/lib/bo-scope"
import { listIssuedTickets, ministryFinance, periodRange } from "@/lib/finance"
import { FinanceFilters, FinanceReport, financeQuery } from "@/components/finance/finance-report"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * PAR-08 · o acompanhamento financeiro do parceiro.
 *
 * Por passagem: custo, valor cobrado, comissão WeeFly, data e quem emitiu. Por
 * ministério: emitido, consumido e saldo. Exportação para CSV. Os números são
 * os do ADM-03 (`lib/finance`), com o âmbito do parceiro da sessão.
 *
 * Só o Admin do parceiro: é dinheiro, e o agente "não mexe em bolsas".
 */

export const dynamic = "force-dynamic"

export default async function PartnerFinancePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const scope = await getBoScope()
  const profile = scope?.identity.profile
  if (!scope?.partnerId || !profile || profile.manageUsers === "none") notFound()
  const { t, locale } = await getBoI18n()

  const param = (k: string) => {
    const v = searchParams[k]
    return Array.isArray(v) ? v[0] : v
  }
  const range = periodRange({ period: param("period"), from: param("from"), to: param("to") })
  const rows = await listIssuedTickets(scope, { partnerId: scope.partnerId, range })
  const ministries = await ministryFinance(scope, scope.partnerId, rows, range)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.finance.partnerTitle")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.finance.partnerSubtitle")}</p>
      </div>
      <FinanceFilters action="/agente/financas" range={range} t={t} />
      <FinanceReport
        rows={rows}
        range={range}
        mode="partner"
        ministries={ministries}
        exportHref={`/api/finance/export?${financeQuery(range, { scope: "partner" })}`}
        t={t}
        locale={locale}
      />
    </div>
  )
}
