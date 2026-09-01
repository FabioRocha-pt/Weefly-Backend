/**
 * NT-02 / NT-03 / NT-07 · o canal do WhatsApp.
 *
 * A decisão Q1 do backlog é explícita: a API de negócios do WhatsApp é uma fase
 * posterior e **não é uma dependência** deste sprint. Ao mesmo tempo, três
 * requisitos pedem envio por WhatsApp. As duas coisas conciliam-se assim:
 *
 *   · o adaptador existe e está ligado ao registo de entrega. Quando as chaves
 *     da Cloud API estiverem no ambiente, os avisos saem sem se tocar em código;
 *   · sem chaves, o envio devolve `not_configured`, o registo fica em `skipped`
 *     com a razão escrita, e **o email sai na mesma**. É literalmente o critério
 *     do NT-02: "a falha do WhatsApp não bloqueia o email".
 *
 * O que não se faz é fingir. Um `skipped` no registo diz que ninguém recebeu
 * nada por este canal — e é preferível a um verde que não corresponde a nada.
 *
 * A implementação é a Cloud API da Meta, mensagem de texto livre. Fora da
 * janela de 24 horas a Meta só aceita modelos aprovados; quando isso acontecer,
 * a resposta traz o código 131047 e é registada como está, com o erro à vista.
 *
 * Variáveis de ambiente:
 *   WHATSAPP_PHONE_NUMBER_ID   o id do número emissor
 *   WHATSAPP_ACCESS_TOKEN      o token permanente da aplicação
 *   WHATSAPP_API_VERSION       opcional, por omissão v21.0
 *   WHATSAPP_TEAM_NUMBER       para onde vai o alerta interno do NT-02
 *
 * SÓ SERVIDOR.
 */

export type WhatsAppFailure =
  | "not_configured"
  | "no_number"
  | "invalid_number"
  | "provider_error"

export type WhatsAppOutcome =
  | { ok: true; messageId: string | null }
  | { ok: false; reason: WhatsAppFailure; error: string }

/** Verdadeiro quando há por onde enviar. Os ecrãs usam-no para não prometer. */
export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
  )
}

/** O número da equipa, quando existe. NT-02 manda o alerta interno para aqui. */
export function whatsappTeamNumber(): string | null {
  return normalise(process.env.WHATSAPP_TEAM_NUMBER ?? "")
}

/**
 * E.164 sem o `+` — é o formato que a Cloud API quer no campo `to`.
 *
 * Devolve nulo para o que não pode ser um número: menos de oito dígitos não é
 * um telefone internacional em lado nenhum, e mandá-lo era gastar uma tentativa
 * para receber um erro que já se sabia.
 */
function normalise(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}

export async function sendWhatsApp(input: {
  to: string | string[]
  message: string
}): Promise<WhatsAppOutcome> {
  if (!whatsappConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      error: "WhatsApp sem chaves configuradas — o aviso saiu só por email",
    }
  }

  const numbers = (Array.isArray(input.to) ? input.to : [input.to])
    .map(normalise)
    .filter((value): value is string => Boolean(value))

  if (numbers.length === 0) {
    return { ok: false, reason: "no_number", error: "sem número de WhatsApp" }
  }

  const version = process.env.WHATSAPP_API_VERSION ?? "v21.0"
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`

  /*
   * Um pedido por número: a Cloud API não aceita vários destinatários numa
   * mensagem, e agrupá-los seria esconder que um deles falhou. O primeiro id
   * devolvido é o que fica no registo — é o que o webhook devolve a seguir.
   */
  let firstId: string | null = null
  const errors: string[] = []

  for (const to of numbers) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          /* Sem pré-visualização de links: o aviso leva o link do caso, e uma
             pré-visualização do WeeFly pedia ao servidor de origem que fosse
             buscar uma página que só o cliente devia abrir. */
          text: { preview_url: false, body: input.message.slice(0, 4000) },
        }),
      })

      const payload = (await response.json().catch(() => null)) as {
        messages?: { id?: string }[]
        error?: { message?: string; code?: number }
      } | null

      if (!response.ok) {
        const code = payload?.error?.code
        const message =
          payload?.error?.message ?? `HTTP ${response.status}`
        /* 131026 · o número não tem WhatsApp. 131047 · fora da janela de 24 h,
           só com modelo aprovado. Nenhum dos dois melhora à segunda tentativa. */
        if (code === 131026 || code === 131047 || response.status === 400) {
          return { ok: false, reason: "invalid_number", error: message }
        }
        errors.push(message)
        continue
      }

      firstId ??= payload?.messages?.[0]?.id ?? null
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  if (firstId === null && errors.length > 0) {
    return { ok: false, reason: "provider_error", error: errors.join(" · ") }
  }

  return { ok: true, messageId: firstId }
}
