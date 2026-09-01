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
