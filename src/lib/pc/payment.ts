/**
 * WeeFly Price Checker — o pagamento, do comprovativo à confirmação.
 *
 * O que este módulo resolve é a pergunta que a WeeFly faz todos os dias: o
 * dinheiro entrou? Ninguém do lado do sistema sabe responder — quem sabe é
 * quem vê o extrato. Por isso o desenho é este:
 *
 *   1. O cliente escolhe a opção → nasce um pagamento em PENDING com prazo
 *      para pagar (`expires_at`).
 *   2. O cliente paga por fora e carrega o comprovativo → o ficheiro fica no
 *      bucket privado, o pagamento passa a ter `proof_status = 'recebido'` e
 *      arranca o prazo de validação (`review_deadline_at`).
 *   3. O back-office abre o ficheiro, compara valores e marca a caixa. Só essa
 *      caixa move o pagamento para COMPLETED.
 *   4. Se ninguém marcar a caixa dentro do prazo, o pagamento expira e o link
 *      fecha-se. O preço que o cliente viu tinha validade; deixar o link aberto
 *      indefinidamente seria prometer um preço que já não existe.
 *
 * O passo 4 é deliberadamente estendível: quando o atraso é nosso, quem atende
 * dá mais tempo em vez de fazer o cliente começar de novo.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { applyPaymentStatus, latestPayment } from "@/lib/payments"
import { logCaseEvent } from "@/lib/case-events"
import { formatMoney } from "@/lib/proposal-math"
import {
  PAY_WINDOW_HOURS,
  PROOF_MAX_BYTES,
  PROOF_MIME,
  PROOF_REVIEW_HOURS,
  METHOD_LABEL_PT,
  type PayMethodId,
} from "@/lib/pc/catalog"
import { humanSize } from "@/lib/pc/format-size"
import type { PaymentStatus } from "@/lib/case-status"

export const PROOF_BUCKET = "payment-proofs"

export type ProofStatus = "nenhum" | "recebido" | "validado" | "rejeitado"

export interface PaymentProof {
  id: string
  payment_id: string
  case_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  status: "recebido" | "validado" | "rejeitado"
  review_note: string | null
  reviewed_at: string | null
  created_at: string
}

export interface PcPayment {
  id: string
  case_id: string
  amount: number
  currency: string
  description: string | null
  status: PaymentStatus
  method: string | null
  pay_provider: string | null
  payment_url: string | null
  expires_at: string | null
  review_deadline_at: string | null
  extension_count: number
  admin_confirmed: boolean
  admin_confirmed_at: string | null
  received_amount: number | null
  bank_reference: string | null
  value_date: string | null
  proof_status: ProofStatus
  proof_rejected_reason: string | null
  client_declared_paid_at: string | null
  paid_at: string | null
  created_at: string
}

const PAYMENT_COLUMNS = `
  id, case_id, amount, currency, description, status, method, pay_provider,
  payment_url, expires_at, review_deadline_at, extension_count,
  admin_confirmed, admin_confirmed_at, received_amount, bank_reference,
  value_date, proof_status, proof_rejected_reason, client_declared_paid_at,
  paid_at, created_at
`

const hoursFromNow = (h: number) =>
  new Date(Date.now() + h * 3600_000).toISOString()

// ── leitura ──────────────────────────────────────────────────────────────────

export async function getPcPayment(caseId: string): Promise<PcPayment | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data } = await admin
    .from("case_payments")
    .select(PAYMENT_COLUMNS)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data ?? null) as PcPayment | null
}

export async function listProofs(paymentId: string): Promise<PaymentProof[]> {
  const admin = createAdminClient()
  if (!admin) return []

  const { data } = await admin
    .from("case_payment_proofs")
    .select(
      "id, payment_id, case_id, storage_path, file_name, mime_type, size_bytes, status, review_note, reviewed_at, created_at"
    )
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: false })

  return (data ?? []) as PaymentProof[]
}

/**
 * URL assinado para o back-office abrir um comprovativo.
 *
 * Gerado a cada abertura e válido por 10 minutos: o suficiente para clicar e
 * ver, pouco para reencaminhar por engano.
 */
export async function signedProofUrl(
  storagePath: string,
  seconds = 600
): Promise<string | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data, error } = await admin.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(storagePath, seconds)

  if (error) {
    console.error("[pc/payment] URL assinado falhou:", error.message)
    return null
  }
  return data?.signedUrl ?? null
}

// ── criação, a partir da escolha da opção ────────────────────────────────────

