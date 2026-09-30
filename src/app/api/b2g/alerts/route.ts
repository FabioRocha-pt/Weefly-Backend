import { NextResponse, type NextRequest } from "next/server"

import { checkAllBudgetAlerts } from "@/lib/budget-alerts"
import { checkPassportExpiries } from "@/lib/passport-alerts"

/**
 * PAR-05 · o cron diário dos alertas de saldo.
 *
 * "Repete-se enquanto o saldo estiver abaixo do limite, no máximo uma vez por
 * dia." É esta rota que faz a repetição; o "uma vez por dia" é da base de
 * dados (`budget_alerts` único por ministério e dia), pelo que corrê-la duas
 * vezes no mesmo dia não manda nada a mais.
 *
 * DAT-02 · no mesmo passo, os passaportes a expirar (uma vez por validade).
 *
 * Mesma autorização do `/api/pc/expire`: `PC_CRON_TOKEN`, no cabeçalho.
 *
 *   curl -H "Authorization: Bearer $PC_CRON_TOKEN" https://…/api/b2g/alerts
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const secret = process.env.PC_CRON_TOKEN
  if (!secret) return new NextResponse("Not found", { status: 404 })

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("token")
  if (provided !== secret) return new NextResponse("Unauthorized", { status: 401 })

  const result = await checkAllBudgetAlerts()
  const passports = await checkPassportExpiries()
  return NextResponse.json({ ok: true, ...result, passports }, { headers: { "cache-control": "no-store" } })
}
