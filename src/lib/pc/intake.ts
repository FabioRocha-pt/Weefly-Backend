/**
 * WeeFly Price Checker — o pedido entra na fila.
 *
 * O P2 é a única escrita do fluxo público que cria coisas novas: um lead, um
 * pedido e o caso. A partir daí tudo o resto atualiza o que já existe.
 *
 * O caso nasce aqui e não à mão no back-office — é a diferença entre o mockup e
 * o sistema. `booking_cases` ganha o token que dá ao cliente o direito de voltar
 * ao seu próprio pedido, e é esse token que vai no endereço /pc/{token}.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { mintToken } from "@/lib/booking-cases"
import { logCaseEvent } from "@/lib/case-events"
import {
  CABIN_TO_DB,
  TRIP_TO_DB,
  type CabinKind,
  type TripKind,
} from "@/lib/pc/catalog"
import { isKnownIata } from "@/lib/airports"
import { toE164 } from "@/lib/countries"

export interface PcLeg {
  origin: string
  destination: string
  date: string
}

export interface PcIntake {
  trip: TripKind
  cabin: CabinKind
  adults: number
  children: number
  infantsInSeat: number
  infantsOnLap: number
  /** Presente quando trip !== 'multi'. */
  origin: string | null
  destination: string | null
  departDate: string
  returnDate: string | null
  /** 2 ou 3 trechos quando trip === 'multi'. */
  legs: PcLeg[]
  name: string
  dialCode: string
  /** ISO-3166 alpha-2 do país do telefone — o +1 é de vinte países. */
  country: string
  phone: string
  email: string
  consent: boolean
  locale: string
  currency: string
  agentSlug: string | null
  consentIp: string | null
  consentAgent: string | null
}

export interface PcCase {
  caseId: string
  token: string
  reference: string
}

const UNIQUE_VIOLATION = "23505"

/**
 * Um lead por pessoa, identificado pelo email.
 *
 * A mesma regra do /concierge (ver concierge-intake.ts): um cliente que volta
 * acumula pedidos em vez de se partir em contactos duplicados. Os dados de
 * contacto são refrescados a cada submissão, porque a grafia mais recente do
 * nome é a melhor que temos.
 */
async function upsertLead(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  input: PcIntake
): Promise<string> {
  const email = input.email.trim().toLowerCase()
  const now = new Date().toISOString()

  /*
   * O número guardado três vezes, e cada uma serve para algo.
   *
   * `phone_e164` é o que o WhatsApp e o gateway de SMS pedem, e é a única forma
   * que não depende de contexto nenhum. `phone_prefix` e `phone` ficam porque o
   * back-office e os emails já os leem, e porque é assim que a pessoa reconhece
   * o próprio número. `phone_country` desfaz a ambiguidade dos indicativos
   * partilhados: sem ele, um +1 não diz se o cliente está em Boston ou em Santo
   * Domingo — e isso decide a moeda e os métodos de pagamento que ele vê.
   */
  const e164 = toE164(input.dialCode, input.phone)
  const national = e164
    ? e164.slice(input.dialCode.replace(/\D/g, "").length + 1)
    : input.phone.replace(/\D/g, "")

  const contact = {
    full_name: input.name.trim(),
    email,
    phone_prefix: input.dialCode,
    phone: national,
    phone_e164: e164,
    phone_country: input.country.toUpperCase(),
    locale: input.locale,
    consent: input.consent,
    consent_at: input.consent ? now : null,
  }

  const existing = await admin
    .from("leads")
    .select("id")
    .eq("email", email)
    .maybeSingle()

  if (existing.data?.id) {
    await admin.from("leads").update(contact).eq("id", existing.data.id)
    return existing.data.id as string
  }

  const inserted = await admin
    .from("leads")
    .insert({ ...contact, source_channel: "browser" })
    .select("id")
    .single()

  if (inserted.error) {
    if (inserted.error.code === UNIQUE_VIOLATION) {
      // Duas submissões do mesmo email ao mesmo tempo: adota o vencedor.
      const retry = await admin
        .from("leads")
        .select("id")
        .eq("email", email)
        .single()
      if (retry.data?.id) return retry.data.id as string
    }
    throw inserted.error
  }

  return inserted.data.id as string
}

