/**
 * WeeFly — a máquina de estados do pagamento.
 *
 * Todas as mudanças de estado de um pagamento passam por `applyPaymentStatus`,
 * venham do webhook da WeePay, da verificação por sondagem ou do botão do
 * admin. Um sítio só, por duas razões:
 *
 *  - A matriz de transições do manual (§8.1) tem de valer sempre. Um webhook
 *    atrasado a chegar depois de o admin já ter marcado como pago não pode
 *    puxar o pagamento de volta para PENDING.
 *  - Cada mudança arrasta consequências — o caso avança, a etapa 3 fecha, o
 *    cliente é avisado. Espalhar isso por três chamadores é garantir que uma
 *    delas fica esquecida numa.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import {
  TERMINAL_PAYMENT_STATUSES,
  type CaseStage,
  type PaymentStatus,
} from "@/lib/case-status"
import {
  checkPaymentStatus,
  initiatePayment,
  isWeePayConfigured,
  toPaymentStatus,
} from "@/lib/weepay"

/**
 * Manual §8.1 — para onde cada estado pode ir.
 *
 * FAILED, CANCELLED, EXPIRED, REFUNDED e PARTIALLY_REFUNDED não aparecem como
 * chave porque são terminais (§8.2): não têm sucessor nenhum. COMPLETED é o
 * único terminal com saída, e só para os desfechos de reembolso e disputa.
 */
const ALLOWED: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
  STARTED: ["PENDING", "AUTHORIZED", "FAILED", "CANCELLED"],
  PENDING: [
    "AUTHORIZED",
    "CAPTURED",
    "COMPLETED",
    "FAILED",
    "EXPIRED",
    "CANCELLED",
  ],
  AUTHORIZED: ["CAPTURED", "FAILED", "CANCELLED"],
  CAPTURED: [
    "COMPLETED",
    "FAILED",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
    "DISPUTED",
  ],
  COMPLETED: ["REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"],
  DISPUTED: ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"],
}

export function isTerminal(status: PaymentStatus): boolean {
  return TERMINAL_PAYMENT_STATUSES.includes(status)
}

export function canTransition(
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  if (from === to) return true
  return (ALLOWED[from] ?? []).includes(to)
}

/** Estados em que o dinheiro está efetivamente do nosso lado. */
export function isPaid(status: PaymentStatus): boolean {
  return status === "COMPLETED" || status === "CAPTURED"
}

export type ApplyResult =
  | { ok: true; changed: boolean; status: PaymentStatus }
  | { ok: false; reason: "not_found" | "illegal" | "unavailable" }

/**
 * Move um pagamento para um novo estado, com tudo o que isso implica.
 *
 * `source` só existe para o log: quando um pagamento fica num estado
 * inesperado, a primeira pergunta é sempre quem o pôs lá.
 */
export async function applyPaymentStatus(
  paymentId: string,
  next: PaymentStatus,
  options: {
    source: "webhook" | "polling" | "admin"
    weepayTransactionId?: string | null
    failureReason?: string | null
    paidAt?: string | null
    markedBy?: string | null
  }
): Promise<ApplyResult> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: "unavailable" }

  const { data: payment } = await admin
    .from("case_payments")
    .select("id, case_id, status")
    .eq("id", paymentId)
    .maybeSingle()

  if (!payment) return { ok: false, reason: "not_found" }

  const current = (payment as { status: PaymentStatus }).status
  const caseId = (payment as { case_id: string }).case_id

  if (current === next) {
    await admin
      .from("case_payments")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", paymentId)
    return { ok: true, changed: false, status: current }
  }

  if (!canTransition(current, next)) {
    console.warn(
      "[payments] transição recusada (%s): %s → %s no pagamento %s",
      options.source,
      current,
      next,
      paymentId
    )
    return { ok: false, reason: "illegal" }
  }

  const now = new Date().toISOString()
  const { error } = await admin
    .from("case_payments")
    .update({
      status: next,
      last_checked_at: now,
      ...(isPaid(next) ? { paid_at: options.paidAt ?? now } : {}),
      ...(options.weepayTransactionId
        ? { weepay_transaction_id: options.weepayTransactionId }
        : {}),
      ...(options.failureReason !== undefined
        ? { failure_reason: options.failureReason }
        : {}),
      ...(options.markedBy ? { marked_manually_by: options.markedBy } : {}),
    })
    .eq("id", paymentId)
    // Corrida entre um webhook e o botão do admin: quem chegar segundo encontra
    // o estado já mudado e não escreve por cima.
    .eq("status", current)

  if (error) {
    console.error("[payments] update falhou:", error)
    return { ok: false, reason: "unavailable" }
  }

  await propagate(caseId, next)

  return { ok: true, changed: true, status: next }
}

