import { NextResponse, type NextRequest } from "next/server"

import { getBoScope } from "@/lib/bo-scope"
import { listActivity, activityCsv } from "@/lib/b2g-activity"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * B2G-19 · a exportação do registo, em CSV.
 *
 * As mesmas linhas que o ecrã mostra, pelo mesmo `listActivity` e com o mesmo
 * filtro no endereço — o CSV não pode dizer outra coisa que o ecrã (como o
 * `/api/finance/export`). Pelo cliente da sessão: o RLS da `b2g_activity`
 * decide o que sai, nunca a service role sem verificar o âmbito primeiro.
 *
 *   scope=partner · o parceiro da sessão (por omissão)
 *   scope=admin   · todas as empresas (ou `empresa=`), só para o master
 */

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuidOrNull = (v: string | null): string | null => (v && UUID.test(v) ? v : null)

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const admin = q.get("scope") === "admin"

  const scope = await getBoScope({ workspace: admin ? "all" : "own" })
  if (!scope?.identity.profile) return new NextResponse("Not found", { status: 404 })

  let partnerId: string | null
  if (admin) {
    if (!scope.identity.profile.crossPartner) return new NextResponse("Not found", { status: 404 })
    partnerId = uuidOrNull(q.get("empresa"))
  } else {
    if (!scope.partnerId) return new NextResponse("Not found", { status: 404 })
    partnerId = scope.partnerId
  }

  const rows = await listActivity(scope, {
    partnerId,
    organisationId: uuidOrNull(q.get("ministerio")),
    secretaryId: uuidOrNull(q.get("secretaria")),
    from: q.get("de"),
    to: q.get("ate"),
  })

  const { t } = await getBoI18n()
  const headers = ["when", "author", "action", "reference"].map((k) => t(`bo.activity.csv.${k}`))
  const name = `weefly-registo-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(activityCsv(rows, headers), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  })
}
