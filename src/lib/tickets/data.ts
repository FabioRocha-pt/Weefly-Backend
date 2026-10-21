/**
 * EM-02 · tudo o que o bilhete precisa, lido de uma vez.
 *
 * O documento tem duas páginas e nenhuma delas admite um campo em branco por o
 * gerador não ter ido buscar a informação: um bilhete meio impresso não é um
 * bilhete. Por isso a leitura é uma só e está aqui, separada do desenho — o
 * módulo que compõe o PDF recebe um objecto completo e não sabe o que é o
 * Supabase.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import {
  listPassengerBaggage,
  listPassengerSeats,
  listSegmentIssuance,
} from "@/lib/issuance"
import { caseClientLink } from "@/lib/case-partner"
import { CARRIERS } from "@/lib/pc/catalog"
import { airlineName } from "@/lib/airlines-catalog"
import { loadAirlines } from "@/lib/airlines-server"
import { clientBrandForCase } from "@/lib/brand"
import { loadBrandAsset } from "@/lib/brand-asset-load"
import { whatsappTeamNumber } from "@/lib/whatsapp"
import { normalizeBaggage, type OfferDirection } from "@/lib/proposal-math"
import { airportTimeZone, cityPt, flightMinutes, localToUtc } from "./places"

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

/**
 * Bilhete v2 · a bagagem de um passageiro num voo.
 *
 * Nulo em cada linha quer dizer "ninguém respondeu" — e o bilhete escreve "—"
 * em vez de inventar um zero. `personal` nulo é o artigo pessoal que todas as
 * tarifas levam e que nunca ninguém escreveu.
 */
export interface TicketBaggage {
  personal: boolean | null
  cabinPieces: number | null
  cabinKg: number | null
  checkedPieces: number | null
  checkedKg: number | null
}

export interface TicketSeat {
  tag: string
  passengerId: string
  seat: string | null
  ticketNumber: string | null
  baggage: TicketBaggage
}

export interface TicketSegment {
  id: string
  direction: OfferDirection
  position: number
  /** A posição dentro do sentido (1 de 2 numa ida com escala). */
  legIndex: number
  legCount: number
  carrierCode: string | null
  carrierLabel: string
  flightNumber: string | null
  bookingClass: string | null
  cabin: string
  aircraft: string | null
  origin: string | null
  destination: string | null
  originCity: string
  destinationCity: string
  departAt: string | null
  arriveAt: string | null
  /** Com o fuso de cada aeroporto. Nulo quando falta uma das horas. */
  durationMinutes: number | null
  /** Minutos de escala até ao voo seguinte do mesmo sentido, quando há. */
  layoverMinutes: number | null
  terminalFrom: string | null
  terminalTo: string | null
  fareBasis: string | null
  nvb: string | null
  nva: string | null
  /** EM-02 · a etiqueta do passageiro repete-se dentro de cada voo. */
  seats: TicketSeat[]
}

/** Bilhete v2 · de quem é a venda: o logótipo, o contacto e o rodapé. */
export interface TicketBrand {
  kind: "weefly" | "partner"
  name: string
  /** O nome do bloco de contacto ("WeeFly Concierge"). */
  contactName: string
  logo: { bytes: Uint8Array; type: "png" | "jpg" } | null
  email: string
  site: string | null
  /** Só quando está configurado. Sem ele, o item não aparece. */
  whatsapp: string | null
  footer: string
  poweredByWeefly: boolean
}

export interface TicketFare {
  name: string | null
  refund: string | null
  change: string | null
  nonRefundable: boolean
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
  fare: TicketFare
  brand: TicketBrand
  /** O endereço permanente do cliente, para o código 2D e para o rodapé. */
  link: string
}

