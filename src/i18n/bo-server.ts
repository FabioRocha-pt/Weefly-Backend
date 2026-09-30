/**
 * WeeFly · I18N-01 · a língua do back-office, do lado do servidor.
 *
 * Quem escolhe é o utilizador, nas Definições, e a escolha fica na conta
 * (`user_metadata.bo_locale`): vale entre sessões e dispositivos. Por omissão,
 * português. Não lê o cookie nem o `?lang=` — esses são do cliente, e **a
 * língua do back-office só muda o que o agente vê**. O que se constrói para o
 * cliente usa sempre `localeForClient` (a língua do caso).
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { createClient } from "@/utils/supabase/server"
import { getDictionary } from "./server"
import { createTranslator, type Dictionary, type Translator } from "./translate"
import { BO_DEFAULT_LOCALE, getBoDictionary, isBoLocale, type BoLocale } from "./bo"

export const getBoLocale = cache(async (): Promise<BoLocale> => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const stored = (user?.user_metadata as Record<string, unknown> | undefined)?.bo_locale
  return isBoLocale(stored) ? stored : BO_DEFAULT_LOCALE
})

const merged = new Map<BoLocale, Dictionary>()

/**
 * O dicionário do ecrã do agente: o público (onde vivem as chaves `admin.` que
 * o compositor já usava) com o do back-office por cima.
 */
export function getBoScreenDictionary(locale: BoLocale): Dictionary {
  let dict = merged.get(locale)
  if (!dict) {
    dict = { ...getDictionary(locale), ...getBoDictionary(locale) }
    merged.set(locale, dict)
  }
  return dict
}

export async function getBoI18n(): Promise<{
  locale: BoLocale
  t: Translator
  dictionary: Dictionary
  fallback: Dictionary | undefined
}> {
  const locale = await getBoLocale()
  const dictionary = getBoScreenDictionary(locale)
  const fallback = locale === BO_DEFAULT_LOCALE ? undefined : getBoScreenDictionary(BO_DEFAULT_LOCALE)
  return { locale, t: createTranslator(dictionary, fallback, locale), dictionary, fallback }
}
