/**
 * WeeFly booking cases — constants and row types.
 *
 * Server-import-free (see travel-request-status.ts for the same reasoning) so
 * Client Components can use the labels without pulling in the Supabase client.
 */

export const CASE_STAGES = [
  "novo",
  "pedido_recebido",
  "proposta_enviada",
  "opcao_escolhida",
  /* Legado. Antes da migração 0005 a etapa 2 nascia aberta e este era o estado
     de "o link está lá, falta o cliente preencher". Fica no vocabulário para os
     casos antigos que ainda o têm. */
  "detalhes_pendentes",
  "detalhes_recebidos",
  "pagamento_pendente",
  "pago",
  "emitido",
  "cancelado",
] as const

export type CaseStage = (typeof CASE_STAGES)[number]

/* As etiquetas longas de cada etapa estão em `caseStages.*`, e as curtas do
   vocabulário E0–E5 em `caseStageShort.*`. */

export const CASE_STAGE_STYLES: Record<CaseStage, string> = {
  novo: "bg-slate-100 text-slate-600 border-slate-200",
  pedido_recebido: "bg-orange-50 text-orange-700 border-orange-200",
  proposta_enviada: "bg-amber-50 text-amber-700 border-amber-200",
  opcao_escolhida: "bg-sky-50 text-sky-700 border-sky-200",
  detalhes_pendentes: "bg-amber-50 text-amber-700 border-amber-200",
  detalhes_recebidos: "bg-sky-50 text-sky-700 border-sky-200",
  pagamento_pendente: "bg-violet-50 text-violet-700 border-violet-200",
  pago: "bg-green-50 text-green-700 border-green-200",
  emitido: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelado: "bg-slate-100 text-slate-400 border-slate-200",
}

/*
 * The E0–E5 vocabulary from the back-office mockups.
 *
 * The mockup numbers the journey; the database names each state. Keeping both
 * means the screens can speak the language the team uses on the phone ("está em
 * E4") without collapsing eight distinct database states into six labels.
 *
 * `waiting` is the axis the whole list view is sorted and filtered by: whether
 * the next move belongs to us or to the client. It is the difference between a
 * queue you can work and a list you stare at.
 */
export type Waiting = "us" | "them" | "done" | "off"

export interface StageDisplay {
  code: string
  waiting: Waiting
}

export const CASE_STAGE_DISPLAY: Record<CaseStage, StageDisplay> = {
  novo: { code: "E0", waiting: "off" },
  pedido_recebido: { code: "E1", waiting: "us" },
  proposta_enviada: { code: "E2", waiting: "them" },
  opcao_escolhida: { code: "E3", waiting: "them" },
  detalhes_pendentes: { code: "E2", waiting: "them" },
  detalhes_recebidos: { code: "E3", waiting: "us" },
  pagamento_pendente: { code: "E4", waiting: "them" },
  pago: { code: "E4", waiting: "us" },
  emitido: { code: "E5", waiting: "done" },
  cancelado: { code: "—", waiting: "off" },
}

/** Dot colour for the waiting axis — see `.dot.us/.them/.done/.off` in A2/A3. */
export const WAITING_DOT: Record<Waiting, string> = {
  us: "bg-adm-ember",
  them: "bg-adm-warn",
  done: "bg-adm-ok",
  off: "bg-adm-muted",
}

export const CASE_STAGE_CHIP: Record<CaseStage, string> = {
  novo: "bg-adm-raise text-adm-txt-2",
  pedido_recebido: "bg-adm-ember/15 text-adm-ember",
  proposta_enviada: "bg-adm-warn/15 text-adm-warn",
  opcao_escolhida: "bg-adm-warn/15 text-adm-warn",
  detalhes_pendentes: "bg-adm-warn/15 text-adm-warn",
  detalhes_recebidos: "bg-adm-ember/15 text-adm-ember",
  pagamento_pendente: "bg-adm-warn/15 text-adm-warn",
  pago: "bg-adm-ember/15 text-adm-ember",
  emitido: "bg-adm-ok/15 text-adm-ok",
  cancelado: "bg-adm-raise text-adm-muted",
}

export type LinkStatus = "bloqueado" | "ativo" | "submetido" | "expirado"

/*
 * As etiquetas de `LinkStatus`, das etapas e dos estados de pagamento vivem
 * nos dicionários — `linkStatus.*`, `linkStages.*` e `paymentStatus.*`. Aqui
 * ficam só os valores que a base de dados guarda e as classes de cor, que não
 * mudam de língua.
 */

/**
 * Path segment appended to /p/{token} for each stage.
 *
 * A etapa 2 aponta para a proposta e não para os passaportes: desde a migração
 * 0005 o cliente escolhe a opção primeiro, e é a escolha que o leva ao
 * formulário. /passageiros continua a existir e a funcionar sozinho, mas não é
 * o endereço que se partilha.
 */
export const LINK_STAGE_PATHS: Record<number, string> = {
  1: "",
  2: "/proposta",
  3: "/pagamento",
}

export type PaymentStatus =
  | "STARTED"
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DISPUTED"

/** WeePay terminal states (manual §8.2) — no further transition expected. */
export const TERMINAL_PAYMENT_STATUSES: PaymentStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]

