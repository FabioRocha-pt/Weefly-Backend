import { NextResponse } from "next/server"

import { passengerDetailsSchema } from "@/lib/validations"
import { getCaseByToken } from "@/lib/booking-cases"
import { createAdminClient } from "@/utils/supabase/admin"
import { getI18n } from "@/i18n/server"

export const runtime = "nodejs"

/**
 * Link 2 submission — passenger + passport details.
 *
 * The token in the path is the only credential, so it is re-validated here
 * server-side: a client could otherwise POST to a stage the admin never
 * unlocked. Writes go through the service role because there is no session.
 */
export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const { t } = getI18n()
  const lookup = await getCaseByToken(params.token, 2)
  if (!lookup.ok) {
    const status = lookup.reason === "locked" ? 403 : 404
    return NextResponse.json(
      { error: t("errors.linkUnavailable") },
      { status }
    )
  }

  const { case: bookingCase, link } = lookup.view
  if (link.status === "submetido") {
    return NextResponse.json(
      { error: t("errors.detailsAlreadySent") },
      { status: 409 }
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: t("errors.invalidBody") }, { status: 400 })
  }

  const parsed = passengerDetailsSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("errors.invalidData"),
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    )
  }

  // The client must submit exactly the number of passengers declared in Link 1
  // — otherwise the ticketing step would silently be short a passport.
  const trip = bookingCase.trip_request
  const expected = trip ? trip.adults + trip.children + trip.infants : null
  if (expected !== null && parsed.data.passengers.length !== expected) {
    return NextResponse.json(
      { error: t("errors.passengersExpected", { count: expected }) },
      { status: 422 }
    )
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json(
      { error: t("errors.serviceUnavailable") },
      { status: 503 }
    )
  }

  const rows = parsed.data.passengers.map((p, index) => ({
    case_id: bookingCase.id,
    position: index,
    passenger_type: p.passengerType,
    first_name: p.firstName,
    last_name: p.lastName,
    gender: p.gender,
    birth_date: p.birthDate,
    nationality: p.nationality,
    passport_number: p.passportNumber.toUpperCase(),
    passport_expiry: p.passportExpiry,
  }))

  const { error } = await admin
    .from("case_passengers")
    .upsert(rows, { onConflict: "case_id,position" })

  if (error) {
    console.error("[cases] passenger upsert failed:", error)
    return NextResponse.json(
      { error: t("errors.detailsSaveFailed") },
      { status: 500 }
    )
  }

  await admin
    .from("case_links")
    .update({ status: "submetido", submitted_at: new Date().toISOString() })
    .eq("id", link.id)

  await admin
    .from("booking_cases")
    .update({ stage: "detalhes_recebidos" })
    .eq("id", bookingCase.id)

  /*
   * É aqui que o pagamento nasce, e não antes: o botão que o cliente acabou de
   * carregar diz "confirmar dados e receber instruções de pagamento", e o valor
   * só está fechado depois de ele ter escolhido a opção.
   *
   * Best-effort de propósito. Sem WeePay configurada isto devolve
   * `not_configured` e não faz nada — o link 3 mostra o valor e o percurso
   * manual segue. Um gateway em baixo também não pode custar-nos os passaportes
   * que o cliente acabou de escrever.
   */
  const { startWeePayPayment } = await import("@/lib/payments")
  try {
    const outcome = await startWeePayPayment(bookingCase.id)
    if (!outcome.ok && outcome.reason === "failed") {
      console.error(
        "[cases] WeePay não abriu o pagamento do caso %s: %s",
        bookingCase.id,
        outcome.message
      )
    }
  } catch (err) {
    console.error("[cases] startWeePayPayment rebentou:", err)
  }

  return NextResponse.json({ ok: true })
}
