/**
 * WeePay gateway client — the payment seam.
 *
 * WeePay is a separate FastAPI service (see WeePay_Board_Developer_Manual_v1.docx,
 * extracted to docs/weepay-manual-extract.txt). WeeFly does not process payments;
 * it asks WeePay to initiate one and gets back a PaymentInstrument (manual §4.4).
 *
 * The integration is intentionally not wired up yet: until WEEPAY_API_URL is
 * set, `initiatePayment` reports "not configured" and the admin marks payments
 * received by hand. Everything below the API boundary — the amount in minor
 * units, the status vocabulary, the idempotency key, the booking_reference —
 * already matches the manual, so switching it on is config, not a rewrite.
 *
 * SERVER ONLY.
 */

import { createHmac, timingSafeEqual } from "crypto"

import type { PaymentStatus } from "@/lib/case-status"

/** Manual §4.4 — the thing the customer uses to complete payment. */
export interface PaymentInstrument {
  type: "redirect" | "qr_code" | "deep_link" | "payment_link" | "token" | "none"
  url?: string
  token?: string
  data?: string
  message?: string
  expiresAt?: string
}

export interface InitiateResult {
  weepayTransactionId: string
  status: string
  instrument: PaymentInstrument
}

export type WeePayOutcome =
  | { ok: true; result: InitiateResult }
  | { ok: false; kind: "not_configured" }
  | { ok: false; kind: "failed"; message: string }

export function isWeePayConfigured(): boolean {
  return Boolean(process.env.WEEPAY_API_URL)
}

export interface InitiateParams {
  /** MINOR units, matching WeePay's `amount BIGINT`. */
  amount: number
  currency: string
  method: string
  customer: {
    id?: string
    email: string
    phone?: string
    /** ISO-3166 alpha-2. Drives corridor routing (manual §4.1). */
    country: string
  }
  /** Our WF-… reference, carried through as WeePay's booking_reference. */
  bookingReference: string
  /** Must be stable across retries so a repeat call never double-charges. */
  idempotencyKey: string
}

/**
 * Ask WeePay to initiate a payment and return the instrument to send the client.
 *
 * Deliberately returns a result object instead of throwing: a payment gateway
 * being unreachable is an expected operating condition, not an exception, and
 * the back-office needs to render it rather than crash.
 */
export async function initiatePayment(
  params: InitiateParams
): Promise<WeePayOutcome> {
  const baseUrl = process.env.WEEPAY_API_URL
  if (!baseUrl) return { ok: false, kind: "not_configured" }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (process.env.WEEPAY_API_KEY) {
    headers.Authorization = `Bearer ${process.env.WEEPAY_API_KEY}`
  }

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/v1/payments/initiate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: params.amount,
          currency: params.currency,
          method: params.method,
          customer: params.customer,
          metadata: {
            booking_reference: params.bookingReference,
            idempotency_key: params.idempotencyKey,
          },
        }),
        // A gateway that hasn't answered in 15s has effectively failed; the
        // webhook will still resolve the transaction if it went through.
        signal: AbortSignal.timeout(15_000),
      }
    )

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return {
        ok: false,
        kind: "failed",
        message: `WeePay respondeu ${response.status}. ${body.slice(0, 200)}`,
      }
    }

    const json = (await response.json()) as Record<string, any>
    const instrument = (json.instrument ?? json.payment_instrument ?? {}) as Record<
      string,
      any
    >

    return {
      ok: true,
      result: {
        weepayTransactionId:
          json.weepay_transaction_id ?? json.transaction_id ?? json.id,
        status: json.status ?? "PENDING",
        instrument: {
          type: instrument.type ?? "payment_link",
          url: instrument.url ?? undefined,
          token: instrument.token ?? undefined,
          data: instrument.data ?? undefined,
          message: instrument.message ?? undefined,
          expiresAt: instrument.expires_at ?? undefined,
        },
      },
    }
  } catch (err) {
    console.error("[weepay] initiate failed:", err)
    return {
      ok: false,
      kind: "failed",
      message:
        err instanceof Error ? err.message : "Erro desconhecido ao contactar a WeePay.",
    }
  }
}

// --- Verificação de estado ---------------------------------------------------

const STATUSES: PaymentStatus[] = [
  "STARTED",
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
]

/** Aceita só o vocabulário do manual (§8.1); qualquer outra coisa é ruído. */
export function toPaymentStatus(value: unknown): PaymentStatus | null {
  if (typeof value !== "string") return null
  const upper = value.toUpperCase().replace(/[\s-]/g, "_")
  return (STATUSES as string[]).includes(upper)
    ? (upper as PaymentStatus)
    : null
}

export interface StatusResult {
  status: PaymentStatus
  paidAt?: string
  failureReason?: string
}

export type StatusOutcome =
  | { ok: true; result: StatusResult }
  | { ok: false; kind: "not_configured" }
  | { ok: false; kind: "failed"; message: string }

/**
 * Pergunta à WeePay em que estado está uma transação (manual, Apêndice A).
 *
 * O manual diz que a resolução de estado é webhook-first (§1.2), mas o único
 * webhook que documenta é provider → WeePay. Enquanto ninguém nos confirmar um
 * contrato WeePay → WeeFly, esta sondagem é o mecanismo em que se pode confiar,
 * e é ela que o back-office usa no botão "Verificar estado".
 */
