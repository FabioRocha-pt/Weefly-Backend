import type {
  AmadeusDictionaries,
  AmadeusFlightOffer,
  AmadeusFlightOffersResponse,
  FormattedFlightOffer,
  FormattedItinerary,
} from "@/types/flights"
import type { FlightSearchInput } from "@/lib/flight-parse"

/**
 * Amadeus Flight Offers Search integration.
 *
 * Amadeus uses OAuth2 client-credentials: you POST your key/secret to get a
 * short-lived bearer token, then call the Self-Service APIs with it. We cache
 * the token in module scope for its lifetime.
 *
 * Set these in .env.local (test env values come from the Amadeus dashboard):
 *   AMADEUS_CLIENT_ID
 *   AMADEUS_CLIENT_SECRET
 *   AMADEUS_API_BASE   (defaults to the test host)
 *
 * When the credentials are absent, `getFlightOffers` returns realistic mock
 * offers so the concierge flow stays demoable end-to-end without an account.
 */

const AMADEUS_BASE =
  process.env.AMADEUS_API_BASE ?? "https://test.api.amadeus.com"

const CURRENCY = process.env.AMADEUS_CURRENCY ?? "EUR"

// --- OAuth2 token ------------------------------------------------------------

interface TokenCache {
  token: string
  /** Epoch ms after which the token must be refreshed. */
  expiresAt: number
}

let tokenCache: TokenCache | null = null

interface AmadeusTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

