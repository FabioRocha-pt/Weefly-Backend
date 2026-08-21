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
import { headers } from "next/headers"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import {
  RATE_LIMIT,
  countRecentSubmissions,
  createPriceCheckerCase,
  findRecentSubmission,
} from "@/lib/pc/intake"
import { loadPcState, paxTotal } from "@/lib/pc/state"
import {
  attachProof,
  openPaymentWindow,
  recordChosenMethod,
} from "@/lib/pc/payment"
import { recordOfferSelection } from "@/lib/proposals"
import { offerTotal } from "@/lib/proposal-math"
import { logCaseEvent } from "@/lib/case-events"
import {
  CURRENCIES,
  MAX_LEGS,
  NATIONALITIES,
  PAY_WINDOW_HOURS,
  PROOF_REVIEW_HOURS,
  carrierName,
  type PayMethodId,
} from "@/lib/pc/catalog"
import { isKnownIata } from "@/lib/airports"
import { COUNTRY_BY_ISO, toE164 } from "@/lib/countries"

export type PcResult = { ok: true; notice?: string } | { ok: false; error: string }

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
    consent: z.literal(true),
    locale: z.enum(["pt", "en", "fr"]).default("en"),
    currency: z.string().refine((v) => CURRENCIES.includes(v), "Moeda"),
    agentSlug: z.string().trim().max(40).nullable().optional(),
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
  const repeated = await findRecentSubmission({
    email: v.email,
    origin,
    destination,
    departDate,
  })
  if (repeated) {
    return { ok: true, token: repeated.token, reference: repeated.reference }
  }

  /*
   * O travão. Um formulário público sem limite é uma fila de trabalho aberta a
   * quem escrever um script — e agora que cada pedido gera um aviso à equipa,
   * seria também uma caixa de correio inundada.
   */
  if (await countRecentSubmissions(ip) >= RATE_LIMIT.max) {
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
    consent: true,
    locale: v.locale,
    currency: v.currency,
    agentSlug: v.agentSlug ?? null,
    /* O ecrã de consentimento promete guardar IP e dispositivo. */
    consentIp: ip,
    consentAgent: head.get("user-agent")?.slice(0, 300) ?? null,
  })

  if (!created) {
    return {
      ok: false,
      error: "We could not save your request. Please try again in a moment.",
    }
  }

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
  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: "This link is no longer available." }

  const state = lookup.state
  if (state.cancelled) return { ok: false, error: "This request was cancelled." }
  if (state.expiry.expired) {
    return { ok: false, error: "These options have expired. Ask for a fresh search." }
  }

  const offer = state.offers.find((o) => o.id === offerId)
  if (!offer) return { ok: false, error: "That option is not available." }

  const recorded = await recordOfferSelection(state.caseId, offerId)
  if (!recorded) return { ok: false, error: "We could not record your choice." }

  const amount = offerTotal(offer, state.pax)

  const admin = createAdminClient()
  if (admin) {
    /* A etapa avança para "opção escolhida"; os passaportes e o pagamento ainda
       estão por fazer, e é o back-office que precisa de ver essa diferença. */
    await admin
      .from("booking_cases")
      .update({ stage: "opcao_escolhida" })
      .eq("id", state.caseId)
      .in("stage", ["novo", "pedido_recebido", "proposta_enviada"])
  }

  await logCaseEvent({
    caseId: state.caseId,
    kind: "offer_selected",
    title: "Cliente escolheu a opção",
    detail: `${offer.name || carrierName(offer.segments[0]?.carrier_code)} · ${amount / 100} ${recorded.currency}`,
    actorKind: "client",
    payload: { offerId, amount },
  })

  revalidatePath(`/pc/${token}`)
  revalidatePath("/admin/price-checker")
  revalidatePath(`/admin/price-checker/${state.caseId}`)

  return { ok: true }
}

// ── P7 · passaportes ─────────────────────────────────────────────────────────

