"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { ChevronDown, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { selectOffer } from "@/actions/proposals"
import {
  type Offer,
  type OfferSegment,
  type PaxCounts,
  dayOffset,
  flightCodes,
  formatAmountPlain,
  formatDuration,
  formatMoney,
  layoverMinutes,
  legMinutes,
  legsOf,
  offerTotal,
  offerTravelMinutes,
  stopsLabel,
  timeOf,
  validityInstant,
} from "@/lib/proposal-math"
import { useI18n, useT } from "@/i18n/provider"
import type { Translator } from "@/i18n/translate"
import { LOCALE_TAGS } from "@/i18n/config"

type Sort = "recomendada" | "preco" | "duracao" | "escalas"

const SORT_KEYS: Record<Sort, string> = {
  recomendada: "proposal.sortRecommended",
  preco: "proposal.sortPrice",
  duracao: "proposal.sortDuration",
  escalas: "proposal.sortStops",
}

export function OfferComparator({
  token,
  offers,
  pax,
  currency,
  selectedOfferId,
  validUntil,
}: {
  token: string
  offers: Offer[]
  pax: PaxCounts
  currency: string
  selectedOfferId: string | null
  validUntil: string | null
}) {
  const t = useT()
  const [sort, setSort] = useState<Sort>("recomendada")
  const [openId, setOpenId] = useState<string | null>(null)
  const [choosing, setChoosing] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const sorted = useMemo(() => {
    const list = [...offers]
    if (sort === "preco") {
      return list.sort((a, b) => offerTotal(a, pax) - offerTotal(b, pax))
    }
    if (sort === "duracao") {
      return list.sort(
        (a, b) =>
          (offerTravelMinutes(a) ?? Infinity) -
          (offerTravelMinutes(b) ?? Infinity)
      )
    }
    if (sort === "escalas") {
      const stops = (o: Offer) => {
        const { ida, volta } = legsOf(o)
        return (
          Math.max(0, ida.length - 1) + Math.max(0, volta.length - 1)
        )
      }
      return list.sort((a, b) => stops(a) - stops(b))
    }
    // "Recomendada" respeita a ordem que o vendedor deu, com a etiqueta à frente.
    return list.sort(
      (a, b) =>
        Number(b.is_recommended) - Number(a.is_recommended) ||
        a.position - b.position
    )
  }, [offers, sort, pax])

  function choose(offerId: string) {
    setChoosing(offerId)
    startTransition(() => {
      selectOffer(token, offerId)
    })
  }

  return (
    <>
      <ValidityBanner validUntil={validUntil} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-slate-500">
          {t("proposal.sortBy")}
        </span>
        {(Object.keys(SORT_KEYS) as Sort[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={sort === key}
            onClick={() => setSort(key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              sort === key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            {t(SORT_KEYS[key])}
          </button>
        ))}
        <span className="ml-auto text-[12.5px] text-slate-400">
          {t("proposal.count", { count: offers.length })}
        </span>
      </div>

      <div className="space-y-4">
        {sorted.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            pax={pax}
            currency={currency}
            open={openId === offer.id}
            chosen={selectedOfferId === offer.id}
            busy={pending && choosing === offer.id}
            disabled={pending}
            onToggle={() => setOpenId(openId === offer.id ? null : offer.id)}
            onChoose={() => choose(offer.id)}
            t={t}
          />
        ))}
      </div>
    </>
  )
}

/**
 * O relógio da validade.
 *
 * Renderizado só depois de montar no browser: a hora do servidor e a do
 * telemóvel do cliente nunca coincidem ao segundo, e um número diferente entre
 * o HTML e a primeira renderização é um erro de hidratação.
 */
