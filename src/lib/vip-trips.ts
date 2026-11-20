/**
 * WeeFly · APP-03 · "Minhas passagens": os pedidos de um cliente VIP.
 *
 * Resolve o `E1` — "o link pessoal volta sempre ao formulário". Os pedidos, as
 * ofertas e os bilhetes do cliente passam a estar na app dele, em três
 * secções:
 *
 *   · **Em curso** · os pedidos ainda sem bilhete, o mais recente em cima;
 *   · **Viagens marcadas** · os bilhetes emitidos de viagens futuras, com o
 *     PDF para abrir (o atalho para os bilhetes);
 *   · **Histórico** · as viagens passadas e os pedidos fechados.
 *
 * O estado de cada pedido não é inventado aqui: é o ecrã que o próprio pedido
 * mostraria (`loadPcState` → `screenFor`), a mesma leitura do `/pc/<token>`.
 * Assim a lista nunca diz uma coisa e o pedido outra.
 *
 * Lido pela service role, sempre pelo `id` do cliente que o endereço resolveu
 * (`resolveVipHandle`) — nunca por um id vindo do browser.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { createAdminClient } from "@/utils/supabase/admin"
import { loadPcState, type PcScreen, type PcState } from "@/lib/pc/state"

export type VipTripSection = "open" | "booked" | "history"

/** O estado como o cliente o lê na lista. As frases estão em `vipApp.trips.status`. */
export type VipTripStatus =
  | "received"
  | "offers"
  | "passengers"
  | "payment"
  | "checking"
  | "paid"
  | "issued"
  | "expired"
  | "cancelled"
  | "closed"

export interface VipTrip {
  token: string
  reference: string
  section: VipTripSection
  status: VipTripStatus
  /** A próxima ação é do cliente: é o que acende o sinal no separador. */
  needsClient: boolean
  origin: string
  destination: string
  originCity: string
  destinationCity: string
  departDate: string
  returnDate: string | null
  trip: PcState["request"]["trip"]
  createdAt: string
  pnr: string | null
  /** O PDF do bilhete está pronto para abrir. */
  ticketReady: boolean
  offersCount: number
}

export interface VipTrips {
  open: VipTrip[]
  booked: VipTrip[]
  history: VipTrip[]
  /** Quantos pedidos em curso esperam por uma ação do cliente. */
  attention: number
}

const EMPTY: VipTrips = { open: [], booked: [], history: [], attention: 0 }

const STATUS_OF: Record<PcScreen, VipTripStatus> = {
  p3: "received",
  p4a: "received",
  p4b: "offers",
  p5: "offers",
  p7: "passengers",
  p7pay: "payment",
  p7b: "checking",
  p8: "expired",
  p9: "issued",
}

const todayISO = () => new Date().toISOString().slice(0, 10)

/** O último dia da viagem: é por ele que uma viagem passa a ser passado. */
function lastTravelDate(request: PcState["request"]): string {
  if (request.trip === "multi") return request.legs[request.legs.length - 1]?.date ?? request.departDate
  return request.returnDate ?? request.departDate
}

function tripOf(state: PcState, closedAt: string | null): VipTrip {
  const r = state.request
  const issued = state.screen === "p9"
  const paid = Boolean(state.payment && (state.payment.status === "COMPLETED" || state.payment.admin_confirmed))

  let status: VipTripStatus = STATUS_OF[state.screen] ?? "received"
  if (state.cancelled) status = "cancelled"
  else if (issued) status = "issued"
  else if (status === "checking" && paid) status = "paid"
  /* Fechado pela equipa sem bilhete (arquivado): não é um pedido em curso. */
  else if (closedAt) status = "closed"

  let section: VipTripSection = "open"
  if (issued) section = lastTravelDate(r) >= todayISO() ? "booked" : "history"
  else if (status === "cancelled" || status === "expired" || status === "closed") section = "history"

  const origin = r.trip === "multi" ? (r.legs[0]?.origin ?? r.origin) : r.origin
  const destination = r.trip === "multi" ? (r.legs[r.legs.length - 1]?.destination ?? r.destination) : r.destination

  return {
    token: state.token,
    reference: r.reference,
    section,
    status,
    needsClient: section === "open" && (status === "offers" || status === "passengers" || status === "payment"),
    origin,
    destination,
    originCity: r.cities[origin] ?? origin,
    destinationCity: r.cities[destination] ?? destination,
    departDate: r.trip === "multi" ? (r.legs[0]?.date ?? r.departDate) : r.departDate,
    returnDate: r.trip === "round" ? r.returnDate : null,
    trip: r.trip,
    createdAt: r.createdAt,
    pnr: state.issued.pnr,
    ticketReady: issued && state.issued.documentReady,
    offersCount: state.offers.length,
  }
}

