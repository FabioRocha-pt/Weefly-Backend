"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { declarePaid } from "@/actions/payments"

/**
 * "Já paguei" — a declaração do cliente.
 *
 * Não muda o estado do pagamento, e o texto do botão diz isso sem rodeios: o
 * que ele faz é avisar a equipa, para o cliente não ter de telefonar a dizer
 * que transferiu. Quem confirma é quem vê o extrato.
 */
export function DeclarePaidButton({
  token,
  declaredAt,
}: {
  token: string
  declaredAt: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(Boolean(declaredAt))
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <div className="rounded-xl bg-green-50 p-4 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-green-500" />
        <p className="text-sm font-semibold text-slate-900">
          Avisámos a nossa equipa
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          Assim que confirmarmos a entrada do pagamento, recebe um email e
          começamos a emitir os bilhetes.
        </p>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await declarePaid(token)
            if (result.error) setError(result.error)
            else setDone(true)
          })
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 px-6 py-3.5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Já fiz o pagamento
      </button>
      <p className="mt-2 text-center text-[12px] leading-relaxed text-slate-400">
        Avisa a nossa equipa para irmos confirmar. Não substitui a confirmação.
      </p>
      {error && (
        <p className="mt-2 text-center text-[13px] text-orange-600">{error}</p>
      )}
    </div>
  )
}
