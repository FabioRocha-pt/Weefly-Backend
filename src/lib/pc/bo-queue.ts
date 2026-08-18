/**
 * WeeFly — a fila de trabalho do Price Checker.
 *
 * A lista do back-office não é "todos os casos por data": é uma fila ordenada
 * por quem está à espera de quem. O mockup diz o critério em duas palavras —
 * âmbar somos nós, azul é o cliente — e é esse eixo que decide o que aparece em
 * cima.
 *
 * Leituras pela service role: o back-office já é protegido pela allowlist na
 * porta (`getBoAccess`), e as RLS destas tabelas exigem `platform_staff`, o que
 * faria a fila depender de duas listas em vez de uma.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { offerTotal, type PaxCounts } from "@/lib/proposal-math"
import { CABIN_FROM_DB, TRIP_FROM_DB } from "@/lib/pc/catalog"
import type { PaymentStatus } from "@/lib/case-status"

/**
 * O estado do caso como o back-office fala dele: E1 a E5, mais os desfechos.
 *
 * Não é `booking_cases.stage` — é uma leitura dele cruzada com o pagamento. A
 * diferença que interessa: 'pago_sem_bilhete' e 'comprovativo_por_validar' não
 * existem como etapa nenhuma na base de dados, e são os dois estados mais
 * críticos de todos.
 */
export type BoState =
  | "novo"
  | "em_cotacao"
  | "propostas_enviadas"
  | "aguarda_escolha"
  | "aguarda_passaportes"
  | "aguarda_pagamento"
  | "comprovativo_por_validar"
  | "pago_sem_bilhete"
  | "emitido"
  | "expirado"
  | "cancelado"

export const BO_STATE_LABEL: Record<BoState, string> = {
  novo: "E1 · Novo",
  em_cotacao: "E2 · Em cotação",
  propostas_enviadas: "E3 · Propostas enviadas",
  aguarda_escolha: "E3 · Aguarda escolha",
  aguarda_passaportes: "E3 · Aguarda passaportes",
  aguarda_pagamento: "E4 · Aguarda pagamento",
  comprovativo_por_validar: "E4 · Comprovativo por validar",
  pago_sem_bilhete: "Pago, sem bilhete",
  emitido: "E5 · Emitido",
  expirado: "X1 · Expirado",
  cancelado: "X2 · Cancelado",
}

/** A classe de cor do chip, das que existem em bo-pc.css. */
export const BO_STATE_CLASS: Record<BoState, string> = {
  novo: "st-e1",
  em_cotacao: "st-e2",
  propostas_enviadas: "st-e3",
  aguarda_escolha: "st-e3",
  aguarda_passaportes: "st-e3",
  aguarda_pagamento: "st-e4",
  comprovativo_por_validar: "st-x",
  pago_sem_bilhete: "st-x",
  emitido: "st-e5",
  expirado: "st-x",
  cancelado: "st-x",
}

/** Quem tem a bola: nós, o cliente, fechado, ou parado. */
export type Waiting = "us" | "them" | "done" | "off" | "bad"

export const BO_STATE_WAITING: Record<BoState, Waiting> = {
  novo: "us",
  em_cotacao: "us",
  propostas_enviadas: "them",
  aguarda_escolha: "them",
  aguarda_passaportes: "them",
  aguarda_pagamento: "them",
  comprovativo_por_validar: "bad",
  pago_sem_bilhete: "bad",
  emitido: "done",
  expirado: "off",
  cancelado: "off",
}

export interface BoQueueRow {
  caseId: string
  token: string
  reference: string
  stage: string
  state: BoState
  waiting: Waiting
  clientName: string
  clientPhone: string
  clientEmail: string
  market: string
  locale: string
  currency: string
  agentSlug: string | null
  ownerId: string | null
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  paxLabel: string
  /** Instante em que o pedido entrou — a fila conta a partir daqui. */
  submittedAt: string
  updatedAt: string
  amount: number | null
  paymentStatus: PaymentStatus | null
  proofStatus: string | null
  adminConfirmed: boolean
  /** O prazo que está a correr, seja o do cliente ou o nosso. */
  deadlineAt: string | null
  deadlineIsOurs: boolean
  offerValidUntil: string | null
  pnr: string | null
}

