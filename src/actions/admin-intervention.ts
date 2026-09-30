"use server"

/**
 * WeeFly · MVP 2 · ADM-04 · intervir num caso de um parceiro.
 *
 * "O Admin WeeFly vê os casos, ministérios e passagens de todos os parceiros.
 * Só leitura por defeito. Intervir exige uma ação explícita, que fica
 * registada. Nunca visível a contas de parceiros."
 *
 * A ação explícita é esta: um motivo escrito, e uma janela de quatro horas.
 * Fica registada duas vezes — na tabela das intervenções (só o Admin a lê) e
 * no histórico do próprio caso, que é onde o parceiro dá por ela.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createAdminClient } from "@/utils/supabase/admin"
import { getBoScope, liveIntervention } from "@/lib/bo-scope"
import { logCaseEvent } from "@/lib/case-events"
import { getBoI18n } from "@/i18n/bo-server"
import { translateMessage } from "@/i18n/translate"

const WINDOW_HOURS = 4

type Result = { ok: true } | { ok: false; error: string }

const startSchema = z.object({
  caseId: z.string().uuid(),
  reason: z.string().trim().min(3, "bo.adminCases.errors.reasonMissing").max(500),
})

export async function startIntervention(input: z.input<typeof startSchema>): Promise<Result> {
  const { t } = await getBoI18n()
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) return { ok: false, error: t("bo.adminCases.errors.notAllowed") }

  const parsed = startSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: translateMessage(t, parsed.error.issues[0]?.message ?? "bo.adminCases.errors.invalid") }
  }
  const { caseId, reason } = parsed.data

  /* O caso pela sessão: o RLS deixa o Admin WeeFly ver todos, e é a mesma
     pergunta que qualquer outra leitura faz. */
  const { data } = await scope.db.from("booking_cases").select("id, partner_id").eq("id", caseId).maybeSingle()
  const bookingCase = data as { id: string; partner_id: string } | null
  if (!bookingCase) return { ok: false, error: t("bo.adminCases.errors.notFound") }

  if (await liveIntervention(caseId)) return { ok: true }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.adminCases.errors.unavailable") }

  const expiresAt = new Date(Date.now() + WINDOW_HOURS * 3_600_000).toISOString()
  const { error } = await admin.from("admin_interventions").insert({
    case_id: caseId,
    partner_id: bookingCase.partner_id,
    user_id: scope.identity.userId,
    email: scope.identity.email,
    reason,
    expires_at: expiresAt,
  })
  if (error) {
    console.error("[adm-04] intervenção não registada:", error.message)
    return { ok: false, error: t("bo.adminCases.errors.unavailable") }
  }

  await logCaseEvent({
    caseId,
    kind: "admin_intervention",
    title: "Intervenção do Admin WeeFly",
    detail: `${scope.identity.email} · ${reason}`,
    actorId: scope.identity.userId,
    actorEmail: scope.identity.email,
    actorKind: "staff",
    payload: { reason, expiresAt },
  })

  revalidatePath(`/admin/price-checker/${caseId}`)
  revalidatePath(`/gestao/casos/c/${caseId}`)
  return { ok: true }
}

export async function endIntervention(caseId: string): Promise<Result> {
  const { t } = await getBoI18n()
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) return { ok: false, error: t("bo.adminCases.errors.notAllowed") }
  const live = await liveIntervention(String(caseId ?? ""))
  if (!live) return { ok: true }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("bo.adminCases.errors.unavailable") }
  await admin
    .from("admin_interventions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", live.id)
    .eq("user_id", scope.identity.userId)

  await logCaseEvent({
    caseId,
    kind: "admin_intervention_ended",
    title: "Intervenção do Admin WeeFly terminada",
    detail: scope.identity.email,
    actorId: scope.identity.userId,
    actorEmail: scope.identity.email,
    actorKind: "staff",
  })

  revalidatePath(`/admin/price-checker/${caseId}`)
  revalidatePath(`/gestao/casos/c/${caseId}`)
  return { ok: true }
}