export async function checkPaymentStatus(
  weepayTransactionId: string
): Promise<StatusOutcome> {
  const baseUrl = process.env.WEEPAY_API_URL
  if (!baseUrl) return { ok: false, kind: "not_configured" }

  const headers: Record<string, string> = {}
  if (process.env.WEEPAY_API_KEY) {
    headers.Authorization = `Bearer ${process.env.WEEPAY_API_KEY}`
  }

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/v1/payments/${encodeURIComponent(weepayTransactionId)}/status`,
      { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" }
    )

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return {
        ok: false,
        kind: "failed",
        message: `WeePay respondeu ${response.status}. ${body.slice(0, 200)}`,
      }
    }

    const json = (await response.json()) as Record<string, unknown>
    const status = toPaymentStatus(json.status)
    if (!status) {
      return {
        ok: false,
        kind: "failed",
        message: `Estado não reconhecido: ${JSON.stringify(json.status)}`,
      }
    }

    return {
      ok: true,
      result: {
        status,
        paidAt:
          typeof json.completed_at === "string"
            ? json.completed_at
            : typeof json.paid_at === "string"
              ? json.paid_at
              : undefined,
        failureReason:
          typeof json.failure_reason === "string"
            ? json.failure_reason
            : typeof json.error_message === "string"
              ? json.error_message
              : undefined,
      },
    }
  } catch (err) {
    console.error("[weepay] status check failed:", err)
    return {
      ok: false,
      kind: "failed",
      message:
        err instanceof Error ? err.message : "Erro ao contactar a WeePay.",
    }
  }
}

// --- Webhook -----------------------------------------------------------------

/**
 * ATENÇÃO — a forma deste evento é INFERIDA, não documentada.
 *
 * O manual descreve `NormalizedEvent` (§4.5) como a forma canónica para que a
 * WeePay converte os webhooks dos fornecedores, e descreve o endpoint que ela
 * própria expõe aos fornecedores (`POST /api/v1/webhooks/stripe`). Não descreve
 * em lado nenhum o que a WeePay envia para os seus consumidores — nós.
 *
 * O que está aqui assume que ela reenvia o `NormalizedEvent` tal e qual, porque
 * é a hipótese mais provável e a mais barata de corrigir. Antes de isto entrar
 * em produção é preciso confirmar com quem gere a WeePay:
 *
 *   1. Que ela de facto chama um webhook nosso, e com que corpo.
 *   2. Como assina o pedido (cabeçalho e esquema). O que está implementado é
 *      HMAC-SHA256 sobre o corpo cru, à maneira do Stripe, porque é o que o
 *      manual usa entre a Stripe e ela.
 *   3. Se reenvia em caso de falha, e quantas vezes.
 *
 * Até essa confirmação, a sondagem em `checkPaymentStatus` é o caminho fiável e
 * o webhook é um acelerador opcional.
 */
export interface NormalizedEvent {
  eventId: string | null
  eventType: string | null
  transactionId: string
  status: PaymentStatus
  occurredAt: string | null
  failureReason: string | null
}

export function parseWebhookEvent(payload: unknown): NormalizedEvent | null {
  if (!payload || typeof payload !== "object") return null
  const body = payload as Record<string, unknown>

  const transactionId =
    (typeof body.transaction_id === "string" && body.transaction_id) ||
    (typeof body.weepay_transaction_id === "string" &&
      body.weepay_transaction_id) ||
    null
  if (!transactionId) return null

  const status = toPaymentStatus(body.status)
  if (!status) return null

  return {
    eventId: typeof body.event_id === "string" ? body.event_id : null,
    eventType: typeof body.event_type === "string" ? body.event_type : null,
    transactionId,
    status,
    occurredAt:
      typeof body.occurred_at === "string" ? body.occurred_at : null,
    failureReason:
      typeof body.failure_reason === "string" ? body.failure_reason : null,
  }
}

/**
 * Confere a assinatura do webhook.
 *
 * Sem `WEEPAY_WEBHOOK_SECRET` definido devolve `false` de propósito: um
 * endpoint que aceita qualquer POST pode ser usado por qualquer pessoa na
 * internet para declarar reservas pagas. Preferir a recusa ao "por enquanto
 * deixa passar" é a diferença entre um segredo por configurar e um buraco.
 *
 * Aceita o formato do Stripe (`t=…,v1=…`) e uma assinatura nua, porque não
 * sabemos ainda qual deles a WeePay usa.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null
): boolean {
  const secret = process.env.WEEPAY_WEBHOOK_SECRET
  if (!secret || !header) return false

  const parts = header.split(",").map((p) => p.trim())
  const timestamp = parts
    .find((p) => p.startsWith("t="))
    ?.slice(2)
  const provided = (
    parts.find((p) => p.startsWith("v1="))?.slice(3) ?? header
  ).trim()

  const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex")

  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(provided.toLowerCase(), "utf8")
  // timingSafeEqual rebenta com comprimentos diferentes, e o comprimento em si
  // não é segredo nenhum — comparar antes é seguro.
  return a.length === b.length && timingSafeEqual(a, b)
}
