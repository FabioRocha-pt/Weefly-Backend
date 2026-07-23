import { NextResponse } from "next/server"
import { Resend } from "resend"

import { travelRequestSchema } from "@/lib/validations"
import { buildTravelRequestConfirmationEmail } from "@/lib/emails/travel-request-confirmation"

// Resend uses the Node runtime; keep this off the edge so nodemailer-style
// SDKs and env secrets behave predictably.
export const runtime = "nodejs"

const FROM_EMAIL =
  process.env.CONCIERGE_FROM_EMAIL ?? "WeeFly Concierge <onboarding@resend.dev>"

/**
 * WeeFly Concierge — Central Intake (browser channel).
 *
 * Receives a travel request from the public form, validates it server-side
 * (never trust the client), fires the client confirmation email, and — once
 * you wire it up — hands the data to your backend to open a Lead + TripRequest.
 */
export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo do pedido inválido." }, { status: 400 })
  }

  // Server-side validation mirrors the client schema (acceptance criterion 3.2).
  const parsed = travelRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados do pedido inválidos.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    )
  }

  const data = parsed.data

  // ---------------------------------------------------------------------------
  // TODO (ligar ao teu backend): persist the lead + trip request here.
  //
  // This is the channel-agnostic Intake point from the technical spec. Create
  // the Lead (name, email, phone, source_channel: "browser") and its first
  // TripRequest, then transition the lead to "Filled". Example:
  //
  //   const supabase = createClient() // "@/utils/supabase/server"
  //   const { data: lead } = await supabase.from("leads").insert({ ... })
  //   await supabase.from("trip_requests").insert({ lead_id: lead.id, ... })
  //
  // Keep the response shape below so the form's onSubmit keeps working.
  // ---------------------------------------------------------------------------

  // Fire the transactional confirmation email.
  if (!process.env.RESEND_API_KEY) {
    // Don't hard-fail the request in local dev without a key — log and continue
    // so the flow is still testable. In production, set RESEND_API_KEY.
    console.warn(
      "[concierge] RESEND_API_KEY not set — skipping confirmation email."
    )
    return NextResponse.json({ ok: true, emailSent: false })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const email = buildTravelRequestConfirmationEmail({
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
  })

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: process.env.CONCIERGE_TEAM_EMAIL,
    })

    if (error) {
      console.error("[concierge] Resend error:", error)
      // The request itself was accepted; surface a soft failure on the email.
      return NextResponse.json({ ok: true, emailSent: false }, { status: 202 })
    }

    // Optional: notify the concierge team a new lead arrived.
    if (process.env.CONCIERGE_TEAM_EMAIL) {
      await resend.emails
        .send({
          from: FROM_EMAIL,
          to: process.env.CONCIERGE_TEAM_EMAIL,
          subject: `Novo pedido de viagem · ${data.origin} → ${data.destination}`,
          text: `${data.fullName} (${data.email}, ${data.phonePrefix} ${data.phone}) submeteu um pedido: ${data.origin} → ${data.destination}.`,
        })
        .catch((err) => console.error("[concierge] team notify failed:", err))
    }
  } catch (err) {
    console.error("[concierge] Unexpected email failure:", err)
    return NextResponse.json({ ok: true, emailSent: false }, { status: 202 })
  }

  return NextResponse.json({ ok: true, emailSent: true })
}
