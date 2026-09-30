import { NextResponse, type NextRequest } from "next/server"

import { getBoScope } from "@/lib/bo-scope"
import { listIssuedTickets, periodRange, ticketsCsv } from "@/lib/finance"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * PAR-08 · ADM-03 · a exportação para CSV.
 *
 * As mesmas linhas que o ecrã mostra, pelo mesmo `listIssuedTickets` e com o
 * mesmo período no endereço — o CSV não pode dizer outra coisa que o ecrã.
 *
 *   scope=partner · o parceiro da sessão, só para o Admin do parceiro
 *   scope=admin   · todos os parceiros (ou `partner=`), só para o Admin WeeFly
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const scope = await getBoScope()
  if (!scope?.identity.profile) return new NextResponse("Not found", { status: 404 })
  const profile = scope.identity.profile
  const q = request.nextUrl.searchParams

  let partnerId: string | null
  if (q.get("scope") === "admin") {
    if (!profile.crossPartner) return new NextResponse("Not found", { status: 404 })
    const wanted = q.get("partner")
    partnerId = wanted && /^[0-9a-f-]{36}$/i.test(wanted) ? wanted : null
  } else {
    if (!scope.partnerId || profile.manageUsers === "none") return new NextResponse("Not found", { status: 404 })
    partnerId = scope.partnerId
  }

  const range = periodRange({ period: q.get("period"), from: q.get("from"), to: q.get("to") })
  const rows = await listIssuedTickets(scope, { partnerId, range })

  const { t } = await getBoI18n()
  const headers = [
    "issuedOn",
    "reference",
    "pnr",
    "partner",
    "ministry",
    "route",
    "tickets",
    "currency",
    "cost",
    "charged",
    "margin",
    "commissionRate",
    "commission",
    "issuedBy",
  ].map((k) => t(`bo.finance.csv.${k}`))

  const name = `weefly-${q.get("scope") === "admin" ? "numeros" : "financas"}-${range.from}_${range.to}.csv`
  return new NextResponse(ticketsCsv(rows, headers), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  })
}