/**
 * Os pedidos de um cliente VIP, já arrumados. `cache` porque a moldura da app
 * (o sinal no separador) e a página leem o mesmo no mesmo pedido HTTP.
 */
export const loadVipTrips = cache(async (vipClientId: string): Promise<VipTrips> => {
  const admin = createAdminClient()
  if (!admin) return EMPTY

  const { data, error } = await admin
    .from("booking_cases")
    .select("token, created_at, closed_at")
    .eq("vip_client_id", vipClientId)
    .order("created_at", { ascending: false })
    .limit(40)
  if (error) {
    console.error("[vip-trips] pedidos ilegíveis:", error.message)
    return EMPTY
  }

  const rows = (data ?? []) as { token: string; created_at: string; closed_at: string | null }[]
  const states = await Promise.all(
    rows.map(async (row) => {
      const lookup = await loadPcState(row.token)
      return lookup.ok ? tripOf(lookup.state, row.closed_at) : null
    })
  )
  const trips = states.filter((trip): trip is VipTrip => trip !== null)

  const open = trips.filter((trip) => trip.section === "open")
  /* As viagens marcadas pela ordem em que acontecem: a próxima em cima. */
  const booked = trips.filter((trip) => trip.section === "booked").sort((a, b) => a.departDate.localeCompare(b.departDate))
  const history = trips.filter((trip) => trip.section === "history")

  return { open, booked, history, attention: open.filter((trip) => trip.needsClient).length }
})

/**
 * O pedido de um cliente VIP, para abrir dentro da app: só se o caso for
 * mesmo dele. Um token de outro cliente (ou de um pedido público) não existe
 * aqui.
 */
export async function loadVipCase(vipClientId: string, caseToken: string) {
  const admin = createAdminClient()
  if (!admin || !/^[A-Za-z0-9_-]{16,64}$/.test(caseToken)) return null
  const { data } = await admin
    .from("booking_cases")
    .select("id")
    .eq("token", caseToken)
    .eq("vip_client_id", vipClientId)
    .maybeSingle()
  if (!data) return null
  const lookup = await loadPcState(caseToken)
  return lookup.ok ? lookup.state : null
}

/**
 * VIP-01 · APP-03 · o link de um pedido (`/pc/<token>`, o do email) de um
 * cliente VIP ativo leva "ao mesmo sítio": o pedido dentro da app dele.
 * Devolve esse caminho, ou `null` quando o caso não é de um VIP ou o VIP está
 * desativado (o pedido continua então no seu `/pc/<token>`: o histórico fica).
 */
export async function vipCaseAppPath(caseToken: string): Promise<string | null> {
  const admin = createAdminClient()
  if (!admin || !/^[A-Za-z0-9_-]{16,64}$/.test(caseToken)) return null
  const { data, error } = await admin
    .from("booking_cases")
    .select("vip:vip_clients (name, code, active)")
    .eq("token", caseToken)
    .not("vip_client_id", "is", null)
    .maybeSingle()
  if (error || !data) return null
  const vip = Array.isArray((data as any).vip) ? (data as any).vip[0] : (data as any).vip
  if (!vip?.active || !vip.code) return null
  const { vipHandle } = await import("@/lib/vip-address")
  return `/pc/${vipHandle({ name: vip.name, code: vip.code })}/passagens/${caseToken}`
}
