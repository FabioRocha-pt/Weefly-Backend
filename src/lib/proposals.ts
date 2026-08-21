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
 * Uma proposta, as suas ofertas e os trechos de cada oferta vêm num só pedido
 * ao PostgREST. Eram três tabelas em duas idas à base de dados; daqui até à
 * região do Supabase cada ida custa uma fração de segundo que o vendedor sente
 * ao abrir o compositor, e a segunda consulta nunca precisou do resultado da
 * primeira para saber o que pedir.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

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

/**
 * `case_proposals` tem DUAS chaves estrangeiras para `case_offers`: a das
 * ofertas da proposta e a `selected_offer_id`. Sem nomear a que interessa, o
 * PostgREST recusa o embed (PGRST201) por não saber qual delas seguir.
 */
const OFFERS_EMBED_FK = "case_offers!case_offers_proposal_id_fkey"

function proposalSelect(offerColumns: string): string {
  return `${PROPOSAL_COLUMNS}, offers:${OFFERS_EMBED_FK} (${offerColumns})`
}

export interface AdminProposalView {
  proposal: Proposal
  offers: AdminOffer[]
}

export interface PublicProposalView {
  proposal: Proposal
  offers: Offer[]
}

/**
 * Porque é que abrir a proposta falhou.
 *
 * Existe porque a mensagem que o compositor mostrava — "verifique se a migração
 * 0005 foi aplicada" — era um palpite: o código não distinguia uma tabela que
 * não existe de uma escrita recusada pelo RLS, e culpava sempre a migração. A
 * causa muda o que o vendedor tem de fazer a seguir (recarregar, pedir acesso,
 * ou chamar quem aplica migrações), por isso passa a viajar com o erro.
 */
export type ProposalFailure =
  | "no_session"
  | "denied"
  | "schema_missing"
  | "unknown"

type ProposalRead =
  | { ok: true; view: AdminProposalView | null }
  | { ok: false; reason: ProposalFailure; detail?: string }

export type EnsureProposalResult =
  | { ok: true; view: AdminProposalView }
  | { ok: false; reason: ProposalFailure; detail?: string }

/** Tabela ou coluna inexistente: a migração não passou por esta base de dados. */
const MISSING_SCHEMA = new Set(["42P01", "42703", "PGRST204", "PGRST205"])

/**
 * As ofertas e os trechos vêm de um embed, e um embed não tem ordem garantida —
 * a consulta antiga só ordenava as ofertas. Ordenar aqui é mais barato do que
 * dois parâmetros de ordenação encadeados e cobre também os trechos, que antes
 * dependiam da ordem de inserção.
 */
