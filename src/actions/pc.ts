"use server"

/**
 * WeeFly Price Checker — as ações do lado do cliente.
 *
 * Cinco escritas em todo o fluxo público: submeter o pedido, escolher a opção,
 * gravar os passaportes, enviar o comprovativo e cancelar. Tudo o resto é
 * leitura.
 *
 * Nenhuma destas ações tem sessão: quem as chama é um cliente com um link. A
 * autorização é o token — daí passar sempre pelo `loadPcState`, que é o único
 * sítio que o resolve, em vez de aceitar um `caseId` do formulário.
 */

import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import { z } from "zod"

import { LOCALE_COOKIE_MAX_AGE, isLocale } from "@/i18n/config"
import { PC_LOCALE_COOKIE, pcLocale } from "@/lib/pc/locale"
import { getTranslator, localeForClient } from "@/i18n/server"

import { createAdminClient } from "@/utils/supabase/admin"
import { hostPartnerSlug } from "@/lib/host-partner"
import { secretaryForLinkToken } from "@/lib/ministry"
import {
  RATE_LIMIT,
  SECRETARY_FLOOD,
  countRecentSubmissions,
  countSecretaryRequests,
  createPriceCheckerCase,
  findRecentSubmission,
} from "@/lib/pc/intake"
import { loadPcState } from "@/lib/pc/state"
import { attachProof, recordChosenMethod } from "@/lib/pc/payment"
import { logCaseEvent } from "@/lib/case-events"
import {
  chooseOfferForState,
  notifyAgent,
  savePassengersForState,
  type PcPassengerInput,
} from "@/lib/pc/case-steps"
import {
  CURRENCIES,
  MAX_LEGS,
  PAY_METHOD_IDS,
  PROOF_REVIEW_HOURS,
  methodLabelPt,
  type PayMethodId,
} from "@/lib/pc/catalog"
import { isKnownIata } from "@/lib/airports"
import { COUNTRY_BY_ISO, toE164 } from "@/lib/countries"

export type PcResult = { ok: true; notice?: string } | { ok: false; error: string }
export type { PcPassengerInput }

/** Quando a ação devolve algo além do sucesso — o token, o prazo. */
export type PcResultWith<T> = ({ ok: true } & T) | { ok: false; error: string }

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isKnownIata, "Escolha um aeroporto da lista")

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")

/*
 * O mesmo contrato de campos que o cabeçalho do mockup descreve. Validar aqui e
 * não só no ecrã porque o ecrã é do cliente: um pedido chega a esta função por
 * fetch tão facilmente como por clique.
 */
