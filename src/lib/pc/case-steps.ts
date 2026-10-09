/**
 * WeeFly Price Checker — escolher a opção e gravar os passageiros, por dentro.
 *
 * As duas escritas do percurso do caso, sem a autorização: quem chama já
 * resolveu o caso e decidiu quem é.
 *
 *   · o cliente do canal público e VIP — pelo token do caso (`actions/pc.ts`,
 *     `choosePcOffer` e `savePcPassengers`);
 *   · B2G-16 · a secretária do ministério — pela sessão do PIN, no espaço do
 *     ministério (`actions/ministry-case.ts`). O token do caso não abre um
 *     caso de ministério (`loadPcState`).
 *
 * O que muda com a secretária: o registo diz que foi ela (`actor_kind
 * secretary`), o tipo de cada passageiro sai da data de nascimento e o pedido
 * passa a ter a mistura real (D-7), a ficha do ministério guarda quem registou
 * (B2G-25), e o caso fica **pronto a emitir** sem pagamento (B2G-17).
 *
 * SÓ SERVIDOR. Nada daqui é uma server action: são funções internas.
 */

import { createHash } from "crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { openPaymentWindow } from "@/lib/pc/payment"
import { recordOfferSelection, syncPaymentToOffer } from "@/lib/proposals"
import { offerTotal } from "@/lib/proposal-math"
import { logCaseEvent } from "@/lib/case-events"
import { syncMinistryTravellers } from "@/lib/travellers"
import { NATIONALITIES, PAY_WINDOW_HOURS, carrierName } from "@/lib/pc/catalog"
import { paxKindFromDob } from "@/lib/pc/format"
import { paxTotal, type PcState } from "@/lib/pc/state"

export type PcResult = { ok: true; notice?: string } | { ok: false; error: string }

/** Quem está a fazer o gesto. */
export type StepActor =
  | { kind: "client" }
  | { kind: "secretary"; secretaryId: string; name: string; email: string | null }

export interface StepContext {
  actor: StepActor
  /** A frase de erro, já na língua de quem lê. */
  error: (key: string) => string
  /** Os caminhos do lado de quem pediu que a escrita torna desactualizados. */
  revalidate: string[]
}

function actorFields(actor: StepActor) {
  return actor.kind === "secretary"
    ? { actorKind: "secretary" as const, actorSecretaryId: actor.secretaryId, actorEmail: actor.email }
    : { actorKind: "client" as const }
}

const isIssued = (state: PcState) => state.stage === "emitido" || Boolean(state.issued.pnr)

// ── P5 · a opção ─────────────────────────────────────────────────────────────

