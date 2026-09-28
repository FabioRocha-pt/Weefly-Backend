/**
 * WeeFly — o Amadeus a preparar o terreno para o agente.
 *
 * Quando um caso nasce de uma conversa, corre-se a pesquisa e escreve-se o
 * resultado como oferta rascunho da proposta. O agente abre o separador Ofertas
 * e encontra trechos, horários e uma ordem de grandeza já escritos, em vez de
 * uma folha em branco.
 *
 * O cliente nunca vê nada disto. A oferta nasce com `include_in_proposal` a
 * false e a proposta em rascunho: enquanto ninguém publicar, não existe do lado
 * de fora. É o que distingue este desenho do anterior, em que o bot atirava
 * preços do Amadeus ao cliente e o agente ficava depois a parecer caro.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { getFlightOffers } from "@/lib/amadeus"
import { DEFAULT_SERVICE_FEE } from "@/lib/pc/catalog"
import type { FlightSearchInput } from "@/lib/flight-parse"
import type {
  AmadeusBagAllowance,
  AmadeusFlightOffer,
  FormattedFlightOffer,
} from "@/types/flights"

/** Vocabulário de cabina: o do Amadeus não é o da nossa base de dados. */
const CABIN: Record<string, string> = {
  ECONOMY: "economy",
  PREMIUM_ECONOMY: "premium_economy",
  BUSINESS: "business",
  FIRST: "first",
}

/** "2026-09-14T08:40:00" → "2026-09-14T08:40". Hora local, sem fuso. */
function naive(value: string | undefined): string | null {
  if (!value) return null
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  return match ? `${match[1]}T${match[2]}` : null
}

/**
 * Divide o total do Amadeus por passageiro.
 *
 * Grosseiro de propósito: o Amadeus devolve um total para o grupo, e reparti-lo
 * por tipo de passageiro exigiria o `travelerPricings`, que nem sempre vem. O
 * agente vai corrigir estes valores com o que a companhia lhe disser ao
 * telefone — o que se está a poupar aqui é a transcrição do itinerário, não a
 * negociação do preço.
 */
function splitPrice(
  totalMinor: number,
  pax: { adults: number; children: number; infants: number }
): { adult: number; child: number } {
  const units = pax.adults + pax.children * 0.8 + pax.infants * 0.1
  if (units <= 0) return { adult: totalMinor, child: 0 }
  const adult = Math.round(totalMinor / units)
  return { adult, child: Math.round(adult * 0.8) }
}

export async function prefillProposalFromSearch(input: {
  caseId: string
  search: FlightSearchInput
}): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin) return false

  let offers: FormattedFlightOffer[]
  let raw: AmadeusFlightOffer[]
  let source: "amadeus" | "mock"
  try {
    const result = await getFlightOffers(input.search)
    offers = result.offers
    raw = result.raw
    source = result.source
  } catch (err) {
    console.error("[prefill] pesquisa falhou:", err)
    return false
  }

  if (offers.length === 0) return false

  // A melhor por pontuação, não a mais barata: é a que o agente teria escolhido
  // como ponto de partida, e o preço é o que ele vai corrigir de qualquer modo.
  const best = offers[0]
  const rawOffer = raw.find((o) => o.id === best.id) ?? null

  const { data: proposal, error: proposalError } = await admin
    .from("case_proposals")
    .insert({
      case_id: input.caseId,
      currency: best.price.currency,
    })
    .select("id")
    .single()

  if (proposalError || !proposal) {
    // 23505 = já existe proposta neste caso; nada a fazer, o agente já lá esteve.
    if (proposalError?.code !== "23505") {
      console.error("[prefill] criação da proposta falhou:", proposalError)
    }
    return false
  }

  const totalMinor = Math.round(best.price.total * 100)
  const pax = {
    adults: input.search.adults,
    children: input.search.children,
    infants: input.search.infants,
  }
  const { adult, child } = splitPrice(totalMinor, pax)

  const { data: offer, error: offerError } = await admin
    .from("case_offers")
    .insert({
      proposal_id: proposal.id,
      position: 0,
      name: `${best.itineraries[0]?.carrierName ?? "Sugestão"} · rascunho automático`,
      /* Nasce fora da proposta. O agente marca a caixa no painel de publicação
         depois de conferir os valores — nunca antes. */
      include_in_proposal: false,
      /*
       * PC-06a · as horas vieram de uma pesquisa e ninguém olhou para elas.
       *
       * É o único sítio da aplicação que escreve isto a `false`. Uma oferta
       * composta à mão tem as horas que quem a compôs lá pôs; esta tem as que a
       * pesquisa devolveu, e entre a pesquisa e a proposta pode ter mudado
       * qualquer coisa. O painel de publicação não deixa sair enquanto alguém
       * não as reconhecer.
       */
      times_confirmed: false,
      price_adult: adult,
      price_child: pax.children > 0 ? child : 0,
      price_infant: 0,
      taxes_total: 0,
      /* C-08 · o serviço nasce a 20, como em qualquer outra oferta. Estava a
         zero aqui, e só aqui — ver `DEFAULT_SERVICE_FEE`. */
      service_fee: DEFAULT_SERVICE_FEE,
      cost_total: totalMinor,
      agent_note:
        source === "mock"
          ? "Rascunho gerado com dados de demonstração (Amadeus não configurado). Confirmar tudo antes de publicar."
          : "Rascunho automático a partir da pesquisa Amadeus. Confirmar horários, condições e preço com a companhia antes de publicar.",
    })
    .select("id")
    .single()

  if (offerError || !offer) {
    console.error("[prefill] criação da oferta falhou:", offerError)
    return false
  }

  const rows = rawOffer
    ? segmentsFromRaw(rawOffer, offer.id)
    : segmentsFromFormatted(best, offer.id, input.search.cabinClass)

  if (rows.length > 0) {
    const { data: inserted, error } = await admin
      .from("case_offer_segments")
      .insert(rows)
      .select("id, direction, position")
    if (error) console.error("[prefill] inserção dos trechos falhou:", error)

    if (rawOffer && inserted) {
      await prefillSegmentBaggage(
        admin,
        rawOffer,
        inserted as { id: string; direction: string; position: number }[]
      )
    }
  }

  return true
}

