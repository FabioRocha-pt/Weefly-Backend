"use server"

/**
 * WeeFly — as ações do back-office do Price Checker.
 *
 * Todas começam pela mesma pergunta: quem está a fazer isto está na lista? A
 * verificação é feita aqui e não só no layout, porque uma server action é um
 * endpoint — quem souber o nome dela chama-a sem passar por página nenhuma.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity } from "@/lib/bo-access"
import { logCaseEvent } from "@/lib/case-events"
import { parseMoney } from "@/lib/proposal-math"
import {
  confirmPaymentByAdmin,
  expireNow,
  extendReviewDeadline,
  getPcPayment,
  rejectProof,
  reopenPayment,
  signedProofUrl,
} from "@/lib/pc/payment"
import { PROOF_REVIEW_HOURS, type PayMethodId } from "@/lib/pc/catalog"

export type BoResult = { ok: true; notice?: string } | { ok: false; error: string }

/** Quando a ação devolve algo além do sucesso — por exemplo o URL assinado. */
export type BoResultWith<T> =
  | ({ ok: true; notice?: string } & T)
  | { ok: false; error: string }

const NOT_ALLOWED = "A sua conta não tem acesso ao Price Checker."

function touch(caseId: string) {
  revalidatePath("/admin/price-checker")
  revalidatePath(`/admin/price-checker/${caseId}`)
}

// ── pagamento ────────────────────────────────────────────────────────────────

const confirmSchema = z.object({
  caseId: z.string().uuid(),
  paymentId: z.string().uuid(),
  /* A checkbox. `z.literal(true)` e não `boolean`: uma caixa desmarcada não é
     uma confirmação com valor `false`, é uma ação que não devia ter acontecido. */
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Marque a caixa que confirma que o valor entrou." }),
  }),
  receivedAmount: z.string().optional(),
  method: z.string().optional(),
  bankReference: z.string().max(120).optional(),
  valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
})

/**
 * A caixa "confirmo que está pago".
 *
 * O que ela faz: passa o pagamento a COMPLETED, valida o comprovativo, avança o
 * caso para 'pago' (via `applyPaymentStatus`) e avisa o cliente. O que ela não
 * faz: emitir. Pago e emitido são dois estados, e o mockup diz porquê — "o
 * cliente já pagou e ainda não tem bilhete" é o estado mais crítico do sistema,
 * e escondê-lo dentro de um só clique era perdê-lo de vista.
 */
export async function boConfirmPayment(
  input: z.input<typeof confirmSchema>
): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = confirmSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  }
  const v = parsed.data

  const payment = await getPcPayment(v.caseId)
  if (!payment) return { ok: false, error: "Este caso não tem pagamento." }

  const received = v.receivedAmount ? parseMoney(v.receivedAmount) : payment.amount

  const outcome = await confirmPaymentByAdmin({
    caseId: v.caseId,
    paymentId: v.paymentId,
    confirmed: true,
    actorId: identity.userId,
    actorEmail: identity.email,
    receivedAmount: received,
    method: (v.method as PayMethodId) || null,
    bankReference: v.bankReference?.trim() || null,
    valueDate: v.valueDate || null,
  })

  touch(v.caseId)

  if (!outcome.ok) {
    const message: Record<string, string> = {
      not_confirmed: "Marque a caixa antes de confirmar.",
      no_payment: "Este caso não tem pagamento.",
      illegal: "O pagamento já está num estado que não permite ser marcado como pago.",
      failed: "Não foi possível registar o pagamento.",
      unavailable: "Serviço indisponível.",
    }
    return { ok: false, error: message[outcome.reason] ?? "Falhou." }
  }

  await notifyClientPaid(v.caseId)

  const mismatch = received !== payment.amount
  return {
    ok: true,
    notice: mismatch
      ? "Pagamento confirmado — com valor diferente do cobrado, registado no histórico."
      : "Pagamento confirmado. O caso está pronto a emitir.",
  }
}

const rejectSchema = z.object({
  caseId: z.string().uuid(),
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3, "Diga porque não serve — o cliente vai ler."),
})

/** Rejeitar o comprovativo, e dar ao cliente nova janela para enviar outro. */
export async function boRejectProof(
  input: z.input<typeof rejectSchema>
): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  }

  const result = await rejectProof({
    caseId: parsed.data.caseId,
    paymentId: parsed.data.paymentId,
    reason: parsed.data.reason,
    actorId: identity.userId,
    actorEmail: identity.email,
  })

  touch(parsed.data.caseId)

  return result.ok
    ? { ok: true, notice: "Comprovativo rejeitado. O cliente pode enviar outro." }
    : { ok: false, error: "Não foi possível rejeitar o comprovativo." }
}