const requestSchema = z
  .object({
    trip: z.enum(["round", "oneway", "multi"]),
    cabin: z.enum(["economy", "premium", "business", "first"]),
    adults: z.coerce.number().int().min(1).max(9),
    children: z.coerce.number().int().min(0).max(8),
    infantsInSeat: z.coerce.number().int().min(0).max(4),
    infantsOnLap: z.coerce.number().int().min(0).max(9),
    /* VIP-10 · malas de porão. `default(0)` e não obrigatório porque os pedidos
       que chegam do chat e do bot ainda não perguntam isto — e zero é o que o
       formulário mostra a quem não mexe no seletor. O teto é o da coluna, não o
       do seletor: subir `MAX_BAGGAGE` não pode passar a ser inválido aqui. */
    baggageHold: z.coerce.number().int().min(0).max(9).default(0),
    origin: iata.nullable().optional(),
    destination: iata.nullable().optional(),
    departDate: isoDate.optional(),
    returnDate: isoDate.nullable().optional(),
    legs: z
      .array(z.object({ origin: iata, destination: iata, date: isoDate }))
      .max(MAX_LEGS)
      .default([]),
    name: z
      .string()
      .trim()
      .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, "Nome completo"),
    /*
     * O país e o indicativo, os dois.
     *
     * O indicativo sozinho não identifica o país — o +1 é de vinte — e é o país
     * que decide o mercado, a moeda e os métodos de pagamento que o cliente vê.
     * Chegam ambos e são verificados um contra o outro.
     */
    country: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => Boolean(COUNTRY_BY_ISO[v]), "País do telefone"),
    dialCode: z.string().trim(),
    /* O ecrã manda o número já em E.164; aqui é normalizado outra vez, porque
       um pedido chega a esta função por fetch tão facilmente como por clique. */
    phone: z.string().trim().min(4, "Telefone"),
    email: z.string().trim().email(),
    /*
     * FE-05 · o campo livre do ecrã de revisão.
     *
     * "Não chegar de noite", "viajo com a minha mãe em cadeira de rodas", "tenho
     * de estar em Lisboa antes das 14h". Nenhum campo estruturado apanha isto, e
     * é isto que faz a cotação certa à primeira. Mil caracteres é um parágrafo
     * escrito com vontade; acima disso é conversa, e conversa tem o WhatsApp.
     */
    specialRequests: z.string().trim().max(1000).optional(),
    consent: z.literal(true),
    locale: z.enum(["pt", "en", "fr"]).default("en"),
    currency: z.string().refine((v) => CURRENCIES.includes(v), "Moeda"),
    agentSlug: z.string().trim().max(40).nullable().optional(),
    /* MIN-01 · o token do link do ministério. Resolvido no intake. */
    ministryToken: z.string().trim().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
    /* B2G-22 · o token do link pessoal de um VIP. Resolvido no intake. */
    vipToken: z.string().trim().regex(/^[A-Za-z0-9_-]{32,64}$/).optional(),
    /* PRO-06 · a empresa do link. Validada no intake contra a allowlist. */
    companySlug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{1,63}$/)
      .nullable()
      .optional(),
  })
  .superRefine((v, ctx) => {
    const expectedDial = COUNTRY_BY_ISO[v.country]?.dial
    if (expectedDial && v.dialCode !== expectedDial) {
      ctx.addIssue({
        code: "custom",
        path: ["dialCode"],
        message: "O indicativo não é o do país escolhido",
      })
    }
    if (!toE164(v.dialCode || expectedDial || "", v.phone)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Telefone" })
    }

    // Um bebé no colo por adulto — é o limite da companhia, não nosso.
    if (v.infantsOnLap > v.adults) {
      ctx.addIssue({
        code: "custom",
        path: ["infantsOnLap"],
        message: "Um bebé de colo por adulto",
      })
    }

    if (v.trip === "multi") {
      if (v.legs.length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["legs"],
          message: `Indique entre 2 e ${MAX_LEGS} voos`,
        })
        return
      }
      v.legs.forEach((leg, i) => {
        if (i > 0 && leg.date < v.legs[i - 1].date) {
          ctx.addIssue({
            code: "custom",
            path: ["legs", i, "date"],
            message: "Cada voo tem de ser depois do anterior",
          })
        }
      })
      return
    }

    if (!v.origin || !v.destination) {
      ctx.addIssue({ code: "custom", path: ["origin"], message: "Rota incompleta" })
      return
    }
    if (v.origin === v.destination) {
      ctx.addIssue({
        code: "custom",
        path: ["destination"],
        message: "Escolha um destino diferente",
      })
    }
    if (!v.departDate) {
      ctx.addIssue({ code: "custom", path: ["departDate"], message: "Data de ida" })
      return
    }
    if (v.trip === "round") {
      if (!v.returnDate) {
        ctx.addIssue({ code: "custom", path: ["returnDate"], message: "Data de volta" })
      } else if (v.returnDate < v.departDate) {
        ctx.addIssue({
          code: "custom",
          path: ["returnDate"],
          message: "A volta não pode ser antes da ida",
        })
      }
    }
  })

export type PcRequestInput = z.input<typeof requestSchema>

/**
 * P2 · o pedido entra na fila.
 *
 * Devolve o token, que é o endereço permanente do cliente. Guardá-lo é
 * responsabilidade de quem chama (localStorage + o URL), porque é a única coisa
 * que lhe devolve o pedido se ele fechar o browser.
 */

/**
 * T-08 · os erros na língua do cliente, e do dicionário.
 *
 * Eram 28 frases em inglês escritas aqui, e um cliente que lia o ecrã em
 * português recebia "This link is no longer available." — o critério "nenhum
 * ecrã mistura línguas" falhava justamente no momento em que alguma coisa corre
 * mal. A língua resolve-se como a da página (`pcLocale`): o `?lang=`, o cookie
 * deste link, e a guardada no lead.
 */
