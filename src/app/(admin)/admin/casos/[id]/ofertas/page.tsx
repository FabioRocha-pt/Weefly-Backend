import { notFound } from "next/navigation"

import { getCase, type BookingCaseRow } from "@/lib/booking-cases"
import { ensureProposal, paxOf } from "@/lib/proposals"
import { OfferComposer } from "@/components/admin/offer-composer"
import { getI18n } from "@/i18n/server"

export const dynamic = "force-dynamic"

function formatDate(value: string | null): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : value
}

/** O separador Ofertas — o compositor do mockup A4. */
export default async function CaseOffersPage({
  params,
}: {
  params: { id: string }
}) {
  const { t } = getI18n()
  const bookingCase = await getCase(params.id)
  if (!bookingCase) notFound()

  const view = await ensureProposal(bookingCase.id)
  if (!view) {
    return (
      <div className="rounded-xl border border-adm-line bg-adm-panel p-8 text-center">
        <p className="text-[13px] text-adm-muted">
          {t("admin.composerNoProposal")}
        </p>
      </div>
    )
  }

  return (
    <OfferComposer
      caseId={bookingCase.id}
      token={bookingCase.token}
      proposal={view.proposal}
      offers={view.offers}
      pax={paxOf(bookingCase.trip_request)}
      brief={<ClientBrief bookingCase={bookingCase} />}
    />
  )
}

/**
 * O que o cliente pediu, à esquerda e sempre visível.
 *
 * Renderizado no servidor e passado como filho ao compositor: é conteúdo
 * estático, não tem razão nenhuma para ir em JavaScript para o browser.
 */
function ClientBrief({ bookingCase }: { bookingCase: BookingCaseRow }) {
  const { t } = getI18n()
  const trip = bookingCase.trip_request
  const link1 = bookingCase.links.find((l) => l.stage === 1)

  return (
    <aside className="rounded-xl border border-adm-line bg-adm-panel xl:sticky xl:top-[18px]">
      <header className="border-b border-adm-line-soft p-3.5">
        <h2 className="text-xs font-extrabold uppercase tracking-[.11em] text-adm-muted">
          {t("admin.briefTitle")}
        </h2>
      </header>

      <div className="p-3.5">
        {!trip ? (
          <p className="text-[12.5px] leading-relaxed text-adm-muted">
            {t("admin.briefNoRequest")}
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between rounded-[10px] border border-adm-line bg-adm-panel-2 p-3">
              <div>
                <div className="font-mono text-[19px] font-semibold tracking-[.04em] text-adm-txt">
                  {trip.origin}
                </div>
              </div>
              <div className="text-adm-muted">→</div>
              <div className="text-right">
                <div className="font-mono text-[19px] font-semibold tracking-[.04em] text-adm-txt">
                  {trip.destination}
                </div>
              </div>
            </div>

            <Kv
              label={t("admin.briefType")}
              value={t("tripTypes." + trip.trip_type)}
            />
            <Kv label={t("admin.briefOut")} value={formatDate(trip.depart_date)} mono />
            {trip.return_date && (
              <Kv
                label={t("admin.briefBack")}
                value={formatDate(trip.return_date)}
                mono
              />
            )}
            <Kv label={t("admin.briefAdults")} value={String(trip.adults)} mono />
            {trip.children > 0 && (
              <Kv
                label={t("admin.briefChildren")}
                value={String(trip.children)}
                mono
              />
            )}
            {trip.infants > 0 && (
              <Kv label={t("admin.briefInfants")} value={String(trip.infants)} mono />
            )}
            <Kv
              label={t("admin.briefClass")}
              value={t("cabins." + trip.cabin_class)}
            />
            <Kv
              label={t("admin.briefChannel")}
              value={
                trip.lead?.source_channel
                  ? t("channels." + trip.lead.source_channel)
                  : "—"
              }
            />

            {link1?.first_opened_at && (
              <div className="mt-3 flex items-center gap-2 text-xs text-adm-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-adm-ok" />
                {t("admin.briefLinkOpened")}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex justify-between gap-2.5 border-b border-adm-line-soft py-2 text-[13px] last:border-b-0">
      <span className="text-adm-muted">{label}</span>
      <span
        className={`text-right font-semibold text-adm-txt ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}