const QUEUE_COLUMNS = `
  id, token, stage, created_at, updated_at, created_by, pnr,
  trip_request:trip_requests (
    reference, trip_type, origin, destination, depart_date, return_date,
    adults, children, infants, infants_in_seat, infants_on_lap,
    cabin_class, currency, agent_slug, created_at,
    lead:leads (full_name, email, phone, phone_prefix, locale)
  ),
  proposals:case_proposals (
    id, status, published_at, selected_offer_id, selected_at,
    offers:case_offers (
      id, position, include_in_proposal, valid_until,
      price_adult, price_child, price_infant, taxes_total, service_fee,
      lock_fee, lock_fee_enabled
    )
  ),
  payments:case_payments (
    id, amount, currency, status, proof_status, admin_confirmed,
    expires_at, review_deadline_at, created_at
  ),
  passengers:case_passengers (id),
  links:case_links (stage, status)
`

function unwrap(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] ?? null) as Record<string, any> | null
  return (value ?? null) as Record<string, any> | null
}

/** "2A · 1C · 1B" — como a coluna de passageiros do mockup. */
function paxLabel(trip: Record<string, any>): string {
  const parts: string[] = [`${trip.adults ?? 1}A`]
  if (trip.children) parts.push(`${trip.children}C`)
  const infants =
    Number(trip.infants_in_seat ?? 0) + Number(trip.infants_on_lap ?? trip.infants ?? 0)
  if (infants) parts.push(`${infants}B`)
  return parts.join(" · ")
}

/**
 * O estado do caso, cruzando etapa com pagamento.
 *
 * A ordem das perguntas é a das prioridades da equipa: um comprovativo à espera
 * de validação e um pagamento sem bilhete ganham a tudo o mais, porque são os
 * dois pontos onde o cliente já cumpriu e nós ainda não.
 */
function deriveState(
  stage: string,
  payment: Record<string, any> | null,
  proposal: Record<string, any> | null,
  passengerCount: number,
  pnr: string | null
): BoState {
  if (stage === "cancelado") return "cancelado"
  if (stage === "emitido" || pnr) return "emitido"

  const paid = payment?.admin_confirmed || payment?.status === "COMPLETED"
  if (paid) return "pago_sem_bilhete"

  if (payment?.proof_status === "recebido") return "comprovativo_por_validar"

  if (payment?.status === "EXPIRED") return "expirado"

  if (proposal?.selected_offer_id) {
    return passengerCount > 0 ? "aguarda_pagamento" : "aguarda_passaportes"
  }

  if (proposal?.status === "publicada") return "propostas_enviadas"

  return stage === "novo" || stage === "pedido_recebido" ? "novo" : "em_cotacao"
}

export interface BoQueueFilters {
  /** O separador escolhido na fila. */
  bucket?: BoBucket
  search?: string
  market?: string
  owner?: string
  limit?: number
}

export type BoBucket =
  | "por_validar"
  | "pagos_sem_bilhete"
  | "novos_sem_dono"
  | "a_cotar_meus"
  | "a_expirar"
  | "espera_cliente"
  | "tudo"

export interface BoQueue {
  rows: BoQueueRow[]
  counts: Record<BoBucket, number>
  /** O mais antigo de cada balde crítico, para a linha de baixo dos KPIs. */
  oldest: Partial<Record<BoBucket, string>>
  issuedThisMonth: { count: number; revenue: number; currency: string }
}

/**
 * Carrega a fila inteira e conta os baldes.
 *
 * Uma leitura só, e a filtragem em memória: são casos de uma agência, não um
 * feed. Traduzir cada balde numa query separada custaria seis idas à base de
 * dados para desenhar seis números que têm de ser coerentes entre si.
 */
