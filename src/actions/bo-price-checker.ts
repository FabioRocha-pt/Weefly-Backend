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
import { markAlertsRead } from "@/lib/bo-alerts"
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
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const { data: bookingCase } = await admin
    .from("booking_cases")
    .select("id, created_by, trip_request_id, created_at")
    .eq("id", caseId)
    .maybeSingle()

  if (!bookingCase) return { ok: false, error: "Caso não encontrado." }

  const record = bookingCase as {
    created_by: string | null
    trip_request_id: string | null
    created_at: string
  }

  if (record.created_by && record.created_by !== identity.userId) {
    return {
      ok: false,
      error:
        "Este caso já tem dono. Para o passar a outra pessoa, mude o vendedor no cabeçalho.",
    }
  }

  if (record.created_by === identity.userId) {
    return { ok: true, notice: "O caso já é seu." }
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
       * mostra.
       *
       * "A proposta regista o utilizador que a criou, a partir da sessão." O
       * vendedor era um campo à parte, preenchido à mão num seletor — e um caso
       * reclamado por uma pessoa podia continuar a mostrar outra, ou nenhuma.
       * São a mesma pessoa até o `RBAC` existir para os separar, e escrevê-los
       * no mesmo gesto é o que faz o cabeçalho dizer a verdade sem ninguém ter
       * de a repetir.
       */
      seller_email: identity.email,
      seller_label: identity.label,
      seller_set_at: now.toISOString(),
      seller_set_by: identity.userId,
    })
    .eq("id", caseId)
    /* A corrida decide-se aqui, e não numa leitura anterior. */
    .is("created_by", null)
    .select("id")

  if (!claimed || claimed.length === 0) {
    return {
      ok: false,
      error: "Outra pessoa reclamou este caso primeiro. Recarregue a página.",
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
  return { ok: true, notice: `Caso reclamado. Esteve ${waited} sem dono.` }
}

// ── C-14 · a campainha ───────────────────────────────────────────────────────

/**
 * Marca alertas como vistos por quem está a olhar.
 *
 * Chamada quando a campainha abre. Não devolve nada de útil de propósito: o
 * contador vem do servidor no render seguinte (o `BoLiveUpdates` já força um
 * `router.refresh()`), e devolver o número novo daqui criava uma segunda fonte
 * de verdade para o mesmo valor.
 */
export async function boMarkAlertsRead(eventIds: string[]): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  /* Um limite, porque isto vem do browser: a campainha carrega 40 e não há
     razão para aceitar mais do que isso de uma vez. */
  const ids = eventIds
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 60)

  await markAlertsRead(identity.userId, ids)
  revalidatePath("/admin/price-checker")
  return { ok: true }
}

// ── C-33 · as instruções de pagamento ────────────────────────────────────────

