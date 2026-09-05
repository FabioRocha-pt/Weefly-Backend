/**
 * T-15 · o logótipo da marca, exportado para onde um email o consegue ler.
 *
 * O logótipo existe uma vez, em `src/components/weefly-logo.tsx`, como um
 * conjunto de sub-caminhos SVG. Isso serve a aplicação e não serve nada que
 * viva fora dela: um email não importa um componente React, e um PDF muito
 * menos.
 *
 * Este script é a ponte. Lê os caminhos do ficheiro que já é a fonte da
 * verdade e escreve os três ficheiros que os outros meios pedem:
 *
 *   public/brand/weefly-logo.svg        — ember, para fundos claros
 *   public/brand/weefly-logo-white.svg  — branco, para a faixa laranja e para
 *                                          o cabeçalho escuro (T-20)
 *   public/brand/weefly-logo-ink.svg    — tinta, para impressão a preto e
 *                                          branco (TK-12)
 *
 * Correr depois de mexer no logótipo:
 *
 *   node scripts/build-brand-logo.mjs
 *
 * Não há geração automática no build de propósito: o logótipo muda uma vez por
 * ano e um passo a mais no `next build` é um passo a mais que pode falhar.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")

const SOURCE = join(ROOT, "src", "components", "weefly-logo.tsx")
const OUT_DIR = join(ROOT, "public", "brand")

/** O `viewBox` do componente. Mudá-lo lá obriga a mudá-lo aqui. */
const VIEW_BOX = "0 0 122 94"

const VARIANTS = [
  { file: "weefly-logo.svg", fill: "#EF5129" },
  { file: "weefly-logo-white.svg", fill: "#FFFFFF" },
  { file: "weefly-logo-ink.svg", fill: "#1A222E" },
]

function readPaths() {
  const source = readFileSync(SOURCE, "utf8")
  const block = source.match(
    /WEEFLY_LOGO_PATHS:\s*string\[\]\s*=\s*\[([\s\S]*?)\n\]/
  )
  if (!block) {
    throw new Error(
      "Não encontrei WEEFLY_LOGO_PATHS em src/components/weefly-logo.tsx"
    )
  }
  /* Os caminhos são literais entre aspas, um por linha. Uma expressão regular
     chega porque o formato é gerado e não escrito à mão. */
  const paths = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  if (paths.length === 0) throw new Error("A lista de caminhos está vazia.")
  return paths
}

function svg(paths, fill) {
  const body = paths
    .map((d) => `  <path d="${d}" fill="${fill}" />`)
    .join("\n")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" role="img" aria-label="WeeFly">
${body}
</svg>
`
}

const paths = readPaths()
mkdirSync(OUT_DIR, { recursive: true })

for (const variant of VARIANTS) {
  writeFileSync(join(OUT_DIR, variant.file), svg(paths, variant.fill), "utf8")
  console.log(`escrito public/brand/${variant.file}`)
}

console.log(`${paths.length} sub-caminhos · viewBox ${VIEW_BOX}`)
