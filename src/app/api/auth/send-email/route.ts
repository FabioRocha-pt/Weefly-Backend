import { createHmac, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { Resend } from "resend"

import { createAdminClient } from "@/utils/supabase/admin"
import { senderAddress } from "@/lib/notifications"
import { safeNextPath } from "@/lib/safe-next"
import { siteUrl } from "@/lib/site-url"
import { BORDER, INK, MUTED, escapeHtml, masthead } from "@/lib/emails/shared"
import { getTranslator, localeForClient } from "@/i18n/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PRO-08 · o hook "Send Email" do Supabase Auth.
 *
 * Com o hook ligado (Supabase → Authentication → Hooks → Send Email → HTTPS,
 * apontado para `https://<domínio>/api/auth/send-email`), o GoTrue deixa de
 * enviar os emails de conta e chama esta rota. Daqui saem pelo Resend, com o
 * mesmo remetente único dos outros emails (`senderAddress`), e ficam em
 * `auth_email_log` com o estado de entrega que o webhook do Resend vai
 * actualizando.
 *
 * O link aponta para `/auth/callback?token_hash=…&type=…`, que funciona em
 * qualquer dispositivo — registar no portátil e abrir o email no telemóvel
 * deixou de cair no `/link-invalido` (ver `auth/callback/route.ts`).
 *
 * Responder com erro faz o Supabase devolver erro ao `signUp`/`resend`, e o
 * formulário mostra-o: é o "se falhar, o utilizador vê uma mensagem" do
 * critério, em vez de um "enviámos" que não era verdade.
 *
 * Variável: `SEND_EMAIL_HOOK_SECRET`, o segredo que o Supabase mostra ao criar
 * o hook (`v1,whsec_…`).
 */

interface HookPayload {
  user: {
    id: string
    email: string
    new_email?: string
    user_metadata?: Record<string, unknown>
  }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: string
    site_url: string
    token_new?: string
    token_hash_new?: string
  }
}

/** Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature`. */
function verify(secret: string, headers: Headers, payload: string): boolean {
  const id = headers.get("webhook-id")
  const timestamp = headers.get("webhook-timestamp")
  const signature = headers.get("webhook-signature")
  if (!id || !timestamp || !signature) return false

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64")
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest()

  return signature
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .some((part) => {
      const given = Buffer.from(part.slice(3), "base64")
      return given.length === expected.length && timingSafeEqual(given, expected)
    })
}

function hookError(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status })
}

/** As acções com texto próprio. As outras usam o genérico, com o código. */
const KNOWN = ["signup", "recovery", "magiclink", "invite", "email_change"] as const
type Known = (typeof KNOWN)[number]

function siteOrigin(payload: HookPayload): string {
  const configured = siteUrl()
  if (configured) return configured
  try {
    return new URL(payload.email_data.redirect_to || payload.email_data.site_url).origin
  } catch {
    return payload.email_data.site_url.replace(/\/$/, "")
  }
}

/** O `next` que a acção pediu (`/nova-password` na recuperação), se for local. */
function nextFrom(redirectTo: string): string | null {
  try {
    return safeNextPath(new URL(redirectTo).searchParams.get("next"))
  } catch {
    return null
  }
}

function actionLink(origin: string, tokenHash: string, type: string, redirectTo: string): string {
  const url = new URL(`${origin}/auth/callback`)
  url.searchParams.set("token_hash", tokenHash)
  url.searchParams.set("type", type)
  const next = nextFrom(redirectTo)
  if (next) url.searchParams.set("next", next)
  return url.toString()
}

