/**
 * PRO-10 · os motivos para arquivar um caso.
 *
 * Sem imports de servidor: lido pela ficha do caso (cliente), pela fila e pela
 * server action. A lista tem de bater com a restrição da migração 0023.
 */

export const ARCHIVE_REASONS = [
  "fechado_fora_plataforma",
  "cliente_desistiu",
  "sem_resposta",
  "duplicado",
  "outro",
] as const

export type ArchiveReason = (typeof ARCHIVE_REASONS)[number]

/** Inclui `emitido`, que é o fecho normal do C-04 e não se escolhe aqui. */
export const CLOSED_REASON_LABEL_PT: Record<string, string> = {
  emitido: "Emitido",
  fechado_fora_plataforma: "Fechado fora da plataforma",
  cliente_desistiu: "O cliente desistiu",
  sem_resposta: "Cliente sem resposta",
  duplicado: "Pedido duplicado",
  outro: "Outro motivo",
}
