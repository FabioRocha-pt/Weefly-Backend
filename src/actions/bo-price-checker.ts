"use server"

/**
 * WeeFly — as ações do back-office do Price Checker.
 *
 * Todas começam pela mesma pergunta: quem está a fazer isto está na lista? A
 * verificação é feita aqui e não só no layout, porque uma server action é um
 * endpoint — quem souber o nome dela chama-a sem passar por página nenhuma.
 *
 * TEN-03 · e, quando a acção é sobre um caso, se o caso está na área da
 * sessão (`boCaseIdentity`, `lib/bo-scope`). Um id de outro parceiro recebe a
 * mesma resposta que uma sessão sem acesso. Um pagamento tem de ser do caso
 * que a acção diz (`boPaymentIdentity`): sem isso, um caso próprio abria o
 * pagamento de outro.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getBoI18n } from "@/i18n/bo-server"
import { LOCALE_TAGS } from "@/i18n/config"
import { translateMessage } from "@/i18n/translate"

import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"
import { boIdentity, type BoIdentity } from "@/lib/bo-access"
import { boCaseIdentity, boPaymentIdentity } from "@/lib/bo-scope"
import { logCaseEvent } from "@/lib/case-events"
import {
  clearReadAlerts,
  markAlertsRead,
  markAllAlertsRead,
} from "@/lib/bo-alerts"
import { elapsedSince } from "@/lib/case-status"
import { parseMoney } from "@/lib/proposal-math"
import {
  confirmPaymentByAdmin,
  expireNow,
  extendReviewDeadline,
  getPcPayment,
  markInstructionsSent,
  rejectProof,
  reopenPayment,
  savePayInstructions,
} from "@/lib/pc/payment"
import { sendPaymentInstructionsEmail } from "@/lib/emails/send"
import { ARCHIVE_REASONS, CLOSED_REASON_LABEL_PT } from "@/lib/pc/archive"
import {
  METHOD_LABEL_PT,
  PAY_DUE_HOURS,
  PROOF_REVIEW_HOURS,
  payMethod,
  type PayMethodId,
} from "@/lib/pc/catalog"

export type BoResult = { ok: true; notice?: string } | { ok: false; error: string }

/** Quando a ação devolve algo além do sucesso — por exemplo o URL assinado. */
export type BoResultWith<T> =
  | ({ ok: true; notice?: string } & T)
  | { ok: false; error: string }

/* I18N-01 · a frase de quem não tem acesso sai do dicionário, na língua do agente. */
const NOT_ALLOWED = "bo.actions.pc.notAllowed"

function touch(caseId: string) {
  revalidatePath("/admin/price-checker")
  revalidatePath(`/admin/price-checker/${caseId}`)
  /* B2G-14 · a fila do master e as filas por canal também mostram o dono. */
  revalidatePath("/gestao/concierge")
}

// ── pagamento ────────────────────────────────────────────────────────────────

const confirmSchema = z.object({
  caseId: z.string().uuid(),
  paymentId: z.string().uuid(),
  /* A checkbox. `z.literal(true)` e não `boolean`: uma caixa desmarcada não é
     uma confirmação com valor `false`, é uma ação que não devia ter acontecido. */
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "bo.actions.pc.confirmTick" }),
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
  const { t } = await getBoI18n()
  const identity = await boPaymentIdentity(String(input?.caseId ?? ""), String(input?.paymentId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = confirmSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.common.invalidData") }
  }
  const v = parsed.data

  const payment = await getPcPayment(v.caseId)
  if (!payment) return { ok: false, error: t("bo.actions.pc.noPayment") }

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
      not_confirmed: t("bo.actions.pc.confirm.notConfirmed"),
      no_payment: t("bo.actions.pc.noPayment"),
      illegal: t("bo.actions.pc.confirm.illegal"),
      failed: t("bo.actions.pc.confirm.failed"),
      unavailable: t("bo.actions.common.serviceUnavailable"),
    }
    return { ok: false, error: message[outcome.reason] ?? t("bo.actions.pc.confirm.unknown") }
  }

  await notifyClientPaid(v.caseId)

  const mismatch = received !== payment.amount
  return {
    ok: true,
    notice: mismatch
      ? t("bo.actions.pc.confirm.mismatch")
      : t("bo.actions.pc.confirm.done"),
  }
}

const rejectSchema = z.object({
  caseId: z.string().uuid(),
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3, "bo.actions.pc.rejectReason"),
})

/** Rejeitar o comprovativo, e dar ao cliente nova janela para enviar outro. */
export async function boRejectProof(
  input: z.input<typeof rejectSchema>
): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boPaymentIdentity(String(input?.caseId ?? ""), String(input?.paymentId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.common.invalidData") }
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
    ? { ok: true, notice: t("bo.actions.pc.proofRejected") }
    : { ok: false, error: t("bo.actions.pc.proofRejectFailed") }
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
  const { t } = await getBoI18n()
  const identity = await boPaymentIdentity(String(input?.caseId ?? ""), String(input?.paymentId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = extendSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t("bo.actions.pc.deadlineInvalid") }

  const result = await extendReviewDeadline({
    caseId: parsed.data.caseId,
    paymentId: parsed.data.paymentId,
    hours: parsed.data.hours,
    actorId: identity.userId,
    actorEmail: identity.email,
  })

  touch(parsed.data.caseId)

  return result.ok
    ? { ok: true, notice: t("bo.actions.pc.deadlineExtended", { hours: parsed.data.hours }) }
    : { ok: false, error: t("bo.actions.pc.deadlineExtendFailed") }
}

/** Fechar o link à mão, antes do prazo. */
export async function boExpirePayment(
  caseId: string,
  paymentId: string
): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boPaymentIdentity(caseId, paymentId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const result = await expireNow({
    caseId,
    paymentId,
    actorId: identity.userId,
    actorEmail: identity.email,
  })

  touch(caseId)

  return result.ok
    ? { ok: true, notice: t("bo.actions.pc.paymentExpired") }
    : { ok: false, error: t("bo.actions.pc.paymentExpireFailed") }
}

/** Reabrir um pagamento expirado, com nova janela. */
export async function boReopenPayment(
  caseId: string,
  hours = 48
): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const result = await reopenPayment({
    caseId,
    hours,
    actorId: identity.userId,
    actorEmail: identity.email,
  })

  touch(caseId)

  return result.ok
    ? { ok: true, notice: t("bo.actions.pc.paymentReopened", { hours }) }
    : { ok: false, error: t("bo.actions.pc.paymentReopenFailed") }
}

/*
 * X-01 · `boProofUrl` saiu daqui.
 *
 * Devolvia um URL assinado que o painel abria com `window.open` depois de um
 * `await` — e o browser bloqueava-o como pop-up, que era a razão por que o
 * comprovativo não abria. O ficheiro passa a ser servido por
 * `/api/bo/proof/{id}`, uma rota autenticada que o `<a>` do painel abre no
 * próprio clique. Ver o comentário no topo dessa rota.
 */

// ── o caso ───────────────────────────────────────────────────────────────────

/**
 * Reclamar o caso: passa a ter dono, e sai de "novos sem dono".
 *
 * C-01 · três coisas que faltavam.
 *
 * A primeira é o tempo de espera. `created_by` já dizia de quem é o caso, mas
 * não quando passou a ser — e sem isso não há resposta para "quanto tempo
 * esteve à espera sem ninguém", que é o critério e a única medida honesta da
 * fila. Fica em `claimed_at` (migração 0014) e no registo, em texto.
 *
 * A segunda é não roubar. Reclamar um caso que já tem dono passava por cima
 * dele em silêncio: dois agentes no mesmo caso é exactamente o que o C-01
 * existe para acabar, e trocar de dono a meio produz a mesma confusão pelo
 * caminho oposto. Quem precisa de mudar o responsável muda o **vendedor**, que
 * é um gesto com nome próprio e um seletor próprio (BO-14).
 *
 * A terceira é a corrida. O `eq("created_by", null)` no update é o que decide
 * entre dois cliques simultâneos: ganha quem chegar primeiro à base de dados, e
 * o segundo recebe uma frase em vez de um caso que acha que é dele.
 */
export async function boClaimCase(caseId: string): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  /*
   * B2G-13 · a decisão passa para a base de dados (`claim_case`, 0036), pela
   * sessão: quem pergunta vê o caso (a empresa dele, ou qualquer uma para o
   * master), ganha quem chegar primeiro ao `update … where created_by is
   * null`, e o registo (case_events + access_audit) fica na mesma transacção.
   * Quem perde fica a saber quem ganhou.
   */
  const rpc = await createClient().rpc("claim_case", { p_case: caseId })
  if (!rpc.error) {
    const r = (rpc.data ?? {}) as {
      outcome?: string
      claimed_by_email?: string | null
      claimed_by_label?: string | null
      unclaimed_for?: string | null
    }
    switch (r.outcome) {
      case "claimed":
        touch(caseId)
        return { ok: true, notice: t("bo.actions.pc.claim.done", { waited: r.unclaimed_for ?? "" }) }
      case "already_yours":
        return { ok: true, notice: t("bo.actions.pc.claim.alreadyYours") }
      case "taken":
        touch(caseId)
        return {
          ok: false,
          error:
            r.claimed_by_label || r.claimed_by_email
              ? t("bo.claim.takenBy", { name: r.claimed_by_label ?? r.claimed_by_email ?? "" })
              : t("bo.actions.pc.claim.lostRace"),
        }
      default:
        return { ok: false, error: t(NOT_ALLOWED) }
    }
  }

  /* Numa base sem a 0036 (função desconhecida: PGRST202 / 42883), o caminho
     de sempre. Qualquer outro erro é um erro. */
  if (rpc.error.code !== "PGRST202" && rpc.error.code !== "42883") {
    console.error("[bo/pc] claim_case falhou:", rpc.error.message)
    return { ok: false, error: t("bo.actions.common.serviceUnavailable") }
  }
  return legacyClaimCase(caseId, identity)
}