/**
 * O que o resto do caso faz quando o pagamento muda.
 *
 * Só o dinheiro recebido mexe no caso. Um FAILED ou um EXPIRED deixam o caso
 * onde está de propósito: o cliente continua a dever, e empurrá-lo para trás
 * só faria a lista do back-office mentir sobre em que ponto ele está.
 */
async function propagate(caseId: string, status: PaymentStatus): Promise<void> {
  const admin = createAdminClient()
  if (!admin) return

  if (!isPaid(status)) return

  const behind: CaseStage[] = [
    "novo",
    "pedido_recebido",
    "proposta_enviada",
    "opcao_escolhida",
    "detalhes_pendentes",
    "detalhes_recebidos",
    "pagamento_pendente",
  ]

  await admin
    .from("booking_cases")
    .update({ stage: "pago" })
    .eq("id", caseId)
    .in("stage", behind)

  await admin
    .from("case_links")
    .update({ status: "submetido", submitted_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("stage", 3)
    .neq("status", "submetido")
}

export interface LivePayment {
  id: string
  status: PaymentStatus
  amount: number
  currency: string
  weepay_transaction_id: string | null
  payment_url: string | null
  client_declared_paid_at: string | null
  idempotency_key: string | null
}

/** O pagamento vivo de um caso — o mais recente, seja qual for o estado. */
export async function latestPayment(
  caseId: string
): Promise<LivePayment | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data } = await admin
    .from("case_payments")
    .select(
      "id, status, amount, currency, weepay_transaction_id, payment_url, client_declared_paid_at, idempotency_key"
    )
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data ?? null) as LivePayment | null
}

// --- WeePay ------------------------------------------------------------------

export type StartOutcome =
  | { ok: true; url: string | null; message: string | null }
  | { ok: false; reason: "not_configured" | "no_payment" | "already" | "failed"; message?: string }

/**
 * Pede à WeePay que abra o pagamento deste caso e guarda o instrumento.
 *
 * Chamado de dois sítios: automaticamente quando os passaportes chegam (é aí
 * que o valor está fechado e o cliente espera instruções) e à mão pelo botão do
 * back-office, para quando o primeiro falhou ou o instrumento expirou.
 *
 * `not_configured` não é erro: é o estado normal enquanto a WeeFly não tiver o
 * URL e a chave da WeePay. Quem chama trata-o como "segue pelo caminho manual".
 */
