/**
 * Bilhete v2 · as cidades em português e o fuso de cada aeroporto.
 *
 * Duas coisas que o catálogo de aeroportos (OurAirports) não tem:
 *
 *   · **o nome da cidade em português.** O catálogo escreve "Lisbon" e
 *     "Espargos" — o bilhete é um documento português e o passageiro do Sal
 *     não conhece Espargos como destino;
 *   · **o fuso.** As horas guardadas são locais de cada aeroporto e não trazem
 *     offset (ver a 0005). LIS 14:00 → RAI 16:10 dá 2h 10m pela diferença de
 *     relógios e 4h 10m de voo. Para o bilhete, que diz quanto tempo se está no
 *     avião, tem de ser o segundo.
 *
 * O fuso sai do país quando o país tem um só; os países com vários fusos têm os
 * aeroportos que vendemos escritos à mão. Um aeroporto sem fuso conhecido cai
 * na diferença de relógios — nunca inventa um número.
 *
 * SÓ SERVIDOR.
 */

import { airportByIata, cityNames } from "@/lib/airports"

/** Aeroportos cujo nome de cidade não é o que o passageiro reconhece. */
const CITY_BY_IATA: Record<string, string> = {
  SID: "Sal",
  VXE: "São Vicente",
  BVC: "Boa Vista",
  MMO: "Maio",
  SFL: "Fogo",
  BVR: "Brava",
  SNE: "São Nicolau",
  RAI: "Praia",
  BRU: "Bruxelas",
  CRL: "Bruxelas Charleroi",
  MXP: "Milão",
  LIN: "Milão",
  BGY: "Bérgamo",
  EWR: "Nova Iorque Newark",
  JFK: "Nova Iorque",
  LGA: "Nova Iorque",
  ORY: "Paris",
  CDG: "Paris",
  BVA: "Paris Beauvais",
  LGW: "Londres Gatwick",
  STN: "Londres Stansted",
  LTN: "Londres Luton",
  GIG: "Rio de Janeiro",
  PDL: "Ponta Delgada",
  FNC: "Funchal",
}

/** Os nomes ingleses do catálogo que têm forma portuguesa. */
const CITY_PT: Record<string, string> = {
  Lisbon: "Lisboa",
  London: "Londres",
  Brussels: "Bruxelas",
  Amsterdam: "Amesterdão",
  Rome: "Roma",
  Milan: "Milão",
  Venice: "Veneza",
  Florence: "Florença",
  Naples: "Nápoles",
  Turin: "Turim",
  Geneva: "Genebra",
  Zurich: "Zurique",
  Basel: "Basileia",
  Munich: "Munique",
  Cologne: "Colónia",
  Hamburg: "Hamburgo",
  "Frankfurt am Main": "Frankfurt",
  Berlin: "Berlim",
  Vienna: "Viena",
  Prague: "Praga",
  Warsaw: "Varsóvia",
  Copenhagen: "Copenhaga",
  Stockholm: "Estocolmo",
  Athens: "Atenas",
  Seville: "Sevilha",
  Saragossa: "Saragoça",
  "Las Palmas": "Las Palmas de Gran Canaria",
  Luxembourg: "Luxemburgo",
  "New York": "Nova Iorque",
  Philadelphia: "Filadélfia",
  "Cape Town": "Cidade do Cabo",
  Johannesburg: "Joanesburgo",
  "Addis Ababa": "Adis Abeba",
  Casablanca: "Casablanca",
  Cairo: "Cairo",
  Istanbul: "Istambul",
  Algiers: "Argel",
  Tunis: "Tunes",
  Moscow: "Moscovo",
  Beijing: "Pequim",
  Montreal: "Montreal",
}

/** Países com um fuso só (ou com todos os aeroportos que vendemos num só). */
const TZ_BY_COUNTRY: Record<string, string> = {
  CV: "Atlantic/Cape_Verde",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  FR: "Europe/Paris",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  BE: "Europe/Brussels",
  NL: "Europe/Amsterdam",
  LU: "Europe/Luxembourg",
  DE: "Europe/Berlin",
  CH: "Europe/Zurich",
  IT: "Europe/Rome",
  AT: "Europe/Vienna",
  DK: "Europe/Copenhagen",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  FI: "Europe/Helsinki",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  HU: "Europe/Budapest",
  GR: "Europe/Athens",
  TR: "Europe/Istanbul",
  SN: "Africa/Dakar",
  GW: "Africa/Bissau",
  GM: "Africa/Banjul",
  GN: "Africa/Conakry",
  ML: "Africa/Bamako",
  MR: "Africa/Nouakchott",
  CI: "Africa/Abidjan",
  GH: "Africa/Accra",
  TG: "Africa/Lome",
  NG: "Africa/Lagos",
  ST: "Africa/Sao_Tome",
  AO: "Africa/Luanda",
  MZ: "Africa/Maputo",
  ZA: "Africa/Johannesburg",
  MA: "Africa/Casablanca",
  DZ: "Africa/Algiers",
  TN: "Africa/Tunis",
  EG: "Africa/Cairo",
  ET: "Africa/Addis_Ababa",
  KE: "Africa/Nairobi",
  AE: "Asia/Dubai",
  QA: "Asia/Qatar",
  IL: "Asia/Jerusalem",
  CN: "Asia/Shanghai",
  JP: "Asia/Tokyo",
  IN: "Asia/Kolkata",
}

