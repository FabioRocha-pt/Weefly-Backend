/**
 * C-14 · os alertas do back-office, e quais deles cada pessoa já viu.
 *
 * A campainha do topbar era decorativa. Este módulo é o que a torna verdadeira,
 * e a decisão que o desenha é qual a pergunta que ela responde:
 *
 *   **"o que aconteceu do lado do cliente que eu ainda não vi?"**
 *
 * Não é o registo de entrega (`case_notifications`) — esse conta o caminho
 * inverso, o que nós lhe mandámos, e vive na aba Comunicações do caso. Não é o
 * registo completo (`case_events` inteiro) — esse tem as acções da própria
 * equipa, e uma campainha que se acende quando o agente grava uma nota é uma
 * campainha que ele aprende a ignorar.
 *
 * São os acontecimentos com `actor_kind` de cliente ou de sistema: ele escolheu,
 * submeteu, pagou, cancelou; ou o prazo expirou sozinho. É a lista do C-32,
 * palavra por palavra.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"

/** Quantos alertas a campainha carrega. Mais do que isto ninguém lê. */
const ALERT_LIMIT = 40

export interface BoAlert {
  id: string
  caseId: string
  kind: string
  title: string
  detail: string | null
  actorEmail: string | null
  actorKind: "client" | "staff" | "system"
  createdAt: string
  unread: boolean
  /** A referência do caso, para a entrada dizer de quem é. */
  reference: string | null
  clientName: string | null
  /** Quantas vezes este acontecimento se repetiu neste caso. 1 = uma só. */
  repeated: number
}

/*
 * Os acontecimentos que valem uma campainha.
 *
 * Escrito à mão e não "tudo o que o cliente fez": `client_notified` tem
 * `actor_kind` de sistema e é o nosso próprio email a sair, o que faria a
 * campainha acender-se com aquilo que o agente acabou de mandar.
 */
const ALERT_KINDS = [
  "request_submitted",
  "offer_selected",
  "passengers_submitted",
  "pay_method_chosen",
  "proof_uploaded",
  "client_declared_paid",
  "request_cancelled",
  "payment_expired",
]

export interface BoAlertFeed {
  alerts: BoAlert[]
  unread: number
}

export async function loadBoAlerts(userId: string): Promise<BoAlertFeed> {
  const admin = createAdminClient()
  if (!admin) return { alerts: [], unread: 0 }

  const { data: rows, error } = await admin
    .from("case_events")
    .select(
      `id, case_id, kind, title, detail, actor_email, actor_kind, created_at,
       booking_case:booking_cases (
         trip_request:trip_requests ( reference, lead:leads ( full_name ) )
       )`
    )
    .in("kind", ALERT_KINDS)
    .order("created_at", { ascending: false })
    .limit(ALERT_LIMIT)

  if (error) {
    console.error("[bo/alerts] leitura falhou:", error.message)
    return { alerts: [], unread: 0 }
  }

  const events = (rows ?? []) as Record<string, any>[]
  if (events.length === 0) return { alerts: [], unread: 0 }

  /* As marcas desta pessoa, num pedido só. */
  const { data: readRows } = await admin
    .from("bo_alert_reads")
    .select("event_id")
    .eq("user_id", userId)
    .in(
      "event_id",
      events.map((e) => String(e.id))
    )

  const read = new Set(
    ((readRows ?? []) as { event_id: string }[]).map((r) => r.event_id)
  )

  const unwrap = (value: unknown): Record<string, any> | null =>
    Array.isArray(value) ? (value[0] ?? null) : ((value ?? null) as any)

  /*
   * Um caso encravado não afoga a campainha.
   *
   * Descoberto ao olhar para os dados reais: um pagamento em STARTED escrevia
   * `payment_expired` a cada passagem do cron, e ficou com 292 linhas — 79% de
   * todos os eventos do sistema. A causa está corrigida em `enforceExpiry`, mas
   * as linhas que já existem não desaparecem, e a próxima causa parecida também
   * não vai avisar antes de acontecer.
   *
   * Por isso a campainha colapsa: de cada par (caso, tipo) fica a ocorrência
   * **mais recente**, com a contagem ao lado. É a leitura certa mesmo sem o
   * defeito — "o cliente enviou comprovativo" três vezes é uma notícia com um
   * número, não três notícias.
   *
   * Os acontecimentos ficam todos no registo do caso, que é onde se vai ver o
   * histórico completo. O que se colapsa é o aviso.
   */
  const newestByKey = new Map<string, Record<string, any>>()
  const repeats = new Map<string, number>()

  for (const event of events) {
    const key = `${event.case_id}:${event.kind}`
    repeats.set(key, (repeats.get(key) ?? 0) + 1)
    /* Os eventos vêm do mais recente para o mais antigo, pelo que o primeiro de
       cada chave é o que fica. */
    if (!newestByKey.has(key)) newestByKey.set(key, event)
  }

  /* `Array.from` e não spread: o `target` do tsconfig não itera Maps. */
  const collapsed = Array.from(newestByKey.values())

  const alerts: BoAlert[] = collapsed.map((event) => {
    const trip = unwrap(unwrap(event.booking_case)?.trip_request)
    const lead = unwrap(trip?.lead)
    return {
      id: String(event.id),
      caseId: String(event.case_id),
      kind: String(event.kind),
      title: String(event.title),
      detail: (event.detail as string | null) ?? null,
      actorEmail: (event.actor_email as string | null) ?? null,
      actorKind: (event.actor_kind as BoAlert["actorKind"]) ?? "system",
      createdAt: String(event.created_at),
      unread: !read.has(String(event.id)),
      reference: (trip?.reference as string | null) ?? null,
      clientName: (lead?.full_name as string | null) ?? null,
      repeated: repeats.get(`${event.case_id}:${event.kind}`) ?? 1,
    }
  })

  return { alerts, unread: alerts.filter((a) => a.unread).length }
}

/**
 * Marca alertas como vistos por esta pessoa.
 *
 * `upsert` e não `insert`: abrir a campainha duas vezes é o gesto normal, e a
 * segunda não deve dar erro de chave duplicada. `ignoreDuplicates` mantém a
 * hora da **primeira** leitura, que é a que interessa.
 */
export async function markAlertsRead(
  userId: string,
  eventIds: string[]
): Promise<void> {
  if (eventIds.length === 0) return

  const admin = createAdminClient()
  if (!admin) return

  const { error } = await admin.from("bo_alert_reads").upsert(
    eventIds.map((id) => ({ user_id: userId, event_id: id })),
    { onConflict: "user_id,event_id", ignoreDuplicates: true }
  )

  if (error) console.error("[bo/alerts] marcação falhou:", error.message)
}
