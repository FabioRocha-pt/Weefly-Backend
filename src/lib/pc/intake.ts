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
  AP,
  CABIN_TO_DB,
  TRIP_TO_DB,
  type CabinKind,
  type TripKind,
} from "@/lib/pc/catalog"

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

  const contact = {
    full_name: input.name.trim(),
    email,
    phone_prefix: input.dialCode,
    phone: input.phone.trim(),
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
  return Boolean(ia && AP(ia))
}
