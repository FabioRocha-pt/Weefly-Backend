/**
 * WeeFly · FILA-02 · as cores do tempo de espera.
 *
 * "Cada entrada da fila tem uma cor suave pelo tempo de espera." (decisão do
 * Ivandro, 20 de novembro)
 *
 *   até 1 hora            verde suave      Acabou de chegar
 *   de 1 a 10 horas       laranja suave    A aguardar
 *   de 10 horas a 3 dias  vermelho suave   Atrasado
 *   mais de 3 dias        vermelho forte   Crítico
 *
 * A regra vive aqui e só aqui: as cinco filas (Concierge, Público, VIP,
 * Ministérios e a do master) leem-na do mesmo sítio, e a cor nunca aparece sem
 * o tempo escrito ao lado (`waitAgo`).
 *
 * Sem imports de servidor: os relógios correm no browser.
 */

export type WaitLevel = "fresh" | "waiting" | "late" | "critical"
export const WAIT_LEVELS: readonly WaitLevel[] = ["fresh", "waiting", "late", "critical"]

const HOUR = 3_600_000

/** Os limites da tabela, em milissegundos de espera. */
export const WAIT_LIMITS = { waiting: HOUR, late: 10 * HOUR, critical: 72 * HOUR } as const

/** O que a regra precisa de saber de uma entrada da fila. */
export interface WaitSubject {
  submittedAt: string
  state: string
  closedAt: string | null
  /** Quem tem a bola (`BO_STATE_WAITING`). Só a proposta D-E o usará. */
  waiting?: string
}

/** Os estados em que já não há espera nenhuma: a entrada não leva cor. */
const SETTLED = new Set(["emitido", "fechado", "cancelado", "expirado"])

/**
 * O relógio de uma entrada: desde quando conta, e se está parado. Nulo quando
 * a entrada já não espera por nada (emitida, fechada, cancelada, expirada).
 *
 * **D-E está por decidir** ("só conta enquanto a próxima ação é da equipa; à
 * espera do cliente a entrada fica cinzenta e o relógio para"). Até haver
 * resposta, conta desde que o pedido entrou, as 24 horas do dia, para todas as
 * entradas em aberto. Quando for aprovada, é esta função que muda, e mais
 * nenhuma: `paused` passa a ser `subject.waiting === "them"`, e `since` o
 * instante em que a bola voltou para a equipa.
 */
export function waitClock(subject: WaitSubject): { since: string; paused: boolean } | null {
  if (subject.closedAt || SETTLED.has(subject.state)) return null
  return { since: subject.submittedAt, paused: false }
}

/** Desde quando a entrada leva cor; nulo quando não leva (fechada ou parada). */
export function waitSince(subject: WaitSubject): string | null {
  const clock = waitClock(subject)
  return clock && !clock.paused ? clock.since : null
}

export function waitLevel(elapsedMs: number): WaitLevel {
  if (elapsedMs > WAIT_LIMITS.critical) return "critical"
  if (elapsedMs > WAIT_LIMITS.late) return "late"
  if (elapsedMs > WAIT_LIMITS.waiting) return "waiting"
  return "fresh"
}

/**
 * O tempo escrito: a chave do dicionário e a contagem ("há 45 min", "há 3 h",
 * "há 2 dias"). Minutos até uma hora, horas até dois dias, dias a partir daí:
 * o grão que ainda muda o que alguém faz.
 */
export function waitAgo(elapsedMs: number): {
  key: "bo.wait.ago.min" | "bo.wait.ago.hour" | "bo.wait.ago.day"
  count: number
} {
  const mins = Math.max(0, Math.floor(elapsedMs / 60_000))
  if (mins < 60) return { key: "bo.wait.ago.min", count: mins }
  const hours = Math.floor(mins / 60)
  if (hours < 48) return { key: "bo.wait.ago.hour", count: hours }
  return { key: "bo.wait.ago.day", count: Math.floor(hours / 24) }
}

/**
 * As cores. Suaves, por cima de qualquer fundo (a fila do Concierge é escura,
 * as do WeeFly Pro são claras): o fundo da linha é uma transparência, e a
 * etiqueta tem fundo próprio para se ler nos dois. Só o crítico é forte.
 */
export const WAIT_STYLE: Record<WaitLevel, { row: string; edge: string; chipBg: string; chipFg: string }> = {
  fresh: { row: "rgba(34,197,94,0.09)", edge: "#86efac", chipBg: "#dcfce7", chipFg: "#166534" },
  waiting: { row: "rgba(249,115,22,0.10)", edge: "#fdba74", chipBg: "#ffedd5", chipFg: "#9a3412" },
  late: { row: "rgba(239,68,68,0.10)", edge: "#fca5a5", chipBg: "#fee2e2", chipFg: "#991b1b" },
  critical: { row: "rgba(220,38,38,0.24)", edge: "#dc2626", chipBg: "#dc2626", chipFg: "#ffffff" },
}

/**
 * A regra que o filtro dos críticos liga (`WaitFilter`): com a marca no
 * contentor da fila, só ficam as linhas críticas. Aqui, e não no componente,
 * porque quem a escreve na página é um componente de servidor.
 */
export const WAIT_FILTER_CSS =
  '[data-wait-only="critical"] tr[data-wait]:not([data-wait="critical"]){display:none}'
