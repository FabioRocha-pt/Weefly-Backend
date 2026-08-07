"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getCaseByToken } from "@/lib/booking-cases"
import {
  applyPaymentStatus,
  latestPayment,
  refreshWeePayStatus,
  startWeePayPayment,
} from "@/lib/payments"
import { PAYMENT_STATUS_LABELS } from "@/lib/case-status"

export type PaymentActionState = { error: string | null; notice?: string }

function touch(caseId: string) {
  revalidatePath("/admin")
  revalidatePath(`/admin/casos/${caseId}`)
}

// --- Back-office -------------------------------------------------------------

/** Pede à WeePay que abra o pagamento, ou explica porque não pode. */
export async function generatePaymentLink(
  caseId: string
): Promise<PaymentActionState> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Sessão expirada. Volte a entrar." }

  const outcome = await startWeePayPayment(caseId)
  touch(caseId)

  if (outcome.ok) {
    return {
      error: null,
      notice: outcome.url
        ? "Link de pagamento gerado. O cliente já o vê no link 3."
        : (outcome.message ??
          "A WeePay abriu o pagamento, mas não devolveu link — verifique o estado daqui a pouco."),
    }
  }

  switch (outcome.reason) {
    case "not_configured":
      return {
        error:
          "A WeePay ainda não está configurada (falta WEEPAY_API_URL). Combine o pagamento com o cliente e registe-o aqui.",
      }
    case "no_payment":
      return {
        error:
          "Este caso ainda não tem valor. Ele entra sozinho quando o cliente escolher uma opção, ou registe-o à mão.",
      }
    case "already":
      return { error: "Este pagamento já está fechado." }
    default:
      return { error: outcome.message ?? "A WeePay recusou o pedido." }
  }
}

/** Pergunta à WeePay em que estado está, e aplica o que ela responder. */
export async function checkPaymentState(
  caseId: string
): Promise<PaymentActionState> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Sessão expirada. Volte a entrar." }

  const outcome = await refreshWeePayStatus(caseId)
  touch(caseId)

  if (outcome.ok) {
    return {
      error: null,
      notice: outcome.changed
        ? `Estado atualizado: ${PAYMENT_STATUS_LABELS[outcome.status]}.`
        : `Sem alterações — continua em ${PAYMENT_STATUS_LABELS[outcome.status]}.`,
    }
  }

  switch (outcome.reason) {
    case "not_configured":
      return { error: "A WeePay ainda não está configurada." }
    case "no_transaction":
      return {
        error:
          "Não há transação WeePay neste caso. Gere o link de pagamento primeiro.",
      }
    default:
      return { error: outcome.message ?? "Não foi possível verificar." }
  }
}

/**
 * Confirma um pagamento recebido fora do gateway.
 *
 * Substitui `markPaymentReceived` em actions/booking-cases.ts: aquele escrevia
 * COMPLETED diretamente na tabela, sem passar pela matriz de transições nem
 * fechar a etapa 3. Este passa.
 */
export async function confirmPaymentReceived(
  caseId: string,
  paymentId: string
): Promise<PaymentActionState> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Sessão expirada. Volte a entrar." }

  const result = await applyPaymentStatus(paymentId, "COMPLETED", {
    source: "admin",
    markedBy: user.id,
  })

  touch(caseId)

  if (result.ok) {
    await notifyClientPaid(caseId)
    return { error: null, notice: "Pagamento registado e cliente avisado." }
  }

  if (result.reason === "illegal") {
    return {
      error:
        "Este pagamento não pode passar a Pago a partir do estado em que está. Verifique o estado na WeePay.",
    }
  }
  return { error: "Não foi possível registar o pagamento." }
}

// --- Lado do cliente ---------------------------------------------------------

/**
 * O cliente declara que já pagou.
 *
 * Não mexe no estado do pagamento de propósito. É uma declaração, não uma
 * prova: quem a transforma em COMPLETED é o admin, depois de ver o extrato, ou
 * a WeePay. O que isto resolve é o cliente não ter de telefonar para dizer que
 * transferiu, e o back-office passar a ver quem está à espera de confirmação.
 */
export async function declarePaid(token: string): Promise<PaymentActionState> {
  const lookup = await getCaseByToken(token, 3)
  if (!lookup.ok) return { error: "Este link não está disponível." }

  const bookingCase = lookup.view.case
  const payment = await latestPayment(bookingCase.id)
  if (!payment) return { error: "Ainda não há valor a pagar neste pedido." }

  const admin = createAdminClient()
  if (!admin) return { error: "Serviço indisponível." }

  await admin
    .from("case_payments")
    .update({ client_declared_paid_at: new Date().toISOString() })
    .eq("id", payment.id)
    .is("client_declared_paid_at", null)

  revalidatePath(`/p/${token}/pagamento`)
  revalidatePath(`/admin/casos/${bookingCase.id}`)
  revalidatePath("/admin")

  await notifyTeamDeclared(bookingCase.id)

  return { error: null, notice: "Obrigado — vamos confirmar e avisamos-lhe." }
}

// --- Avisos ------------------------------------------------------------------

/** Best-effort: um email falhado nunca desfaz um pagamento registado. */
async function notifyClientPaid(caseId: string): Promise<void> {
  const { sendPaymentConfirmedEmail } = await import("@/lib/emails/send")
  try {
    await sendPaymentConfirmedEmail(caseId)
  } catch (err) {
    console.error("[payments] aviso de pagamento ao cliente falhou:", err)
  }
}

async function notifyTeamDeclared(caseId: string): Promise<void> {
  const { sendPaymentDeclaredEmail } = await import("@/lib/emails/send")
  try {
    await sendPaymentDeclaredEmail(caseId)
  } catch (err) {
    console.error("[payments] aviso de declaração à equipa falhou:", err)
  }
}