/**
 * Alinha o pagamento com a opção escolhida e abre a janela para pagar.
 *
 * Move o pagamento para PENDING porque é isso que ele é a partir daqui: está à
 * espera do cliente. Interessa para além do vocabulário — a matriz de
 * transições de `applyPaymentStatus` não deixa expirar um pagamento em STARTED,
 * e é justamente expirar que tem de acontecer se ninguém pagar.
 */
export async function openPaymentWindow(
  caseId: string,
  amount: number,
  currency: string,
  description: string
): Promise<PcPayment | null> {
  const admin = createAdminClient()
  if (!admin || amount <= 0) return null

  const existing = await getPcPayment(caseId)
  const settled = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"]

  // Um pagamento já liquidado não é reescrito por uma troca de opção.
  if (existing && settled.includes(existing.status)) return existing

  if (existing) {
    await admin
      .from("case_payments")
      .update({
        amount,
        currency,
        description,
        /* O prazo reinicia com a nova escolha: o contador que o cliente vê tem
           de valer para o preço que ele acabou de escolher. */
        expires_at: hoursFromNow(PAY_WINDOW_HOURS),
      })
      .eq("id", existing.id)

    if (existing.status === "STARTED" || existing.status === "EXPIRED") {
      /* Um pagamento expirado que volta à vida: a matriz não deixa sair de
         EXPIRED (é terminal, §8.2), por isso nasce um novo em vez de forçar. */
      if (existing.status === "EXPIRED") {
        return insertPayment(admin, caseId, amount, currency, description)
      }
      await applyPaymentStatus(existing.id, "PENDING", { source: "admin" })
    }

    return getPcPayment(caseId)
  }

  return insertPayment(admin, caseId, amount, currency, description)
}

async function insertPayment(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  caseId: string,
  amount: number,
  currency: string,
  description: string
): Promise<PcPayment | null> {
  const expiresAt = hoursFromNow(PAY_WINDOW_HOURS)

  const { data, error } = await admin
    .from("case_payments")
    .insert({
      case_id: caseId,
      amount,
      currency,
      description,
      status: "PENDING",
      expires_at: expiresAt,
      idempotency_key: `case_${caseId}_${Date.now()}`,
    })
    .select(PAYMENT_COLUMNS)
    .single()

  if (error) {
    console.error("[pc/payment] criação falhou:", error.message)
    return null
  }

  /*
   * BO-02 · a etapa 3 abre-se no mesmo gesto, com prazo.
   *
   * O link de pagamento tem de ter validade e servir uma vez: a validade é este
   * `expires_at` (o `enforceExpiry` fecha-o quando passa) e a unicidade é o
   * estado da etapa — passa a "submetido" quando o pagamento é confirmado (ver
   * `markPaid` em lib/payments.ts) e a partir daí o ecrã do cliente é o de
   * "pago", não outro convite a pagar.
   */
  await admin
    .from("case_links")
    .update({ status: "ativo", unlocked_at: new Date().toISOString(), expires_at: expiresAt })
    .eq("case_id", caseId)
    .eq("stage", 3)
    .eq("status", "bloqueado")

  return data as PcPayment
}

/** O método e o provedor que o cliente escolheu no ecrã de pagamento. */
export async function recordChosenMethod(
  paymentId: string,
  method: PayMethodId,
  provider: string | null
): Promise<void> {
  const admin = createAdminClient()
  if (!admin) return
  await admin
    .from("case_payments")
    .update({ method, pay_provider: provider })
    .eq("id", paymentId)
}

// ── o comprovativo ───────────────────────────────────────────────────────────

export type ProofOutcome =
  | { ok: true; proof: PaymentProof; reviewDeadline: string }
  | {
      ok: false
      reason: "unavailable" | "no_payment" | "too_big" | "bad_type" | "upload_failed" | "closed"
    }

/**
 * Guarda o comprovativo enviado pelo cliente e arranca o prazo de validação.
 *
 * O ficheiro é escrito pela service role porque o cliente não tem sessão — e o
 * bucket é privado precisamente por isso: um comprovativo tem IBAN, nome e
 * montante.
 */
