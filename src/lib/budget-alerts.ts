/**
 * WeeFly · MVP 2 · PAR-05 · alertas de saldo.
 *
 * "Passar o limite envia um alerta por email e depois por WhatsApp. Repete-se
 * enquanto o saldo estiver abaixo do limite, no máximo uma vez por dia. Os
 * alertas ficam registados no ministério. Nenhum alerta sai em duplicado."
 *
 * O "uma vez por dia" e o "nenhum em duplicado" são a mesma coisa, e a base de
 * dados é que a garante: `budget_alerts` tem uma linha única por (ministério,
 * dia). Quem chegar em segundo — outro débito no mesmo dia, o cron a correr
 * duas vezes — não insere, e por isso não envia.
 *
 * Chamado depois de cada débito (PAR-07) e pelo cron diário
 * (`/api/b2g/alerts`), que é o que faz o alerta repetir-se.
 *
 * Os destinatários são os do ADM-06 (`alert_recipients`). Sem ninguém
 * configurado (decisão O1), o alerta fica registado e não sai para lado
 * nenhum — que é o comportamento honesto enquanto ninguém disser a quem.
 *
 * SÓ SERVIDOR.
 */

import { Resend } from "resend"

import { createAdminClient } from "@/utils/supabase/admin"
import { senderAddress } from "@/lib/notifications"
import { sendWhatsApp } from "@/lib/whatsapp"
import { formatAmount } from "@/lib/case-status"
import { escapeHtml } from "@/lib/emails/shared"
import { orgFromRow, ORG_COLUMNS, thresholdOf } from "@/lib/b2g"

/** O dia em Cabo Verde, que é onde o "uma vez por dia" se conta. */
function capeVerdeDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Cape_Verde" }).format(now)
}

export type AlertOutcome =
  | { sent: false; why: "no_threshold" | "above" | "already_today" | "unavailable" }
  | { sent: true; email: number; whatsapp: number }

export async function checkBudgetAlert(orgId: string): Promise<AlertOutcome> {
  const admin = createAdminClient()
  if (!admin) return { sent: false, why: "unavailable" }

  const { data: orgRow } = await admin.from("organisations").select(ORG_COLUMNS).eq("id", orgId).maybeSingle()
  if (!orgRow) return { sent: false, why: "unavailable" }
  const org = orgFromRow(orgRow as Record<string, any>)

  const { data: movRows } = await admin
    .from("budget_movements")
    .select("kind, delta, created_at")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false })
  const movements = ((movRows ?? []) as { kind: string; delta: number }[]).map((m) => ({
    ...m,
    delta: Number(m.delta),
  }))
  const balance = movements.reduce((sum, m) => sum + m.delta, 0)
  const threshold = thresholdOf(org, movements)

  if (threshold == null) return { sent: false, why: "no_threshold" }
  if (balance >= threshold) return { sent: false, why: "above" }

  const { data: recipientRows } = await admin
    .from("alert_recipients")
    .select("name, email, whatsapp, side, organisation_id")
    .eq("partner_id", org.partnerId)
    .eq("active", true)
  const recipients = ((recipientRows ?? []) as {
    name: string | null
    email: string | null
    whatsapp: string | null
    side: string
    organisation_id: string | null
  }[]).filter((r) => !r.organisation_id || r.organisation_id === org.id)

  /* A linha primeiro: é ela que decide se hoje já houve alerta. */
  const { data: inserted, error } = await admin
    .from("budget_alerts")
    .insert({
      organisation_id: org.id,
      partner_id: org.partnerId,
      alert_day: capeVerdeDay(),
      balance,
      threshold,
      recipients: recipients.map((r) => ({ name: r.name, email: r.email, whatsapp: r.whatsapp, side: r.side })),
    })
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "23505") return { sent: false, why: "already_today" }
    console.error("[b2g/alertas] registo falhou:", error.message)
    return { sent: false, why: "unavailable" }
  }
  const alertId = (inserted as { id: string } | null)?.id

  const amount = formatAmount(balance, org.currency)
  const limit = formatAmount(threshold, org.currency)
  const subject = `Saldo abaixo do limite · ${org.name}`
  const text = `O saldo da bolsa de ${org.name} está em ${amount}, abaixo do limite de ${limit}.`

  let emailSent = 0
  const emails = recipients.map((r) => r.email).filter((e): e is string => Boolean(e))
  if (emails.length && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: mailError } = await resend.emails.send({
      from: senderAddress(),
      to: emails,
      subject,
      text,
      html: `<p style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;">${escapeHtml(text)}</p>`,
    })
    if (mailError) console.error("[b2g/alertas] email:", mailError.message)
    else emailSent = emails.length
  }

  let whatsappSent = 0
  const phones = recipients.map((r) => r.whatsapp).filter((p): p is string => Boolean(p))
  if (phones.length) {
    const outcome = await sendWhatsApp({ to: phones, message: text })
    if (outcome.ok) whatsappSent = phones.length
  }

  if (alertId) {
    await admin.from("budget_alerts").update({ email_sent: emailSent, whatsapp_sent: whatsappSent }).eq("id", alertId)
  }

  return { sent: true, email: emailSent, whatsapp: whatsappSent }
}

/** O cron: todos os ministérios activos com limite definido. */
export async function checkAllBudgetAlerts(): Promise<{ checked: number; sent: number }> {
  const admin = createAdminClient()
  if (!admin) return { checked: 0, sent: 0 }
  const { data } = await admin
    .from("organisations")
    .select("id")
    .eq("active", true)
    .or("alert_threshold_amount.not.is.null,alert_threshold_percent.not.is.null")
  let sent = 0
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
  for (const id of ids) {
    const outcome = await checkBudgetAlert(id)
    if (outcome.sent) sent++
  }
  return { checked: ids.length, sent }
}
