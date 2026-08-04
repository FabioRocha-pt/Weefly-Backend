"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/utils/supabase/server"
import { mintToken } from "@/lib/booking-cases"
import type { CaseStage } from "@/lib/case-status"

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
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Sessão expirada. Volte a entrar." }

  const { data, error } = await supabase
    .from("booking_cases")
    .insert({ token: mintToken(), created_by: user.id })
    .select("id, token")
    .single()

  if (error) {
    console.error("[cases] createCase failed:", error)
    return { error: "Não foi possível criar o link." }
  }

  /*
   * Belt and braces: migration 0004 makes the seed trigger open all three
   * stages, but a database that hasn't had it applied yet would still hand back
   * a case with stages 2 and 3 blocked — and a blocked stage is a dead end
   * while there is no email to announce an unlock. Once 0004 is in, this update
   * matches what the trigger already wrote and changes nothing.
   */
  const { error: unlockError } = await supabase
    .from("case_links")
    .update({ status: "ativo", unlocked_at: new Date().toISOString() })
    .eq("case_id", data.id)
    .eq("status", "bloqueado")

  if (unlockError) {
    console.error("[cases] opening stages failed:", unlockError)
  }

  revalidatePath("/admin")
  return { error: null, token: data.token }
}

/**
 * Unlock Link 2 or Link 3 for the client.
 *
 * This is the manual gate the whole flow hinges on: the admin only opens the
 * next stage once the off-platform step (fare search, client agreement) is
 * done. Stage 1 is never unlocked here — it is active from creation.
 */
export async function unlockStage(
  formData: FormData
): Promise<CaseActionState> {
  const caseId = field(formData, "caseId")
  const stage = Number(field(formData, "stage"))

  if (!caseId) return { error: "Caso inválido." }
  if (stage !== 2 && stage !== 3) return { error: "Etapa inválida." }

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
    return { error: "Não foi possível gerar o link." }
  }
  if (!data || data.length === 0) {
    return { error: "Este link já tinha sido gerado." }
  }

  // Advance the case only when it is genuinely behind; never move it backwards.
  const nextStage: CaseStage =
    stage === 2 ? "detalhes_pendentes" : "pagamento_pendente"
  const behind: CaseStage[] =
    stage === 2
      ? ["novo", "pedido_recebido"]
      : ["novo", "pedido_recebido", "detalhes_pendentes", "detalhes_recebidos"]

  await supabase
    .from("booking_cases")
    .update({ stage: nextStage })
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
  const caseId = field(formData, "caseId")
  const rawAmount = field(formData, "amount").replace(",", ".")
  const currency = (field(formData, "currency") || "CVE").toUpperCase()
  const description = field(formData, "description")

  if (!caseId) return { error: "Caso inválido." }

  const major = Number(rawAmount)
  if (!Number.isFinite(major) || major <= 0) {
    return { error: "Indique um valor válido." }
  }
  if (currency.length !== 3) return { error: "Moeda inválida." }

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
    return { error: "Não foi possível criar o pedido de pagamento." }
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

/** Mark an out-of-band payment (transfer, cash) as received. */
export async function markPaymentReceived(
  formData: FormData
): Promise<CaseActionState> {
  const paymentId = field(formData, "paymentId")
  const caseId = field(formData, "caseId")
  if (!paymentId || !caseId) return { error: "Pagamento inválido." }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Sessão expirada. Volte a entrar." }

  const { error } = await supabase
    .from("case_payments")
    .update({
      status: "COMPLETED",
      paid_at: new Date().toISOString(),
      marked_manually_by: user.id,
    })
    .eq("id", paymentId)

  if (error) {
    console.error("[cases] markPaymentReceived failed:", error)
    return { error: "Não foi possível registar o pagamento." }
  }

  await supabase.from("booking_cases").update({ stage: "pago" }).eq("id", caseId)
  await supabase
    .from("case_links")
    .update({ status: "submetido", submitted_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("stage", 3)

  revalidatePath("/admin")
  revalidatePath(`/admin/casos/${caseId}`)
  return { error: null }
}

/** Final step: tickets sent to the client (done by hand, outside the app). */
export async function markTicketsIssued(
  formData: FormData
): Promise<CaseActionState> {
  const caseId = field(formData, "caseId")
  if (!caseId) return { error: "Caso inválido." }

  const supabase = createClient()
  const { error } = await supabase
    .from("booking_cases")
    .update({ stage: "emitido" })
    .eq("id", caseId)

  if (error) return { error: "Não foi possível atualizar o caso." }

  revalidatePath("/admin")
  revalidatePath(`/admin/casos/${caseId}`)
  return { error: null }
}

export async function cancelCase(formData: FormData): Promise<CaseActionState> {
  const caseId = field(formData, "caseId")
  if (!caseId) return { error: "Caso inválido." }

  const supabase = createClient()
  const { error } = await supabase
    .from("booking_cases")
    .update({ stage: "cancelado" })
    .eq("id", caseId)

  if (error) return { error: "Não foi possível cancelar o caso." }

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
