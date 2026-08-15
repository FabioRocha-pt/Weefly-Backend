"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/utils/supabase/server"
import { mintToken } from "@/lib/booking-cases"
import type { CaseStage } from "@/lib/case-status"
import { getI18n } from "@/i18n/server"

export type CaseActionState = { error: string | null }

function field(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Mint a new case. No client details are collected here by design — the token
 * is generated first and Link 1 collects everything. Stage rows for all three
 * links are created by the `booking_cases_seed_links` trigger.
 */
export async function createCase(): Promise<
  CaseActionState & { token?: string }
> {
  const { t } = getI18n()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: t("errors.sessionExpired") }

  const { data, error } = await supabase
    .from("booking_cases")
    .insert({ token: mintToken(), created_by: user.id })
    .select("id, token")
    .single()

  if (error) {
    console.error("[cases] createCase failed:", error)
    return { error: t("errors.caseCreateFailed") }
  }

  /*
   * Belt and braces para a etapa 3, e só para ela.
   *
   * A 0004 abria as três etapas à nascença. A 0005 voltou a fechar a 2, porque
   * agora há um gesto que a abre — publicar a proposta — e um email que o
   * anuncia. A 3 mantém-se aberta desde o início: quem lá chega antes de haver
   * valor vê "ainda a preparar o valor", que é verdade e não um beco sem saída.
   */
  const { error: unlockError } = await supabase
    .from("case_links")
    .update({ status: "ativo", unlocked_at: new Date().toISOString() })
    .eq("case_id", data.id)
    .eq("stage", 3)
    .eq("status", "bloqueado")

  if (unlockError) {
    console.error("[cases] opening stage 3 failed:", unlockError)
  }

  revalidatePath("/admin")
  return { error: null, token: data.token }
}

/**
 * Abre a etapa 3 (pagamento) ao cliente.
 *
 * A etapa 2 deixou de passar por aqui de propósito: desde a migração 0005 é
 * publicar a proposta que a abre, e nada mais. Se um caminho qualquer a pudesse
 * destrancar sozinho, o cliente receberia um comparador vazio — que é
 * exatamente a situação que a publicação existe para impedir.
 */
export async function unlockStage(
  formData: FormData
): Promise<CaseActionState> {
  const { t } = getI18n()
  const caseId = field(formData, "caseId")
  const stage = Number(field(formData, "stage"))

  if (!caseId) return { error: t("errors.invalidCase") }
  if (stage === 2) {
    return {
      error: t("errors.stage2ViaPublish"),
    }
  }
  if (stage !== 3) return { error: t("errors.invalidStage") }

  const supabase = createClient()

  const { data, error } = await supabase
    .from("case_links")
    .update({ status: "ativo", unlocked_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("stage", stage)
    .eq("status", "bloqueado")
    .select("id")

  if (error) {
    console.error("[cases] unlockStage failed:", error)
    return { error: t("errors.linkGenerateFailed") }
  }
  if (!data || data.length === 0) {
    return { error: t("errors.linkAlreadyGenerated") }
  }

  // Advance the case only when it is genuinely behind; never move it backwards.
  const behind: CaseStage[] = [
    "novo",
    "pedido_recebido",
    "proposta_enviada",
    "opcao_escolhida",
    "detalhes_pendentes",
    "detalhes_recebidos",
  ]

  await supabase
    .from("booking_cases")
    .update({ stage: "pagamento_pendente" })
    .eq("id", caseId)
    .in("stage", behind)

  revalidatePath("/admin")
  revalidatePath(`/admin/casos/${caseId}`)
  return { error: null }
}

/**
 * Record the fare the client agreed to and open the payment stage.
 *
 * The amount is entered by hand because the admin sources fares manually.
 * Stored in MINOR UNITS to match WeePay's `amount BIGINT` (manual §8.4), so
 * the adapter can pass it straight through without a rounding step.
 */
export async function createPayLink(
  formData: FormData
): Promise<CaseActionState> {
  const { t } = getI18n()
  const caseId = field(formData, "caseId")
  const rawAmount = field(formData, "amount").replace(",", ".")
  const currency = (field(formData, "currency") || "CVE").toUpperCase()
  const description = field(formData, "description")

  if (!caseId) return { error: t("errors.invalidCase") }

  const major = Number(rawAmount)
  if (!Number.isFinite(major) || major <= 0) {
    return { error: t("errors.invalidAmount") }
  }
  if (currency.length !== 3) return { error: t("errors.invalidCurrency") }

  const amount = Math.round(major * 100)

  const supabase = createClient()

  const { error } = await supabase.from("case_payments").insert({
    case_id: caseId,
    amount,
    currency,
    description: description || null,
    status: "STARTED",
    // Idempotency key shape follows the WeePay manual (§10.2); the adapter
    // will forward it so a retried initiate() never double-charges.
    idempotency_key: `case_${caseId}_${Date.now()}`,
  })

  if (error) {
    console.error("[cases] createPayLink failed:", error)
    return { error: t("errors.payRequestFailed") }
  }

  const unlock = new FormData()
  unlock.set("caseId", caseId)
  unlock.set("stage", "3")
  const unlocked = await unlockStage(unlock)

  // "Already generated" is fine here — the payment row is what matters.
  if (unlocked.error && !unlocked.error.includes("já tinha sido")) {
    return unlocked
  }

  revalidatePath("/admin")
  revalidatePath(`/admin/casos/${caseId}`)
  return { error: null }
}

/*
 * `markPaymentReceived` vivia aqui e foi removida na altura em que a máquina de
 * estados nasceu. Escrevia COMPLETED diretamente na tabela: não conhecia a
 * matriz de transições do manual (§8.1), não avisava o cliente, e permitia
 * marcar como pago um pagamento que a WeePay já tinha dado como FAILED. Quem a
 * substitui é `confirmPaymentReceived` em actions/payments.ts.
 */

/** Final step: tickets sent to the client (done by hand, outside the app). */
export async function markTicketsIssued(
  formData: FormData
): Promise<CaseActionState> {
  const { t } = getI18n()
  const caseId = field(formData, "caseId")
  if (!caseId) return { error: t("errors.invalidCase") }

  const supabase = createClient()
  const { error } = await supabase
    .from("booking_cases")
    .update({ stage: "emitido" })
    .eq("id", caseId)

  if (error) return { error: t("errors.caseUpdateFailed") }

  revalidatePath("/admin")
  revalidatePath(`/admin/casos/${caseId}`)
  return { error: null }
}

export async function cancelCase(formData: FormData): Promise<CaseActionState> {
  const { t } = getI18n()
  const caseId = field(formData, "caseId")
  if (!caseId) return { error: t("errors.invalidCase") }

  const supabase = createClient()
  const { error } = await supabase
    .from("booking_cases")
    .update({ stage: "cancelado" })
    .eq("id", caseId)

  if (error) return { error: t("errors.caseCancelFailed") }

  // Kill every outstanding link so the URLs stop working immediately.
  await supabase
    .from("case_links")
    .update({ status: "expirado" })
    .eq("case_id", caseId)
    .in("status", ["ativo", "bloqueado"])

  revalidatePath("/admin")
  revalidatePath(`/admin/casos/${caseId}`)
  return { error: null }
}