/**
 * T-10 · a franquia que o Amadeus diz que cada voo inclui.
 *
 * Vem em `travelerPricings[].fareDetailsBySegment[]`, por passageiro e por
 * trecho. Lê-se o do primeiro passageiro — é um adulto em todas as pesquisas
 * que o concierge faz — porque a linha de `case_offer_segment_baggage` é a
 * promessa do voo, não a de cada pessoa.
 *
 * O Amadeus escreve a franquia de duas maneiras: em peças (`quantity`) ou em
 * peso (`weight`, o conceito de peso de algumas companhias africanas e
 * europeias). O segundo passa a uma peça com esse peso, que é como o balcão o
 * lê. Sem nada escrito, o voo fica sem linha e o compositor pede-a a partir do
 * pedido do cliente — melhor do que inventar um zero.
 *
 * Uma falha aqui não desfaz o rascunho: a bagagem é a parte do rascunho que o
 * agente confirma de qualquer forma.
 */
async function prefillSegmentBaggage(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  offer: AmadeusFlightOffer,
  inserted: { id: string; direction: string; position: number }[]
): Promise<void> {
  const details = offer.travelerPricings?.[0]?.fareDetailsBySegment ?? []
  if (details.length === 0) return
  const bySegment = new Map(details.map((d) => [d.segmentId, d]))
  const target = new Map(inserted.map((r) => [`${r.direction}:${r.position}`, r.id]))

  const kg = (bag: AmadeusBagAllowance | undefined): number | null =>
    bag?.weight && (!bag.weightUnit || /^KG/i.test(bag.weightUnit))
      ? Math.min(bag.weight, 50)
      : null
  const pieces = (bag: AmadeusBagAllowance | undefined): number | null => {
    if (!bag) return null
    if (typeof bag.quantity === "number") return Math.max(0, Math.min(bag.quantity, 9))
    if (bag.weight) return 1
    return null
  }

  const rows: Record<string, unknown>[] = []
  offer.itineraries.slice(0, 2).forEach((itinerary, index) => {
    const direction = index === 0 ? "ida" : "volta"
    itinerary.segments.forEach((segment, position) => {
      const detail = bySegment.get(segment.id)
      const segmentId = target.get(`${direction}:${position}`)
      if (!detail || !segmentId) return
      const checked = pieces(detail.includedCheckedBags)
      if (checked === null) return
      const cabin = pieces(detail.includedCabinBags)
      rows.push({
        segment_id: segmentId,
        personal_item: true,
        cabin_pieces: cabin ?? 1,
        cabin_kg: kg(detail.includedCabinBags),
        checked_pieces: checked,
        checked_kg: checked > 0 ? kg(detail.includedCheckedBags) : null,
      })
    })
  })

  if (rows.length === 0) return
  const { error } = await admin.from("case_offer_segment_baggage").insert(rows)
  if (error) console.error("[prefill] bagagem por voo não gravada:", error)
}

/** O caminho bom: um trecho por segmento real do itinerário. */
function segmentsFromRaw(offer: AmadeusFlightOffer, offerId: string) {
  const rows: Record<string, unknown>[] = []
  offer.itineraries.forEach((itinerary, index) => {
    // O Amadeus devolve [ida] ou [ida, volta]; um terceiro itinerário seria
    // multi-destino, que o compositor ainda não modela.
    const direction = index === 0 ? "ida" : "volta"
    if (index > 1) return
    itinerary.segments.forEach((segment, position) => {
      rows.push({
        offer_id: offerId,
        direction,
        position,
        carrier_code: segment.carrierCode ?? null,
        flight_number: segment.number ?? null,
        equipment: segment.aircraft?.code ?? null,
        cabin: "economy",
        origin: segment.departure?.iataCode ?? null,
        destination: segment.arrival?.iataCode ?? null,
        depart_at: naive(segment.departure?.at),
        arrive_at: naive(segment.arrival?.at),
        terminal_from: segment.departure?.terminal ?? null,
        terminal_to: segment.arrival?.terminal ?? null,
      })
    })
  })
  return rows
}

/**
 * O caminho degradado, para quando não há resposta crua (o mock).
 *
 * Escreve um trecho por perna, com as pontas certas. Se o itinerário tinha
 * escalas, elas perdem-se — e é por isso que a nota da oferta manda conferir
 * tudo. Um rascunho incompleto que o agente corrige vale mais do que nenhum;
 * um rascunho incompleto que ele não sabe que está incompleto não vale nada,
 * daí o aviso ficar escrito na própria oferta.
 */
function segmentsFromFormatted(
  offer: FormattedFlightOffer,
  offerId: string,
  cabinClass: string
) {
  return offer.itineraries.slice(0, 2).map((itinerary, index) => ({
    offer_id: offerId,
    direction: index === 0 ? "ida" : "volta",
    position: 0,
    carrier_code: itinerary.carrierCode ?? null,
    flight_number: null,
    equipment: null,
    cabin: CABIN[cabinClass] ?? "economy",
    origin: itinerary.departure?.iataCode ?? null,
    destination: itinerary.arrival?.iataCode ?? null,
    depart_at: naive(itinerary.departure?.at),
    arrive_at: naive(itinerary.arrival?.at),
    terminal_from: null,
    terminal_to: null,
  }))
}