function pcError(
  key: string,
  where: { token?: string; stored?: string | null } = {}
): string {
  const locale = where.token
    ? pcLocale({ token: where.token, stored: where.stored ?? null })
    : localeForClient(where.stored ?? null)
  return getTranslator(locale)(`pc.errors.${key}`)
}

export async function submitPcRequest(
  input: PcRequestInput
): Promise<PcResultWith<{ token: string; reference: string }>> {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? "Check the form" }
  }

  const v = parsed.data
  const head = headers()

  /*
   * B2G-07 · "Sem PIN não há pedido." Um pedido de ministério só entra com a
   * sessão aberta pelo PIN da secretária dona deste link (o cookie httpOnly
   * do caminho dela). O token sozinho já não basta.
   */
  let ministrySecretaryId: string | null = null
  if (v.ministryToken) {
    ministrySecretaryId = await secretaryForLinkToken(v.ministryToken)
    if (!ministrySecretaryId) {
      return { ok: false, error: pcError("ministrySession", { stored: input.locale }) }
    }
  }

  /* Atrás de um proxy o `x-forwarded-for` traz a cadeia; o primeiro é o cliente. */
  const ip =
    head.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    head.get("x-real-ip") ??
    null

  const origin = v.origin ?? v.legs[0]?.origin ?? ""
  const destination =
    v.destination ?? v.legs[v.legs.length - 1]?.destination ?? ""
  const departDate = v.departDate ?? v.legs[0]?.date ?? ""

  /*
   * Duplo clique, refresh, ou rede lenta: o mesmo pedido outra vez não é um
   * pedido novo. Devolver o token do primeiro leva o cliente ao pedido que ele
   * já fez, em vez de partir a conversa em dois casos e pôr duas linhas iguais
   * na fila de quem atende.
   */
  /*
   * B2G-10 · um pedido de ministério não se deduplica nem conta no limite por
   * IP: três pedidos iguais seguidos são três pedidos. Fica o travão por
   * secretária.
   */
  if (ministrySecretaryId) {
    if ((await countSecretaryRequests(ministrySecretaryId)) >= SECRETARY_FLOOD.max) {
      return { ok: false, error: pcError("ministryFlood", { stored: input.locale }) }
    }
  }

  const repeated = ministrySecretaryId ? null : await findRecentSubmission({
    email: v.email,
    origin,
    destination,
    departDate,
    vipToken: v.vipToken ?? null,
  })
  if (repeated) {
    return { ok: true, token: repeated.token, reference: repeated.reference }
  }

  /*
   * O travão. Um formulário público sem limite é uma fila de trabalho aberta a
   * quem escrever um script — e agora que cada pedido gera um aviso à equipa,
   * seria também uma caixa de correio inundada.
   */
  if (!ministrySecretaryId && (await countRecentSubmissions(ip)) >= RATE_LIMIT.max) {
    return {
      ok: false,
      error:
        "You have sent us several requests in a row. Give us a few minutes to look at them, or message us on WhatsApp.",
    }
  }

  const created = await createPriceCheckerCase({
    trip: v.trip,
    cabin: v.cabin,
    adults: v.adults,
    children: v.children,
    infantsInSeat: v.infantsInSeat,
    infantsOnLap: v.infantsOnLap,
    baggageHold: v.baggageHold,
    origin: v.origin ?? null,
    destination: v.destination ?? null,
    departDate: v.departDate ?? v.legs[0]?.date ?? "",
    returnDate: v.returnDate ?? null,
    legs: v.legs,
    name: v.name,
    dialCode: v.dialCode,
    country: v.country,
    phone: v.phone,
    email: v.email,
    specialRequests: v.specialRequests?.trim() || null,
    consent: true,
    locale: v.locale,
    currency: v.currency,
    agentSlug: v.agentSlug ?? null,
    companySlug: v.companySlug ?? null,
    ministryToken: v.ministryToken ?? null,
    ministrySecretaryId,
    vipToken: v.vipToken ?? null,
    /* TEN-04 · o parceiro do subdomínio, lido dos cabeçalhos — nunca do
       formulário. */
    hostPartnerSlug: hostPartnerSlug(),
    /* O ecrã de consentimento promete guardar IP e dispositivo. */
    consentIp: ip,
    consentAgent: head.get("user-agent")?.slice(0, 300) ?? null,
  })

  if (!created) {
    return {
      ok: false,
      error: pcError("saveRequest", { stored: input.locale }),
    }
  }

  /*
   * NT-01 e NT-02, por esta ordem e os dois independentes.
   *
   * O do cliente primeiro porque é o que ele está à espera de ver na caixa de
   * correio enquanto ainda tem o ecrã aberto. O da equipa a seguir. Nenhum
   * espera pelo outro nem o desfaz: são duas linhas em `case_notifications`, e
   * quem falhar falha sozinho.
   */
  await notifyRequestReceived(created.caseId)
  await notifyTeamNewRequest(created.caseId)

  revalidatePath("/admin/price-checker")

  return { ok: true, token: created.token, reference: created.reference }
}

