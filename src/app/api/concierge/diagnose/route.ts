import { NextResponse } from "next/server"
import { Resend } from "resend"

import { buildTravelRequestConfirmationEmail } from "@/lib/emails/travel-request-confirmation"
import {
  buildTravelRequestNotificationEmail,
  type TravelRequestNotificationData,
} from "@/lib/emails/travel-request-notification"
import { senderAddress, teamRecipients } from "@/lib/notifications"
import { whatsappConfigured, whatsappTeamNumber } from "@/lib/whatsapp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * WeeFly Concierge — email delivery diagnostic (dev-only).
 *
 * Answers "why didn't the mail go through?" without submitting the real form:
 *
 *   GET /api/concierge/diagnose               → config report (sends nothing)
 *   GET /api/concierge/diagnose?preview=team  → render the internal lead email
 *   GET /api/concierge/diagnose?preview=client→ render the client confirmation
 *   GET /api/concierge/diagnose?send=me@x.cv  → really send both to that address
 *
 * Blocked in production unless CONCIERGE_DIAGNOSE_TOKEN is set and passed as
 * ?token= — it exposes config state and can send mail, so it must not be open.
 */

const SAMPLE: TravelRequestNotificationData = {
  title: "mr",
  fullName: "Ivandro Tavares Silva",
  email: "cliente.exemplo@email.com",
  phonePrefix: "+238",
  phone: "991 22 33",
  tripType: "round_trip",
  origin: "Praia (RAI)",
  destination: "Lisboa (LIS)",
  departDate: "2026-09-12",
  returnDate: "2026-09-26",
  adults: 2,
  children: 1,
  infants: 0,
  cabinClass: "economy",
  sourceChannel: "Diagnóstico (teste)",
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = process.env.CONCIERGE_DIAGNOSE_TOKEN

  const given = searchParams.get("token")
  const authorized =
    process.env.NODE_ENV !== "production" ||
    (Boolean(token) && given === token)

  if (!authorized) {
    /*
     * O 404 não distingue "sem token configurado" de "token errado", e é
     * deliberado: a rota envia email a sério com `?send=`, e uma resposta que
     * diferencie os dois casos diz a quem tenta que ela existe.
     *
     * Mas quem opera o servidor precisa de saber qual dos dois é — houve uma
     * tarde perdida a olhar para o mesmo 404 sem saber se a variável não tinha
     * chegado ao processo ou se o valor não batia. A distinção vai para o log,
     * que só quem tem acesso à máquina lê, e nunca para a resposta.
     */
    if (!token) {
      console.warn(
        "[diagnose] CONCIERGE_DIAGNOSE_TOKEN não está definida neste processo — a rota responde 404 em produção. Se a acabou de acrescentar no painel, reinicie a aplicação: as variáveis são lidas no arranque."
      )
    } else if (given === null) {
      console.warn("[diagnose] pedido sem ?token= — 404.")
    } else {
      console.warn(
        "[diagnose] o ?token= não corresponde. Recebido %d caracteres, esperado %d — se os números batem, procure um espaço no início ou no fim do valor no painel.",
        given.length,
        token.length
      )
    }

    return new NextResponse("Not found", { status: 404 })
  }

  // --- Template preview: needs no API key at all -----------------------------
  const preview = searchParams.get("preview")
  if (preview === "team" || preview === "client") {
    const email =
      preview === "team"
        ? buildTravelRequestNotificationEmail(SAMPLE)
        : buildTravelRequestConfirmationEmail(SAMPLE)
    return new NextResponse(email.html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  const apiKey = process.env.RESEND_API_KEY
  /*
   * C-03a · o mesmo remetente que os envios a sério usam.
   *
   * Este ficheiro tinha a sua própria cópia da regra, e foi por isso que o
   * diagnóstico dizia que estava tudo bem enquanto o campo `from` que saía
   * levava dois endereços. Um diagnóstico que não lê o que o código lê não
   * diagnostica nada.
   */
  const configured = (process.env.CONCIERGE_FROM_EMAIL ?? "").trim()
  const from = senderAddress()
  const usingSandbox = from.includes("onboarding@resend.dev")
  const recipients = teamRecipients()

  const config = {
    resendApiKey: apiKey
      ? `set (${apiKey.slice(0, 6)}…, ${apiKey.length} chars)`
      : "MISSING — nothing can send",
    from,
    fromConfigured: configured || "(unset)",
    usingSandboxSender: usingSandbox,
    teamRecipients: recipients,
    teamRecipientsSource: process.env.CONCIERGE_TEAM_EMAIL
      ? "CONCIERGE_TEAM_EMAIL"
      : "default (hardcoded)",
    resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET
      ? "set — delivery state can reach `delivered`"
      : "MISSING — delivery state stops at `sent`",
    whatsapp: whatsappConfigured()
      ? "configured"
      : "MISSING WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN",
    whatsappTeamNumber: whatsappTeamNumber() ?? "(unset)",
  }

  const blockers: string[] = []
  if (!apiKey) {
    blockers.push(
      "RESEND_API_KEY is not set in .env.local — the form accepts requests but sends nothing. Create one at https://resend.com/api-keys and restart `npm run dev`."
    )
  }
  if (configured && from !== configured.replace(/^"|"$/g, "").trim()) {
    blockers.push(
      `C-03a: CONCIERGE_FROM_EMAIL holds more than one sender (${configured}). A message has exactly one — the provider rejects the rest with validation_error and EVERY notification comes back bounced. Sending as "${from}". Set a single address, and put the other mailbox in CONCIERGE_TEAM_EMAIL so it still receives replies.`
    )
  }
  if (usingSandbox) {
    blockers.push(
      "Sender is the Resend sandbox (onboarding@resend.dev). It ONLY delivers to the email address that owns the Resend account — client confirmations to real customers will be rejected. Verify weefly.africa at https://resend.com/domains, then set CONCIERGE_FROM_EMAIL to an address on that domain."
    )
  }
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    blockers.push(
      "RESEND_WEBHOOK_SECRET is not set — sends are recorded as `sent` and never reach `delivered` or `bounced`. C-03a asks for the real delivery state on the case. See docs/sprint2-notificacoes.md."
    )
  }
  if (!whatsappConfigured()) {
    blockers.push(
      "C-03b: WhatsApp has no credentials (WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN). WhatsApp sends are logged `skipped` with the reason written and the email still goes out — the two channels are independent by design."
    )
  }

  // --- Live send test --------------------------------------------------------
  const sendTo = searchParams.get("send")
  if (!sendTo) {
    return NextResponse.json({
      config,
      blockers,
      status: blockers.length === 0 ? "ready to send" : "NOT sending",
      hint: "Add ?send=you@example.com to attempt a real delivery, or ?preview=team / ?preview=client to view the templates.",
    })
  }

  if (!apiKey) {
    return NextResponse.json(
      { config, blockers, error: "Cannot send: RESEND_API_KEY is missing." },
      { status: 400 }
    )
  }

  const resend = new Resend(apiKey)
  const notification = buildTravelRequestNotificationEmail(SAMPLE)
  const confirmation = buildTravelRequestConfirmationEmail(SAMPLE)

  const [teamResult, clientResult] = await Promise.allSettled([
    resend.emails.send({
      from,
      to: sendTo,
      subject: `[TESTE] ${notification.subject}`,
      html: notification.html,
      text: notification.text,
    }),
    resend.emails.send({
      from,
      to: sendTo,
      subject: `[TESTE] ${confirmation.subject}`,
      html: confirmation.html,
      text: confirmation.text,
    }),
  ])

  return NextResponse.json({
    config,
    blockers,
    sentTo: sendTo,
    results: {
      teamNotification: describe(teamResult),
      clientConfirmation: describe(clientResult),
    },
  })
}

/** Surface the raw Resend error verbatim — that message is the whole point. */
function describe(result: PromiseSettledResult<{ data: unknown; error: unknown }>) {
  if (result.status === "rejected") {
    return { ok: false, threw: String(result.reason) }
  }
  if (result.value.error) {
    return { ok: false, error: result.value.error }
  }
  return { ok: true, id: result.value.data }
}
