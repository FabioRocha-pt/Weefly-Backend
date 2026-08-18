/**
 * WeeFly Price Checker — o estado de um caso, tal como o cliente o vê.
 *
 * O mockup guardava tudo em localStorage e derivava o ecrã de um campo
 * `status`. Aqui não há campo nenhum: o ecrã é derivado do que existe na base de
 * dados — há proposta publicada? há opção escolhida? há comprovativo? já
 * expirou? — porque é o back-office que faz avançar o caso, e um `status`
 * guardado do lado do cliente seria uma segunda verdade a divergir da primeira.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { getCaseByToken, markLinkOpened } from "@/lib/booking-cases"
import { getPublishedProposal } from "@/lib/proposals"
import { offerTotal, type Offer, type PaxCounts } from "@/lib/proposal-math"
import {
  CABIN_FROM_DB,
  TRIP_FROM_DB,
  type CabinKind,
  type TripKind,
} from "@/lib/pc/catalog"
import {
  enforceExpiry,
  getPcPayment,
  listProofs,
  type PaymentProof,
  type PcPayment,
} from "@/lib/pc/payment"
import type { CasePassenger, LinkStatus } from "@/lib/case-status"

/**
 * Onde o cliente está. Os mesmos nomes do mockup, porque são os nomes que o
 * desenho usa e trocá-los só criaria um dicionário a mais para manter.
 */
export type PcScreen =
  | "p3"   // pedido recebido
  | "p4a"  // à espera da cotação
  | "p4b"  // opções prontas
  | "p5"   // as opções
  | "p7"   // passageiros
  | "p7pay" // pagamento e comprovativo
  | "p7b"  // em verificação
  | "p8"   // expirado
  | "p9"   // emitido

export interface PcLegView {
  position: number
  origin: string
  destination: string
  date: string
}

export interface PcRequestView {
  reference: string
  trip: TripKind
  cabin: CabinKind
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  adults: number
  children: number
  infantsInSeat: number
  infantsOnLap: number
  currency: string
  agentSlug: string | null
  legs: PcLegView[]
  createdAt: string
}

export interface PcContactView {
  fullName: string
  firstName: string
  email: string
  dialCode: string
  phone: string
  locale: string
}

export interface PcIssuedView {
  pnr: string | null
  issuedAt: string | null
}

export interface PcState {
  token: string
  caseId: string
  stage: string
  screen: PcScreen
  request: PcRequestView
  contact: PcContactView
  /** Etapa 3 — o estado do link de pagamento. */
  paymentLinkStatus: LinkStatus | null
  offers: Offer[]
  /** Total de cada oferta, já multiplicado pelos passageiros deste pedido. */
  totals: Record<string, number>
  pax: PaxCounts
  selectedOfferId: string | null
  selectedAt: string | null
  proposalPublishedAt: string | null
  passengers: CasePassenger[]
  payment: PcPayment | null
  proofs: PaymentProof[]
  expiry: { expired: boolean; cause: "client_never_paid" | "review_overdue" | null }
  issued: PcIssuedView
  cancelled: boolean
}

export type PcLookup =
  | { ok: true; state: PcState }
  | { ok: false; reason: "not_found" | "unavailable" }

const seatCount = (r: PcRequestView) => r.adults + r.children + r.infantsInSeat
export const paxTotal = (r: PcRequestView) => seatCount(r) + r.infantsOnLap

/**
 * Carrega tudo o que os ecrãs P3→P9 precisam, num só sítio.
 *
 * Uma leitura só e não uma por ecrã: o cliente pode aterrar em qualquer um
 * deles, e é o estado que decide qual — não o contrário.
 */
