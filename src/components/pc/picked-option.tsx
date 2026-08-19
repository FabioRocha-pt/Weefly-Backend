"use client"

/**
 * A opção escolhida, confirmada em linha.
 *
 * É o P6 do mockup: um ecrã inteiro só para dizer "escolheste esta" era um beco
 * sem saída, por isso a confirmação vive no cabeçalho dos ecrãs seguintes. Com
 * ela vem o contador da janela de pagamento, que é a informação que muda o
 * comportamento de quem lê.
 */

import { useEffect, useState } from "react"
import Link from "next/link"

import type { PcState } from "@/lib/pc/state"
import { selectedOfferOf, offerStopsSummary } from "@/components/pc/offer-view"
import { carrierName } from "@/lib/pc/catalog"
import {
  cityOf,
  countdown,
  fmtDate,
  fmtDateY,
  fmtRange,
  money,
  paxShort,
} from "@/lib/pc/format"

export function PickedOption({
  state,
  showWindow = true,
}: {
  state: PcState
  showWindow?: boolean
}) {
  const offer = selectedOfferOf(state)
  const payment = state.payment
  const clock = useClock(payment?.expires_at ?? null)

  if (!offer) return null

  const dates =
    state.request.trip === "multi"
      ? state.request.legs.map((l) => fmtDate(l.date)).join(" · ")
      : fmtRange(
          state.request.departDate,
          state.request.trip === "round" ? state.request.returnDate : null
        )

  const guaranteed = Boolean(offer.valid_until)
  const total = state.totals[offer.id] ?? payment?.amount ?? 0
  const taxes = offer.taxes_total
  const fare = Math.max(0, total - taxes)

  return (
    <>
      <div className="picked">
        <div>
          <span className="k">Chosen option</span>
          <div className="rt">
            {cityOf(state.request.origin)} → {cityOf(state.request.destination)}
            {" · "}
            {offerStopsSummary(offer).toLowerCase()}
          </div>
          <div className="mt">
            {offer.name || carrierName(offer.segments[0]?.carrier_code)} · {dates} ·{" "}
            {paxShort(state.request)}
          </div>
          {/* Trocar de opção é um direito, e por isso é um link e não uma
              conversa com a equipa — enquanto o pagamento não estiver fechado. */}
          {payment?.status !== "COMPLETED" && (
            <Link className="chg" href={`/pc/${state.token}?view=p5`}>
              Change option
            </Link>
          )}
        </div>
        <div className="pr">
          <span className="k">Total to pay</span>
          <div className="amt">{money(total, state.quoteCurrency)}</div>
          <div className="mt">
            {money(fare, state.quoteCurrency)} +{" "}
            {money(taxes, state.quoteCurrency)} in taxes
          </div>
        </div>
      </div>

      {showWindow && payment?.expires_at && (
        <div className="banner warn" style={{ marginTop: 12 }} hidden={!clock}>
          <span className="ic">
            <span
              className="mono"
              style={{ fontSize: 12, fontWeight: 700, color: "#9A5B06" }}
            >
              {clock}
            </span>
          </span>
          <div>
            <b>Pay within this window to keep the price</b>
            <p>
              {guaranteed
                ? `The fare is guaranteed until ${fmtDateY(
                    payment.expires_at.slice(0, 10)
                  )} at ${payment.expires_at.slice(11, 16)}. After that the airline may change it and we will have to ask you to reconfirm.`
                : "This fare is indicative. The sooner you pay, the more likely we hold it: we reconfirm with the airline before issuing."}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function useClock(target: string | null): string | null {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    if (!target) return
    const tick = () => setText(countdown(target))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [target])

  return text
}
