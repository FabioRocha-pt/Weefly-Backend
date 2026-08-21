"use client"

/**
 * WeeFly Price Checker — P5, as opções.
 *
 * Uma ou duas, como o contrato do mockup prevê, e cada uma com a sua natureza de
 * preço. O contador em cima conta a validade que cai primeiro: se há duas e uma
 * expira antes, é essa que manda no relógio, porque é a que se perde primeiro.
 */

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { choosePcOffer } from "@/actions/pc"
import type { PcState } from "@/lib/pc/state"
import { earliestValidity, validityInstant } from "@/lib/proposal-math"
import { CABIN_LABEL, cityOf, countdown, fmtDate, fmtRange, paxFull, paxTotalOf } from "@/lib/pc/format"
import { OfferCard } from "@/components/pc/offer-view"
import { IcWa } from "@/components/pc/bits"
import { WaButton, useToast } from "@/components/pc/chrome"

export function ScreenP5({ state }: { state: PcState }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [choosing, setChoosing] = useState<string | null>(null)

  const offers = state.offers
  const validity = earliestValidity(offers)
  const instant = validityInstant(validity)
  const clock = useCountdown(instant)

  const dates =
    state.request.trip === "multi"
      ? state.request.legs.map((l) => fmtDate(l.date)).join(" · ")
      : fmtRange(
          state.request.departDate,
          state.request.trip === "round" ? state.request.returnDate : null
        )

  const count = paxTotalOf(state.request)

  return (
    <main className="shell view">
      <section className="hero">
        <span className="eyebrow">Step 4 · choose</span>
        <h1>
          {offers.length === 1 ? "One option for " : "Two options for "}
          <em>
            {cityOf(state.request.origin, state.request.cities)} →{" "}
            {cityOf(state.request.destination, state.request.cities)}
          </em>
        </h1>
        <p>
          {paxFull(state.request)} · {dates} · {CABIN_LABEL[state.request.cabin]}.
          Prices are totals, for {count === 1 ? "the passenger" : `all ${count} passengers`}.
        </p>
      </section>

      {instant && (
        <div className="valid">
          <span className="cl mono">{clock ?? "expired"}</span>
          <p>
            <b>
              The {offers.length > 1 ? "first " : ""}option has a guaranteed price
              until {formatValidClock(validity)}.
            </b>{" "}
            After that we have to reconfirm the amount with the airline.
          </p>
        </div>
      )}

      <div>
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            total={state.totals[offer.id] ?? 0}
            currency={state.quoteCurrency}
            request={state.request}
            pending={pending && choosing === offer.id}
            onChoose={() => {
              setChoosing(offer.id)
              startTransition(async () => {
                const result = await choosePcOffer(state.token, offer.id)
                setChoosing(null)
                if (result.ok) router.refresh()
                else toast(result.error)
              })
            }}
          />
        ))}
      </div>

      <div className="card tight">
        <WaButton reference={state.request.reference}>
          <IcWa />
          I have a question about these options
        </WaButton>
        <p className="subnote">
          Not what you had in mind? Tell us and we search again, no charge.
        </p>
      </div>
      <div className="spacer" />
    </main>
  )
}

/**
 * O contador, a bater ao segundo.
 *
 * Só no cliente: o servidor renderiza a página uma vez e um contador
 * renderizado no servidor congela no instante em que a página foi feita.
 */
function useCountdown(target: number | null): string | null {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    if (!target) return
    const iso = new Date(target).toISOString()
    const tick = () => setText(countdown(iso))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [target])

  return text
}

/** "15:59" a partir da hora de parede que o vendedor escreveu. */
function formatValidClock(value: string | null): string {
  return value?.slice(11, 16) ?? "—"
}
