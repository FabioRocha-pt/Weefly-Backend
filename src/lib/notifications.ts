/**
 * NT-06 · a única porta por onde a WeeFly fala com alguém.
 *
 * Antes deste módulo cada sítio compunha o seu email e chamava o Resend
 * directamente: `lib/emails/send.ts` tinha um `send()`, `actions/proposals.ts`
 * tinha outro, e nenhum dos dois deixava rasto. Um email saía e mais ninguém
 * ficava a saber se tinha chegado — que é, palavra por palavra, a diferença que
 * o backlog aponta entre uma notificação e uma esperança.
 *
 * O que passa por aqui:
 *
 *   · **fica registado antes de sair.** A linha em `case_notifications` nasce em
 *     `queued`, e é ela que existe mesmo quando o envio falha. A ordem importa:
 *     escrever depois do envio perdia exactamente os casos que interessam.
 *   · **é tentado outra vez.** Três tentativas com espera crescente. Um 5xx do
 *     fornecedor é quase sempre um segundo mau, não um email impossível.
 *   · **uma falha permanente levanta bandeira no caso.** Não num log que
 *     ninguém lê: numa coluna que a ficha do caso mostra.
 *   · **um acontecimento não avisa duas vezes** (NT-04). A `dedupeKey` e o
 *     índice único da migração 0013 tratam disso — e a corrida entre dois
 *     pedidos simultâneos também, porque quem decide é a base de dados.
 *
 * O que NÃO passa por aqui: nada. Se um envio novo não usar `notify`, ele não
 * existe para o back-office.
 *
 * SÓ SERVIDOR.
 */

import { Resend } from "resend"

import { createAdminClient } from "@/utils/supabase/admin"
import { sendWhatsApp, type WhatsAppOutcome } from "@/lib/whatsapp"

export type NotifyChannel = "email" | "whatsapp"
export type NotifyAudience = "client" | "team" | "agent"
export type NotifyStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed"
  | "skipped"

export interface CaseNotification {
  id: string
  case_id: string
  channel: NotifyChannel
  kind: string
  audience: NotifyAudience
  recipient: string
  locale: string | null
  subject: string | null
  body: string | null
  status: NotifyStatus
  attempts: number
  provider: string | null
  provider_message_id: string | null
  last_error: string | null
  client_visible: boolean
  actor_email: string | null
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
}

export interface NotifyAttachment {
  filename: string
  content: Buffer
}

export interface NotifyInput {
  caseId: string
  channel: NotifyChannel
  kind: string
  audience: NotifyAudience
  /** Um endereço, ou vários quando o destinatário é a equipa. */
  to: string | string[] | null | undefined
  locale?: string | null
  subject?: string
  html?: string
  text?: string
  /** NT-07 · o texto que uma pessoa escreveu, guardado tal e qual. */
  body?: string | null
  replyTo?: string
  attachments?: NotifyAttachment[]
  /** NT-04 · a chave que impede o segundo aviso do mesmo acontecimento. */
  dedupeKey?: string
  /** NT-07 · aparece como alerta no link do cliente. */
  clientVisible?: boolean
  actorId?: string | null
  actorEmail?: string | null
}

export type NotifyOutcome =
  | { ok: true; id: string; status: "sent" }
  | {
      ok: false
      id: string | null
      status: "skipped" | "failed" | "duplicate"
      reason: string
    }

const UNIQUE_VIOLATION = "23505"

/** Três tentativas: a primeira, e duas para o segundo mau do fornecedor. */
const MAX_ATTEMPTS = 3
const BACKOFF_MS = [0, 500, 1500]

const NOTIFICATION_COLUMNS = `
  id, case_id, channel, kind, audience, recipient, locale, subject, body,
  status, attempts, provider, provider_message_id, last_error, client_visible,
  actor_email, created_at, sent_at, delivered_at, failed_at
`

const FROM = () =>
  process.env.CONCIERGE_FROM_EMAIL ??
  "WeeFly Concierge <onboarding@resend.dev>"

const TEAM_FALLBACK = ["info@weefly.africa", "info@weefly.cv"]