/** O reclamar de antes da 0036 (C-01), pela service role. */
async function legacyClaimCase(caseId: string, identity: BoIdentity): Promise<BoResult> {
  const { t } = await getBoI18n()
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

  const { data: bookingCase } = await admin
    .from("booking_cases")
    .select("id, created_by, trip_request_id, created_at, partner_id")
    .eq("id", caseId)
    .maybeSingle()

  if (!bookingCase) return { ok: false, error: t("bo.actions.common.caseNotFound") }

  const record = bookingCase as {
    created_by: string | null
    trip_request_id: string | null
    created_at: string
    partner_id?: string | null
  }
  /* White label: quem reclama um caso de outra empresa (o master) não passa
     a vendedor. */
  const foreign = Boolean(identity.tenant && record.partner_id && record.partner_id !== identity.tenant.partnerId)

  if (record.created_by && record.created_by !== identity.userId) {
    return {
      ok: false,
      error:
        t("bo.actions.pc.claim.hasOwner"),
    }
  }

  if (record.created_by === identity.userId) {
    return { ok: true, notice: t("bo.actions.pc.claim.alreadyYours") }
  }

  const now = new Date()

  const { data: claimed } = await admin
    .from("booking_cases")
    .update({
      created_by: identity.userId,
      claimed_at: now.toISOString(),
      claimed_by_email: identity.email,
      /*
       * T-06 · quem reclama é o vendedor, e a partir daqui é o que a proposta
       * mostra. (Com a 0036, o master num caso de outra empresa não passa a
       * vendedor: white label.)
       */
      ...(foreign
        ? {}
        : {
            seller_email: identity.email,
            seller_label: identity.label,
            seller_set_at: now.toISOString(),
            seller_set_by: identity.userId,
          }),
    })
    .eq("id", caseId)
    /* A corrida decide-se aqui, e não numa leitura anterior. */
    .is("created_by", null)
    .select("id")

  if (!claimed || claimed.length === 0) {
    return {
      ok: false,
      error: t("bo.actions.pc.claim.lostRace"),
    }
  }

  if (record.trip_request_id) {
    await admin
      .from("trip_requests")
      .update({ status: "em_tratamento" })
      .eq("id", record.trip_request_id)
      .eq("status", "novo")
  }

  /* Quanto tempo o caso esteve na fila sem ninguém. É este número que diz se a
     fila está a ser trabalhada ou só a ser olhada. */
  const waited = elapsedSince(record.created_at, now.getTime())

  await logCaseEvent({
    caseId,
    kind: "case_claimed",
    title: "Caso reclamado",
    detail: `${identity.label} · esteve ${waited} sem dono`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
    payload: { claimedAt: now.toISOString(), unclaimedFor: waited },
  })

  touch(caseId)
  return { ok: true, notice: t("bo.actions.pc.claim.done", { waited }) }
}

/**
 * B2G-13 · "Um administrador pode libertar o pedido; fica registado."
 *
 * Pela sessão (`release_case`, 0036): a base de dados pergunta se a conta
 * supervisiona casos (Admin do parceiro, Admin WeeFly) e se vê o caso, exige
 * o motivo e escreve os dois registos.
 */
export async function boReleaseCase(input: { caseId: string; reason: string }): Promise<BoResult> {
  const { t } = await getBoI18n()
  if (!z.string().uuid().safeParse(input?.caseId).success) return { ok: false, error: t(NOT_ALLOWED) }
  const reason = z.string().trim().min(3).max(500).safeParse(input.reason)
  if (!reason.success) return { ok: false, error: t("bo.claim.errors.reasonRequired") }
  const caseId = input.caseId

  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const rpc = await createClient().rpc("release_case", { p_case: caseId, p_reason: reason.data })
  if (rpc.error) {
    console.error("[bo/pc] release_case falhou:", rpc.error.message)
    return { ok: false, error: t("bo.claim.errors.failed") }
  }
  switch (((rpc.data ?? {}) as { outcome?: string }).outcome) {
    case "released":
      touch(caseId)
      return { ok: true, notice: t("bo.claim.released") }
    case "forbidden":
      return { ok: false, error: t("bo.claim.errors.forbidden") }
    case "reason_required":
      return { ok: false, error: t("bo.claim.errors.reasonRequired") }
    case "not_claimed":
      touch(caseId)
      return { ok: false, error: t("bo.claim.errors.notClaimed") }
    case "changed":
      return { ok: false, error: t("bo.claim.errors.changed") }
    default:
      return { ok: false, error: t(NOT_ALLOWED) }
  }
}

/**
 * B2G-11 · D-6 · "O agente pode alterar a urgência; fica registado."
 *
 * Qualquer conta do back-office que veja o caso, só em pedidos de ministério
 * (`set_case_urgency`, 0036, com o `case_events` e o `access_audit`).
 */
