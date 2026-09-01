import { createHmac, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"

import { recordDeliveryEvent, type NotifyStatus } from "@/lib/notifications"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * NT-06 · o que o servidor do destinatário disse.
 *
 * Sem isto o registo de entrega para em `sent`, que só quer dizer "o Resend
 * aceitou". A pergunta que a equipa faz é outra — "chegou?" — e a resposta vem
 * por aqui, minutos depois, sem nenhum pedido nosso.
 *
 * Configuração: no painel do Resend, um webhook para
 * `{NEXT_PUBLIC_SITE_URL}/api/webhooks/resend` com os eventos `email.sent`,
 * `email.delivered`, `email.bounced` e `email.complained`. O segredo que ele dá
 * fica em `RESEND_WEBHOOK_SECRET`.
 */

/** Os eventos que mudam o estado. Os de abertura e clique não são entrega. */
const STATUS: Record<string, NotifyStatus> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  /* Uma queixa de spam não é uma devolução, mas tem a mesma consequência
     prática: aquele endereço deixou de ser um canal de que se possa depender. */
  "email.complained": "bounced",
}

/**
 * A assinatura Svix, que é o que o Resend usa.
 *
 * `svix-signature` traz uma ou mais assinaturas separadas por espaço, cada uma
 * no formato `v1,<base64>`. O que é assinado é `id.timestamp.corpo` com o
 * segredo em base64 depois do prefixo `whsec_`.
 *
 * A comparação é feita em tempo constante: comparar assinaturas com `===`
 * devolve, no tempo que demora, quantos bytes iniciais estavam certos.
 */
function verify(
  secret: string,
  headers: Headers,
  payload: string
): boolean {
  const id = headers.get("svix-id")
  const timestamp = headers.get("svix-timestamp")
  const signature = headers.get("svix-signature")
  if (!id || !timestamp || !signature) return false

  /* Cinco minutos de tolerância: passado isso, uma repetição gravada deixa de
     ser aceite mesmo que a assinatura esteja certa. */
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest()

  return signature
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .some((part) => {
      const given = Buffer.from(part.slice(3), "base64")
      return (
        given.length === expected.length && timingSafeEqual(given, expected)
      )
    })
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET

  /*
   * Sem segredo configurado o webhook recusa tudo, e é o lado certo em que
   * errar: aceitar eventos não assinados deixava qualquer pessoa marcar como
   * entregue um email que nunca saiu.
   */
  if (!secret) {
    console.warn("[webhooks/resend] RESEND_WEBHOOK_SECRET não definida.")
    return NextResponse.json({ error: "not configured" }, { status: 503 })
  }

  const payload = await request.text()

  if (!verify(secret, request.headers, payload)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 })
  }

  let event: { type?: string; data?: { email_id?: string; reason?: string } }
  try {
    event = JSON.parse(payload)
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 })
  }

  const status = STATUS[event.type ?? ""]
  const messageId = event.data?.email_id

  /* Um evento que não muda a entrega — aberturas, cliques — responde 200 e
     acaba aqui. Devolver erro faria o Resend repetir para sempre uma coisa que
     não temos como aceitar. */
  if (!status || !messageId) return NextResponse.json({ ok: true })

  const matched = await recordDeliveryEvent({
    providerMessageId: messageId,
    status,
    error: event.data?.reason ?? null,
  })

  return NextResponse.json({ ok: true, matched })
}
