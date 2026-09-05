/**
 * EM-01 · o lugar de cada passageiro em cada voo.
 *
 * `case_passengers.seat_outbound` e `seat_inbound` chegavam para uma viagem
 * direta e mentiam em tudo o resto: numa ida com escala há dois voos, e o lugar
 * do segundo não é o do primeiro. O bilhete que o EM-02 descreve repete a
 * etiqueta do passageiro **dentro de cada voo**, com o lugar desse voo — e sem
 * uma linha por par (passageiro, trecho) não há de onde a tirar.
 *
 * As duas colunas antigas continuam a ser escritas, com o primeiro lugar de
 * cada sentido. São o que a página do cliente e o back-office já leem, e uma
 * migração de dados que as apagasse deixaria os casos emitidos sem lugares
 * enquanto o resto do código não fosse atrás.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"

export interface PassengerSeat {
  passenger_id: string
  segment_id: string
  seat: string | null
}

export async function listPassengerSeats(
  caseId: string
): Promise<PassengerSeat[]> {
  const admin = createAdminClient()
  if (!admin) return []

  const { data } = await admin
    .from("case_passenger_seats")
    .select("passenger_id, segment_id, seat")
    .eq("case_id", caseId)

  return (data ?? []) as PassengerSeat[]
}

/**
 * Grava os lugares, substituindo o conjunto inteiro.
 *
 * Substituir e não fundir, pela mesma razão que os passageiros: o itinerário
 * pode ter mudado entre duas gravações, e um `upsert` por par deixaria linhas de
 * trechos que já não existem — lugares num voo que ninguém vai apanhar.
 *
 * Um lugar vazio não gera linha. "Por atribuir" e "vazio" são a mesma coisa
 * aqui, e guardar uma linha nula era ocupar espaço para dizer nada.
 */
export async function savePassengerSeats(
  caseId: string,
  seats: { passengerId: string; segmentId: string; seat: string }[]
): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin) return false

  await admin.from("case_passenger_seats").delete().eq("case_id", caseId)

  const rows = seats
    .filter((s) => s.seat.trim())
    .map((s) => ({
      case_id: caseId,
      passenger_id: s.passengerId,
      segment_id: s.segmentId,
      seat: s.seat.trim().toUpperCase().slice(0, 6),
    }))

  if (rows.length === 0) return true

  const { error } = await admin.from("case_passenger_seats").insert(rows)
  if (error) {
    console.error("[issuance] lugares não gravados:", error.message)
    return false
  }
  return true
}

// ── T-04 · os campos do documento, por voo ───────────────────────────────────

/**
 * T-04 · "o ecrã de emissão só permite introduzir a ida".
 *
 * A causa não era o ecrã: era a forma dos dados. `booking_cases` tem **um**
 * `fare_basis`, **um** `nvb`, **um** `nva`. Um bilhete de ida e volta tem um
 * cupão por voo, e cada cupão tem a sua base tarifária e as suas validades — a
 * ida pode ser TLXCV3 e a volta YLOWCV. Com uma coluna só não havia onde
 * escrever a segunda, e por isso o ecrã só perguntava uma vez.
 *
 * `case_segment_issuance` (migração 0019) é uma linha por trecho da oferta
 * escolhida. As colunas antigas continuam a ser escritas com o valor do
 * primeiro voo: são o que os casos já emitidos têm e o que o PDF antigo lê.
 */
export interface SegmentIssuance {
  segment_id: string
  fare_basis: string | null
  nvb: string | null
  nva: string | null
  coupon_number: string | null
  aircraft: string | null
  cabin: string | null
  booking_class: string | null
  terminal_from: string | null
  terminal_to: string | null
  airline_pnr: string | null
  segment_status: string
  baggage_through: boolean | null
}

const SEGMENT_COLUMNS = `
  segment_id, fare_basis, nvb, nva, coupon_number, aircraft, cabin,
  booking_class, terminal_from, terminal_to, airline_pnr, segment_status,
  baggage_through
`

export async function listSegmentIssuance(
  caseId: string
): Promise<SegmentIssuance[]> {
  const admin = createAdminClient()
  if (!admin) return []

  const { data, error } = await admin
    .from("case_segment_issuance")
    .select(SEGMENT_COLUMNS)
    .eq("case_id", caseId)

  if (error) {
    /* A migração 0019 pode ainda não estar aplicada. O ecrã continua a abrir
       com os campos vazios em vez de rebentar — e a linha no log diz porquê. */
    console.error("[issuance] leitura por trecho falhou:", error.message)
    return []
  }

  return (data ?? []) as SegmentIssuance[]
}

