/**
 * WeeFly · I18N-01 · a língua do back-office, do lado do servidor.
 *
 * Quem escolhe é o utilizador, nas Definições, e a escolha fica na conta
 * (`user_metadata.bo_locale`): vale entre sessões e dispositivos. Por omissão,
 * a língua da empresa (I18N-03) e, sem ela, português. Não lê o cookie nem o `?lang=` — esses são do cliente, e **a
 * língua do back-office só muda o que o agente vê**. O que se constrói para o
 * cliente usa sempre `localeForClient` (a língua do caso).
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { createAdminClient } from "@/utils/supabase/admin"
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
  if (isBoLocale(stored)) return stored
  if (!user) return BO_DEFAULT_LOCALE

  /* I18N-03 · quem ainda não escolheu começa na língua da sua empresa
     (`partners.default_locale`, migração 0041). Sem a coluna, sem empresa ou
     com erro: português, como antes. */
  const admin = createAdminClient()
  if (!admin) return BO_DEFAULT_LOCALE
  const { data, error } = await admin
    .from("pro_accounts")
    .select("partner:partners(default_locale)")
    .eq("user_id", user.id)
    .maybeSingle()
  if (error || !data) return BO_DEFAULT_LOCALE
  const partner = (data as { partner?: unknown }).partner
  const row = (Array.isArray(partner) ? partner[0] : partner) as { default_locale?: unknown } | null | undefined
  return isBoLocale(row?.default_locale) ? row.default_locale : BO_DEFAULT_LOCALE
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
