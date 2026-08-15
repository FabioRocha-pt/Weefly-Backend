"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/utils/supabase/server"
import { postAgentMessage } from "@/lib/conversations"
import { getI18n } from "@/i18n/server"

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
  const { t } = getI18n()
  const text = body.trim()
  if (!text) return { error: t("errors.writeSomething") }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: t("errors.sessionExpired") }

  const sent = await postAgentMessage(caseId, text, user.id)
  if (!sent) {
    return {
      error: t("errors.caseHasNoConversation"),
    }
  }

  revalidatePath(`/admin/casos/${caseId}`)
  return { error: null }
}
