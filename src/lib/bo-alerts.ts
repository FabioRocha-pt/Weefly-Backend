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
import { getBoScope } from "@/lib/bo-scope"

/*
 * PRO-11 · a janela.
 *
 * Eram os últimos 40 acontecimentos, e um aviso por ler saía do painel — e do
 * contador — só porque chegaram outros 40 depois dele. Agora a janela é larga
 * (os acontecimentos colapsam por caso e tipo, pelo que 400 linhas dão muito
 * menos entradas) e o que se mostra é: tudo o que está por ler, e os lidos que
 * ainda não foram limpos.
 */
const EVENT_WINDOW = 400
/** Quantas entradas o painel desenha. As por ler vêm sempre primeiro. */
const PANEL_LIMIT = 60

export interface BoAlert {
  id: string
  caseId: string
  kind: string
  title: string
  detail: string | null
  actorEmail: string | null
  actorKind: "client" | "staff" | "system" | "secretary"
  createdAt: string
  unread: boolean
  /** A referência do caso, para a entrada dizer de quem é. */
  reference: string | null
  clientName: string | null
  /** Quantas vezes este acontecimento se repetiu neste caso. 1 = uma só. */
  repeated: number
  /** Todos os acontecimentos colapsados nesta entrada — marcá-la lida marca-os
      a todos, senão o mais antigo voltava a acender a campainha. */
  eventIds: string[]
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
  /* T-18 · a mensagem que o cliente escreve no ecrã de pagamento. */
  "client_message",
  "request_cancelled",
  "payment_expired",
  /* MIN-07 · a bolsa do ministério não cobre a opção que a secretária aceitou. */
  "ministry_insufficient_funds",
  /* MIN-07 · passageiros completos num ministério: falta o pagamento externo. */
  "ministry_ready_to_issue",
]

export interface BoAlertFeed {
  alerts: BoAlert[]
  unread: number
}

export async function loadBoAlerts(userId: string): Promise<BoAlertFeed> {
  const all = await buildFeed(userId)
  const unreadFirst = [
    ...all.filter((a) => a.unread),
    ...all.filter((a) => !a.unread),
  ].slice(0, PANEL_LIMIT)
  /* Por ler primeiro, e dentro de cada metade do mais recente para o mais
     antigo — a ordem da query. */
  return { alerts: unreadFirst, unread: all.filter((a) => a.unread).length }
}

/** Uma coluna que a base ainda não tem: a migração 0021 por aplicar. */
function isMissingColumn(error: { code?: string; message?: string } | null) {
  return (
    !!error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /cleared_at/.test(error.message ?? ""))
  )
}