/** Primeiro e último aeroporto do pedido, seja qual for o tipo de viagem. */
function ends(input: PcIntake): { origin: string; destination: string } {
  if (input.trip === "multi" && input.legs.length) {
    return {
      origin: input.legs[0].origin,
      destination: input.legs[input.legs.length - 1].destination,
    }
  }
  return {
    origin: input.origin ?? "",
    destination: input.destination ?? "",
  }
}

/** A data do primeiro voo — é o `depart_date` que todas as listagens leem. */
function firstDate(input: PcIntake): string {
  if (input.trip === "multi" && input.legs.length) return input.legs[0].date
  return input.departDate
}

// ── o travão do formulário público ───────────────────────────────────────────

/** Janela em que duas submissões iguais são a mesma submissão. */
const DEDUPE_MINUTES = 15
/** Janela e teto do limite por origem. */
const RATE_MINUTES = 10
const RATE_MAX = 5

export interface RecentSubmission {
  token: string
  reference: string
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

/**
 * O mesmo pedido, submetido outra vez.
 *
 * O caso mais comum não é fraude: é um duplo clique, um refresh, ou o cliente a
 * carregar outra vez porque a rede demorou. Criar-lhe um segundo caso divide a
 * conversa em dois sítios e põe dois pedidos iguais na fila do vendedor. Devolver
 * o token do primeiro é o comportamento certo — ele volta ao pedido que já fez em
 * vez de ver um erro que não explica nada.
 *
 * Compara email, rota e data de partida: mudar qualquer um deles é um pedido
 * novo, não uma repetição.
 */
export async function findRecentSubmission(
  input: Pick<PcIntake, "email" | "departDate"> & {
    origin: string
    destination: string
  }
): Promise<RecentSubmission | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const email = input.email.trim().toLowerCase()

  const { data } = await admin
    .from("trip_requests")
    .select(
      `id, reference, created_at,
       lead:leads!inner (email),
       cases:booking_cases!inner (token, stage)`
    )
    .eq("origin", input.origin)
    .eq("destination", input.destination)
    .eq("depart_date", input.departDate)
    .eq("intake", "price_checker")
    .gte("created_at", minutesAgo(DEDUPE_MINUTES))
    .order("created_at", { ascending: false })
    .limit(10)

  for (const row of (data ?? []) as Record<string, any>[]) {
    const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead
    if (String(lead?.email ?? "").toLowerCase() !== email) continue

    const cases = (Array.isArray(row.cases) ? row.cases : [row.cases]).filter(Boolean)
    const alive = cases.find((c: any) => c?.stage !== "cancelado")
    if (alive?.token) {
      return { token: String(alive.token), reference: String(row.reference) }
    }
  }

  return null
}

/**
 * Quantos pedidos entraram desta origem na última janela.
 *
 * Conta por IP porque é o que temos — `consent_ip` já era guardado para cumprir
 * a promessa do ecrã de consentimento, e serve aqui sem recolher nada de novo.
 * Um IP partilhado (um escritório, uma operadora móvel) pode legitimamente
 * submeter vários pedidos, e é por isso que o teto é generoso: o alvo é o script
 * que submete cem, não a família que submete três.
 */
export async function countRecentSubmissions(ip: string | null): Promise<number> {
  if (!ip) return 0
  const admin = createAdminClient()
  if (!admin) return 0

  const { count } = await admin
    .from("trip_requests")
    .select("id", { count: "exact", head: true })
    .eq("consent_ip", ip)
    .gte("created_at", minutesAgo(RATE_MINUTES))

  return count ?? 0
}

/** O teto e a janela, para quem chama poder escrever a mensagem. */
export const RATE_LIMIT = { max: RATE_MAX, minutes: RATE_MINUTES }

/**
 * Cria lead + pedido + caso, e devolve o endereço permanente do cliente.
 *
 * Devolve null quando a service role não está configurada — o mesmo modo de
 * falhar do resto do intake: quem chama mostra uma mensagem honesta em vez de
 * um 500.
 */
