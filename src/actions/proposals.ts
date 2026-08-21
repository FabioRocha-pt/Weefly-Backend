"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Resend } from "resend"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getCase, getCaseByToken, type BookingCaseRow } from "@/lib/booking-cases"
import {
  ensureProposal,
  getProposal,
  getPublishedProposal,
  paxOf,
  recordOfferSelection,
  syncPaymentToOffer,
} from "@/lib/proposals"
import {
  type AdminOffer,
  type Cabin,
  type OfferDirection,
  blockerText,
  offerBlockers,
  offerTotal,
} from "@/lib/proposal-math"
import {
  buildProposalPublishedEmail,
  buildProposalTeamEmail,
} from "@/lib/emails/proposal-published"
import type { CaseStage } from "@/lib/case-status"
import { getI18n, getTranslator, localeForClient } from "@/i18n/server"

export type ProposalActionState = { error: string | null }

const OK: ProposalActionState = { error: null }

// --- Saneamento --------------------------------------------------------------
// Tudo o que entra vem de um formulário do back-office. O RLS já impede quem
// não é staff de escrever, mas não diz nada sobre o *formato*: um preço
// negativo ou uma cabina inventada passariam à mesma se não fossem apanhados
// aqui, e um check constraint a rebentar dá um erro que ninguém percebe.

const CABINS: Cabin[] = ["economy", "premium_economy", "business", "first"]

function text(value: unknown, max = 400): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().slice(0, max)
  return trimmed === "" ? null : trimmed
}

function money(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n < 0) return 0
  // Um teto generoso mas real: 100 milhões em unidades menores. Protege contra
  // uma tecla presa a transformar 545,00 em algo que rebenta o bigint.
  return Math.min(n, 10_000_000_000)
}

function flag(value: unknown): boolean {
  return value === true
}

/** "" (campo datetime-local vazio) tem de virar null, não string vazia. */
function moment(value: unknown): string | null {
  const v = text(value, 40)
  return v && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v) ? v : null
}

function code(value: unknown, max: number): string | null {
  const v = text(value, max)
  return v ? v.toUpperCase() : null
}

export interface SegmentDraft {
  direction: OfferDirection
  carrier_code?: string
  flight_number?: string
  equipment?: string
  booking_class?: string
  cabin?: Cabin
  origin?: string
  destination?: string
  depart_at?: string
  arrive_at?: string
  terminal_from?: string
  terminal_to?: string
}

export interface OfferDraft {
  name?: string
  is_recommended?: boolean
  is_cheapest?: boolean
  is_fastest?: boolean
  fare_name?: string
  baggage_cabin?: string
  baggage_hold?: string
  change_policy?: string
  refund_policy?: string
  seat_policy?: string
  documents?: string
  /** Todos os montantes em unidades menores da moeda da proposta. */
  price_adult?: number
  price_child?: number
  price_infant?: number
  taxes_total?: number
  service_fee?: number
  lock_fee?: number
  lock_fee_enabled?: boolean
  cost_total?: number
  valid_until?: string
  agent_note?: string
  segments?: SegmentDraft[]
}

// --- Guardas ----------------------------------------------------------------

/**
 * Uma proposta publicada é imutável até alguém abrir uma revisão.
 *
 * É a promessa que o aviso do painel de publicação faz ao vendedor, e a razão
 * por que o cliente pode olhar para um preço sem que ele mude debaixo dele.
 */
async function editableProposal(
  caseId: string
): Promise<{ id: string; currency: string } | { error: string }> {
  const { t } = getI18n()
  const view = await getProposal(caseId)
  if (!view) return { error: t("errors.caseHasNoProposal") }
  if (view.proposal.status === "publicada") {
    return {
      error: t("notices.proposalLocked", { revision: view.proposal.revision }),
    }
  }
  return { id: view.proposal.id, currency: view.proposal.currency }
}

/**
 * Os ecrãs do back-office que esta escrita torna desatualizados.
 *
 * Não inclui o /pc do cliente de propósito: essa rota é `force-dynamic` e as
 * consultas ao Supabase vão com `no-store`, por isso o refresh do cliente lê
 * sempre a base de dados. Revalidar aqui não adiantaria nada — o que ele tem em
 * cache está no browser dele, e só o refresh o limpa.
 */
