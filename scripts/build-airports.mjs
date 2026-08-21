#!/usr/bin/env node
/**
 * Gera o catálogo de aeroportos a partir dos dados da OurAirports.
 *
 * Corre à mão, não em cada build: `node scripts/build-airports.mjs`. O ficheiro
 * gerado (src/data/airports.json) vai para o repositório e é versionado como
 * qualquer outro código — é o que a FE-01 pede quando diz "guardado localmente
 * e versionado, não buscado a um terceiro em cada pedido". Uma pesquisa de
 * aeroporto não pode depender de um CDN de outra pessoa estar de pé.
 *
 * Os dados da OurAirports são domínio público (https://ourairports.com/data/).
 * Guardamos só o que a pesquisa e o ecrã precisam: código IATA, nome, cidade,
 * país e duas pistas de relevância (o tipo do aeroporto e se tem voos
 * regulares), que são o que faz "LIS" aparecer antes de um aeródromo com o
 * mesmo prefixo no nome.
 */

import { createWriteStream } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const OUT = join(ROOT, "src", "data", "airports.json")
const TMP = join(ROOT, ".airports-cache")

const SOURCES = {
  airports: "https://davidmegginson.github.io/ourairports-data/airports.csv",
  countries: "https://davidmegginson.github.io/ourairports-data/countries.csv",
}

/** Aeroportos com voos regulares primeiro; o resto por tamanho. */
const RANK = {
  large_airport: 4,
  medium_airport: 3,
  small_airport: 2,
  seaplane_base: 1,
  heliport: 1,
}

async function download(url, file) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} devolveu ${response.status}`)
  await mkdir(dirname(file), { recursive: true })
  await pipeline(response.body, createWriteStream(file))
  return file
}

/**
 * Um leitor de CSV com o mínimo: campos entre aspas, aspas duplicadas dentro
 * delas, e nada mais. Os ficheiros da OurAirports não usam mais do que isso, e
 * uma dependência nova para ler duas colunas seria uma dependência a manter.
 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }

    if (ch === '"') quoted = true
    else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (ch !== "\r") field += ch
  }

  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((key, i) => [key, r[i]])))
}

async function main() {
  console.log("A descarregar os dados da OurAirports…")
  const [airportsCsv, countriesCsv] = await Promise.all([
    download(SOURCES.airports, join(TMP, "airports.csv")).then((f) =>
      readFile(f, "utf8")
    ),
    download(SOURCES.countries, join(TMP, "countries.csv")).then((f) =>
      readFile(f, "utf8")
    ),
  ])

  const countries = {}
  for (const row of parseCsv(countriesCsv)) {
    if (row.code && row.name) countries[row.code] = row.name
  }

  const airports = []
  for (const row of parseCsv(airportsCsv)) {
    const iata = row.iata_code?.trim().toUpperCase() ?? ""
    if (!/^[A-Z]{3}$/.test(iata)) continue
    if (row.type === "closed") continue


    /*
     * A OurAirports desambigua algumas cidades com um parêntesis — "Paris
     * (Roissy-en-France, Val-d'Oise)". Para quem escolhe um aeroporto isso é
     * ruído, e pior: faz "Paris" deixar de ser uma correspondência exata, e
     * Paris do Texas passa à frente de Charles de Gaulle. O parêntesis sai do
     * nome da cidade e fica nas palavras-chave, onde continua a servir a quem
     * pesquisa por "roissy".
     */
    const municipality = row.municipality?.trim() ?? ""
    const city = municipality.replace(/\s*\(.*$/, "").trim() || municipality

    /*
     * As palavras-chave da OurAirports são o que faz "sao vicente" encontrar o
     * aeroporto que está registado na povoação de São Pedro: trazem o nome da
     * ilha, os nomes antigos e as grafias alternativas. Não são mostradas —
     * entram só no índice de pesquisa — e por isso ficam cortadas: as listas
     * muito longas são cauda de códigos ICAO repetidos.
     */
    const keywords = [row.keywords ?? "", municipality !== city ? municipality : ""]
      .filter(Boolean)
      .join(",")
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k && k.length <= 40 && !/^[A-Z]{4}$/.test(k))
      .slice(0, 4)
      .join(" ")

    airports.push([
      iata,
      row.name?.trim() ?? "",
      city,
      row.iso_country?.trim().toUpperCase() ?? "",
      (RANK[row.type] ?? 0) + (row.scheduled_service === "yes" ? 5 : 0),
      keywords,
    ])
  }

  /* Ordenado por relevância à nascença: a pesquisa filtra por prefixo e devolve
     os primeiros que encontra, e por isso a ordem do ficheiro é metade da
     qualidade do resultado. */
  airports.sort((a, b) => b[4] - a[4] || a[0].localeCompare(b[0]))

  const payload = {
    source: "OurAirports · https://ourairports.com/data/ · domínio público",
    generatedAt: new Date().toISOString().slice(0, 10),
    fields: ["iata", "name", "city", "country", "rank", "keywords"],
    count: airports.length,
    countries,
    airports,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload), "utf8")
  await rm(TMP, { recursive: true, force: true })

  console.log(
    `${airports.length} aeroportos e ${Object.keys(countries).length} países escritos em src/data/airports.json`
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
