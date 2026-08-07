import { CheckCircle2 } from "lucide-react"

import { getCaseByToken, markLinkOpened } from "@/lib/booking-cases"
import { TravelRequestForm } from "@/components/forms/travel-request-form"
import { LinkUnavailable } from "@/components/concierge/link-unavailable"

export const dynamic = "force-dynamic"

/** Link 1 — the travel request form, bound to the case token. */
export default async function CaseRequestPage({
  params,
}: {
  params: { token: string }
}) {
  const lookup = await getCaseByToken(params.token, 1)

  if (!lookup.ok) return <LinkUnavailable reason={lookup.reason} />

  const { case: bookingCase, link } = lookup.view

  // Already filled in — show the confirmation instead of a blank second form.
  if (link.status === "submetido") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-9 w-9 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Pedido já recebido</h1>
        <p className="mt-3 leading-relaxed text-slate-500">
          Já recebemos este pedido de viagem. A nossa equipa de Concierge está a
          preparar as melhores opções e entrará em contacto consigo.
        </p>
        {bookingCase.trip_request?.reference && (
          <p className="mt-5 inline-block rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-500">
            Referência:{" "}
            <strong className="font-mono text-slate-900">
              {bookingCase.trip_request.reference}
            </strong>
          </p>
        )}
      </div>
    )
  }

  await markLinkOpened(link.id)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Peça a sua viagem
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-500">
          Diga-nos para onde quer ir e a nossa equipa de Concierge trata do resto
          — com as melhores opções e tarifas, feitas à sua medida.
        </p>
      </div>
      <TravelRequestForm token={params.token} />
    </div>
  )
}
