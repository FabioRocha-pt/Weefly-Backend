import { NextResponse } from "next/server"
import { z } from "zod"

import { parseMessage } from "@/lib/concierge-engine"
import { getI18n } from "@/i18n/server"

// The Anthropic SDK uses the Node runtime.
export const runtime = "nodejs"

/**
 * WeeFly Concierge — NLP endpoint (browser channel).
 *
 * A thin HTTP wrapper over `parseMessage()` in the concierge engine; the actual
 * understanding lives there so the WhatsApp webhook can reuse it without a
 * self-call. Keep this response shape stable — `chat-widget.tsx` reads the
 * parsed query straight off the JSON body.
 */

/**
 * Body: the latest user message plus any prior chat turns for slot-filling.
 *
 * A mensagem é a chave de tradução e não a frase, pela mesma razão dos
 * esquemas em `lib/validations.ts`: o esquema é construído quando o módulo
 * carrega, muito antes de sabermos em que idioma o pedido vem.
 */
const parseRequestSchema = z.object({
  message: z.string().min(1, "errors.emptyMessage"),
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

export async function POST(request: Request) {
  const { t } = getI18n()
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: t("errors.invalidBody") }, { status: 400 })
  }

  const parsed = parseRequestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("errors.invalidRequest"), fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const outcome = await parseMessage({ ...parsed.data, channel: "web" })

  if (outcome.ok) {
    return NextResponse.json(outcome.query)
  }

  switch (outcome.kind) {
    case "unconfigured":
      return NextResponse.json(
        { error: t("errors.chatNotConfigured") },
        { status: 503 }
      )
    case "unparsed":
      // Degrade into a chat reply rather than an error the widget must handle.
      return NextResponse.json(
        { error: t("errors.couldNotParse"), reply: outcome.reply },
        { status: 200 }
      )
    default:
      return NextResponse.json(
        { error: t("errors.messageProcessFailed") },
        { status: 502 }
      )
  }
}
