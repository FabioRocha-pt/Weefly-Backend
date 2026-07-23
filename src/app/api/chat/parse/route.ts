import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"

import { parsedFlightQuerySchema } from "@/lib/flight-parse"

// The Anthropic SDK uses the Node runtime.
export const runtime = "nodejs"

// Free-text → structured JSON is a short, well-scoped extraction task, so a
// small fast model is the right fit. Haiku 4.5 supports structured outputs and
// keeps the chat snappy; override via env if a route needs more reasoning.
const MODEL = process.env.CONCIERGE_NLP_MODEL ?? "claude-haiku-4-5"

/** Body: the latest user message plus any prior chat turns for slot-filling. */
const parseRequestSchema = z.object({
  message: z.string().min(1, "Mensagem vazia."),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(20)
    .optional(),
})

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return [
    "És o motor de compreensão do WeeFly Concierge, um assistente de reservas de voos.",
    `A data de hoje é ${today}.`,
    "A partir da conversa, extrai os dados estruturados de um pedido de voo.",
    "Usa códigos IATA de 3 letras para origem e destino (ex.: Lisboa → LIS, Paris → PAR, Praia → RAI).",
    "Resolve datas relativas (ex.: 'dia 15', 'próxima sexta', 'amanhã') contra a data de hoje e devolve YYYY-MM-DD.",
    "Se o utilizador só disser o dia, assume a próxima ocorrência futura desse dia.",
    "Preenche 'ready' apenas quando origem, destino e data de partida forem todos conhecidos.",
    "Escreve 'reply' no mesmo idioma do utilizador, de forma breve e calorosa.",
  ].join(" ")
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "O serviço de conversação não está configurado." },
      { status: 503 }
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })
  }

  const parsed = parseRequestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Pedido inválido.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { message, history = [] } = parsed.data
  const client = new Anthropic({ apiKey })

  const messages: Anthropic.MessageParam[] = [
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: message },
  ]

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(),
      messages,
      output_config: { format: zodOutputFormat(parsedFlightQuerySchema) },
    })

    const data = response.parsed_output
    if (!data) {
      // Refusal or schema mismatch — degrade gracefully into a chat reply.
      return NextResponse.json(
        {
          error: "Não consegui interpretar o pedido.",
          reply:
            "Desculpe, não percebi bem. Pode dizer-me a origem, o destino e a data da viagem?",
        },
        { status: 200 }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("[chat/parse] Anthropic error:", err.status, err.message)
    } else {
      console.error("[chat/parse] Unexpected error:", err)
    }
    return NextResponse.json(
      { error: "Não foi possível processar a mensagem." },
      { status: 502 }
    )
  }
}
