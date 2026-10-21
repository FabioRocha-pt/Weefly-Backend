/**
 * C-10 · as companhias do seletor, e o logótipo de cada uma.
 *
 * Eram dez, escritas num objecto em `lib/pc/catalog.ts`. O backlog pede
 * trinta e uma e — mais importante — pede que acrescentar a trigésima segunda
 * seja um `insert` e não um `deploy`. Passaram para a tabela `airlines`
 * (migração 0017).
 *
 * A lista do ficheiro continua a existir como recurso, e não por preguiça: a
 * leitura da tabela pode falhar (migração não aplicada, base em manutenção), e
 * um compositor sem companhias nenhumas é um compositor onde ninguém pode
 * escrever uma proposta. O mesmo raciocínio da `bo_allowlist`.
 *
 * Os logótipos são ficheiros, não linhas. Vivem em `public/airlines/{iata}.png`
 * — nome igual ao código IATA em minúsculas, como o backlog manda. Uma
 * companhia acrescentada sem ficheiro mostra a sigla, que é o critério "um
 * logótipo em falta cai para a sigla, nunca um espaço vazio".
 */

import seed from "@/data/airlines.json"

export interface Airline {
  iata: string
  name: string
  priority: number
}

/** O caminho público do logótipo. Não garante que o ficheiro exista. */
export const airlineLogoPath = (iata: string): string =>
  `/airlines/${iata.toLowerCase()}.png`

/*
 * Os códigos que **têm** ficheiro, sabidos em tempo de compilação.
 *
 * Vem do `airlines.json` que acompanha o pacote de logótipos, e é a razão de o
 * componente saber mostrar a sigla sem esperar que uma imagem falhe a carregar:
 * um `onError` funciona, mas pisca — desenha o espaço vazio, tenta, falha, e só
 * então troca. Uma companhia nova sem logótipo cai na sigla de primeira.
 */
const WITH_LOGO = new Set(
  (seed as { iata: string; png?: string }[])
    .filter((a) => Boolean(a.png))
    .map((a) => a.iata.toUpperCase())
)

export const hasAirlineLogo = (iata: string): boolean =>
  WITH_LOGO.has(iata.toUpperCase())

/** A lista do ficheiro, na ordem do backlog. O recurso quando a base não fala. */
export const FALLBACK_AIRLINES: Airline[] = (
  seed as { iata: string; name: string; priority: number }[]
)
  .map((a) => ({
    iata: a.iata.toUpperCase(),
    name: a.name,
    priority: Number(a.priority) || 9,
  }))
  .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "pt"))

const byCode = new Map(FALLBACK_AIRLINES.map((a) => [a.iata, a]))

/*
 * As companhias da tabela, parametrizadas no Admin (`/gestao/companhias`).
 *
 * Registadas em tempo de execução: no servidor por `loadAirlines()`
 * (`lib/airlines-server`), no browser pelo `AirlinesProvider` do layout raiz.
 * Enquanto ninguém as registou, vale a lista do ficheiro — as funções abaixo
 * continuam síncronas, e por isso nenhum dos sítios que as chamam mudou.
 */
export interface AirlineEntry extends Airline {
  active: boolean
  /** O logótipo carregado no Admin. Nulo: o ficheiro de `public/airlines`. */
  logoUrl: string | null
  ticketPrefix: string | null
}

let registered: Map<string, AirlineEntry> | null = null

export function registerAirlines(list: AirlineEntry[]): void {
  registered = new Map(list.map((a) => [a.iata.toUpperCase(), a]))
}

const sortAirlines = (a: Airline, b: Airline) =>
  a.priority - b.priority || a.name.localeCompare(b.name, "pt")

/** As companhias activas, pela ordem do seletor. */
export function catalogAirlines(): Airline[] {
  if (!registered) return FALLBACK_AIRLINES
  return Array.from(registered.values())
    .filter((a) => a.active)
    .map(({ iata, name, priority }) => ({ iata, name, priority }))
    .sort(sortAirlines)
}

/**
 * O nome de uma companhia, de onde ele estiver.
 *
 * Nunca devolve vazio: um código desconhecido devolve-se a si próprio, porque
 * `TP` num ecrã é legível e `undefined` não é.
 */
export function airlineName(iata: string | null | undefined): string {
  if (!iata) return "—"
  const code = iata.toUpperCase()
  return registered?.get(code)?.name ?? byCode.get(code)?.name ?? code
}

/** O endereço do logótipo, ou nulo quando só há a sigla. */
export function airlineLogo(iata: string | null | undefined): string | null {
  if (!iata) return null
  const code = iata.trim().toUpperCase()
  const own = registered?.get(code)?.logoUrl
  if (own) return own
  return hasAirlineLogo(code) ? airlineLogoPath(code) : null
}

/*
 * Bilhete v2 · o prefixo de três dígitos do número de bilhete (o código de
 * contabilidade IATA) de cada companhia.
 *
 * No caso WF-2610-0078 saiu um bilhete TAP a começar por 056; a TAP é 047. A
 * emissão passa a recusar um prefixo que não seja o da companhia emissora. As
 * companhias sem bilhete IATA (as low cost) não estão aqui, e para elas não há
 * verificação — recusar seria recusar uma emissão legítima.
 */
const TICKET_PREFIX: Record<string, string> = {
  AA: "001",
  AD: "577",
  AF: "057",
  AH: "124",
  AT: "147",
  BA: "125",
  BF: "632",
  DL: "006",
  DT: "118",
  EK: "176",
  ET: "071",
  G3: "127",
  IB: "075",
  KL: "074",
  KQ: "706",
  LA: "045",
  LH: "220",
  LX: "724",
  MS: "077",
  QR: "157",
  SK: "117",
  SN: "082",
  TK: "235",
  TP: "047",
  TU: "199",
  UA: "016",
  VR: "696",
}

/** O prefixo do bilhete da companhia, ou nulo quando não o conhecemos. */
export function ticketPrefix(iata: string | null | undefined): string | null {
  if (!iata) return null
  const code = iata.trim().toUpperCase()
  return registered?.get(code)?.ticketPrefix ?? TICKET_PREFIX[code] ?? null
}
