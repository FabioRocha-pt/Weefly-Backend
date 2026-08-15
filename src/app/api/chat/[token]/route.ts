import { NextResponse } from "next/server"

import { createAdminClient } from "@/utils/supabase/admin"
import { getConversation, getMessages } from "@/lib/conversations"
import { getI18n } from "@/i18n/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * O histórico da conversa, e o que chegou desde a última vez.
 *
 * Serve dois momentos: abrir a conversa (sem `since`, devolve tudo) e a
 * sondagem enquanto ela está aberta (com `since`, devolve só o novo). É por
 * aqui que a proposta escrita pelo agente aparece do lado do cliente sem ele
 * ter de recarregar nada.
 *
 * Sondagem e não Realtime por uma razão simples: o cliente do Supabase no
 * browser não é usado em lado nenhum deste projeto, e ligá-lo só para isto
 * traria autenticação anónima e políticas de RLS novas para uma tabela que hoje
 * só o service role toca. Um pedido de dez em dez segundos numa conversa aberta
 * é barato.
 */
export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const { t } = getI18n()
  const conversation = await getConversation(params.token)
  if (!conversation) {
    return NextResponse.json({ error: t("errors.conversationNotFound") }, { status: 404 })
  }

  const since = new URL(request.url).searchParams.get("since") ?? undefined
  const messages = await getMessages(conversation.id, since ?? undefined)

  // Marca que o cliente esteve aqui, para o back-office saber se a proposta já
  // foi vista ou se precisa de um empurrão por email.
  const admin = createAdminClient()
  if (admin) {
    await admin
      .from("chat_conversations")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", conversation.id)
  }

  return NextResponse.json({
    token: conversation.token,
    status: conversation.status,
    caseId: conversation.case_id,
    messages,
  })
}
