"use client"

/**
 * WeeFly Price Checker — o cartão de uma opção, como o cliente a vê.
 *
 * O mockup gerava itinerários a partir de uma tabela de aeroportos e um pouco de
 * aritmética. Aqui os trechos são os que o vendedor compôs no back-office
 * (`case_offer_segments`), e é por isso que este ficheiro é sobretudo tradução:
 * de linhas de base de dados para as mesmas classes de CSS do desenho.
 *
 * As etiquetas estão em inglês porque este ecrã é o do cliente — as funções
 * partilhadas em `proposal-math` devolvem-nas em português, que é a língua do
 * back-office.
 */

import type { Offer, OfferSegment } from "@/lib/proposal-math"
import {
  dayOffset,
  formatDuration,
  layoverMinutes,
  legMinutes,
  timeOf,
} from "@/lib/proposal-math"
import type { PcState } from "@/lib/pc/state"
import { carrierName } from "@/lib/pc/catalog"
import { cityOf, money, paxFull } from "@/lib/pc/format"
import { TermIcon } from "@/components/pc/bits"

export function selectedOfferOf(state: PcState): Offer | null {
  if (!state.selectedOfferId) return null
  return state.offers.find((o) => o.id === state.selectedOfferId) ?? null
}

export function legsOfOffer(offer: Offer): {
  direction: "ida" | "volta"
  segments: OfferSegment[]
}[] {
  const sort = (a: OfferSegment, b: OfferSegment) => a.position - b.position
  const out: { direction: "ida" | "volta"; segments: OfferSegment[] }[] = []
  for (const direction of ["ida", "volta"] as const) {
    const segments = offer.segments.filter((s) => s.direction === direction).sort(sort)
    if (segments.length) out.push({ direction, segments })
  }
  return out
}

/** "Non-stop" · "1 stop in Lisbon" — a versão inglesa de `stopsLabel`. */
export function stopsEn(
  segments: OfferSegment[],
  cities?: Record<string, string>
): string {
  const stops = segments.length - 1
  if (stops <= 0) return "Non-stop"
  if (stops === 1) {
    const wait = layoverMinutes(segments[0], segments[1])
    const where = cityOf(segments[0].destination, cities)
    return wait === null ? `1 stop in ${where}` : `${where} · ${formatDuration(wait)}`
  }
  return `${stops} stops`
}

export function offerStopsSummary(
  offer: Offer,
  cities?: Record<string, string>
): string {
  const legs = legsOfOffer(offer)
  if (!legs.length) return ""
  if (legs.every((l) => l.segments.length === 1)) return "Non-stop"
  if (legs.length === 1) return stopsEn(legs[0].segments, cities)
  const outbound = legs[0].segments.length > 1
  const inbound = legs[1].segments.length > 1
  if (outbound && inbound) return "1 stop each way"
  return outbound ? "1 stop out, non-stop back" : "Non-stop out, 1 stop back"
}

/** As condições da tarifa, na ordem e com os ícones do desenho. */
export function offerTerms(offer: Offer): { ic: string; txt: string; no?: boolean }[] {
  const terms: { ic: string; txt: string; no?: boolean }[] = []
  if (offer.baggage_cabin) terms.push({ ic: "cabin", txt: `Cabin bag ${offer.baggage_cabin}` })
  terms.push({ ic: "person", txt: "Personal item 1 · small backpack" })
  if (offer.baggage_hold) terms.push({ ic: "hold", txt: `Checked ${offer.baggage_hold}` })
  if (offer.refund_policy) {
    const noRefund = /não reembols|non-refund|nao reembols/i.test(offer.refund_policy)
    terms.push({
      ic: noRefund ? "no" : "clock",
      txt: offer.refund_policy,
      no: noRefund,
    })
  }
  if (offer.change_policy) terms.push({ ic: "clock", txt: offer.change_policy })
  return terms
}

function legLabel(
  direction: "ida" | "volta",
  index: number,
  multi: boolean,
  date: string | null
): string {
  const day = date ? date.slice(0, 10) : ""
  const pretty = day
    ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : ""
  if (multi) return `Flight ${index + 1}${pretty ? ` · ${pretty}` : ""}`
  return `${direction === "ida" ? "Outbound" : "Return"}${pretty ? ` · ${pretty}` : ""}`
}

