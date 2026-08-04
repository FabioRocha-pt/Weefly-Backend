import { CheckCircle2 } from "lucide-react"

import { getCaseByToken, markLinkOpened } from "@/lib/booking-cases"
import { LinkUnavailable } from "@/components/concierge/link-unavailable"
import {
  PassengerDetailsForm,
  type PassengerSlot,
} from "@/components/forms/passenger-details-form"

export const dynamic = "force-dynamic"

/** Build one slot per traveller from the counts captured in Link 1. */
function buildSlots(trip: {
  adults: number
  children: number
  infants: number
}): PassengerSlot[] {
  const slots: PassengerSlot[] = []
  let position = 0
  for (let i = 0; i < trip.adults; i++)
    slots.push({ position: position++, passengerType: "adult" })
  for (let i = 0; i < trip.children; i++)
    slots.push({ position: position++, passengerType: "child" })
  for (let i = 0; i < trip.infants; i++)
    slots.push({ position: position++, passengerType: "infant" })
  return slots
}

/** Link 2 — passenger and passport details. */
export default async function CasePassengersPage({
  params,
}: {
  params: { token: string }
}) {
  const lookup = await getCaseByToken(params.token, 2)
  if (!lookup.ok) return <LinkUnavailable reason={lookup.reason} />

  const { case: bookingCase, link } = lookup.view

  if (link.status === "submetido") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-9 w-9 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Dados já recebidos</h1>
        <p className="mt-3 leading-relaxed text-slate-500">
          Já temos os dados dos passageiros. A nossa equipa entrará em contacto
          com os próximos passos.
        </p>
      </div>
    )
  }

  const trip = bookingCase.trip_request

  await markLinkOpened(link.id)

  /*
   * Without a Link 1 submission there are no passenger counts, but the link is
   * still open (see migration 0004) — the agent may have agreed the trip over
   * WhatsApp and only needs the passports. One adult is the floor: the client
   * adds the rest, and the counts reconcile when Link 1 arrives.
   */
  const slots = trip
    ? buildSlots(trip)
    : [{ position: 0, passengerType: "adult" as const }]

  return (
    <div>
      <div className="mb-8 text-center">
        {trip && (
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
            {trip.origin} → {trip.destination}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Dados dos passageiros
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-500">
          {trip ? (
            <>
              Precisamos dos dados de {slots.length}{" "}
              {slots.length === 1 ? "passageiro" : "passageiros"}, exatamente
              como constam no passaporte, para emitir os bilhetes.
            </>
          ) : (
            <>
              Precisamos dos dados de quem viaja, exatamente como constam no
              passaporte, para emitir os bilhetes.
            </>
          )}
        </p>
      </div>
      <PassengerDetailsForm token={params.token} slots={slots} />
    </div>
  )
}
