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
}

export interface CasePassenger {
  id: string
  position: number
  passenger_type: "adult" | "child" | "infant"
  first_name: string
  last_name: string
  gender: string | null
  birth_date: string | null
  nationality: string | null
  passport_number: string | null
  passport_expiry: string | null
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
