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
import { PcTopbar, type PcLang } from "@/components/pc/chrome"
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
}: {
  state: PcState
  forceView?: string
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
      <PcTopbar
        reference={state.request.reference}
        currency={state.request.currency}
        lang={state.contact.locale.toUpperCase() as PcLang}
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
