/**
 * WeeFly · B2G v2 · B2G-23 · "A empresa recebe aviso da decisão."
 *
 * O master aprovou ou recusou um ministério pedido por uma empresa: vai um
 * email a quem o pediu. É da WeeFly (quem decide é o master), em português
 * — o back-office dos parceiros de Cabo Verde fala português.
 *
 * SÓ SERVIDOR.
 */

import { Resend } from "resend"

import { senderAddress } from "@/lib/notifications"
import { escapeHtml, masthead, BORDER, INK, MUTED } from "@/lib/emails/shared"

export async function sendMinistryRequestDecision(input: {
  to: string
  ministryName: string
  approved: boolean
  reason?: string | null
  slug?: string | null
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: "RESEND_API_KEY por configurar" }

  const subject = input.approved
    ? `Ministério aprovado · ${input.ministryName}`
    : `Ministério não aprovado · ${input.ministryName}`
  const lines = input.approved
    ? [
        `O ${input.ministryName} foi aprovado e já está no menu Ministérios${input.slug ? `, com o endereço /ministerios/${input.slug}` : ""}.`,
        "Crie agora as secretárias: cada uma recebe um link pessoal e um PIN.",
      ]
    : [
        `O pedido do ${input.ministryName} não foi aprovado.`,
        input.reason ? `Motivo: ${input.reason}` : "",
      ].filter(Boolean)

  const html = `<!DOCTYPE html><html lang="pt-PT"><head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F7F9;font-family:'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
      ${masthead(null)}
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;">${escapeHtml(subject)}</h1>
        ${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(l)}</p>`).join("")}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: senderAddress(),
    to: [input.to],
    subject,
    html,
    text: lines.join("\n"),
  })
  if (error) return { ok: false, reason: error.message ?? "falhou" }
  return { ok: true }
}
