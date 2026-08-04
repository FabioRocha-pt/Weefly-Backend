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