export async function chooseOfferForState(
  state: PcState,
  offerId: string,
  ctx: StepContext
): Promise<PcResult> {
  if (state.cancelled) return { ok: false, error: ctx.error("requestCancelled") }
  if (state.expiry.expired) return { ok: false, error: ctx.error("offersExpired") }

  const offer = state.offers.find((o) => o.id === offerId)
  if (!offer) return { ok: false, error: ctx.error("offerUnavailable") }

  /* T-02 · depois de o pagamento estar confirmado a oferta está paga: trocar
     já não é uma escolha, é uma alteração que passa pela equipa. O botão
     some no ecrã; esta é a mesma regra do lado do servidor. B2G-18 · e depois
     de emitido também não. */
  if (
    (state.payment && (state.payment.status === "COMPLETED" || state.payment.admin_confirmed)) ||
    isIssued(state)
  ) {
    return { ok: false, error: ctx.error("offerPaid") }
  }

  /*
   * T-02 · trocar de opção não pode deixar o cliente encalhado.
   *
   *   1. Nada mudava depois do clique — a saída está no ecrã
   *      (`screen-options.tsx`), que sai do `?view=p5` quando a escolha passa.
   *   2. O valor a cobrar não acompanhava: trocar de opção depois de os
   *      passaportes estarem gravados deixava o pagamento com o preço da opção
   *      antiga — é o defeito que custa dinheiro.
   */
  const previousOfferId = state.selectedOfferId
  const changed = Boolean(previousOfferId) && previousOfferId !== offerId

  const recorded = await recordOfferSelection(state.caseId, offerId)
  if (!recorded) return { ok: false, error: ctx.error("choiceNotRecorded") }

  const amount = offerTotal(offer, state.pax)
  const who = actorFields(ctx.actor)

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

  /*
   * O valor segue a escolha, e as instruções antigas morrem com ela: um link de
   * Stripe cobra o valor que o agente lá pôs, e um cliente que troca para uma
   * opção mais cara pagaria a menos.
   */
  if (changed && state.payment) {
    const description = [
      offer.name || carrierName(offer.segments[0]?.carrier_code),
      `${state.request.origin} → ${state.request.destination}`,
      state.request.reference,
    ]
      .filter(Boolean)
      .join(" · ")

    await syncPaymentToOffer(state.caseId, amount, state.quoteCurrency, description)

    const stale =
      state.payment.amount !== amount &&
      Boolean(state.payment.pay_link || state.payment.pay_reference)

    if (stale && admin) {
      await admin
        .from("case_payments")
        .update({
          pay_link: null,
          pay_reference: null,
          pay_instructions_sent_at: null,
          pay_instructions_sent_by_email: null,
          pay_due_at: null,
        })
        .eq("id", state.payment.id)

      await logCaseEvent({
        caseId: state.caseId,
        kind: "pay_instructions_voided",
        title: "Instruções de pagamento anuladas",
        detail: `O cliente trocou de oferta e o valor passou de ${
          state.payment.amount / 100
        } para ${amount / 100} ${state.quoteCurrency} — o link antigo cobrava o preço errado.`,
        actorKind: "system",
        payload: { from: state.payment.amount, to: amount },
      })
    }
  }

  const offerName = offer.name || carrierName(offer.segments[0]?.carrier_code)
  const byWhom = ctx.actor.kind === "secretary" ? ctx.actor.name : null

  /* T-02 · "a troca fica registada" — sempre. Sem chave: A → B → A são duas trocas. */
  if (changed) {
    await logCaseEvent({
      caseId: state.caseId,
      kind: "offer_changed",
      title: byWhom ? `Secretária trocou de oferta · ${byWhom}` : "Cliente trocou de oferta",
      detail: state.payment
        ? `${state.payment.amount / 100} → ${amount / 100} ${state.quoteCurrency}`
        : `${offerName} · ${amount / 100} ${state.quoteCurrency}`,
      ...who,
      payload: { from: previousOfferId, to: offerId, amount },
    })
  }

  /* T-22 · a mesma escolha não é uma notícia nova; trocar **de** opção é. */
  const fresh = await logCaseEvent({
    caseId: state.caseId,
    kind: "offer_selected",
    title: byWhom ? `Oferta escolhida por ${byWhom}` : "Cliente escolheu a oferta",
    detail: `${offerName} · ${amount / 100} ${recorded.currency}`,
    ...who,
    payload: { offerId, amount, ...(ctx.actor.kind === "secretary" ? { secretaryId: ctx.actor.secretaryId } : {}) },
    once: `offer_selected:${offerId}`,
  })

  /* E o aviso segue o registo: repetir o gesto não repete o email. Num
     ministério não vai o email de "opção escolhida" ao contacto do caso: a
     secretária vê-o no espaço dela (e o link do email é o do /pc, que num
     ministério já não abre o caso). */
  if (fresh.written) {
    if (ctx.actor.kind === "client") await notifyClientState(state.caseId, "offer_selected", offerName)
    await notifyAgent(state.caseId, "offer_selected", offerName)
  }

  /*
   * MIN-07 · "Se o saldo não cobrir, a secretária vê uma mensagem clara e a
   * Alô é avisada." O aviso é este acontecimento, que acende a campainha e a
   * fila do parceiro. A bolsa é opcional (decisão 1): sem saldo configurado, nada.
   */
  if (state.ministry && admin) {
    const { data: bc } = await admin.from("booking_cases").select("organisation_id").eq("id", state.caseId).maybeSingle()
    const orgId = (bc as { organisation_id: string | null } | null)?.organisation_id
    if (orgId) {
      const { data: balance } = await admin.rpc("organisation_balance", { p_org: orgId })
      if (balance != null && Number(balance) < amount) {
        await logCaseEvent({
          caseId: state.caseId,
          kind: "ministry_insufficient_funds",
          title: "Saldo da bolsa não cobre a opção escolhida",
          detail: `${Number(balance) / 100} disponível · ${amount / 100} ${state.quoteCurrency} escolhido`,
          actorKind: "system",
          payload: { balance: Number(balance), amount },
          once: `ministry_insufficient_funds:${offerId}`,
        })
      }
    }
  }

  for (const path of ctx.revalidate) revalidatePath(path)
  revalidatePath("/admin/price-checker")
  revalidatePath(`/admin/price-checker/${state.caseId}`)

  return { ok: true }
}

