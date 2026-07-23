import { NextResponse } from "next/server"

import { flightSearchInputSchema } from "@/lib/flight-parse"
import { getFlightOffers, pickBest, pickCheapest } from "@/lib/amadeus"
import type { FlightSearchQuery, FlightSearchResponse } from "@/types/flights"

// Amadeus token/search calls run on the Node runtime.
export const runtime = "nodejs"

/**
 * WeeFly Concierge — flight search.
 *
 * Receives the structured query produced by /api/chat/parse, validates it,
 * queries Amadeus Flight Offers Search, and returns the formatted "cheapest"
 * and "best" options for the chat UI to render as cards.
 */
export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })
  }

  const parsed = flightSearchInputSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados de pesquisa inválidos.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    )
  }

  const input = parsed.data

  // A return date only makes sense on a round trip; keep the two consistent.
  const tripType: FlightSearchQuery["tripType"] = input.returnDate
    ? "round_trip"
    : "one_way"

  try {
    const { offers, source } = await getFlightOffers(input)

    const query: FlightSearchQuery = {
      origin: input.origin,
      destination: input.destination,
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      tripType,
      adults: input.adults,
      children: input.children,
      infants: input.infants,
      cabinClass: input.cabinClass,
    }

    const body: FlightSearchResponse = {
      query,
      cheapest: pickCheapest(offers),
      best: pickBest(offers),
      offers,
      source,
    }

    return NextResponse.json(body)
  } catch (err) {
    console.error("[flights/search] error:", err)
    return NextResponse.json(
      { error: "Não foi possível pesquisar voos neste momento." },
      { status: 502 }
    )
  }
}