/**
 * Grava os campos do documento de cada voo.
 *
 * `upsert` por `(case_id, segment_id)` e não apagar-e-inserir: ao contrário dos
 * lugares, isto é reescrito numa correcção depois de emitido, e apagar tudo
 * primeiro deixaria uma janela em que o bilhete não tem cupões nenhuns — que é
 * exactamente o instante em que alguém pode estar a gerar o PDF.
 */
export async function saveSegmentIssuance(
  caseId: string,
  rows: {
    segmentId: string
    fareBasis?: string | null
    nvb?: string | null
    nva?: string | null
    couponNumber?: string | null
    aircraft?: string | null
    cabin?: string | null
    bookingClass?: string | null
    terminalFrom?: string | null
    terminalTo?: string | null
    airlinePnr?: string | null
    segmentStatus?: string | null
    baggageThrough?: boolean | null
  }[]
): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin || rows.length === 0) return true

  const clean = (value: string | null | undefined, max = 40) =>
    value?.trim() ? value.trim().slice(0, max) : null

  const { error } = await admin.from("case_segment_issuance").upsert(
    rows.map((row) => ({
      case_id: caseId,
      segment_id: row.segmentId,
      fare_basis: clean(row.fareBasis),
      nvb: clean(row.nvb, 20),
      nva: clean(row.nva, 20),
      coupon_number: clean(row.couponNumber, 20),
      aircraft: clean(row.aircraft, 60),
      cabin: clean(row.cabin, 30),
      booking_class: clean(row.bookingClass, 4),
      terminal_from: clean(row.terminalFrom, 12),
      terminal_to: clean(row.terminalTo, 12),
      airline_pnr: clean(row.airlinePnr, 12),
      segment_status: clean(row.segmentStatus, 20) ?? "confirmed",
      baggage_through: row.baggageThrough ?? null,
    })),
    { onConflict: "case_id,segment_id" }
  )

  if (error) {
    console.error("[issuance] campos por trecho não gravados:", error.message)
    return false
  }
  return true
}

// ── T-04 e T-10 · a bagagem por passageiro e por voo ─────────────────────────

export interface PassengerBaggage {
  passenger_id: string
  segment_id: string
  checked_pieces: number
  checked_kg: number | null
  cabin_pieces: number
  cabin_kg: number | null
}

export async function listPassengerBaggage(
  caseId: string
): Promise<PassengerBaggage[]> {
  const admin = createAdminClient()
  if (!admin) return []

  const { data, error } = await admin
    .from("case_passenger_baggage")
    .select("passenger_id, segment_id, checked_pieces, checked_kg, cabin_pieces, cabin_kg")
    .eq("case_id", caseId)

  if (error) {
    console.error("[issuance] leitura da bagagem falhou:", error.message)
    return []
  }

  return (data ?? []) as PassengerBaggage[]
}

/**
 * T-10 · "uma mala à ida e nenhuma à volta" tem de caber nos dados.
 *
 * Substitui o conjunto, como os lugares: a bagagem só faz sentido contra o
 * itinerário que está lá agora, e um trecho que saiu da oferta não pode deixar
 * para trás a mala que alguém lhe atribuiu.
 */
export async function savePassengerBaggage(
  caseId: string,
  rows: {
    passengerId: string
    segmentId: string
    checkedPieces: number
    checkedKg?: number | null
    cabinPieces: number
    cabinKg?: number | null
  }[]
): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin) return false

  await admin.from("case_passenger_baggage").delete().eq("case_id", caseId)

  if (rows.length === 0) return true

  const { error } = await admin.from("case_passenger_baggage").insert(
    rows.map((row) => ({
      case_id: caseId,
      passenger_id: row.passengerId,
      segment_id: row.segmentId,
      checked_pieces: Math.max(0, Math.min(9, Math.trunc(row.checkedPieces))),
      checked_kg: row.checkedKg ?? null,
      cabin_pieces: Math.max(0, Math.min(9, Math.trunc(row.cabinPieces))),
      cabin_kg: row.cabinKg ?? null,
    }))
  )

  if (error) {
    console.error("[issuance] bagagem não gravada:", error.message)
    return false
  }
  return true
}
