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
import { BORDER, EMBER_RED, INK, MUTED, SURFACE_ALT, escapeHtml, formatDate } from "./shared"
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
  clientPhone: string | null
  origin: string | null
  destination: string | null
  departDate: string | null
  paxLabel: string
  amount: number
  currency: string
  /** O canal de entrada. Decide para que back-office o aviso aponta. */
  intake: string
  agentSlug: string | null
  /** O prazo que passou a correr contra nós, quando há um. */
  reviewDeadline: string | null
  /** A língua em que o cliente falou connosco — ver `0008_lead_locale.sql`. */
  locale: Locale
}

/**
 * Para onde o aviso manda quem o lê.
 *
 * Um caso do Price Checker é tratado em /admin/price-checker, onde estão o
 * comprovativo e a caixa de confirmar. Mandar a equipa para /admin/casos era
 * mandá-la para o ecrã onde essas duas coisas não existem.
 */
function caseAdminLink(ctx: CaseContext): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")
  if (!base) return ""
  return ctx.intake === "price_checker"
    ? `${base}/admin/price-checker/${ctx.caseId}`
    : `${base}/admin/casos/${ctx.caseId}`
}

/** "2A · 1C · 1B" — a mesma abreviatura da coluna de passageiros da fila. */
function paxOf(trip: Record<string, unknown> | null): string {
  const n = (key: string) => Number(trip?.[key] ?? 0)
  const parts: string[] = [`${Math.max(1, n("adults"))}A`]
  if (n("children")) parts.push(`${n("children")}C`)
  const babies = n("infants_in_seat") + (n("infants_on_lap") || n("infants"))
  if (babies) parts.push(`${babies}B`)
  return parts.join(" · ")
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
      `id, token, trip_request:trip_requests (
         reference, origin, destination, depart_date, intake, agent_slug,
         adults, children, infants, infants_in_seat, infants_on_lap,
         lead:leads (full_name, email, phone_prefix, phone, locale)
       )`
    )
    .eq("id", caseId)
    .maybeSingle()

  if (!data) return null

  const { data: payment } = await admin
    .from("case_payments")
    .select("amount, currency, review_deadline_at")
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
    clientPhone: lead
      ? `${lead.phone_prefix ?? ""} ${lead.phone ?? ""}`.trim() || null
      : null,
    origin: (trip?.origin as string) ?? null,
    destination: (trip?.destination as string) ?? null,
    departDate: (trip?.depart_date as string) ?? null,
    paxLabel: paxOf(trip),
    amount: (payment as { amount: number } | null)?.amount ?? 0,
    currency: (payment as { currency: string } | null)?.currency ?? "CVE",
    intake: (trip?.intake as string) ?? "concierge",
    agentSlug: (trip?.agent_slug as string) ?? null,
    reviewDeadline:
      (payment as { review_deadline_at: string | null } | null)?.review_deadline_at ??
      null,
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
 * À equipa, quando o cliente cumpre a sua parte do pagamento.
 *
 * Duas notícias diferentes com o mesmo destinatário: `proof: true` quer dizer
 * que entrou um ficheiro para alguém abrir; `proof: false` que o cliente
 * declarou ter pago por um método sem comprovativo. A primeira tem um prazo a
 * correr contra nós e é isso que o assunto tem de dizer — um email que diz
 * apenas "cliente diz que pagou" não distingue as duas, e a diferença é quem
 * tem trabalho para fazer.
 *
 * Vai só para dentro: a declaração ainda não é confirmação, e o cliente não
 * deve receber nada que pareça um recibo antes de alguém ver o dinheiro.
 */