async function getAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  // Reuse a still-valid token (with a 60s safety margin).
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token
  }

  const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    // Tokens are per-deploy secrets; never cache at the fetch layer.
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Amadeus auth failed (${res.status})`)
  }

  const body = (await res.json()) as AmadeusTokenResponse
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  }
  return tokenCache.token
}

// --- Live search -------------------------------------------------------------

function buildSearchParams(input: FlightSearchInput): URLSearchParams {
  const params = new URLSearchParams({
    originLocationCode: input.origin,
    destinationLocationCode: input.destination,
    departureDate: input.departDate,
    adults: String(input.adults),
    currencyCode: CURRENCY,
    travelClass: input.cabinClass,
    max: "20",
  })
  if (input.returnDate) params.set("returnDate", input.returnDate)
  if (input.children > 0) params.set("children", String(input.children))
  if (input.infants > 0) params.set("infants", String(input.infants))
  return params
}

/**
 * Search flights. Returns formatted offers plus whether they came from the
 * live API or the local mock (credentials missing).
 */
export async function getFlightOffers(
  input: FlightSearchInput
): Promise<{ offers: FormattedFlightOffer[]; source: "amadeus" | "mock" }> {
  const clientId = process.env.AMADEUS_CLIENT_ID
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.warn(
      "[amadeus] AMADEUS_CLIENT_ID/SECRET not set — returning mock offers."
    )
    return { offers: buildMockOffers(input), source: "mock" }
  }

  const token = await getAccessToken(clientId, clientSecret)
  const params = buildSearchParams(input)

  const res = await fetch(
    `${AMADEUS_BASE}/v2/shopping/flight-offers?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  )

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Amadeus search failed (${res.status}): ${detail}`)
  }

  const payload = (await res.json()) as AmadeusFlightOffersResponse
  const offers = formatOffers(payload.data, payload.dictionaries)
  return { offers, source: "amadeus" }
}

// --- Formatting: Amadeus offer → presentation shape -------------------------

/** Parse an ISO-8601 duration like "PT5H45M" into total minutes. */
function parseIsoDurationToMinutes(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso)
  if (!match) return 0
  const hours = match[1] ? Number(match[1]) : 0
  const minutes = match[2] ? Number(match[2]) : 0
  return hours * 60 + minutes
}

function formatDurationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function stopsLabel(stops: number): string {
  if (stops <= 0) return "Direto"
  if (stops === 1) return "1 escala"
  return `${stops} escalas`
}

const DATE_LABEL_FMT = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
})

function formatEndpoint(iataCode: string, at: string) {
  // Amadeus local date-times have no offset; slice to avoid TZ drift.
  const timeLabel = at.slice(11, 16)
  const dateOnly = at.slice(0, 10)
  const parsed = new Date(`${dateOnly}T00:00:00`)
  const dateLabel = Number.isNaN(parsed.getTime())
    ? dateOnly
    : DATE_LABEL_FMT.format(parsed).replace(".", "")
  return { iataCode, at, timeLabel, dateLabel }
}

function formatItinerary(
  itinerary: AmadeusFlightOffer["itineraries"][number],
  dictionaries?: AmadeusDictionaries
): FormattedItinerary {
  const { segments } = itinerary
  const first = segments[0]
  const last = segments[segments.length - 1]
  const durationMinutes = parseIsoDurationToMinutes(itinerary.duration)
  const stops = segments.length - 1
  const carrierName =
    dictionaries?.carriers?.[first.carrierCode] ?? first.carrierCode

  return {
    durationMinutes,
    durationLabel: formatDurationLabel(durationMinutes),
    stops,
    stopsLabel: stopsLabel(stops),
    departure: formatEndpoint(first.departure.iataCode, first.departure.at),
    arrival: formatEndpoint(last.arrival.iataCode, last.arrival.at),
    carrierCode: first.carrierCode,
    carrierName,
    segmentCount: segments.length,
  }
}

function currencyLabel(total: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
    }).format(total)
  } catch {
    return `${total.toFixed(2)} ${currency}`
  }
}

function formatOffers(
  data: AmadeusFlightOffer[],
  dictionaries?: AmadeusDictionaries
): FormattedFlightOffer[] {
  const offers: FormattedFlightOffer[] = data.map((offer) => {
    const total = Number(offer.price.grandTotal ?? offer.price.total)
    const itineraries = offer.itineraries.map((it) =>
      formatItinerary(it, dictionaries)
    )
    return {
      id: offer.id,
      price: {
        total,
        currency: offer.price.currency,
        label: currencyLabel(total, offer.price.currency),
      },
      itineraries,
      seatsLeft: offer.numberOfBookableSeats ?? null,
      score: 0, // filled in by scoreOffers once the whole set is known
    }
  })
  return scoreOffers(offers)
}

// --- Ranking -----------------------------------------------------------------

function totalDuration(offer: FormattedFlightOffer): number {
  return offer.itineraries.reduce((sum, it) => sum + it.durationMinutes, 0)
}

function totalStops(offer: FormattedFlightOffer): number {
  return offer.itineraries.reduce((sum, it) => sum + it.stops, 0)
}

/**
 * Assign each offer a "best" score (lower = better) by normalising price,
 * duration and stops across the result set, then weighting them.
 */
function scoreOffers(offers: FormattedFlightOffer[]): FormattedFlightOffer[] {
  if (offers.length === 0) return offers

  const prices = offers.map((o) => o.price.total)
  const durations = offers.map(totalDuration)
  const stops = offers.map(totalStops)

  const range = (values: number[]) => {
    const min = Math.min(...values)
    const max = Math.max(...values)
    return { min, span: max - min || 1 }
  }
  const priceRange = range(prices)
  const durationRange = range(durations)
  const stopsRange = range(stops)

  return offers.map((offer) => {
    const priceNorm = (offer.price.total - priceRange.min) / priceRange.span
    const durationNorm =
      (totalDuration(offer) - durationRange.min) / durationRange.span
    const stopsNorm = (totalStops(offer) - stopsRange.min) / stopsRange.span
    const score = priceNorm * 0.5 + durationNorm * 0.32 + stopsNorm * 0.18
    return { ...offer, score }
  })
}

/** Cheapest by absolute price. */
export function pickCheapest(
  offers: FormattedFlightOffer[]
): FormattedFlightOffer | null {
  if (offers.length === 0) return null
  return offers.reduce((best, o) => (o.price.total < best.price.total ? o : best))
}

/** Best by blended score (price + duration + stops). */
export function pickBest(
  offers: FormattedFlightOffer[]
): FormattedFlightOffer | null {
  if (offers.length === 0) return null
  return offers.reduce((best, o) => (o.score < best.score ? o : best))
}

// --- Mock fallback -----------------------------------------------------------

const MOCK_CARRIERS: { code: string; name: string }[] = [
  { code: "TP", name: "TAP Air Portugal" },
  { code: "VR", name: "Cabo Verde Airlines" },
  { code: "AF", name: "Air France" },
  { code: "IB", name: "Iberia" },
]

/** Add minutes to an ISO local date-time (no timezone handling). */
function addMinutesToLocal(baseDate: string, minutesFromMidnight: number): string {
  const d = new Date(`${baseDate}T00:00:00`)
  d.setMinutes(d.getMinutes() + minutesFromMidnight)
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  )
}

function buildMockItinerary(
  from: string,
  to: string,
  date: string,
  departMinute: number,
  durationMinutes: number,
  stops: number,
  carrier: { code: string; name: string }
): FormattedItinerary {
  const arriveMinute = departMinute + durationMinutes
  return {
    durationMinutes,
    durationLabel: formatDurationLabel(durationMinutes),
    stops,
    stopsLabel: stopsLabel(stops),
    departure: formatEndpoint(from, addMinutesToLocal(date, departMinute)),
    arrival: formatEndpoint(to, addMinutesToLocal(date, arriveMinute)),
    carrierCode: carrier.code,
    carrierName: carrier.name,
    segmentCount: stops + 1,
  }
}

/**
 * Deterministic-ish mock offers shaped by the actual request, so cheapest and
 * best genuinely differ. Used only when Amadeus credentials are missing.
 */
function buildMockOffers(input: FlightSearchInput): FormattedFlightOffer[] {
  const paxFactor =
    input.adults + input.children * 0.75 + input.infants * 0.1 || 1
  const cabinFactor: Record<FlightSearchInput["cabinClass"], number> = {
    ECONOMY: 1,
    PREMIUM_ECONOMY: 1.6,
    BUSINESS: 2.8,
    FIRST: 4.2,
  }
  const base = 90 * cabinFactor[input.cabinClass]

  // [priceEUR, outbound duration, stops, depart minute, carrier index]
  const templates: [number, number, number, number, number][] = [
    [base * 0.85, 165, 0, 8 * 60 + 20, 0],
    [base * 1.35, 150, 0, 13 * 60 + 5, 2],
    [base * 0.7, 320, 1, 6 * 60 + 40, 1],
    [base * 1.05, 205, 0, 18 * 60 + 30, 3],
    [base * 0.62, 470, 2, 5 * 60 + 55, 1],
  ]

  const raw: FormattedFlightOffer[] = templates.map((tpl, i) => {
    const [unitPrice, duration, stops, departMinute, carrierIdx] = tpl
    const carrier = MOCK_CARRIERS[carrierIdx]
    const itineraries: FormattedItinerary[] = [
      buildMockItinerary(
        input.origin,
        input.destination,
        input.departDate,
        departMinute,
        duration,
        stops,
        carrier
      ),
    ]
    if (input.returnDate) {
      itineraries.push(
        buildMockItinerary(
          input.destination,
          input.origin,
          input.returnDate,
          departMinute + 90,
          duration + 20,
          stops,
          carrier
        )
      )
    }
    const legs = itineraries.length
    const total = Math.round(unitPrice * legs * paxFactor * 100) / 100
    return {
      id: `mock-${i + 1}`,
      price: { total, currency: CURRENCY, label: currencyLabel(total, CURRENCY) },
      itineraries,
      seatsLeft: 9 - i,
      score: 0,
    }
  })

  return scoreOffers(raw)
}