// ── P7 · passaportes ─────────────────────────────────────────────────────────

export const passengerSchema = z.object({
  position: z.coerce.number().int().min(1),
  kind: z.enum(["adult", "child", "infant_seat", "infant_lap"]),
  title: z.enum(["mr", "mrs", "ms"]).nullable().optional(),
  given: z.string().trim().min(2, "As in the passport"),
  surname: z.string().trim().min(2, "As in the passport"),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  sex: z.enum(["f", "m"]),
  nationality: z.string().refine((v) => NATIONALITIES.includes(v), "Nationality"),
  passportNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{5,12}$/, "5 to 12 letters or digits"),
  passportExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  issuingCountry: z.string().refine((v) => NATIONALITIES.includes(v), "Issuing country"),
  /* MIN-03 · só para apoio operacional; pedidos só num caso de ministério. */
  phone: z
    .string()
    .trim()
    .max(24)
    .refine((v) => v === "" || /^\+?[0-9][0-9 ()-]{5,22}$/.test(v), "Phone")
    .optional(),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v), "Email")
    .optional(),
})

export type PcPassengerInput = z.input<typeof passengerSchema>

/** O primeiro dia de viagem do pedido: é a essa data que se conta a idade. */
export function firstTravelDate(request: PcState["request"]): string | null {
  if (request.trip === "multi") return request.legs[0]?.date ?? request.departDate ?? null
  return request.departDate || null
}

/**
 * Grava os passaportes. Substitui o conjunto inteiro em cada gravação.
 *
 * Substituir e não fundir: o número de passageiros vem do pedido, e um
 * `upsert` por posição deixaria linhas órfãs se o pedido mudasse de 3 para 2.
 */
