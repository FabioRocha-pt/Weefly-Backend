import { NextResponse } from "next/server"

import { handleClientTurn } from "@/lib/conversation-turn"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Um turno da conversa do cliente.
 *
 * Substitui a orquestração que vivia no `chat-widget`: era ele que chamava o
 * parse, olhava para `ready` e decidia o passo seguinte. Agora decide o
 * servidor, porque é ele que tem o histórico e é ele que abre o caso — e um
 * browser não é sítio para guardar nem uma coisa nem outra.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })
  }

  const { token, message } = (body ?? {}) as {
    token?: unknown
    message?: unknown
  }

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Mensagem vazia." }, { status: 422 })
  }

  const result = await handleClientTurn({
    token: typeof token === "string" && token ? token : null,
    message,
    channel: "web",
  })

  if (!result) {
    return NextResponse.json(
      { error: "Não foi possível processar a mensagem." },
      { status: 503 }
    )
  }

  return NextResponse.json(result)
}