/** Os aeroportos de países com vários fusos, e as ilhas com fuso próprio. */
const TZ_BY_IATA: Record<string, string> = {
  /* Açores (a Madeira é Europe/Lisbon, como o continente). */
  PDL: "Atlantic/Azores",
  TER: "Atlantic/Azores",
  HOR: "Atlantic/Azores",
  PIX: "Atlantic/Azores",
  SMA: "Atlantic/Azores",
  FLW: "Atlantic/Azores",
  /* Canárias. */
  LPA: "Atlantic/Canary",
  TFS: "Atlantic/Canary",
  TFN: "Atlantic/Canary",
  ACE: "Atlantic/Canary",
  FUE: "Atlantic/Canary",
  SPC: "Atlantic/Canary",
  /* Estados Unidos. */
  BOS: "America/New_York",
  JFK: "America/New_York",
  EWR: "America/New_York",
  LGA: "America/New_York",
  PVD: "America/New_York",
  IAD: "America/New_York",
  DCA: "America/New_York",
  BWI: "America/New_York",
  PHL: "America/New_York",
  ATL: "America/New_York",
  MIA: "America/New_York",
  FLL: "America/New_York",
  MCO: "America/New_York",
  CLT: "America/New_York",
  DTW: "America/Detroit",
  ORD: "America/Chicago",
  DFW: "America/Chicago",
  IAH: "America/Chicago",
  MSP: "America/Chicago",
  DEN: "America/Denver",
  PHX: "America/Phoenix",
  LAX: "America/Los_Angeles",
  SFO: "America/Los_Angeles",
  SEA: "America/Los_Angeles",
  /* Canadá. */
  YUL: "America/Toronto",
  YYZ: "America/Toronto",
  YVR: "America/Vancouver",
  /* Brasil. */
  GRU: "America/Sao_Paulo",
  GIG: "America/Sao_Paulo",
  CNF: "America/Sao_Paulo",
  BSB: "America/Sao_Paulo",
  SSA: "America/Bahia",
  REC: "America/Recife",
  FOR: "America/Fortaleza",
  NAT: "America/Fortaleza",
  BEL: "America/Belem",
  MAO: "America/Manaus",
}

/** O nome da cidade, em português quando o sabemos. Vazio sem catálogo. */
export function cityPt(iata: string | null | undefined): string {
  const code = (iata ?? "").trim().toUpperCase()
  if (!code) return ""
  if (CITY_BY_IATA[code]) return CITY_BY_IATA[code]
  const en = cityNames([code])[code] ?? ""
  return CITY_PT[en] ?? en
}

/** O fuso IANA do aeroporto, ou nulo quando não o sabemos dizer. */
export function airportTimeZone(iata: string | null | undefined): string | null {
  const code = (iata ?? "").trim().toUpperCase()
  if (!code) return null
  if (TZ_BY_IATA[code]) return TZ_BY_IATA[code]
  const airport = airportByIata(code)
  return airport ? (TZ_BY_COUNTRY[airport.country] ?? null) : null
}

/** O desvio do fuso face a UTC, em minutos, naquele instante. */
function offsetMinutes(timeZone: string, utc: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utc))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"))
  return Math.round((asUtc - utc) / 60000)
}

/** "2026-10-22T14:00" na hora local de um aeroporto → instante UTC. */
export function localToUtc(value: string | null, timeZone: string | null): number | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  if (!timeZone) return naive
  /* Duas passagens: o desvio certo é o do instante real, e o primeiro palpite
     (o desvio à hora "ingénua") só falha na própria hora da mudança. */
  let utc = naive - offsetMinutes(timeZone, naive) * 60000
  utc = naive - offsetMinutes(timeZone, utc) * 60000
  return utc
}

/**
 * A duração real de um voo, com o fuso de cada ponta.
 *
 * Sem fuso numa das pontas, a diferença entre os relógios (o que o ecrã da
 * companhia mostra) — melhor do que nada, e é o que o resto do sistema já faz.
 */
export function flightMinutes(
  origin: string | null,
  departAt: string | null,
  destination: string | null,
  arriveAt: string | null
): number | null {
  const fromTz = airportTimeZone(origin)
  const toTz = airportTimeZone(destination)
  const known = Boolean(fromTz && toTz)
  const from = localToUtc(departAt, known ? fromTz : null)
  const to = localToUtc(arriveAt, known ? toTz : null)
  if (from === null || to === null) return null
  const diff = Math.round((to - from) / 60000)
  return diff >= 0 ? diff : null
}
