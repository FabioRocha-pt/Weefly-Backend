"use client"

import { createContext, useContext, useMemo } from "react"

import { DEFAULT_LOCALE, type Locale } from "./config"
import { createTranslator, type Dictionary, type Translator } from "./translate"

interface I18nValue {
  locale: Locale
  t: Translator
  /**
   * E8 · o fuso em que quem está a ver lê as horas. Só o back-office o passa
   * (o da conta — ver `lib/bo-timezone`); fora dele é o de Cabo Verde.
   */
  timeZone: string
}

/* O mesmo valor de `BO_DEFAULT_TIME_ZONE`, escrito aqui para o provider não
   depender de nada do back-office. */
const DEFAULT_TIME_ZONE = "Atlantic/Cape_Verde"

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
  timeZone = DEFAULT_TIME_ZONE,
  children,
}: {
  locale: Locale
  dictionary: Dictionary
  /** O dicionário português, para chaves ainda por traduzir. */
  fallback?: Dictionary
  /** E8 · o fuso da conta de quem está a ver (back-office). */
  timeZone?: string
  children: React.ReactNode
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: createTranslator(dictionary, fallback, locale),
      timeZone,
    }),
    [locale, dictionary, fallback, timeZone]
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
    timeZone: DEFAULT_TIME_ZONE,
  }
}

/** E8 · o fuso em que este ecrã escreve as horas. */
export function useTimeZone(): string {
  return useI18n().timeZone
}

export function useT(): Translator {
  return useI18n().t
}