export async function loadBoQueue(
  filters: BoQueueFilters = {},
  viewerId?: string
): Promise<BoQueue> {
  const admin = createAdminClient()
  const empty: BoQueue = {
    rows: [],
    counts: {
      por_validar: 0,
      pagos_sem_bilhete: 0,
      novos_sem_dono: 0,
      a_cotar_meus: 0,
      a_expirar: 0,
      espera_cliente: 0,
      tudo: 0,
    },
    oldest: {},
    issuedThisMonth: { count: 0, revenue: 0, currency: "EUR" },
  }
  if (!admin) return empty

  const { data, error } = await admin
    .from("booking_cases")
    .select(QUEUE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 300)

  if (error) {
    console.error("[bo/pc] fila falhou:", error.message)
    return empty
  }

  const rows: BoQueueRow[] = []

  for (const raw of (data ?? []) as Record<string, any>[]) {
    const trip = unwrap(raw.trip_request)
    // Um caso sem pedido é um caso criado à mão e ainda vazio: não é fila.
    if (!trip) continue

    const lead = unwrap(trip.lead)
    const proposal = unwrap(raw.proposals)
    const payments = ((raw.payments ?? []) as Record<string, any>[]).sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    )
    const payment = payments[0] ?? null
    const passengerCount = ((raw.passengers ?? []) as unknown[]).length

    const pax: PaxCounts = {
      adults: Number(trip.adults ?? 1),
      children: Number(trip.children ?? 0),
      infants:
        Number(trip.infants_in_seat ?? 0) +
        Number(trip.infants_on_lap ?? trip.infants ?? 0),
    }

    const offers = ((proposal?.offers ?? []) as Record<string, any>[]).filter(
      (o) => o.include_in_proposal !== false
    )

    const selected = offers.find((o) => o.id === proposal?.selected_offer_id)
    const amount =
      payment?.amount ??
      (selected ? offerTotal(selected as never, pax) : null) ??
      null

    const validities = offers
      .map((o) => o.valid_until as string | null)
      .filter(Boolean) as string[]
    const offerValidUntil = validities.length
      ? validities.reduce((a, b) => (a < b ? a : b))
      : null

    const state = deriveState(
      String(raw.stage),
      payment,
      proposal,
      passengerCount,
      (raw.pnr as string | null) ?? null
    )

    /* Qual dos dois relógios mostrar: o nosso quando há comprovativo à espera,
       o do cliente quando é ele que tem de pagar. */
    const deadlineIsOurs = payment?.proof_status === "recebido"
    const deadlineAt = deadlineIsOurs
      ? (payment?.review_deadline_at ?? null)
      : (payment?.expires_at ?? null)

    rows.push({
      caseId: String(raw.id),
      token: String(raw.token),
      reference: String(trip.reference),
      stage: String(raw.stage),
      state,
      waiting: BO_STATE_WAITING[state],
      clientName: String(lead?.full_name ?? "—"),
      clientPhone: `${lead?.phone_prefix ?? ""} ${lead?.phone ?? ""}`.trim(),
      clientEmail: String(lead?.email ?? ""),
      market: String(lead?.phone_prefix ?? ""),
      locale: String(lead?.locale ?? "pt"),
      currency: String(trip.currency ?? payment?.currency ?? "EUR"),
      agentSlug: (trip.agent_slug as string | null) ?? null,
      ownerId: (raw.created_by as string | null) ?? null,
      origin: String(trip.origin ?? ""),
      destination: String(trip.destination ?? ""),
      departDate: String(trip.depart_date ?? ""),
      returnDate: (trip.return_date as string | null) ?? null,
      paxLabel: paxLabel(trip),
      submittedAt: String(trip.created_at ?? raw.created_at),
      updatedAt: String(raw.updated_at ?? raw.created_at),
      amount,
      paymentStatus: (payment?.status as PaymentStatus | null) ?? null,
      proofStatus: (payment?.proof_status as string | null) ?? null,
      adminConfirmed: Boolean(payment?.admin_confirmed),
      deadlineAt,
      deadlineIsOurs,
      offerValidUntil,
      pnr: (raw.pnr as string | null) ?? null,
    })
  }

  // ── baldes ────────────────────────────────────────────────────────────────
  const soon = Date.now() + 60 * 60 * 1000
  const belongs = (row: BoQueueRow, bucket: BoBucket): boolean => {
    switch (bucket) {
      case "por_validar":
        return row.state === "comprovativo_por_validar"
      case "pagos_sem_bilhete":
        return row.state === "pago_sem_bilhete"
      case "novos_sem_dono":
        return row.state === "novo" && !row.ownerId
      case "a_cotar_meus":
        return (
          (row.state === "novo" || row.state === "em_cotacao") &&
          Boolean(viewerId) &&
          row.ownerId === viewerId
        )
      case "a_expirar":
        return (
          row.state === "propostas_enviadas" &&
          Boolean(row.offerValidUntil) &&
          Date.parse(row.offerValidUntil!) < soon
        )
      case "espera_cliente":
        return row.waiting === "them"
      case "tudo":
        return true
    }
  }

  const buckets: BoBucket[] = [
    "por_validar",
    "pagos_sem_bilhete",
    "novos_sem_dono",
    "a_cotar_meus",
    "a_expirar",
    "espera_cliente",
    "tudo",
  ]

  const counts = {} as Record<BoBucket, number>
  const oldest: Partial<Record<BoBucket, string>> = {}

  for (const bucket of buckets) {
    const matching = rows.filter((row) => belongs(row, bucket))
    counts[bucket] = matching.length
    if (matching.length) {
      oldest[bucket] = matching
        .map((r) => r.submittedAt)
        .reduce((a, b) => (a < b ? a : b))
    }
  }

  // ── filtro pedido ─────────────────────────────────────────────────────────
  let visible = rows

  if (filters.bucket && filters.bucket !== "tudo") {
    visible = visible.filter((row) => belongs(row, filters.bucket!))
  }

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase()
    visible = visible.filter((row) =>
      [
        row.reference,
        row.clientName,
        row.clientPhone,
        row.clientEmail,
        row.origin,
        row.destination,
        row.pnr ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
  }

  if (filters.market?.trim()) {
    visible = visible.filter((row) => row.market === filters.market)
  }

  /*
   * Ordem da fila: primeiro quem espera por nós, depois quem espera pelo
   * cliente, e dentro de cada grupo o mais antigo em cima. É a ordem em que o
   * trabalho deve ser feito, não a ordem em que entrou.
   */
  const weight: Record<Waiting, number> = { bad: 0, us: 1, them: 2, off: 3, done: 4 }
  visible = [...visible].sort((a, b) => {
    const diff = weight[a.waiting] - weight[b.waiting]
    if (diff !== 0) return diff
    return Date.parse(a.submittedAt) - Date.parse(b.submittedAt)
  })

  // ── emitidos este mês ─────────────────────────────────────────────────────
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const issued = rows.filter(
    (row) => row.state === "emitido" && Date.parse(row.updatedAt) >= monthStart.getTime()
  )

  return {
    rows: visible,
    counts,
    oldest,
    issuedThisMonth: {
      count: issued.length,
      revenue: issued.reduce((sum, row) => sum + (row.amount ?? 0), 0),
      currency: issued[0]?.currency ?? "EUR",
    },
  }
}