const instructionsSchema = z.object({
  caseId: z.string().uuid(),
  paymentId: z.string().uuid(),
  method: z.enum(["stripe", "vinti4", "revolut", "instapay", "paypal"]),
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
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = instructionsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  }
  const v = parsed.data

  const method = payMethod(v.method)
  if (!method) return { ok: false, error: "Método desconhecido." }

  const link = v.link?.trim() || null
  const reference = v.reference?.trim() || null

  if (method.supply === "link" && !link) {
    return { ok: false, error: `Falta o ${method.fieldPt.toLowerCase()}.` }
  }
  if (method.supply === "reference" && !reference) {
    return { ok: false, error: `Falta a ${method.fieldPt.toLowerCase()}.` }
  }
  if (method.supply === "either" && !link && !reference) {
    return { ok: false, error: `Escreva a referência ou o link do ${method.fieldPt}.` }
  }

  const payment = await getPcPayment(v.caseId)
  if (!payment || payment.id !== v.paymentId) {
    return { ok: false, error: "Pagamento não encontrado." }
  }
  if (payment.admin_confirmed || payment.status === "COMPLETED") {
    return { ok: false, error: "Este pagamento já está confirmado." }
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

  if (!saved.ok) return { ok: false, error: "Não foi possível gravar." }

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
    return { ok: true, notice: "Instruções gravadas. Ainda não foram enviadas." }
  }

  /* A impressão digital do que vai sair: o mesmo conteúdo duas vezes é um
     aviso só, um conteúdo diferente é uma notícia nova. Ver o `dedupeSuffix`. */
  const outcome = await sendPaymentInstructionsEmail(
    v.caseId,
    `${v.method}:${link ?? reference}`
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
        ? `Instruções enviadas ao cliente. O prazo ficou em ${new Date(
            due!
          ).toLocaleString("pt-PT", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Atlantic/Cape_Verde",
          })} — hora do envio mais ${PAY_DUE_HOURS}h.`
        : "Instruções gravadas e enviadas ao cliente.",
    }
  }

  if (outcome.status === "duplicate") {
    return {
      ok: true,
      notice: "Instruções gravadas. Estas já tinham sido enviadas ao cliente.",
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
    error: `As instruções ficaram gravadas, mas o email NÃO saiu: ${outcome.reason}. O cliente continua sem saber por onde pagar — mande-lhe o link por WhatsApp ou tente enviar outra vez.`,
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
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const { data: raw } = await admin
    .from("booking_cases")
    .select("id, stage, pnr, issued_at, closed_at")
    .eq("id", caseId)
    .maybeSingle()

  if (!raw) return { ok: false, error: "Caso não encontrado." }

  const record = raw as {
    stage: string
    pnr: string | null
    issued_at: string | null
    closed_at: string | null
  }

  if (record.closed_at) return { ok: true, notice: "O caso já está fechado." }

  const issued = record.stage === "emitido" || Boolean(record.pnr) || Boolean(record.issued_at)
  if (!issued) {
    return {
      ok: false,
      error:
        "Só se fecha um caso depois de o bilhete estar emitido. Um caso que não emitiu cancela-se, e isso é outra ação.",
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
  return { ok: true, notice: "Caso fechado. Saiu das filas de trabalho." }
}

/**
 * C-04 · reabrir, que é o critério "reversível por um administrador".
 *
 * A reversão fica registada — e é por isso que apagar `closed_at` não perde
 * nada: o rasto vive em `case_events`, que ninguém reescreve.
 */
export async function boReopenCase(caseId: string): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  if (identity.role !== "admin") {
    return {
      ok: false,
      error: "Só um administrador pode reabrir um caso fechado.",
    }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const { data: reopened } = await admin
    .from("booking_cases")
    .update({ closed_at: null, closed_by: null, closed_by_email: null })
    .eq("id", caseId)
    .not("closed_at", "is", null)
    .select("id")

  if (!reopened || reopened.length === 0) {
    return { ok: false, error: "Este caso não está fechado." }
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
  return { ok: true, notice: "Caso reaberto. Volta às filas de trabalho." }
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
            "Cada bilhete são 3 dígitos de companhia + 10 do documento."
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
        row.fareBasis?.trim() ? "" : "base tarifária",
        row.nvb?.trim() ? "" : "NVB",
        row.nva?.trim() ? "" : "NVA",
      ].filter(Boolean)
      if (gaps.length) missing.push(`${label} (${gaps.join(", ")})`)
    }

    if (missing.length > 0) {
      return {
        ok: false,
        error: `Faltam campos do documento em ${missing.length} voo(s): ${missing.join(" · ")}.`,
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
    return { ok: false, error: "Não foi possível gravar a emissão." }
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

  const { savePassengerSeats, savePassengerBaggage, saveSegmentIssuance } =
    await import("@/lib/issuance")
  await savePassengerSeats(v.caseId, v.seats)
  /* T-04 · o cupão de cada voo, e a bagagem de cada passageiro em cada voo. */
  await saveSegmentIssuance(v.caseId, v.segments)
  await savePassengerBaggage(v.caseId, v.baggage)

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
      `Emitido. PNR ${v.pnr}.`,
      documents.ok
        ? `Bilhete ${documents.documentNumber} gerado.`
        : `O PDF não foi gerado (${documents.reason}) — use "Gerar de novo" na aba da Emissão.`,
      documents.ok
        ? delivered
          ? "O cliente recebeu o email com o PDF em anexo."
          : "O email ao cliente não saiu — veja a aba Comunicações."
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
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const { loadTicketDocument } = await import("@/lib/tickets/store")
  const combined = await loadTicketDocument(caseId, null)

  if (!combined) {
    return {
      ok: false,
      error:
        "Este caso ainda não tem bilhete gerado. Use “Gerar bilhete” antes de reenviar.",
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
        notice: `Bilhete ${combined.documentNumber} reenviado — o mesmo documento, sem regenerar.`,
      }
    : { ok: false, error: `O reenvio falhou: ${sent.reason}` }
}

/**
 * EM-02 · gerar (ou voltar a gerar) o PDF do bilhete.
 *
 * Existe para o caso em que a geração falhou no momento da emissão — o PNR ficou
 * gravado e o documento não. Volta a compor e substitui o que lá estiver,
 * mantendo o número de documento, que deriva do PNR e da referência.
 */
export async function boGenerateTickets(caseId: string): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const { generateTicketDocuments } = await import("@/lib/tickets/generate")
  const result = await generateTicketDocuments({
    caseId,
    generatedBy: identity.userId,
  })

  touch(caseId)

  return result.ok
    ? { ok: true, notice: `Bilhete ${result.documentNumber} gerado.` }
    : { ok: false, error: `Não foi possível gerar o bilhete: ${result.reason}` }
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
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = sellerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Vendedor inválido." }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const { listBoSellers } = await import("@/lib/bo-access")
  const sellers = await listBoSellers()
  const chosen = parsed.data.email
    ? sellers.find(
        (s) => s.email.toLowerCase() === parsed.data.email.toLowerCase()
      )
    : null

  if (parsed.data.email && !chosen) {
    return { ok: false, error: "Esse vendedor não está na lista de acessos." }
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
    return { ok: false, error: "Não foi possível gravar o vendedor." }
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
    notice: chosen ? `Caso atribuído a ${chosen.label}.` : "Caso sem vendedor.",
  }
}

// ── NT-07 · avisar o cliente, escrito à mão ──────────────────────────────────

const noticeSchema = z.object({
  caseId: z.string().uuid(),
  message: z
    .string()
    .trim()
    .min(10, "Escreva a mensagem — é o cliente que a vai ler.")
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
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = noticeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  }
  const v = parsed.data

  if (!v.email && !v.whatsapp) {
    return { ok: false, error: "Escolha pelo menos um canal." }
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
    parts.push(outcome.email?.ok ? "email enviado" : `email não saiu (${outcome.email?.reason ?? "erro"})`)
  }
  if (v.whatsapp) {
    parts.push(
      outcome.whatsapp?.ok
        ? "WhatsApp enviado"
        : `WhatsApp não saiu (${outcome.whatsapp?.reason ?? "erro"})`
    )
  }

  const anySent = Boolean(outcome.email?.ok || outcome.whatsapp?.ok)
  return anySent
    ? { ok: true, notice: `Aviso registado no caso · ${parts.join(" · ")}.` }
    : { ok: false, error: `Nada foi entregue · ${parts.join(" · ")}.` }
}

// ── NT-06 · a bandeira de entrega ────────────────────────────────────────────

/** Baixa a bandeira depois de alguém tratar do assunto (telefonema, outro email). */
export async function boClearNotifyFlag(caseId: string): Promise<BoResult> {
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

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
  return { ok: true, notice: "Bandeira de entrega baixada." }
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
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }
  if (identity.role !== "admin") {
    return { ok: false, error: "Só um administrador pode revogar o link." }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const { data: existing } = await admin
    .from("booking_cases")
    .select("token")
    .eq("id", caseId)
    .maybeSingle()

  if (!existing) return { ok: false, error: "Caso não encontrado." }

  const { mintToken } = await import("@/lib/booking-cases")
  const token = mintToken()

  const { error } = await admin
    .from("booking_cases")
    .update({ token })
    .eq("id", caseId)

  if (error) {
    console.error("[bo/pc] rotação do link falhou:", error.message)
    return { ok: false, error: "Não foi possível gerar um link novo." }
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
    notice: "Link novo gerado. O antigo deixou de abrir — envie o novo ao cliente.",
  }
}

// ── BO-15 · a opção congelada na fase de pagamento ───────────────────────────

const unfreezeSchema = z.object({
  caseId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(12, "Escreva porque o voo escolhido volta atrás — o cliente vai ler."),
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
  const identity = await boIdentity()
  if (!identity) return { ok: false, error: NOT_ALLOWED }

  const parsed = unfreezeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  }
  const v = parsed.data

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Serviço indisponível." }

  const { data: bookingCase } = await admin
    .from("booking_cases")
    .select("id, stage, pnr")
    .eq("id", v.caseId)
    .maybeSingle()

  if (!bookingCase) return { ok: false, error: "Caso não encontrado." }

  const record = bookingCase as { stage: string; pnr: string | null }
  if (record.stage === "emitido" || record.pnr) {
    return {
      ok: false,
      error: "Este caso já está emitido. Mudar de voo é uma reemissão.",
    }
  }

  const payment = await getPcPayment(v.caseId)
  if (payment?.admin_confirmed || payment?.status === "COMPLETED") {
    return {
      ok: false,
      error:
        "O cliente já pagou este voo. Mudá-lo passa por um reembolso, não por voltar um passo.",
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
      "O voo deixou de estar congelado e a escolha do cliente foi desfeita.",
      revision ? `A proposta está em rascunho como R${revision}.` : "",
      "O cliente foi avisado.",
    ]
      .filter(Boolean)
      .join(" "),
  }
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