/** Os endereços da equipa, da configuração ou do que sempre foram. */
export function teamRecipients(): string[] {
  const configured = (process.env.CONCIERGE_TEAM_EMAIL ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
  return configured.length > 0 ? configured : TEAM_FALLBACK
}

const sleep = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

const list = (to: NotifyInput["to"]): string[] =>
  (Array.isArray(to) ? to : [to])
    .map((address) => (address ?? "").trim())
    .filter(Boolean)

// ── o envio ──────────────────────────────────────────────────────────────────

/**
 * Envia e regista. Devolve sempre — nunca atira.
 *
 * Um aviso é uma notícia sobre uma coisa que já aconteceu: falhar não desfaz o
 * pagamento, a publicação nem a emissão. Quem chama esta função decide se o
 * insucesso merece uma frase no ecrã; o que não pode é ficar sem saber.
 */
export async function notify(input: NotifyInput): Promise<NotifyOutcome> {
  const admin = createAdminClient()
  if (!admin) {
    console.error("[notify] sem service role — %s não saiu.", input.kind)
    return { ok: false, id: null, status: "failed", reason: "unavailable" }
  }

  const recipients = list(input.to)

  const row = {
    case_id: input.caseId,
    channel: input.channel,
    kind: input.kind,
    audience: input.audience,
    recipient: recipients.join(", ") || "—",
    locale: input.locale ?? null,
    subject: input.subject ?? null,
    body: input.body ?? null,
    dedupe_key: input.dedupeKey ?? null,
    client_visible: input.clientVisible ?? false,
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    provider: input.channel === "email" ? "resend" : "whatsapp",
    status: "queued" as NotifyStatus,
  }

  const inserted = await admin
    .from("case_notifications")
    .insert(row)
    .select("id")
    .single()

  if (inserted.error) {
    /*
     * NT-04 · o segundo aviso do mesmo acontecimento bate no índice único.
     *
     * Não é um erro: é a regra a funcionar. Publicar duas vezes a mesma revisão,
     * ou dois cliques no mesmo botão, dão um aviso só.
     */
    if (inserted.error.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        id: null,
        status: "duplicate",
        reason: "já foi enviado um aviso para este acontecimento",
      }
    }
    console.error("[notify] registo falhou:", inserted.error.message)
    return { ok: false, id: null, status: "failed", reason: "log_failed" }
  }

  const id = inserted.data.id as string

  // Sem destinatário não há envio, e isso é uma resposta — não uma falha nossa.
  if (recipients.length === 0) {
    await close(id, "skipped", { error: "sem destinatário" })
    return {
      ok: false,
      id,
      status: "skipped",
      reason: "sem destinatário",
    }
  }

  let lastError = ""

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(BACKOFF_MS[attempt - 1] ?? 0)

    const result =
      input.channel === "email"
        ? await deliverEmail(recipients, input)
        : await deliverWhatsApp(recipients, input)

    if (result.ok) {
      await close(id, "sent", { attempts: attempt, messageId: result.messageId })
      return { ok: true, id, status: "sent" }
    }

    lastError = result.error

    // Um endereço inválido não melhora à terceira tentativa.
    if (result.permanent) {
      await close(id, "bounced", { attempts: attempt, error: result.error })
      await raiseFlag(input, result.error)
      return { ok: false, id, status: "failed", reason: result.error }
    }

    if (result.skip) {
      await close(id, "skipped", { attempts: attempt, error: result.error })
      return { ok: false, id, status: "skipped", reason: result.error }
    }
  }

  await close(id, "failed", { attempts: MAX_ATTEMPTS, error: lastError })
  await raiseFlag(input, lastError)
  return { ok: false, id, status: "failed", reason: lastError }
}

interface Delivery {
  ok: boolean
  messageId?: string | null
  error: string
  /** Recusado de forma definitiva: não vale a pena repetir. */
  permanent?: boolean
  /** Não havia por onde enviar. Também não vale a pena repetir. */
  skip?: boolean
}

async function deliverEmail(
  to: string[],
  input: NotifyInput
): Promise<Delivery> {
  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      error: "RESEND_API_KEY não está definida",
      skip: true,
    }
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { data, error } = await resend.emails.send({
      from: FROM(),
      to,
      subject: input.subject ?? "WeeFly",
      html: input.html ?? "",
      text: input.text ?? "",
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      ...(input.attachments?.length
        ? {
            attachments: input.attachments.map((file) => ({
              filename: file.filename,
              content: file.content,
            })),
          }
        : {}),
    })

    if (error) {
      const message = `${error.name ?? "erro"}: ${error.message ?? ""}`.trim()
      /* `validation_error` é o endereço a não servir; repetir dava o mesmo. */
      return {
        ok: false,
        error: message,
        permanent: error.name === "validation_error",
      }
    }

    return { ok: true, messageId: data?.id ?? null, error: "" }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function deliverWhatsApp(
  to: string[],
  input: NotifyInput
): Promise<Delivery> {
  /*
   * O WhatsApp leva texto e não HTML. `body` é o que uma pessoa escreveu
   * (NT-07); nos avisos automáticos usa-se a versão de texto do email, que é
   * exactamente a mesma notícia escrita para ser lida sem formatação.
   */
  const message = (input.body ?? input.text ?? input.subject ?? "").trim()
  if (!message) return { ok: false, error: "mensagem vazia", skip: true }

  const outcome: WhatsAppOutcome = await sendWhatsApp({
    to,
    message,
  })

  if (outcome.ok) return { ok: true, messageId: outcome.messageId, error: "" }
  return {
    ok: false,
    error: outcome.error,
    skip: outcome.reason === "not_configured" || outcome.reason === "no_number",
    permanent: outcome.reason === "invalid_number",
  }
}