function sortOffers<T extends { position: number; segments: unknown[] }>(
  rows: T[]
): T[] {
  return rows
    .map((o) => ({
      ...o,
      segments: ((o.segments ?? []) as { position: number }[])
        .slice()
        .sort((a, b) => a.position - b.position) as T["segments"],
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

async function readProposal(caseId: string): Promise<ProposalRead> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from("case_proposals")
    .select(proposalSelect(OFFER_ADMIN_COLUMNS))
    .eq("case_id", caseId)
    .maybeSingle()

  if (error) {
    console.error("[proposals] readProposal failed:", error)
    if (MISSING_SCHEMA.has(error.code)) {
      return { ok: false, reason: "schema_missing", detail: error.message }
    }
    return { ok: false, reason: "unknown", detail: error.message }
  }
  if (!data) return { ok: true, view: null }

  const { offers, ...proposal } = data as unknown as Proposal & {
    offers?: AdminOffer[]
  }

  return {
    ok: true,
    view: {
      proposal: proposal as Proposal,
      offers: sortOffers((offers ?? []) as AdminOffer[]),
    },
  }
}

/**
 * Uma leitura por render, partilhada pelo layout do caso e pelo compositor.
 *
 * Os dois pedem a mesma proposta ao abrir o separador Ofertas, e sem isto eram
 * duas idas ao Postgres para a mesma resposta. As server actions continuam em
 * `getProposal`, sem cache, de propósito: uma ação escreve e a página volta a
 * renderizar dentro do mesmo pedido, e um valor guardado antes da escrita
 * apareceria no ecrã como se a gravação não tivesse acontecido.
 */
const readProposalCached = cache(readProposal)

/* O layout parte do `id` do endereço e a página do `id` que veio da base de
   dados. São o mesmo uuid, mas o cache do React compara a chave literalmente —
   e um `D` maiúsculo no link seria uma consulta a mais sem ninguém notar. */
function renderKey(caseId: string): string {
  return caseId.trim().toLowerCase()
}

export async function getProposal(
  caseId: string
): Promise<AdminProposalView | null> {
  const read = await readProposal(caseId)
  return read.ok ? read.view : null
}

/** Como `getProposal`, mas reaproveitada dentro do mesmo render. */
export async function getProposalForRender(
  caseId: string
): Promise<AdminProposalView | null> {
  const read = await readProposalCached(renderKey(caseId))
  return read.ok ? read.view : null
}

/**
 * A proposta do caso, criada na primeira visita ao compositor.
 *
 * Criar em vez de exigir um "criar proposta" explícito: abrir o separador
 * Ofertas já é a declaração de intenção, e um botão a mais entre o vendedor e o
 * primeiro campo é um botão a mais.
 */
async function ensureWith(
  read: (caseId: string) => Promise<ProposalRead>,
  caseId: string,
  currency: string
): Promise<EnsureProposalResult> {
  const existing = await read(caseId)
  if (!existing.ok) return existing
  if (existing.view) return { ok: true, view: existing.view }

  const supabase = createClient()
  const { data: created, error } = await supabase
    .from("case_proposals")
    .insert({ case_id: caseId, currency })
    .select(PROPOSAL_COLUMNS)
    .single()

  /* Nasceu agora, logo não tem ofertas: a lista vazia é a resposta certa e não
     vale uma segunda ida à base de dados para a confirmar. */
  if (!error && created) {
    return {
      ok: true,
      view: { proposal: created as unknown as Proposal, offers: [] },
    }
  }

  const code = error?.code ?? ""

  // Corrida entre dois separadores abertos: o unique em case_id resolve-a, e a
  // leitura a seguir devolve a que ganhou.
  if (code === "23505") {
    const again = await readProposal(caseId)
    if (!again.ok) return again
    if (again.view) return { ok: true, view: again.view }
    return { ok: false, reason: "unknown", detail: "insert raced, row absent" }
  }

  if (MISSING_SCHEMA.has(code)) {
    return { ok: false, reason: "schema_missing", detail: error?.message }
  }

  /*
   * 42501 é o RLS a recusar a escrita, e há duas razões possíveis com respostas
   * opostas. Ou a sessão não chegou a este render — o token expirou e o cookie
   * novo que o middleware emitiu ainda não voltou do browser — e recarregar
   * resolve; ou a conta abriu o /admin mas não tem linha em `platform_staff`, e
   * aí não há recarregamento que sirva. O `getUser()` só corre neste caminho,
   * por isso não custa nada ao caso normal.
   */
  if (code === "42501") {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    console.error("[proposals] ensureProposal refused by RLS:", {
      caseId,
      hasSession: Boolean(user),
      detail: error?.message,
    })
    return {
      ok: false,
      reason: user ? "denied" : "no_session",
      detail: error?.message,
    }
  }

  console.error("[proposals] ensureProposal failed:", error)
  return { ok: false, reason: "unknown", detail: error?.message }
}

export function ensureProposal(
  caseId: string,
  currency = "CVE"
): Promise<EnsureProposalResult> {
  return ensureWith(readProposal, caseId, currency)
}

/** Como `ensureProposal`, mas aproveita a leitura que o layout já fez. */
export function ensureProposalForRender(
  caseId: string,
  currency = "CVE"
): Promise<EnsureProposalResult> {
  return ensureWith(readProposalCached, renderKey(caseId), currency)
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

  const { data, error } = await admin
    .from("case_proposals")
    .select(proposalSelect(OFFER_PUBLIC_COLUMNS))
    .eq("case_id", caseId)
    .eq("status", "publicada")
    .maybeSingle()

  if (error) {
    console.error("[proposals] getPublishedProposal failed:", error)
    return null
  }
  if (!data) return null

  const { offers, ...proposal } = data as unknown as Proposal & {
    offers?: Offer[]
  }

  /* O `include_in_proposal` é filtrado aqui e não na consulta: um filtro sobre
     o embed obrigaria a um `!inner`, e esse faria a proposta inteira desaparecer
     quando nenhuma oferta estivesse marcada — o cliente leria "ainda não há
     proposta" onde há uma, à espera de o vendedor marcar as opções. */
  return {
    proposal: proposal as Proposal,
    offers: sortOffers(
      ((offers ?? []) as Offer[]).filter((o) => o.include_in_proposal)
    ),
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
