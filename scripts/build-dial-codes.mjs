#!/usr/bin/env node
/**
 * Gera a lista de países e indicativos telefónicos.
 *
 * Corre à mão — `node scripts/build-dial-codes.mjs` — e o resultado
 * (src/data/dial-codes.json) fica versionado. Pela mesma razão dos aeroportos:
 * um cliente da diáspora que não encontre o indicativo do país onde vive não
 * consegue acabar o pedido, e a lista não pode depender de uma API de terceiros
 * no momento em que ele está a preencher o formulário.
 *
 * Fonte: mledoze/countries (ODbL), que traz o `idd` — a raiz do indicativo e os
 * sufixos. Quando há um sufixo só, o indicativo é a soma dos dois (+2 + 38 =
 * +238). Quando há vários — o +1 da América do Norte, o +7 do Cazaquistão — o
 * indicativo é só a raiz, e é o país escolhido que desfaz a ambiguidade: é por
 * isso que guardamos o ISO do país ao lado do número.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "..", "src", "data", "dial-codes.json")
const SOURCE =
  "https://raw.githubusercontent.com/mledoze/countries/master/countries.json"

async function main() {
  console.log("A descarregar a lista de países…")
  const response = await fetch(SOURCE)
  if (!response.ok) throw new Error(`${SOURCE} devolveu ${response.status}`)
  const countries = await response.json()

  const rows = []
  for (const country of countries) {
    const iso = country.cca2
    const root = country.idd?.root
    const suffixes = country.idd?.suffixes ?? []
    if (!iso || !root) continue

    const dial = suffixes.length === 1 ? `${root}${suffixes[0]}` : root
    if (!/^\+\d{1,4}$/.test(dial)) continue

    rows.push([iso, dial, country.name?.common ?? iso])
  }

  rows.sort((a, b) => a[2].localeCompare(b[2], "en"))

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify({
      source: "mledoze/countries · ODbL · https://github.com/mledoze/countries",
      generatedAt: new Date().toISOString().slice(0, 10),
      fields: ["iso", "dial", "name"],
      count: rows.length,
      countries: rows,
    }),
    "utf8"
  )

  console.log(`${rows.length} países escritos em src/data/dial-codes.json`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