// ── P5 · escolher a opção ────────────────────────────────────────────────────

/**
 * O cliente escolhe a opção.
 *
 * O que aqui **não** acontece é abrir a janela de pagamento. Acontecia, e era o
 * erro BO-02: um valor a cobrar existia antes de haver passageiros, e um link
 * de pagamento criado antes de a tarifa estar fixada pode levar o montante
 * errado. Dinheiro a mexer-se contra um preço velho é a classe de erro mais
 * caro deste sistema.
 *
 * O pagamento nasce um passo depois, quando os passaportes estão todos
 * completos — ver `savePcPassengers`.
 */
export async function choosePcOffer(
  token: string,
  offerId: string
): Promise<PcResult> {
  /* B2G-16 · um caso de ministério não abre aqui (`loadPcState`): a escolha
     da secretária passa pela sessão do PIN (`actions/ministry-case.ts`). */
  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: pcError("linkUnavailable", { token }) }

  const state = lookup.state
  return chooseOfferForState(state, offerId, {
    actor: { kind: "client" },
    error: (key) => pcError(key, { token, stored: state.contact.locale }),
    revalidate: [`/pc/${token}`],
  })
}

// ── P7 · passaportes ─────────────────────────────────────────────────────────

/**
 * Grava os passaportes (o corpo está em `lib/pc/case-steps.ts`, partilhado com
 * o espaço do ministério). Substitui o conjunto inteiro em cada gravação.
 */
export async function savePcPassengers(
  token: string,
  rows: PcPassengerInput[]
): Promise<PcResult> {
  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: pcError("linkUnavailable", { token }) }

  const state = lookup.state
  return savePassengersForState(state, rows, {
    actor: { kind: "client" },
    error: (key) => pcError(key, { token, stored: state.contact.locale }),
    revalidate: [`/pc/${token}`],
  })
}

// ── P7pay · método e comprovativo ────────────────────────────────────────────

/* C-33 · os cinco métodos vivem no catálogo, num sítio só. Estavam escritos
   aqui outra vez, e uma segunda lista é uma lista que fica atrás. */
const METHODS: PayMethodId[] = PAY_METHOD_IDS