async function close(
  id: string,
  status: NotifyStatus,
  extra: { attempts?: number; messageId?: string | null; error?: string }
): Promise<void> {
  const admin = createAdminClient()
  if (!admin) return

  const now = new Date().toISOString()

  /*
   * NT-04 · a chave de duplicado só sobrevive a um envio que aconteceu.
   *
   * A regra é "sem notificação duplicada para o mesmo acontecimento", e um
   * envio que não saiu não é uma notificação. Deixar a chave numa linha
   * `skipped` ou `failed` transformava a regra numa armadilha: o primeiro envio
   * falha porque a chave de API ainda não está no ambiente, e a partir daí
   * nenhuma tentativa passa — nem depois de a configuração estar certa.
   *
   * A linha fica, com o erro escrito, porque é ela que responde a "porque é que
   * o cliente nunca soube". O que sai é só a chave.
   */
  const failed = status === "failed" || status === "bounced" || status === "skipped"

  await admin
    .from("case_notifications")
    .update({
      status,
      attempts: extra.attempts ?? 0,
      provider_message_id: extra.messageId ?? null,
      last_error: extra.error ?? null,
      ...(failed ? { dedupe_key: null } : {}),
      ...(status === "sent" ? { sent_at: now } : {}),
      ...(status === "failed" || status === "bounced" ? { failed_at: now } : {}),
    })
    .eq("id", id)
}

/**
 * A bandeira no caso.
 *
 * Só para o que o cliente devia ter recebido e não recebeu. Um alerta interno
 * que não sai é chato; um cliente que nunca soube que tem uma proposta à espera
 * é uma venda perdida sem ninguém dar por ela.
 */
async function raiseFlag(input: NotifyInput, error: string): Promise<void> {
  if (input.audience !== "client") return

  const admin = createAdminClient()
  if (!admin) return

  await admin
    .from("booking_cases")
    .update({
      notify_alert_at: new Date().toISOString(),
      notify_alert_reason: `${input.channel} · ${input.kind} · ${error}`.slice(0, 300),
    })
    .eq("id", input.caseId)
}

/** Baixa a bandeira quando alguém já tratou do assunto. */
export async function clearNotifyFlag(caseId: string): Promise<void> {
  const admin = createAdminClient()
  if (!admin) return
  await admin
    .from("booking_cases")
    .update({ notify_alert_at: null, notify_alert_reason: null })
    .eq("id", caseId)
}

// ── o que o fornecedor diz depois ────────────────────────────────────────────

/**
 * O webhook do Resend, traduzido para o nosso vocabulário.
 *
 * `sent` é o fornecedor a aceitar; `delivered` é o servidor do destinatário a
 * aceitar. São coisas diferentes e o backlog pede as duas — é a segunda que
 * responde à pergunta "chegou?".
 */
export async function recordDeliveryEvent(input: {
  providerMessageId: string
  status: NotifyStatus
  error?: string | null
}): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin) return false

  const now = new Date().toISOString()

  const { data } = await admin
    .from("case_notifications")
    .update({
      status: input.status,
      ...(input.status === "delivered" ? { delivered_at: now } : {}),
      ...(input.status === "bounced" ? { failed_at: now } : {}),
      ...(input.error ? { last_error: input.error.slice(0, 500) } : {}),
    })
    .eq("provider_message_id", input.providerMessageId)
    .select("id, case_id, audience, channel, kind")

  const updated = (data ?? []) as {
    case_id: string
    audience: NotifyAudience
    channel: string
    kind: string
  }[]

  if (updated.length === 0) return false

  /* Uma devolução permanente é a mesma notícia que uma falha de envio: alguém
     tem de ligar ao cliente. */
  if (input.status === "bounced") {
    for (const row of updated) {
      if (row.audience !== "client") continue
      await admin
        .from("booking_cases")
        .update({
          notify_alert_at: now,
          notify_alert_reason:
            `${row.channel} · ${row.kind} · devolvido pelo servidor do destinatário`.slice(
              0,
              300
            ),
        })
        .eq("id", row.case_id)
    }
  }

  return true
}

// ── leitura ──────────────────────────────────────────────────────────────────

export async function listCaseNotifications(
  caseId: string,
  limit = 60
): Promise<CaseNotification[]> {
  const admin = createAdminClient()
  if (!admin) return []

  const { data } = await admin
    .from("case_notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(limit)

  return (data ?? []) as unknown as CaseNotification[]
}

/** NT-07 · os alertas que o cliente vê no link dele, do mais antigo ao mais novo. */
export async function listClientAlerts(
  caseId: string
): Promise<CaseNotification[]> {
  const admin = createAdminClient()
  if (!admin) return []

  const { data } = await admin
    .from("case_notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("case_id", caseId)
    .eq("client_visible", true)
    .order("created_at", { ascending: true })
    .limit(20)

  return (data ?? []) as unknown as CaseNotification[]
}

/** Verdadeiro quando este acontecimento já avisou por este canal (NT-04). */
export async function alreadyNotified(
  caseId: string,
  channel: NotifyChannel,
  audience: NotifyAudience,
  dedupeKey: string
): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin) return false

  const { data } = await admin
    .from("case_notifications")
    .select("id")
    .eq("case_id", caseId)
    .eq("channel", channel)
    .eq("audience", audience)
    .eq("dedupe_key", dedupeKey)
    .limit(1)
    .maybeSingle()

  return Boolean(data)
}