const extendSchema = z.object({
  caseId: z.string().uuid(),
  paymentId: z.string().uuid(),
  hours: z.coerce.number().int().min(1).max(240).default(PROOF_REVIEW_HOURS),
})

/** Mais tempo, quando o atraso é nosso. */
export async function boExtendDeadline(
  input: z.input<typeof extendSchema>
): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = extendSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Prazo inválido." }

  const result = await extendReviewDeadline({
    caseId: parsed.data.caseId,
    paymentId: parsed.data.paymentId,
    hours: parsed.data.hours,
    actorId: identity.userId,
    actorEmail: identity.email,
  })

  touch(parsed.data.caseId)

  return result.ok
    ? { ok: true, notice: `Prazo estendido em ${parsed.data.hours}h.` }
    : { ok: false, error: "Não foi possível estender o prazo." }
}

/** Fechar o link à mão, antes do prazo. */
export async function boExpirePayment(
  caseId: string,
  paymentId: string
): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const result = await expireNow({
    caseId,
    paymentId,
    actorId: identity.userId,
    actorEmail: identity.email,
  })

  touch(caseId)

  return result.ok
    ? { ok: true, notice: "Link de pagamento fechado. O cliente vê o ecrã de expirado." }
    : { ok: false, error: "Não foi possível fechar o link." }
}

/** Reabrir um pagamento expirado, com nova janela. */
export async function boReopenPayment(
  caseId: string,
  hours = 48
): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const result = await reopenPayment({
    caseId,
    hours,
    actorId: identity.userId,
    actorEmail: identity.email,
  })

  touch(caseId)

  return result.ok
    ? { ok: true, notice: `Pagamento reaberto por ${hours}h.` }
    : { ok: false, error: "Não foi possível reabrir o pagamento." }
}

/**
 * URL assinado para abrir um comprovativo.
 *
 * Gerado a pedido e não posto no HTML: um URL assinado dentro de uma página é um
 * URL que fica no histórico do browser e no cache do CDN.
 */
export async function boProofUrl(
  storagePath: string
): Promise<BoResultWith<{ url: string }>> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const url = await signedProofUrl(storagePath)
  return url
    ? { ok: true, url }
    : { ok: false, error: "Não foi possível abrir o comprovativo." }
}

// ── o caso ───────────────────────────────────────────────────────────────────

/** Reclamar o caso: passa a ter dono, e sai de "novos sem dono". */
export async function boClaimCase(caseId: string): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const { data: bookingCase } = await admin
    .from("booking_cases")
    .select("id, created_by, trip_request_id")
    .eq("id", caseId)
    .maybeSingle()

  if (!bookingCase) return { ok: false, error: "Caso não encontrado." }

  await admin
    .from("booking_cases")
    .update({ created_by: identity.userId })
    .eq("id", caseId)

  if ((bookingCase as { trip_request_id: string | null }).trip_request_id) {
    await admin
      .from("trip_requests")
      .update({ status: "em_tratamento" })
      .eq("id", (bookingCase as { trip_request_id: string }).trip_request_id)
      .eq("status", "novo")
  }

  await logCaseEvent({
    caseId,
    kind: "case_claimed",
    title: "Caso reclamado",
    detail: identity.label,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
  })

  touch(caseId)
  return { ok: true, notice: "Caso reclamado." }
}

const noteSchema = z.object({
  caseId: z.string().uuid(),
  body: z.string().trim().min(1, "Escreva a nota."),
})

/** A nota interna do caso — o que ficou combinado no WhatsApp. */
export async function boSaveNote(
  input: z.input<typeof noteSchema>
): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Nota vazia." }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const { data: bookingCase } = await admin
    .from("booking_cases")
    .select("trip_request_id")
    .eq("id", parsed.data.caseId)
    .maybeSingle()

  const tripRequestId = (bookingCase as { trip_request_id: string | null } | null)
    ?.trip_request_id

  if (tripRequestId) {
    await admin.from("trip_request_notes").insert({
      trip_request_id: tripRequestId,
      author_id: identity.userId,
      author_email: identity.email,
      body: parsed.data.body,
    })
  }

  await logCaseEvent({
    caseId: parsed.data.caseId,
    kind: "note_added",
    title: "Nota interna",
    detail: parsed.data.body.slice(0, 240),
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
  })

  touch(parsed.data.caseId)
  return { ok: true, notice: "Nota guardada." }
}

// ── emissão ──────────────────────────────────────────────────────────────────

