/**
 * WeeFly Concierge — envio dos emails do pagamento.
 *
 * Ao contrário dos outros construtores desta pasta, este módulo não devolve
 * HTML: vai buscar o caso, monta a mensagem e envia. É onde vive o
 * conhecimento chato — quem recebe, de que endereço, e o que fazer quando não
 * há chave de API — para que as server actions não tenham de o repetir.
 *
 * Todos os envios são best-effort. Um email é um aviso sobre uma coisa que já
 * aconteceu; falhar não desfaz o pagamento nem a declaração.
 *
 * Idiomas: o aviso ao cliente sai na língua guardada no lead (ver a migração
 * 0008) — quem carrega no botão é o agente, e a língua dele não diz nada sobre
 * a de quem vai ler. O aviso à equipa vai sempre em português, porque quem o lê
 * está em Cabo Verde.
 *
 * SÓ SERVIDOR.
 */

import { Resend } from "resend"

import { createAdminClient } from "@/utils/supabase/admin"
import { formatAmount } from "@/lib/case-status"
import { BORDER, EMBER_RED, INK, MUTED, SURFACE_ALT, escapeHtml } from "./shared"
import { DEFAULT_LOCALE, LOCALE_TAGS, type Locale } from "@/i18n/config"
import { getTranslator, localeForClient } from "@/i18n/server"

const FROM =
  process.env.CONCIERGE_FROM_EMAIL ??
  "WeeFly Concierge <onboarding@resend.dev>"

const TEAM_FALLBACK = ["info@weefly.africa", "info@weefly.cv"]

function team(): string[] {
  const configured = (process.env.CONCIERGE_TEAM_EMAIL ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
  return configured.length > 0 ? configured : TEAM_FALLBACK
}

interface CaseContext {
  caseId: string
  token: string
  reference: string | null
  clientName: string
  clientEmail: string | null
  origin: string | null
  destination: string | null
  amount: number
  currency: string
  /** A língua em que o cliente falou connosco — ver `0008_lead_locale.sql`. */
  locale: Locale
}

function unwrap(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] ?? null) as Record<string, unknown> | null
  return (value ?? null) as Record<string, unknown> | null
}

async function context(caseId: string): Promise<CaseContext | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data } = await admin
    .from("booking_cases")
    .select(
      "id, token, trip_request:trip_requests (reference, origin, destination, lead:leads (full_name, email, locale))"
    )
    .eq("id", caseId)
    .maybeSingle()

  if (!data) return null

  const { data: payment } = await admin
    .from("case_payments")
    .select("amount, currency")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const trip = unwrap((data as Record<string, unknown>).trip_request)
  const lead = unwrap(trip?.lead)

  return {
    caseId,
    token: (data as { token: string }).token,
    reference: (trip?.reference as string) ?? null,
    clientName: (lead?.full_name as string) ?? "cliente",
    clientEmail: (lead?.email as string) ?? null,
    origin: (trip?.origin as string) ?? null,
    destination: (trip?.destination as string) ?? null,
    amount: (payment as { amount: number } | null)?.amount ?? 0,
    currency: (payment as { currency: string } | null)?.currency ?? "CVE",
    locale: localeForClient(lead?.locale as string | null),
  }
}