export async function boSetCaseUrgency(input: { caseId: string; urgency: number }): Promise<BoResult> {
  const { t } = await getBoI18n()
  const parsed = z
    .object({ caseId: z.string().uuid(), urgency: z.number().int().min(0).max(2) })
    .safeParse(input)
  if (!parsed.success) return { ok: false, error: t("bo.urgency.failed") }
  const { caseId, urgency } = parsed.data

  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const rpc = await createClient().rpc("set_case_urgency", { p_case: caseId, p_urgency: urgency })
  if (rpc.error) {
    console.error("[bo/pc] set_case_urgency falhou:", rpc.error.message)
    return { ok: false, error: t("bo.urgency.failed") }
  }
  switch (((rpc.data ?? {}) as { outcome?: string }).outcome) {
    case "changed":
      touch(caseId)
      revalidatePath("/agente/ministerios", "layout")
      revalidatePath("/gestao/concierge")
      return { ok: true, notice: t("bo.urgency.changed", { level: t(`bo.urgency.${urgency}`) }) }
    case "unchanged":
      return { ok: true, notice: t("bo.urgency.unchanged") }
    case "not_ministry":
      return { ok: false, error: t("bo.urgency.notMinistry") }
    case "invalid":
      return { ok: false, error: t("bo.urgency.failed") }
    default:
      return { ok: false, error: t(NOT_ALLOWED) }
  }
}

// ── C-14 · a campainha ───────────────────────────────────────────────────────

/**
 * Marca alertas como vistos por quem está a olhar.
 *
 * PRO-11 · chamada ao **clicar num aviso**, e só nesse. Abrir a campainha não
 * marca nada: marcava, e 40 avisos desapareciam de uma vez — um comprovativo
 * recebido ficava invisível sem ninguém dar por isso.
 *
 * Não devolve o contador novo de propósito: vem do servidor no render
 * seguinte, e devolvê-lo daqui criava uma segunda fonte de verdade.
 */
export async function boMarkAlertsRead(eventIds: string[]): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  /* Um limite, porque isto vem do browser. Uma entrada colapsada leva os ids
     de todas as repetições (a janela é de 400). */
  const ids = eventIds
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 400)

  await markAlertsRead(identity.userId, ids)
  revalidatePath("/admin/price-checker", "layout")
  return { ok: true }
}

/** PRO-12 · "Marcar todas como lidas". A confirmação é do painel. */
export async function boMarkAllAlertsRead(): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const n = await markAllAlertsRead(identity.userId)
  revalidatePath("/admin/price-checker", "layout")
  return { ok: true, notice: n === 0 ? t("bo.actions.pc.alerts.nothingUnread") : t("bo.actions.pc.alerts.markedRead", { n }) }
}

/** PRO-12 · "Limpar": retira os lidos do painel. A confirmação é do painel. */
export async function boClearReadAlerts(): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const result = await clearReadAlerts(identity.userId)
  if (!result.ok) return result
  revalidatePath("/admin/price-checker", "layout")
  return { ok: true, notice: t("bo.actions.pc.alerts.cleared") }
}

// ── C-33 · as instruções de pagamento ────────────────────────────────────────

const instructionsSchema = z.object({
  caseId: z.string().uuid(),
  paymentId: z.string().uuid(),
  method: z.enum(["stripe", "vinti4", "revolut", "instapay"]),
  link: z.string().trim().max(600).optional(),
  reference: z.string().trim().max(200).optional(),
  /** `YYYY-MM-DDTHH:mm` do `datetime-local`, ou vazio. */
  dueAt: z.string().trim().max(40).optional(),
  /** Enviar ao cliente no mesmo gesto, ou só gravar. */
  send: z.boolean().optional(),
})

/**
 * C-33 · guardar o que o agente forneceu, e mandá-lo ao cliente.
 *
 * A verificação de que há alguma coisa para enviar é por método e não genérica:
 * um Stripe sem link é um botão que não leva a nenhum lado, e um Instapay sem
 * referência é uma mensagem que pede ao cliente para pagar sem lhe dizer para
 * onde. O Vinti4 aceita qualquer dos dois — é a SISP que dá as duas vias.
 */