export interface CaseLinkRow {
  id: string
  stage: number
  status: LinkStatus
  unlocked_at: string | null
  first_opened_at: string | null
  submitted_at: string | null
  /** C-05 · último acesso real do cliente. Ver a migração 0014. */
  last_opened_at?: string | null
  open_count?: number | null
}

/**
 * C-05 · o estado do link como ele é, e não como uma coluna diz que é.
 *
 * O back-office mostrava um link fechado como aberto, e a causa é estrutural:
 * `case_links.status` é uma coluna gravada, e são cinco caminhos independentes
 * que a escrevem — a submissão do pedido, a publicação da proposta, a abertura
 * da janela de pagamento, a expiração e a reabertura. Cinco escritores e nenhum
 * dono é a definição de um valor que deriva: basta um caminho não correr, ou
 * correr fora de ordem, e a coluna passa a descrever um caso que já não existe.
 *
 * O critério do C-05 diz o que fazer — "derivado do estado real do caso, nunca
 * guardado à parte e deixado a divergir". Esta função é esse cálculo, e é ela
 * que os ecrãs leem. A coluna continua a existir porque é ela que autoriza o
 * cliente a entrar (ver `getCaseByToken`), e essa é uma decisão de segurança
 * que não deve depender de uma derivação; o que ela deixa de fazer é responder
 * à pergunta "este link está aberto?" no ecrã de quem atende.
 *
 * Quando as duas discordam, quem manda é o caso — e a discordância aparece, em
 * vez de ser resolvida em silêncio. Ver `linkStateDrifted`.
 */
export type LinkState = "bloqueado" | "aberto" | "submetido" | "expirado" | "fechado"

export function deriveLinkState(input: {
  stage: number
  stored: LinkStatus
  submittedAt: string | null
  /** A etapa do caso, de `booking_cases.stage`. */
  caseStage: CaseStage
  /** C-04 · um caso fechado não tem links abertos. */
  closed: boolean
}): LinkState {
  if (input.closed) return "fechado"
  if (input.caseStage === "cancelado") return "fechado"

  /* Submetido é um facto, não um estado a recalcular: o cliente entregou o que
     este link pedia, e nada o desfaz. */
  if (input.submittedAt || input.stored === "submetido") return "submetido"

  const reached = STAGE_REACHED[input.caseStage] ?? 0

  /* O caso já passou por esta etapa sem a submeter: o link cumpriu o que tinha
     para cumprir e não é uma porta aberta. É este o caso que aparecia "aberto".  */
  if (reached > input.stage) return "submetido"

  if (reached < input.stage) return "bloqueado"

  if (input.stored === "expirado") return "expirado"
  return "aberto"
}

/**
 * Até que etapa do link o caso já chegou.
 *
 * 1 é o pedido, 2 a proposta, 3 o pagamento — ver `LINK_STAGE_PATHS`.
 */
const STAGE_REACHED: Record<CaseStage, number> = {
  novo: 1,
  pedido_recebido: 1,
  proposta_enviada: 2,
  opcao_escolhida: 2,
  detalhes_pendentes: 2,
  detalhes_recebidos: 2,
  pagamento_pendente: 3,
  pago: 3,
  emitido: 3,
  cancelado: 3,
}

/** Verdadeiro quando a coluna gravada e o estado real não dizem o mesmo. */
export function linkStateDrifted(stored: LinkStatus, derived: LinkState): boolean {
  if (derived === "aberto") return stored !== "ativo"
  if (derived === "fechado") return false
  return stored !== derived
}

/*
 * 'infant_seat' e 'infant_lap' vieram com a migração 0009: um bebé com assento
 * ocupa lugar e paga tarifa de criança, um bebé no colo não. 'infant' fica no
 * vocabulário porque é o que as linhas antigas têm.
 */
export type PassengerType =
  | "adult"
  | "child"
  | "infant"
  | "infant_seat"
  | "infant_lap"

export interface CasePassenger {
  id: string
  position: number
  passenger_type: PassengerType
  first_name: string
  last_name: string
  gender: string | null
  birth_date: string | null
  nationality: string | null
  passport_number: string | null
  passport_expiry: string | null
  /* Migração 0009 — o que a emissão pede e a tabela não tinha. */
  title?: string | null
  issuing_country?: string | null
  ticket_number?: string | null
  seat_outbound?: string | null
  seat_inbound?: string | null
}

export interface CasePayment {
  id: string
  amount: number
  currency: string
  description: string | null
  status: PaymentStatus
  payment_url: string | null
  weepay_transaction_id: string | null
  paid_at: string | null
  created_at: string
  /* Migração 0006. O cliente carregou em "Já paguei" — uma declaração, não uma
     confirmação; ver o comentário em declarePaid(). */
  client_declared_paid_at: string | null
  last_checked_at: string | null
  failure_reason: string | null
}

/**
 * "3h 41m", "2d 04h", "14d" — the mockup's "sem mexer há" column.
 *
 * Coarser as it gets older, because the difference between 9 and 14 days does
 * not change what anyone does, while the difference between 40m and 3h does.
 */
export function elapsedSince(iso: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}m`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${String(mins % 60).padStart(2, "0")}m`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ${String(hours % 24).padStart(2, "0")}h`
  return `${days}d`
}

/** Amount is stored in minor units (WeePay convention). */
export function formatAmount(minorUnits: number, currency: string): string {
  const major = minorUnits / 100
  return `${major.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}
