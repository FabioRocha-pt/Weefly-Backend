import { NextResponse } from "next/server"
import { Resend } from "resend"

import { buildTravelRequestConfirmationEmail } from "@/lib/emails/travel-request-confirmation"
import {
  buildTravelRequestNotificationEmail,
  type TravelRequestNotificationData,
} from "@/lib/emails/travel-request-notification"

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

const DEFAULT_TEAM_EMAILS = ["info@weefly.africa", "info@weefly.cv"]

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

function teamRecipients(): string[] {
  const configured = (process.env.CONCIERGE_TEAM_EMAIL ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
  return configured.length > 0 ? configured : DEFAULT_TEAM_EMAILS
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = process.env.CONCIERGE_DIAGNOSE_TOKEN

  const authorized =
    process.env.NODE_ENV !== "production" ||
    (Boolean(token) && searchParams.get("token") === token)

  if (!authorized) {
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
  const from =
    process.env.CONCIERGE_FROM_EMAIL ??
    "WeeFly Concierge <onboarding@resend.dev>"
  const usingSandbox = from.includes("onboarding@resend.dev")
  const recipients = teamRecipients()

  const config = {
    resendApiKey: apiKey
      ? `set (${apiKey.slice(0, 6)}…, ${apiKey.length} chars)`
      : "MISSING — nothing can send",
    from,
    usingSandboxSender: usingSandbox,
    teamRecipients: recipients,
    teamRecipientsSource: process.env.CONCIERGE_TEAM_EMAIL
      ? "CONCIERGE_TEAM_EMAIL"
      : "default (hardcoded)",
  }

  const blockers: string[] = []
  if (!apiKey) {
    blockers.push(
      "RESEND_API_KEY is not set in .env.local — the form accepts requests but sends nothing. Create one at https://resend.com/api-keys and restart `npm run dev`."
    )
  }
  if (usingSandbox) {
    blockers.push(
      "Sender is the Resend sandbox (onboarding@resend.dev). It ONLY delivers to the email address that owns the Resend account — client confirmations to real customers will be rejected. Verify weefly.africa at https://resend.com/domains, then set CONCIERGE_FROM_EMAIL to an address on that domain."
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