function unwrap(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] ?? null) as Record<string, any> | null
  return (value ?? null) as Record<string, any> | null
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
  /* O nome das companhias acrescentadas no Admin. */
  await loadAirlines()
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
           id, fare_name, refund_policy, change_policy, non_refundable,
           baggage_cabin_count, baggage_hold_count,
           segments:case_offer_segments (
             id, direction, position, carrier_code, flight_number,
             booking_class, cabin, equipment, origin, destination,
             depart_at, arrive_at, terminal_from, terminal_to,
             baggage:case_offer_segment_baggage (
               personal_item, cabin_pieces, cabin_kg, checked_pieces, checked_kg
             )
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

  if (!chosen) return { ok: false, reason: "o caso não tem oferta escolhida" }

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

  const [seats, issuance, bags] = await Promise.all([
    listPassengerSeats(caseId),
    listSegmentIssuance(caseId),
    listPassengerBaggage(caseId),
  ])
  const seatOf = (passengerId: string, segmentId: string) =>
    seats.find((s) => s.passenger_id === passengerId && s.segment_id === segmentId)
      ?.seat ?? null
  const docOf = new Map(issuance.map((d) => [d.segment_id, d]))
  const bagOf = (passengerId: string, segmentId: string) =>
    bags.find((b) => b.passenger_id === passengerId && b.segment_id === segmentId) ?? null

  const segmentRows = ((chosen.segments ?? []) as Record<string, any>[]).sort(
    (a, b) =>
      (a.direction === b.direction ? 0 : a.direction === "ida" ? -1 : 1) ||
      Number(a.position) - Number(b.position)
  )

  const issuingCode = ((row.issuing_carrier as string | null) ?? "").toUpperCase() || null
  /*
   * Bilhete v2 · "trecho de volta sem companhia".
   *
   * Um trecho gravado sem companhia (o caso WF-2610-0078: a volta veio do
   * compositor sem a sigla) imprimia "—" e nenhum logótipo. A companhia de um
   * trecho sem sigla é a do trecho mais próximo que a tenha e, sem nenhum, a
   * emissora — nunca um espaço vazio.
   */
  const knownCarrier =
    segmentRows.find((s) => s.carrier_code)?.carrier_code ?? issuingCode
  const carrierOf = (s: Record<string, any>) =>
    ((s.carrier_code as string | null) ?? knownCarrier ?? "").toUpperCase() || null
  const carrierLabelOf = (code: string | null) =>
    code ? (CARRIERS[code]?.name ?? airlineName(code)) : ""

  const cabinCount = chosen.baggage_cabin_count as number | null
  const holdCount = chosen.baggage_hold_count as number | null

  /*
   * Bilhete v2 · a bagagem que o bilhete imprime, por ordem de autoridade:
   * o que ficou gravado na emissão para aquele passageiro naquele voo; senão
   * a promessa da proposta para o voo; senão a contagem da oferta. Era só a
   * terceira — e uma oferta com a bagagem por voo saía com "—".
   */
  const baggageOf = (passengerId: string, s: Record<string, any>): TicketBaggage => {
    const promise = normalizeBaggage(s.baggage)
    const issued = bagOf(passengerId, String(s.id))
    if (issued) {
      return {
        personal: promise?.personal_item ?? null,
        cabinPieces: issued.cabin_pieces,
        cabinKg: issued.cabin_kg === null ? null : Number(issued.cabin_kg),
        checkedPieces: issued.checked_pieces,
        checkedKg: issued.checked_kg === null ? null : Number(issued.checked_kg),
      }
    }
    if (promise) {
      return {
        personal: promise.personal_item,
        cabinPieces: promise.cabin_pieces,
        cabinKg: promise.cabin_kg,
        checkedPieces: promise.checked_pieces,
        checkedKg: promise.checked_kg,
      }
    }
    return {
      personal: null,
      cabinPieces: cabinCount,
      cabinKg: null,
      checkedPieces: holdCount,
      checkedKg: null,
    }
  }

  const segments: TicketSegment[] = segmentRows.map((s) => {
    const doc = docOf.get(String(s.id))
    const code = carrierOf(s)
    const sameLeg = segmentRows.filter((x) => x.direction === s.direction)
    const legIndex = sameLeg.indexOf(s)
    const next = sameLeg[legIndex + 1]
    const landed = localToUtc(s.arrive_at ?? null, airportTimeZone(s.destination))
    const departs = next
      ? localToUtc(next.depart_at ?? null, airportTimeZone(next.origin))
      : null
    return {
      id: String(s.id),
      direction: (s.direction as OfferDirection) ?? "ida",
      position: Number(s.position ?? 0),
      legIndex: legIndex + 1,
      legCount: sameLeg.length,
      carrierCode: code,
      carrierLabel: carrierLabelOf(code),
      flightNumber: (s.flight_number as string | null) ?? null,
      bookingClass: doc?.booking_class ?? (s.booking_class as string | null) ?? null,
      cabin: doc?.cabin ?? String(s.cabin ?? "economy"),
      aircraft: doc?.aircraft ?? (s.equipment as string | null) ?? null,
      origin: (s.origin as string | null) ?? null,
      destination: (s.destination as string | null) ?? null,
      originCity: cityPt(s.origin),
      destinationCity: cityPt(s.destination),
      departAt: (s.depart_at as string | null) ?? null,
      arriveAt: (s.arrive_at as string | null) ?? null,
      durationMinutes: flightMinutes(s.origin, s.depart_at, s.destination, s.arrive_at),
      layoverMinutes:
        landed !== null && departs !== null && departs >= landed
          ? Math.round((departs - landed) / 60000)
          : null,
      terminalFrom: doc?.terminal_from ?? (s.terminal_from as string | null) ?? null,
      terminalTo: doc?.terminal_to ?? (s.terminal_to as string | null) ?? null,
      fareBasis: doc?.fare_basis ?? null,
      nvb: doc?.nvb ?? null,
      nva: doc?.nva ?? null,
      /* EM-02 · "as etiquetas P1 P2 P3 repetidas dentro de cada voo, com número
         de bilhete, lugar e bagagem por passageiro". É esta linha que o faz. */
      seats: passengers.map((p) => ({
        tag: p.tag,
        passengerId: p.id,
        seat: seatOf(p.id, String(s.id)),
        ticketNumber: p.ticketNumber,
        baggage: baggageOf(p.id, s),
      })),
    }
  })

  /* Os casos emitidos antes da 0019 têm os campos do documento só no caso:
     entram no primeiro voo, que é onde sempre estiveram. */
  if (segments[0] && !segments.some((s) => s.fareBasis || s.nvb || s.nva)) {
    segments[0].fareBasis = (row.fare_basis as string | null) ?? null
    segments[0].nvb = (row.nvb as string | null) ?? null
    segments[0].nva = (row.nva as string | null) ?? null
  }

  const fullName = String(lead?.full_name ?? "")
  /* MIG-02 · o endereço do parceiro do caso, lido da configuração. */
  const link = await caseClientLink(caseId, String(row.token))

  return {
    ok: true,
    data: {
      caseId,
      token: String(row.token),
      reference,
      pnr,
      documentNumber: ticketDocumentNumber(pnr, reference),
      issuedAt: (row.issued_at as string | null) ?? new Date().toISOString(),
      issuingCarrier: issuingCode,
      issuingCarrierLabel: issuingCode
        ? carrierLabelOf(issuingCode)
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
      fare: {
        name: (chosen.fare_name as string | null) ?? null,
        refund: (chosen.refund_policy as string | null) ?? null,
        change: (chosen.change_policy as string | null) ?? null,
        nonRefundable: chosen.non_refundable === true,
      },
      brand: await ticketBrand(caseId, link),
      link,
    },
  }
}

