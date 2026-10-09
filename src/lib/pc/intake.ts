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
import { hasChannel } from "@/lib/channels"
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
  /** VIP-10 · malas de porão pedidas. Zero é uma resposta, não uma ausência. */
  baggageHold: number
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
  /**
   * FE-05 · o que nenhum campo estruturado apanha.
   *
   * Nulo quando o cliente não escreveu nada, e é diferente de vazio: o ecrã de
   * revisão mostra o campo a toda a gente, e a maioria não lhe toca.
   */
  specialRequests: string | null
  consent: boolean
  locale: string
  currency: string
  agentSlug: string | null
  /** PRO-06 · a empresa que o link diz. Ver `resolveLinkPartner`. */
  companySlug?: string | null
  /**
   * TEN-04 · o parceiro que o endereço identifica (o subdomínio), lido no
   * servidor dos cabeçalhos do pedido — nunca do formulário. Ganha ao
   * `companySlug`.
   */
  hostPartnerSlug?: string | null
  /**
   * MIN-01 · o token do link do ministério. Quando resolve, o caso é desse
   * ministério e do parceiro dele — e ganha a tudo o resto.
   */
  ministryToken?: string | null
  /**
   * B2G-06 · B2G-07 · a secretária cuja sessão (PIN) a server action já
   * verificou para este `ministryToken`. Sem ela, um pedido de ministério não
   * entra; com ela, o caso fica com a autora (`booking_cases.secretary_id`).
   */
  ministrySecretaryId?: string | null
  /**
   * B2G-22 · o token do link pessoal de um cliente VIP. Quando resolve, o caso
   * é `vip`, desse cliente e da empresa dele — e ganha ao subdomínio e ao
   * link, como o do ministério.
   */
  vipToken?: string | null
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
  input: PcIntake,
  partnerId: string | null
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

  /* TEN-03 · um cliente é por parceiro: o mesmo email na WeeFly e no Alô são
     dois leads (índice único `(partner_id, email)`, migração 0027). */
  const byEmail = () => {
    const q = admin.from("leads").select("id").eq("email", email)
    return partnerId ? q.eq("partner_id", partnerId) : q
  }

  const existing = await byEmail().maybeSingle()

  if (existing.data?.id) {
    await admin.from("leads").update(contact).eq("id", existing.data.id)
    return existing.data.id as string
  }

  const inserted = await admin
    .from("leads")
    .insert({
      ...contact,
      source_channel: "browser",
      ...(partnerId ? { partner_id: partnerId } : {}),
    })
    .select("id")
    .single()

  if (inserted.error) {
    if (inserted.error.code === UNIQUE_VIOLATION) {
      // Duas submissões do mesmo email ao mesmo tempo: adota o vencedor.
      const retry = await byEmail().single()
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
    /**
     * B2G-22 · um pedido feito pelo link de um VIP só se junta a outro pedido
     * VIP desse mesmo cliente — nunca a um pedido público com o mesmo email.
     * Sem isto, a leitura é a de sempre.
     */
    vipToken?: string | null
  }
): Promise<RecentSubmission | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const email = input.email.trim().toLowerCase()

  const vipId = input.vipToken ? await vipIdOf(admin, input.vipToken) : null
  if (input.vipToken && !vipId) return null

  const { data } = await admin
    .from("trip_requests")
    .select(
      vipId
        ? `id, reference, created_at,
       lead:leads!inner (email),
       cases:booking_cases!inner (token, stage, vip_client_id)`
        : `id, reference, created_at,
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
    const alive = cases.find(
      (c: any) => c?.stage !== "cancelado" && (!vipId || c?.vip_client_id === vipId)
    )
    if (alive?.token) {
      return { token: String(alive.token), reference: String(row.reference) }
    }
  }

  return null
}

async function vipIdOf(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  token: string
): Promise<string | null> {
  const { data } = await admin.from("vip_clients").select("id").eq("link_token", token).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
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
    /*
     * TEN-01 · TEN-03 · o parceiro decide-se antes de tudo, e vai nas três
     * linhas — lead, pedido e caso. Só no caso não chegava: o RLS olha para o
     * `partner_id` de cada uma, e um caso do Alô com o lead e o pedido na
     * WeeFly ficava invisível na fila do Alô.
     */
    const ministry = await resolveMinistry(admin, input.ministryToken, input.ministrySecretaryId)
    /* B2G-02 · um pedido do espaço de um ministério que já não abre (link
       regenerado, ministério inactivo, canal desligado) não se transforma num
       pedido público: não se guarda. */
    if (input.ministryToken && !ministry) {
      console.warn("[pc] pedido de ministério recusado: link sem secretária activa, sem sessão, ou sem o canal B2G.")
      return null
    }
    /* B2G-22 · o mesmo para o link de um VIP: desactivado, de uma empresa sem
       o canal VIP, ou com um ministério ao mesmo tempo — não se guarda. */
    if (input.vipToken && input.ministryToken) {
      console.warn("[pc] pedido recusado: link de ministério e de VIP ao mesmo tempo.")
      return null
    }
    const vip = await resolveVip(admin, input.vipToken)
    if (input.vipToken && !vip) {
      console.warn("[pc] pedido VIP recusado: link sem VIP activo com o canal VIP.")
      return null
    }
    const partnerId =
      ministry?.partnerId ??
      vip?.partnerId ??
      (await resolveHostPartner(admin, input.hostPartnerSlug)) ??
      (await resolveLinkPartner(admin, input.companySlug, input.agentSlug)) ??
      (await operatorPartnerId(admin))

    const leadId = await upsertLead(admin, input, partnerId)
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
        /* VIP-10 · o que o cliente pediu, para pré-preencher a proposta. */
        baggage_hold: input.baggageHold,
        cabin_class: CABIN_TO_DB[input.cabin],
        /* FE-05 · vai para a coluna esquerda da ficha do caso, debaixo do
           resumo do pedido — que é onde quem cota olha antes de escrever. */
        special_requests: input.specialRequests,
        currency: input.currency,
        agent_slug: input.agentSlug,
        intake: "price_checker",
        consent_ip: input.consentIp,
        consent_agent: input.consentAgent,
        status: "novo",
        ...(partnerId ? { partner_id: partnerId } : {}),
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

    /* PRO-06 · o caso pertence à empresa do link (o parceiro resolvido em
       cima). Numa base sem a 0020 não se manda coluna nenhuma. */
    const { data: bookingCase, error: caseError } = await admin
      .from("booking_cases")
      .insert({
        token,
        stage: "pedido_recebido",
        trip_request_id: tripRequestId,
        lead_id: leadId,
        ...(partnerId ? { partner_id: partnerId } : {}),
        ...(ministry ? { organisation_id: ministry.organisationId, secretary_id: ministry.secretaryId } : {}),
        /* B2G-21 · o canal decide-o o gatilho da 0033 a partir do VIP; vai
           escrito na mesma, para quem lê o código. */
        ...(vip ? { vip_client_id: vip.vipClientId, channel: "vip" } : {}),
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
      title: ministry ? `Pedido submetido por ${ministry.secretaryName}` : "Pedido submetido pelo cliente",
      detail: [
        ministry ? `Ministério · ${ministry.secretaryName}` : vip ? "VIP" : "Price Checker",
        input.agentSlug ? `agent=${input.agentSlug}` : "sem agente",
        `lang=${input.locale}`,
        `cur=${input.currency}`,
        route,
      ].join(" · "),
      actorKind: "client",
      payload: {
        reference,
        ...(ministry ? { secretaryId: ministry.secretaryId } : {}),
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

/**
 * PRO-06 · a empresa de um link, confirmada.
 *
 * O `?company=` vem do endereço, e um endereço edita-se: aceitá-lo tal como
 * vem deixava qualquer pessoa pôr um pedido na fila de outra empresa. Só vale
 * se essa empresa estiver activa **e** tiver na allowlist um vendedor activo
 * cujo slug seja o `?agent=` do mesmo link — que é exactamente o link que o
 * construtor do back-office gera para essa pessoa.
 *
 * Qualquer outra coisa (empresa desconhecida, suspensa, vendedor de outra
 * empresa, base sem a 0020) devolve nulo, e o caso fica na WeeFly Global.
 */
async function resolveLinkPartner(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  companySlug: string | null | undefined,
  agentSlug: string | null
): Promise<string | null> {
  if (!companySlug || !agentSlug) return null

  const { data: partner, error } = await admin
    .from("partners")
    .select("id, status")
    .eq("slug", companySlug)
    .maybeSingle()
  if (error || !partner || (partner as { status: string }).status !== "active") return null
  const partnerId = (partner as { id: string }).id

  const { data: sellers } = await admin
    .from("bo_allowlist")
    .select("email")
    .eq("partner_id", partnerId)
    .eq("active", true)

  const matches = ((sellers ?? []) as { email: string }[]).some(
    (row) => sellerSlug(row.email) === agentSlug
  )
  return matches ? partnerId : null
}

/**
 * MIN-01 · B2G-06 · o ministério do link pessoal de uma secretária: a
 * secretária activa (a mesma cuja sessão a acção verificou), o ministério
 * activo, a empresa activa e com o canal B2G. O token do ministério
 * (`organisations.link_token`) já não serve.
 */
async function resolveMinistry(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  token: string | null | undefined,
  secretaryId: string | null | undefined
): Promise<{ organisationId: string; partnerId: string; secretaryId: string; secretaryName: string } | null> {
  if (!token || !secretaryId) return null
  const { data } = await admin
    .from("ministry_secretaries")
    .select("id, name, active, organisation:organisations(id, partner_id, active, partner:partners(status, channels))")
    .eq("link_token", token)
    .eq("id", secretaryId)
    .maybeSingle()
  const sec = data as Record<string, any> | null
  const org = sec ? (Array.isArray(sec.organisation) ? sec.organisation[0] : sec.organisation) : null
  const partner = org ? (Array.isArray(org.partner) ? org.partner[0] : org.partner) : null
  /* B2G-02 · um ministério de uma empresa sem o canal Ministérios não recebe pedidos. */
  if (!sec?.active || !org?.active || partner?.status !== "active" || !hasChannel(partner.channels, "B2G")) return null
  return { organisationId: org.id, partnerId: org.partner_id, secretaryId: sec.id, secretaryName: sec.name }
}

/**
 * B2G-22 · o VIP do link: activo, de uma empresa activa com o canal VIP. A
 * empresa vem da linha do VIP, nunca do formulário.
 */
async function resolveVip(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  token: string | null | undefined
): Promise<{ vipClientId: string; partnerId: string } | null> {
  if (!token) return null
  const { data } = await admin
    .from("vip_clients")
    .select("id, partner_id, active, partner:partners(status, channels)")
    .eq("link_token", token)
    .maybeSingle()
  const row = data as {
    id: string
    partner_id: string
    active: boolean
    partner: { status: string; channels: string[] | null } | { status: string; channels: string[] | null }[] | null
  } | null
  const partner = Array.isArray(row?.partner) ? row?.partner[0] : row?.partner
  if (!row || !row.active || partner?.status !== "active" || !hasChannel(partner.channels, "VIP")) return null
  return { vipClientId: row.id, partnerId: row.partner_id }
}

/** TEN-04 · o parceiro do subdomínio, se existir e estiver activo. */
async function resolveHostPartner(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  slug: string | null | undefined
): Promise<string | null> {
  if (!slug) return null
  const { data, error } = await admin
    .from("partners")
    .select("id, status")
    .eq("slug", slug)
    .maybeSingle()
  if (error || !data || (data as { status: string }).status !== "active") return null
  return (data as { id: string }).id
}

/** O operador, escrito explicitamente em vez de deixado ao default da 0020. */
async function operatorPartnerId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>
): Promise<string | null> {
  const { data, error } = await admin.from("partners").select("id").eq("is_operator", true).maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

/** O mesmo slug que o construtor de links tira do email (`topbar-actions`). */
function sellerSlug(email: string): string {
  return (email.split("@")[0] ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}
