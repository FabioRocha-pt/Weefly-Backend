/**
 * WeeFly booking cases — data access.
 *
 * Two distinct access paths, deliberately kept apart:
 *
 *  - Staff reads (`listCases`, `getCase`) go through the session-bound client,
 *    so RLS enforces platform_staff membership.
 *  - Public reads (`getCaseByToken`) go through the service-role client,
 *    because the client following a link has no session — the token IS the
 *    credential. Every such function must therefore verify the stage is
 *    unlocked before returning anything.
 *
 * SERVER ONLY.
 */

import { randomBytes } from "crypto"
import { cache } from "react"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import type {
  CaseLinkRow,
  CasePassenger,
  CasePayment,
  CaseStage,
} from "@/lib/case-status"

export interface BookingCaseRow {
  id: string
  token: string
  stage: CaseStage
  trip_request_id: string | null
  created_at: string
  /** Touched by the `booking_cases_touch` trigger — drives "sem mexer há". */
  updated_at: string
  links: CaseLinkRow[]
  /** Present once Link 1 has been submitted. */
  trip_request: {
    id: string
    reference: string
    origin: string
    destination: string
    depart_date: string
    return_date: string | null
    adults: number
    children: number
    infants: number
    cabin_class: string
    trip_type: string
    /** VIP-10 · malas de porão pedidas. Zero nos pedidos anteriores à 0012. */
    baggage_hold: number
    /** A moeda em que o cliente pediu a cotação (?currency= do link /pc). */
    currency: string | null
    /**
     * T-09 · o texto livre que o cliente escreveu no ecrã de revisão.
     *
     * Lido aqui porque é o compositor de propostas que carrega este tipo — e é
     * exactamente lá que ele faltava: quem cota decidia horários sem saber que
     * a passageira viaja em cadeira de rodas.
     */
    special_requests: string | null
    lead: {
      full_name: string
      email: string
      phone_prefix: string | null
      phone: string | null
      source_channel: string
      /** Ver `0008_lead_locale.sql` — a língua dos emails diferidos. */
      locale: string | null
    } | null
  } | null
}

const CASE_COLUMNS = `
  id, token, stage, trip_request_id, created_at, updated_at,
  links:case_links (id, stage, status, unlocked_at, first_opened_at, submitted_at, last_opened_at, open_count),
  trip_request:trip_requests (
    id, reference, origin, destination, depart_date, return_date,
    adults, children, infants, baggage_hold, cabin_class, trip_type, currency,
    special_requests,
    lead:leads (full_name, email, phone_prefix, phone, source_channel, locale)
  )
`

/** PostgREST returns embeds as arrays in some shapes; collapse to an object. */
function first<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null
  return (value ?? null) as T | null
}

function normaliseCase(row: Record<string, unknown>): BookingCaseRow {
  const tripRequest = first<Record<string, unknown>>(row.trip_request)
  return {
    ...(row as unknown as BookingCaseRow),
    links: ((row.links ?? []) as CaseLinkRow[]).sort((a, b) => a.stage - b.stage),
    trip_request: tripRequest
      ? ({
          ...tripRequest,
          lead: first(tripRequest.lead),
        } as BookingCaseRow["trip_request"])
      : null,
  }
}

/**
 * 32 url-safe characters from a CSPRNG (~190 bits). The token is the only
 * thing standing between the public internet and a client's passport data,
 * so it must not be sequential or time-derived.
 */
export function mintToken(): string {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// --- Staff reads (RLS enforced) ---------------------------------------------

export async function listCases(search?: string): Promise<BookingCaseRow[]> {
  const supabase = createClient()
  let query = supabase
    .from("booking_cases")
    .select(CASE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100)

  const { data, error } = await query
  if (error) {
    console.error("[cases] listCases failed:", error)
    return []
  }

  const rows = (data ?? []).map((r) => normaliseCase(r as Record<string, unknown>))

  // Filtering happens in memory: the searchable fields (client name, email,
  // reference) live on tables embedded two levels down, which PostgREST can't
  // filter across in a single query.
  const term = search?.trim().toLowerCase()
  if (!term) return rows

  return rows.filter((c) => {
    const t = c.trip_request
    return [
      c.token,
      t?.reference,
      t?.lead?.full_name,
      t?.lead?.email,
      t?.origin,
      t?.destination,
    ]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(term))
  })
}

/**
 * Cached per request: o layout do caso e as duas páginas que vivem debaixo dele
 * (Pedido e Ofertas) pedem todos o mesmo caso para desenhar a barra de topo.
 * Sem isto seriam três viagens à base de dados para render um ecrã.
 */
export const getCase = cache(async function getCase(
  id: string
): Promise<BookingCaseRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("booking_cases")
    .select(CASE_COLUMNS)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[cases] getCase failed:", error)
    return null
  }
  return data ? normaliseCase(data as Record<string, unknown>) : null
})