export async function boSavePayInstructions(
  input: z.input<typeof instructionsSchema>
): Promise<BoResult> {
  const { t, locale } = await getBoI18n()
  const identity = await boPaymentIdentity(String(input?.caseId ?? ""), String(input?.paymentId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = instructionsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.common.invalidData") }
  }
  const v = parsed.data

  const method = payMethod(v.method)
  if (!method) return { ok: false, error: t("bo.actions.pc.pay.unknownMethod") }

  const link = v.link?.trim() || null
  const reference = v.reference?.trim() || null

  /* O nome do campo vem do dicionário (em PT, igual ao `fieldPt` do catálogo). */
  const field = t(`bo.actions.pc.pay.field.${v.method}`)
  if (method.supply === "link" && !link) {
    return { ok: false, error: t("bo.actions.pc.pay.missingLink", { field: field.toLowerCase() }) }
  }
  if (method.supply === "reference" && !reference) {
    return { ok: false, error: t("bo.actions.pc.pay.missingReference", { field: field.toLowerCase() }) }
  }
  if (method.supply === "either" && !link && !reference) {
    return { ok: false, error: t("bo.actions.pc.pay.missingEither", { field }) }
  }

  const payment = await getPcPayment(v.caseId)
  if (!payment || payment.id !== v.paymentId) {
    return { ok: false, error: t("bo.actions.pc.pay.notFound") }
  }
  if (payment.admin_confirmed || payment.status === "COMPLETED") {
    return { ok: false, error: t("bo.actions.pc.pay.alreadyConfirmed") }
  }

  const dueAt = v.dueAt ? new Date(v.dueAt).toISOString() : null

  const saved = await savePayInstructions({
    caseId: v.caseId,
    paymentId: v.paymentId,
    method: v.method,
    link,
    reference,
    dueAt,
    actorEmail: identity.email,
  })

  if (!saved.ok) return { ok: false, error: t("bo.actions.pc.pay.saveFailed") }

  await logCaseEvent({
    caseId: v.caseId,
    kind: "pay_instructions_saved",
    title: "Instruções de pagamento gravadas",
    detail: `${METHOD_LABEL_PT[v.method]} · ${link ?? reference} · por ${identity.label}`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
  })

  /*
   * T-11 · o prazo escrito à mão fica registado, tal como a mudança dele.
   *
   * O critério pede "editável pelo agente, se preciso, com a alteração
   * registada". O prazo automático não precisa de linha própria — vem no
   * registo do envio, logo abaixo — mas um prazo diferente do automático é uma
   * decisão comercial de alguém, e essa tem nome.
   */
  if (dueAt && dueAt !== payment.pay_due_at) {
    await logCaseEvent({
      caseId: v.caseId,
      kind: "pay_due_changed",
      title: "Prazo de pagamento definido à mão",
      detail: `${new Date(dueAt).toISOString()} · por ${identity.label}`,
      actorId: identity.userId,
      actorEmail: identity.email,
      actorKind: "staff",
      payload: { from: payment.pay_due_at, to: dueAt },
    })
  }

  if (!v.send) {
    touch(v.caseId)
    return { ok: true, notice: t("bo.actions.pc.pay.savedNotSent") }
  }

  /* A impressão digital do que vai sair: o mesmo conteúdo duas vezes é um
     aviso só, um conteúdo diferente é uma notícia nova. Ver o `dedupeSuffix`. */
  /* T-17 · o prazo que o email promete tem de ser o que fica gravado: fixa-se
     a hora do envio aqui e usa-se nos dois lados. */
  const sentAt = new Date()
  const plannedDue =
    dueAt ?? payment.pay_due_at ?? new Date(sentAt.getTime() + PAY_DUE_HOURS * 3600_000).toISOString()

  const outcome = await sendPaymentInstructionsEmail(
    v.caseId,
    `${v.method}:${link ?? reference}`,
    { dueAt: plannedDue }
  )

  /*
   * T-11 · o prazo nasce do envio, e é por isso que se carimba depois dele.
   *
   * "Preenchido automaticamente no momento em que as instruções de pagamento
   * são enviadas. A base é a hora do envio, não a da proposta."
   */
  let due = dueAt ?? payment.pay_due_at
  let autoFilled = false
  if (outcome.ok) {
    const stamped = await markInstructionsSent({
      paymentId: v.paymentId,
      actorEmail: identity.email,
      currentDueAt: due,
      sentAt,
    })
    due = stamped.dueAt
    autoFilled = stamped.autoFilled

    await logCaseEvent({
      caseId: v.caseId,
      kind: "pay_instructions_sent",
      title: "Instruções de pagamento enviadas ao cliente",
      detail: [
        METHOD_LABEL_PT[v.method],
        due ? `prazo ${new Date(due).toLocaleString("pt-PT", { timeZone: "Atlantic/Cape_Verde" })}` : null,
        autoFilled ? `automático · envio +${PAY_DUE_HOURS}h` : "prazo escrito à mão",
        `por ${identity.label}`,
      ]
        .filter(Boolean)
        .join(" · "),
      actorId: identity.userId,
      actorEmail: identity.email,
      actorKind: "staff",
      payload: { dueAt: due, autoFilled },
    })
  }

  touch(v.caseId)

  if (outcome.ok) {
    return {
      ok: true,
      notice: autoFilled
        ? t("bo.actions.pc.pay.sentAutoDue", {
            due: new Date(due!).toLocaleString(LOCALE_TAGS[locale], {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Atlantic/Cape_Verde",
            }),
            hours: PAY_DUE_HOURS,
          })
        : t("bo.actions.pc.pay.savedAndSent"),
    }
  }

  if (outcome.status === "duplicate") {
    return {
      ok: true,
      notice: t("bo.actions.pc.pay.alreadySent"),
    }
  }

  /*
   * T-17 · o insucesso do envio é um erro, e não uma nota de rodapé verde.
   *
   * O ecrã mostrava isto no mesmo lugar e na mesma cor do sucesso, com a frase
   * a começar por "Instruções gravadas" — que é a leitura errada quando o
   * cliente continua sem saber por onde pagar. O que ficou gravado continua
   * gravado; o que a frase tem de dizer é que ninguém foi avisado.
   */
  return {
    ok: false,
    error: t("bo.actions.pc.pay.emailFailed", { reason: outcome.reason }),
  }
}

/**
 * C-04 · concluir o caso depois de o bilhete estar emitido.
 *
 * Não havia forma de o fazer, e por isso um caso emitido ficava nas filas de
 * trabalho para sempre. Uma fila que nunca esvazia deixa de ser lida — e a fila
 * é o único ecrã que diz o que falta fazer.
 *
 * `closed_at` e não uma etapa nova: 'emitido' é um facto sobre o bilhete e
 * 'fechado' é um facto sobre o trabalho. São independentes, e um caso emitido
 * pode legitimamente continuar aberto enquanto alguém trata de uma bagagem.
 *
 * Só depois de emitido, de propósito. Fechar um caso que não chegou a emitir é
 * outra coisa — é cancelar — e tem outro vocabulário, outro aviso ao cliente e
 * outra leitura nos números do mês. Os estados finais completos são Sprint 4.
 */
export async function boCloseCase(caseId: string): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

  const { data: raw } = await admin
    .from("booking_cases")
    .select("id, stage, pnr, issued_at, closed_at")
    .eq("id", caseId)
    .maybeSingle()

  if (!raw) return { ok: false, error: t("bo.actions.common.caseNotFound") }

  const record = raw as {
    stage: string
    pnr: string | null
    issued_at: string | null
    closed_at: string | null
  }

  if (record.closed_at) return { ok: true, notice: t("bo.actions.pc.close.alreadyClosed") }

  const issued = record.stage === "emitido" || Boolean(record.pnr) || Boolean(record.issued_at)
  if (!issued) {
    return {
      ok: false,
      error:
        t("bo.actions.pc.close.notIssued"),
    }
  }

  const now = new Date().toISOString()

  await admin
    .from("booking_cases")
    .update({
      closed_at: now,
      closed_by: identity.userId,
      closed_by_email: identity.email,
    })
    .eq("id", caseId)
    .is("closed_at", null)

  await logCaseEvent({
    caseId,
    kind: "case_closed",
    title: "Caso fechado",
    detail: `por ${identity.label}`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
  })

  touch(caseId)
  return { ok: true, notice: t("bo.actions.pc.close.done") }
}

/**
 * PRO-10 · arquivar um caso que se resolveu fora da plataforma.
 *
 * Em qualquer estado, ao contrário do `boCloseCase`, e por isso com motivo
 * obrigatório: um caso fechado antes de emitir tem de dizer porquê, ou o filtro
 * de fechados vira um sítio onde os casos desaparecem. Fica registado, e só um
 * administrador reabre.
 */
const archiveSchema = z
  .object({
    caseId: z.string().uuid(),
    reason: z.enum(ARCHIVE_REASONS),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.reason !== "outro" || (v.note ?? "").length > 0, {
    message: "bo.actions.pc.archiveNote",
    path: ["note"],
  })

export async function boArchiveCase(input: {
  caseId: string
  reason: string
  note?: string
}): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(String(input?.caseId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = archiveSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.path[0] === "note" ? t("bo.actions.pc.archiveNote") : t("bo.actions.pc.archive.pickReason"),
    }
  }
  const v = parsed.data

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

  const { data: archived, error } = await admin
    .from("booking_cases")
    .update({
      closed_at: new Date().toISOString(),
      closed_by: identity.userId,
      closed_by_email: identity.email,
      closed_reason: v.reason,
      closed_note: v.note || null,
    })
    .eq("id", v.caseId)
    .is("closed_at", null)
    .select("id")

  if (error) {
    if (error.code === "42703") {
      return { ok: false, error: t("bo.actions.pc.archive.migrationMissing") }
    }
    return { ok: false, error: error.message }
  }
  if (!archived || archived.length === 0) {
    return { ok: false, error: t("bo.actions.pc.archive.alreadyClosed") }
  }

  const label = CLOSED_REASON_LABEL_PT[v.reason] ?? v.reason
  await logCaseEvent({
    caseId: v.caseId,
    kind: "case_archived",
    title: "Caso arquivado",
    detail: [label, v.note, `por ${identity.label}`].filter(Boolean).join(" · "),
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
    payload: { reason: v.reason },
  })

  touch(v.caseId)
  return { ok: true, notice: t("bo.actions.pc.archive.done") }
}

/**
 * C-04 · reabrir, que é o critério "reversível por um administrador".
 *
 * A reversão fica registada — e é por isso que apagar `closed_at` não perde
 * nada: o rasto vive em `case_events`, que ninguém reescreve.
 */