/** Um sentido: horas, aeroportos, duração e a escala. */
export function LegStrip({
  segments,
  label,
  cities,
}: {
  segments: OfferSegment[]
  label: string
  cities?: Record<string, string>
}) {
  const first = segments[0]
  const last = segments[segments.length - 1]
  const plus = dayOffset(segments)
  const total = legMinutes(segments)

  return (
    <div className="dir">
      <span className="dirtag">{label}</span>
      <div className="strip">
        <div className="node">
          <span className="tm">{timeOf(first.depart_at)}</span>
          <span className="ia">{first.origin ?? "—"}</span>
          <span className="dt">{cityOf(first.origin, cities)}</span>
        </div>
        <div className="bar" aria-hidden="true">
          <span className="du">{formatDuration(total)}</span>
          <span className="ln" />
          <span className="d a" />
          {segments.length > 1 && <span className="st" />}
          <span className="d b" />
          <span className="sp">{stopsEn(segments, cities)}</span>
        </div>
        <div className="node r">
          <span className="tm">
            {timeOf(last.arrive_at)}
            {plus > 0 && <sup style={{ fontSize: 10 }}>+{plus}</sup>}
          </span>
          <span className="ia">{last.destination ?? "—"}</span>
          <span className="dt">{cityOf(last.destination, cities)}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * O cartão de uma opção.
 *
 * "Price guaranteed" só aparece quando existe `valid_until`: é a data que o
 * vendedor extraiu do Amadeus, e sem ela a garantia seria uma frase sem nada
 * atrás. É a mesma regra que o back-office aplica ao marcar a natureza do preço.
 */
export function OfferCard({
  offer,
  total,
  currency,
  request,
  pending,
  onChoose,
}: {
  offer: Offer
  total: number
  currency: string
  request: PcState["request"]
  pending: boolean
  onChoose: () => void
}) {
  const guaranteed = Boolean(offer.valid_until)
  const legs = legsOfOffer(offer)
  const multi = request.trip === "multi"
  const category = offer.is_recommended
    ? "Best option"
    : offer.is_cheapest
      ? "Cheapest"
      : offer.is_fastest
        ? "Fastest"
        : offer.name || "Option"

  const fare =
    offer.price_adult * request.adults +
    offer.price_child * request.children +
    offer.price_infant * (request.infantsInSeat + request.infantsOnLap) +
    offer.service_fee +
    (offer.lock_fee_enabled ? offer.lock_fee : 0)

  return (
    <article className="prop">
      <div className="prop-band">
        <span className="cat">{category}</span>
        <span className={`nat ${guaranteed ? "guar" : "ind"}`}>
          {guaranteed ? "Price guaranteed" : "Subject to reconfirmation"}
        </span>
      </div>

      <div className="prop-price">
        <div>
          <div className="tot">{money(total, currency)}</div>
          <div className="brk">
            Fare <b>{money(fare, currency)}</b> + Taxes{" "}
            <b>{money(offer.taxes_total, currency)}</b>
          </div>
        </div>
        <div className="paxn">
          {paxFull(request)}
          <br />
          total to pay
        </div>
      </div>

      <div className="prop-body">
        <div className="airline">
          {offer.name || carrierName(offer.segments[0]?.carrier_code)}{" "}
          <span className="tagline">{offerStopsSummary(offer, request.cities)}</span>
        </div>

        {legs.map((leg, index) => (
          <LegStrip
            key={leg.direction}
            segments={leg.segments}
            cities={request.cities}
            label={legLabel(leg.direction, index, multi, leg.segments[0].depart_at)}
          />
        ))}

        <div className="terms">
          {offerTerms(offer).map((term, i) => (
            <div className={`trow${term.no ? " no" : ""}`} key={i}>
              <span className="ti">
                <TermIcon kind={term.ic} />
              </span>
              <span className="tt">{term.txt}</span>
            </div>
          ))}
        </div>

        {offer.agent_note && (
          <p className="notice" style={{ marginTop: 12 }}>
            <b>Note from the team:</b> {offer.agent_note}
          </p>
        )}
      </div>

      <div className="prop-cta">
        <button
          className="btn btn-primary"
          type="button"
          disabled={pending}
          onClick={onChoose}
        >
          {pending ? "Just a moment…" : "Choose this option"}
        </button>
        <p className="subnote">
          {guaranteed
            ? "You only pay after confirming your choice."
            : "We reconfirm the amount with the airline before issuing."}
        </p>
      </div>
    </article>
  )
}