export async function loadPcState(token: string): Promise<PcLookup> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: "unavailable" }

  /*
   * A etapa 3 é a que interessa aqui: é a única cujo bloqueio ou expiração muda
   * o que o cliente pode fazer. `getCaseByToken` recusa uma etapa expirada, e
   * isso seria errado neste fluxo — um pagamento expirado tem um ecrã próprio
   * (P8) e não uma página de link inválido. Por isso o caso é lido em cru.
   */
  const { data: raw } = await admin
    .from("booking_cases")
    .select(
      `id, token, stage, created_at, pnr, issued_at,
       links:case_links (stage, status),
       trip_request:trip_requests (
         id, reference, trip_type, origin, destination, depart_date, return_date,
         adults, children, infants, infants_in_seat, infants_on_lap,
         cabin_class, currency, agent_slug, created_at,
         lead:leads (full_name, email, phone_prefix, phone, locale),
         legs:trip_request_legs (position, origin, destination, depart_date)
       )`
    )
    .eq("token", token)
    .maybeSingle()

  if (!raw) return { ok: false, reason: "not_found" }

  const row = raw as Record<string, any>
  const trip = unwrap(row.trip_request)
  if (!trip) return { ok: false, reason: "not_found" }

  const lead = unwrap(trip.lead)
  const fullName = String(lead?.full_name ?? "")

  const request: PcRequestView = {
    reference: String(trip.reference),
    trip: TRIP_FROM_DB[String(trip.trip_type)] ?? "round",
    cabin: CABIN_FROM_DB[String(trip.cabin_class)] ?? "economy",
    origin: String(trip.origin ?? ""),
    destination: String(trip.destination ?? ""),
    departDate: String(trip.depart_date ?? ""),
    returnDate: (trip.return_date as string | null) ?? null,
    adults: Number(trip.adults ?? 1),
    children: Number(trip.children ?? 0),
    /* Pedidos anteriores à migração 0009 só têm `infants`. Tratá-los como bebés
       com assento é o palpite conservador: conta um lugar a mais, não a menos. */
    infantsInSeat: Number(trip.infants_in_seat ?? trip.infants ?? 0),
    infantsOnLap: Number(trip.infants_on_lap ?? 0),
    currency: String(trip.currency ?? "EUR"),
    agentSlug: (trip.agent_slug as string | null) ?? null,
    legs: ((trip.legs ?? []) as Record<string, unknown>[])
      .map((l) => ({
        position: Number(l.position),
        origin: String(l.origin),
        destination: String(l.destination),
        date: String(l.depart_date),
      }))
      .sort((a, b) => a.position - b.position),
    createdAt: String(trip.created_at ?? row.created_at),
  }

  const contact: PcContactView = {
    fullName,
    firstName: fullName.split(/\s+/)[0] ?? "",
    email: String(lead?.email ?? ""),
    dialCode: String(lead?.phone_prefix ?? "+238"),
    phone: String(lead?.phone ?? ""),
    locale: String(lead?.locale ?? "en"),
  }

  const caseId = String(row.id)
  const stage = String(row.stage)
  const cancelled = stage === "cancelado"

  const links = (row.links ?? []) as { stage: number; status: LinkStatus }[]
  const paymentLinkStatus = links.find((l) => l.stage === 3)?.status ?? null

  const published = await getPublishedProposal(caseId)
  const offers = published?.offers ?? []

  const pax: PaxCounts = {
    adults: request.adults,
    children: request.children,
    /* A tabela de ofertas tem uma linha de bebé só; a distinção assento/colo é
       do pedido e não do preço. Somam-se para o total. */
    infants: request.infantsInSeat + request.infantsOnLap,
  }

  const totals: Record<string, number> = {}
  for (const offer of offers) totals[offer.id] = offerTotal(offer, pax)

  const selectedOfferId = published?.proposal.selected_offer_id ?? null
  const selectedAt = published?.proposal.selected_at ?? null

  const { data: passengerRows } = await admin
    .from("case_passengers")
    .select(
      "id, position, passenger_type, title, first_name, last_name, gender, birth_date, nationality, passport_number, passport_expiry, issuing_country, ticket_number"
    )
    .eq("case_id", caseId)
    .order("position")

  const passengers = (passengerRows ?? []) as unknown as CasePassenger[]

  let payment = await getPcPayment(caseId)
  let expiry: PcState["expiry"] = { expired: false, cause: null }

  if (payment) {
    expiry = await enforceExpiry(payment)
    // Reler depois de expirar: o ecrã tem de mostrar o estado já mudado.
    if (expiry.expired && payment.status !== "EXPIRED") {
      payment = (await getPcPayment(caseId)) ?? payment
    }
  }

  const proofs = payment ? await listProofs(payment.id) : []

  const state: PcState = {
    token,
    caseId,
    stage,
    screen: "p3",
    request,
    contact,
    paymentLinkStatus,
    offers,
    totals,
    pax,
    selectedOfferId,
    selectedAt,
    proposalPublishedAt: published?.proposal.published_at ?? null,
    passengers,
    payment,
    proofs,
    expiry,
    issued: {
      pnr: (row.pnr as string | null) ?? null,
      issuedAt: (row.issued_at as string | null) ?? null,
    },
    cancelled,
  }

  state.screen = screenFor(state)

  return { ok: true, state }
}

