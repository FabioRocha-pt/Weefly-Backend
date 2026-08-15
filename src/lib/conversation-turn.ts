/**
 * WeeFly Concierge — o turno da conversa.
 *
 * Separado de `conversations.ts` de propósito, e não por gosto de arrumação: é
 * este ficheiro que importa o SDK da Anthropic, e enquanto a leitura das
 * mensagens vivia ao lado dele, qualquer página que quisesse mostrar uma
 * conversa arrastava o motor de NLP inteiro para o seu bundle. A ficha do caso
 * no back-office só quer ler mensagens; não tem nada que carregar um cliente de
 * modelos de linguagem para isso.
 *
 * Aqui mora a decisão que define o produto: quando o pedido fica completo, o
 * caso nasce — e a partir desse momento é o mesmo caso que o vendedor trabalha
 * no compositor, com os mesmos links e o mesmo back-office.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { mintToken } from "@/lib/booking-cases"
import { saveTravelRequest } from "@/lib/concierge-intake"
import { getI18n } from "@/i18n/server"
import type { Locale } from "@/i18n/config"
import {
  fallbackReply,
  type ChatTurn,
  isComplete,
  parseMessage,
} from "@/lib/concierge-engine"
import type { ParsedFlightQuery } from "@/lib/flight-parse"
import {
  type ChatMessageRow,
  appendMessage,
  getConversation,
  getMessages,
  startConversation,
} from "@/lib/conversations"

/**
 * Junta o que o modelo devolveu neste turno ao que já estava guardado.
 *
 * O Claude reconstrói a query inteira a partir do histórico a cada turno, o que
 * quase sempre funciona — mas basta um turno em que ele deixe cair o email para
 * o pedido regredir e o bot voltar a perguntar o que já lhe disseram. A fusão
 * só deixa passar valores não vazios: acumula, nunca apaga.
 */
function mergeDraft(
  previous: Partial<ParsedFlightQuery>,
  incoming: ParsedFlightQuery
): Partial<ParsedFlightQuery> {
  const merged: Record<string, unknown> = { ...previous }
  for (const [key, value] of Object.entries(incoming)) {
    // `reply` é do turno, não do pedido: guardá-la faria o rascunho crescer com
    // texto que ninguém volta a ler.
    if (key === "reply") continue
    if (value === null || value === undefined || value === "") continue
    merged[key] = value
  }
  return merged as Partial<ParsedFlightQuery>
}

export interface TurnResult {
  token: string
  messages: ChatMessageRow[]
  /** Preenchido no turno em que o pedido fica completo e o caso nasce. */
  caseCreated: { caseId: string; reference: string } | null
  status: "a_recolher" | "entregue" | "fechada"
}

/**
 * Um turno completo, do lado do cliente.
 *
 * Persiste a mensagem, percebe-a, guarda o que aprendeu e — quando já tem rota,
 * datas e contacto — abre o caso. Nunca lança: o pior resultado possível é uma
 * resposta de desculpas guardada como mensagem do bot, porque uma conversa que
 * fica em silêncio é pior do que uma que se engana.
 */
export async function handleClientTurn(input: {
  token?: string | null
  message: string
  channel?: "web" | "whatsapp"
  externalId?: string
}): Promise<TurnResult | null> {
  const { t, locale } = getI18n()
  const admin = createAdminClient()
  if (!admin) return null

  const text = input.message.trim().slice(0, 2000)
  if (!text) return null

  const conversation = input.token
    ? await getConversation(input.token)
    : await startConversation(input.channel ?? "web", input.externalId)

  if (!conversation) return null

  const history = await getMessages(conversation.id)

  await admin
    .from("chat_conversations")
    .update({ last_client_message_at: new Date().toISOString() })
    .eq("id", conversation.id)

  const clientMessage = await appendMessage(conversation.id, {
    author: "client",
    body: text,
  })

  /*
   * Só o que foi dito em texto entra no histórico do modelo. Os cartões de
   * proposta e as mensagens de sistema são para os olhos do cliente; passá-los
   * ao Claude só o convidaria a comentar preços, que é precisamente o que o
   * modo de recolha lhe proíbe.
   */
  const turns: ChatTurn[] = history
    .filter((m) => m.kind === "text" && m.body)
    .map((m) => ({
      role: m.author === "client" ? ("user" as const) : ("assistant" as const),
      content: m.body as string,
    }))

  const parsed = await parseMessage({
    message: text,
    history: turns,
    channel: conversation.channel,
    mode: "intake",
  })

  let reply = fallbackReply()
  let draft = conversation.draft ?? {}

  if (parsed.ok) {
    draft = mergeDraft(draft, parsed.query)
    reply = parsed.query.reply?.trim() || fallbackReply()
  } else if (parsed.kind === "unparsed") {
    reply = parsed.reply
  } else if (parsed.kind === "unconfigured") {
    reply = t("chat.assistantUnavailable")
  } else {
    reply = t("chat.processingProblem")
  }

  await admin
    .from("chat_conversations")
    .update({ draft })
    .eq("id", conversation.id)

  const botMessage = await appendMessage(conversation.id, {
    author: "bot",
    body: reply,
  })

  const fresh: ChatMessageRow[] = [clientMessage, botMessage].filter(
    Boolean
  ) as ChatMessageRow[]

  // O caso nasce uma vez só: se já existe, o cliente está a acrescentar
  // pormenores a um pedido entregue, e isso é conversa para o agente ler.
  let created: TurnResult["caseCreated"] = null
  if (!conversation.case_id && isComplete(draft as ParsedFlightQuery)) {
    created = await openCase(conversation.id, draft as ParsedFlightQuery, locale)
    if (created) {
      const systemMessage = await appendMessage(conversation.id, {
        author: "bot",
        kind: "system",
        body: t("chat.requestRegistered", { reference: created.reference }),
        payload: { reference: created.reference },
      })
      if (systemMessage) fresh.push(systemMessage)
    }
  }

  return {
    token: conversation.token,
    messages: fresh,
    caseCreated: created,
    status: created ? "entregue" : conversation.status,
  }
}