export async function attachProof(input: {
  caseId: string
  fileName: string
  mimeType: string
  bytes: ArrayBuffer
  method: PayMethodId | null
  provider: string | null
}): Promise<ProofOutcome> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: "unavailable" }

  const size = input.bytes.byteLength
  if (size > PROOF_MAX_BYTES) return { ok: false, reason: "too_big" }
  if (!PROOF_MIME.includes(input.mimeType)) return { ok: false, reason: "bad_type" }

  const payment = await getPcPayment(input.caseId)
  if (!payment) return { ok: false, reason: "no_payment" }
  if (payment.status === "COMPLETED") return { ok: false, reason: "closed" }
  if (payment.status === "EXPIRED" || payment.status === "CANCELLED") {
    return { ok: false, reason: "closed" }
  }

  const ext =
    input.mimeType === "application/pdf"
      ? "pdf"
      : input.mimeType === "image/png"
        ? "png"
        : "jpg"

  /* Caminho por caso e com sufixo de tempo: dois envios do mesmo cliente não
     se sobrepõem, e o histórico das tentativas fica navegável no bucket. */
  const storagePath = `${input.caseId}/${payment.id}-${Date.now()}.${ext}`

  const upload = await admin.storage
    .from(PROOF_BUCKET)
    .upload(storagePath, input.bytes, {
      contentType: input.mimeType,
      upsert: false,
    })

  if (upload.error) {
    console.error("[pc/payment] upload falhou:", upload.error.message)
    return { ok: false, reason: "upload_failed" }
  }

  const { data: proof, error } = await admin
    .from("case_payment_proofs")
    .insert({
      payment_id: payment.id,
      case_id: input.caseId,
      storage_path: storagePath,
      file_name: input.fileName.slice(0, 180),
      mime_type: input.mimeType,
      size_bytes: size,
      status: "recebido",
    })
    .select(
      "id, payment_id, case_id, storage_path, file_name, mime_type, size_bytes, status, review_note, reviewed_at, created_at"
    )
    .single()

  if (error) {
    // Sem linha na tabela, o ficheiro é órfão: apaga-se em vez de ficar lá.
    await admin.storage.from(PROOF_BUCKET).remove([storagePath])
    console.error("[pc/payment] registo do comprovativo falhou:", error.message)
    return { ok: false, reason: "upload_failed" }
  }

  const reviewDeadline = hoursFromNow(PROOF_REVIEW_HOURS)

  await admin
    .from("case_payments")
    .update({
      proof_status: "recebido",
      proof_rejected_reason: null,
      review_deadline_at: reviewDeadline,
      client_declared_paid_at:
        payment.client_declared_paid_at ?? new Date().toISOString(),
      ...(input.method ? { method: input.method } : {}),
      ...(input.provider ? { pay_provider: input.provider } : {}),
    })
    .eq("id", payment.id)

  await logCaseEvent({
    caseId: input.caseId,
    kind: "proof_uploaded",
    title: "Comprovativo carregado pelo cliente",
    detail: `${proof.file_name} · ${humanSize(size)}${
      input.method ? ` · ${METHOD_LABEL_PT[input.method]}` : ""
    }`,
    actorKind: "client",
    payload: { proofId: proof.id, reviewDeadline },
  })

  return { ok: true, proof: proof as PaymentProof, reviewDeadline }
}

// ── a decisão do back-office ─────────────────────────────────────────────────

export type ConfirmOutcome =
  | { ok: true }
  | {
      ok: false
      reason: "unavailable" | "no_payment" | "not_confirmed" | "illegal" | "failed"
    }

/**
 * A caixa marcada: o dinheiro entrou.
 *
 * `confirmed` é o valor da checkbox e não é uma formalidade — sem ela a função
 * recusa. É o único gesto que move um pagamento para COMPLETED por mão humana,
 * e tem de ser um gesto deliberado, não o efeito lateral de gravar um
 * formulário.
 */