export async function boReopenCase(caseId: string): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  if (identity.role !== "admin") {
    return {
      ok: false,
      error: t("bo.actions.pc.reopen.adminOnly"),
    }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

  const reopen = (fields: Record<string, null>) =>
    admin
      .from("booking_cases")
      .update(fields)
      .eq("id", caseId)
      .not("closed_at", "is", null)
      .select("id")

  const base = { closed_at: null, closed_by: null, closed_by_email: null }
  /* PRO-10 · o motivo sai com o fecho. Sem a 0023 as colunas não existem. */
  let { data: reopened, error: reopenError } = await reopen({
    ...base,
    closed_reason: null,
    closed_note: null,
  })
  if (reopenError?.code === "42703") ({ data: reopened } = await reopen(base))

  if (!reopened || reopened.length === 0) {
    return { ok: false, error: t("bo.actions.pc.reopen.notClosed") }
  }

  await logCaseEvent({
    caseId,
    kind: "case_reopened",
    title: "Caso reaberto",
    detail: `por ${identity.label} · administrador`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
  })

  touch(caseId)
  return { ok: true, notice: t("bo.actions.pc.reopen.done") }
}

const noteSchema = z.object({
  caseId: z.string().uuid(),
  body: z.string().trim().min(1, "bo.actions.pc.noteEmpty"),
})

