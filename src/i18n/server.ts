/**
 * WeeFly — resolução de idioma do lado do servidor.
 *
 * A ordem de precedência responde a uma pergunta prática: quando um vendedor
 * manda a um cliente francês o link `…/proposta?lang=fr`, a página tem de
 * abrir em francês mesmo que o browser da pessoa esteja em inglês e mesmo que
 * ela já tenha visitado o site noutra língua. Daí o parâmetro do endereço ganhar
 * a tudo o resto.
 *
 * SÓ SERVIDOR.
 */

import { cookies, headers } from "next/headers"

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Locale,
  isLocale,
  matchAcceptLanguage,
} from "./config"
import { createTranslator, type Dictionary, type Translator } from "./translate"

import pt from "./dictionaries/pt.json"
import en from "./dictionaries/en.json"
import fr from "./dictionaries/fr.json"

const DICTIONARIES: Record<Locale, Dictionary> = {
  pt: pt as Dictionary,
  en: en as Dictionary,
  fr: fr as Dictionary,
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
}

/**
 * O idioma desta renderização.
 *
 * `searchParams` vem da página, porque um Server Component não consegue ler o
 * query string sozinho — só o recebe como prop. Quem não o passar cai no
 * cookie, o que é o comportamento certo para navegação interna.
 */
export function getLocale(searchParams?: {
  lang?: string | string[]
}): Locale {
  const raw = searchParams?.lang
  const fromUrl = Array.isArray(raw) ? raw[0] : raw
  if (isLocale(fromUrl)) return fromUrl

  const fromCookie = cookies().get(LOCALE_COOKIE)?.value
  if (isLocale(fromCookie)) return fromCookie

  const fromHeader = matchAcceptLanguage(headers().get("accept-language"))
  if (fromHeader) return fromHeader

  return DEFAULT_LOCALE
}

/** O tradutor pronto a usar numa página ou num Server Component. */
export function getTranslator(locale: Locale): Translator {
  return createTranslator(
    getDictionary(locale),
    locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE),
    locale
  )
}

/** Atalho para o caso comum: resolve o idioma e devolve tudo o que a página precisa. */
export function getI18n(searchParams?: { lang?: string | string[] }): {
  locale: Locale
  t: Translator
  dictionary: Dictionary
} {
  const locale = getLocale(searchParams)
  return {
    locale,
    t: getTranslator(locale),
    dictionary: getDictionary(locale),
  }
}

/**
 * O idioma a usar para escrever a um cliente, fora de qualquer pedido HTTP.
 *
 * Um email de proposta sai horas depois, disparado pelo agente, sem browser
 * nenhum do lado do cliente — o cookie e o Accept-Language não existem. O que
 * existe é o que ficou guardado no lead quando ele falou connosco.
 */
export function localeForClient(stored: string | null | undefined): Locale {
  return isLocale(stored) ? stored : DEFAULT_LOCALE
}