function touch(caseId: string) {
  revalidatePath("/admin/price-checker")
  revalidatePath(`/admin/price-checker/${caseId}`)
  revalidatePath(`/admin/price-checker/${caseId}/ofertas`)
}

// --- Proposta ---------------------------------------------------------------

export async function initProposal(
  caseId: string,
  currency = "CVE"
): Promise<ProposalActionState> {
  const { t } = getI18n()
  if (!caseId) return { error: t("errors.invalidCase") }
  const result = await ensureProposal(caseId, currency)
  if (!result.ok) {
    return {
      error:
        result.reason === "no_session"
          ? t("errors.sessionExpired")
          : t("errors.proposalOpenFailed"),
    }
  }
  touch(caseId)
  return OK
}

export async function saveProposalMeta(
  caseId: string,
  input: { currency?: string; openingMessage?: string }
): Promise<ProposalActionState> {
  const { t } = getI18n()
  const editable = await editableProposal(caseId)
  if ("error" in editable) return editable

  const currency = code(input.currency, 3)
  if (input.currency !== undefined && (!currency || currency.length !== 3)) {
    return { error: t("errors.invalidCurrency") }
  }

  const supabase = createClient()
  const { error } = await supabase
    .from("case_proposals")
    .update({
      ...(currency ? { currency } : {}),
      ...(input.openingMessage !== undefined
        ? { opening_message: text(input.openingMessage, 2000) }
        : {}),
    })
    .eq("id", editable.id)

  if (error) {
    console.error("[proposals] saveProposalMeta failed:", error)
    return { error: t("errors.saveFailed") }
  }
  touch(caseId)
  return OK
}

// --- Ofertas ----------------------------------------------------------------