function ValidityBanner({ validUntil }: { validUntil: string | null }) {
  const { t, locale } = useI18n()
  const deadline = validityInstant(validUntil)
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    if (deadline === null) return
    const tick = () => setLeft(Math.floor((deadline - Date.now()) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  if (deadline === null) return null

  const label =
    left === null
      ? "—"
      : left <= 0
        ? t("proposal.validityExpiredClock")
        : formatCountdown(left)

  const expired = left !== null && left <= 0

  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-center gap-4 rounded-2xl border p-5",
        expired
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      )}
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold text-slate-900">
          {expired
            ? t("proposal.validityExpiredTitle")
            : t("proposal.validityTitle", {
                deadline: formatDeadline(validUntil, LOCALE_TAGS[locale]),
              })}
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          {t(expired ? "proposal.validityExpiredBody" : "proposal.validityBody")}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-xl px-4 py-2.5 font-mono text-lg font-semibold tabular-nums",
          expired ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-900"
        )}
        aria-live="polite"
        suppressHydrationWarning
      >
        {label}
      </span>
    </div>
  )
}

/** "1d 04:12:38" — dias só quando existem, para o número não crescer à toa. */
function formatCountdown(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const days = Math.floor(seconds / 86400)
  const clock = [
    pad(Math.floor((seconds % 86400) / 3600)),
    pad(Math.floor((seconds % 3600) / 60)),
    pad(seconds % 60),
  ].join(":")
  return days > 0 ? `${days}d ${clock}` : clock
}

/**
 * "6 de setembro, 18:00 (WAT)" — e o equivalente em inglês e francês.
 *
 * Construído com `Intl` a partir do tag do idioma em vez de uma lista de meses
 * escrita à mão: são três línguas hoje e a lista teria de crescer com cada uma.
 * A data é lida como hora de parede (ver a migração 0005), por isso é montada
 * em UTC e formatada em UTC — caso contrário o fuso do browser deslocava-a.
 */
function formatDeadline(value: string | null, locale: string): string {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return "—"
  const [, y, mo, d, h, mi] = m
  const at = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
  const formatted = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(at)
  return `${formatted} (WAT)`
}

// --- Cartão da oferta --------------------------------------------------------

function OfferCard({
  offer,
  pax,
  currency,
  open,
  chosen,
  busy,
  disabled,
  onToggle,
  onChoose,
  t,
}: {
  offer: Offer
  pax: PaxCounts
  currency: string
  open: boolean
  chosen: boolean
  busy: boolean
  disabled: boolean
  onToggle: () => void
  onChoose: () => void
  t: Translator
}) {
  const legs = legsOf(offer)
  const paxTotal = pax.adults + pax.children + pax.infants
  const badges = [
    offer.is_recommended && {
      label: t("proposal.badgeRecommended"),
      tone: "dark",
    },
    offer.is_cheapest && { label: t("proposal.badgeCheapest"), tone: "ok" },
    offer.is_fastest && { label: t("proposal.badgeFastest"), tone: "plain" },
  ].filter(Boolean) as { label: string; tone: string }[]

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors",
        chosen ? "border-orange-500 ring-1 ring-orange-500" : "border-slate-200"
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="p-5 sm:p-6">
          {badges.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <span
                  key={b.label}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider",
                    b.tone === "dark" && "bg-slate-900 text-white",
                    b.tone === "ok" && "bg-green-100 text-green-700",
                    b.tone === "plain" && "bg-slate-100 text-slate-600"
                  )}
                >
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {(["ida", "volta"] as const).map((d) =>
            legs[d].length === 0 ? null : (
              <LegStrip
                key={d}
                label={t(d === "ida" ? "legs.outbound" : "legs.inbound")}
                segments={legs[d]}
                fareName={offer.fare_name}
                t={t}
              />
            )
          )}

          {offer.agent_note && (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-600">
              <b className="text-slate-900">{t("proposal.agentNote")}</b>{" "}
              {offer.agent_note}
            </p>
          )}

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-orange-600 transition-colors hover:text-orange-700"
          >
            {t(open ? "proposal.discloseClose" : "proposal.discloseOpen")}
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            />
          </button>
        </div>

        <aside className="flex flex-col justify-center gap-1 border-t border-dashed border-slate-200 bg-slate-50/60 p-5 md:border-l md:border-t-0 sm:p-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t("proposal.totalFor", { count: paxTotal })}
          </span>
          <p className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
            {formatMoney(offerTotal(offer, pax), currency)}
          </p>
          <p className="mb-3 text-[11.5px] text-slate-500">
            {t("proposal.includesTaxes")}
          </p>
          <button
            type="button"
            onClick={onChoose}
            disabled={disabled}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-colors disabled:opacity-60",
              chosen
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "bg-orange-600 text-white hover:bg-orange-700"
            )}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t(chosen ? "proposal.continueCta" : "proposal.chooseCta")}
          </button>
        </aside>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-slate-50/60 p-5 sm:p-6">
          <OfferDetail offer={offer} pax={pax} currency={currency} t={t} />
        </div>
      )}
    </article>
  )
}