async function buildFeed(userId: string): Promise<BoAlert[]> {
  const admin = createAdminClient()
  const scope = await getBoScope()
  if (!admin || !scope) return []

  /*
   * TEN-03 · A8 · a campainha de uma conta do Alô não acende com casos da
   * WeeFly. Lida pelo cliente da sessão (o RLS decide) e pelo parceiro dela,
   * que chega ao acontecimento pelo caso — `!inner`, para que um acontecimento
   * sem caso visível não venha.
   */
  let query = scope.db
    .from("case_events")
    .select(
      `id, case_id, kind, title, detail, actor_email, actor_kind, created_at,
       booking_case:booking_cases!inner (
         partner_id,
         trip_request:trip_requests ( reference, lead:leads ( full_name ) )
       )`
    )
    .in("kind", ALERT_KINDS)
    .order("created_at", { ascending: false })
    .limit(EVENT_WINDOW)
  if (scope.partnerId) query = query.eq("booking_case.partner_id", scope.partnerId)

  const { data: rows, error } = await query

  if (error) {
    console.error("[bo/alerts] leitura falhou:", error.message)
    return []
  }

  const events = (rows ?? []) as Record<string, any>[]
  if (events.length === 0) return []

  /*
   * As marcas desta pessoa. Por data e não por uma lista de ids: 400 uuids num
   * `in(...)` fazem um URL de 15 KB. Uma marca é sempre posterior ao
   * acontecimento que marca, pelo que "lidas desde o acontecimento mais antigo
   * da janela" apanha todas as que interessam.
   */
  const oldest = String(events[events.length - 1].created_at)
  let readRows: { event_id: string; cleared_at?: string | null }[] = []
  {
    const withCleared = await admin
      .from("bo_alert_reads")
      .select("event_id, cleared_at")
      .eq("user_id", userId)
      .gte("read_at", oldest)
    if (!withCleared.error) {
      readRows = (withCleared.data ?? []) as typeof readRows
    } else if (isMissingColumn(withCleared.error)) {
      const plain = await admin
        .from("bo_alert_reads")
        .select("event_id")
        .eq("user_id", userId)
        .gte("read_at", oldest)
      readRows = (plain.data ?? []) as typeof readRows
    } else {
      console.error("[bo/alerts] marcas falharam:", withCleared.error.message)
    }
  }

  const read = new Set(readRows.map((r) => r.event_id))
  const cleared = new Set(
    readRows.filter((r) => r.cleared_at).map((r) => r.event_id)
  )

  const unwrap = (value: unknown): Record<string, any> | null =>
    Array.isArray(value) ? (value[0] ?? null) : ((value ?? null) as any)

  /*
   * Um caso encravado não afoga a campainha.
   *
   * Descoberto ao olhar para os dados reais: um pagamento em STARTED escrevia
   * `payment_expired` a cada passagem do cron, e ficou com 292 linhas. Por isso
   * a campainha colapsa: de cada par (caso, tipo) fica a ocorrência **mais
   * recente**, com a contagem ao lado, e a entrada leva os ids de todas — lida
   * uma, lidas todas.
   *
   * Os limpos (PRO-12) saem antes de colapsar: só se limpa o que já foi lido,
   * e um acontecimento novo do mesmo par volta a aparecer, por ler.
   */
  const groups = new Map<string, { newest: Record<string, any>; ids: string[] }>()

  for (const event of events) {
    const id = String(event.id)
    if (cleared.has(id)) continue
    const key = `${event.case_id}:${event.kind}`
    const group = groups.get(key)
    /* Os eventos vêm do mais recente para o mais antigo, pelo que o primeiro de
       cada chave é o que fica. */
    if (group) group.ids.push(id)
    else groups.set(key, { newest: event, ids: [id] })
  }

  /* `Array.from` e não spread: o `target` do tsconfig não itera Maps. */
  return Array.from(groups.values()).map(({ newest: event, ids }) => {
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
      unread: ids.some((id) => !read.has(id)),
      reference: (trip?.reference as string | null) ?? null,
      clientName: (lead?.full_name as string | null) ?? null,
      repeated: ids.length,
      eventIds: ids,
    }
  })
}

/**
 * Marca alertas como vistos por esta pessoa.
 *
 * `upsert` e não `insert`: clicar duas vezes no mesmo aviso é o gesto normal, e
 * o segundo não deve dar erro de chave duplicada. `ignoreDuplicates` mantém a
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

/** PRO-12 · "Marcar todas como lidas": tudo o que está por ler na janela. */
export async function markAllAlertsRead(userId: string): Promise<number> {
  const all = await buildFeed(userId)
  const ids = all.filter((a) => a.unread).flatMap((a) => a.eventIds)
  await markAlertsRead(userId, ids)
  return ids.length
}

/**
 * PRO-12 · "Limpar": retira do painel os avisos já lidos.
 *
 * Não apaga a marca de leitura — apagá-la faria o aviso voltar como novo. Põe
 * `cleared_at` (migração 0021). Os por ler não se tocam: limpar não é ler.
 */
export async function clearReadAlerts(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Base de dados indisponível." }

  const { error } = await admin
    .from("bo_alert_reads")
    .update({ cleared_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("cleared_at", null)

  if (!error) return { ok: true }
  if (isMissingColumn(error)) {
    return {
      ok: false,
      error: "Limpar precisa da migração 0021, que ainda não está aplicada.",
    }
  }
  console.error("[bo/alerts] limpar falhou:", error.message)
  return { ok: false, error: "Não foi possível limpar os avisos." }
}
