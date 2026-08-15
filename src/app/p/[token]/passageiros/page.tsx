import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import { getCaseByToken, markLinkOpened } from "@/lib/booking-cases"
import { getPublishedProposal, paxOf } from "@/lib/proposals"
import { formatMoney, legsOf, offerTotal, stopsLabel } from "@/lib/proposal-math"
import { LinkUnavailable } from "@/components/concierge/link-unavailable"
import { CaseStepper } from "@/components/concierge/case-stepper"
import {
  PassengerDetailsForm,
  type PassengerSlot,
} from "@/components/forms/passenger-details-form"
import { getI18n } from "@/i18n/server"

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

/**
 * Link 2, segundo passo — dados e passaportes (C4).
 *
 * Chega-se aqui da escolha da opção em /proposta. O endereço continua a
 * funcionar sozinho para os casos antigos, anteriores à migração 0005, que
 * nunca tiveram proposta nenhuma.
 */
export default async function CasePassengersPage({
  params,
}: {
  params: { token: string }
}) {
  const { t } = getI18n()
  const lookup = await getCaseByToken(params.token, 2)
  if (!lookup.ok) return <LinkUnavailable reason={lookup.reason} />

  const { case: bookingCase, link } = lookup.view

  if (link.status === "submetido") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-9 w-9 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("passengers.alreadyTitle")}
        </h1>
        <p className="mt-3 leading-relaxed text-slate-500">{t("passengers.alreadyBody")}</p>
      </div>
    )
  }

  const trip = bookingCase.trip_request
  const proposal = await getPublishedProposal(bookingCase.id)
  const chosen =
    proposal?.offers.find((o) => o.id === proposal.proposal.selected_offer_id) ??
    null

  /*
   * Há proposta publicada e o cliente ainda não escolheu: não faz sentido
   * pedir-lhe passaportes para um voo que ainda não decidiu. Volta ao
   * comparador em vez de ver um formulário sem contexto.
   */
  if (proposal && proposal.offers.length > 0 && !chosen) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("passengers.missingChoiceTitle")}
        </h1>
        <p className="mt-3 leading-relaxed text-slate-500">{t("passengers.missingChoiceBody")}</p>
        <Link
          href={`/p/${params.token}/proposta`}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-orange-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-700"
        >
          {t("passengers.missingChoiceCta")}
        </Link>
      </div>
    )
  }

  await markLinkOpened(link.id)

  /*
   * Sem link 1 submetido não há contagens de passageiros. Um adulto é o mínimo:
   * o cliente acrescenta os restantes e as contas reconciliam-se quando o
   * pedido chegar.
   */
  const slots = trip
    ? buildSlots(trip)
    : [{ position: 0, passengerType: "adult" as const }]

  const pax = paxOf(trip)

  return (
    <div className="mx-auto max-w-3xl">
      <CaseStepper current={4} />

      <div className="mb-8">
        {trip && (
          <p className="text-[12.5px] font-semibold uppercase tracking-wider text-orange-600">
            {trip.origin} → {trip.destination}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          {t("passengers.title")}
        </h1>
        <p className="mt-3 leading-relaxed text-slate-500">{t("passengers.subtitle")}</p>
      </div>

      {chosen && proposal && (
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t("passengers.chosenOption")}
            </span>
            <p className="mt-1 text-[15px] font-bold text-slate-900">
              {chosen.name || t("passengers.unnamedOffer")}
            </p>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {[
                stopsLabel(legsOf(chosen).ida),
                chosen.fare_name && t("proposal.fareName", { name: chosen.fare_name }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <Link
              href={`/p/${params.token}/proposta`}
              className="mt-2 inline-block text-[13px] font-semibold text-orange-600 hover:text-orange-700"
            >
              {t("passengers.changeOption")}
            </Link>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t("passengers.totalToPay")}
            </span>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-slate-900">
              {formatMoney(
                offerTotal(chosen, pax),
                proposal.proposal.currency
              )}
            </p>
            <p className="text-[12px] text-slate-500">
              {t("common.passengers", { count: slots.length })} ·{" "}
              {proposal.proposal.currency}
            </p>
          </div>
        </div>
      )}

      <PassengerDetailsForm token={params.token} slots={slots} />
    </div>
  )
}