function LegStrip({
  label,
  segments,
  fareName,
  t,
}: {
  label: string
  segments: OfferSegment[]
  fareName: string | null
  t: Translator
}) {
  const first = segments[0]
  const last = segments[segments.length - 1]
  const plus = dayOffset(segments)

  return (
    <div className="flex gap-4 border-t border-dashed border-slate-200 py-4 first:border-t-0 first:pt-0">
      <span className="w-9 shrink-0 pt-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <span className="block font-mono text-lg font-semibold leading-tight text-slate-900">
              {timeOf(first.depart_at)}
            </span>
            <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-500">
              {first.origin ?? "—"}
            </span>
          </div>
          <div className="min-w-0 flex-1 text-center">
            <span className="block text-[11.5px] font-semibold text-slate-600">
              {formatDuration(legMinutes(segments))}
            </span>
            <span className="my-1 block h-px bg-slate-200" />
            <span className="block truncate text-[11.5px] text-slate-500">
              {stopsLabel(segments)}
            </span>
          </div>
          <div className="shrink-0 text-right">
            <span className="block font-mono text-lg font-semibold leading-tight text-slate-900">
              {timeOf(last.arrive_at)}
              {plus > 0 && (
                <sup className="text-[11px] font-bold text-orange-600">
                  +{plus}
                </sup>
              )}
            </span>
            <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-500">
              {last.destination ?? "—"}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] text-slate-500">
          <span className="font-mono">{flightCodes(segments)}</span>
          {fareName && <span> · {t("proposal.fareName", { name: fareName })}</span>}
        </p>
      </div>
    </div>
  )
}

