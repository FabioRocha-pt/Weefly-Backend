"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/utils/supabase/server"
import { postAgentMessage } from "@/lib/conversations"

export type ConversationActionState = { error: string | null }

/**
 * O agente escreve para dentro da conversa do cliente.
 *
 * A mensagem aparece no chat identificada como "Agente WeeFly", com avatar
 * diferente do assistente. A distinção é intencional e não cosmética: saber se
 * está a falar com um robô ou com uma pessoa muda o que o cliente escreve a
 * seguir e o quanto confia na resposta.
 */
export async function sendAgentMessage(
  caseId: string,
  body: string
): Promise<ConversationActionState> {
  const text = body.trim()
  if (!text) return { error: "Escreva alguma coisa." }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Sessão expirada. Volte a entrar." }

  const sent = await postAgentMessage(caseId, text, user.id)
  if (!sent) {
    return {
      error: "Este caso não tem conversa associada — chegou por link, não por chat.",
    }
  }

  revalidatePath(`/admin/casos/${caseId}`)
  return { error: null }
}
