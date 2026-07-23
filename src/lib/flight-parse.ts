import { z } from "zod"
// The Anthropic SDK's `zodOutputFormat` helper is built against Zod v4, so the
// schema handed to it must come from the `zod/v4` entrypoint. We keep the rest
// of our runtime validation (which relies on `.flatten()` etc.) on the classic
// `zod` import and use `z4` only for the Claude structured-output schema, never
// nesting one version inside the other.
import * as z4 from "zod/v4"

/**
 * Schemas for the WeeFly Concierge chatbot (Phase 2).
 *
 * `parsedFlightQuerySchema` (z4) is fed to Claude via structured outputs, so it
 * stays within the JSON-schema subset the API supports: plain types, enums and
 * nullables only — no string/number constraints. Keep it permissive and
 * normalise afterwards.
 *
 * `flightSearchInputSchema` (z) validates the POST body of /api/flights/search.
 */

export const CABIN_CLASSES = [
  "ECONOMY",
  "PREMIUM_ECONOMY",
  "BUSINESS",
  "FIRST",
] as const

export const cabinClassSchema = z.enum(CABIN_CLASSES)
export const tripTypeSchema = z.enum(["one_way", "round_trip"])

// --- Claude NLP output (structured outputs, Zod v4) -------------------------

export const parsedFlightQuerySchema = z4.object({
  origin: z4
    .string()
    .nullable()
    .describe(
      "IATA 3-letter city or airport code for the origin (e.g. LIS for Lisboa, RAI for Praia). null if the user hasn't said where they depart from."
    ),
  originLabel: z4
    .string()
    .nullable()
    .describe("Origin city name as a human would say it, e.g. 'Lisboa'."),
  destination: z4
    .string()
    .nullable()
    .describe(
      "IATA 3-letter city or airport code for the destination (e.g. CDG or PAR for Paris). null if unknown."
    ),
  destinationLabel: z4
    .string()
    .nullable()
    .describe("Destination city name as a human would say it, e.g. 'Paris'."),
  departDate: z4
    .string()
    .nullable()
    .describe(
      "Departure date as YYYY-MM-DD. Resolve relative expressions ('dia 15', 'próxima sexta', 'amanhã') against today's date. null if unknown."
    ),
  returnDate: z4
    .string()
    .nullable()
    .describe("Return date as YYYY-MM-DD, or null for one-way / unknown."),
  tripType: z4
    .enum(["one_way", "round_trip"])
    .describe(
      "'round_trip' if a return date is given or implied, otherwise 'one_way'."
    ),
  adults: z4
    .number()
    .int()
    .describe("Number of adult passengers (12+). Default to 1 if unspecified."),
  children: z4.number().int().describe("Number of children (2-11). Default to 0."),
  infants: z4.number().int().describe("Number of infants (under 2). Default to 0."),
  cabinClass: z4
    .enum(CABIN_CLASSES)
    .describe("Cabin class. Default to ECONOMY unless the user asks for business/first."),
  ready: z4
    .boolean()
    .describe(
      "true only when origin, destination AND departDate are all known — i.e. a flight search can run."
    ),
  reply: z4
    .string()
    .describe(
      "A short, warm reply in the same language the user wrote in. If not ready, ask for the single most important missing detail. If ready, confirm the route and dates you understood before searching."
    ),
})

export type ParsedFlightQuery = z4.infer<typeof parsedFlightQuerySchema>

// --- /api/flights/search input (classic Zod) --------------------------------

export const flightSearchInputSchema = z.object({
  origin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Código IATA de origem inválido"),
  destination: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Código IATA de destino inválido"),
  departDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de partida inválida"),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  tripType: tripTypeSchema.optional(),
  adults: z.coerce.number().int().min(1).max(9).default(1),
  children: z.coerce.number().int().min(0).max(9).default(0),
  infants: z.coerce.number().int().min(0).max(9).default(0),
  cabinClass: cabinClassSchema.default("ECONOMY"),
})

export type FlightSearchInput = z.infer<typeof flightSearchInputSchema>
