/**
 * WeeFly — o registo do caso.
 *
 * A aba "Registo" do back-office é a resposta à pergunta que se faz quando algo
 * corre mal: quem fez o quê, e quando. Escrever aqui é best-effort de propósito
 * — um registo que falha nunca pode desfazer a ação que estava a registar.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"

export type EventActor = "client" | "staff" | "system"

export interface CaseEvent {
  id: string
  case_id: string
  kind: string
  title: string
  detail: string | null
  actor_email: string | null
  actor_kind: EventActor
  payload: Record<string, unknown> | null
  created_at: string
}

/** O código do Postgres para "já existe uma linha com esta chave". */
const UNIQUE_VIOLATION = "23505"

/**
 * T-22 · escreve o acontecimento, e devolve se ele era mesmo novo.
 *
 * `once` é a chave que a migração 0019 protege com um índice único por caso.
 * Passá-la muda o contrato desta função de "escreve sempre" para "escreve a
 * primeira vez", e quem chama fica a saber qual das duas aconteceu — porque um
 * aviso que se segue a um acontecimento repetido também não deve sair.
 *
 * Quem decide é a base de dados e não uma leitura anterior: duas passagens
 * simultâneas do cron chegam aqui ao mesmo tempo, e uma leitura-depois-escrita
 * deixaria passar as duas. Era exactamente esse o defeito — `O prazo de
 * pagamento expirou ×22`.
 */
export async function logCaseEvent(input: {
  caseId: string
  kind: string
  title: string
  detail?: string | null
  actorId?: string | null
  actorEmail?: string | null
  actorKind?: EventActor
  payload?: Record<string, unknown> | null
  /**
   * A chave que faz deste acontecimento um acontecimento único no caso.
   * `true` usa o próprio `kind` — "o prazo expirou" é um facto por caso.
   * Uma string permite qualificá-lo: `payment_expired:{paymentId}`.
   */
  once?: boolean | string
}): Promise<{ written: boolean }> {
  const admin = createAdminClient()
  if (!admin) return { written: false }

  const dedupeKey =
    input.once === true ? input.kind : typeof input.once === "string" ? input.once : null

  const { error } = await admin.from("case_events").insert({
    case_id: input.caseId,
    kind: input.kind,
    title: input.title,
    detail: input.detail ?? null,
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    actor_kind: input.actorKind ?? "system",
    payload: input.payload ?? null,
    dedupe_key: dedupeKey,
  })

  if (!error) return { written: true }

  if (error.code === UNIQUE_VIOLATION) {
    /* Não é um erro: é a regra a funcionar. O acontecimento já lá está. */
    return { written: false }
  }

  console.error("[case-events] registo falhou:", error.message)
  return { written: false }
}

export async function listCaseEvents(
  caseId: string,
  limit = 60
): Promise<CaseEvent[]> {
  const admin = createAdminClient()
  if (!admin) return []

  const { data } = await admin
    .from("case_events")
    .select("id, case_id, kind, title, detail, actor_email, actor_kind, payload, created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(limit)

  return (data ?? []) as CaseEvent[]
}
