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
import { fareHeldUntil, priceNature } from "@/lib/proposal-math"
import { selectedOfferOf, offerStopsSummary } from "@/components/pc/offer-view"
import { carrierName } from "@/lib/pc/catalog"
import { useT } from "@/i18n/provider"
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
  const t = useT()
  const offer = selectedOfferOf(state)
  const payment = state.payment

  /*
   * T-11 · o contador conta o prazo que o cliente leu no email.
   *
   * "O cliente vê o mesmo prazo e um contador derivado dele." São dois prazos
   * diferentes e ele só conhece um: `pay_due_at` é a promessa comercial que foi
   * escrita na mensagem — hora do envio mais uma hora — e `expires_at` é a
   * validade do link e do preço, que é nossa. Contar o segundo enquanto a
   * mensagem prometia o primeiro era mostrar-lhe um número que ele não podia
   * reconhecer.
   *
   * Sem instruções enviadas ainda não há promessa, e o que resta é a janela do
   * link — que continua a ser verdade sobre até quando o preço vale.
   */
  const deadline = payment?.pay_due_at ?? payment?.expires_at ?? null
  const clock = useClock(deadline)

  if (!offer) return null

  const dates =
    state.request.trip === "multi"
      ? state.request.legs.map((l) => fmtDate(l.date)).join(" · ")
      : fmtRange(
          state.request.departDate,
          state.request.trip === "round" ? state.request.returnDate : null
        )

  /* FB-04 · garantido só com retenção real da companhia. Ver `priceNature`. */
  const guaranteed =
    priceNature(offer, state.proposalPublishedAt) === "guaranteed"
  const heldUntil = fareHeldUntil(offer)
  const total = state.totals[offer.id] ?? payment?.amount ?? 0
  /* BO-13 · as mesmas duas linhas do cartão da opção: preço e serviço WeeFly.
     O que aqui aparecia era "X + Y in taxes", e as taxas deixaram de ser uma
     linha — estão dentro do preço da companhia. */
  const service = offer.service_fee
  const fare = Math.max(0, total - service)

  return (
    <>
      <div className="picked">
        <div>
          <span className="k">{t("pc.picked.chosenOption")}</span>
          <div className="rt">
            {cityOf(state.request.origin, state.request.cities)} →{" "}
            {cityOf(state.request.destination, state.request.cities)}
            {" · "}
            {offerStopsSummary(offer, state.request.cities, t).toLowerCase()}
          </div>
          <div className="mt">
            {offer.name || carrierName(offer.segments[0]?.carrier_code)} · {dates} ·{" "}
            {paxShort(state.request)}
          </div>
          {/* Trocar de opção é um direito, e por isso é um link e não uma
              conversa com a equipa — enquanto o pagamento não estiver fechado. */}
          {payment?.status !== "COMPLETED" && (
            <Link className="chg" href={`/pc/${state.token}?view=p5`}>
              {t("pc.picked.change")}
            </Link>
          )}
        </div>
        <div className="pr">
          <span className="k">{t("pc.picked.totalToPay")}</span>
          <div className="amt">{money(total, state.quoteCurrency)}</div>
          <div className="mt">
            {money(fare, state.quoteCurrency)} +{" "}
            {money(service, state.quoteCurrency)} {t("pc.picked.service")}
          </div>
        </div>
      </div>

      {/*
        T-12 e T-13 · o contador, refeito.

        T-12 · "o contador é mais alto do que a área branca por baixo dele e
        sobrepõe-se". A causa era a caixa onde ele estava: `.banner .ic` é um
        quadrado de 32×32 pensado para um ícone, e lá dentro ia um `hh:mm:ss` em
        monospace. O texto não cabia e transbordava por cima do parágrafo. O
        bloco deixa de ser um `banner` com ícone e passa a ser o seu próprio
        componente, que cresce com o que tem dentro.

        T-13 · "nova ordem no bloco: contador, depois o título, depois a nota" —
        e o contador fica visível enquanto se percorre o ecrã. É o número que
        muda o comportamento de quem lê, e num telemóvel ele saía do ecrã ao
        primeiro deslize, precisamente quando a pessoa desce para pagar.
      */}
      {showWindow && deadline && clock && (
        <div className="paywin">
          <div className="paywin-clock">
            <span className="mono">{clock}</span>
            <span className="lb">{t("pc.picked.left")}</span>
          </div>
          <b>{t("pc.picked.keepPrice")}</b>
          <p>
            {/* A janela de pagamento e a retenção da companhia são dois
                prazos diferentes, e o texto só fala da segunda quando ela
                existe de facto. Antes dizia "guaranteed until" com a data da
                janela de pagamento — que é nossa, não da companhia. */}
            {guaranteed && heldUntil
              ? t("pc.picked.airlineHold", {
                  date: fmtDateY(
                    new Date(heldUntil).toISOString().slice(0, 10)
                  ),
                  time: new Date(heldUntil).toISOString().slice(11, 16),
                })
              : t("pc.picked.indicative")}
          </p>
          {payment?.pay_due_at && (
            <p className="paywin-due">
              {t("pc.picked.deadline")}{" "}
              <b>
                {new Date(payment.pay_due_at).toLocaleString(undefined, {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </b>{" "}
              {t("pc.picked.sameAsEmail")}
            </p>
          )}
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