/** A nota interna do caso — o que ficou combinado no WhatsApp. */
export async function boSaveNote(
  input: z.input<typeof noteSchema>
): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(String(input?.caseId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.pc.noteEmptyFallback") }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

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
  return { ok: true, notice: t("bo.actions.pc.noteSaved") }
}

// ── emissão ──────────────────────────────────────────────────────────────────

const issueSchema = z.object({
  caseId: z.string().uuid(),
  pnr: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "bo.actions.pc.pnrLength"),
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
        /*
         * EM-01 · "prefixo de 3 dígitos da companhia mais 10 dígitos".
         *
         * São treze dígitos, e a divisão não é decorativa: os três primeiros
         * identificam a companhia emissora (047 é a TAP, 696 a Cabo Verde
         * Airlines) e os dez seguintes são o documento. O ecrã pré-preenche o
         * prefixo a partir da companhia escolhida; aqui só se verifica a forma,
         * porque um consolidador pode emitir com o prefixo de outra companhia e
         * recusá-lo seria recusar uma emissão legítima.
         */
        ticketNumber: z
          .string()
          .trim()
          .transform((v) => v.replace(/[\s-]+/g, ""))
          .refine(
            (v) => /^\d{3}\d{10}$/.test(v),
            "bo.actions.pc.ticketNumberShape"
          ),
        seatOutbound: z.string().trim().max(6).optional(),
        seatInbound: z.string().trim().max(6).optional(),
      })
    )
    .min(1),
  /** EM-01 · um lugar por passageiro **por voo**. Ver `lib/issuance.ts`. */
  seats: z
    .array(
      z.object({
        passengerId: z.string().uuid(),
        segmentId: z.string().uuid(),
        seat: z.string().trim().max(6),
      })
    )
    .default([]),
  /**
   * T-04 · um bloco por voo, e o documento de cada um.
   *
   * "Uma ida e volta produz pelo menos dois blocos; um multi-city produz um por
   * trecho." A validação de que **todos** estão completos não vive aqui: vive
   * mais abaixo, contra os trechos reais da oferta escolhida. Um schema não sabe
   * quantos voos a viagem tem — a base de dados sabe, e é ela que responde.
   */
  segments: z
    .array(
      z.object({
        segmentId: z.string().uuid(),
        fareBasis: z.string().trim().max(40).optional(),
        nvb: z.string().trim().max(20).optional(),
        nva: z.string().trim().max(20).optional(),
        couponNumber: z.string().trim().max(20).optional(),
        aircraft: z.string().trim().max(60).optional(),
        cabin: z.string().trim().max(30).optional(),
        bookingClass: z.string().trim().max(4).optional(),
        terminalFrom: z.string().trim().max(12).optional(),
        terminalTo: z.string().trim().max(12).optional(),
        airlinePnr: z.string().trim().max(12).optional(),
        segmentStatus: z.string().trim().max(20).optional(),
        baggageThrough: z.boolean().optional(),
      })
    )
    .default([]),
  /** T-04 · a bagagem de cada passageiro em cada voo. */
  baggage: z
    .array(
      z.object({
        passengerId: z.string().uuid(),
        segmentId: z.string().uuid(),
        checkedPieces: z.coerce.number().int().min(0).max(9),
        checkedKg: z.coerce.number().min(0).max(200).nullable().optional(),
        cabinPieces: z.coerce.number().int().min(0).max(9),
        cabinKg: z.coerce.number().min(0).max(50).nullable().optional(),
      })
    )
    .default([]),
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
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(String(input?.caseId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = issueSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.common.invalidData") }
  }
  const v = parsed.data

  const numbers = v.tickets.map((t) => t.ticketNumber)
  if (new Set(numbers).size !== numbers.length) {
    return { ok: false, error: t("bo.actions.pc.issue.duplicateNumbers") }
  }

  const payment = await getPcPayment(v.caseId)
  if (!payment || (!payment.admin_confirmed && payment.status !== "COMPLETED")) {
    return {
      ok: false,
      error: t("bo.actions.pc.issue.needsPayment"),
    }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

  /*
   * T-04 · "o botão de emitir fica desactivado até cada voo estar completo".
   *
   * O ecrã já não deixa carregar, e isto é a segunda fechadura pela mesma razão
   * de sempre: uma server action é um endpoint. A lista de voos vem dos trechos
   * da oferta que o cliente escolheu, e não do que o formulário mandou — senão
   * bastava mandar um array vazio para a verificação passar.
   */
  const flights = await selectedSegments(v.caseId)

  if (flights.length > 0) {
    const filled = new Map(v.segments.map((s) => [s.segmentId, s]))
    const missing: string[] = []

    for (const flight of flights) {
      const row = filled.get(flight.id)
      const label =
        [flight.carrier_code, flight.flight_number].filter(Boolean).join(" ") ||
        `${flight.origin ?? "?"}→${flight.destination ?? "?"}`

      if (!row) {
        missing.push(label)
        continue
      }
      const gaps = [
        row.fareBasis?.trim() ? "" : t("bo.actions.pc.issue.fareBasis"),
        row.nvb?.trim() ? "" : "NVB",
        row.nva?.trim() ? "" : "NVA",
      ].filter(Boolean)
      if (gaps.length) missing.push(`${label} (${gaps.join(", ")})`)
    }

    if (missing.length > 0) {
      return {
        ok: false,
        error: t("bo.actions.pc.issue.missingFields", { count: missing.length, flights: missing.join(" · ") }),
      }
    }
  }

  const now = new Date().toISOString()

  /* As colunas antigas de `booking_cases` guardam o primeiro voo. Continuam a
     ser escritas porque são o que os casos já emitidos têm e o que os ecrãs
     antigos leem; o detalhe por voo vive em `case_segment_issuance`. */
  const firstFlight = flights[0]
    ? v.segments.find((s) => s.segmentId === flights[0].id)
    : undefined

  const { error } = await admin
    .from("booking_cases")
    .update({
      pnr: v.pnr,
      issued_at: now,
      issued_by: identity.userId,
      issuing_carrier: v.issuingCarrier || null,
      consolidator: v.consolidator || null,
      cost_real: v.costReal ? parseMoney(v.costReal) : null,
      fare_basis: firstFlight?.fareBasis || v.fareBasis || null,
      nvb: firstFlight?.nvb || v.nvb || null,
      nva: firstFlight?.nva || v.nva || null,
      endorsements: v.endorsements || null,
      stage: "emitido",
    })
    .eq("id", v.caseId)

  if (error) {
    console.error("[bo/pc] emissão falhou:", error.message)
    return { ok: false, error: t("bo.actions.pc.issue.saveFailed") }
  }

  for (const ticket of v.tickets) {
    await admin
      .from("case_passengers")
      .update({
        ticket_number: ticket.ticketNumber,
        /* As colunas antigas continuam escritas com o primeiro lugar de cada
           sentido: são as que a página do cliente e a ficha já leem. Os lugares
           por voo ficam na tabela nova, logo abaixo. */
        seat_outbound: ticket.seatOutbound || null,
        seat_inbound: ticket.seatInbound || null,
      })
      .eq("id", ticket.passengerId)
      .eq("case_id", v.caseId)
  }

  /*
   * TEN-03 · os passageiros e os voos têm de ser **deste** caso. As tabelas de
   * lugares e de bagagem têm chave única (passageiro, voo): um id de outro
   * caso — de outro parceiro — ocupava a linha dele, e a emissão desse caso
   * deixava de conseguir gravar.
   */
  const { data: ownPassengers } = await admin
    .from("case_passengers")
    .select("id")
    .eq("case_id", v.caseId)
  const passengerIds = new Set(((ownPassengers ?? []) as { id: string }[]).map((p) => p.id))
  const segmentIds = new Set(flights.map((f) => f.id))

  const { savePassengerSeats, savePassengerBaggage, saveSegmentIssuance } =
    await import("@/lib/issuance")
  await savePassengerSeats(
    v.caseId,
    v.seats.filter((x) => passengerIds.has(x.passengerId) && segmentIds.has(x.segmentId))
  )
  /* T-04 · o cupão de cada voo, e a bagagem de cada passageiro em cada voo. */
  await saveSegmentIssuance(
    v.caseId,
    v.segments.filter((x) => segmentIds.has(x.segmentId))
  )
  await savePassengerBaggage(
    v.caseId,
    v.baggage.filter((x) => passengerIds.has(x.passengerId) && segmentIds.has(x.segmentId))
  )

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

  /*
   * EM-02 e EM-03 · o PDF nasce aqui, no mesmo gesto que emite.
   *
   * Gerado uma vez e guardado: o reenvio a partir do back-office usa o
   * documento que já existe, com o mesmo número. Um segundo PDF com uma hora
   * diferente deixaria de ser prova de nada.
   *
   * Se a geração falhar, a emissão fica na mesma — o PNR e os bilhetes já estão
   * gravados, e o cliente já tem lugar no avião. O que a mensagem diz é que o
   * documento falta, e o botão de reenviar volta a tentar.
   */
  const { generateTicketDocuments } = await import("@/lib/tickets/generate")
  const documents = await generateTicketDocuments({
    caseId: v.caseId,
    generatedBy: identity.userId,
  })

  let delivered = false
  if (documents.ok) {
    const { sendTicketsIssuedEmail } = await import("@/lib/emails/send")
    /* EM-03 e EM-04 · o bilhete combinado e o guia de uma página, os dois em
       anexo. Os individuais ficam no link: quatro anexos num email é um email
       que não passa em metade dos filtros. */
    const attachments = documents.files
      .filter((file) => file.kind === "combined" || file.kind === "guide")
      .map((file) => ({ filename: file.fileName, content: file.bytes }))

    const sent = await sendTicketsIssuedEmail({
      caseId: v.caseId,
      attachments,
    })
    delivered = sent.ok
  }

  touch(v.caseId)

  return {
    ok: true,
    notice: [
      t("bo.actions.pc.issue.issued", { pnr: v.pnr }),
      documents.ok
        ? t("bo.actions.pc.tickets.generated", { number: documents.documentNumber })
        : t("bo.actions.pc.issue.pdfFailed", { reason: documents.reason }),
      documents.ok
        ? delivered
          ? t("bo.actions.pc.issue.emailSent")
          : t("bo.actions.pc.issue.emailFailed")
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  }
}

/**
 * T-04 · os voos da opção que o cliente escolheu.
 *
 * A lista de voos de um caso não é o que o formulário diz que ela é: é o que
 * está gravado na oferta escolhida. Ler daqui é o que faz a verificação de
 * "todos os voos completos" ser verificável — com a lista vinda do browser,
 * mandar um array vazio passava sempre.
 */
async function selectedSegments(caseId: string): Promise<
  {
    id: string
    carrier_code: string | null
    flight_number: string | null
    origin: string | null
    destination: string | null
  }[]
> {
  const admin = createAdminClient()
  if (!admin) return []

  const { data: proposal } = await admin
    .from("case_proposals")
    .select("selected_offer_id")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const offerId = (proposal as { selected_offer_id: string | null } | null)
    ?.selected_offer_id
  if (!offerId) return []

  const { data } = await admin
    .from("case_offer_segments")
    .select("id, carrier_code, flight_number, origin, destination, position, direction")
    .eq("offer_id", offerId)
    .order("position")

  return (data ?? []) as {
    id: string
    carrier_code: string | null
    flight_number: string | null
    origin: string | null
    destination: string | null
  }[]
}

/**
 * EM-03 · reenviar o bilhete **sem regenerar**.
 *
 * O critério é explícito: "reenviável a partir do back-office sem regenerar,
 * mantendo o mesmo número de documento". É por isso que esta função lê o
 * documento do armazenamento em vez de o voltar a compor — um bilhete reenviado
 * tem de ser byte a byte o mesmo que o cliente já tem.
 */
export async function boResendTickets(caseId: string): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const { loadTicketDocument } = await import("@/lib/tickets/store")
  const combined = await loadTicketDocument(caseId, null)

  if (!combined) {
    return {
      ok: false,
      error:
        t("bo.actions.pc.tickets.noneYet"),
    }
  }

  /* O guia é composto na hora: não tem dados de ninguém e é o mesmo para toda
     a gente, por isso não vive no armazenamento (ver `generateTicketDocuments`).
     O bilhete, esse, vem do disco tal como foi gerado. */
  const { renderTicketGuidePdf } = await import("@/lib/tickets/pdf")
  const { sendTicketsIssuedEmail } = await import("@/lib/emails/send")

  const sent = await sendTicketsIssuedEmail({
    caseId,
    attachments: [
      { filename: combined.fileName, content: combined.bytes },
      {
        filename: "WeeFly-como-ler-o-bilhete.pdf",
        content: Buffer.from(await renderTicketGuidePdf()),
      },
    ],
  })

  await logCaseEvent({
    caseId,
    kind: "tickets_resent",
    title: "Bilhete reenviado ao cliente",
    detail: `${combined.documentNumber} · por ${identity.email}`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
  })

  touch(caseId)

  return sent.ok
    ? {
        ok: true,
        notice: t("bo.actions.pc.tickets.resent", { number: combined.documentNumber }),
      }
    : { ok: false, error: t("bo.actions.pc.tickets.resendFailed", { reason: sent.reason }) }
}

/**
 * EM-02 · gerar (ou voltar a gerar) o PDF do bilhete.
 *
 * Existe para o caso em que a geração falhou no momento da emissão — o PNR ficou
 * gravado e o documento não. Volta a compor e substitui o que lá estiver,
 * mantendo o número de documento, que deriva do PNR e da referência.
 */
export async function boGenerateTickets(caseId: string): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const { generateTicketDocuments } = await import("@/lib/tickets/generate")
  const result = await generateTicketDocuments({
    caseId,
    generatedBy: identity.userId,
  })

  touch(caseId)

  return result.ok
    ? { ok: true, notice: t("bo.actions.pc.tickets.generated", { number: result.documentNumber }) }
    : { ok: false, error: t("bo.actions.pc.tickets.generateFailed", { reason: result.reason }) }
}


