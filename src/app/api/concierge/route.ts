import { NextResponse } from "next/server"
import { Resend } from "resend"

import { travelRequestSchema } from "@/lib/validations"
import { buildTravelRequestConfirmationEmail } from "@/lib/emails/travel-request-confirmation"
import { buildTravelRequestNotificationEmail } from "@/lib/emails/travel-request-notification"
import { markEmailOutcome, saveTravelRequest } from "@/lib/concierge-intake"
import { bindTripRequestToCase } from "@/lib/booking-cases"
import { getI18n } from "@/i18n/server"
import { senderAddress, teamRecipients } from "@/lib/notifications"

// Resend uses the Node runtime; keep this off the edge so nodemailer-style
// SDKs and env secrets behave predictably.
export const runtime = "nodejs"

/*
 * C-03a · o remetente e os destinatários vêm de `lib/notifications`.
 *
 * Este ficheiro tinha a sua própria cópia das duas regras, e a do remetente era
 * `process.env.CONCIERGE_FROM_EMAIL` tal e qual — dois endereços separados por
 * vírgula em produção, um `validation_error` do fornecedor, e o lead a não
 * chegar a ninguém. A terceira cópia da mesma regra é a que ninguém se lembra
 * de corrigir, por isso deixou de existir.
 *
 * O pedido continua a não passar por `notify()`: aqui ainda não há caso a que
 * pendurar o registo — ele nasce a seguir, do lead que esta rota grava.
 */

/**
 * WeeFly Concierge — Central Intake (browser channel).
 *
 * Receives a travel request from the public form, validates it server-side
 * (never trust the client), notifies the concierge team, confirms receipt to
 * the client, and — once you wire it up — hands the data to your backend to
 * open a Lead + TripRequest.
 */
export async function POST(request: Request) {
  const { t, locale } = getI18n()
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: t("errors.invalidRequestBody") }, { status: 400 })
  }

  // Server-side validation mirrors the client schema (acceptance criterion 3.2).
  const parsed = travelRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("errors.invalidRequestData"),
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    )
  }

  const data = parsed.data

  // Persist FIRST. The database is the system of record: if Resend is down or
  // the address bounces, the lead must still be sitting in the back-office.
  // Delivery outcome is backfilled below once the sends have been attempted.
  const saved = await saveTravelRequest(data, {
    sourceChannel: "browser",
    /* Guardado agora para os emails que saem mais tarde — ver 0008. */
    locale,
  })

  // When the form was reached through an admin-generated link, attach the
  // request to that case and close Link 1. A bad or already-used token is not
  // an error for the client — their request is saved regardless.
  const token = typeof (payload as { token?: unknown })?.token === "string"
    ? ((payload as { token: string }).token)
    : null

  if (token && saved) {
    await bindTripRequestToCase(token, saved.tripRequestId, saved.leadId)
  }

  if (!process.env.RESEND_API_KEY) {
    // Don't hard-fail the request in local dev without a key — log and continue
    // so the flow is still testable. In production, set RESEND_API_KEY.
    console.warn(
      "[concierge] RESEND_API_KEY not set — skipping emails. Pedido de %s (%s): %s → %s",
      data.fullName,
      data.email,
      data.origin,
      data.destination
    )
    return NextResponse.json({
      ok: true,
      emailSent: false,
      teamNotified: false,
      reference: saved?.reference ?? null,
    })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const trip = {
    title: data.title,
    fullName: data.fullName,
    tripType: data.tripType,
    origin: data.origin,
    destination: data.destination,
    departDate: data.departDate,
    returnDate: data.returnDate || undefined,
    adults: data.adults,
    children: data.children,
    infants: data.infants,
    cabinClass: data.cabinClass,
  }

  const notification = buildTravelRequestNotificationEmail({
    ...trip,
    email: data.email,
    phonePrefix: data.phonePrefix,
    phone: data.phone,
    sourceChannel: "Formulário online (weefly.africa)",
  })
  /*
   * A confirmação sai na língua em que a pessoa acabou de preencher o
   * formulário — este pedido ainda traz o cookie do idioma, e é a única
   * altura em todo o fluxo em que o sabemos de certeza.
   */
  const confirmation = buildTravelRequestConfirmationEmail(trip, t, locale)

  // The two sends are independent: a bounced client confirmation must never
  // cost the team its lead, and vice-versa.
  const from = senderAddress()
  const team = teamRecipients()

  const [teamResult, clientResult] = await Promise.allSettled([
    resend.emails.send({
      from,
      to: team,
      subject: notification.subject,
      html: notification.html,
      text: notification.text,
      // Replying to the internal alert answers the customer directly.
      replyTo: data.email,
    }),
    resend.emails.send({
      from,
      to: data.email,
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
      /* As duas caixas da equipa, e não só a primeira: uma resposta do cliente
         tem de chegar a quem estiver a olhar. */
      replyTo: team,
    }),
  ])

  const teamNotified = succeeded(teamResult, "team notification")
  const emailSent = succeeded(clientResult, "client confirmation")

  if (!teamNotified) {
    // The lead is the business-critical half — make it loud and greppable.
    console.error(
      "[concierge] LEAD NOT DELIVERED — %s (%s, %s %s): %s → %s | %s | %s pax | %s",
      data.fullName,
      data.email,
      data.phonePrefix,
      data.phone,
      data.origin,
      data.destination,
      data.departDate,
      data.adults + data.children + data.infants,
      data.cabinClass
    )
  }

  if (saved) {
    await markEmailOutcome(saved.tripRequestId, { emailSent, teamNotified })
  }

  // The request itself was accepted either way; 202 signals a partial send so
  // the failure is visible in logs/monitoring without breaking the client UX.
  const status = teamNotified && emailSent ? 200 : 202
  return NextResponse.json(
    { ok: true, emailSent, teamNotified, reference: saved?.reference ?? null },
    { status }
  )
}

/** Unwrap a settled Resend send, logging whichever way it failed. */
function succeeded(
  result: PromiseSettledResult<{ error: unknown }>,
  label: string
): boolean {
  if (result.status === "rejected") {
    console.error(`[concierge] ${label} threw:`, result.reason)
    return false
  }
  if (result.value.error) {
    console.error(`[concierge] ${label} failed:`, result.value.error)
    return false
  }
  return true
}
