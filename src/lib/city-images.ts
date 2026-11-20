/**
 * WeeFly · IMG-01 · as imagens das cidades.
 *
 * A biblioteca vive em `city_images` (migração 0044), gerida pelo master em
 * `/gestao/imagens`. Aqui resolve-se um código — de cidade ou de aeroporto —
 * para a imagem que a app VIP mostra:
 *
 *   1. o código é o da própria linha (`PAR`, `RAI`);
 *   2. o código é um aeroporto que a linha lista (`CDG`, `ORY` → Paris);
 *   3. o aeroporto fica numa cidade com o mesmo nome de uma linha
 *      (um aeroporto novo de uma cidade que já tem imagem).
 *
 * Sem linha, ou com a linha desativada ou ainda sem ficheiro, não há imagem:
 * devolve-se só o nome da cidade, que é o que o fundo da marca escreve.
 *
 * Lido pela service role (a tabela não tem políticas) e guardado em memória
 * um minuto: é uma tabela de dezenas de linhas, pedida a cada tecla do campo
 * do destino. Numa base sem a 0044 a leitura falha e a lista fica vazia — a
 * app mostra o fundo da marca, que é o comportamento sem imagens.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { airportByIata, fold } from "@/lib/airports"

export interface CityImageRow {
  code: string
  cityName: string
  airportCodes: string[]
  alt: string | null
  imageLarge: string | null
  imageSmall: string | null
  placeholder: string | null
  active: boolean
  updatedAt: string | null
  changedByEmail: string | null
}

/** O que a app precisa para desenhar o fundo de uma cidade. */
export interface CityImage {
  /** O código da cidade da biblioteca (`PAR`), ou o pedido quando não há linha. */
  code: string
  city: string
  alt: string
  /** WebP 800 × 600. Nulo sem imagem activa. */
  small: string | null
  /** WebP 1600 × 1200. Nulo sem imagem activa. */
  large: string | null
  /** Data URL minúsculo, para aparecer antes de qualquer pedido. */
  placeholder: string | null
}

export const CITY_CODE = /^[A-Z]{3}$/

const TTL_MS = 60_000
let cache: { at: number; rows: CityImageRow[] } | null = null

function fromRow(row: Record<string, any>): CityImageRow {
  return {
    code: String(row.code).toUpperCase(),
    cityName: String(row.city_name),
    airportCodes: Array.isArray(row.airport_codes) ? row.airport_codes.map((c: unknown) => String(c).toUpperCase()) : [],
    alt: row.alt ?? null,
    imageLarge: row.image_large ?? null,
    imageSmall: row.image_small ?? null,
    placeholder: row.placeholder ?? null,
    active: row.active !== false,
    updatedAt: row.updated_at ?? null,
    changedByEmail: row.changed_by_email ?? null,
  }
}

/** A biblioteca inteira (também as desativadas e as sem ficheiro). */
export async function listCityImages(options: { fresh?: boolean } = {}): Promise<CityImageRow[]> {
  if (!options.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.rows
  const admin = createAdminClient()
  if (!admin) return []
  const { data, error } = await admin.from("city_images").select("*").order("city_name")
  if (error) {
    /* PGRST205 / 42P01 · a 0044 por aplicar: sem biblioteca, sem imagens. */
    if (error.code !== "PGRST205" && error.code !== "42P01") {
      console.error("[city-images] biblioteca ilegível:", error.message)
    }
    cache = { at: Date.now(), rows: [] }
    return []
  }
  const rows = ((data ?? []) as Record<string, any>[]).map(fromRow)
  cache = { at: Date.now(), rows }
  return rows
}

/** Depois de uma escrita no Admin. */
export function invalidateCityImages() {
  cache = null
}

function findRow(rows: CityImageRow[], code: string): CityImageRow | null {
  const direct = rows.find((r) => r.code === code)
  if (direct) return direct
  const byAirport = rows.find((r) => r.airportCodes.includes(code))
  if (byAirport) return byAirport
  const airport = airportByIata(code)
  if (airport?.city) {
    const name = fold(airport.city)
    const byName = rows.find((r) => fold(r.cityName) === name)
    if (byName) return byName
  }
  return null
}

/**
 * A cidade de um código, com a imagem quando existe e está activa.
 * `null` só quando o código não diz nada a ninguém (nem biblioteca, nem
 * catálogo de aeroportos).
 */
export async function cityInfoFor(code: string | null | undefined): Promise<CityImage | null> {
  const wanted = (code ?? "").trim().toUpperCase()
  if (!CITY_CODE.test(wanted)) return null

  const row = findRow(await listCityImages(), wanted)
  if (row) {
    const shown = row.active && row.imageLarge && row.imageSmall
    return {
      code: row.code,
      city: row.cityName,
      alt: row.alt?.trim() || row.cityName,
      small: shown ? row.imageSmall : null,
      large: shown ? row.imageLarge : null,
      placeholder: shown ? row.placeholder : null,
    }
  }

  const airport = airportByIata(wanted)
  const city = airport ? airport.city || airport.name : ""
  if (!city) return null
  return { code: wanted, city, alt: city, small: null, large: null, placeholder: null }
}

/** A imagem activa de um código (aeroporto → cidade), ou nada. */
export async function cityImageFor(code: string | null | undefined): Promise<CityImage | null> {
  const info = await cityInfoFor(code)
  return info?.large ? info : null
}

/** Só o nome da cidade — o que o fundo da marca escreve quando não há imagem. */
export async function cityNameFor(code: string | null | undefined): Promise<string | null> {
  return (await cityInfoFor(code))?.city ?? null
}
