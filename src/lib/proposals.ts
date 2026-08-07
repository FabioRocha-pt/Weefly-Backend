/**
 * WeeFly propostas — acesso a dados.
 *
 * Mesma divisão que booking-cases.ts: as leituras do back-office passam pelo
 * cliente com sessão e são filtradas pelo RLS; as do cliente final passam pelo
 * service role, porque quem abre o link não tem sessão nenhuma e o token é a
 * credencial.
 *
 * A diferença que interessa está nas colunas: `cost_total` é o custo no
 * consolidador e nunca sai daqui. As leituras públicas nem sequer o pedem, para
 * que nenhum descuido de renderização o possa deixar escapar para o HTML.
 *
 * SÓ SERVIDOR.
 */

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import type {
  AdminOffer,
  Offer,
  PaxCounts,
  Proposal,
} from "@/lib/proposal-math"

const SEGMENT_COLUMNS = `
  segments:case_offer_segments (
    id, direction, position, carrier_code, flight_number, equipment,
    booking_class, cabin, origin, destination, depart_at, arrive_at,
    terminal_from, terminal_to
  )
`

const OFFER_PUBLIC_COLUMNS = `
  id, position, name, include_in_proposal,
  is_recommended, is_cheapest, is_fastest,
  fare_name, baggage_cabin, baggage_hold, change_policy, refund_policy,
  seat_policy, documents,
  price_adult, price_child, price_infant, taxes_total, service_fee,
  lock_fee, lock_fee_enabled, valid_until, agent_note,
  ${SEGMENT_COLUMNS}
`

const OFFER_ADMIN_COLUMNS = `${OFFER_PUBLIC_COLUMNS}, cost_total`

const PROPOSAL_COLUMNS = `
  id, case_id, revision, status, currency, opening_message,
  published_at, selected_offer_id, selected_at
`

export interface AdminProposalView {
  proposal: Proposal
  offers: AdminOffer[]
}

export interface PublicProposalView {
  proposal: Proposal
  offers: Offer[]
}

function sortOffers<T extends { position: number; segments: unknown[] }>(
  rows: T[]
): T[] {
  return rows
    .map((o) => ({
      ...o,
      segments: (o.segments ?? []) as T["segments"],
    }))
    .sort((a, b) => a.position - b.position)
}

/**
 * Quantos viajam, a partir do que o cliente declarou no link 1.
 *
 * Sem link 1 submetido o vendedor pode estar a cotar a partir de uma conversa
 * de WhatsApp: um adulto é o mínimo que faz a aritmética do preço funcionar,
 * e o vendedor corrige as tarifas unitárias em conformidade.
 */
export function paxOf(
  trip: { adults: number; children: number; infants: number } | null
): PaxCounts {
  if (!trip) return { adults: 1, children: 0, infants: 0 }
  return {
    adults: trip.adults,
    children: trip.children,
    infants: trip.infants,
  }
}

// --- Back-office (RLS) -------------------------------------------------------

export async function getProposal(
  caseId: string
): Promise<AdminProposalView | null> {
  const supabase = createClient()

  const { data: proposal, error } = await supabase
    .from("case_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("case_id", caseId)
    .maybeSingle()

  if (error) {
    console.error("[proposals] getProposal failed:", error)
    return null
  }
  if (!proposal) return null

  const { data: offers } = await supabase
    .from("case_offers")
    .select(OFFER_ADMIN_COLUMNS)
    .eq("proposal_id", (proposal as { id: string }).id)
    .order("position")

  return {
    proposal: proposal as unknown as Proposal,
    offers: sortOffers((offers ?? []) as unknown as AdminOffer[]),
  }
}

/**
 * A proposta do caso, criada na primeira visita ao compositor.
 *
 * Criar em vez de exigir um "criar proposta" explícito: abrir o separador
 * Ofertas já é a declaração de intenção, e um botão a mais entre o vendedor e o
 * primeiro campo é um botão a mais.
 */
export async function ensureProposal(
  caseId: string,
  currency = "CVE"
): Promise<AdminProposalView | null> {
  const existing = await getProposal(caseId)
  if (existing) return existing

  const supabase = createClient()
  const { error } = await supabase
    .from("case_proposals")
    .insert({ case_id: caseId, currency })

  if (error) {
    // Corrida entre dois separadores abertos: o unique em case_id resolve-a,
    // e a leitura a seguir devolve a que ganhou.
    if (error.code !== "23505") {
      console.error("[proposals] ensureProposal failed:", error)
      return null
    }
  }

  return getProposal(caseId)
}

// --- Cliente final (token, service role) -------------------------------------

/**
 * A proposta publicada de um caso.
 *
 * Devolve null enquanto estiver em rascunho — incluindo durante uma revisão em
 * curso. É deliberado: entre carregar em "Nova revisão" e voltar a publicar, o
 * cliente vê uma mensagem de espera em vez de preços a meio de serem mexidos.
 */
export async function getPublishedProposal(
  caseId: string
): Promise<PublicProposalView | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data: proposal } = await admin
    .from("case_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("case_id", caseId)
    .eq("status", "publicada")
    .maybeSingle()

  if (!proposal) return null

  const { data: offers } = await admin
    .from("case_offers")
    .select(OFFER_PUBLIC_COLUMNS)
    .eq("proposal_id", (proposal as { id: string }).id)
    .eq("include_in_proposal", true)
    .order("position")

  return {
    proposal: proposal as unknown as Proposal,
    offers: sortOffers((offers ?? []) as unknown as Offer[]),
  }
}

/**
 * Regista a opção escolhida pelo cliente.
 *
 * Verifica que a oferta pertence mesmo à proposta publicada deste caso: o id
 * chega de um formulário e um id de outro caso não pode passar a escolha para
 * um sítio onde não pertence.
 */
export async function recordOfferSelection(
  caseId: string,
  offerId: string
): Promise<{ offer: Offer; currency: string } | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const view = await getPublishedProposal(caseId)
  if (!view) return null

  const offer = view.offers.find((o) => o.id === offerId)
  if (!offer) return null

  const { error } = await admin
    .from("case_proposals")
    .update({
      selected_offer_id: offer.id,
      selected_at: new Date().toISOString(),
    })
    .eq("id", view.proposal.id)

  if (error) {
    console.error("[proposals] recordOfferSelection failed:", error)
    return null
  }

  return { offer, currency: view.proposal.currency }
}

/**
 * Alinha o pedido de pagamento com a opção escolhida.
 *
 * Trocar de opção antes de pagar é um direito que a página do cliente dá
 * explicitamente ("Trocar de opção"), por isso isto reescreve o valor de um
 * pagamento ainda por liquidar em vez de criar um segundo. Um pagamento já
 * concluído nunca é tocado — a essa altura a escolha deixou de ser reversível
 * sem alguém falar com o cliente.
 */
export async function syncPaymentToOffer(
  caseId: string,
  amount: number,
  currency: string,
  description: string
): Promise<void> {
  const admin = createAdminClient()
  if (!admin || amount <= 0) return

  const { data: existing } = await admin
    .from("case_payments")
    .select("id, status")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const settled = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"]
  if (existing && settled.includes((existing as { status: string }).status)) {
    return
  }

  if (existing) {
    await admin
      .from("case_payments")
      .update({ amount, currency, description })
      .eq("id", (existing as { id: string }).id)
    return
  }

  await admin.from("case_payments").insert({
    case_id: caseId,
    amount,
    currency,
    description,
    status: "STARTED",
    idempotency_key: `case_${caseId}_${Date.now()}`,
  })
}