/** C3b — o detalhe que se abre por baixo do cartão. */
function OfferDetail({
  offer,
  pax,
  currency,
  t,
}: {
  offer: Offer
  pax: PaxCounts
  currency: string
  t: Translator
}) {
  const legs = legsOf(offer)
  const conditions = [
    [t("proposal.conditionBaggageCabin"), offer.baggage_cabin],
    [t("proposal.conditionBaggageHold"), offer.baggage_hold],
    [t("proposal.conditionChange"), offer.change_policy],
    [t("proposal.conditionRefund"), offer.refund_policy],
    [t("proposal.conditionSeat"), offer.seat_policy],
    [t("proposal.conditionDocuments"), offer.documents],
  ].filter(([, value]) => Boolean(value)) as [string, string][]

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-5">
        {(["ida", "volta"] as const).map((d) =>
          legs[d].length === 0 ? null : (
            <div key={d}>
              <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                {t("proposal.detailItinerary")} ·{" "}
                {t(d === "ida" ? "legs.outbound" : "legs.inbound")}
              </p>
              {legs[d].map((segment, i) => (
                <div key={segment.id}>
                  {i > 0 && (
                    <p className="my-2 rounded-lg bg-white px-3 py-2 text-[12px] text-slate-500">
                      {t("proposal.layover", {
                        place: segment.origin ?? "—",
                        duration: formatDuration(
                          layoverMinutes(legs[d][i - 1], segment)
                        ),
                      })}
                    </p>
                  )}
                  <p className="font-mono text-[11.5px] text-slate-500">
                    {[segment.carrier_code, segment.flight_number]
                      .filter(Boolean)
                      .join(" ")}
                    {segment.equipment ? ` · ${segment.equipment}` : ""} ·{" "}
                    {t("cabins." + segment.cabin)}
                    {segment.booking_class
                      ? ` (${segment.booking_class})`
                      : ""}
                  </p>
                  <div className="mt-1.5 border-l-2 border-slate-200 pl-4">
                    <SegPoint
                      time={timeOf(segment.depart_at)}
                      place={segment.origin}
                      meta={segment.terminal_from}
                    />
                    <SegPoint
                      time={timeOf(segment.arrive_at)}
                      place={segment.destination}
                      meta={segment.terminal_to}
                    />
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {conditions.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              {t("proposal.detailConditions")}
            </p>
            <dl className="divide-y divide-slate-200 rounded-xl bg-white px-4">
              {conditions.map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-wrap justify-between gap-2 py-2.5 text-[13px]"
                >
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
          {t("proposal.detailPrice")}
        </p>
        <dl className="divide-y divide-slate-200 rounded-xl bg-white px-4">
          {pax.adults > 0 && (
            <PriceLine
              label={`${t("proposal.priceAdults")} ${pax.adults} × ${formatAmountPlain(offer.price_adult)}`}
              value={formatAmountPlain(offer.price_adult * pax.adults)}
            />
          )}
          {pax.children > 0 && (
            <PriceLine
              label={`${t("proposal.priceChild")} ${pax.children} × ${formatAmountPlain(offer.price_child)}`}
              note={t("proposal.priceChildNote")}
              value={formatAmountPlain(offer.price_child * pax.children)}
            />
          )}
          {pax.infants > 0 && (
            <PriceLine
              label={`${t("proposal.priceInfant")} ${pax.infants} × ${formatAmountPlain(offer.price_infant)}`}
              note={t("proposal.priceInfantNote")}
              value={formatAmountPlain(offer.price_infant * pax.infants)}
            />
          )}
          {offer.taxes_total > 0 && (
            <PriceLine
              label={t("proposal.priceTaxes")}
              value={formatAmountPlain(offer.taxes_total)}
            />
          )}
          {offer.service_fee > 0 && (
            <PriceLine
              label={t("proposal.priceService")}
              note={t("proposal.priceServiceNote")}
              value={formatAmountPlain(offer.service_fee)}
            />
          )}
          {offer.lock_fee_enabled && offer.lock_fee > 0 && (
            <PriceLine
              label={t("proposal.priceLockFee")}
              note={t("proposal.priceLockFeeNote")}
              value={formatAmountPlain(offer.lock_fee)}
            />
          )}
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-sm font-bold text-slate-900">
              {t("proposal.priceTotal")}
            </dt>
            <dd className="font-mono text-base font-bold text-slate-900">
              {formatMoney(offerTotal(offer, pax), currency)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
          {t("proposal.priceCurrencyNote", { currency })}
        </p>
      </div>
    </div>
  )
}

function SegPoint({
  time,
  place,
  meta,
}: {
  time: string
  place: string | null
  meta: string | null
}) {
  return (
    <div className="py-1.5">
      <span className="font-mono text-[13px] font-semibold text-slate-900">
        {time}
      </span>
      <span className="ml-2 text-[13px] text-slate-700">{place ?? "—"}</span>
      {meta && <span className="block text-[11.5px] text-slate-400">{meta}</span>}
    </div>
  )
}

function PriceLine({
  label,
  note,
  value,
}: {
  label: string
  note?: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-slate-600">
        {label}
        {note && <span className="block text-[11.5px] text-slate-400">{note}</span>}
      </dt>
      <dd className="shrink-0 font-mono text-[13px] font-medium text-slate-900">
        {value}
      </dd>
    </div>
  )
}