function render(
  kind: Known | "other",
  input: { name: string; link: string; code: string; locale: string | null }
) {
  const t = getTranslator(localeForClient(input.locale))
  const k = `authEmail.${kind}`
  const subject = t(`${k}.subject`)
  const body = t(`${k}.body`)
  const cta = t(`${k}.cta`)
  const greeting = input.name ? t("authEmail.greeting", { name: input.name }) : t("authEmail.greetingAnon")

  const html = `<!doctype html><html><body style="margin:0;background:#F5F7F9;font-family:Arial,Helvetica,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
${masthead(null)}
<tr><td style="padding:28px;">
<p style="margin:0 0 16px;font-size:16px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.55;">${escapeHtml(body)}</p>
<p style="margin:0 0 22px;"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-weight:600;border-radius:10px;padding:12px 20px;">${escapeHtml(cta)}</a></p>
<p style="margin:0 0 6px;font-size:13px;color:${MUTED};">${escapeHtml(t("authEmail.code", { code: input.code }))}</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all;">${escapeHtml(t("authEmail.linkNote"))}<br/><a href="${escapeHtml(input.link)}" style="color:${MUTED};">${escapeHtml(input.link)}</a></p>
<p style="margin:24px 0 0;font-size:12px;color:${MUTED};">${escapeHtml(t("authEmail.ignore"))}</p>
</td></tr></table></td></tr></table></body></html>`

  const text = [
    greeting,
    "",
    body,
    "",
    input.link,
    "",
    t("authEmail.code", { code: input.code }),
    t("authEmail.ignore"),
  ].join("\n")

  return { subject, html, text }
}

export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET
  if (!secret) {
    console.error("[auth/send-email] SEND_EMAIL_HOOK_SECRET não definida.")
    return hookError(503, "Email hook not configured")
  }

  const raw = await request.text()
  if (!verify(secret, request.headers, raw)) return hookError(401, "Bad signature")

  let payload: HookPayload
  try {
    payload = JSON.parse(raw)
  } catch {
    return hookError(400, "Bad payload")
  }

  const { user, email_data: data } = payload
  const meta = user.user_metadata ?? {}
  const name = [meta.first_name, meta.last_name].filter((v) => typeof v === "string" && v).join(" ")
  const locale = typeof meta.locale === "string" ? meta.locale : null
  const origin = siteOrigin(payload)
  const action = data.email_action_type
  const kind: Known | "other" = (KNOWN as readonly string[]).includes(action)
    ? (action as Known)
    : "other"

  /* Mudança de email: com a "secure email change" do Supabase vão dois emails,
     um para o endereço novo (token_hash_new) e outro para o actual. */
  const sends: { to: string; tokenHash: string; code: string }[] =
    action === "email_change"
      ? [
          ...(data.token_hash_new && user.new_email
            ? [{ to: user.new_email, tokenHash: data.token_hash_new, code: data.token_new ?? "" }]
            : []),
          ...(data.token_hash ? [{ to: user.email, tokenHash: data.token_hash, code: data.token }] : []),
        ]
      : [{ to: user.email, tokenHash: data.token_hash, code: data.token }]

  if (!process.env.RESEND_API_KEY) return hookError(503, "Email provider not configured")

  const admin = createAdminClient()
  const resend = new Resend(process.env.RESEND_API_KEY)

  for (const send of sends) {
    const link = actionLink(origin, send.tokenHash, action, data.redirect_to)
    const email = render(kind, { name, link, code: send.code, locale })

    const { data: logRow } = admin
      ? await admin
          .from("auth_email_log")
          .insert({ user_id: user.id, email: send.to, action_type: action })
          .select("id")
          .single()
      : { data: null }
    const logId = (logRow as { id: string } | null)?.id ?? null

    const { data: sent, error } = await resend.emails.send({
      from: senderAddress(),
      to: [send.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    if (admin && logId) {
      await admin
        .from("auth_email_log")
        .update(
          error
            ? { status: "failed", last_error: error.message.slice(0, 500), failed_at: new Date().toISOString() }
            : { status: "sent", provider_message_id: sent?.id ?? null, sent_at: new Date().toISOString() }
        )
        .eq("id", logId)
    }

    if (error) {
      console.error("[auth/send-email] falhou:", action, send.to, error.message)
      return hookError(502, "Error sending confirmation email")
    }
  }

  return NextResponse.json({})
}
