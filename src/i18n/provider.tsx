"use client"

import { createContext, useContext, useMemo } from "react"

import { DEFAULT_LOCALE, type Locale } from "./config"
import { createTranslator, type Dictionary, type Translator } from "./translate"

interface I18nValue {
  locale: Locale
  t: Translator
}

const I18nContext = createContext<I18nValue | null>(null)

/**
 * Leva o dicionário do servidor para os componentes de cliente.
 *
 * O dicionário viaja inteiro na resposta em vez de ser pedido por fetch: são
 * poucos kilobytes depois de comprimidos, e a alternativa é o primeiro render
 * aparecer sem texto e preencher-se a seguir, que é exatamente o efeito que
 * uma tradução deve evitar.
 */
export function I18nProvider({
  locale,
  dictionary,
  fallback,
  children,
}: {
  locale: Locale
  dictionary: Dictionary
  /** O dicionário português, para chaves ainda por traduzir. */
  fallback?: Dictionary
  children: React.ReactNode
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: createTranslator(dictionary, fallback, locale),
    }),
    [locale, dictionary, fallback]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * O tradutor dentro de um componente de cliente.
 *
 * Fora do provider devolve um tradutor que ecoa a chave, em vez de lançar.
 * Um componente reutilizado num sítio onde ninguém se lembrou de pôr o
 * provider deve ficar feio, não deitar a página abaixo.
 */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (value) return value
  return {
    locale: DEFAULT_LOCALE,
    t: (key: string) => key,
  }
}

export function useT(): Translator {
  return useI18n().t
}