/**
 * Transforma o rascunho num caso a sério.
 *
 * Reutiliza `saveTravelRequest` — o mesmo caminho do formulário do site — para
 * que um pedido vindo do chat seja indistinguível de um pedido vindo do
 * formulário em tudo o que interessa ao back-office. O que muda é só o
 * `source_channel`.
 */
async function openCase(
  conversationId: string,
  draft: ParsedFlightQuery,
  locale: Locale
): Promise<{ caseId: string; reference: string } | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const saved = await saveTravelRequest(
    {
      /* O bot não pergunta o tratamento — é uma pergunta que não ajuda ninguém
         a viajar e que numa conversa soa a formulário. O agente corrige na
         ficha se precisar dele para a emissão. */
      title: "mr",
      fullName: draft.fullName as string,
      email: (draft.email as string).trim().toLowerCase(),
      /* O número vem inteiro como a pessoa o escreveu, indicativo incluído.
         Separá-lo obrigaria a adivinhar onde acaba o prefixo, e a ficha do
         caso mostra os dois campos concatenados de qualquer maneira. */
      phonePrefix: "",
      phone: draft.phone?.trim() ?? "",
      tripType: draft.returnDate ? "round_trip" : "one_way",
      origin: draft.origin as string,
      destination: draft.destination as string,
      departDate: draft.departDate as string,
      returnDate: draft.returnDate ?? "",
      adults: Math.max(1, draft.adults ?? 1),
      children: Math.max(0, draft.children ?? 0),
      infants: Math.max(0, draft.infants ?? 0),
      cabinClass: cabinToDb(draft.cabinClass),
      /* O aviso de tratamento de dados está no rodapé do chat, e o cliente
         escreveu-nos por iniciativa própria a pedir uma cotação. */
      consent: true,
    },
    /* A língua da conversa fica guardada com o lead: a proposta que o agente
       compuser daqui a horas tem de sair nela. */
    { sourceChannel: "chat", locale }
  )

  if (!saved) return null

  const { data: bookingCase, error } = await admin
    .from("booking_cases")
    .insert({
      token: mintToken(),
      trip_request_id: saved.tripRequestId,
      lead_id: saved.leadId,
      stage: "pedido_recebido",
    })
    .select("id")
    .single()

  if (error || !bookingCase) {
    console.error("[conversations] criação do caso falhou:", error)
    return null
  }

  /*
   * A etapa 1 nasce fechada e já submetida: o pedido chegou pela conversa, e o
   * formulário do link 1 não tem nada para recolher. Deixá-la aberta seria
   * oferecer ao cliente um formulário que lhe voltava a perguntar o que ele
   * acabou de escrever.
   */
  await admin
    .from("case_links")
    .update({ status: "submetido", submitted_at: new Date().toISOString() })
    .eq("case_id", bookingCase.id)
    .eq("stage", 1)

  await admin
    .from("chat_conversations")
    .update({ case_id: bookingCase.id, status: "entregue" })
    .eq("id", conversationId)

  /*
   * A pesquisa no Amadeus corre a seguir, sem ser esperada.
   *
   * Deliberado: o cliente já tem a resposta do bot pronta a receber, e fazê-lo
   * esperar mais cinco segundos por um trabalho que é para o agente ver amanhã
   * seria trocar a experiência de quem está à frente do ecrã pela conveniência
   * de quem não está. Funciona porque isto corre num processo Node de longa
   * duração (Passenger); num ambiente serverless, onde a função morre com a
   * resposta, teria de passar a fila ou a `waitUntil`.
   */
  void prefillInBackground(bookingCase.id, draft)

  return { caseId: bookingCase.id, reference: saved.reference }
}

async function prefillInBackground(
  caseId: string,
  draft: ParsedFlightQuery
): Promise<void> {
  try {
    const { prefillProposalFromSearch } = await import("@/lib/proposal-prefill")
    await prefillProposalFromSearch({
      caseId,
      search: {
        origin: draft.origin as string,
        destination: draft.destination as string,
        departDate: draft.departDate as string,
        returnDate: draft.returnDate ?? null,
        adults: Math.max(1, draft.adults ?? 1),
        children: Math.max(0, draft.children ?? 0),
        infants: Math.max(0, draft.infants ?? 0),
        cabinClass: draft.cabinClass ?? "ECONOMY",
      },
    })
  } catch (err) {
    // O caso já existe e o agente pode compor à mão. Isto é conveniência.
    console.error("[conversations] pré-preenchimento falhou:", err)
  }
}

/** O vocabulário do Amadeus não é o da base de dados. */
function cabinToDb(
  cabin: string | null | undefined
): "economy" | "business" | "first" {
  switch (cabin) {
    case "BUSINESS":
      return "business"
    case "FIRST":
      return "first"
    default:
      // PREMIUM_ECONOMY não tem correspondência na coluna e cai em económica,
      // que é o que o vendedor vê e corrige se for caso disso.
      return "economy"
  }
}
