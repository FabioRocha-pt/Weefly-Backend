/**
 * WeeFly Concierge — Flight types (Phase 2).
 *
 * Two layers of types live here:
 *  1. `Amadeus*` — a faithful (partial) model of the Amadeus Flight Offers
 *     Search API v2 response, so the server code parses it type-safely.
 *  2. `Formatted*` — the trimmed, presentation-ready shape the chat UI renders.
 *     The frontend never sees a raw Amadeus payload; the API route maps it down
 *     to these.
 */

// --- Shared enums -----------------------------------------------------------

export type FlightTripType = "one_way" | "round_trip"

/** Amadeus `travelClass` values. */
export type CabinClass = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"

// --- Amadeus Flight Offers Search (v2) response -----------------------------
// Only the fields WeeFly consumes are modelled; the API returns more.

export interface AmadeusFlightEndpoint {
  iataCode: string
  terminal?: string
  /** Local date-time, e.g. "2026-08-15T08:20:00". No timezone offset. */
  at: string
}

export interface AmadeusSegment {
  departure: AmadeusFlightEndpoint
  arrival: AmadeusFlightEndpoint
  carrierCode: string
  number: string
  aircraft: { code: string }
  operating?: { carrierCode: string }
  /** ISO-8601 duration, e.g. "PT2H30M". */
  duration: string
  id: string
  numberOfStops: number
  blacklistedInEU?: boolean
}

export interface AmadeusItinerary {
  /** ISO-8601 duration for the whole itinerary, e.g. "PT5H45M". */
  duration: string
  segments: AmadeusSegment[]
}

export interface AmadeusFee {
  amount: string
  type: string
}

export interface AmadeusPrice {
  currency: string
  total: string
  base: string
  fees?: AmadeusFee[]
  grandTotal?: string
}

export interface AmadeusFlightOffer {
  type: "flight-offer"
  id: string
  source: string
  instantTicketingRequired: boolean
  nonHomogeneous: boolean
  oneWay: boolean
  lastTicketingDate?: string
  numberOfBookableSeats: number
  itineraries: AmadeusItinerary[]
  price: AmadeusPrice
  validatingAirlineCodes: string[]
}

/** Dictionaries let us resolve carrier/aircraft codes to display names. */
export interface AmadeusDictionaries {
  carriers?: Record<string, string>
  aircraft?: Record<string, string>
  currencies?: Record<string, string>
  locations?: Record<string, { cityCode?: string; countryCode?: string }>
}

export interface AmadeusFlightOffersResponse {
  meta?: { count: number }
  data: AmadeusFlightOffer[]
  dictionaries?: AmadeusDictionaries
}

/** Amadeus error envelope (non-2xx responses). */
export interface AmadeusErrorResponse {
  errors: Array<{
    status: number
    code: number
    title: string
    detail?: string
  }>
}

// --- Presentation shapes (what the chat UI renders) -------------------------

export interface FormattedFlightEndpoint {
  iataCode: string
  /** Raw ISO date-time from Amadeus. */
  at: string
  /** "08:20" */
  timeLabel: string
  /** "15 ago" */
  dateLabel: string
}

export interface FormattedItinerary {
  durationMinutes: number
  /** "5h 45m" */
  durationLabel: string
  /** Number of stops = segments − 1. */
  stops: number
  /** "Direto" | "1 escala" | "2 escalas" */
  stopsLabel: string
  departure: FormattedFlightEndpoint
  arrival: FormattedFlightEndpoint
  carrierCode: string
  carrierName: string
  segmentCount: number
}

export interface FormattedPrice {
  /** Numeric grand total, for sorting/scoring. */
  total: number
  currency: string
  /** Localised label, e.g. "128,40 €". */
  label: string
}

export interface FormattedFlightOffer {
  id: string
  price: FormattedPrice
  /** [outbound] for one-way, [outbound, inbound] for round trips. */
  itineraries: FormattedItinerary[]
  seatsLeft: number | null
  /** Lower is better — combines price, duration and stops. */
  score: number
}

/** Echoes back the normalised search so the UI can label the results. */
export interface FlightSearchQuery {
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  tripType: FlightTripType
  adults: number
  children: number
  infants: number
  cabinClass: CabinClass
}

export interface FlightSearchResponse {
  query: FlightSearchQuery
  cheapest: FormattedFlightOffer | null
  best: FormattedFlightOffer | null
  offers: FormattedFlightOffer[]
  /** Whether results came from the live Amadeus API or the local mock. */
  source: "amadeus" | "mock"
}