/** Os primeiros bytes dizem o formato; o nome do ficheiro não é de confiança. */
function imageType(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) return "png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg"
  return null
}

/**
 * Bilhete v2 · a marca de quem vendeu o caso.
 *
 * A mesma regra dos emails (`clientBrandForCase`): um revendedor, a WeeFly
 * Global e a WeeFly Moçambique saem com a WeeFly; um parceiro com marca
 * própria (a Alô) sai com o cabeçalho dele e "Powered by WeeFly" no rodapé.
 * O logótipo da WeeFly é desenhado em vector pelo PDF (sem bytes aqui).
 */
async function ticketBrand(caseId: string, link: string): Promise<TicketBrand> {
  const brand = await clientBrandForCase(caseId)
  let site: string | null = null
  try {
    site = new URL(link).host
  } catch {
    site = null
  }

  if (brand.kind !== "partner") {
    return {
      kind: "weefly",
      name: "WeeFly Africa",
      contactName: "WeeFly Concierge",
      logo: null,
      email: "info@weefly.africa",
      site: "weefly.africa",
      whatsapp: brand.whatsapp || whatsappTeamNumber(),
      footer: "WeeFly Africa · Praia, Cabo Verde · weefly.africa",
      poweredByWeefly: false,
    }
  }

  let logo: TicketBrand["logo"] = null
  if (brand.logoUrl) {
    const bytes = await loadBrandAsset(brand.logoUrl)
    const type = bytes ? imageType(bytes) : null
    if (bytes && type) logo = { bytes: new Uint8Array(bytes), type }
  }

  const email = brand.replyTo || brand.senderEmail || "info@weefly.africa"
  return {
    kind: "partner",
    name: brand.name,
    contactName: brand.name,
    logo,
    email,
    site,
    whatsapp: brand.whatsapp || null,
    footer: [brand.footerText || brand.name, site].filter(Boolean).join(" · "),
    poweredByWeefly: brand.poweredByWeefly,
  }
}
