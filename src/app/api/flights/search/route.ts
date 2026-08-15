import { NextResponse } from "next/server"

import { searchFlights } from "@/lib/concierge-engine"
import { getI18n } from "@/i18n/server"

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
  const { t } = getI18n()
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: t("errors.invalidBody") }, { status: 400 })
  }

  const outcome = await searchFlights(json)

  if (outcome.ok) {
    return NextResponse.json(outcome.result)
  }

  if (outcome.kind === "invalid") {
    return NextResponse.json(
      { error: t("errors.invalidSearchData"), fieldErrors: outcome.fieldErrors },
      { status: 422 }
    )
  }

  return NextResponse.json(
    { error: t("errors.flightSearchFailed") },
    { status: 502 }
  )
}