const passengerSchema = z.object({
  position: z.coerce.number().int().min(1),
  kind: z.enum(["adult", "child", "infant_seat", "infant_lap"]),
  title: z.enum(["mr", "mrs", "ms"]).nullable().optional(),
  given: z.string().trim().min(2, "As in the passport"),
  surname: z.string().trim().min(2, "As in the passport"),
  dob: isoDate,
  sex: z.enum(["f", "m"]),
  nationality: z.string().refine((v) => NATIONALITIES.includes(v), "Nationality"),
  passportNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{5,12}$/, "5 to 12 letters or digits"),
  passportExpiry: isoDate,
  issuingCountry: z.string().refine((v) => NATIONALITIES.includes(v), "Issuing country"),
})

export type PcPassengerInput = z.input<typeof passengerSchema>

/**
 * Grava os passaportes. Substitui o conjunto inteiro em cada gravação.
 *
 * Substituir e não fundir: o número de passageiros vem do pedido, e um
 * `upsert` por posição deixaria linhas órfãs se o pedido mudasse de 3 para 2.
 */
export async function savePcPassengers(
  token: string,
  rows: PcPassengerInput[]
): Promise<PcResult> {
  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: "This link is no longer available." }

  const state = lookup.state
  if (!state.selectedOfferId) {
    return { ok: false, error: "Choose an option first." }
  }
  if (state.payment?.status === "COMPLETED") {
    return { ok: false, error: "This booking is already paid. Talk to us to change a name." }
  }

  const expected = paxTotal(state.request)
  if (rows.length !== expected) {
    return { ok: false, error: `We need ${expected} passenger(s).` }
  }

  const parsed = z.array(passengerSchema).safeParse(rows)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const at = issue?.path?.[0]
    return {
      ok: false,
      error:
        typeof at === "number"
          ? `Passenger ${at + 1}: ${issue.message}`
          : (issue?.message ?? "Check the passenger details"),
    }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Service unavailable." }

  await admin.from("case_passengers").delete().eq("case_id", state.caseId)

  const { error } = await admin.from("case_passengers").insert(
    parsed.data.map((p) => ({
      case_id: state.caseId,
      position: p.position,
      passenger_type: p.kind,
      title: p.title ?? null,
      first_name: p.given,
      last_name: p.surname,
      gender: p.sex,
      birth_date: p.dob,
      nationality: p.nationality,
      passport_number: p.passportNumber.toUpperCase(),
      passport_expiry: p.passportExpiry,
      issuing_country: p.issuingCountry,
    }))
  )

  if (error) {
    console.error("[pc] passageiros não guardados:", error.message)
    return { ok: false, error: "We could not save the passenger details." }
  }

  await admin
    .from("booking_cases")
    .update({ stage: "detalhes_recebidos" })
    .eq("id", state.caseId)
    .in("stage", ["novo", "pedido_recebido", "proposta_enviada", "opcao_escolhida", "detalhes_pendentes"])

  await admin
    .from("case_links")
    .update({ status: "submetido", submitted_at: new Date().toISOString() })
    .eq("case_id", state.caseId)
    .eq("stage", 2)
    .neq("status", "submetido")

  await logCaseEvent({
    caseId: state.caseId,
    kind: "passengers_submitted",
    title: "Passaportes submetidos",
    detail: `${parsed.data.length} de ${expected}`,
    actorKind: "client",
  })

  /*
   * BO-02 · é aqui que o link de pagamento nasce, e em nenhum outro sítio.
   *
   * Duas condições, as duas verificadas do lado do servidor: a opção está
   * escolhida (acima) e os passageiros estão todos completos (a gravação que
   * acabou de acontecer é o conjunto inteiro, validado campo a campo pelo
   * `passengerSchema`). Só depois disso existe um valor a cobrar e alguém a
   * quem o cobrar.
   *
   * O montante é calculado da oferta escolhida e dos passageiros do pedido —
   * nunca vem do formulário. E a descrição leva a referência do caso, porque é
   * ela que aparece no extrato de quem paga.
   */
  const chosen = state.offers.find((o) => o.id === state.selectedOfferId)
  if (chosen) {
    const amount = offerTotal(chosen, state.pax)
    const description = [
      chosen.name || carrierName(chosen.segments[0]?.carrier_code),
      `${state.request.origin} → ${state.request.destination}`,
      state.request.reference,
    ]
      .filter(Boolean)
      .join(" · ")

    const payment = await openPaymentWindow(
      state.caseId,
      amount,
      state.quoteCurrency,
      description
    )

    if (!payment) {
      console.error(
        "[pc] passageiros guardados mas o pagamento não abriu:",
        state.caseId
      )
    } else if (!state.payment) {
      await logCaseEvent({
        caseId: state.caseId,
        kind: "payment_window_opened",
        title: "Link de pagamento gerado",
        detail: `${amount / 100} ${state.quoteCurrency} · expira em ${PAY_WINDOW_HOURS}h`,
        actorKind: "system",
        payload: { amount, currency: state.quoteCurrency },
      })
    }
  }

  revalidatePath(`/pc/${token}`)
  revalidatePath(`/admin/price-checker/${state.caseId}`)

  return { ok: true }
}

