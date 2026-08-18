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

export async function logCaseEvent(input: {
  caseId: string
  kind: string
  title: string
  detail?: string | null
  actorId?: string | null
  actorEmail?: string | null
  actorKind?: EventActor
  payload?: Record<string, unknown> | null
}): Promise<void> {
  const admin = createAdminClient()
  if (!admin) return

  const { error } = await admin.from("case_events").insert({
    case_id: input.caseId,
    kind: input.kind,
    title: input.title,
    detail: input.detail ?? null,
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    actor_kind: input.actorKind ?? "system",
    payload: input.payload ?? null,
  })

  if (error) console.error("[case-events] registo falhou:", error.message)
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