const issueSchema = z.object({
  caseId: z.string().uuid(),
  pnr: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "O PNR tem 6 caracteres."),
  issuingCarrier: z.string().trim().max(40).optional(),
  consolidator: z.string().trim().max(60).optional(),
  costReal: z.string().optional(),
  fareBasis: z.string().trim().max(40).optional(),
  nvb: z.string().trim().max(20).optional(),
  nva: z.string().trim().max(20).optional(),
  endorsements: z.string().trim().max(120).optional(),
  tickets: z
    .array(
      z.object({
        passengerId: z.string().uuid(),
        ticketNumber: z
          .string()
          .trim()
          .transform((v) => v.replace(/\s+/g, ""))
          .refine((v) => /^\d{13}$/.test(v), "Cada bilhete tem 13 dígitos."),
        seatOutbound: z.string().trim().max(6).optional(),
        seatInbound: z.string().trim().max(6).optional(),
      })
    )
    .min(1),
})

/**
 * Emitir: guarda o PNR e os bilhetes, e fecha o caso.
 *
 * Exige um pagamento confirmado. Emitir sem pagamento confirmado é o erro que
 * custa dinheiro à WeeFly, e é o único sítio onde vale a pena recusar em vez de
 * avisar.
 */
export async function boIssueTickets(
  input: z.input<typeof issueSchema>
): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = issueSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  }
  const v = parsed.data

  const numbers = v.tickets.map((t) => t.ticketNumber)
  if (new Set(numbers).size !== numbers.length) {
    return { ok: false, error: "Há números de bilhete repetidos." }
  }

  const payment = await getPcPayment(v.caseId)
  if (!payment || (!payment.admin_confirmed && payment.status !== "COMPLETED")) {
    return {
      ok: false,
      error: "Confirme o pagamento antes de emitir.",
    }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const now = new Date().toISOString()

  const { error } = await admin
    .from("booking_cases")
    .update({
      pnr: v.pnr,
      issued_at: now,
      issued_by: identity.userId,
      issuing_carrier: v.issuingCarrier || null,
      consolidator: v.consolidator || null,
      cost_real: v.costReal ? parseMoney(v.costReal) : null,
      fare_basis: v.fareBasis || null,
      nvb: v.nvb || null,
      nva: v.nva || null,
      endorsements: v.endorsements || null,
      stage: "emitido",
    })
    .eq("id", v.caseId)

  if (error) {
    console.error("[bo/pc] emissão falhou:", error.message)
    return { ok: false, error: "Não foi possível gravar a emissão." }
  }

  for (const ticket of v.tickets) {
    await admin
      .from("case_passengers")
      .update({
        ticket_number: ticket.ticketNumber,
        seat_outbound: ticket.seatOutbound || null,
        seat_inbound: ticket.seatInbound || null,
      })
      .eq("id", ticket.passengerId)
      .eq("case_id", v.caseId)
  }

  await logCaseEvent({
    caseId: v.caseId,
    kind: "tickets_issued",
    title: "Bilhetes emitidos",
    detail: `PNR ${v.pnr} · ${v.tickets.length} bilhete(s) · por ${identity.email}`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
    payload: { pnr: v.pnr, tickets: numbers },
  })

  touch(v.caseId)
  return { ok: true, notice: `Emitido. PNR ${v.pnr}.` }
}


// ── BO-04 · as datas do pedido ───────────────────────────────────────────────

const datesSchema = z.object({
  caseId: z.string().uuid(),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de ida inválida."),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  /* O motivo não é decoração: é o que fica no histórico e o que o cliente lê no
     aviso. Uma frase de dez caracteres não explica nada a ninguém. */
  reason: z
    .string()
    .trim()
    .min(12, "Escreva porque as datas mudam — o cliente vai ler esta frase."),
})

/**
 * Propor novas datas ao cliente.
 *
 * BO-04 · a origem e o destino de um pedido não se editam nunca: uma rota
 * diferente é um pedido diferente. As datas mudam, mas só quando as pedidas não
 * têm lugar — e só por aqui, que é a única porta que existe: com motivo
 * obrigatório, com o pedido original guardado intacto, com registo de quem o
 * fez e com aviso ao cliente. Editar em silêncio um campo do formulário era o
 * que esta ação substitui.
 *
 * Uma proposta já publicada volta a rascunho e sobe de revisão (R1 → R2): os
 * preços foram feitos para as datas antigas, e deixá-los à vista com datas
 * novas era mostrar ao cliente um valor que já sabemos estar a mudar.
 */