export async function getCasePassengers(caseId: string): Promise<CasePassenger[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from("case_passengers")
    .select(
      "id, position, passenger_type, first_name, last_name, gender, birth_date, nationality, passport_number, passport_expiry"
    )
    .eq("case_id", caseId)
    .order("position")
  return (data ?? []) as CasePassenger[]
}

export async function getCasePayment(caseId: string): Promise<CasePayment | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from("case_payments")
    .select(
      "id, amount, currency, description, status, payment_url, weepay_transaction_id, paid_at, created_at, client_declared_paid_at, last_checked_at, failure_reason"
    )
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as CasePayment | null
}

// --- Public reads (token-authenticated, service role) ------------------------

export interface PublicCaseView {
  case: BookingCaseRow
  link: CaseLinkRow
}

/**
 * Resolve a token for a specific stage.
 *
 * Returns a discriminated result rather than throwing, so each public page can
 * render the right message: an unknown token and a locked stage are very
 * different things to a client staring at a link you sent them.
 */
export type TokenLookup =
  | { ok: true; view: PublicCaseView }
  | { ok: false; reason: "not_found" | "locked" | "expired" | "unavailable" }

export async function getCaseByToken(
  token: string,
  stage: 1 | 2 | 3
): Promise<TokenLookup> {
  const admin = createAdminClient()
  if (!admin) {
    console.warn("[cases] SUPABASE_SERVICE_ROLE_KEY not set — link unusable.")
    return { ok: false, reason: "unavailable" }
  }

  const { data, error } = await admin
    .from("booking_cases")
    .select(CASE_COLUMNS)
    .eq("token", token)
    .maybeSingle()

  if (error || !data) return { ok: false, reason: "not_found" }

  const bookingCase = normaliseCase(data as Record<string, unknown>)
  if (bookingCase.stage === "cancelado") return { ok: false, reason: "not_found" }

  const link = bookingCase.links.find((l) => l.stage === stage)
  if (!link) return { ok: false, reason: "not_found" }
  if (link.status === "bloqueado") return { ok: false, reason: "locked" }
  if (link.status === "expirado") return { ok: false, reason: "expired" }

  return { ok: true, view: { case: bookingCase, link } }
}

/**
 * Attach a submitted travel request to its case and close Link 1.
 *
 * Called from the intake route after the request is persisted. Returns false
 * when the token is unknown or stage 1 is no longer accepting submissions, so
 * the caller can decide whether that matters (it doesn't — the request is
 * already saved either way, it just won't be linked to a case).
 */
export async function bindTripRequestToCase(
  token: string,
  tripRequestId: string,
  leadId: string
): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin) return false

  const { data: bookingCase } = await admin
    .from("booking_cases")
    .select("id, stage")
    .eq("token", token)
    .maybeSingle()

  if (!bookingCase || bookingCase.stage === "cancelado") return false

  const { data: closed } = await admin
    .from("case_links")
    .update({ status: "submetido", submitted_at: new Date().toISOString() })
    .eq("case_id", bookingCase.id)
    .eq("stage", 1)
    .eq("status", "ativo")
    .select("id")

  if (!closed || closed.length === 0) return false

  await admin
    .from("booking_cases")
    .update({
      trip_request_id: tripRequestId,
      lead_id: leadId,
      stage: "pedido_recebido",
    })
    .eq("id", bookingCase.id)

  return true
}

/**
 * Stamp a client's access to a link.
 *
 * C-05 · "a data de última abertura reflecte o acesso real do cliente."
 *
 * Isto gravava só `first_opened_at`, e só quando estava a nulo — de propósito,
 * porque o que interessava era saber se o link tinha chegado. O efeito era que
 * a segunda visita do cliente, e a décima, não deixavam rasto nenhum: quem
 * atendia não tinha como distinguir um cliente que abriu o link há um mês de um
 * que o está a ler agora.
 *
 * As duas datas respondem a perguntas diferentes e por isso ficam as duas. A
 * primeira é escrita uma vez (o `coalesce` garante-o do lado do servidor, sem
 * depender de uma segunda query para saber se já existia); a última é escrita
 * sempre.
 */
export async function markLinkOpened(linkId: string): Promise<void> {
  const admin = createAdminClient()
  if (!admin) return

  const now = new Date().toISOString()

  /*
   * Uma leitura antes da escrita, e não um `coalesce` em SQL: o PostgREST não
   * aceita expressões num update, e a alternativa era uma função na base de
   * dados para gravar duas datas. O custo é uma query por abertura de link, o
   * que é exactamente a frequência com que um cliente carrega num link.
   */
  const { data } = await admin
    .from("case_links")
    .select("first_opened_at, open_count")
    .eq("id", linkId)
    .maybeSingle()

  const row = (data ?? null) as {
    first_opened_at: string | null
    open_count: number | null
  } | null

  await admin
    .from("case_links")
    .update({
      first_opened_at: row?.first_opened_at ?? now,
      last_opened_at: now,
      open_count: (row?.open_count ?? 0) + 1,
    })
    .eq("id", linkId)
}
