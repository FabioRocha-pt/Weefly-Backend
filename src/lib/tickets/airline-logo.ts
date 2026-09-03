/**
 * C-26 · o logótipo da companhia dentro do PDF do bilhete.
 *
 * Lê os PNG de `public/airlines`, e a escolha desse sítio é a coisa toda deste
 * ficheiro.
 *
 * As fontes do bilhete vivem em base64 dentro de um módulo TypeScript porque o
 * rastreio de ficheiros do Next não segue caminhos construídos em tempo de
 * execução, e um `.ttf` lido de `src/assets` desaparece no build de produção
 * (ver o comentário em `scripts/build-ticket-fonts.mjs` — foi um bug real).
 *
 * Com os logótipos a solução é outra, e mais simples: **`public/` é copiado
 * para o deployment por contrato do Next.** Não depende de rastreio nenhum. E
 * este projeto corre `next start` a partir da raiz (ver `ecosystem.config.js`),
 * pelo que `process.cwd()/public` resolve sempre.
 *
 * Trinta e um PNG em base64 seriam quase 900 KB de código-fonte por embutir num
 * módulo — a alternativa que se evita assim.
 *
 * SÓ SERVIDOR.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { hasAirlineLogo } from "@/lib/airlines-catalog"

/**
 * Os bytes do logótipo, ou nulo.
 *
 * Nulo é um resultado legítimo e não um erro: o bilhete escreve a sigla e o
 * nome da companhia, que é o que o critério manda quando o ficheiro falta.
 */
export async function readAirlineLogo(
  iata: string | null | undefined
): Promise<Uint8Array | null> {
  const code = (iata ?? "").trim().toLowerCase()
  if (!code || !hasAirlineLogo(code)) return null

  /* Só letras e dígitos: o código vem de uma coluna da base de dados, e um
     `../` num nome de ficheiro construído a partir dela seria uma leitura
     arbitrária do disco. */
  if (!/^[a-z0-9]{2}$/.test(code)) return null

  try {
    const file = join(process.cwd(), "public", "airlines", `${code}.png`)
    return new Uint8Array(await readFile(file))
  } catch {
    /* O ficheiro devia estar lá e não está. O bilhete sai com a sigla — não
       falha por causa de um logótipo. */
    return null
  }
}

/**
 * Todos os logótipos de que este bilhete precisa, embutidos de uma vez.
 *
 * O `pdf-lib` embute de forma assíncrona e o desenho de cada trecho é
 * sincrónico, pelo que os bytes têm de estar prontos antes. Um mapa por código
 * também garante que uma ida e volta na mesma companhia embute a imagem **uma
 * vez** — dois `embedPng` do mesmo ficheiro dariam dois objectos no documento.
 */
export async function readAirlineLogos(
  codes: (string | null | undefined)[]
): Promise<Map<string, Uint8Array>> {
  const unique = Array.from(
    new Set(
      codes
        .map((c) => (c ?? "").trim().toUpperCase())
        .filter((c) => c.length === 2)
    )
  )

  const found = new Map<string, Uint8Array>()

  await Promise.all(
    unique.map(async (code) => {
      const bytes = await readAirlineLogo(code)
      if (bytes) found.set(code, bytes)
    })
  )

  return found
}
