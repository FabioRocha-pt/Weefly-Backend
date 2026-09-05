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
import {
  customerDeadline,
  offerTotal,
  type Offer,
  type PaxCounts,
} from "@/lib/proposal-math"
import { CABIN_FROM_DB, TRIP_FROM_DB } from "@/lib/pc/catalog"
import { countryOfDial } from "@/lib/countries"
import {
  deriveLinkState,
  linkStateDrifted,
  type CaseStage,
  type LinkState,
  type LinkStatus,
  type PaymentStatus,
} from "@/lib/case-status"

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
  /** C-04 · trabalho concluído. Sai das filas. Ver `boCloseCase`. */
  | "fechado"
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
  fechado: "Fechado",
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
  fechado: "st-e5",
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
  fechado: "done",
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
  /**
   * O mercado do cliente, em ISO-3166 alpha-2.
   *
   * Era o indicativo telefónico ("+33"), o que confundia vinte países num só
   * quando o indicativo é partilhado. Passa a ser o país guardado no lead; para
   * os pedidos anteriores à migração 0010 fica o palpite a partir do indicativo.
   */
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
  /** C-01 · quando passou a ter dono. Nulo = nunca foi reclamado. */
  claimedAt: string | null
  /** C-04 · quando o trabalho foi concluído. Nulo = ainda aberto. */
  closedAt: string | null
  closedByEmail: string | null
  /** C-05 · o estado de cada link, derivado do caso. Ver `deriveLinkState`. */
  links: {
    stage: number
    state: LinkState
    /** Verdadeiro quando a coluna gravada discorda do estado real. */
    drifted: boolean
    firstOpenedAt: string | null
    lastOpenedAt: string | null
    openCount: number
  }[]
}

/*
 * `offers:case_offers!proposal_id` — a dica de relação não é decorativa.
 *
 * Há dois caminhos entre case_proposals e case_offers: offers.proposal_id e
 * proposals.selected_offer_id (migração 0005). Sem a dica, o PostgREST recusa a
 * query inteira ("more than one relationship was found"), e como esta função
 * devolve a fila vazia quando a query falha, o back-office ficava sem casos e
 * cada ficha respondia 404.
 *
 * O comentário vive aqui e não dentro da template string: o que estiver entre
 * as backticks vai literalmente no parâmetro `select`.
 */
