import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/utils/supabase/admin"
import { enforceExpiry, type PcPayment } from "@/lib/pc/payment"

/**
 * Fecha os pagamentos cujo prazo já passou.
 *
 * A expiração já acontece preguiçosamente a cada leitura da página do cliente e
 * da ficha do back-office — este endpoint existe para o caso em que ninguém
 * abre nem uma nem outra. Sem ele, um cliente que só volta ao link daqui a uma
 * semana veria o ecrã de pagamento como se o preço ainda valesse.
 *
 * Protegido por um segredo no cabeçalho ou na query. Sem `PC_CRON_TOKEN`
 * configurado o endpoint responde 404: um endpoint que muda estado e está aberto
 * ao mundo é uma maneira de qualquer pessoa expirar os pagamentos todos.
 *
 * Chamar de hora a hora é suficiente — o prazo é de 48 h.
 *   Vercel: adicionar a `crons` em vercel.json apontando para
 *   /api/pc/expire?token=…
 */

export const dynamic = "force-dynamic"

const COLUMNS = `
  id, case_id, amount, currency, description, status, method, pay_provider,
  payment_url, expires_at, review_deadline_at, extension_count,
  admin_confirmed, admin_confirmed_at, received_amount, bank_reference,
  value_date, proof_status, proof_rejected_reason, client_declared_paid_at,
  paid_at, created_at
`

export async function GET(request: NextRequest) {
  const secret = process.env.PC_CRON_TOKEN
  if (!secret) return new NextResponse("Not found", { status: 404 })

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("token")

  if (provided !== secret) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ ok: false, reason: "service_unavailable" }, { status: 503 })
  }

  const now = new Date().toISOString()

  /*
   * Só os candidatos: pagamentos vivos com um dos dois prazos já no passado. A
   * decisão de qual dos prazos conta é do `enforceExpiry` — aqui a query é
   * deliberadamente generosa para não haver duas regras a decidir a mesma coisa.
   */
  const { data, error } = await admin
    .from("case_payments")
    .select(COLUMNS)
    .in("status", ["STARTED", "PENDING", "AUTHORIZED"])
    .eq("admin_confirmed", false)
    .or(`expires_at.lt.${now},review_deadline_at.lt.${now}`)
    .limit(200)

  if (error) {
    console.error("[pc/expire] leitura falhou:", error.message)
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 })
  }

  let expired = 0
  const causes: Record<string, number> = {}

  for (const row of (data ?? []) as unknown as PcPayment[]) {
    const verdict = await enforceExpiry(row)
    if (verdict.expired) {
      expired++
      if (verdict.cause) causes[verdict.cause] = (causes[verdict.cause] ?? 0) + 1
    }
  }

  return NextResponse.json({
    ok: true,
    checked: data?.length ?? 0,
    expired,
    causes,
  })
}
