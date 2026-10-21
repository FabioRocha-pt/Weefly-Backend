"use client"

/**
 * As companhias do Admin, entregues ao browser pelo layout raiz.
 *
 * Regista-as no catálogo antes de os filhos renderizarem — é o que deixa o
 * `airlineName`, o `airlineLogo` e o `ticketPrefix` continuarem síncronos — e
 * dá a lista activa ao seletor por contexto, para que uma companhia nova
 * apareça depois do `router.refresh()` sem recarregar a página.
 */

import { createContext, useContext, useMemo } from "react"

import { catalogAirlines, registerAirlines, type Airline, type AirlineEntry } from "@/lib/airlines-catalog"

const AirlinesContext = createContext<Airline[] | null>(null)

export function AirlinesProvider({ airlines, children }: { airlines: AirlineEntry[]; children: React.ReactNode }) {
  const list = useMemo(() => {
    registerAirlines(airlines)
    return catalogAirlines()
  }, [airlines])
  return <AirlinesContext.Provider value={list}>{children}</AirlinesContext.Provider>
}

/** As companhias activas, pela ordem do seletor. */
export function useAirlineList(): Airline[] {
  return useContext(AirlinesContext) ?? catalogAirlines()
}
