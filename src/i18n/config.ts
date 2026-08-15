/**
 * WeeFly — idiomas.
 *
 * Três, e a ordem não é alfabética: português primeiro porque é a língua de
 * Cabo Verde e da equipa, inglês a seguir porque é a diáspora e o turismo, e
 * francês por causa do Senegal, da França e do resto da África ocidental
 * francófona.
 *
 * Sem imports de servidor nem de React — este ficheiro é lido tanto no
 * servidor como no browser.
 */

export const LOCALES = ["pt", "en", "fr"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "pt"

/** Como o idioma se chama a si próprio, que é como as pessoas o procuram. */
export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  fr: "Français",
}

/** Etiqueta curta para o seletor em ecrãs estreitos. */
export const LOCALE_SHORT: Record<Locale, string> = {
  pt: "PT",
  en: "EN",
  fr: "FR",
}

/** Para o atributo `lang` do <html> e para o Intl. */
export const LOCALE_TAGS: Record<Locale, string> = {
  pt: "pt-PT",
  en: "en-GB",
  fr: "fr-FR",
}

export const LOCALE_COOKIE = "weefly_locale"

/** Um ano: a língua de uma pessoa não muda de semana para semana. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/**
 * Lê o cabeçalho Accept-Language e escolhe o melhor idioma que temos.
 *
 * Implementação pequena de propósito: só precisamos de comparar o prefixo de
 * duas letras contra três hipóteses, e uma biblioteca de negociação de
 * conteúdo para isso seria uma dependência a mais.
 */
export function matchAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";")
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2)
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 }
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.q))
    .sort((a, b) => b.q - a.q)

  for (const { tag } of ranked) {
    const base = tag.split("-")[0]
    if (isLocale(base)) return base
  }
  return null
}
