/**
 * WeeFly — países, indicativos telefónicos e E.164.
 *
 * A lista curta de vinte indicativos que vivia em `lib/pc/catalog.ts` deixava
 * de fora exatamente quem mais nos escreve: a diáspora fora de Portugal, França
 * e Estados Unidos. Aqui estão todos, gerados por
 * `scripts/build-dial-codes.mjs` a partir de dados públicos e versionados em
 * `src/data/dial-codes.json`.
 *
 * Isomórfico de propósito, ao contrário de `lib/airports.ts`: são 7 KB, o
 * formulário precisa de os filtrar enquanto se escreve, e um pedido de rede por
 * cada tecla num campo de país seria pior do que os 7 KB.
 *
 * O número é guardado em E.164 (+33612345678) porque é o formato que o WhatsApp
 * e o gateway de SMS pedem. O indicativo sozinho não basta para saber de que
 * país é um número — o +1 é de vinte países — e é por isso que o ISO do país
 * escolhido é guardado ao lado.
 */

import data from "@/data/dial-codes.json"

export interface Country {
  /** ISO-3166 alpha-2. */
  iso: string
  /** Indicativo com o "+". */
  dial: string
  /** Nome em inglês, como vem da fonte. Ver `countryName` para o traduzido. */
  name: string
}

interface RawFile {
  source: string
  generatedAt: string
  count: number
  countries: [string, string, string][]
}

const file = data as unknown as RawFile

export const COUNTRIES: Country[] = file.countries.map(([iso, dial, name]) => ({
  iso,
  dial,
  name,
}))

export const COUNTRY_BY_ISO: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.iso, c])
)

/** O indicativo de um país, ou o de Cabo Verde — o mercado de casa. */
export const DEFAULT_COUNTRY = "CV"

export function countryByIso(iso: string | null | undefined): Country | null {
  if (!iso) return null
  return COUNTRY_BY_ISO[iso.trim().toUpperCase()] ?? null
}

/**
 * A bandeira, feita a partir do código do país.
 *
 * Duas letras viradas em indicadores regionais dão o emoji da bandeira, sem
 * imagens nem sprites — 249 ficheiros PNG para um seletor de telefone seria
 * pagar caro por uma decoração.
 */
export function flagOf(iso: string): string {
  const code = iso.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return "🏳"
  return String.fromCodePoint(
    0x1f1e6 + (code.charCodeAt(0) - 65),
    0x1f1e6 + (code.charCodeAt(1) - 65)
  )
}

/**
 * O nome do país na língua de quem lê.
 *
 * `Intl.DisplayNames` sabe os 249 nomes em português, inglês e francês sem que
 * ninguém os escreva nem os mantenha. Quando o browser não o suporta, fica o
 * nome inglês da fonte — que é pior do que traduzido, mas melhor do que um
 * código de duas letras.
 */
export function countryName(iso: string, localeTag = "en"): string {
  const fallback = COUNTRY_BY_ISO[iso]?.name ?? iso
  try {
    const names = new Intl.DisplayNames([localeTag], { type: "region" })
    return names.of(iso) ?? fallback
  } catch {
    return fallback
  }
}

/** Sem acentos e em minúsculas, para a pesquisa. Igual ao `fold` dos aeroportos. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * A pesquisa do seletor: por nome (traduzido ou inglês), por indicativo ou pelo
 * código do país. "+238", "cabo verde", "cape", "CV" — tudo dá Cabo Verde.
 */
export function searchCountries(query: string, localeTag = "en"): Country[] {
  const q = fold(query).replace(/^\+/, "")
  if (!q) return COUNTRIES

  return COUNTRIES.filter((country) => {
    const translated = fold(countryName(country.iso, localeTag))
    return (
      country.dial.replace("+", "").startsWith(q) ||
      translated.includes(q) ||
      fold(country.name).includes(q) ||
      country.iso.toLowerCase() === q
    )
  })
}

/**
 * O número em E.164: "+" e só dígitos, no máximo quinze.
 *
 * Aceita o que o cliente escreve — espaços, parênteses, o indicativo repetido à
 * frente do número — e devolve uma coisa só. Um zero à cabeça é o zero nacional
 * de quem marca dentro do país (06 12 34 56 78 em França) e não faz parte do
 * número internacional.
 */
export function toE164(dial: string, phone: string): string | null {
  const prefix = dial.replace(/\D/g, "")
  let digits = phone.replace(/\D/g, "")
  if (!prefix || !digits) return null

  if (digits.startsWith(prefix) && digits.length > prefix.length) {
    digits = digits.slice(prefix.length)
  }
  digits = digits.replace(/^0+/, "")
  if (!digits) return null

  const full = `${prefix}${digits}`
  if (full.length < 8 || full.length > 15) return null
  return `+${full}`
}

/**
 * O país de um indicativo — o primeiro, quando o indicativo é partilhado.
 *
 * É um palpite e é assim que deve ser lido: serve para os pedidos guardados
 * antes de o país passar a ser gravado (migração 0010). Para tudo o que é novo,
 * o país vem da escolha do cliente e não daqui.
 */
export function countryOfDial(dial: string | null | undefined): string | null {
  if (!dial) return null
  const clean = dial.trim()
  return COUNTRIES.find((c) => c.dial === clean)?.iso ?? null
}

/** O país que faz sentido para uma língua, quando o link não diz qual. */
export function countryForLocale(locale: string | null | undefined): string {
  const tag = (locale ?? "").toLowerCase()
  if (tag.startsWith("pt")) return tag.includes("br") ? "BR" : "PT"
  if (tag.startsWith("fr")) return "FR"
  if (tag.startsWith("en")) return "US"
  return DEFAULT_COUNTRY
}