// ── o caso, em detalhe ───────────────────────────────────────────────────────

export interface BoCaseDetail {
  row: BoQueueRow
  trip: {
    tripLabel: string
    cabinLabel: string
    adults: number
    children: number
    infantsInSeat: number
    infantsOnLap: number
    legs: { position: number; origin: string; destination: string; date: string }[]
    consentAt: string | null
    consentIp: string | null
    consentAgent: string | null
    intake: string
  }
  ownerEmail: string | null
  notes: { id: string; body: string; author_email: string | null; created_at: string }[]
  issuance: {
    pnr: string | null
    issuingCarrier: string | null
    consolidator: string | null
    costReal: number | null
    fareBasis: string | null
    nvb: string | null
    nva: string | null
    endorsements: string | null
    issuedAt: string | null
  }
}

const TRIP_LABEL_PT: Record<string, string> = {
  round: "Ida e volta",
  oneway: "Só ida",
  multi: "Multi-destino",
}

const CABIN_LABEL_PT: Record<string, string> = {
  economy: "Económica",
  premium: "Económica premium",
  business: "Executiva",
  first: "Primeira",
}

/**
 * O caso para a ficha, com o que a fila não carrega.
 *
 * Reaproveita `loadBoQueue` para a linha em si em vez de repetir a derivação do
 * estado: são duas leituras onde poderia haver uma, e é o preço de o estado ser
 * calculado num sítio só.
 */
