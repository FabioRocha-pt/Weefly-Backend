/**
 * WeeFly Concierge — a conversa.
 *
 * É a espinha que liga o chatbot ao sistema de casos: recolhe o pedido a
 * conversar, e quando ele fica completo abre o mesmo `booking_case` que o
 * vendedor abriria à mão. A partir daí é tudo igual — compositor, propostas,
 * links, back-office. O chat é uma porta de entrada, não um sistema paralelo.
 *
 * Tudo aqui passa pelo service role: quem conversa não tem sessão, e o token da
 * conversa é a credencial. Cada função pública valida-o.
 *
 * SÓ SERVIDOR.
 */

import { randomBytes } from "crypto"

import { createAdminClient } from "@/utils/supabase/admin"
import type { ParsedFlightQuery } from "@/lib/flight-parse"

export type MessageAuthor = "client" | "bot" | "agent"
export type MessageKind = "text" | "proposal" | "link" | "system"

export interface ChatMessageRow {
  id: string
  author: MessageAuthor
  kind: MessageKind
  body: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export interface ConversationRow {
  id: string
  token: string
  channel: "web" | "whatsapp"
  case_id: string | null
  draft: Partial<ParsedFlightQuery>
  status: "a_recolher" | "entregue" | "fechada"
  created_at: string
}

/** Curto de propósito: vai num endereço que alguém pode ter de ler em voz alta. */
function mintConversationToken(): string {
  return randomBytes(12)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

const CONVERSATION_COLUMNS =
  "id, token, channel, case_id, draft, status, created_at"

const MESSAGE_COLUMNS = "id, author, kind, body, payload, created_at"

// --- Leitura -----------------------------------------------------------------

export async function getConversation(
  token: string
): Promise<ConversationRow | null> {
  const admin = createAdminClient()
  if (!admin) return null
  const { data } = await admin
    .from("chat_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("token", token)
    .maybeSingle()
  return (data ?? null) as ConversationRow | null
}

export async function getMessages(
  conversationId: string,
  since?: string
): Promise<ChatMessageRow[]> {
  const admin = createAdminClient()
  if (!admin) return []
  let query = admin
    .from("chat_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at")
    .limit(200)

  if (since) query = query.gt("created_at", since)

  const { data } = await query
  return (data ?? []) as ChatMessageRow[]
}

/** A conversa de um caso, para o back-office responder para dentro dela. */
export async function conversationForCase(
  caseId: string
): Promise<ConversationRow | null> {
  const admin = createAdminClient()
  if (!admin) return null
  const { data } = await admin
    .from("chat_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("case_id", caseId)
    .maybeSingle()
  return (data ?? null) as ConversationRow | null
}

// --- Escrita -----------------------------------------------------------------

export async function appendMessage(
  conversationId: string,
  message: {
    author: MessageAuthor
    kind?: MessageKind
    body?: string | null
    payload?: Record<string, unknown> | null
    authorUserId?: string | null
  }
): Promise<ChatMessageRow | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data, error } = await admin
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      author: message.author,
      kind: message.kind ?? "text",
      body: message.body ?? null,
      payload: message.payload ?? null,
      author_user_id: message.authorUserId ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single()

  if (error) {
    console.error("[conversations] appendMessage falhou:", error)
    return null
  }
  return data as ChatMessageRow
}

export async function startConversation(
  channel: "web" | "whatsapp" = "web",
  externalId?: string
): Promise<ConversationRow | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data, error } = await admin
    .from("chat_conversations")
    .insert({ token: mintConversationToken(), channel, external_id: externalId ?? null })
    .select(CONVERSATION_COLUMNS)
    .single()

  if (error) {
    console.error("[conversations] startConversation falhou:", error)
    return null
  }
  return data as ConversationRow
}

// --- Escrever para dentro da conversa ----------------------------------------

/**
 * A proposta do agente, entregue como mensagem.
 *
 * As ofertas vão congeladas no payload em vez de por referência: uma mensagem
 * de chat é o registo do que foi dito naquele momento. Quando o agente publicar
 * a revisão R2, aparece uma mensagem nova por baixo e a antiga fica como
 * esteve — que é como qualquer conversa se comporta, e evita que o histórico
 * se reescreva sozinho nas costas de quem já o leu.
 */
export async function postProposalToConversation(input: {
  caseId: string
  caseToken: string
  revision: number
  currency: string
  pax: { adults: number; children: number; infants: number }
  offers: unknown[]
  openingMessage: string | null
}): Promise<boolean> {
  const conversation = await conversationForCase(input.caseId)
  if (!conversation) return false

  const body =
    input.openingMessage?.trim() ||
    (input.revision > 1
      ? "Revi os valores da sua proposta. Estas são as opções atualizadas."
      : `Preparei ${input.offers.length === 1 ? "uma opção" : `${input.offers.length} opções`} para a sua viagem. Veja qual lhe serve melhor.`)

  const message = await appendMessage(conversation.id, {
    author: "agent",
    kind: "proposal",
    body,
    payload: {
      caseToken: input.caseToken,
      revision: input.revision,
      currency: input.currency,
      pax: input.pax,
      offers: input.offers,
    } as Record<string, unknown>,
  })

  return Boolean(message)
}

/** Uma mensagem escrita à mão pelo agente, na ficha do caso. */
export async function postAgentMessage(
  caseId: string,
  body: string,
  authorUserId: string | null
): Promise<boolean> {
  const conversation = await conversationForCase(caseId)
  if (!conversation) return false
  const message = await appendMessage(conversation.id, {
    author: "agent",
    body: body.trim().slice(0, 2000),
    authorUserId,
  })
  return Boolean(message)
}

/** Um marco do caso, em tom discreto — escolhas, passos concluídos. */
export async function postSystemMessage(
  caseId: string,
  body: string,
  payload?: Record<string, unknown>
): Promise<boolean> {
  const conversation = await conversationForCase(caseId)
  if (!conversation) return false
  const message = await appendMessage(conversation.id, {
    author: "bot",
    kind: payload?.url ? "link" : "system",
    body,
    payload: payload ?? null,
  })
  return Boolean(message)
}

/** Quanto falta a um pedido para poder ser entregue — para o back-office. */
export function missingFromDraft(draft: Partial<ParsedFlightQuery>): string[] {
  const missing: string[] = []
  if (!draft.origin) missing.push("origem")
  if (!draft.destination) missing.push("destino")
  if (!draft.departDate) missing.push("data de partida")
  if (!draft.fullName) missing.push("nome")
  if (!draft.email) missing.push("email")
  return missing
}
