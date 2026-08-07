import { CheckCircle2, ShieldCheck, Clock, Hourglass, Ticket } from "lucide-react"

import { getCaseByToken, markLinkOpened } from "@/lib/booking-cases"
import { createAdminClient } from "@/utils/supabase/admin"
import { LinkUnavailable } from "@/components/concierge/link-unavailable"
import { CaseStepper } from "@/components/concierge/case-stepper"
import { DeclarePaidButton } from "@/components/concierge/declare-paid-button"
import {
  PAYMENT_STATUS_LABELS,
  formatAmount,
  type CasePayment,
} from "@/lib/case-status"

export const dynamic = "force-dynamic"

/** Link 3 — payment. Reads via service role: the client has no session. */
async function getPayment(caseId: string): Promise<CasePayment | null> {
  const admin = createAdminClient()
  if (!admin) return null
  const { data } = await admin
    .from("case_payments")
    .select(
      "id, amount, currency, description, status, payment_url, weepay_transaction_id, paid_at, created_at, client_declared_paid_at, last_checked_at, failure_reason"
    )
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as CasePayment | null
}

export default async function CasePaymentPage({
  params,
}: {
  params: { token: string }
}) {
  const lookup = await getCaseByToken(params.token, 3)
  if (!lookup.ok) return <LinkUnavailable reason={lookup.reason} />

  const { case: bookingCase, link } = lookup.view
  const payment = await getPayment(bookingCase.id)
  const trip = bookingCase.trip_request

  /*
   * The link is open from the moment the case exists (migration 0004), so the
   * client can land here before the agent has agreed a fare. Say so plainly
   * instead of showing the generic "unavailable" page, which reads as a broken
   * link when nothing is actually wrong.
   */
  if (!payment) return <AwaitingFare trip={trip} />

  if (payment.status === "COMPLETED" || link.status === "submetido") {
    const issued = bookingCase.stage === "emitido"
    return (
      <div className="mx-auto max-w-lg">
        <CaseStepper current={issued ? 6 : 5} />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            {issued ? (
              <Ticket className="h-8 w-8 text-green-500" />
            ) : (
              <CheckCircle2 className="h-9 w-9 text-green-500" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {issued ? "Bilhetes emitidos" : "Pagamento confirmado"}
          </h1>
          <p className="mt-3 leading-relaxed text-slate-500">
            {issued ? (
              <>
                Está tudo tratado. Os bilhetes foram enviados para o seu email —
                confirme também a pasta de spam se não os encontrar.
              </>
            ) : (
              <>
                Obrigado! Recebemos o seu pagamento de{" "}
                <strong className="text-slate-900">
                  {formatAmount(payment.amount, payment.currency)}
                </strong>
                . Vamos emitir os bilhetes e enviá-los para o seu email.
              </>
            )}
          </p>
          {trip?.reference && (
            <p className="mt-5 inline-block rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-500">
              Referência:{" "}
              <strong className="font-mono text-slate-900">
                {trip.reference}
              </strong>
            </p>
          )}
        </div>
      </div>
    )
  }

  await markLinkOpened(link.id)

  return (
    <div className="mx-auto max-w-lg">
      <CaseStepper current={5} />
      <div className="mb-8 text-center">
        {trip && (
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
            {trip.origin} → {trip.destination}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Pagamento
        </h1>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="border-b border-slate-100 pb-6 text-center">
          <p className="text-sm text-slate-500">Total a pagar</p>
          <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
            {formatAmount(payment.amount, payment.currency)}
          </p>
          {payment.description && (
            <p className="mt-3 text-sm text-slate-500">{payment.description}</p>
          )}
          {trip?.reference && (
            <p className="mt-3 font-mono text-xs text-slate-400">
              {trip.reference}
            </p>
          )}
        </div>

        <div className="pt-6">
          {payment.payment_url ? (
            <>
              <a
                href={payment.payment_url}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-6 py-4 font-bold text-white transition-colors hover:bg-orange-700"
              >
                Pagar agora
              </a>
              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Pagamento processado de forma segura pela WeePay
              </p>
            </>
          ) : (
            /*
             * Sem link do gateway, o pagamento é combinado fora da plataforma.
             *
             * O bloco de instruções concretas — IBAN, balcão, horário — está
             * por escrever à espera de a WeeFly confirmar como cobram hoje.
             * Até lá o texto diz a verdade em vez de inventar um método: o
             * valor está fechado e o vendedor entra em contacto.
             */
            <div className="space-y-5">
              <div className="rounded-xl bg-slate-50 p-5 text-center">
                <Clock className="mx-auto mb-3 h-6 w-6 text-slate-400" />
                <p className="text-sm font-medium text-slate-900">
                  Valor fechado, a combinar o pagamento
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  O seu agente entra em contacto com a forma de pagamento. Se
                  preferir adiantar-se, fale connosco em{" "}
                  <a
                    href="mailto:info@weefly.africa"
                    className="font-semibold text-orange-600"
                  >
                    info@weefly.africa
                  </a>
                  .
                </p>
                <p className="mt-3 text-xs text-slate-400">
                  Estado: {PAYMENT_STATUS_LABELS[payment.status]}
                </p>
              </div>

              <DeclarePaidButton
                token={params.token}
                declaredAt={payment.client_declared_paid_at}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Stage 3 opened before a fare exists.
 *
 * Deliberately not the LinkUnavailable page: the link works, the case is real,
 * and the client did nothing wrong — there is simply no amount yet.
 */
function AwaitingFare({
  trip,
}: {
  trip: { origin: string; destination: string; reference: string } | null
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
        <Hourglass className="h-8 w-8 text-slate-400" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900">
        Ainda a preparar o valor
      </h1>
      {trip && (
        <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-orange-600">
          {trip.origin} → {trip.destination}
        </p>
      )}
      <p className="mt-3 leading-relaxed text-slate-500">
        A nossa equipa está a fechar a melhor tarifa para a sua viagem. Assim
        que estiver pronta, o valor aparece nesta mesma página — guarde o link.
      </p>
      {trip?.reference && (
        <p className="mt-5 inline-block rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-500">
          Referência:{" "}
          <strong className="font-mono text-slate-900">{trip.reference}</strong>
        </p>
      )}
      <p className="mt-6 text-sm text-slate-400">
        Dúvidas?{" "}
        <a
          href="mailto:info@weefly.africa"
          className="font-semibold text-orange-600"
        >
          info@weefly.africa
        </a>
      </p>
    </div>
  )
}
