import Link from "next/link"
import { CheckCircle2, Hourglass } from "lucide-react"

import { getCaseByToken, markLinkOpened } from "@/lib/booking-cases"
import { getPublishedProposal, paxOf } from "@/lib/proposals"
import { earliestValidity } from "@/lib/proposal-math"
import { LinkUnavailable } from "@/components/concierge/link-unavailable"
import { CaseStepper } from "@/components/concierge/case-stepper"
import { OfferComparator } from "@/components/concierge/offer-comparator"
import { getI18n } from "@/i18n/server"

export const dynamic = "force-dynamic"

function formatDate(value: string | null): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : value
}

/**
 * Link 2 — o comparador de ofertas (C3).
 *
 * Só existe depois de o vendedor carregar em "Publicar e avisar cliente": até
 * lá a etapa 2 está bloqueada e `getCaseByToken` devolve `locked`. Escolher uma
 * opção grava a escolha e leva ao formulário dos passageiros.
 */
export default async function CaseProposalPage({
  params,
}: {
  params: { token: string }
}) {
  const { t } = getI18n()
  const lookup = await getCaseByToken(params.token, 2)
  if (!lookup.ok) return <LinkUnavailable reason={lookup.reason} />

  const { case: bookingCase, link } = lookup.view
  const trip = bookingCase.trip_request

  if (link.status === "submetido") {
    return (
      <Panel icon={<CheckCircle2 className="h-9 w-9 text-green-500" />} tone="ok">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("proposal.doneTitle")}
        </h1>
        <p className="mt-3 leading-relaxed text-slate-500">{t("proposal.doneBody")}</p>
      </Panel>
    )
  }

  const view = await getPublishedProposal(bookingCase.id)

  /*
   * Etapa aberta mas sem proposta publicada quer dizer uma coisa só: o vendedor
   * abriu uma revisão e está a mexer nos preços. Dizê-lo é melhor do que
   * mostrar valores que já sabemos estar a mudar.
   */
  if (!view || view.offers.length === 0) {
    return (
      <Panel icon={<Hourglass className="h-8 w-8 text-slate-400" />}>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("proposal.preparingTitle")}
        </h1>
        <p className="mt-3 leading-relaxed text-slate-500">{t("proposal.preparingBody")}</p>
        {trip?.reference && (
          <p className="mt-5 inline-block rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-500">
            {t("common.reference")}:{" "}
            <strong className="font-mono text-slate-900">
              {trip.reference}
            </strong>
          </p>
        )}
      </Panel>
    )
  }

  await markLinkOpened(link.id)

  const pax = paxOf(trip)
  const paxTotal = pax.adults + pax.children + pax.infants
  const paxLabel = [
    t("common.adults", { count: pax.adults }),
    pax.children > 0 && t("common.children", { count: pax.children }),
    pax.infants > 0 && t("common.infants", { count: pax.infants }),
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div>
      <CaseStepper current={3} />

      <header className="mb-6">
        <p className="text-[12.5px] font-semibold uppercase tracking-wider text-orange-600">
          {t("proposal.eyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          {t("proposal.title", { count: view.offers.length })}
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-slate-500">
          {view.proposal.opening_message ?? t("proposal.defaultIntro")}
        </p>

        {trip && (
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-200 pt-5">
            <Fact label={t("proposal.factRoute")} mono>
              {trip.origin} → {trip.destination}
            </Fact>
            <Fact label={t("proposal.factOut")}>{formatDate(trip.depart_date)}</Fact>
            {trip.return_date && (
              <Fact label={t("proposal.factBack")}>{formatDate(trip.return_date)}</Fact>
            )}
            <Fact label={t("proposal.factPassengers")}>{paxLabel}</Fact>
            <Fact label={t("proposal.factClass")}>
              {t(`cabins.${trip.cabin_class}`)}
            </Fact>
          </dl>
        )}
      </header>

      <OfferComparator
        token={params.token}
        offers={view.offers}
        pax={pax}
        currency={view.proposal.currency}
        selectedOfferId={view.proposal.selected_offer_id}
        validUntil={earliestValidity(view.offers)}
      />

      {view.proposal.selected_offer_id && (
        <p className="mt-6 text-center text-[13px] text-slate-500">
          {t("proposal.alreadyChose")}{" "}
          <Link
            href={`/p/${params.token}/passageiros`}
            className="font-semibold text-orange-600 hover:text-orange-700"
          >
            {t("proposal.continueToPassengers")}
          </Link>
        </p>
      )}

      <p className="mt-10 text-center text-xs leading-relaxed text-slate-400">
        {t("proposal.personalLink", { count: paxTotal })}
      </p>
    </div>
  )
}

function Fact({
  label,
  mono,
  children,
}: {
  label: string
  mono?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-[14px] font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}
      >
        {children}
      </dd>
    </div>
  )
}

function Panel({
  icon,
  tone,
  children,
}: {
  icon: React.ReactNode
  tone?: "ok"
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
      <div
        className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${tone === "ok" ? "bg-green-50" : "bg-slate-50"}`}
      >
        {icon}
      </div>
      {children}
    </div>
  )
}