/** O método escolhido, guardado à medida que o cliente clica. */
export async function setPcPayMethod(
  token: string,
  method: string,
  provider: string | null
): Promise<PcResult> {
  if (!METHODS.includes(method as PayMethodId)) {
    return { ok: false, error: pcError("unknownMethod", { token }) }
  }

  const lookup = await loadPcState(token)
  if (!lookup.ok || !lookup.state.payment) {
    return { ok: false, error: pcError("nothingToPay", { token }) }
  }

  const previous = lookup.state.payment.method

  await recordChosenMethod(
    lookup.state.payment.id,
    method as PayMethodId,
    provider?.trim() || null
  )

  /*
   * C-32 · "escolheu o método de pagamento" é um avanço do cliente, e avisa.
   *
   * Era o único da lista do C-32 que não deixava rasto: a coluna era gravada e
   * mais nada acontecia. E é o avanço que **cria trabalho para nós** — a partir
   * daqui alguém tem de arranjar o link ou a referência daquela via (C-33), pelo
   * que é precisamente o que a campainha tem de acender.
   *
   * Só quando muda de facto. O ecrã grava a escolha a cada clique, e registar
   * cada um deles enchia o histórico com a mesma linha repetida enquanto o
   * cliente hesitava entre dois métodos.
   */
  if (previous !== method) {
    await logCaseEvent({
      caseId: lookup.state.caseId,
      kind: "pay_method_chosen",
      title: "O cliente escolheu como pagar",
      detail: [
        methodLabelPt(method),
        provider?.trim() || null,
        previous ? `antes: ${methodLabelPt(previous)}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      actorKind: "client",
      payload: { method, provider: provider?.trim() || null, previous },
    })

    revalidatePath("/admin/price-checker")
    revalidatePath(`/admin/price-checker/${lookup.state.caseId}`)
  }

  revalidatePath(`/pc/${token}`)
  return { ok: true }
}

/**
 * O comprovativo. É este gesto que fecha o lado do cliente.
 *
 * Recebe FormData porque um ficheiro não atravessa a fronteira do servidor de
 * outra maneira. O limite e os tipos são verificados no servidor mesmo estando
 * verificados no ecrã: o `accept` de um input é uma sugestão.
 */
export async function uploadPcProof(
  token: string,
  formData: FormData
): Promise<PcResultWith<{ reviewHours: number }>> {
  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: pcError("linkUnavailable", { token }) }

  const state = lookup.state
  if (!state.payment) return { ok: false, error: pcError("nothingToPay", { token, stored: state.contact.locale }) }

  const file = formData.get("proof")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: pcError("attachProof", { token, stored: state.contact.locale }) }
  }

  const method = String(formData.get("method") ?? "") as PayMethodId
  const provider = String(formData.get("provider") ?? "").trim() || null

  const outcome = await attachProof({
    caseId: state.caseId,
    fileName: file.name,
    mimeType: file.type,
    bytes: await file.arrayBuffer(),
    method: METHODS.includes(method) ? method : null,
    provider,
  })

  if (!outcome.ok) {
    const message: Record<string, string> = {
      too_big: pcError("fileTooBig", { token, stored: state.contact.locale }),
      bad_type: pcError("badFileType", { token, stored: state.contact.locale }),
      no_payment: pcError("nothingToPay", { token, stored: state.contact.locale }),
      closed: pcError("paymentClosed", { token, stored: state.contact.locale }),
      upload_failed: pcError("uploadFailed", { token, stored: state.contact.locale }),
      unavailable: pcError("unavailable", { token, stored: state.contact.locale }),
    }
    return { ok: false, error: message[outcome.reason] ?? pcError("uploadFailed", { token, stored: state.contact.locale }) }
  }

  const admin = createAdminClient()
  if (admin) {
    await admin
      .from("booking_cases")
      .update({ stage: "pagamento_pendente" })
      .eq("id", state.caseId)
      .in("stage", [
        "novo",
        "pedido_recebido",
        "proposta_enviada",
        "opcao_escolhida",
        "detalhes_pendentes",
        "detalhes_recebidos",
      ])
  }

  await notifyTeam(state.caseId, { proof: true })
  await notifyAgent(
    state.caseId,
    "proof_uploaded",
    `${file.name} · a validar dentro de ${PROOF_REVIEW_HOURS}h`
  )

  revalidatePath(`/pc/${token}`)
  revalidatePath("/admin/price-checker")
  revalidatePath(`/admin/price-checker/${state.caseId}`)

  return { ok: true, reviewHours: PROOF_REVIEW_HOURS }
}

/**
 * Métodos sem comprovativo (cartão, link, mobile money) — o cliente diz que fez
 * a sua parte.
 *
 * Continua a ser uma declaração e não uma confirmação: o que muda é o
 * back-office passar a ver que há alguém à espera.
 */
export async function declarePcPaid(
  token: string,
  method: string,
  provider: string | null
): Promise<PcResult> {
  const lookup = await loadPcState(token)
  const payment = lookup.ok ? lookup.state.payment : null
  if (!lookup.ok || !payment) {
    return { ok: false, error: pcError("nothingToPay", { token }) }
  }

  const state = lookup.state
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: pcError("unavailable", { token, stored: state.contact.locale }) }

  const now = new Date().toISOString()

  await admin
    .from("case_payments")
    .update({
      client_declared_paid_at: now,
      /* 'recebido' significa "há algo para alguém olhar", e é isso que uma
         declaração é. O prazo das 48h arranca igual: a espera do cliente passa
         a ser nossa. */
      proof_status: "recebido",
      review_deadline_at: new Date(
        Date.now() + PROOF_REVIEW_HOURS * 3600_000
      ).toISOString(),
      ...(METHODS.includes(method as PayMethodId) ? { method } : {}),
      ...(provider ? { pay_provider: provider } : {}),
    })
    .eq("id", payment.id)

  /* T-22 · uma declaração por pagamento e por via. Carregar duas vezes no botão
     não põe duas linhas na campainha nem dois emails na caixa da equipa. */
  const fresh = await logCaseEvent({
    caseId: state.caseId,
    kind: "client_declared_paid",
    title: "Cliente declarou ter pago",
    detail: method,
    actorKind: "client",
    once: `client_declared_paid:${payment.id}:${method}`,
  })

  if (fresh.written) await notifyTeam(state.caseId)

  revalidatePath(`/pc/${token}`)
  revalidatePath("/admin/price-checker")

  return { ok: true }
}

// ── T-08 · a língua do cliente ───────────────────────────────────────────────

/**
 * T-08 · o seletor do cabeçalho passa a fazer alguma coisa.
 *
 * "O cliente escolheu português, a notificação chegou, e o link abriu
 * **inteiramente em inglês**. O seletor de língua nesses ecrãs não faz nada."
 *
 * Fazia mesmo nada: mudava a letra do botão e mostrava um aviso. Aqui a escolha
 * é gravada nos dois sítios onde ela tem consequências, e são dois de propósito:
 *
 *   · **o cookie**, para os ecrãs seguintes desta visita saírem na língua certa
 *     sem esperar por nada. Leva o token porque a preferência é sobre *este*
 *     pedido: um telemóvel partilhado por duas pessoas não deve arrastar a
 *     língua de uma para o link da outra;
 *   · **o lead**, porque o critério pede que "a mesma `lang` mande nos emails e
 *     nos modelos de WhatsApp" — e esses saem horas depois, sem browser nenhum
 *     do lado do cliente. O que existe nessa altura é a coluna (ver
 *     `localeForClient`).
 */
export async function setPcLocale(
  token: string,
  locale: string
): Promise<PcResult> {
  if (!isLocale(locale)) return { ok: false, error: pcError("unknownLanguage", { token }) }

  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: pcError("linkUnavailable", { token }) }

  const state = lookup.state

  cookies().set(PC_LOCALE_COOKIE, `${token}:${locale}`, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  })

  const admin = createAdminClient()
  if (admin && state.contact.locale !== locale) {
    const { data: trip } = await admin
      .from("trip_requests")
      .select("lead_id")
      .eq("reference", state.request.reference)
      .maybeSingle()

    const leadId = (trip as { lead_id: string | null } | null)?.lead_id
    if (leadId) {
      await admin.from("leads").update({ locale }).eq("id", leadId)
    }

    await logCaseEvent({
      caseId: state.caseId,
      kind: "locale_changed",
      title: "O cliente mudou de língua",
      detail: `${state.contact.locale} → ${locale}`,
      actorKind: "client",
      payload: { from: state.contact.locale, to: locale },
    })
  }

  revalidatePath(`/pc/${token}`)
  return { ok: true }
}

// ── T-18 · o cliente escreve-nos a partir do ecrã de pagamento ───────────────

/**
 * T-18 · "um campo de texto livre onde o cliente pode escrever algo à WeeFly".
 *
 * O ecrã de pagamento tinha um botão de WhatsApp e mais nada. O WhatsApp é
 * óptimo e tem um defeito: a mensagem chega a um telemóvel e **não chega ao
 * caso**. Quem abre a ficha no dia seguinte não sabe que o cliente disse "paguei
 * pelo Revolut da minha irmã, o nome no comprovativo não é o meu" — que é
 * exactamente a frase que evita uma hora de investigação.
 *
 * Por isso isto escreve no registo do caso e avisa o agente dono, pelos mesmos
 * canais dos outros avanços do cliente. Sem chave de duplicado: duas mensagens
 * seguidas são duas mensagens, e recusar a segunda seria perder o esclarecimento
 * que veio a seguir ao mal-entendido.
 */
export async function sendPcMessage(
  token: string,
  message: string
): Promise<PcResult> {
  const body = message.trim()
  if (body.length < 2) {
    return { ok: false, error: pcError("writeMessage", { token }) }
  }
  if (body.length > 2000) {
    return { ok: false, error: pcError("messageTooLong", { token }) }
  }

  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: pcError("linkUnavailable", { token }) }

  const state = lookup.state

  await logCaseEvent({
    caseId: state.caseId,
    kind: "client_message",
    title: "Mensagem do cliente",
    detail: body.slice(0, 500),
    actorKind: "client",
    payload: { length: body.length },
  })

  await notifyAgent(state.caseId, "message_sent", body.slice(0, 500))

  revalidatePath(`/pc/${token}`)
  revalidatePath("/admin/price-checker")
  revalidatePath(`/admin/price-checker/${state.caseId}`)

  return { ok: true }
}

// ── P3 · cancelar ────────────────────────────────────────────────────────────

export async function cancelPcRequest(
  token: string,
  reason: string
): Promise<PcResult> {
  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: pcError("linkUnavailable", { token }) }

  const state = lookup.state
  if (state.payment?.status === "COMPLETED") {
    return {
      ok: false,
      error: pcError("paidNoCancel", { token, stored: state.contact.locale }),
    }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: pcError("unavailable", { token, stored: state.contact.locale }) }

  await admin
    .from("booking_cases")
    .update({ stage: "cancelado" })
    .eq("id", state.caseId)

  await admin
    .from("trip_requests")
    .update({ status: "perdido" })
    .eq("reference", state.request.reference)

  /* T-22 · um pedido cancela-se uma vez. */
  await logCaseEvent({
    caseId: state.caseId,
    kind: "request_cancelled",
    title: "Pedido cancelado pelo cliente",
    detail: reason.trim() || "Sem motivo indicado",
    actorKind: "client",
    once: true,
  })

  await notifyAgent(
    state.caseId,
    "request_cancelled",
    reason.trim() || "Sem motivo indicado"
  )

  revalidatePath(`/pc/${token}`)
  revalidatePath("/admin/price-checker")

  return { ok: true }
}

/** P8 · "quero uma nova pesquisa, com as mesmas datas". */
export async function requestPcResearch(token: string): Promise<PcResult> {
  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: pcError("linkUnavailable", { token }) }

  const state = lookup.state
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: pcError("unavailable", { token, stored: state.contact.locale }) }

  /* O caso volta à fila em "pedido_recebido": é isso que ele é outra vez — algo
     à espera de ser cotado. As propostas antigas ficam, e é o back-office que
     cria a revisão. */
  await admin
    .from("booking_cases")
    .update({ stage: "pedido_recebido" })
    .eq("id", state.caseId)

  await logCaseEvent({
    caseId: state.caseId,
    kind: "research_requested",
    title: "Cliente pediu nova pesquisa",
    detail: "Mesmas datas e passageiros",
    actorKind: "client",
  })

  revalidatePath(`/pc/${token}`)
  revalidatePath("/admin/price-checker")

  return { ok: true }
}

/** Best-effort: um email falhado nunca desfaz o que o cliente acabou de fazer. */
async function notifyTeam(caseId: string, options: { proof?: boolean } = {}): Promise<void> {
  try {
    const { sendPaymentDeclaredEmail } = await import("@/lib/emails/send")
    await sendPaymentDeclaredEmail(caseId, options)
  } catch (err) {
    console.error("[pc] aviso à equipa falhou:", err)
  }
}

/**
 * O aviso de pedido novo.
 *
 * Separado do `notifyTeam` porque é outra notícia para outro momento, e porque
 * um pedido que entra tem de avisar mesmo que o email de pagamento esteja mal
 * configurado — falham de forma independente.
 */
async function notifyTeamNewRequest(caseId: string): Promise<void> {
  try {
    const { sendNewRequestAlert } = await import("@/lib/emails/send")
    await sendNewRequestAlert(caseId)
  } catch (err) {
    console.error("[pc] aviso de pedido novo falhou:", err)
  }
}

/** NT-01 · a confirmação a quem submeteu, com referência e prazo de resposta. */
async function notifyRequestReceived(caseId: string): Promise<void> {
  try {
    const { sendRequestReceivedEmail } = await import("@/lib/emails/send")
    await sendRequestReceivedEmail(caseId)
  } catch (err) {
    console.error("[pc] confirmação ao cliente falhou:", err)
  }
}