export async function addOffer(caseId: string): Promise<ProposalActionState> {
  const { t } = getI18n()
  const editable = await editableProposal(caseId)
  if ("error" in editable) return editable

  const supabase = createClient()
  const { data: last } = await supabase
    .from("case_offers")
    .select("position")
    .eq("proposal_id", editable.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = ((last as { position: number } | null)?.position ?? -1) + 1

  const { data: offer, error } = await supabase
    .from("case_offers")
    .insert({ proposal_id: editable.id, position, name: "" })
    .select("id")
    .single()

  if (error) {
    console.error("[proposals] addOffer failed:", error)
    return { error: t("errors.offerCreateFailed") }
  }

  // Um trecho de ida em branco, porque uma oferta sem nenhum é um ecrã vazio
  // com um botão — e toda a gente vai carregar nesse botão a seguir.
  await supabase
    .from("case_offer_segments")
    .insert({ offer_id: offer.id, direction: "ida", position: 0 })

  touch(caseId)
  return OK
}

export async function duplicateOffer(
  caseId: string,
  offerId: string
): Promise<ProposalActionState> {
  const { t } = getI18n()
  const editable = await editableProposal(caseId)
  if ("error" in editable) return editable

  const supabase = createClient()
  const { data: source } = await supabase
    .from("case_offers")
    .select("*, segments:case_offer_segments (*)")
    .eq("id", offerId)
    .eq("proposal_id", editable.id)
    .maybeSingle()

  if (!source) return { error: t("errors.offerNotFound") }

  const row = source as Record<string, unknown>
  const segments = (row.segments ?? []) as Record<string, unknown>[]

  const { data: last } = await supabase
    .from("case_offers")
    .select("position")
    .eq("proposal_id", editable.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const {
    id: _id,
    segments: _segments,
    created_at: _created,
    updated_at: _updated,
    ...fields
  } = row

  const { data: copy, error } = await supabase
    .from("case_offers")
    .insert({
      ...fields,
      position: ((last as { position: number } | null)?.position ?? -1) + 1,
      name: `${(row.name as string) || t("chatProposal.unnamedOffer")} (${t("common.copy").toLowerCase()})`,
      // Duas ofertas recomendadas ao mesmo tempo não querem dizer nada ao
      // cliente. A cópia nasce sem etiquetas e o vendedor decide.
      is_recommended: false,
      is_cheapest: false,
      is_fastest: false,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[proposals] duplicateOffer failed:", error)
    return { error: t("errors.offerDuplicateFailed") }
  }

  if (segments.length > 0) {
    await supabase.from("case_offer_segments").insert(
      segments.map((s) => {
        const {
          id: _sid,
          offer_id: _oid,
          created_at: _sc,
          updated_at: _su,
          ...rest
        } = s
        return { ...rest, offer_id: copy.id }
      })
    )
  }

  touch(caseId)
  return OK
}

export async function removeOffer(
  caseId: string,
  offerId: string
): Promise<ProposalActionState> {
  const { t } = getI18n()
  const editable = await editableProposal(caseId)
  if ("error" in editable) return editable

  const supabase = createClient()
  const { error } = await supabase
    .from("case_offers")
    .delete()
    .eq("id", offerId)
    .eq("proposal_id", editable.id)

  if (error) {
    console.error("[proposals] removeOffer failed:", error)
    return { error: t("errors.offerRemoveFailed") }
  }
  touch(caseId)
  return OK
}

/** Reordena a lista inteira — a UI envia os ids pela ordem que quer ver. */
export async function reorderOffers(
  caseId: string,
  orderedIds: string[]
): Promise<ProposalActionState> {
  const editable = await editableProposal(caseId)
  if ("error" in editable) return editable

  const supabase = createClient()
  await Promise.all(
    orderedIds.map((id, position) =>
      supabase
        .from("case_offers")
        .update({ position })
        .eq("id", id)
        .eq("proposal_id", editable.id)
    )
  )
  touch(caseId)
  return OK
}

/**
 * Guarda uma oferta inteira, trechos incluídos.
 *
 * Os trechos são substituídos em bloco em vez de reconciliados linha a linha:
 * são poucos, não têm nada a apontar para eles, e um "apaga e volta a inserir"
 * evita toda uma classe de bugs de ordenação que um diff traria.
 */
export async function saveOffer(
  caseId: string,
  offerId: string,
  draft: OfferDraft
): Promise<ProposalActionState> {
  const { t } = getI18n()
  const editable = await editableProposal(caseId)
  if ("error" in editable) return editable

  const supabase = createClient()

  const { data: updated, error } = await supabase
    .from("case_offers")
    .update({
      name: text(draft.name, 160) ?? "",
      is_recommended: flag(draft.is_recommended),
      is_cheapest: flag(draft.is_cheapest),
      is_fastest: flag(draft.is_fastest),
      fare_name: text(draft.fare_name, 120),
      baggage_cabin: text(draft.baggage_cabin, 160),
      baggage_hold: text(draft.baggage_hold, 160),
      change_policy: text(draft.change_policy, 240),
      refund_policy: text(draft.refund_policy, 240),
      seat_policy: text(draft.seat_policy, 240),
      documents: text(draft.documents, 400),
      price_adult: money(draft.price_adult),
      price_child: money(draft.price_child),
      price_infant: money(draft.price_infant),
      taxes_total: money(draft.taxes_total),
      service_fee: money(draft.service_fee),
      lock_fee: money(draft.lock_fee),
      lock_fee_enabled: flag(draft.lock_fee_enabled),
      cost_total: money(draft.cost_total),
      valid_until: moment(draft.valid_until),
      agent_note: text(draft.agent_note, 2000),
    })
    .eq("id", offerId)
    .eq("proposal_id", editable.id)
    .select("id")

  if (error || !updated || updated.length === 0) {
    console.error("[proposals] saveOffer failed:", error)
    return { error: t("errors.offerSaveFailed") }
  }

  const segments = (draft.segments ?? []).slice(0, 24)
  await supabase.from("case_offer_segments").delete().eq("offer_id", offerId)

  if (segments.length > 0) {
    const counters: Record<OfferDirection, number> = { ida: 0, volta: 0 }
    const rows = segments
      .filter((s) => s.direction === "ida" || s.direction === "volta")
      .map((s) => ({
        offer_id: offerId,
        direction: s.direction,
        position: counters[s.direction]++,
        carrier_code: code(s.carrier_code, 3),
        flight_number: text(s.flight_number, 6),
        equipment: text(s.equipment, 80),
        booking_class: code(s.booking_class, 2),
        cabin: CABINS.includes(s.cabin as Cabin) ? s.cabin : "economy",
        origin: code(s.origin, 3),
        destination: code(s.destination, 3),
        depart_at: moment(s.depart_at),
        arrive_at: moment(s.arrive_at),
        terminal_from: text(s.terminal_from, 40),
        terminal_to: text(s.terminal_to, 40),
      }))

    const { error: segError } = await supabase
      .from("case_offer_segments")
      .insert(rows)
    if (segError) {
      console.error("[proposals] segment insert failed:", segError)
      return { error: t("errors.offerSavedSegmentsNot") }
    }
  }

  touch(caseId)
  return OK
}

// --- Publicar ---------------------------------------------------------------

function baseUrl(): string {
  const host = headers().get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? ""
  return host.replace(/\/$/, "")
}

const TEAM_FALLBACK = ["info@weefly.africa", "info@weefly.cv"]

function teamRecipients(): string[] {
  const configured = (process.env.CONCIERGE_TEAM_EMAIL ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
  return configured.length > 0 ? configured : TEAM_FALLBACK
}

/**
 * Publica a proposta: é este gesto, e só este, que faz o link 2 existir.
 *
 * Antes disto o /pc/{token} do cliente mostra o ecrã de espera (P4a),
 * porque é exatamente o que é verdade. Publicar valida o que vai sair, destranca
 * a etapa 2, move o caso para E2 e avisa quem tem de ser avisado.
 */
export async function publishProposal(
  caseId: string,
  input: {
    includedOfferIds: string[]
    openingMessage?: string
    notifyClient?: boolean
    notifyTeam?: boolean
  }
): Promise<ProposalActionState & { warning?: string }> {
  const { t } = getI18n()
  const editable = await editableProposal(caseId)
  if ("error" in editable) return editable

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: t("errors.sessionExpired") }

  const view = await getProposal(caseId)
  const bookingCase = await getCase(caseId)
  if (!view || !bookingCase) return { error: t("errors.caseNotFound") }

  const included = new Set(input.includedOfferIds)
  const going = view.offers.filter((o) => included.has(o.id))

  if (going.length === 0) {
    return { error: t("errors.pickAtLeastOneOffer") }
  }

  const pax = paxOf(bookingCase.trip_request)

  /*
   * BO-07 · as datas do pedido entram na validação.
   *
   * O browser já verificou o mesmo enquanto o vendedor escrevia, e é aqui que
   * conta: esta função é um endpoint, e a verificação do ecrã é uma cortesia
   * para quem o usa, não uma garantia sobre o que chega.
   */
  const requested = {
    departDate: bookingCase.trip_request?.depart_date ?? null,
    returnDate: bookingCase.trip_request?.return_date ?? null,
  }

  // Publicar com um itinerário meio escrito é pior do que não publicar: o
  // cliente recebe um email a anunciar uma proposta e encontra linhas em branco.
  const faults = going.flatMap((offer) => {
    const problems = offerBlockers(offer, pax, requested)
    return problems.length === 0
      ? []
      : [
          t("blockers.line", {
            offer: offer.name || t("email.proposalUnnamed"),
            problems: problems.map((b) => blockerText(b, t)).join(", "),
          }),
        ]
  })
  if (faults.length > 0) {
    return { error: t("blockers.missing", { faults: faults.join(" · ") }) }
  }

  await Promise.all(
    view.offers.map((offer) =>
      supabase
        .from("case_offers")
        .update({ include_in_proposal: included.has(offer.id) })
        .eq("id", offer.id)
    )
  )

  const { error } = await supabase
    .from("case_proposals")
    .update({
      status: "publicada",
      published_at: new Date().toISOString(),
      published_by: user.id,
      ...(input.openingMessage !== undefined
        ? { opening_message: text(input.openingMessage, 2000) }
        : {}),
    })
    .eq("id", view.proposal.id)

  if (error) {
    console.error("[proposals] publish failed:", error)
    return { error: t("errors.publishFailed") }
  }

  // O link 2 nasce aqui.
  await supabase
    .from("case_links")
    .update({ status: "ativo", unlocked_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("stage", 2)
    .eq("status", "bloqueado")

  const behind: CaseStage[] = ["novo", "pedido_recebido", "detalhes_pendentes"]
  await supabase
    .from("booking_cases")
    .update({ stage: "proposta_enviada" })
    .eq("id", caseId)
    .in("stage", behind)

  /*
   * A proposta era também entregue dentro da conversa do chatbot, para quem
   * tinha chegado por aí. O chat vivia em /c/{token} e em /newhome, e nenhum dos
   * dois existe — escrever a proposta lá dentro passaria a ser uma gravação que
   * ninguém pode abrir. O cliente vê a proposta onde vê tudo o resto: no /pc.
   */
  const warning = await notifyPublication({
    bookingCase,
    offers: going,
    costs: going.map((o) => o.cost_total),
    currency: view.proposal.currency,
    openingMessage:
      input.openingMessage !== undefined
        ? text(input.openingMessage, 2000)
        : view.proposal.opening_message,
    revision: view.proposal.revision,
    notifyClient: input.notifyClient !== false,
    notifyTeam: input.notifyTeam !== false,
    agentName: user.email ?? null,
  })

  touch(caseId)
  return { error: null, ...(warning ? { warning } : {}) }
}

/**
 * Envio best-effort.
 *
 * A publicação já está gravada quando isto corre, e assim tem de ser: se o
 * Resend estiver em baixo, o vendedor copia o link e manda-o pelo WhatsApp. O
 * que não pode acontecer é a proposta ficar por publicar porque um email falhou.
 */
async function notifyPublication(input: {
  bookingCase: BookingCaseRow
  offers: AdminOffer[]
  costs: number[]
  currency: string
  openingMessage: string | null
  revision: number
  notifyClient: boolean
  notifyTeam: boolean
  agentName: string | null
}): Promise<string | undefined> {
  const { t } = getI18n()
  const { bookingCase } = input
  const trip = bookingCase.trip_request
  const clientLocale = localeForClient(trip?.lead?.locale)
  const clientT = getTranslator(clientLocale)

  /*
   * Um endereço, sempre o mesmo: /pc/{token}, o link que o cliente já tem desde
   * que fez o pedido. Antes havia dois — a conversa em /c/{token} e o comparador
   * em /p/{token}/proposta — e o email escolhia entre eles conforme o canal de
   * entrada. Os dois percursos deixaram de existir, e a escolha também: o ecrã
   * do /pc é derivado do estado do caso, por isso o mesmo link mostra a proposta
   * a quem a tem para ver e o ecrã de espera a quem ainda não.
   */
  const link = `${baseUrl()}/pc/${bookingCase.token}`

  if (!process.env.RESEND_API_KEY) {
    console.warn(
      "[proposals] RESEND_API_KEY não definida — proposta publicada sem avisos. Link: %s",
      link
    )
    return t("notices.publishedNoEmailConfig")
  }

  const payload = {
    clientName: trip?.lead?.full_name ?? "cliente",
    reference: trip?.reference ?? null,
    origin: trip?.origin ?? "—",
    destination: trip?.destination ?? "—",
    offers: input.offers,
    pax: paxOf(trip),
    currency: input.currency,
    openingMessage: input.openingMessage,
    link,
    revision: input.revision,
  }

  const from =
    process.env.CONCIERGE_FROM_EMAIL ??
    "WeeFly Concierge <onboarding@resend.dev>"
  const resend = new Resend(process.env.RESEND_API_KEY)
  const team = teamRecipients()
  const clientEmail = trip?.lead?.email ?? null

  const sends: Promise<unknown>[] = []

  if (input.notifyClient && clientEmail) {
    /*
     * Na língua do cliente, não na do agente.
     *
     * Este email é composto horas depois de o cliente ter falado connosco, e o
     * `t` desta action fala a língua de quem carregou no botão. A do cliente
     * ficou guardada no lead quando ele nos escreveu — ver a migração 0008.
     */
    const mail = buildProposalPublishedEmail(payload, clientT, clientLocale)
    sends.push(
      resend.emails.send({
        from,
        to: clientEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: team[0],
      })
    )
  }

  if (input.notifyTeam) {
    const mail = buildProposalTeamEmail({
      ...payload,
      clientEmail,
      agentName: input.agentName,
      costs: input.costs,
    })
    sends.push(
      resend.emails.send({
        from,
        to: team,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(clientEmail ? { replyTo: clientEmail } : {}),
      })
    )
  }

  const results = await Promise.allSettled(sends)
  const failed = results.filter(
    (r) =>
      r.status === "rejected" ||
      (r.value as { error?: unknown } | undefined)?.error
  )

  if (failed.length > 0) {
    console.error("[proposals] envio da proposta falhou:", failed)
    return t("notices.publishedEmailFailed")
  }

  if (input.notifyClient && !clientEmail) {
    return t("notices.publishedNoClientEmail")
  }

  return undefined
}

/**
 * Abre uma revisão sobre uma proposta publicada.
 *
 * A proposta volta a rascunho e o contador sobe: R1 → R2. Enquanto a revisão
 * estiver aberta o cliente vê "a proposta está a ser atualizada" em vez dos
 * preços antigos — mostrar-lhe um valor que já sabemos estar a mudar é pior do
 * que pedir-lhe que espere um minuto.
 */
export async function startRevision(
  caseId: string
): Promise<ProposalActionState> {
  const { t } = getI18n()
  const view = await getProposal(caseId)
  if (!view) return { error: t("errors.caseHasNoProposal") }
  if (view.proposal.status !== "publicada") {
    return { error: t("errors.proposalAlreadyEditing") }
  }

  const supabase = createClient()
  const { error } = await supabase
    .from("case_proposals")
    .update({ status: "rascunho", revision: view.proposal.revision + 1 })
    .eq("id", view.proposal.id)
    .eq("status", "publicada")

  if (error) {
    console.error("[proposals] startRevision failed:", error)
    return { error: t("errors.revisionOpenFailed") }
  }

  touch(caseId)
  return OK
}

// --- Lado do cliente ---------------------------------------------------------

/**
 * O cliente escolhe uma opção.
 *
 * Sem sessão: o token no endereço é a credencial, e a verificação de que a
 * oferta pertence mesmo a este caso está em `recordOfferSelection`.
 */
export async function selectOffer(token: string, offerId: string) {
  const { t } = getI18n()
  const lookup = await getCaseByToken(token, 2)
  if (!lookup.ok) return

  const bookingCase = lookup.view.case
  const chosen = await recordOfferSelection(bookingCase.id, offerId)
  if (!chosen) return

  const pax = paxOf(bookingCase.trip_request)
  const total = offerTotal(chosen.offer, pax)
  const trip = bookingCase.trip_request

  await syncPaymentToOffer(
    bookingCase.id,
    total,
    chosen.currency,
    [chosen.offer.name, trip && `${trip.origin} → ${trip.destination}`]
      .filter(Boolean)
      .join(" · ")
  )

  // Service role: quem carregou no botão não tem sessão, e o RLS de
  // booking_cases só conhece staff. O token já foi validado acima.
  const admin = createAdminClient()
  if (admin) {
    const behind: CaseStage[] = ["novo", "pedido_recebido", "proposta_enviada"]
    await admin
      .from("booking_cases")
      .update({ stage: "opcao_escolhida" })
      .eq("id", bookingCase.id)
      .in("stage", behind)
  }

  /* Deixa o rasto na conversa. Sem isto, um cliente que volte ao chat dias
     depois vê os cartões das ofertas e não faz ideia de que já escolheu uma. */
  const { postSystemMessage } = await import("@/lib/conversations")
  await postSystemMessage(
    bookingCase.id,
    t("chat.chosenOption", {
      name: chosen.offer.name || t("chatProposal.unnamedOffer"),
    }),
    { url: `/p/${token}/passageiros`, label: t("chat.fillPassports") }
  )

  revalidatePath(`/p/${token}/proposta`)
  revalidatePath(`/p/${token}/passageiros`)
  revalidatePath(`/admin/casos/${bookingCase.id}`)
  redirect(`/p/${token}/passageiros`)
}