export async function confirmPaymentByAdmin(input: {
  caseId: string
  paymentId: string
  confirmed: boolean
  actorId: string
  actorEmail: string
  receivedAmount: number | null
  method: PayMethodId | null
  bankReference: string | null
  valueDate: string | null
}): Promise<ConfirmOutcome> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: "unavailable" }
  if (!input.confirmed) return { ok: false, reason: "not_confirmed" }

  const payment = await getPcPayment(input.caseId)
  if (!payment || payment.id !== input.paymentId) {
    return { ok: false, reason: "no_payment" }
  }

  const now = new Date().toISOString()

  /* Escrito antes da transição de estado: se o `applyPaymentStatus` recusar, o
     que fica registado é o que o admin declarou — e a recusa aparece no ecrã.
     A ordem inversa deixaria um pagamento COMPLETED sem se saber quem o pôs
     lá. */
  await admin
    .from("case_payments")
    .update({
      admin_confirmed: true,
      admin_confirmed_at: now,
      admin_confirmed_by: input.actorId,
      proof_status: payment.proof_status === "nenhum" ? "nenhum" : "validado",
      received_amount: input.receivedAmount ?? payment.amount,
      bank_reference: input.bankReference,
      value_date: input.valueDate,
      ...(input.method ? { method: input.method } : {}),
    })
    .eq("id", payment.id)

  await admin
    .from("case_payment_proofs")
    .update({ status: "validado", reviewed_at: now, reviewed_by: input.actorId })
    .eq("payment_id", payment.id)
    .eq("status", "recebido")

  const applied = await applyPaymentStatus(payment.id, "COMPLETED", {
    source: "admin",
    markedBy: input.actorId,
    paidAt: input.valueDate ? new Date(input.valueDate).toISOString() : now,
  })

  if (!applied.ok) {
    return { ok: false, reason: applied.reason === "illegal" ? "illegal" : "failed" }
  }

  const received = input.receivedAmount ?? payment.amount

  await logCaseEvent({
    caseId: input.caseId,
    kind: "payment_confirmed",
    title: "Pagamento confirmado",
    detail: [
      formatMoney(received, payment.currency),
      input.method ? METHOD_LABEL_PT[input.method] : null,
      input.bankReference,
      `por ${input.actorEmail}`,
    ]
      .filter(Boolean)
      .join(" · "),
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorKind: "staff",
    payload: { received, expected: payment.amount },
  })

  return { ok: true }
}

/**
 * O comprovativo não serve.
 *
 * Não mata o pagamento: o caso mais comum é o cliente ter anexado o ficheiro
 * errado, e fechar-lhe o link obrigá-lo-ia a começar tudo de novo. O que
 * acontece é o contrário — abre-se-lhe uma nova janela para enviar outro, e é o
 * prazo (ou o botão de expirar) que fecha a porta se ele não o fizer.
 */
export async function rejectProof(input: {
  caseId: string
  paymentId: string
  reason: string
  actorId: string
  actorEmail: string
}): Promise<{ ok: boolean }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false }

  const now = new Date().toISOString()

  await admin
    .from("case_payment_proofs")
    .update({
      status: "rejeitado",
      review_note: input.reason,
      reviewed_at: now,
      reviewed_by: input.actorId,
    })
    .eq("payment_id", input.paymentId)
    .eq("status", "recebido")

  await admin
    .from("case_payments")
    .update({
      proof_status: "rejeitado",
      proof_rejected_reason: input.reason,
      review_deadline_at: null,
      expires_at: hoursFromNow(PAY_WINDOW_HOURS),
      client_declared_paid_at: null,
    })
    .eq("id", input.paymentId)

  await logCaseEvent({
    caseId: input.caseId,
    kind: "proof_rejected",
    title: "Comprovativo rejeitado",
    detail: `${input.reason} · por ${input.actorEmail}`,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorKind: "staff",
  })

  return { ok: true }
}

/** Mais tempo para validar. Quando o atraso é nosso, o cliente não paga por isso. */
export async function extendReviewDeadline(input: {
  caseId: string
  paymentId: string
  hours: number
  actorId: string
  actorEmail: string
}): Promise<{ ok: boolean }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false }

  const payment = await getPcPayment(input.caseId)
  if (!payment) return { ok: false }

  /* Conta a partir de agora, e não do prazo antigo: um prazo que já passou não
     deve dar menos tempo do que um que ainda corre. */
  const base = Math.max(
    Date.now(),
    payment.review_deadline_at ? Date.parse(payment.review_deadline_at) : Date.now()
  )
  const next = new Date(base + input.hours * 3600_000).toISOString()

  await admin
    .from("case_payments")
    .update({
      review_deadline_at: next,
      expires_at: next,
      extended_at: new Date().toISOString(),
      extended_by: input.actorId,
      extension_count: payment.extension_count + 1,
    })
    .eq("id", input.paymentId)

  await logCaseEvent({
    caseId: input.caseId,
    kind: "payment_extended",
    title: "Prazo de pagamento estendido",
    detail: `+${input.hours}h · por ${input.actorEmail}`,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorKind: "staff",
  })

  return { ok: true }
}

// ── expirar ──────────────────────────────────────────────────────────────────

export interface ExpiryVerdict {
  expired: boolean
  /** Porque expirou, para o ecrã do cliente e para o registo dizerem a verdade. */
  cause: "client_never_paid" | "review_overdue" | null
}

