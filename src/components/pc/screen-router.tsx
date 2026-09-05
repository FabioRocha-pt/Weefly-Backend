"use client"

/**
 * Qual dos nove ecrãs.
 *
 * A decisão é do servidor (`screenFor`, em lib/pc/state.ts) — aqui só há duas
 * exceções, ambas navegação e nenhuma delas estado:
 *
 *   · "See the options" leva do P4b ao P5 sem ir ao servidor: é a mesma
 *     informação, já carregada.
 *   · `?view=p5` reabre a lista depois de a opção estar escolhida, que é o que o
 *     botão "Change option" precisa. Não é permitido depois de o pagamento estar
 *     fechado — a essa altura trocar de opção deixou de ser reversível sozinho.
 */

import { useState } from "react"

import type { PcState } from "@/lib/pc/state"
import type { Locale } from "@/i18n/config"
import { PcTopbar } from "@/components/pc/chrome"
import {
  ScreenP3,
  ScreenP4a,
  ScreenP4b,
  ScreenP7b,
  ScreenP8,
  ScreenP9,
} from "@/components/pc/screens-status"
import { ScreenP5 } from "@/components/pc/screen-options"
import { ScreenP7 } from "@/components/pc/screen-passengers"
import { ScreenP7Pay } from "@/components/pc/screen-payment"

export function PcScreenRouter({
  state,
  forceView,
  locale,
}: {
  state: PcState
  forceView?: string
  /**
   * T-08 · a língua que a página resolveu, e não a que está no lead.
   *
   * São duas coisas diferentes a partir do momento em que o seletor funciona: o
   * lead diz em que língua o cliente falou connosco, e isto diz em que língua
   * ele está a ler agora. O botão do cabeçalho tem de mostrar a segunda — mostrar
   * a primeira era o botão a discordar do ecrã à volta dele.
   */
  locale: Locale
}) {
  const closed =
    state.payment?.status === "COMPLETED" ||
    state.stage === "emitido" ||
    state.cancelled

  const [showOptions, setShowOptions] = useState(
    forceView === "p5" && state.offers.length > 0 && !closed
  )

  /*
   * `?view=p7` é o caminho de volta aos passaportes a partir do pagamento e do
   * ecrã de verificação. Sem ele, um nome mal escrito só se corrigia por
   * WhatsApp — e um nome mal escrito depois de emitir custa um bilhete novo.
   */
  const backToPassengers = forceView === "p7" && Boolean(state.selectedOfferId) && !closed

  const screen = showOptions ? "p5" : backToPassengers ? "p7" : state.screen

  return (
    <>
      {/*
        T-08 · o seletor passa a mudar a língua de verdade.

        `lang` vinha do lead e `onLangChange` não existia: carregar no botão
        mostrava um aviso e o ecrã continuava igual. Agora recebe a língua desta
        renderização e a acção que a grava — no cookie deste pedido e na coluna
        do lead, para os emails saírem na mesma (ver `setPcLocale`).

        T-14 · a referência vai com ele para a faixa laranja, no canto superior
        direito, no mesmo sítio e com o mesmo tratamento de todos os emails.
      */}
      <PcTopbar
        reference={state.request.reference}
        currency={state.request.currency}
        lang={locale}
        token={state.token}
      />

      {screen === "p3" && <ScreenP3 state={state} />}
      {screen === "p4a" && <ScreenP4a state={state} />}
      {screen === "p4b" && (
        <ScreenP4b state={state} onSeeOptions={() => setShowOptions(true)} />
      )}
      {screen === "p5" && <ScreenP5 state={state} />}
      {screen === "p7" && <ScreenP7 state={state} />}
      {screen === "p7pay" && <ScreenP7Pay state={state} />}
      {screen === "p7b" && <ScreenP7b state={state} />}
      {screen === "p8" && <ScreenP8 state={state} />}
      {screen === "p9" && <ScreenP9 state={state} />}
    </>
  )
}