export async function startWeePayPayment(
  caseId: string
): Promise<StartOutcome> {
  if (!isWeePayConfigured()) return { ok: false, reason: "not_configured" }

  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: "failed", message: "Indisponível." }

  const payment = await latestPayment(caseId)
  if (!payment) return { ok: false, reason: "no_payment" }
  if (isTerminal(payment.status)) return { ok: false, reason: "already" }

  const { data: bookingCase } = await admin
    .from("booking_cases")
    .select(
      "id, trip_request:trip_requests (reference, lead:leads (email, phone, phone_prefix))"
    )
    .eq("id", caseId)
    .maybeSingle()

  const trip = unwrap(
    (bookingCase as Record<string, unknown> | null)?.trip_request
  )
  const lead = unwrap(trip?.lead)

  const email = typeof lead?.email === "string" ? lead.email : null
  if (!email) {
    return {
      ok: false,
      reason: "failed",
      message:
        "O caso não tem email do cliente, e a WeePay exige um para abrir o pagamento.",
    }
  }

  const prefix = typeof lead?.phone_prefix === "string" ? lead.phone_prefix : ""
  const phone = typeof lead?.phone === "string" ? lead.phone : ""

  const outcome = await initiatePayment({
    amount: payment.amount,
    currency: payment.currency,
    method: process.env.WEEPAY_DEFAULT_METHOD ?? "card",
    customer: {
      email,
      phone: phone ? `${prefix}${phone}`.replace(/\s+/g, "") : undefined,
      /* A WeePay usa o país para escolher o corredor (§4.1). Cabo Verde é o
         palpite certo para a esmagadora maioria dos casos e o único que
         podemos fazer sem pedir o país ao cliente — que é uma pergunta a mais
         num formulário que já é longo. Sobrepõe-se por env quando for preciso. */
      country: process.env.WEEPAY_DEFAULT_COUNTRY ?? "CV",
    },
    bookingReference:
      (typeof trip?.reference === "string" ? trip.reference : null) ?? caseId,
    // A mesma chave do registo: reenviar este pedido nunca cobra duas vezes.
    idempotencyKey: payment.idempotency_key ?? `case_${caseId}`,
  })

  if (!outcome.ok) {
    if (outcome.kind === "not_configured") {
      return { ok: false, reason: "not_configured" }
    }
    await admin
      .from("case_payments")
      .update({ failure_reason: outcome.message, last_checked_at: new Date().toISOString() })
      .eq("id", payment.id)
    return { ok: false, reason: "failed", message: outcome.message }
  }

  const { instrument, weepayTransactionId, status } = outcome.result

  await admin
    .from("case_payments")
    .update({
      weepay_transaction_id: weepayTransactionId,
      payment_url: instrument.url ?? null,
      instrument_expires_at: instrument.expiresAt ?? null,
      provider: "weepay",
      method: process.env.WEEPAY_DEFAULT_METHOD ?? "card",
      failure_reason: null,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", payment.id)

  // O initiate devolve o estado inicial; passa pela máquina como qualquer outro.
  const next = toPaymentStatus(status)
  if (next) {
    await applyPaymentStatus(payment.id, next, {
      source: "polling",
      weepayTransactionId,
    })
  }

  return {
    ok: true,
    url: instrument.url ?? null,
    message: instrument.message ?? null,
  }
}

/** Pergunta à WeePay o estado atual e aplica-o. */
export async function refreshWeePayStatus(
  caseId: string
): Promise<
  | { ok: true; status: PaymentStatus; changed: boolean }
  | { ok: false; reason: "not_configured" | "no_transaction" | "failed"; message?: string }
> {
  const payment = await latestPayment(caseId)
  if (!payment) return { ok: false, reason: "no_transaction" }
  if (!payment.weepay_transaction_id) {
    return { ok: false, reason: "no_transaction" }
  }

  const outcome = await checkPaymentStatus(payment.weepay_transaction_id)
  if (!outcome.ok) {
    if (outcome.kind === "not_configured") {
      return { ok: false, reason: "not_configured" }
    }
    return { ok: false, reason: "failed", message: outcome.message }
  }

  const applied = await applyPaymentStatus(payment.id, outcome.result.status, {
    source: "polling",
    paidAt: outcome.result.paidAt ?? null,
    failureReason: outcome.result.failureReason ?? null,
  })

  if (!applied.ok) {
    return {
      ok: false,
      reason: "failed",
      message:
        applied.reason === "illegal"
          ? `A WeePay diz ${outcome.result.status}, mas o pagamento já está em ${payment.status}. Nada foi alterado.`
          : "Não foi possível aplicar o estado.",
    }
  }

  return { ok: true, status: applied.status, changed: applied.changed }
}

/** PostgREST devolve embeds ora como objeto ora como array de um elemento. */
function unwrap(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] ?? null) as Record<string, unknown> | null
  return (value ?? null) as Record<string, unknown> | null
}