/**
 * Decide se este pagamento já passou do prazo, e fecha-o se sim.
 *
 * Chamado a cada leitura da página do cliente e do back-office, e também pelo
 * endpoint de cron. Preguiçoso de propósito: um prazo que ninguém foi ver não
 * tem consequência nenhuma, e assim o sistema não depende de o cron estar de pé
 * para dizer a verdade a quem abre o link.
 */
export async function enforceExpiry(payment: PcPayment): Promise<ExpiryVerdict> {
  const admin = createAdminClient()
  if (!admin) return { expired: false, cause: null }

  // Já fechado, num sentido ou no outro.
  if (payment.admin_confirmed || payment.status === "COMPLETED") {
    return { expired: false, cause: null }
  }
  if (payment.status === "EXPIRED") {
    return {
      expired: true,
      cause: payment.proof_status === "recebido" ? "review_overdue" : "client_never_paid",
    }
  }

  const now = Date.now()
  const waitingForUs = payment.proof_status === "recebido"

  const deadline = waitingForUs
    ? payment.review_deadline_at
    : payment.expires_at

  if (!deadline || Date.parse(deadline) > now) {
    return { expired: false, cause: null }
  }

  const cause = waitingForUs ? "review_overdue" : "client_never_paid"

  const applied = await applyPaymentStatus(payment.id, "EXPIRED", {
    source: "polling",
    failureReason: waitingForUs
      ? `Comprovativo não validado em ${PROOF_REVIEW_HOURS}h`
      : "Prazo de pagamento esgotado sem comprovativo",
  })

  if (!applied.ok) {
    /* Recusada pela matriz (um pagamento em STARTED, por exemplo). Não vale a
       pena insistir: o que interessa é que o link deixe de convidar a pagar, e
       isso é o estado da etapa 3. */
    console.warn("[pc/payment] expiração recusada pela matriz:", payment.status)
  }

  await admin
    .from("case_links")
    .update({ status: "expirado", expires_at: deadline })
    .eq("case_id", payment.case_id)
    .eq("stage", 3)
    .neq("status", "submetido")

  await logCaseEvent({
    caseId: payment.case_id,
    kind: "payment_expired",
    title: "Link de pagamento expirado",
    detail: waitingForUs
      ? `Comprovativo recebido e não validado em ${PROOF_REVIEW_HOURS}h — o caso volta à fila`
      : "O cliente não pagou dentro do prazo",
    actorKind: "system",
    payload: { deadline, cause },
  })

  return { expired: true, cause }
}

/**
 * Reabre um pagamento expirado, com nova janela.
 *
 * EXPIRED é terminal na matriz do manual (§8.2), por isso reabrir é criar um
 * pagamento novo com o mesmo valor — e não desfazer o que expirou. O histórico
 * fica com os dois, que é a leitura honesta: houve uma tentativa que morreu.
 */
export async function reopenPayment(input: {
  caseId: string
  hours: number
  actorId: string
  actorEmail: string
}): Promise<{ ok: boolean }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false }

  const previous = await latestPayment(input.caseId)
  if (!previous) return { ok: false }

  const { error } = await admin.from("case_payments").insert({
    case_id: input.caseId,
    amount: previous.amount,
    currency: previous.currency,
    description: "Reabertura do pagamento",
    status: "PENDING",
    expires_at: hoursFromNow(input.hours),
    idempotency_key: `case_${input.caseId}_${Date.now()}`,
  })

  if (error) {
    console.error("[pc/payment] reabertura falhou:", error.message)
    return { ok: false }
  }

  await admin
    .from("case_links")
    .update({ status: "ativo", expires_at: null })
    .eq("case_id", input.caseId)
    .eq("stage", 3)
    .eq("status", "expirado")

  await logCaseEvent({
    caseId: input.caseId,
    kind: "payment_reopened",
    title: "Pagamento reaberto",
    detail: `Nova janela de ${input.hours}h · por ${input.actorEmail}`,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorKind: "staff",
  })

  return { ok: true }
}

/** Fecha o link à mão, antes do prazo. */
export async function expireNow(input: {
  caseId: string
  paymentId: string
  actorId: string
  actorEmail: string
}): Promise<{ ok: boolean }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false }

  await admin
    .from("case_payments")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString(), review_deadline_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", input.paymentId)

  const payment = await getPcPayment(input.caseId)
  if (payment) await enforceExpiry(payment)

  await logCaseEvent({
    caseId: input.caseId,
    kind: "payment_expired_manual",
    title: "Link de pagamento fechado à mão",
    detail: `por ${input.actorEmail}`,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorKind: "staff",
  })

  return { ok: true }
}
