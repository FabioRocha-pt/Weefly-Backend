import { NextResponse } from "next/server"

import { searchFlights } from "@/lib/concierge-engine"

// Amadeus token/search calls run on the Node runtime.
export const runtime = "nodejs"

/**
 * WeeFly Concierge — flight search (browser channel).
 *
 * A thin HTTP wrapper over `searchFlights()` in the concierge engine. Receives
 * the structured query produced by /api/chat/parse and returns the formatted
 * "cheapest" and "best" options for the chat UI to render as cards.
 */
export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })
  }

  const outcome = await searchFlights(json)

  if (outcome.ok) {
    return NextResponse.json(outcome.result)
  }

  if (outcome.kind === "invalid") {
    return NextResponse.json(
      { error: "Dados de pesquisa inválidos.", fieldErrors: outcome.fieldErrors },
      { status: 422 }
    )
  }

  return NextResponse.json(
    { error: "Não foi possível pesquisar voos neste momento." },
    { status: 502 }
  )
}
