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
import { customerDeadline, priceNature } from "@/lib/proposal-math"
import { CABIN_LABEL, cityOf, countdown, fmtDate, fmtRange, paxFull, paxTotalOf } from "@/lib/pc/format"
import { OfferCard } from "@/components/pc/offer-view"
import { IcWa } from "@/components/pc/bits"
import { WaButton, useToast } from "@/components/pc/chrome"
import { useT } from "@/i18n/provider"

export function ScreenP5({ state }: { state: PcState }) {
  const router = useRouter()
  const toast = useToast()
  const t = useT()
  const [pending, startTransition] = useTransition()
  const [choosing, setChoosing] = useState<string | null>(null)

  const offers = state.offers
  /*
   * FB-04 · o relógio conta a janela da proposta, que nasce de `published_at` —
   * o instante em que ela foi enviada, gravado pelo servidor. Contava a data
   * que o vendedor escrevia à mão em cada oferta, que não começava a contar de
   * nada em particular e não tornava a promessa de uma hora verificável.
   */
  const instant = customerDeadline(offers, state.proposalPublishedAt)
  const clock = useCountdown(instant)
  /* Se alguma oferta tem retenção real, é dela que a frase fala. */
  const anyGuaranteed = offers.some(
    (o) => priceNature(o, state.proposalPublishedAt) === "guaranteed"
  )

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
        <span className="eyebrow">{t("pc.options.eyebrow")}</span>
        <h1>
          {offers.length === 1
            ? t("pc.options.headingOne")
            : t("pc.options.headingTwo")}
          <em>
            {cityOf(state.request.origin, state.request.cities)} →{" "}
            {cityOf(state.request.destination, state.request.cities)}
          </em>
        </h1>
        <p>
          {t("pc.options.summary", {
            pax: paxFull(state.request),
            dates,
            cabin: CABIN_LABEL[state.request.cabin],
            who:
              count === 1
                ? t("pc.options.whoOne")
                : t("pc.options.whoMany", { count }),
          })}
        </p>
      </section>

      {instant && (
        <div className="valid">
          <span className="cl mono">{clock ?? t("pc.options.expired")}</span>
          <p>
            <b>
              {anyGuaranteed
                ? t("pc.options.guaranteedUntil", { time: clockAt(instant) })
                : t("pc.options.heldUntil", { time: clockAt(instant) })}
            </b>{" "}
            {anyGuaranteed
              ? t("pc.options.guaranteedAfter")
              : t("pc.options.heldAfter")}
          </p>
        </div>
      )}

      {/*
        T-02 · quem já escolheu vê que escolheu, e vê que pode trocar.

        A lista era igual nas duas situações — a primeira visita e o regresso
        vindo de "Change option". Sem marca nenhuma na opção actual, trocar era
        um salto no escuro: o cliente não sabia de qual estava a sair.
      */}
      {state.selectedOfferId && (
        <p className="notice" style={{ marginTop: 12 }}>
          {t("pc.options.alreadyChosen")}
        </p>
      )}

      <div>
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            total={state.totals[offer.id] ?? 0}
            currency={state.quoteCurrency}
            request={state.request}
            publishedAt={state.proposalPublishedAt}
            chosen={offer.id === state.selectedOfferId}
            pending={pending && choosing === offer.id}
            onChoose={() => {
              setChoosing(offer.id)
              startTransition(async () => {
                const result = await choosePcOffer(state.token, offer.id)
                setChoosing(null)
                if (!result.ok) {
                  toast(result.error)
                  return
                }
                /*
                 * T-02 · sair do `?view=p5`, que é o que forçava a lista.
                 *
                 * `router.refresh()` recarregava os dados e deixava o endereço
                 * como estava — e com `view=p5` no endereço a página volta
                 * sempre à lista das opções. O clique gravava a escolha e o
                 * ecrã ficava exactamente igual, o que se lê como "o botão não
                 * faz nada". É este o beco sem saída do relatório.
                 *
                 * `replace` e não `push`: o "voltar" do browser tem de levar ao
                 * ecrã de onde a pessoa veio, e não outra vez à lista.
                 */
                toast(t("pc.options.updated"))
                router.replace(`/pc/${state.token}`)
                router.refresh()
              })
            }}
          />
        ))}
      </div>

      <div className="card tight">
        <WaButton reference={state.request.reference}>
          <IcWa />
          {t("pc.options.question")}
        </WaButton>
        <p className="subnote">{t("pc.options.questionNote")}</p>
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

/**
 * "15:59", na hora de Cabo Verde.
 *
 * O prazo é agora um instante e não uma hora de parede escrita à mão, por isso
 * o fuso tem de ser dito: sem ele, quem abre o link em Boston lia a hora de
 * Boston para um prazo que é nosso.
 */
function clockAt(instant: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Atlantic/Cape_Verde",
  }).format(new Date(instant))
}