const QUEUE_COLUMNS = `
  id, token, stage, created_at, updated_at, created_by, pnr,
  claimed_at, closed_at, closed_by_email,
  trip_request:trip_requests (
    reference, trip_type, origin, destination, depart_date, return_date,
    adults, children, infants, infants_in_seat, infants_on_lap,
    cabin_class, currency, agent_slug, created_at,
    lead:leads (full_name, email, phone, phone_prefix, phone_country, locale)
  ),
  proposals:case_proposals (
    id, status, published_at, selected_offer_id, selected_at,
    offers:case_offers!proposal_id (
      id, position, include_in_proposal, fare_held_until, fare_held_source,
      price_adult, price_child, price_infant, taxes_total, service_fee,
      lock_fee, lock_fee_enabled
    )
  ),
  payments:case_payments (
    id, amount, currency, status, proof_status, admin_confirmed,
    expires_at, review_deadline_at, created_at
  ),
  passengers:case_passengers (id),
  links:case_links (stage, status, submitted_at, first_opened_at, last_opened_at, open_count)
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
  pnr: string | null,
  closedAt: string | null
): BoState {
  if (stage === "cancelado") return "cancelado"
  /* C-04 · fechado ganha a emitido: são independentes, e o que a fila precisa de
     saber é se ainda há trabalho — não se o bilhete existe. */
  if (closedAt) return "fechado"
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
  /**
   * Um caso só, para a ficha.
   *
   * Sem isto, abrir uma ficha lia os 300 casos mais recentes para encontrar uma
   * linha — e um caso mais antigo do que esses 300 simplesmente não abria.
   */
  caseId?: string
}

export type BoBucket =
  | "por_validar"
  | "pagos_sem_bilhete"
  | "novos_sem_dono"
  | "a_cotar_meus"
  | "a_expirar"
  | "espera_cliente"
  | "tudo"
  /** T-21 · os casos fechados, e só eles. */
  | "fechados"

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
      fechados: 0,
    },
    oldest: {},
    issuedThisMonth: { count: 0, revenue: 0, currency: "EUR" },
  }
  if (!admin) return empty

  let query = admin
    .from("booking_cases")
    .select(QUEUE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(filters.caseId ? 1 : (filters.limit ?? 300))

  if (filters.caseId) query = query.eq("id", filters.caseId)

  const { data, error } = await query

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

    /*
     * FB-04 · o prazo da proposta, como o cliente o vê.
     *
     * Era o mínimo dos `valid_until` escritos à mão em cada oferta. Passou a ser
     * o mesmo cálculo que o ecrã do cliente faz — a janela a contar de
     * `published_at`, encurtada por uma retenção da companhia que caia antes.
     * Um só sítio a decidir, senão o balde "propostas a expirar" e o relógio do
     * cliente contavam coisas diferentes.
     */
    const deadline = customerDeadline(
      offers as unknown as Offer[],
      (proposal?.published_at as string | null) ?? null
    )
    const offerValidUntil = deadline ? new Date(deadline).toISOString() : null

    const state = deriveState(
      String(raw.stage),
      payment,
      proposal,
      passengerCount,
      (raw.pnr as string | null) ?? null,
      (raw.closed_at as string | null) ?? null
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
      market:
        String(lead?.phone_country ?? "").toUpperCase() ||
        countryOfDial(String(lead?.phone_prefix ?? "")) ||
        "",
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
      claimedAt: (raw.claimed_at as string | null) ?? null,
      closedAt: (raw.closed_at as string | null) ?? null,
      closedByEmail: (raw.closed_by_email as string | null) ?? null,
      /*
       * C-05 · o estado do link, calculado a partir do caso.
       *
       * A coluna `status` continua a ser lida — é ela que autoriza o cliente a
       * entrar — mas deixa de ser o que este ecrã mostra. `drifted` diz quando
       * as duas discordam, porque uma divergência silenciosamente corrigida é a
       * mesma classe de problema que o C-05 aponta.
       */
      links: ((raw.links ?? []) as Record<string, any>[])
        .map((link) => {
          const stage = Number(link.stage)
          const stored = String(link.status) as LinkStatus
          const state = deriveLinkState({
            stage,
            stored,
            submittedAt: (link.submitted_at as string | null) ?? null,
            caseStage: String(raw.stage) as CaseStage,
            closed: Boolean(raw.closed_at),
          })
          return {
            stage,
            state,
            drifted: linkStateDrifted(stored, state),
            firstOpenedAt: (link.first_opened_at as string | null) ?? null,
            lastOpenedAt: (link.last_opened_at as string | null) ?? null,
            openCount: Number(link.open_count ?? 0),
          }
        })
        .sort((a, b) => a.stage - b.stage),
    })
  }

  // ── baldes ────────────────────────────────────────────────────────────────
  const soon = Date.now() + 60 * 60 * 1000
  const belongs = (row: BoQueueRow, bucket: BoBucket): boolean => {
    /*
     * C-04 e T-21 · "o caso fechado sai das filas de trabalho".
     *
     * Aqui e não em cada balde: um caso fechado não pertence a nenhum deles, e
     * repetir a condição em cada um garantia que o próximo a nascer a
     * esquecesse.
     *
     * T-21 muda o que "tudo" quer dizer. Um caso fechado aparecia lá, e o
     * separador "Tudo" é o que se abre quando se procura alguma coisa — o
     * resultado era uma lista que crescia para sempre com trabalho que já não
     * existe. O critério é explícito: "os casos fechados saem das filas de
     * trabalho e aparecem só neste filtro".
     */
    if (row.closedAt) return bucket === "fechados"
    if (bucket === "fechados") return false

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
    "fechados",
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
  } else if (filters.bucket === "tudo" && !filters.caseId) {
    /*
     * T-21 · "Tudo" é tudo o que está em aberto.
     *
     * `belongs` já responde por isto nos outros separadores, mas o "tudo" salta
     * o filtro de propósito — é a lista completa e não um balde. O critério
     * corta-lhe os fechados na mesma: quem abre "Tudo" está a procurar trabalho,
     * e um caso emitido e encerrado há três meses só lá está a ocupar espaço.
     *
     * `caseId` é a excepção, e é a razão de a condição existir: `loadBoCase`
     * chama isto com `bucket: "tudo"` para carregar uma ficha, e uma ficha de um
     * caso fechado tem de continuar a abrir.
     */
    visible = visible.filter((row) => !row.closedAt)
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
    /** VIP-10 · malas de porão pedidas, para a ficha as mostrar a quem cota. */
    baggageHold: number
    /** FE-05 · o que nenhum campo estruturado apanha, escrito pelo cliente. */
    specialRequests: string | null
    legs: { position: number; origin: string; destination: string; date: string }[]
    consentAt: string | null
    consentIp: string | null
    consentAgent: string | null
    intake: string
    /**
     * As datas que o cliente pediu, quando a equipa já lhas mudou.
     *
     * BO-04 · a rota nunca se edita e as datas só mudam por uma ação explícita,
     * com motivo. O pedido original fica aqui para a ficha o poder mostrar
     * intacto ao lado das datas em vigor — um caso onde ninguém mexeu tem estes
     * dois campos a nulo.
     */
    originalDepartDate: string | null
    originalReturnDate: string | null
    datesChangedAt: string | null
    datesChangedBy: string | null
    datesChangeReason: string | null
  }
  ownerEmail: string | null
  /** BO-14 · o vendedor atribuído, da lista de acessos do sistema. */
  seller: { email: string | null; label: string | null }
  /** NT-06 · a última falha de entrega ao cliente que ninguém deu por tratada. */
  notifyAlert: { at: string | null; reason: string | null }
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
 * calculado num sítio só. Pedida por `caseId`, a fila lê uma linha e não 300.
 */
export async function loadBoCase(caseId: string): Promise<BoCaseDetail | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const queue = await loadBoQueue({ bucket: "tudo", caseId })
  const row = queue.rows.find((r) => r.caseId === caseId)
  if (!row) return null

  const { data: raw } = await admin
    .from("booking_cases")
    .select(
      `created_by, pnr, issued_at, issuing_carrier, consolidator, cost_real,
       fare_basis, nvb, nva, endorsements, ticket_document_number,
       seller_email, seller_label, notify_alert_at, notify_alert_reason,
       trip_request:trip_requests (
         id, trip_type, cabin_class, adults, children, infants,
         infants_in_seat, infants_on_lap, baggage_hold, special_requests,
         intake, consent_ip, consent_agent,
         original_depart_date, original_return_date, dates_changed_at,
         dates_changed_by_email, dates_change_reason,
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
      baggageHold: Number(trip.baggage_hold ?? 0),
      /* FE-05 · o texto livre do ecrã de revisão. Aparece na coluna esquerda
         da ficha, debaixo do resumo do pedido — que é onde quem cota olha. */
      specialRequests: (trip.special_requests as string | null) ?? null,
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
      originalDepartDate: (trip.original_depart_date as string | null) ?? null,
      originalReturnDate: (trip.original_return_date as string | null) ?? null,
      datesChangedAt: (trip.dates_changed_at as string | null) ?? null,
      datesChangedBy: (trip.dates_changed_by_email as string | null) ?? null,
      datesChangeReason: (trip.dates_change_reason as string | null) ?? null,
    },
    ownerEmail,
    /* BO-14 · o vendedor do caso, atribuído da lista de acessos. Distinto do
       dono (`created_by`): reclamar um caso é um gesto, atribuí-lo é outro. */
    seller: {
      email: (record.seller_email as string | null) ?? null,
      label: (record.seller_label as string | null) ?? null,
    },
    /* NT-06 · a falha de entrega que ninguém tratou ainda. */
    notifyAlert: {
      at: (record.notify_alert_at as string | null) ?? null,
      reason: (record.notify_alert_reason as string | null) ?? null,
    },
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
