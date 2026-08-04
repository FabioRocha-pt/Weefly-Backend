"use client"

import { useState, useTransition } from "react"
import { Loader2, CreditCard, Check } from "lucide-react"

import { createPayLink, markPaymentReceived } from "@/actions/booking-cases"

const CURRENCIES = ["CVE", "EUR", "USD"]

/**
 * Records the fare the client agreed to and opens the payment stage.
 *
 * Entered by hand because the admin sources fares manually. The value is
 * captured in major units here and converted to minor units server-side, to
 * match WeePay's `amount BIGINT`.
 */
export function PayLinkForm({ caseId }: { caseId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    formData.set("caseId", caseId)
    startTransition(async () => {
      const result = await createPayLink(formData)
      if (result.error) setError(result.error)
    })
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="0,00"
            className="h-11 w-full rounded-lg border border-adm-line bg-adm-bg px-3 text-[13px] text-adm-txt outline-none transition-colors placeholder:text-adm-muted focus:border-adm-ember"
          />
        </div>
        <select
          name="currency"
          defaultValue="CVE"
          className="h-11 w-24 shrink-0 rounded-lg border border-adm-line bg-adm-bg px-2 text-[13px] text-adm-txt outline-none focus:border-adm-ember"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <input
        name="description"
        placeholder="Descrição (ex.: 2 bilhetes RAI → LIS, ida e volta)"
        className="h-11 w-full rounded-lg border border-adm-line bg-adm-bg px-3 text-[13px] text-adm-txt outline-none transition-colors placeholder:text-adm-muted focus:border-adm-ember"
      />
      {error && <p className="text-[12.5px] text-adm-ember">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-adm-ember px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-adm-ember-dark disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4" />
        )}
        Gerar link de pagamento
      </button>
    </form>
  )
}

/** Fallback for payments settled outside the gateway (transfer, cash). */
export function MarkPaidButton({
  caseId,
  paymentId,
}: {
  caseId: string
  paymentId: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await markPaymentReceived(formData)
      if (result.error) setError(result.error)
    })
  }

  return (
    <form action={onSubmit}>
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-adm-line bg-adm-raise px-4 py-2.5 text-[13px] font-semibold text-adm-txt-2 transition-colors hover:text-adm-txt disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Marcar como pago
      </button>
      {error && <p className="mt-2 text-[12.5px] text-adm-ember">{error}</p>}
    </form>
  )
}