// ── BO-14 · o vendedor do caso ───────────────────────────────────────────────

const sellerSchema = z.object({
  caseId: z.string().uuid(),
  /* Vazio é uma resposta: "tirar o dono". Um caso sem vendedor volta a
     "novos sem dono" na fila, que é onde alguém o vai buscar. */
  email: z.string().trim().email().or(z.literal("")),
})

/**
 * BO-14 · atribuir o caso a um vendedor.
 *
 * A lista vem de `bo_allowlist` (ver `listBoSellers`) e o email é validado
 * contra ela aqui: um seletor no browser é uma cortesia, e esta função é um
 * endpoint. Guarda-se o email e a etiqueta — o email porque é o identificador,
 * a etiqueta porque o histórico tem de continuar legível depois de a conta sair.
 */
export async function boSetSeller(
  input: z.input<typeof sellerSchema>
): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(String(input?.caseId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = sellerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t("bo.actions.pc.seller.invalid") }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

  const { listBoSellers } = await import("@/lib/bo-access")
  const sellers = await listBoSellers()
  const chosen = parsed.data.email
    ? sellers.find(
        (s) => s.email.toLowerCase() === parsed.data.email.toLowerCase()
      )
    : null

  if (parsed.data.email && !chosen) {
    return { ok: false, error: t("bo.actions.pc.seller.notListed") }
  }

  const { error } = await admin
    .from("booking_cases")
    .update({
      seller_email: chosen?.email ?? null,
      seller_label: chosen?.label ?? null,
      seller_set_at: chosen ? new Date().toISOString() : null,
      seller_set_by: chosen ? identity.userId : null,
    })
    .eq("id", parsed.data.caseId)

  if (error) {
    console.error("[bo/pc] vendedor não gravado:", error.message)
    return { ok: false, error: t("bo.actions.pc.seller.saveFailed") }
  }

  await logCaseEvent({
    caseId: parsed.data.caseId,
    kind: "seller_assigned",
    title: chosen ? "Vendedor atribuído" : "Vendedor removido",
    detail: chosen ? `${chosen.label} (${chosen.email})` : "o caso ficou sem dono",
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
  })

  touch(parsed.data.caseId)
  return {
    ok: true,
    notice: chosen ? t("bo.actions.pc.seller.assigned", { name: chosen.label }) : t("bo.actions.pc.seller.cleared"),
  }
}

// ── NT-07 · avisar o cliente, escrito à mão ──────────────────────────────────

const noticeSchema = z.object({
  caseId: z.string().uuid(),
  message: z
    .string()
    .trim()
    .min(10, "bo.actions.pc.noticeMessage")
    .max(2000),
  email: z.boolean().default(true),
  whatsapp: z.boolean().default(true),
})

/**
 * NT-07 · a mudança de horário que a companhia comunicou, ou o que for.
 *
 * O sistema não inventa estas mensagens (decisão Q5 do backlog): uma pessoa
 * decide o que passar e como o dizer. O que ele faz é entregá-las, guardá-las
 * com autor e hora, e pô-las no link do cliente.
 */
export async function boNotifyClient(
  input: z.input<typeof noticeSchema>
): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(String(input?.caseId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = noticeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.common.invalidData") }
  }
  const v = parsed.data

  if (!v.email && !v.whatsapp) {
    return { ok: false, error: t("bo.actions.pc.notify.pickChannel") }
  }

  const { sendManualClientNotice } = await import("@/lib/emails/send")
  const outcome = await sendManualClientNotice({
    caseId: v.caseId,
    message: v.message,
    channels: { email: v.email, whatsapp: v.whatsapp },
    actorId: identity.userId,
    actorEmail: identity.email,
  })

  await logCaseEvent({
    caseId: v.caseId,
    kind: "client_notified",
    title: "Cliente avisado pela equipa",
    detail: `${v.message.slice(0, 240)} · por ${identity.email}`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
    payload: { channels: { email: v.email, whatsapp: v.whatsapp } },
  })

  touch(v.caseId)

  /*
   * O que aconteceu em cada canal, dito à letra.
   *
   * Um "enviado" que na verdade quer dizer "o email saiu e o WhatsApp não está
   * configurado" mandaria o agente embora convencido de que o cliente foi
   * avisado pelos dois. Cada canal responde por si.
   */
  const parts: string[] = []
  if (v.email) {
    parts.push(
      outcome.email?.ok
        ? t("bo.actions.pc.notify.emailSent")
        : t("bo.actions.pc.notify.emailFailed", { reason: outcome.email?.reason ?? t("bo.actions.pc.notify.error") })
    )
  }
  if (v.whatsapp) {
    parts.push(
      outcome.whatsapp?.ok
        ? t("bo.actions.pc.notify.whatsappSent")
        : t("bo.actions.pc.notify.whatsappFailed", { reason: outcome.whatsapp?.reason ?? t("bo.actions.pc.notify.error") })
    )
  }

  const anySent = Boolean(outcome.email?.ok || outcome.whatsapp?.ok)
  return anySent
    ? { ok: true, notice: t("bo.actions.pc.notify.done", { channels: parts.join(" · ") }) }
    : { ok: false, error: t("bo.actions.pc.notify.nothingDelivered", { channels: parts.join(" · ") }) }
}

// ── NT-06 · a bandeira de entrega ────────────────────────────────────────────

/** Baixa a bandeira depois de alguém tratar do assunto (telefonema, outro email). */
export async function boClearNotifyFlag(caseId: string): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const { clearNotifyFlag } = await import("@/lib/notifications")
  await clearNotifyFlag(caseId)

  await logCaseEvent({
    caseId,
    kind: "notify_flag_cleared",
    title: "Falha de entrega dada como tratada",
    detail: `por ${identity.email}`,
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
  })

  touch(caseId)
  return { ok: true, notice: t("bo.actions.pc.notify.flagCleared") }
}

// ── LNK-08 · revogar e voltar a gerar o link do cliente ──────────────────────

/**
 * O link do cliente é substituído por outro, e o caso fica onde está.
 *
 * O critério do NT-03 pede isto à letra: "um administrador pode revogá-lo e
 * voltar a gerá-lo, mantendo o caso e o histórico". Serve para o caso em que o
 * endereço foi para a pessoa errada — um email reencaminhado, um telemóvel
 * perdido — e a partir daí quem o tiver deixa de ver os passaportes de alguém.
 *
 * O antigo fica em `case_token_history`, e não abre nada: nenhuma leitura o
 * procura. Fica para responder à pergunta que se faz a seguir a uma revogação,
 * que é sempre "desde quando é que o outro deixou de servir?".
 */
