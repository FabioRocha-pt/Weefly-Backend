/**
 * EM-02 · tudo o que o bilhete precisa, lido de uma vez.
 *
 * O documento tem três páginas e nenhuma delas admite um campo em branco por o
 * gerador não ter ido buscar a informação: um bilhete meio impresso não é um
 * bilhete. Por isso a leitura é uma só e está aqui, separada do desenho — o
 * módulo que compõe o PDF recebe um objecto completo e não sabe o que é o
 * Supabase.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { listPassengerSeats } from "@/lib/issuance"
import { CARRIERS, carrierName } from "@/lib/pc/catalog"
import type { OfferDirection } from "@/lib/proposal-math"

export interface TicketPassenger {
  id: string
  /** P1, P2, P3 — a etiqueta que atravessa o sistema todo. */
  tag: string
  position: number
  type: string
  title: string | null
  lastName: string
  firstName: string
  /** O nome como a companhia o imprime: APELIDO/NOME, sem acentos. */
  documentName: string
  birthDate: string | null
  nationality: string | null
  passportNumber: string | null
  passportExpiry: string | null
  issuingCountry: string | null
  ticketNumber: string | null
}

export interface TicketSegment {
  id: string
  direction: OfferDirection
  position: number
  carrierCode: string | null
  carrierLabel: string
  flightNumber: string | null
  bookingClass: string | null
  cabin: string
  origin: string | null
  destination: string | null
  originCity: string
  destinationCity: string
  departAt: string | null
  arriveAt: string | null
  terminalFrom: string | null
  terminalTo: string | null
  /** EM-02 · a etiqueta do passageiro repete-se dentro de cada voo. */
  seats: { tag: string; seat: string | null; ticketNumber: string | null }[]
}

export interface TicketData {
  caseId: string
  token: string
  reference: string
  pnr: string
  /** WF-TKT-{PNR}-{REFERÊNCIA} — o nome do ficheiro e o número do documento. */
  documentNumber: string
  issuedAt: string
  issuingCarrier: string | null
  issuingCarrierLabel: string
  consolidator: string | null
  fareBasis: string | null
  nvb: string | null
  nva: string | null
  endorsements: string | null
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  locale: string
  passengers: TicketPassenger[]
  segments: TicketSegment[]
  baggageCabin: string
  baggageHold: string
  /** O endereço permanente do cliente, para o código 2D e para o rodapé. */
  link: string
}

function unwrap(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] ?? null) as Record<string, any> | null
  return (value ?? null) as Record<string, any> | null
}

/**
 * A bagagem escrita em português.
 *
 * `baggageLabel`, em `lib/pc/catalog`, devolve inglês — é a etiqueta do ecrã do
 * cliente, que é inteiro em inglês. O bilhete é português (é o documento que a
 * WeeFly emite), e misturar "1 checked bag" no meio de "Bagagem incluída na sua
 * tarifa" seria o pior dos dois.
 */
function bagPt(count: number, kind: "cabin" | "hold"): string {
  const noun = kind === "cabin" ? "mala de mão" : "mala de porão"
  if (count <= 0) return `Sem ${noun}`
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`
}

/** "SILVA/MARIA JOAO" — sem acentos, que é o que a companhia aceita no bilhete. */
function documentName(last: string, first: string): string {
  return `${last}/${first}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
}

/**
 * O número do documento, e por isso o nome do ficheiro.
 *
 * `WF-TKT-{PNR}-{REFERÊNCIA}.pdf`, à letra do critério. Determinístico de
 * propósito: o mesmo caso emitido dá sempre o mesmo número, e é isso que faz um
 * reenvio ser o mesmo documento e não outro parecido.
 */
export function ticketDocumentNumber(pnr: string, reference: string): string {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  return `WF-TKT-${clean(pnr)}-${clean(reference)}`
}

export type TicketLoad =
  | { ok: true; data: TicketData }
  | { ok: false; reason: string }

