/**
 * WeeFly — a função de tradução.
 *
 * Sem imports de servidor: a mesma implementação corre no servidor (páginas) e
 * no browser (componentes de cliente), para que a mesma chave dê a mesma frase
 * nos dois lados. Uma divergência aqui aparece como texto a piscar entre o HTML
 * e a hidratação, que é o pior sítio para se descobrir um bug de tradução.
 */

import { DEFAULT_LOCALE, type Locale } from "./config"

export type Dictionary = Record<string, unknown>

export interface TranslateOptions {
  /** Valores para os marcadores `{nome}` da frase. */
  [key: string]: string | number | undefined
}

export type Translator = (key: string, values?: TranslateOptions) => string

/*
 * Uma chave é uma palavra em minúscula seguida de pelo menos um ponto, sem
 * espaços: `validation.emailInvalid`, `errors.signInUnexpected`.
 */
const KEY_SHAPE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/

/**
 * Traduz uma mensagem que pode não ser nossa.
 *
 * Os erros que sobem de uma server action tanto podem ser uma chave que nós
 * escrevemos como a frase que o Supabase devolveu — e essa vem em inglês,
 * pronta a mostrar. Passar tudo pelo tradutor enchia a consola de avisos de
 * chave em falta por causa de texto que nunca teve chave nenhuma.
 */
export function translateMessage(
  t: Translator,
  message: string | null | undefined
): string {
  if (!message) return ""
  return KEY_SHAPE.test(message) ? t(message) : message
}

function lookup(dictionary: Dictionary, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      dictionary
    )
}

function interpolate(template: string, values?: TranslateOptions): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * Constrói o tradutor de um dicionário.
 *
 * `fallback` é o dicionário português: quando uma chave ainda não foi
 * traduzida, o cliente lê a frase em português em vez de ver o nome interno da
 * chave. Um `proposal.offer.chooseCta` no meio de um ecrã é pior do que uma
 * frase na língua errada — a segunda ainda se percebe.
 *
 * Plurais: passa-se `count`, e a função procura primeiro `chave_one` ou
 * `chave_other`. Chega para as três línguas em causa, todas com a mesma regra
 * de um/vários.
 */
export function createTranslator(
  dictionary: Dictionary,
  fallback?: Dictionary,
  locale: Locale = DEFAULT_LOCALE
): Translator {
  return (key, values) => {
    const suffixed =
      values?.count !== undefined
        ? `${key}_${Number(values.count) === 1 ? "one" : "other"}`
        : null

    const candidates = suffixed ? [suffixed, key] : [key]

    for (const candidate of candidates) {
      const found = lookup(dictionary, candidate)
      if (typeof found === "string") return interpolate(found, values)
    }

    if (fallback) {
      for (const candidate of candidates) {
        const found = lookup(fallback, candidate)
        if (typeof found === "string") return interpolate(found, values)
      }
    }

    // Chave em falta nos dois dicionários: grita no log, mas devolve a chave
    // em vez de rebentar. Um ecrã feio é recuperável; um ecrã em branco não.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] chave em falta (${locale}): ${key}`)
    }
    return key
  }
}