export async function savePassengersForState(
  state: PcState,
  rows: PcPassengerInput[],
  ctx: StepContext
): Promise<PcResult> {
  if (!state.selectedOfferId) return { ok: false, error: ctx.error("chooseOfferFirst") }
  if (state.payment?.status === "COMPLETED" || isIssued(state)) {
    return { ok: false, error: ctx.error("paidNoNameChange") }
  }

  const expected = paxTotal(state.request)
  if (!Array.isArray(rows) || rows.length !== expected) {
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

  const secretary = ctx.actor.kind === "secretary" ? ctx.actor : null
  const passengers = parsed.data.map((p) => ({ ...p }))

  /*
   * B2G-16 · D-7 · num pedido de ministério o tipo de cada passageiro sai da
   * data de nascimento, e não do que o ecrã mandou. O pedido guardava só N
   * pessoas (como adultos): passa a ter a mistura real, e fica registado.
   */
  let mix: { adults: number; children: number; infantsOnLap: number } | null = null
  if (secretary) {
    const travelDate = firstTravelDate(state.request)
    for (let i = 0; i < passengers.length; i++) {
      const kind = paxKindFromDob(passengers[i].dob, travelDate)
      if (!kind) return { ok: false, error: `Passenger ${i + 1}: ${ctx.error("passengerBirthDate")}` }
      passengers[i].kind = kind
      if (kind !== "adult") passengers[i].title = null
    }
    mix = {
      adults: passengers.filter((p) => p.kind === "adult").length,
      children: passengers.filter((p) => p.kind === "child").length,
      infantsOnLap: passengers.filter((p) => p.kind === "infant_lap").length,
    }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: ctx.error("unavailable") }

  await admin.from("case_passengers").delete().eq("case_id", state.caseId)

  const { error } = await admin.from("case_passengers").insert(
    passengers.map((p) => ({
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
      /* A 0029 pode ainda não estar aplicada: fora de um ministério as colunas
         nem se mencionam. */
      ...(state.ministry ? { phone: p.phone || null, email: p.email?.toLowerCase() || null } : {}),
    }))
  )

  if (error) {
    console.error("[pc] passageiros não guardados:", error.message)
    return { ok: false, error: ctx.error("passengersNotSaved") }
  }

  const who = actorFields(ctx.actor)

  /* D-7 · a mistura real no pedido, e quem a mudou. */
  if (mix) {
    const before = {
      adults: state.request.adults,
      children: state.request.children,
      infantsInSeat: state.request.infantsInSeat,
      infantsOnLap: state.request.infantsOnLap,
    }
    const same =
      before.adults === mix.adults &&
      before.children === mix.children &&
      before.infantsInSeat === 0 &&
      before.infantsOnLap === mix.infantsOnLap
    if (!same) {
      const { data: bc } = await admin.from("booking_cases").select("trip_request_id").eq("id", state.caseId).maybeSingle()
      const tripId = (bc as { trip_request_id: string | null } | null)?.trip_request_id
      if (tripId) {
        const { error: mixError } = await admin
          .from("trip_requests")
          .update({
            adults: mix.adults,
            children: mix.children,
            infants_in_seat: 0,
            infants_on_lap: mix.infantsOnLap,
            infants: mix.infantsOnLap,
          })
          .eq("id", tripId)
        if (mixError) {
          console.error("[pc] mistura de passageiros não gravada:", mixError.message)
        } else {
          await logCaseEvent({
            caseId: state.caseId,
            kind: "pax_mix_updated",
            title: "Tipos de passageiro pela data de nascimento",
            detail: `${before.adults}A ${before.children}C ${before.infantsInSeat + before.infantsOnLap}B → ${mix.adults}A ${mix.children}C ${mix.infantsOnLap}B`,
            ...who,
            payload: { before, after: { ...mix, infantsInSeat: 0 } },
          })
        }
      }
    }
  }

  /* DAT-01 · B2G-25 · num ministério, cada passageiro vira (ou actualiza) a
     ficha do ministério, para o pedido seguinte — com a secretária que a
     registou. */
  if (state.ministry) {
    const { data: bc } = await admin.from("booking_cases").select("organisation_id").eq("id", state.caseId).maybeSingle()
    const orgId = (bc as { organisation_id: string | null } | null)?.organisation_id
    if (orgId) {
      await syncMinistryTravellers(admin, {
        organisationId: orgId,
        caseId: state.caseId,
        byEmail: secretary ? secretary.email : state.contact.email || null,
        bySecretaryId: secretary?.secretaryId ?? null,
        passengers: passengers.map((p) => ({
          title: p.title ?? null,
          firstName: p.given,
          lastName: p.surname,
          gender: p.sex,
          birthDate: p.dob,
          nationality: p.nationality,
          passportNumber: p.passportNumber,
          passportExpiry: p.passportExpiry,
          issuingCountry: p.issuingCountry,
          phone: p.phone || null,
          email: p.email || null,
        })),
      })
    }
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

  /* T-22 · os mesmos passaportes outra vez não são uma notícia nova; corrigir
     um número muda a lista, e essa correcção continua a aparecer. */
  const passportSet = createHash("sha256")
    .update(
      passengers
        .map((p) => `${p.passportNumber.toUpperCase()}|${p.surname}|${p.given}`)
        .sort()
        .join(";")
    )
    .digest("hex")
    .slice(0, 16)

  await logCaseEvent({
    caseId: state.caseId,
    kind: "passengers_submitted",
    title: secretary ? `Passageiros registados por ${secretary.name}` : "Passaportes submetidos",
    detail: `${passengers.length} de ${expected}`,
    ...who,
    payload: secretary ? { secretaryId: secretary.secretaryId } : null,
    once: `passengers_submitted:${passportSet}`,
  })

  /*
   * B2G-17 · decisão 1 · num ministério não há pagamento na plataforma: com a
   * opção escolhida e os passageiros completos (validados campo a campo
   * acima), o caso fica **pronto a emitir**. Sem janela de 48 h, sem ecrã de
   * pagamento. Se a bolsa estiver configurada, o aviso de saldo continua
   * (decisão 1: opcional).
   */
  if (state.ministry) {
    const { error: readyError } = await admin
      .from("booking_cases")
      .update({ ready_to_issue_at: new Date().toISOString() })
      .eq("id", state.caseId)
      .is("ready_to_issue_at", null)
    if (readyError && readyError.code !== "42703") console.error("[pc] pronto a emitir:", readyError.message)

    await logCaseEvent({
      caseId: state.caseId,
      kind: "ministry_ready_to_issue",
      title: "Pronto a emitir",
      detail: state.ministry.fundsCover === false ? "O saldo da bolsa não cobre a opção" : state.ministry.name,
      ...who,
      once: `ministry_ready_to_issue:${passportSet}`,
    })
  }

  /*
   * BO-02 · é aqui que o link de pagamento nasce, e em nenhum outro sítio — no
   * canal público e VIP. O montante é calculado da oferta escolhida e dos
   * passageiros do pedido, nunca vem do formulário.
   */
  const chosen = state.ministry ? undefined : state.offers.find((o) => o.id === state.selectedOfferId)
  if (chosen) {
    const amount = offerTotal(chosen, state.pax)
    const description = [
      chosen.name || carrierName(chosen.segments[0]?.carrier_code),
      `${state.request.origin} → ${state.request.destination}`,
      state.request.reference,
    ]
      .filter(Boolean)
      .join(" · ")

    const payment = await openPaymentWindow(state.caseId, amount, state.quoteCurrency, description)

    if (!payment) {
      console.error("[pc] passageiros guardados mas o pagamento não abriu:", state.caseId)
    } else if (!state.payment) {
      await logCaseEvent({
        caseId: state.caseId,
        kind: "payment_window_opened",
        title: "Link de pagamento gerado",
        detail: `${amount / 100} ${state.quoteCurrency} · expira em ${PAY_WINDOW_HOURS}h`,
        actorKind: "system",
        payload: { amount, currency: state.quoteCurrency },
        /* T-22 · uma janela por pagamento. */
        once: `payment_window_opened:${payment.id}`,
      })
    }
  }

  /*
   * T-17 · as instruções de pagamento não saem daqui: o aviso verdadeiro sai
   * de `boSavePayInstructions`, quando o agente tem o link.
   */
  await notifyAgent(
    state.caseId,
    "passengers_submitted",
    `${passengers.length} passageiro(s) · ${passengers
      .map((p) => `${p.surname}/${p.given}`.toUpperCase())
      .join(", ")}`
  )

  for (const path of ctx.revalidate) revalidatePath(path)
  revalidatePath(`/admin/price-checker/${state.caseId}`)

  return { ok: true }
}

// ── avisos ───────────────────────────────────────────────────────────────────

/**
 * NT-05 · o agente dono do caso, avisado do que o cliente acabou de fazer.
 * Best-effort: o que o cliente fez já está gravado.
 */
export async function notifyAgent(
  caseId: string,
  action:
    | "offer_selected"
    | "passengers_submitted"
    | "proof_uploaded"
    | "request_cancelled"
    /** T-18 · o cliente escreveu-nos a partir do ecrã de pagamento. */
    | "message_sent",
  detail?: string
): Promise<void> {
  try {
    const { notifyAgentOfClientAction } = await import("@/lib/emails/send")
    await notifyAgentOfClientAction({ caseId, action, detail })
  } catch (err) {
    console.error("[pc] aviso ao agente falhou:", err)
  }
}

/**
 * NT-04 · o cliente, a cada mudança de estado que ele provocou.
 *
 * T-17 · sem o ramo das instruções de pagamento: esse aviso é um gesto do
 * agente, porque é ele que traz o link.
 */
export async function notifyClientState(
  caseId: string,
  event: "offer_selected",
  offerName?: string
): Promise<void> {
  try {
    const mails = await import("@/lib/emails/send")
    if (event === "offer_selected") {
      await mails.sendOfferChosenEmail(caseId, offerName ?? "")
    }
  } catch (err) {
    console.error("[pc] aviso ao cliente falhou:", err)
  }
}