export async function loadTicketData(caseId: string): Promise<TicketLoad> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: "serviço indisponível" }

  const { data: raw, error } = await admin
    .from("booking_cases")
    .select(
      `id, token, pnr, issued_at, issuing_carrier, consolidator,
       fare_basis, nvb, nva, endorsements,
       trip_request:trip_requests (
         reference, origin, destination,
         lead:leads (full_name, email, phone_prefix, phone, locale)
       ),
       passengers:case_passengers (
         id, position, passenger_type, title, first_name, last_name,
         birth_date, nationality, passport_number, passport_expiry,
         issuing_country, ticket_number
       ),
       proposal:case_proposals (
         selected_offer_id,
         offers:case_offers!proposal_id (
           id, baggage_cabin_count, baggage_hold_count,
           baggage_cabin, baggage_hold,
           segments:case_offer_segments (
             id, direction, position, carrier_code, flight_number,
             booking_class, cabin, origin, destination,
             depart_at, arrive_at, terminal_from, terminal_to
           )
         )
       )`
    )
    .eq("id", caseId)
    .maybeSingle()

  if (error || !raw) {
    return { ok: false, reason: error?.message ?? "caso não encontrado" }
  }

  const row = raw as Record<string, any>
  const trip = unwrap(row.trip_request)
  const lead = unwrap(trip?.lead)
  const proposal = unwrap(row.proposal)

  const pnr = (row.pnr as string | null) ?? ""
  const reference = (trip?.reference as string | null) ?? ""

  /* Sem PNR não há bilhete nenhum para imprimir, e um PDF com o campo do
     localizador em branco seria pior do que a ausência dele. */
  if (!pnr) return { ok: false, reason: "o caso ainda não tem PNR" }

  const offers = (proposal?.offers ?? []) as Record<string, any>[]
  const chosen =
    offers.find((o) => o.id === proposal?.selected_offer_id) ?? offers[0] ?? null

  if (!chosen) return { ok: false, reason: "o caso não tem opção escolhida" }

  const passengerRows = ((row.passengers ?? []) as Record<string, any>[]).sort(
    (a, b) => Number(a.position) - Number(b.position)
  )

  if (passengerRows.length === 0) {
    return { ok: false, reason: "o caso não tem passageiros" }
  }

  const passengers: TicketPassenger[] = passengerRows.map((p, index) => ({
    id: String(p.id),
    tag: `P${index + 1}`,
    position: Number(p.position ?? index + 1),
    type: String(p.passenger_type ?? "adult"),
    title: (p.title as string | null) ?? null,
    lastName: String(p.last_name ?? ""),
    firstName: String(p.first_name ?? ""),
    documentName: documentName(String(p.last_name ?? ""), String(p.first_name ?? "")),
    birthDate: (p.birth_date as string | null) ?? null,
    nationality: (p.nationality as string | null) ?? null,
    passportNumber: (p.passport_number as string | null) ?? null,
    passportExpiry: (p.passport_expiry as string | null) ?? null,
    issuingCountry: (p.issuing_country as string | null) ?? null,
    ticketNumber: (p.ticket_number as string | null) ?? null,
  }))

  const seats = await listPassengerSeats(caseId)
  const seatOf = (passengerId: string, segmentId: string) =>
    seats.find((s) => s.passenger_id === passengerId && s.segment_id === segmentId)
      ?.seat ?? null

  const segmentRows = ((chosen.segments ?? []) as Record<string, any>[]).sort(
    (a, b) =>
      (a.direction === b.direction ? 0 : a.direction === "ida" ? -1 : 1) ||
      Number(a.position) - Number(b.position)
  )

  const { cityNames } = await import("@/lib/airports")
  const cities = cityNames(
    segmentRows.flatMap((s) => [s.origin as string, s.destination as string])
  )

  const segments: TicketSegment[] = segmentRows.map((s) => ({
    id: String(s.id),
    direction: (s.direction as OfferDirection) ?? "ida",
    position: Number(s.position ?? 0),
    carrierCode: (s.carrier_code as string | null) ?? null,
    carrierLabel: carrierName(s.carrier_code as string | null),
    flightNumber: (s.flight_number as string | null) ?? null,
    bookingClass: (s.booking_class as string | null) ?? null,
    cabin: String(s.cabin ?? "economy"),
    origin: (s.origin as string | null) ?? null,
    destination: (s.destination as string | null) ?? null,
    originCity: cities[String(s.origin ?? "").toUpperCase()] ?? "",
    destinationCity: cities[String(s.destination ?? "").toUpperCase()] ?? "",
    departAt: (s.depart_at as string | null) ?? null,
    arriveAt: (s.arrive_at as string | null) ?? null,
    terminalFrom: (s.terminal_from as string | null) ?? null,
    terminalTo: (s.terminal_to as string | null) ?? null,
    /* EM-02 · "as etiquetas P1 P2 P3 repetidas dentro de cada voo, com número
       de bilhete, lugar e bagagem por passageiro". É esta linha que o faz. */
    seats: passengers.map((p) => ({
      tag: p.tag,
      seat: seatOf(p.id, String(s.id)),
      ticketNumber: p.ticketNumber,
    })),
  }))

  const cabinCount = chosen.baggage_cabin_count as number | null
  const holdCount = chosen.baggage_hold_count as number | null

  const carrierCode = (row.issuing_carrier as string | null) ?? null
  const fullName = String(lead?.full_name ?? "")
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")

  return {
    ok: true,
    data: {
      caseId,
      token: String(row.token),
      reference,
      pnr,
      documentNumber: ticketDocumentNumber(pnr, reference),
      issuedAt: (row.issued_at as string | null) ?? new Date().toISOString(),
      issuingCarrier: carrierCode,
      issuingCarrierLabel: carrierCode
        ? (CARRIERS[carrierCode.toUpperCase()]?.name ?? carrierCode)
        : (segments[0]?.carrierLabel ?? ""),
      consolidator: (row.consolidator as string | null) ?? null,
      fareBasis: (row.fare_basis as string | null) ?? null,
      nvb: (row.nvb as string | null) ?? null,
      nva: (row.nva as string | null) ?? null,
      endorsements: (row.endorsements as string | null) ?? null,
      clientName: fullName,
      clientEmail: (lead?.email as string | null) ?? null,
      clientPhone: lead
        ? `${lead.phone_prefix ?? ""} ${lead.phone ?? ""}`.trim() || null
        : null,
      locale: String(lead?.locale ?? "pt"),
      passengers,
      segments,
      /* A bagagem da tarifa escolhida. O texto antigo só é lido quando a
         contagem não existe — ver a migração 0012. */
      baggageCabin:
        cabinCount !== null
          ? bagPt(cabinCount, "cabin")
          : ((chosen.baggage_cabin as string | null) ?? "—"),
      baggageHold:
        holdCount !== null
          ? bagPt(holdCount, "hold")
          : ((chosen.baggage_hold as string | null) ?? "—"),
      link: base ? `${base}/pc/${row.token}` : "",
    },
  }
}
