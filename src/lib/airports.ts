/**
 * WeeFly — o catálogo completo de aeroportos, cidades e países.
 *
 * Substitui a lista de trinta e dois aeroportos que vivia em `lib/pc/catalog.ts`
 * e que era a razão por que um cliente a viajar de Nairobi para Doha não
 * conseguia acabar o formulário. Os dados vêm da OurAirports, são gerados por
 * `scripts/build-airports.mjs` e ficam versionados em `src/data/airports.json` —
 * nunca são buscados a um terceiro no momento do pedido.
 *
 * SÓ SERVIDOR. São quase 600 KB de JSON: mandá-los para o browser de cada cliente do
 * Price Checker era pagar meio megabyte para escrever três letras. Quem precisa
 * de pesquisar chama `/api/airports`; quem precisa de mostrar uma cidade recebe
 * o nome já resolvido do servidor (ver `PcRequestView.cities`).
 */

import data from "@/data/airports.json"

export interface Airport {
  /** Código IATA, três letras. */
  iata: string
  /** Nome do aeroporto, como a OurAirports o escreve. */
  name: string
  /** Cidade servida. Vazia num punhado de aeroportos remotos. */
  city: string
  /** ISO-3166 alpha-2. */
  country: string
  /** Nome do país, na versão inglesa da OurAirports. */
  countryName: string
  /** Relevância: tamanho do aeroporto e se tem voos regulares. */
  rank: number
}

interface RawFile {
  source: string
  generatedAt: string
  count: number
  countries: Record<string, string>
  airports: [string, string, string, string, number, string][]
}

const file = data as unknown as RawFile

/** A versão dos dados, para o endpoint a poder anunciar no cabeçalho. */
export const AIRPORTS_VERSION = file.generatedAt
export const AIRPORTS_SOURCE = file.source

/**
 * "São Vicente" e "sao vicente" são a mesma cidade.
 *
 * A decomposição NFD separa a letra do acento e o `replace` apaga o acento;
 * quem escreve sem acentos (a maioria, num teclado de telemóvel) encontra o
 * mesmo que quem os escreve. Vale para a consulta e para o índice, e tem de ser
 * a mesma função nos dois lados ou a comparação é entre alfabetos diferentes.
 */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

interface Entry extends Airport {
  /** Tudo o que pode ser pesquisado, já sem acentos. */
  haystack: string
  foldedCity: string
  foldedName: string
  /** Nomes alternativos da fonte: ilha, nome antigo, grafia local. */
  foldedKeywords: string
}

/*
 * O índice é construído uma vez por processo, na primeira pesquisa.
 *
 * São nove mil linhas: construir isto por pedido custava mais do que a
 * pesquisa em si, e construí-lo no arranque atrasava o primeiro pedido de
 * qualquer rota — mesmo as que não pesquisam aeroportos.
 */
let entries: Entry[] | null = null
let byIata: Map<string, Entry> | null = null

function index(): { entries: Entry[]; byIata: Map<string, Entry> } {
  if (entries && byIata) return { entries, byIata }

  const built: Entry[] = file.airports.map(([iata, name, source, country, rank, keywords]) => {
    const countryName = file.countries[country] ?? country
    const city = CITY_OVERRIDE[iata] ?? source
    return {
      iata,
      name,
      city,
      country,
      countryName,
      rank,
      foldedCity: fold(city),
      foldedName: fold(name),
      /* As palavras-chave da fonte não aparecem no ecrã mas pesam na pesquisa: é
         o que faz "sal" encontrar o aeroporto que está registado em Espargos
         ("Sal Island") e "sao vicente" o que está registado em São Pedro. */
      foldedKeywords: fold(keywords),
      haystack: fold(
        [iata, city, source, name, countryName, keywords].filter(Boolean).join(" ")
      ),
    }
  })

  entries = built
  byIata = new Map(built.map((e) => [e.iata, e]))
  return { entries, byIata }
}

const strip = (entry: Entry): Airport => ({
  iata: entry.iata,
  name: entry.name,
  city: entry.city,
  country: entry.country,
  countryName: entry.countryName,
  rank: entry.rank,
})

/**
 * O mercado de casa pesa na ordem dos resultados.
 *
 * A WeeFly é uma agência cabo-verdiana: quem escreve "sal" quer a ilha do Sal,
 * não Salalah nem Salt Lake City — e quem escreve "praia" quer a Praia. Sem
 * este empurrão os aeroportos de Cabo Verde ficavam atrás de qualquer cidade do
 * mundo cujo nome comece pelas mesmas três letras, porque o catálogo é global e
 * não sabe de quem é.
 *
 * É um número e um comentário, não uma regra escondida: 120 pontos levantam uma
 * correspondência por nome alternativo ("Sal Island") acima de uma cidade
 * qualquer que comece igual, e deixam-na abaixo de um código IATA exato — que é
 * sempre o que o utilizador escreveu de propósito.
 */
const MARKET_BOOST: Record<string, number> = { CV: 120 }

