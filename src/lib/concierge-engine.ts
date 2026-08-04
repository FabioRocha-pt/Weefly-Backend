/**
 * WeeFly Concierge — channel-agnostic conversation engine.
 *
 * One brain, many channels. This module owns the full turn: free text in →
 * structured query (Claude) → flight search (Amadeus) → reply + offers out.
 * It performs no HTTP self-calls and knows nothing about React, WhatsApp or
 * Next.js request objects, so every channel drives the same logic:
 *
 *   - /api/chat/parse + /api/flights/search  → thin HTTP wrappers (web widget)
 *   - /api/whatsapp/webhook                  → calls handleTurn() directly
 *
 * History is supplied by the caller — React state on the web, a database row
 * on WhatsApp — because that is the only part that is genuinely per-channel.
 */

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"

import {
  flightSearchInputSchema,
  parsedFlightQuerySchema,
  type ParsedFlightQuery,
} from "@/lib/flight-parse"
import { getFlightOffers, pickBest, pickCheapest } from "@/lib/amadeus"
import type { FlightSearchQuery, FlightSearchResponse } from "@/types/flights"

// Free-text → structured JSON is a short, well-scoped extraction task, so a
// small fast model is the right fit. Haiku 4.5 supports structured outputs and
// keeps the chat snappy; override via env if a route needs more reasoning.
const MODEL = process.env.CONCIERGE_NLP_MODEL ?? "claude-haiku-4-5"

export type ChatTurn = { role: "user" | "assistant"; content: string }

/** Which surface the user is on — only affects reply formatting. */
export type Channel = "web" | "whatsapp"

/** Fallback used whenever Claude gives us nothing usable to say. */
export const FALLBACK_REPLY =
  "Desculpe, não percebi bem. Pode dizer-me a origem, o destino e a data da viagem?"

// --- NLP ---------------------------------------------------------------------

export type ParseOutcome =
  | { ok: true; query: ParsedFlightQuery }
  /** No API key configured — the channel should degrade, not crash. */
  | { ok: false; kind: "unconfigured" }
  /** Claude answered but refused or broke schema; `reply` is still sendable. */
  | { ok: false; kind: "unparsed"; reply: string }
  /** Transport/API failure. */
  | { ok: false; kind: "failed" }

function systemPrompt(channel: Channel): string {
  const today = new Date().toISOString().slice(0, 10)
  const lines = [
    "És o motor de compreensão do WeeFly Concierge, um assistente de reservas de voos.",
    `A data de hoje é ${today}.`,
    "A partir da conversa, extrai os dados estruturados de um pedido de voo.",
    "Usa códigos IATA de 3 letras para origem e destino (ex.: Lisboa → LIS, Paris → PAR, Praia → RAI).",
    "Resolve datas relativas (ex.: 'dia 15', 'próxima sexta', 'amanhã') contra a data de hoje e devolve YYYY-MM-DD.",
    "Se o utilizador só disser o dia, assume a próxima ocorrência futura desse dia.",
    "Preenche 'ready' apenas quando origem, destino e data de partida forem todos conhecidos.",
    "Escreve 'reply' no mesmo idioma do utilizador, de forma breve e calorosa.",
  ]
  if (channel === "whatsapp") {
    // WhatsApp bubbles are narrow and there is no rich layout to lean on.
    lines.push(
      "Estás no WhatsApp: mantém 'reply' com no máximo duas frases curtas, sem markdown nem listas."
    )
  }
  return lines.join(" ")
}

export async function parseMessage(input: {
  message: string
  history?: ChatTurn[]
  channel?: Channel
}): Promise<ParseOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, kind: "unconfigured" }

  const { message, history = [], channel = "web" } = input
  const client = new Anthropic({ apiKey })

  const messages: Anthropic.MessageParam[] = [
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: message },
  ]

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(channel),
      messages,
      output_config: { format: zodOutputFormat(parsedFlightQuerySchema) },
    })

    const data = response.parsed_output
    if (!data) {
      // Refusal or schema mismatch — degrade gracefully into a chat reply.
      return { ok: false, kind: "unparsed", reply: FALLBACK_REPLY }
    }
    return { ok: true, query: data }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("[concierge-engine] Anthropic error:", err.status, err.message)
    } else {
      console.error("[concierge-engine] Unexpected NLP error:", err)
    }
    return { ok: false, kind: "failed" }
  }
}