/**
 * O ecrã que este estado exige.
 *
 * A ordem das perguntas é a ordem em que elas mandam: emitido ganha a tudo,
 * expirado ganha a "escolhe uma opção", e por aí. Cada `if` mais abaixo só é
 * alcançado porque nenhum dos de cima se aplicou.
 */
export function screenFor(state: PcState): PcScreen {
  if (state.stage === "emitido" || state.issued.pnr) return "p9"

  const p = state.payment

  // Pago e à espera do bilhete: o cliente já não tem nada a fazer.
  if (p && (p.status === "COMPLETED" || p.admin_confirmed)) return "p7b"

  /*
   * A expiração vem ANTES de "comprovativo à espera de validação", e a ordem é
   * o ponto todo: quando o prazo se esgota com um comprovativo por validar, o
   * comprovativo continua marcado como 'recebido' — se essa pergunta viesse
   * primeiro, o cliente ficaria eternamente num ecrã a dizer "estamos a
   * verificar o seu pagamento" sobre um link que já fechou. É o caso em que a
   * falha é nossa, e é justamente esse que não pode ficar escondido.
   */
  if (state.expiry.expired) return "p8"

  // Comprovativo entregue, à espera de quem valida.
  if (p && p.proof_status === "recebido") return "p7b"

  if (state.selectedOfferId) {
    /* Escolheu a opção. Falta saber se falta preencher passaportes: enquanto
       faltarem, o ecrã é o dos passageiros; quando estiverem completos, é o do
       pagamento. É esta a separação que o mockup fundia num ecrã só. */
    return passengersComplete(state) ? "p7pay" : "p7"
  }

  if (state.offers.length) return "p5"

  if (state.cancelled) return "p3"

  return "p4a"
}

/**
 * Passaportes completos?
 *
 * Conta lugares e campos: um passageiro a menos é um passaporte a faltar, e um
 * passageiro sem número de passaporte não serve para emitir.
 */
export function passengersComplete(state: PcState): boolean {
  const expected = paxTotal(state.request)
  if (state.passengers.length < expected) return false
  return state.passengers.every(
    (p) =>
      p.first_name?.trim() &&
      p.last_name?.trim() &&
      p.birth_date &&
      p.passport_number?.trim() &&
      p.passport_expiry
  )
}

/** A oferta escolhida, se houver. */
export function selectedOffer(state: PcState): Offer | null {
  if (!state.selectedOfferId) return null
  return state.offers.find((o) => o.id === state.selectedOfferId) ?? null
}

/** Marca a primeira abertura da etapa que este ecrã representa. */
export async function touchLink(token: string, stage: 1 | 2 | 3): Promise<void> {
  const lookup = await getCaseByToken(token, stage)
  if (lookup.ok) await markLinkOpened(lookup.view.link.id)
}

function unwrap(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] ?? null) as Record<string, any> | null
  return (value ?? null) as Record<string, any> | null
}
