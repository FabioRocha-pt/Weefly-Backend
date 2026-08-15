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
import { getI18n } from "@/i18n/server"

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
  const { t } = getI18n()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: t("errors.sessionExpired") }

  const outcome = await startWeePayPayment(caseId)
  touch(caseId)

  if (outcome.ok) {
    return {
      error: null,
      notice: outcome.url
        ? t("notices.payLinkGenerated")
        : (outcome.message ??
          t("notices.payOpenedNoLink")),
    }
  }

  switch (outcome.reason) {
    case "not_configured":
      return {
        error:
          t("errors.weepayNotConfiguredLong"),
      }
    case "no_payment":
      return {
        error:
          t("errors.caseHasNoAmount"),
      }
    case "already":
      return { error: t("errors.paymentClosed") }
    default:
      return { error: outcome.message ?? t("errors.weepayRefused") }
  }
}

/** Pergunta à WeePay em que estado está, e aplica o que ela responder. */
export async function checkPaymentState(
  caseId: string
): Promise<PaymentActionState> {
  const { t } = getI18n()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: t("errors.sessionExpired") }

  const outcome = await refreshWeePayStatus(caseId)
  touch(caseId)

  if (outcome.ok) {
    return {
      error: null,
      notice: t(
        outcome.changed ? "notices.statusUpdated" : "notices.statusUnchanged",
        { status: t(`paymentStatus.${outcome.status}`) }
      ),
    }
  }

  switch (outcome.reason) {
    case "not_configured":
      return { error: t("errors.weepayNotConfigured") }
    case "no_transaction":
      return {
        error:
          t("errors.noWeepayTransaction"),
      }
    default:
      return { error: outcome.message ?? t("errors.checkFailed") }
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
  const { t } = getI18n()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: t("errors.sessionExpired") }

  const result = await applyPaymentStatus(paymentId, "COMPLETED", {
    source: "admin",
    markedBy: user.id,
  })

  touch(caseId)

  if (result.ok) {
    await notifyClientPaid(caseId)
    return { error: null, notice: t("notices.paymentRecorded") }
  }

  if (result.reason === "illegal") {
    return {
      error:
        t("errors.cannotMarkPaid"),
    }
  }
  return { error: t("errors.paymentRecordFailed") }
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
  const { t } = getI18n()
  const lookup = await getCaseByToken(token, 3)
  if (!lookup.ok) return { error: t("errors.linkUnavailable") }

  const bookingCase = lookup.view.case
  const payment = await latestPayment(bookingCase.id)
  if (!payment) return { error: t("errors.nothingToPayYet") }

  const admin = createAdminClient()
  if (!admin) return { error: t("errors.serviceUnavailable") }

  await admin
    .from("case_payments")
    .update({ client_declared_paid_at: new Date().toISOString() })
    .eq("id", payment.id)
    .is("client_declared_paid_at", null)

  revalidatePath(`/p/${token}/pagamento`)
  revalidatePath(`/admin/casos/${bookingCase.id}`)
  revalidatePath("/admin")

  await notifyTeamDeclared(bookingCase.id)

  return { error: null, notice: t("notices.declareThanks") }
}

// --- Avisos ------------------------------------------------------------------

/**
 * Best-effort: um email falhado nunca desfaz um pagamento registado.
 *
 * Sai na língua guardada no lead — quem carrega no botão é o agente, e o
 * idioma dele não diz nada sobre o de quem lê. `sendPaymentConfirmedEmail`
 * vai buscá-la ao caso.
 */
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