export async function boRotateClientLink(
  caseId: string,
  reason: string
): Promise<BoResultWith<{ token: string }>> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(caseId)
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }
  if (identity.role !== "admin") {
    return { ok: false, error: t("bo.actions.pc.link.adminOnly") }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

  const { data: existing } = await admin
    .from("booking_cases")
    .select("token")
    .eq("id", caseId)
    .maybeSingle()

  if (!existing) return { ok: false, error: t("bo.actions.common.caseNotFound") }

  const { mintToken } = await import("@/lib/booking-cases")
  const token = mintToken()

  const { error } = await admin
    .from("booking_cases")
    .update({ token })
    .eq("id", caseId)

  if (error) {
    console.error("[bo/pc] rotação do link falhou:", error.message)
    return { ok: false, error: t("bo.actions.pc.link.failed") }
  }

  await admin.from("case_token_history").insert({
    case_id: caseId,
    old_token: (existing as { token: string }).token,
    reason: reason.trim() || null,
    revoked_by: identity.userId,
    revoked_by_email: identity.email,
  })

  await logCaseEvent({
    caseId,
    kind: "link_rotated",
    title: "Link do cliente revogado e gerado de novo",
    detail: [reason.trim(), `por ${identity.email}`].filter(Boolean).join(" · "),
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
  })

  touch(caseId)
  return {
    ok: true,
    token,
    notice: t("bo.actions.pc.link.done"),
  }
}

// ── BO-15 · a opção congelada na fase de pagamento ───────────────────────────

const unfreezeSchema = z.object({
  caseId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(12, "bo.actions.pc.unfreezeReason"),
})

/**
 * BO-15 · voltar um passo, explicitamente.
 *
 * "Uma vez chegado à fase de pagamento, o voo escolhido não pode ser editado.
 * Mudá-lo obriga a voltar um passo de forma explícita, o que cria uma revisão e
 * avisa o cliente."
 *
 * É esse passo. O que ele faz, por esta ordem:
 *
 *   1. desfaz a escolha — o caso volta a ter opções por escolher;
 *   2. fecha a janela de pagamento que estava aberta, porque ela cobrava um
 *      valor de uma opção que já não está escolhida;
 *   3. abre uma revisão na proposta (R1 → R2), o que a devolve a rascunho e
 *      volta a deixar o compositor escrever;
 *   4. avisa o cliente, com o motivo que o agente escreveu.
 *
 * O que ele recusa: fazer isto depois de o dinheiro entrar. A partir daí não é
 * uma revisão, é um reembolso — e um reembolso não se faz com um botão que diz
 * "voltar atrás".
 */
export async function boUnfreezeFlight(
  input: z.input<typeof unfreezeSchema>
): Promise<BoResult> {
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(String(input?.caseId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = unfreezeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.common.invalidData") }
  }
  const v = parsed.data

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

  const { data: bookingCase } = await admin
    .from("booking_cases")
    .select("id, stage, pnr")
    .eq("id", v.caseId)
    .maybeSingle()

  if (!bookingCase) return { ok: false, error: t("bo.actions.common.caseNotFound") }

  const record = bookingCase as { stage: string; pnr: string | null }
  if (record.stage === "emitido" || record.pnr) {
    return {
      ok: false,
      error: t("bo.actions.pc.unfreeze.issued"),
    }
  }

  const payment = await getPcPayment(v.caseId)
  if (payment?.admin_confirmed || payment?.status === "COMPLETED") {
    return {
      ok: false,
      error:
        t("bo.actions.pc.unfreeze.paid"),
    }
  }

  // 1 · a escolha desfaz-se.
  const { data: proposal } = await admin
    .from("case_proposals")
    .select("id, status, revision")
    .eq("case_id", v.caseId)
    .maybeSingle()

  await admin
    .from("case_proposals")
    .update({ selected_offer_id: null, selected_at: null })
    .eq("case_id", v.caseId)

  // 2 · a janela de pagamento fecha-se: cobrava uma opção que já não existe.
  if (payment && payment.status !== "EXPIRED" && payment.status !== "CANCELLED") {
    await expireNow({
      caseId: v.caseId,
      paymentId: payment.id,
      actorId: identity.userId,
      actorEmail: identity.email,
    })
  }

  // 3 · a proposta volta a rascunho, numa revisão nova.
  let revision: number | null = null
  const draft = proposal as { id: string; status: string; revision: number } | null
  if (draft) {
    revision = draft.status === "publicada" ? draft.revision + 1 : draft.revision
    await admin
      .from("case_proposals")
      .update({ status: "rascunho", revision })
      .eq("id", draft.id)
  }

  await admin
    .from("booking_cases")
    .update({ stage: "proposta_enviada" })
    .eq("id", v.caseId)
    .not("stage", "in", '("emitido","cancelado")')

  await logCaseEvent({
    caseId: v.caseId,
    kind: "flight_unfrozen",
    title: "Voltou um passo: o voo escolhido foi descongelado",
    detail: [v.reason, revision ? `revisão R${revision}` : "", `por ${identity.email}`]
      .filter(Boolean)
      .join(" · "),
    actorId: identity.userId,
    actorEmail: identity.email,
    actorKind: "staff",
    payload: { revision },
  })

  // 4 · o cliente é avisado, com a frase que o agente escreveu.
  const { sendManualClientNotice } = await import("@/lib/emails/send")
  await sendManualClientNotice({
    caseId: v.caseId,
    message: v.reason,
    channels: { email: true, whatsapp: true },
    actorId: identity.userId,
    actorEmail: identity.email,
  })

  touch(v.caseId)
  return {
    ok: true,
    notice: [
      t("bo.actions.pc.unfreeze.done"),
      revision ? t("bo.actions.pc.unfreeze.draft", { revision }) : "",
      t("bo.actions.pc.unfreeze.clientNotified"),
    ]
      .filter(Boolean)
      .join(" "),
  }
}

// ── BO-04 · as datas do pedido ───────────────────────────────────────────────

const datesSchema = z.object({
  caseId: z.string().uuid(),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "bo.actions.pc.departInvalid"),
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
    .min(12, "bo.actions.pc.datesReason"),
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
  const { t } = await getBoI18n()
  const identity = await boCaseIdentity(String(input?.caseId ?? ""))
  if (!identity) return { ok: false, error: t(NOT_ALLOWED) }

  const parsed = datesSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.actions.common.invalidData") }
  }
  const v = parsed.data

  if (v.returnDate && v.returnDate < v.departDate) {
    return { ok: false, error: t("bo.actions.pc.dates.returnBeforeDepart") }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.actions.common.serviceUnavailable") }

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

  if (!record || !trip) return { ok: false, error: t("bo.actions.common.caseNotFound") }

  /* Depois de emitido as datas já não são uma proposta: são um bilhete, e
     mudá-las é uma reemissão que passa pela companhia. */
  if (record.stage === "emitido" || record.pnr) {
    return {
      ok: false,
      error: t("bo.actions.pc.dates.issued"),
    }
  }

  const payment = await getPcPayment(v.caseId)
  if (payment?.admin_confirmed || payment?.status === "COMPLETED") {
    return {
      ok: false,
      error: t("bo.actions.pc.dates.paid"),
    }
  }

  const fromDepart = (trip.depart_date as string | null) ?? null
  const fromReturn = (trip.return_date as string | null) ?? null

  if (fromDepart === v.departDate && (fromReturn ?? null) === (v.returnDate ?? null)) {
    return { ok: false, error: t("bo.actions.pc.dates.unchanged") }
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
    return { ok: false, error: t("bo.actions.pc.dates.saveFailed") }
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
      t("bo.actions.pc.dates.done"),
      revision ? t("bo.actions.pc.dates.draft", { revision }) : "",
      notified
        ? t("bo.actions.pc.dates.clientNotified")
        : t("bo.actions.pc.dates.clientNotNotified"),
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
    const outcome = await sendDatesProposedEmail(caseId, change)
    return outcome.ok
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