// ── P7pay · método e comprovativo ────────────────────────────────────────────

const METHODS: PayMethodId[] = ["transfer", "link", "card", "momo", "local", "cash"]

/** O método escolhido, guardado à medida que o cliente clica. */
export async function setPcPayMethod(
  token: string,
  method: string,
  provider: string | null
): Promise<PcResult> {
  if (!METHODS.includes(method as PayMethodId)) {
    return { ok: false, error: "Unknown payment method." }
  }

  const lookup = await loadPcState(token)
  if (!lookup.ok || !lookup.state.payment) {
    return { ok: false, error: "Nothing to pay yet." }
  }

  await recordChosenMethod(
    lookup.state.payment.id,
    method as PayMethodId,
    provider?.trim() || null
  )

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
  if (!lookup.ok) return { ok: false, error: "This link is no longer available." }

  const state = lookup.state
  if (!state.payment) return { ok: false, error: "Nothing to pay yet." }

  const file = formData.get("proof")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Attach the proof of your payment." }
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
      too_big: "That file is over 8 MB.",
      bad_type: "Send a JPG, a PNG or a PDF.",
      no_payment: "Nothing to pay yet.",
      closed: "This payment is already closed. Talk to us on WhatsApp.",
      upload_failed: "We could not store the file. Please try again.",
      unavailable: "Service unavailable.",
    }
    return { ok: false, error: message[outcome.reason] ?? "Upload failed." }
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
    return { ok: false, error: "Nothing to pay yet." }
  }

  const state = lookup.state
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Service unavailable." }

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

  await logCaseEvent({
    caseId: state.caseId,
    kind: "client_declared_paid",
    title: "Cliente declarou ter pago",
    detail: method,
    actorKind: "client",
  })

  await notifyTeam(state.caseId)

  revalidatePath(`/pc/${token}`)
  revalidatePath("/admin/price-checker")

  return { ok: true }
}

// ── P3 · cancelar ────────────────────────────────────────────────────────────

export async function cancelPcRequest(
  token: string,
  reason: string
): Promise<PcResult> {
  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: "This link is no longer available." }

  const state = lookup.state
  if (state.payment?.status === "COMPLETED") {
    return {
      ok: false,
      error: "This booking is paid. Talk to us on WhatsApp before cancelling.",
    }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Service unavailable." }

  await admin
    .from("booking_cases")
    .update({ stage: "cancelado" })
    .eq("id", state.caseId)

  await admin
    .from("trip_requests")
    .update({ status: "perdido" })
    .eq("reference", state.request.reference)

  await logCaseEvent({
    caseId: state.caseId,
    kind: "request_cancelled",
    title: "Pedido cancelado pelo cliente",
    detail: reason.trim() || "Sem motivo indicado",
    actorKind: "client",
  })

  revalidatePath(`/pc/${token}`)
  revalidatePath("/admin/price-checker")

  return { ok: true }
}

/** P8 · "quero uma nova pesquisa, com as mesmas datas". */
export async function requestPcResearch(token: string): Promise<PcResult> {
  const lookup = await loadPcState(token)
  if (!lookup.ok) return { ok: false, error: "This link is no longer available." }

  const state = lookup.state
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Service unavailable." }

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
    const { sendPcRequestReceivedEmail } = await import("@/lib/emails/send")
    await sendPcRequestReceivedEmail(caseId)
  } catch (err) {
    console.error("[pc] aviso de pedido novo falhou:", err)
  }
}