export async function boProposeNewDates(
  input: z.input<typeof datesSchema>
): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = datesSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  }
  const v = parsed.data

  if (v.returnDate && v.returnDate < v.departDate) {
    return { ok: false, error: "A volta não pode ser antes da ida." }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const { data: raw } = await admin
    .from("booking_cases")
    .select(
      `id, stage, pnr, trip_request_id,
       trip_request:trip_requests (
         id, depart_date, return_date, trip_type,
         original_depart_date, original_return_date
       )`
    )
    .eq("id", v.caseId)
    .maybeSingle()

  const record = raw as Record<string, any> | null
  const trip = Array.isArray(record?.trip_request)
    ? record?.trip_request[0]
    : record?.trip_request

  if (!record || !trip) return { ok: false, error: "Caso não encontrado." }

  /* Depois de emitido as datas já não são uma proposta: são um bilhete, e
     mudá-las é uma reemissão que passa pela companhia. */
  if (record.stage === "emitido" || record.pnr) {
    return {
      ok: false,
      error: "Este caso já está emitido. Uma mudança de datas é uma reemissão.",
    }
  }

  const payment = await getPcPayment(v.caseId)
  if (payment?.admin_confirmed || payment?.status === "COMPLETED") {
    return {
      ok: false,
      error: "O cliente já pagou. Fale com ele antes de mexer nas datas.",
    }
  }

  const fromDepart = (trip.depart_date as string | null) ?? null
  const fromReturn = (trip.return_date as string | null) ?? null

  if (fromDepart === v.departDate && (fromReturn ?? null) === (v.returnDate ?? null)) {
    return { ok: false, error: "As datas são as mesmas que já estão no pedido." }
  }

  const { error } = await admin
    .from("trip_requests")
    .update({
      depart_date: v.departDate,
      return_date: v.returnDate ?? null,
      /* O pedido original é escrito uma vez e nunca mais: a segunda mudança de
         datas não apaga aquilo que o cliente pediu à primeira. */
      original_depart_date: trip.original_depart_date ?? fromDepart,
      original_return_date: trip.original_return_date ?? fromReturn,
      dates_changed_at: new Date().toISOString(),
      dates_changed_by: identity.userId,
      dates_changed_by_email: identity.email,
      dates_change_reason: v.reason,
    })
    .eq("id", trip.id)

  if (error) {
    console.error("[bo/pc] datas não gravadas:", error.message)
    return { ok: false, error: "Não foi possível gravar as datas." }
  }

  /* A proposta publicada volta a rascunho, com revisão nova. */
  let revision: number | null = null
  const { data: proposal } = await admin
    .from("case_proposals")
    .select("id, status, revision")
    .eq("case_id", v.caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const draft = proposal as { id: string; status: string; revision: number } | null
  if (draft?.status === "publicada") {
    revision = draft.revision + 1
    await admin
      .from("case_proposals")
      .update({ status: "rascunho", revision })
      .eq("id", draft.id)
      .eq("status", "publicada")
  }

  await logCaseEvent({
    caseId: v.caseId,
    kind: "dates_proposed",
    title: "Novas datas propostas ao cliente",
    detail: [
      `${fromDepart ?? "—"}${fromReturn ? ` – ${fromReturn}` : ""}`,
      "→",
      `${v.departDate}${v.returnDate ? ` – ${v.returnDate}` : ""}`,
      `· ${v.reason}`,
      revision ? `· revisão R${revision}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
    payload: {
      from: { departDate: fromDepart, returnDate: fromReturn },
      to: { departDate: v.departDate, returnDate: v.returnDate ?? null },
      reason: v.reason,
      revision,
    },
  })

  const notified = await notifyClientDates(v.caseId, {
    fromDepart,
    fromReturn,
    toDepart: v.departDate,
    toReturn: v.returnDate ?? null,
    reason: v.reason,
  })

  touch(v.caseId)

  return {
    ok: true,
    notice: [
      "Datas atualizadas e registadas.",
      revision ? `A proposta voltou a rascunho como R${revision}.` : "",
      notified
        ? "O cliente foi avisado por email."
        : "Não foi possível avisar o cliente por email — fale com ele pelo WhatsApp.",
    ]
      .filter(Boolean)
      .join(" "),
  }
}

/** Best-effort, como os outros avisos: o registo já está gravado. */
async function notifyClientDates(
  caseId: string,
  change: {
    fromDepart: string | null
    fromReturn: string | null
    toDepart: string
    toReturn: string | null
    reason: string
  }
): Promise<boolean> {
  try {
    const { sendDatesProposedEmail } = await import("@/lib/emails/send")
    return await sendDatesProposedEmail(caseId, change)
  } catch (err) {
    console.error("[bo/pc] aviso de datas falhou:", err)
    return false
  }
}

/** Best-effort — ver o mesmo padrão em actions/payments.ts. */
async function notifyClientPaid(caseId: string): Promise<void> {
  try {
    const { sendPaymentConfirmedEmail } = await import("@/lib/emails/send")
    await sendPaymentConfirmedEmail(caseId)
  } catch (err) {
    console.error("[bo/pc] aviso ao cliente falhou:", err)
  }
}
