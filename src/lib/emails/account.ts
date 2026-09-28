/**
 * WeeFly Pro · PRO-09 · o email que diz à conta nova o que o Dominik decidiu.
 *
 * Não passa pelo `notify()`: esse regista tudo contra um caso
 * (`case_notifications.case_id`), e uma conta não é um caso. O rasto desta
 * decisão é a linha em `pro_account_decisions`; o que se devolve daqui é só se
 * o email saiu, para o ecrã do Admin o poder dizer.
 *
 * O remetente é o mesmo de tudo o resto (`senderAddress`), com a mesma defesa
 * contra o valor com dois endereços que devolveu os emails em setembro.
 *
 * SÓ SERVIDOR.
 */

import { Resend } from "resend"

import { senderAddress } from "@/lib/notifications"
import { getTranslator, localeForClient } from "@/i18n/server"
import { BORDER, INK, MUTED, escapeHtml, masthead } from "./shared"

export type AccountDecisionEmail =
  | { kind: "approved"; to: string; name: string; locale?: string | null; loginUrl: string }
  | {
      kind: "rejected"
      to: string
      name: string
      locale?: string | null
      reason: string
    }

export async function sendAccountDecisionEmail(
  input: AccountDecisionEmail
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, reason: "RESEND_API_KEY não está definida" }
  }

  const t = getTranslator(localeForClient(input.locale))
  const name = input.name || input.to

  const subject =
    input.kind === "approved" ? t("proEmail.approvedSubject") : t("proEmail.rejectedSubject")

  const paragraphs =
    input.kind === "approved"
      ? [t("proEmail.approvedBody")]
      : [t("proEmail.rejectedBody"), t("proEmail.rejectedReason", { reason: input.reason })]

  const cta =
    input.kind === "approved"
      ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-weight:600;border-radius:10px;padding:12px 20px;">${escapeHtml(t("proEmail.approvedCta"))}</a></p>`
      : ""

  const html = `<!doctype html><html><body style="margin:0;background:#F5F7F9;font-family:Arial,Helvetica,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
${masthead(null)}
<tr><td style="padding:28px;">
<p style="margin:0 0 16px;font-size:16px;">${escapeHtml(t("proEmail.greeting", { name }))}</p>
${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${escapeHtml(p)}</p>`).join("")}
${cta}
<p style="margin:28px 0 0;font-size:13px;color:${MUTED};">${escapeHtml(t("proEmail.signature"))}</p>
</td></tr></table></td></tr></table></body></html>`

  const text = [
    t("proEmail.greeting", { name }),
    "",
    ...paragraphs,
    ...(input.kind === "approved" ? ["", input.loginUrl] : []),
    "",
    t("proEmail.signature"),
  ].join("\n")

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: [input.to],
      subject,
      html,
      text,
    })
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}