export async function loadBoCase(caseId: string): Promise<BoCaseDetail | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const queue = await loadBoQueue({ bucket: "tudo", limit: 300 })
  const row = queue.rows.find((r) => r.caseId === caseId)
  if (!row) return null

  const { data: raw } = await admin
    .from("booking_cases")
    .select(
      `created_by, pnr, issued_at, issuing_carrier, consolidator, cost_real,
       fare_basis, nvb, nva, endorsements,
       trip_request:trip_requests (
         id, trip_type, cabin_class, adults, children, infants,
         infants_in_seat, infants_on_lap, intake, consent_ip, consent_agent,
         lead:leads (consent_at),
         legs:trip_request_legs (position, origin, destination, depart_date),
         notes:trip_request_notes (id, body, author_email, created_at)
       )`
    )
    .eq("id", caseId)
    .maybeSingle()

  const record = (raw ?? {}) as Record<string, any>
  const trip = unwrap(record.trip_request) ?? {}
  const lead = unwrap(trip.lead)

  let ownerEmail: string | null = null
  if (record.created_by) {
    const { data: staff } = await admin
      .from("platform_staff")
      .select("email")
      .eq("user_id", record.created_by)
      .maybeSingle()
    ownerEmail = (staff as { email: string | null } | null)?.email ?? null
  }

  return {
    row,
    trip: {
      tripLabel: TRIP_LABEL_PT[TRIP_FROM_DB[String(trip.trip_type)] ?? "round"],
      cabinLabel: CABIN_LABEL_PT[CABIN_FROM_DB[String(trip.cabin_class)] ?? "economy"],
      adults: Number(trip.adults ?? 1),
      children: Number(trip.children ?? 0),
      infantsInSeat: Number(trip.infants_in_seat ?? 0),
      infantsOnLap: Number(trip.infants_on_lap ?? trip.infants ?? 0),
      legs: ((trip.legs ?? []) as Record<string, any>[])
        .map((l) => ({
          position: Number(l.position),
          origin: String(l.origin),
          destination: String(l.destination),
          date: String(l.depart_date),
        }))
        .sort((a, b) => a.position - b.position),
      consentAt: (lead?.consent_at as string | null) ?? null,
      consentIp: (trip.consent_ip as string | null) ?? null,
      consentAgent: (trip.consent_agent as string | null) ?? null,
      intake: String(trip.intake ?? "concierge"),
    },
    ownerEmail,
    notes: ((trip.notes ?? []) as Record<string, any>[])
      .map((n) => ({
        id: String(n.id),
        body: String(n.body),
        author_email: (n.author_email as string | null) ?? null,
        created_at: String(n.created_at),
      }))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    issuance: {
      pnr: (record.pnr as string | null) ?? null,
      issuingCarrier: (record.issuing_carrier as string | null) ?? null,
      consolidator: (record.consolidator as string | null) ?? null,
      costReal: (record.cost_real as number | null) ?? null,
      fareBasis: (record.fare_basis as string | null) ?? null,
      nvb: (record.nvb as string | null) ?? null,
      nva: (record.nva as string | null) ?? null,
      endorsements: (record.endorsements as string | null) ?? null,
      issuedAt: (record.issued_at as string | null) ?? null,
    },
  }
}