function shell(title: string, body: string, locale: Locale = DEFAULT_LOCALE): string {
  return `<!DOCTYPE html>
<html lang="${LOCALE_TAGS[locale]}">
<head><meta charset="utf-8" /><meta name="color-scheme" content="light only" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${SURFACE_ALT};font-family:'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
        <tr><td style="background:${EMBER_RED};padding:28px 32px;">
          <span style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">WeeFly</span>
          <span style="font-size:12px;font-weight:700;color:#ffffff;opacity:0.85;margin-left:8px;text-transform:uppercase;letter-spacing:0.08em;">Concierge</span>
        </td></tr>
        <tr><td style="padding:36px 32px;">${body}</td></tr>
        <tr><td style="padding:0 32px 32px;">
          <hr style="border:none;border-top:1px solid ${BORDER};margin:0 0 16px;" />
          <p style="margin:0;font-size:12px;color:#98A1AE;">© ${new Date().getFullYear()} WeeFly Africa · Praia, Cabo Verde</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function send(options: {
  to: string | string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[emails] RESEND_API_KEY não definida — %s não saiu.", options.subject)
    return false
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  })
  if (error) {
    console.error("[emails] %s falhou:", options.subject, error)
    return false
  }
  return true
}

/** Ao cliente, quando o pagamento fica confirmado. */
export async function sendPaymentConfirmedEmail(caseId: string): Promise<boolean> {
  const ctx = await context(caseId)
  if (!ctx?.clientEmail) return false

  const { locale } = ctx
  const t = getTranslator(locale)
  const route =
    ctx.origin && ctx.destination ? `${ctx.origin} → ${ctx.destination}` : null
  const amount = formatAmount(ctx.amount, ctx.currency)
  const subject = route
    ? t("email.paidSubjectRoute", { route })
    : t("email.paidSubject")

  const html = shell(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">${escapeHtml(t("email.paidHeading"))}</h1>
     ${route ? `<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${EMBER_RED};">${escapeHtml(route)}${ctx.reference ? ` · ${escapeHtml(ctx.reference)}` : ""}</p>` : ""}
     <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">
       ${t("email.paidBody", {
         name: `<strong style="color:${INK};">${escapeHtml(ctx.clientName)}</strong>`,
         amount: `<strong style="color:${INK};">${escapeHtml(amount)}</strong>`,
       })}
     </p>
     <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${MUTED};">
       ${escapeHtml(t("email.paidNext"))}
     </p>`,
    locale
  )

  const text = [
    t("email.paidTextHello", { name: ctx.clientName }),
    "",
    t("email.paidTextConfirmed", { amount }),
    route
      ? t("email.paidTextTrip", {
          route: `${route}${ctx.reference ? ` (${ctx.reference})` : ""}`,
        })
      : "",
    "",
    t("email.paidTextNext"),
    "© WeeFly Africa",
  ]
    .filter(Boolean)
    .join("\n")

  return send({
    to: ctx.clientEmail,
    subject,
    html,
    text,
    replyTo: team()[0],
  })
}

/**
 * À equipa, quando o cliente diz que já pagou.
 *
 * É o aviso que substitui o telefonema. Vai só para dentro, porque a
 * declaração ainda não é confirmação — o cliente não deve receber nada que
 * pareça um recibo antes de alguém ver o dinheiro.
 */
export async function sendPaymentDeclaredEmail(caseId: string): Promise<boolean> {
  const ctx = await context(caseId)
  if (!ctx) return false

  const route =
    ctx.origin && ctx.destination ? `${ctx.origin} → ${ctx.destination}` : "—"
  const amount = formatAmount(ctx.amount, ctx.currency)
  const subject = `Cliente diz que pagou · ${ctx.clientName} · ${route}`
  const link = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/admin/casos/${ctx.caseId}`

  const html = shell(
    subject,
    `<p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:${EMBER_RED};">A confirmar</p>
     <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:${INK};">${escapeHtml(ctx.clientName)} declarou ter pago ${escapeHtml(amount)}</h1>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">
       ${escapeHtml(route)}${ctx.reference ? ` · ${escapeHtml(ctx.reference)}` : ""}${ctx.clientEmail ? ` · ${escapeHtml(ctx.clientEmail)}` : ""}
     </p>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">
       É uma declaração do cliente, não uma confirmação. Confirme a entrada do
       dinheiro e depois marque o pagamento como recebido na ficha do caso —
       é isso que avisa o cliente e liberta a emissão.
     </p>
     ${link ? `<a href="${link}" style="display:inline-block;background:${EMBER_RED};color:#ffffff;font-size:14px;font-weight:700;padding:13px 24px;border-radius:999px;text-decoration:none;">Abrir o caso</a>` : ""}`
  )

  const text = [
    `${ctx.clientName} declarou ter pago ${amount}.`,
    `${route}${ctx.reference ? ` · ${ctx.reference}` : ""}${ctx.clientEmail ? ` · ${ctx.clientEmail}` : ""}`,
    "",
    "É uma declaração, não uma confirmação. Confirme a entrada do dinheiro e marque como recebido na ficha do caso.",
    link ? `\n${link}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  return send({
    to: team(),
    subject,
    html,
    text,
    ...(ctx.clientEmail ? { replyTo: ctx.clientEmail } : {}),
  })
}