export async function sendPaymentDeclaredEmail(
  caseId: string,
  options: { proof?: boolean } = {}
): Promise<boolean> {
  const ctx = await context(caseId)
  if (!ctx) return false

  const withProof = options.proof === true
  const route =
    ctx.origin && ctx.destination ? `${ctx.origin} → ${ctx.destination}` : "—"
  const amount = formatAmount(ctx.amount, ctx.currency)
  const link = caseAdminLink(ctx)

  const deadline = ctx.reviewDeadline
    ? new Date(ctx.reviewDeadline).toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  const subject = withProof
    ? `Comprovativo por validar · ${ctx.clientName} · ${amount}`
    : `Cliente diz que pagou · ${ctx.clientName} · ${route}`

  const headline = withProof
    ? `${ctx.clientName} enviou o comprovativo de ${amount}`
    : `${ctx.clientName} declarou ter pago ${amount}`

  const explain = withProof
    ? `Abra o ficheiro, compare o valor com o extrato e marque a caixa de confirmação na ficha do caso. É essa caixa — e só ela — que avisa o cliente e liberta a emissão.${deadline ? ` O prazo de validação termina a ${deadline}; passado esse prazo o link fecha-se e o caso volta à fila.` : ""}`
    : "É uma declaração do cliente, não uma confirmação. Confirme a entrada do dinheiro e depois marque o pagamento como recebido na ficha do caso — é isso que avisa o cliente e liberta a emissão."

  const meta = [
    route,
    ctx.reference,
    ctx.paxLabel,
    ctx.clientPhone,
    ctx.clientEmail,
    ctx.agentSlug ? `agente ${ctx.agentSlug}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const html = shell(
    subject,
    `<p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:${EMBER_RED};">${withProof ? "Por validar" : "A confirmar"}</p>
     <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:${INK};">${escapeHtml(headline)}</h1>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(meta)}</p>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(explain)}</p>
     ${link ? `<a href="${link}" style="display:inline-block;background:${EMBER_RED};color:#ffffff;font-size:14px;font-weight:700;padding:13px 24px;border-radius:999px;text-decoration:none;">${withProof ? "Abrir o comprovativo" : "Abrir o caso"}</a>` : ""}`
  )

  const text = [
    headline + ".",
    meta,
    "",
    explain,
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

/**
 * À equipa, quando entra um pedido novo pelo Price Checker.
 *
 * Era o único acontecimento do fluxo que não avisava ninguém: o caso caía na
 * fila e ficava lá até alguém se lembrar de abrir o ecrã. O cronómetro do
 * serviço conta desde a submissão, não desde quando o vimos — por isso este
 * aviso é o que faz o cronómetro ser justo.
 */
export async function sendPcRequestReceivedEmail(caseId: string): Promise<boolean> {
  const ctx = await context(caseId)
  if (!ctx) return false

  const route =
    ctx.origin && ctx.destination ? `${ctx.origin} → ${ctx.destination}` : "—"
  const when = ctx.departDate ? formatDate(ctx.departDate) : "—"
  const link = caseAdminLink(ctx)
  const subject = `Pedido novo · ${route} · ${ctx.clientName}`

  const meta = [
    ctx.reference,
    ctx.paxLabel,
    `parte a ${when}`,
    ctx.currency,
    ctx.clientPhone,
    ctx.clientEmail,
    ctx.agentSlug ? `agente ${ctx.agentSlug}` : "sem agente",
  ]
    .filter(Boolean)
    .join(" · ")

  const html = shell(
    subject,
    `<p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:${EMBER_RED};">Por cotar</p>
     <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:${INK};">${escapeHtml(route)}</h1>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(meta)}</p>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">
       O cliente está à espera das opções no link dele. Reclame o caso para ele
       sair de "novos sem dono" e componha a proposta — enquanto não for
       publicada, o que ele vê é um ecrã a dizer que estamos a pesquisar.
     </p>
     ${link ? `<a href="${link}" style="display:inline-block;background:${EMBER_RED};color:#ffffff;font-size:14px;font-weight:700;padding:13px 24px;border-radius:999px;text-decoration:none;">Abrir o caso</a>` : ""}`
  )

  const text = [
    `Pedido novo: ${route}, ${ctx.clientName}.`,
    meta,
    "",
    "O cliente está à espera das opções no link dele.",
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