/**
 * A query is searchable only when the model says so *and* the three required
 * slots are actually present — `ready` alone has been known to run ahead of
 * the data. Both channels must agree on this, so it lives here.
 */
export function isSearchable(
  query: ParsedFlightQuery | null | undefined
): query is ParsedFlightQuery & {
  origin: string
  destination: string
  departDate: string
} {
  return (
    !!query &&
    query.ready === true &&
    !!query.origin &&
    !!query.destination &&
    !!query.departDate
  )
}

// --- Flight search -----------------------------------------------------------

export type SearchOutcome =
  | { ok: true; result: FlightSearchResponse }
  | { ok: false; kind: "invalid"; fieldErrors: Record<string, string[] | undefined> }
  | { ok: false; kind: "failed" }

export async function searchFlights(rawInput: unknown): Promise<SearchOutcome> {
  const parsed = flightSearchInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      kind: "invalid",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
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

    return {
      ok: true,
      result: {
        query,
        cheapest: pickCheapest(offers),
        best: pickBest(offers),
        offers,
        source,
      },
    }
  } catch (err) {
    console.error("[concierge-engine] flight search error:", err)
    return { ok: false, kind: "failed" }
  }
}

/** Map a parsed query onto the flight-search input shape. */
export function toSearchInput(query: ParsedFlightQuery) {
  return {
    origin: query.origin,
    destination: query.destination,
    departDate: query.departDate,
    returnDate: query.returnDate,
    adults: query.adults,
    children: query.children,
    infants: query.infants,
    cabinClass: query.cabinClass,
  }
}

// --- Full turn ---------------------------------------------------------------

export type TurnStatus =
  | "ok"
  | "asked_for_more"
  | "nlp_unavailable"
  | "nlp_failed"
  | "search_failed"
  | "no_offers"

export interface ConciergeTurn {
  /** Always safe to send to the user, whatever went wrong. */
  reply: string
  query: ParsedFlightQuery | null
  result: FlightSearchResponse | null
  status: TurnStatus
}

/**
 * One complete conversational turn. Never throws and never returns an empty
 * reply — a channel can always just send `reply` and be correct.
 */
export async function handleTurn(input: {
  message: string
  history?: ChatTurn[]
  channel?: Channel
}): Promise<ConciergeTurn> {
  const parsed = await parseMessage(input)

  if (!parsed.ok) {
    if (parsed.kind === "unparsed") {
      return {
        reply: parsed.reply,
        query: null,
        result: null,
        status: "nlp_failed",
      }
    }
    return {
      reply:
        parsed.kind === "unconfigured"
          ? "O serviço de conversação não está disponível de momento."
          : "Ocorreu um erro inesperado. Pode tentar novamente?",
      query: null,
      result: null,
      status: parsed.kind === "unconfigured" ? "nlp_unavailable" : "nlp_failed",
    }
  }

  const query = parsed.query
  const reply = query.reply?.trim() || FALLBACK_REPLY

  // Still slot-filling: reply carries the follow-up question.
  if (!isSearchable(query)) {
    return { reply, query, result: null, status: "asked_for_more" }
  }

  const search = await searchFlights(toSearchInput(query))

  if (!search.ok) {
    return {
      reply:
        "Não consegui pesquisar voos neste momento. Tente novamente daqui a pouco.",
      query,
      result: null,
      status: "search_failed",
    }
  }

  if (search.result.offers.length === 0) {
    return {
      reply: "Não encontrei voos para esta pesquisa. Quer tentar outras datas?",
      query,
      result: null,
      status: "no_offers",
    }
  }

  return { reply, query, result: search.result, status: "ok" }
}
