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

/**
 * O nome de uma companhia, de onde ele estiver.
 *
 * Nunca devolve vazio: um código desconhecido devolve-se a si próprio, porque
 * `TP` num ecrã é legível e `undefined` não é.
 */
export function airlineName(iata: string | null | undefined): string {
  if (!iata) return "—"
  const code = iata.toUpperCase()
  return byCode.get(code)?.name ?? code
}
