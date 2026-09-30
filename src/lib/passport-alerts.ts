/**
 * WeeFly · MVP 2 · DAT-02 · o aviso de passaporte a expirar.
 *
 * "Alerta quando um passaporte guardado está a menos de seis meses de
 * expirar. Enviado à secretária do ministério. Assinalado também no
 * backoffice da Alô."
 *
 * Um email por ministério, com a lista dos viajantes que entraram na janela
 * dos seis meses desde o último aviso. Cada ficha é avisada uma vez por
 * validade (`expiry_alerted_for`, 0030): um passaporte renovado tem outra
 * validade e volta a poder ser avisado. No backoffice o aviso é a marca ⚠ na
 * lista das fichas, que não depende deste email ter saído.
 *
 * Corre no mesmo cron diário dos alertas de saldo (`/api/b2g/alerts`).
 *
 * SÓ SERVIDOR.
 */

import { Resend } from "resend"

import { createAdminClient } from "@/utils/supabase/admin"
import { senderAddress } from "@/lib/notifications"
import { clientBrandForPartner } from "@/lib/brand"
import { escapeHtml, masthead, BORDER, INK, MUTED } from "@/lib/emails/shared"

export async function checkPassportExpiries(): Promise<{ ministries: number; travellers: number; emailed: number }> {
  const admin = createAdminClient()
  const out = { ministries: 0, travellers: 0, emailed: 0 }
  if (!admin) return out

  const limit = new Date()
  limit.setMonth(limit.getMonth() + 6)
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await admin
    .from("ministry_travellers")
    .select("id, organisation_id, first_name, last_name, passport_number, passport_expiry, expiry_alerted_for")
    .not("passport_expiry", "is", null)
    .lt("passport_expiry", limit.toISOString().slice(0, 10))
    /* Um passaporte já expirado há mais de um ano não é um aviso, é uma ficha
       velha: fica marcada no backoffice e não enche o email. */
    .gte("passport_expiry", new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10))
    .limit(5000)
  if (error) {
    if (error.code !== "PGRST205") console.error("[dat-02] leitura:", error.message)
    return out
  }

  const due = ((data ?? []) as {
    id: string
    organisation_id: string
    first_name: string
    last_name: string
    passport_number: string | null
    passport_expiry: string
    expiry_alerted_for: string | null
  }[]).filter((r) => r.expiry_alerted_for !== r.passport_expiry)
  if (due.length === 0) return out

  const byOrg = new Map<string, typeof due>()
  for (const r of due) byOrg.set(r.organisation_id, [...(byOrg.get(r.organisation_id) ?? []), r])

  for (const [orgId, rows] of Array.from(byOrg.entries())) {
    const { data: orgRow } = await admin
      .from("organisations")
      .select("id, name, active, secretary_name, secretary_email, partner_id")
      .eq("id", orgId)
      .maybeSingle()
    const org = orgRow as {
      id: string
      name: string
      active: boolean
      secretary_name: string | null
      secretary_email: string | null
      partner_id: string
    } | null
    if (!org?.active) continue
    out.ministries += 1
    out.travellers += rows.length

    let sent = false
    if (org.secretary_email && process.env.RESEND_API_KEY) {
      sent = await sendExpiryEmail(org, rows, today)
      if (sent) out.emailed += 1
    }

    /* Enviado, ou sem secretária a quem enviar: fica registado na ficha. Um
       envio que falhou (ou sem Resend configurado) não se marca — tenta-se no
       cron de amanhã. A marca ⚠ do backoffice não depende de nada disto. */
    if (sent || !org.secretary_email) {
      for (const r of rows) {
        await admin
          .from("ministry_travellers")
          .update({ expiry_alerted_for: r.passport_expiry, expiry_alerted_at: sent ? new Date().toISOString() : null })
          .eq("id", r.id)
      }
    }
  }
  return out
}

async function sendExpiryEmail(
  org: { name: string; secretary_name: string | null; secretary_email: string | null; partner_id: string },
  rows: { first_name: string; last_name: string; passport_number: string | null; passport_expiry: string }[],
  today: string
): Promise<boolean> {
  const brand = await clientBrandForPartner(org.partner_id)
  const partnerBrand = brand.kind === "partner" ? brand : null
  const hello = org.secretary_name ? `Olá, ${org.secretary_name}.` : "Olá."
  const subject = `${org.name} · passaportes a expirar`
  const line = (r: (typeof rows)[number]) =>
    `${r.last_name.toUpperCase()}/${r.first_name.toUpperCase()} · ${r.passport_number ?? "—"} · ${
      r.passport_expiry < today ? "expirou a" : "válido até"
    } ${r.passport_expiry}`
  const intro =
    "Estes passaportes, guardados nas fichas do ministério, expiram em menos de seis meses. Muitos países e companhias pedem seis meses de validade depois do regresso: convém renovar antes da próxima viagem."

  const html = `<!DOCTYPE html><html lang="pt-PT"><head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F7F9;font-family:'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
      ${partnerBrand ? masthead(null, { background: partnerBrand.colorPrimary ?? undefined, brand: partnerBrand }) : masthead(null)}
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;">${escapeHtml(hello)}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(intro)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${rows
            .map((r) => `<tr><td style="padding:9px 0;border-top:1px solid ${BORDER};font-size:14px;font-family:'IBM Plex Mono',monospace;">${escapeHtml(line(r))}</td></tr>`)
            .join("")}
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px;font-size:12px;color:#98A1AE;">${escapeHtml(partnerBrand?.footerText ?? brand.name)}${partnerBrand?.poweredByWeefly ? " · Powered by WeeFly" : ""}</td></tr>
    </table>
  </td></tr></table>
</body></html>`

  const from = partnerBrand?.senderEmail
    ? `${(partnerBrand.senderName ?? partnerBrand.name).replace(/[<>"]/g, "")} <${partnerBrand.senderEmail}>`
    : senderAddress()

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from,
    to: [org.secretary_email!],
    subject,
    html,
    text: [hello, "", intro, "", ...rows.map(line)].join("\n"),
    ...(partnerBrand?.replyTo ? { replyTo: [partnerBrand.replyTo] } : {}),
  })
  if (error) {
    console.error("[dat-02] email:", error.message)
    return false
  }
  return true
}
