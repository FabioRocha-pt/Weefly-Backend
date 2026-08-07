import { NextResponse } from "next/server"

import { createAdminClient } from "@/utils/supabase/admin"
import { applyPaymentStatus } from "@/lib/payments"
import { parseWebhookEvent, verifyWebhookSignature } from "@/lib/weepay"

export const runtime = "nodejs"
// Um webhook nunca pode ser servido de cache.
export const dynamic = "force-dynamic"

/**
 * Webhook da WeePay.
 *
 * A forma do corpo e o esquema de assinatura são INFERIDOS — ver o aviso longo
 * em `src/lib/weepay.ts`. O manual da WeePay documenta o webhook que ela recebe
 * dos fornecedores, não o que envia aos consumidores.
 *
 * Enquanto `WEEPAY_WEBHOOK_SECRET` não estiver definido, esta rota responde 503
 * e não escreve nada. É deliberado: um endpoint que aceitasse qualquer POST
 * deixaria qualquer pessoa marcar reservas como pagas.
 */
export async function POST(request: Request) {
  if (!process.env.WEEPAY_WEBHOOK_SECRET) {
    console.warn("[weepay] webhook recebido sem WEEPAY_WEBHOOK_SECRET definido.")
    return NextResponse.json(
      { error: "Webhook não configurado." },
      { status: 503 }
    )
  }

  // O corpo cru, e não o JSON reserializado: a assinatura é sobre os bytes que
  // vieram, e `JSON.stringify(JSON.parse(x))` não devolve `x`.
  const raw = await request.text()

  const signature =
    request.headers.get("weepay-signature") ??
    request.headers.get("x-weepay-signature") ??
    request.headers.get("stripe-signature")

  if (!verifyWebhookSignature(raw, signature)) {
    console.warn("[weepay] assinatura de webhook inválida ou ausente.")
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })
  }

  const event = parseWebhookEvent(payload)
  if (!event) {
    console.warn("[weepay] evento não reconhecido:", raw.slice(0, 300))
    // 200 de propósito: se a WeePay reenviar em caso de erro, um evento que
    // nunca vamos conseguir interpretar reenviado para sempre não ajuda
    // ninguém. Fica no log, que é onde se investiga.
    return NextResponse.json({ ok: true, ignored: true })
  }

  const admin = createAdminClient()
  if (!admin) {
    // 503 para que a WeePay reenvie: isto é uma falha nossa, transitória.
    return NextResponse.json({ error: "Indisponível." }, { status: 503 })
  }

  const { data: payment } = await admin
    .from("case_payments")
    .select("id")
    .eq("weepay_transaction_id", event.transactionId)
    .maybeSingle()

  if (!payment) {
    console.warn(
      "[weepay] webhook para transação desconhecida: %s",
      event.transactionId
    )
    return NextResponse.json({ ok: true, ignored: true })
  }

  const result = await applyPaymentStatus(
    (payment as { id: string }).id,
    event.status,
    {
      source: "webhook",
      failureReason: event.failureReason,
      paidAt: event.occurredAt,
    }
  )

  if (!result.ok && result.reason === "unavailable") {
    return NextResponse.json({ error: "Indisponível." }, { status: 503 })
  }

  // Uma transição recusada não é erro da WeePay — é um evento fora de ordem, e
  // reenviá-lo daria no mesmo. 200.
  return NextResponse.json({ ok: true })
}