/**
 * Os nomes que se usam em Cabo Verde, onde a fonte usa outros.
 *
 * A OurAirports registra o aeroporto do Sal na povoação de Espargos e o de São
 * Vicente em São Pedro — está certo e não serve a ninguém: um cliente
 * cabo-verdiano procura "Sal" e reconhece "Sal", que é o que a lista antiga
 * deste projeto mostrava. São nove ilhas e nove nomes; corrigi-los à mão aqui é
 * mais honesto do que fingir que o catálogo global sabe o que a casa sabe.
 */
const CITY_OVERRIDE: Record<string, string> = {
  RAI: "Praia",
  SID: "Sal",
  VXE: "São Vicente",
  BVC: "Boa Vista",
  SNE: "São Nicolau",
  SFL: "São Filipe",
  MMO: "Maio",
  MTI: "Mosteiros",
}

/** As sugestões de "Popular right now", quando ainda não se escreveu nada. */
export const POPULAR_IATA = [
  "RAI", "SID", "VXE", "LIS", "ORY", "CDG", "BOS", "AMS", "DSS", "GRU",
]

export function popularAirports(): Airport[] {
  const { byIata } = index()
  return POPULAR_IATA.map((code) => byIata.get(code))
    .filter((e): e is Entry => Boolean(e))
    .map(strip)
}

/** Um aeroporto pelo código, ou nada. É também a validação do servidor. */
export function airportByIata(code: string | null | undefined): Airport | null {
  if (!code) return null
  const entry = index().byIata.get(code.trim().toUpperCase())
  return entry ? strip(entry) : null
}

export function isKnownIata(code: string | null | undefined): boolean {
  return airportByIata(code) !== null
}

/** "Praia (RAI)" — como um aeroporto escolhido aparece dentro do campo. */
export function airportLabel(airport: Airport): string {
  return `${airport.city || airport.name} (${airport.iata})`
}

/**
 * A pesquisa.
 *
 * A pontuação é o que separa um resultado útil de uma lista alfabética: o
 * código exato ganha a tudo (quem escreve "LIS" quer Lisboa), depois o início
 * do nome da cidade, depois o início do nome do aeroporto, e por fim qualquer
 * pedaço no meio. O tamanho do aeroporto entra como desempate — é o que faz
 * "paris" devolver CDG e ORY antes de um aeródromo dos arredores, e é também o
 * que agrupa uma cidade com vários aeroportos, porque todos partilham a mesma
 * pontuação de cidade e ficam juntos.
 */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = fold(query)
  if (!q) return popularAirports().slice(0, limit)

  const { entries } = index()
  const scored: { entry: Entry; score: number }[] = []

  for (const entry of entries) {
    let score = 0

    if (entry.iata.toLowerCase() === q) score = 1000
    else if (entry.foldedCity === q) score = 800
    else if (entry.foldedCity.startsWith(q)) score = 700
    else if (startsWithWord(entry.foldedKeywords, q)) score = 650
    else if (entry.foldedName.startsWith(q)) score = 500
    else if (entry.haystack.includes(q)) score = 200
    else continue

    scored.push({ entry, score: score + (MARKET_BOOST[entry.country] ?? 0) })
  }

  /*
   * Sem travão no número de candidatos, de propósito.
   *
   * Havia um — parar aos 400 — e cortava resultados certos: "sal" casa com
   * meia centena de Salvadores e Salt Lakes antes de chegar ao aeroporto do Sal,
   * e o corte deixava-o de fora. Percorrer as nove mil linhas inteiras custa
   * poucos milissegundos (o limite da FE-01 são 200), e um resultado que falta é
   * mais caro do que isso.
   */

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        /* Dentro do mesmo tipo de correspondência manda o tamanho: é o que faz
           "paris" devolver CDG e ORY antes de Paris, Texas — que também se chama
           Paris e tem uma pista de terra batida. */
        b.entry.rank - a.entry.rank ||
        a.entry.city.localeCompare(b.entry.city) ||
        a.entry.iata.localeCompare(b.entry.iata)
    )
    .slice(0, limit)
    .map((s) => strip(s.entry))
}

/** Verdadeiro quando a consulta começa uma das palavras do texto. */
function startsWithWord(haystack: string, q: string): boolean {
  if (!haystack) return false
  if (haystack.startsWith(q)) return true
  return haystack.includes(` ${q}`)
}

/**
 * Os nomes das cidades de um conjunto de códigos.
 *
 * É o que a página do cliente leva consigo: em vez do catálogo inteiro, um
 * mapa com os cinco ou seis códigos que aquele caso usa. Ver
 * `PcRequestView.cities`.
 */
export function cityNames(
  codes: (string | null | undefined)[]
): Record<string, string> {
  const { byIata } = index()
  const out: Record<string, string> = {}
  for (const code of codes) {
    if (!code) continue
    const key = code.trim().toUpperCase()
    if (out[key]) continue
    const entry = byIata.get(key)
    if (entry) out[key] = entry.city || entry.name
  }
  return out
}