export async function createPriceCheckerCase(
  input: PcIntake
): Promise<PcCase | null> {
  const admin = createAdminClient()
  if (!admin) {
    console.warn("[pc] SUPABASE_SERVICE_ROLE_KEY ausente — pedido não guardado.")
    return null
  }

  try {
    const leadId = await upsertLead(admin, input)
    const { origin, destination } = ends(input)

    const { data: trip, error: tripError } = await admin
      .from("trip_requests")
      .insert({
        lead_id: leadId,
        trip_type: TRIP_TO_DB[input.trip],
        origin,
        destination,
        depart_date: firstDate(input),
        return_date: input.trip === "round" ? input.returnDate : null,
        adults: input.adults,
        children: input.children,
        /* `infants` continua a ser a soma dos dois, para quem já a lê; as
           colunas novas guardam a distinção que o formulário sempre fez. */
        infants: input.infantsInSeat + input.infantsOnLap,
        infants_in_seat: input.infantsInSeat,
        infants_on_lap: input.infantsOnLap,
        cabin_class: CABIN_TO_DB[input.cabin],
        currency: input.currency,
        agent_slug: input.agentSlug,
        intake: "price_checker",
        consent_ip: input.consentIp,
        consent_agent: input.consentAgent,
        status: "novo",
      })
      .select("id, reference")
      .single()

    if (tripError) throw tripError

    const tripRequestId = trip.id as string
    const reference = trip.reference as string

    if (input.trip === "multi" && input.legs.length) {
      const { error: legsError } = await admin.from("trip_request_legs").insert(
        input.legs.map((leg, i) => ({
          trip_request_id: tripRequestId,
          position: i + 1,
          origin: leg.origin,
          destination: leg.destination,
          depart_date: leg.date,
        }))
      )
      if (legsError) {
        /* Um multi-city sem trechos guardados continua a ser um pedido válido
           com a rota do primeiro ao último aeroporto. Registar e seguir é
           melhor do que perder o pedido inteiro. */
        console.error("[pc] trechos não guardados:", legsError.message)
      }
    }

    const token = mintToken()

    const { data: bookingCase, error: caseError } = await admin
      .from("booking_cases")
      .insert({
        token,
        stage: "pedido_recebido",
        trip_request_id: tripRequestId,
        lead_id: leadId,
      })
      .select("id")
      .single()

    if (caseError) throw caseError

    const caseId = bookingCase.id as string

    /*
     * A etapa 1 fecha-se no mesmo gesto: o pedido já foi submetido, e deixá-la
     * "ativa" faria o back-office mostrar que se espera algo do cliente que já
     * chegou. O trigger `seed_case_links` criou as três linhas ao inserir o
     * caso, por isso isto é um update.
     */
    await admin
      .from("case_links")
      .update({ status: "submetido", submitted_at: new Date().toISOString() })
      .eq("case_id", caseId)
      .eq("stage", 1)

    const route =
      input.trip === "multi"
        ? input.legs.map((l) => `${l.origin}→${l.destination}`).join(" · ")
        : `${origin} → ${destination}`

    await logCaseEvent({
      caseId,
      kind: "request_submitted",
      title: "Pedido submetido pelo cliente",
      detail: [
        "Price Checker",
        input.agentSlug ? `agent=${input.agentSlug}` : "sem agente",
        `lang=${input.locale}`,
        `cur=${input.currency}`,
        route,
      ].join(" · "),
      actorKind: "client",
      payload: {
        reference,
        trip: input.trip,
        cabin: input.cabin,
        pax: {
          adults: input.adults,
          children: input.children,
          infantsInSeat: input.infantsInSeat,
          infantsOnLap: input.infantsOnLap,
        },
      },
    })

    return { caseId, token, reference }
  } catch (err) {
    console.error("[pc] intake falhou:", err)
    return null
  }
}

/** Valida um IATA contra o catálogo — o formulário envia texto livre. */
export function isKnownAirport(ia: string | null | undefined): boolean {
  return isKnownIata(ia)
}
