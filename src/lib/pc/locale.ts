/**
 * T-08 · qual a língua do link deste cliente.
 *
 * O relatório de testes: "o cliente escolheu português, a notificação chegou, e
 * o link abriu **inteiramente em inglês**".
 *
 * Havia duas causas e nenhuma delas era o dicionário:
 *
 *   1. **Ninguém montava o `I18nProvider` em `/pc`.** Os componentes do fluxo do
 *      cliente estavam escritos em inglês literal — não havia sequer uma chave
 *      para resolver. O que a página mostrava era o que estava no código.
 *   2. **A `lang` do caso não chegava ao ecrã.** O resolvedor genérico
 *      (`i18n/server.ts`) lê o cookie e o `Accept-Language` do browser, que são
 *      preferências de **quem está a navegar**. O link do Price Checker tem uma
 *      resposta melhor do que essas duas: a língua em que o cliente falou
 *      connosco quando fez o pedido, gravada no lead.
 *
 * A ordem aqui é a que resolve as duas coisas, e a razão de cada degrau:
 *
 *   `?lang=` · um vendedor manda o link com a língua forçada, e isso ganha a
 *              tudo. É a mesma regra do resto da aplicação.
 *   cookie   · a escolha que **este** cliente fez no seletor do cabeçalho, neste
 *              pedido. Leva o token: um telemóvel partilhado por duas pessoas
 *              não deve arrastar a língua de uma para o link da outra.
 *   lead     · a língua do pedido. É o degrau que faltava, e é o que o critério
 *              pede à letra: "a `lang` do caso manda em todos os ecrãs que o
 *              cliente vê".
 *   omissão  · português.
 *
 * O `Accept-Language` não entra. Um cabo-verdiano na diáspora tem o browser em
 * inglês e pediu-nos a viagem em português; adivinhar pelo browser era desfazer
 * a única resposta que temos escrita.
 *
 * SÓ SERVIDOR.
 */

import { cookies } from "next/headers"

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config"

/** `weefly_pc_lang = "{token}:{locale}"`. Ver a razão do token acima. */
export const PC_LOCALE_COOKIE = "weefly_pc_lang"

export function pcLocale(input: {
  token: string
  /** A língua guardada no lead deste caso. */
  stored: string | null | undefined
  /** O `?lang=` da página, quando existe. */
  fromUrl?: string | string[] | undefined
}): Locale {
  const url = Array.isArray(input.fromUrl) ? input.fromUrl[0] : input.fromUrl
  if (isLocale(url)) return url

  const cookie = cookies().get(PC_LOCALE_COOKIE)?.value
  if (cookie) {
    const separator = cookie.lastIndexOf(":")
    if (separator > 0) {
      const token = cookie.slice(0, separator)
      const locale = cookie.slice(separator + 1)
      if (token === input.token && isLocale(locale)) return locale
    }
  }

  if (isLocale(input.stored)) return input.stored

  return DEFAULT_LOCALE
}
