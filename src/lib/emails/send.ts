/**
 * WeeFly Concierge — tudo o que o caso diz a alguém.
 *
 * Um sítio só, e é essa a mudança do Sprint 2. Antes havia dois: este ficheiro
 * para os avisos do pagamento e um bloco dentro de `actions/proposals.ts` para
 * os da publicação — cada um com o seu `resend.emails.send()` e nenhum dos dois
 * a deixar rasto. Um email saía e ninguém ficava a saber se chegara.
 *
 * Agora nada sai daqui sem passar por `notify()` (ver `lib/notifications.ts`),
 * que regista antes de enviar, repete quando vale a pena, marca o caso quando
 * desiste e sabe recusar o segundo aviso do mesmo acontecimento.
 *
 * Idiomas: o aviso ao cliente sai na língua guardada no lead (migração 0008) —
 * quem carrega no botão é o agente, e a língua dele não diz nada sobre a de
 * quem vai ler. O aviso à equipa vai sempre em português, porque quem o lê está
 * em Cabo Verde.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { formatAmount } from "@/lib/case-status"
import {
  notify,
  teamRecipients,
  type NotifyAttachment,
  type NotifyOutcome,
} from "@/lib/notifications"
import { whatsappTeamNumber } from "@/lib/whatsapp"
import { toE164 } from "@/lib/countries"
import {
  BORDER,
  EMBER_RED,
  INK,
  MUTED,
  SURFACE_ALT,
  escapeHtml,
  formatDate,
  masthead,
  summaryRow,
} from "./shared"
import { DEFAULT_LOCALE, LOCALE_TAGS, type Locale } from "@/i18n/config"
import { getTranslator, localeForClient } from "@/i18n/server"

/** Quanto tempo prometemos para responder a um pedido novo (NT-01). */
export const RESPONSE_HOURS = 2

interface CaseContext {
  caseId: string
  token: string
  reference: string | null
  clientName: string
  clientFirstName: string
  clientEmail: string | null
  clientPhone: string | null
  /** E.164 sem espaços — é o que o WhatsApp pede. */
  clientWhatsApp: string | null
  origin: string | null
  destination: string | null
  departDate: string | null
  returnDate: string | null
  tripType: string
  cabinClass: string
  paxLabel: string
  adults: number
  children: number
  infants: number
  /** FE-05 · o texto livre do ecrã de revisão. */
  specialRequests: string | null
  amount: number
  currency: string
  /** O canal de entrada. Decide para que back-office o aviso aponta. */
  intake: string
  agentSlug: string | null
  /** BO-14 · o vendedor do caso, quando já foi atribuído. */
  sellerEmail: string | null
  sellerLabel: string | null
  /** Quem reclamou o caso, que é o outro nome para o dono. */
  ownerEmail: string | null
  /** O prazo que passou a correr contra nós, quando há um. */
  reviewDeadline: string | null
  pnr: string | null
  /** A língua em que o cliente falou connosco — ver `0008_lead_locale.sql`. */
  locale: Locale
}

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")

/**
 * Para onde o aviso manda quem o lê.
 *
 * Um caso do Price Checker é tratado em /admin/price-checker, onde estão o
 * comprovativo e a caixa de confirmar. Mandar a equipa para /admin/casos era
 * mandá-la para o ecrã onde essas duas coisas não existem.
 */
function caseAdminLink(ctx: CaseContext): string {
  const base = site()
  if (!base) return ""
  return ctx.intake === "price_checker"
    ? `${base}/admin/price-checker/${ctx.caseId}`
    : `${base}/admin/casos/${ctx.caseId}`
}

/**
 * NT-03 · o link 2, o endereço único deste caso.
 *
 * `/pc/{token}`, com um token de 192 bits vindo de um CSPRNG (ver `mintToken`).
 * Sem nome, sem referência, sem nada sequencial — é a regra do LNK-08, e é a
 * mesma porta por onde o cliente vê a proposta, preenche os passaportes e
 * descarrega o bilhete.
 */
function clientLink(ctx: CaseContext): string {
  const base = site()
  return base ? `${base}/pc/${ctx.token}` : ""
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
      `id, token, pnr, created_by, seller_email, seller_label,
       trip_request:trip_requests (
         reference, origin, destination, depart_date, return_date, intake,
         agent_slug, trip_type, cabin_class, special_requests,
         adults, children, infants, infants_in_seat, infants_on_lap,
         lead:leads (full_name, email, phone_prefix, phone, phone_e164, locale)
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

  const row = data as Record<string, unknown>
  const trip = unwrap(row.trip_request)
  const lead = unwrap(trip?.lead)

  const fullName = (lead?.full_name as string) ?? "cliente"
  /*
   * C-03b · o número de WhatsApp, calculado quando a coluna está vazia.
   *
   * `phone_e164` só existe nos leads gravados depois de o campo ter sido
   * acrescentado: **metade dos que estão na base tem-no a nulo**, com o
   * indicativo e o número guardados em separado e perfeitamente utilizáveis
   * (`+238` + `9592388`). Sem este recurso, o aviso de WhatsApp desses casos
   * sai `skipped · sem destinatário` — e é isso que o registo mostra hoje.
   *
   * Importa mais do que parece: o C-03b lê-se como "faltam as chaves", e com as
   * chaves postas metade dos clientes continuaria sem receber nada. A causa
   * seria procurada na Meta, onde não está.
   *
   * `toE164` é a mesma função que grava a coluna na entrada (ver `actions/pc`),
   * pelo que o número calculado aqui é igual ao que teria sido gravado.
   */
  const e164 =
    (lead?.phone_e164 as string | null) ??
    toE164(
      (lead?.phone_prefix as string | null) ?? "",
      (lead?.phone as string | null) ?? ""
    )

  /* O dono do caso, para o NT-05. O email fica em `auth.users` e não na linha do
     caso; uma leitura a mais só quando há alguém a quem escrever. */
  let ownerEmail: string | null = null
  const ownerId = row.created_by as string | null
  if (ownerId) {
    const { data: owner } = await admin.auth.admin.getUserById(ownerId)
    ownerEmail = owner?.user?.email ?? null
  }

  return {
    caseId,
    token: row.token as string,
    reference: (trip?.reference as string) ?? null,
    clientName: fullName,
    clientFirstName: fullName.split(/\s+/)[0] ?? fullName,
    clientEmail: (lead?.email as string) ?? null,
    clientPhone: lead
      ? `${lead.phone_prefix ?? ""} ${lead.phone ?? ""}`.trim() || null
      : null,
    clientWhatsApp: e164,
    origin: (trip?.origin as string) ?? null,
    destination: (trip?.destination as string) ?? null,
    departDate: (trip?.depart_date as string) ?? null,
    returnDate: (trip?.return_date as string | null) ?? null,
    tripType: (trip?.trip_type as string) ?? "round_trip",
    cabinClass: (trip?.cabin_class as string) ?? "economy",
    paxLabel: paxOf(trip),
    adults: Number(trip?.adults ?? 1),
    children: Number(trip?.children ?? 0),
    infants:
      Number(trip?.infants_in_seat ?? 0) +
      Number(trip?.infants_on_lap ?? trip?.infants ?? 0),
    specialRequests: (trip?.special_requests as string | null) ?? null,
    amount: (payment as { amount: number } | null)?.amount ?? 0,
    currency: (payment as { currency: string } | null)?.currency ?? "CVE",
    intake: (trip?.intake as string) ?? "concierge",
    agentSlug: (trip?.agent_slug as string) ?? null,
    sellerEmail: (row.seller_email as string | null) ?? null,
    sellerLabel: (row.seller_label as string | null) ?? null,
    ownerEmail,
    reviewDeadline:
      (payment as { review_deadline_at: string | null } | null)?.review_deadline_at ??
      null,
    pnr: (row.pnr as string | null) ?? null,
    locale: localeForClient(lead?.locale as string | null),
  }
}

/**
 * A moldura de todos os emails.
 *
 * T-14 e T-15 · a faixa laranja passa a levar o logótipo da marca à esquerda e
 * **a referência do caso à direita**, em monospace. Era uma palavra escrita à
 * mão com uma etiqueta "Concierge" ao lado, e a referência aparecia — quando
 * aparecia — no meio de uma linha de metadados a meio do corpo. Num telemóvel
 * isso é procurar; e a referência é a única coisa que o cliente cita ao
 * telefone.
 *
 * O `reference` é o quarto argumento e não o segundo por uma razão prática: os
 * emails à equipa não têm língua nem referência do cliente, e obrigá-los a
 * passar `null` em todos os sítios seria ruído. Quem não o passa fica com a
 * faixa só com o logótipo, que é o que estes tinham antes.
 */
function shell(
  title: string,
  body: string,
  locale: Locale = DEFAULT_LOCALE,
  reference: string | null = null
): string {
  return `<!DOCTYPE html>
<html lang="${LOCALE_TAGS[locale]}">
<head><meta charset="utf-8" /><meta name="color-scheme" content="light only" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${SURFACE_ALT};font-family:'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
        ${masthead(reference)}
        <tr><td style="padding:32px;">${body}</td></tr>
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

/** O botão laranja, sempre igual. Devolve string vazia sem link, não um botão morto. */
function cta(href: string, label: string): string {
  return href
    ? `<a href="${href}" style="display:inline-block;background:${EMBER_RED};color:#ffffff;font-size:14px;font-weight:700;padding:13px 24px;border-radius:999px;text-decoration:none;">${escapeHtml(label)}</a>`
    : ""
}

const routeOf = (ctx: CaseContext, fallback = "—") =>
  ctx.origin && ctx.destination ? `${ctx.origin} → ${ctx.destination}` : fallback

// ═══ NT-01 · pedido submetido, ao cliente ════════════════════════════════════

/**
 * O primeiro email do ciclo, e o que não existia.
 *
 * O Price Checker avisava a equipa de um pedido novo e não dizia nada a quem o
 * fez. Quem submetia ficava com um ecrã e nenhuma prova de que alguém tinha
 * recebido alguma coisa — nem sequer a referência para citar num telefonema.
 *
 * Leva a referência, o resumo do que foi pedido e o prazo de resposta. O prazo
 * é uma promessa e por isso está numa constante, não numa frase escrita à mão
 * em três dicionários: mudá-la é mudar um número.
 */
export async function sendRequestReceivedEmail(
  caseId: string
): Promise<NotifyOutcome> {
  const ctx = await context(caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const { locale } = ctx
  const t = getTranslator(locale)
  const route = routeOf(ctx)
  const link = clientLink(ctx)
  const subject = t("email.receivedSubject", { route })

  const dates =
    ctx.returnDate && ctx.tripType === "round_trip"
      ? `${formatDate(ctx.departDate ?? undefined)} — ${formatDate(ctx.returnDate)}`
      : formatDate(ctx.departDate ?? undefined)

  const passengers = [
    t("common.adults", { count: ctx.adults }),
    ctx.children > 0 ? t("common.children", { count: ctx.children }) : "",
    ctx.infants > 0 ? t("common.infants", { count: ctx.infants }) : "",
  ]
    .filter(Boolean)
    .join(" · ")

  const rows = [
    ctx.reference
      ? summaryRow(t("email.rowReference"), escapeHtml(ctx.reference))
      : "",
    summaryRow(t("email.rowRoute"), escapeHtml(route)),
    summaryRow(t("email.rowDates"), escapeHtml(dates)),
    summaryRow(t("email.rowPassengers"), escapeHtml(passengers)),
    summaryRow(t("email.rowCabin"), t(`cabins.${ctx.cabinClass}`)),
    ctx.specialRequests
      ? summaryRow(
          t("email.rowSpecial"),
          escapeHtml(ctx.specialRequests.slice(0, 300))
        )
      : "",
  ]
    .filter(Boolean)
    .join("")

  const html = shell(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">${escapeHtml(t("email.receivedHeading"))}</h1>
     <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">
       ${t("email.receivedBody", {
         name: `<strong style="color:${INK};">${escapeHtml(ctx.clientFirstName)}</strong>`,
         hours: RESPONSE_HOURS,
       })}
     </p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:12px;padding:4px 20px;margin-bottom:22px;">
       ${rows}
     </table>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">
       ${escapeHtml(t("email.receivedNext"))}
     </p>
     ${cta(link, t("email.receivedCta"))}`,
    locale,
    ctx.reference
  )

  const text = [
    t("email.receivedTextHello", { name: ctx.clientFirstName }),
    "",
    t("email.receivedTextIntro", { hours: RESPONSE_HOURS }),
    ctx.reference ? `${t("email.rowReference")}: ${ctx.reference}` : "",
    `${t("email.rowRoute")}: ${route}`,
    `${t("email.rowDates")}: ${dates}`,
    `${t("email.rowPassengers")}: ${passengers}`,
    "",
    link,
    "© WeeFly Africa",
  ]
    .filter(Boolean)
    .join("\n")

  return notify({
    caseId,
    channel: "email",
    kind: "request_received",
    audience: "client",
    to: ctx.clientEmail,
    locale,
    subject,
    html,
    text,
    replyTo: teamRecipients(),
    dedupeKey: "request_received",
  })
}

// ═══ NT-02 · pedido novo, à WeeFly ═══════════════════════════════════════════

/**
 * O alerta interno, por email **e** por WhatsApp.
 *
 * Duas notícias na mesma frase: entrou um pedido, e ele tem ou não tem dono. A
 * segunda é a que decide se alguém tem de o reclamar já — um pedido sem
 * vendedor atribuído não é de ninguém, e um pedido de ninguém fica na fila até
 * expirar. Por isso está escrito à letra e não escondido num campo vazio.
 *
 * O WhatsApp falha sem consequência para o email: são dois envios registados
 * em separado, e o do email não espera pelo outro.
 */
export async function sendNewRequestAlert(caseId: string): Promise<NotifyOutcome> {
  const ctx = await context(caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const route = routeOf(ctx)
  const when = ctx.departDate ? formatDate(ctx.departDate) : "—"
  const link = caseAdminLink(ctx)
  const seller = ctx.sellerLabel ?? ctx.sellerEmail ?? ctx.ownerEmail

  /* A frase que o backlog pede à letra: "se o pedido chegou sem vendedor
     atribuído, o alerta di-lo explicitamente". */
  const ownership = seller
    ? `vendedor ${seller}`
    : ctx.agentSlug
      ? `sem vendedor atribuído · link de ${ctx.agentSlug}`
      : "SEM VENDEDOR ATRIBUÍDO — ninguém está a tratar deste pedido"

  const subject = `Pedido novo · ${route} · ${ctx.clientName}${seller ? "" : " · sem vendedor"}`

  const meta = [
    ctx.reference,
    ctx.paxLabel,
    `parte a ${when}`,
    ctx.currency,
    ctx.clientPhone,
    ctx.clientEmail,
    ctx.intake === "price_checker" ? "entrada: link" : `entrada: ${ctx.intake}`,
    ownership,
  ]
    .filter(Boolean)
    .join(" · ")

  const html = shell(
    subject,
    `<p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:${EMBER_RED};">Por cotar</p>
     <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:${INK};">${escapeHtml(route)}</h1>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(meta)}</p>
     ${
       ctx.specialRequests
         ? `<p style="margin:0 0 20px;padding:12px 14px;border-left:3px solid ${EMBER_RED};background:${SURFACE_ALT};font-size:14px;line-height:1.6;color:${INK};"><b>Pedidos especiais:</b> ${escapeHtml(ctx.specialRequests.slice(0, 600))}</p>`
         : ""
     }
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">
       O cliente está à espera das opções no link dele. Reclame o caso para ele
       sair de "novos sem dono" e componha a proposta — enquanto não for
       publicada, o que ele vê é um ecrã a dizer que estamos a pesquisar.
     </p>
     ${cta(link, "Abrir o caso")}`,
    DEFAULT_LOCALE,
    ctx.reference
  )

  const text = [
    `Pedido novo: ${route}, ${ctx.clientName}.`,
    meta,
    ctx.specialRequests ? `Pedidos especiais: ${ctx.specialRequests}` : "",
    "",
    link,
  ]
    .filter(Boolean)
    .join("\n")

  const email = await notify({
    caseId,
    channel: "email",
    kind: "team_new_request",
    audience: "team",
    to: teamRecipients(),
    subject,
    html,
    text,
    ...(ctx.clientEmail ? { replyTo: ctx.clientEmail } : {}),
    dedupeKey: "team_new_request",
  })

  /*
   * O WhatsApp da equipa, depois e à parte.
   *
   * `await` e não `void`: o registo tem de ficar escrito antes de a função
   * voltar, ou uma serverless que termine mata o envio a meio. O que ele não
   * faz é influenciar o resultado devolvido — o email já saiu.
   */
  await notify({
    caseId,
    channel: "whatsapp",
    kind: "team_new_request",
    audience: "team",
    to: whatsappTeamNumber(),
    subject,
    body: [
      `WeeFly · pedido novo`,
      `${route} · ${when}`,
      `${ctx.clientName} · ${ctx.paxLabel}`,
      ownership,
      link,
    ].join("\n"),
    dedupeKey: "team_new_request",
  })

  return email
}

// ═══ NT-03 · proposta publicada, ao cliente ══════════════════════════════════

/**
 * O aviso da proposta, com o link 2.
 *
 * O HTML é construído em `emails/proposal-published.ts` — este é o envio, e o
 * que ele acrescenta é o registo, a repetição e o WhatsApp. A `dedupeKey` leva a
 * revisão: R1 e R2 são dois acontecimentos, e só a segunda publicação da mesma
 * revisão é que é um duplicado.
 */
export async function sendProposalPublishedEmail(input: {
  caseId: string
  subject: string
  html: string
  text: string
  revision: number
  /** NT-04 · o que mudou desde a revisão anterior, quando há revisão anterior. */
  changeNote?: string | null
}): Promise<NotifyOutcome> {
  const ctx = await context(input.caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const t = getTranslator(ctx.locale)
  const link = clientLink(ctx)

  const outcome = await notify({
    caseId: input.caseId,
    channel: "email",
    kind: "proposal_published",
    audience: "client",
    to: ctx.clientEmail,
    locale: ctx.locale,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: teamRecipients(),
    dedupeKey: `proposal_published:r${input.revision}`,
  })

  await notify({
    caseId: input.caseId,
    channel: "whatsapp",
    kind: "proposal_published",
    audience: "client",
    to: ctx.clientWhatsApp,
    locale: ctx.locale,
    subject: input.subject,
    body: [
      t("email.whatsappProposal", { name: ctx.clientFirstName }),
      input.changeNote ?? "",
      link,
    ]
      .filter(Boolean)
      .join("\n"),
    dedupeKey: `proposal_published:r${input.revision}`,
  })

  return outcome
}

/** O mesmo acontecimento, para dentro. Sem WhatsApp: a equipa lê o email. */
export async function sendProposalTeamEmail(input: {
  caseId: string
  subject: string
  html: string
  text: string
  revision: number
  replyTo?: string | null
}): Promise<NotifyOutcome> {
  return notify({
    caseId: input.caseId,
    channel: "email",
    kind: "team_proposal_published",
    audience: "team",
    to: teamRecipients(),
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    dedupeKey: `team_proposal_published:r${input.revision}`,
  })
}

// ═══ NT-04 · escolha registada, ao cliente ═══════════════════════════════════

export async function sendOfferChosenEmail(
  caseId: string,
  offerName: string
): Promise<NotifyOutcome> {
  const ctx = await context(caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const t = getTranslator(ctx.locale)
  const link = clientLink(ctx)
  const route = routeOf(ctx)
  const subject = t("email.chosenSubject", { route })

  const html = shell(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">${escapeHtml(t("email.chosenHeading"))}</h1>
     <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${EMBER_RED};">${escapeHtml(route)}${ctx.reference ? ` · ${escapeHtml(ctx.reference)}` : ""}</p>
     <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">
       ${t("email.chosenBody", {
         name: `<strong style="color:${INK};">${escapeHtml(ctx.clientFirstName)}</strong>`,
         option: `<strong style="color:${INK};">${escapeHtml(offerName)}</strong>`,
       })}
     </p>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(t("email.chosenNext"))}</p>
     ${cta(link, t("email.chosenCta"))}`,
    ctx.locale,
    ctx.reference
  )

  const text = [
    t("email.chosenTextHello", { name: ctx.clientFirstName }),
    "",
    t("email.chosenTextBody", { option: offerName }),
    t("email.chosenNext"),
    "",
    link,
    "© WeeFly Africa",
  ].join("\n")

  return notify({
    caseId,
    channel: "email",
    kind: "offer_selected",
    audience: "client",
    to: ctx.clientEmail,
    locale: ctx.locale,
    subject,
    html,
    text,
    replyTo: teamRecipients(),
    dedupeKey: "offer_selected",
  })
}

// ═══ NT-04 · instruções de pagamento, ao cliente ═════════════════════════════

/**
 * T-17 · o email de pagamento leva **o link de pagamento**.
 *
 * O teste apanhou-o assim: "nesta altura o cliente escolheu um método e a
 * equipa gerou o link. Esse link tem de estar no email — senão o cliente não
 * consegue pagar."
 *
 * O que saía era um botão para `/pc/{token}`, que é o link do **caso** e não o
 * do pagamento. Quem o abria caía no ecrã de pagamento, e o ecrã dizia que
 * estávamos a preparar os dados — porque, no instante em que o email saía
 * (passaportes submetidos), era verdade. O email era mandado antes de existir
 * aquilo de que ele falava.
 *
 * Agora este email tem um momento só: o agente carrega em "Gravar e enviar" na
 * aba Pagamento, depois de ter criado o link no Stripe ou pedido a referência à
 * SISP. E o que ele leva é o que a pessoa precisa de ter à frente para pagar:
 *
 *   · **o link, como botão**, ou a referência em monospace quando a via é de
 *     referência — o Instapay não tem endereço nenhum para abrir;
 *   · o método pelo nome, porque o cliente escolheu-o e tem de reconhecer o que
 *     recebeu;
 *   · o valor e o prazo (T-11), que é a data e hora deste envio mais uma hora;
 *   · a nossa referência, para ele a citar na transferência.
 *
 * **Recusa-se a sair sem link nem referência.** É o critério à letra: "falha o
 * envio, com um erro visível, se o link faltar — melhor do que mandar um email
 * sobre o qual o cliente não pode agir". A recusa acontece antes de `notify`,
 * pelo que não fica linha nenhuma em `case_notifications` nem bandeira no caso:
 * não houve aviso falhado, houve um aviso que não devia ser tentado.
 */
export async function sendPaymentInstructionsEmail(
  caseId: string,
  /**
   * C-33 · o que distingue este envio do anterior.
   *
   * A chave de duplicado era a constante `"payment_instructions"`, e com ela um
   * caso só podia receber instruções **uma vez na vida**. Enquanto o cliente
   * pagava dentro do link isso bastava. Agora não: é o agente que fornece o
   * link ou a referência, e se o cliente trocar de método — ou se o primeiro
   * link expirar — o segundo envio é uma notícia nova e tem de sair.
   *
   * Quem chama passa o método e a instrução; dois cliques no mesmo botão com o
   * mesmo conteúdo continuam a dar um aviso só, que é o que o NT-04 pede.
   */
  dedupeSuffix?: string
): Promise<NotifyOutcome> {
  const ctx = await context(caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const { getPcPayment } = await import("@/lib/pc/payment")
  const payment = await getPcPayment(caseId)

  const payLink = payment?.pay_link?.trim() || null
  const payReference = payment?.pay_reference?.trim() || null

  if (!payLink && !payReference) {
    return {
      ok: false,
      id: null,
      status: "failed",
      reason:
        "sem link nem referência de pagamento — o cliente não teria como pagar",
    }
  }

  const t = getTranslator(ctx.locale)
  const link = clientLink(ctx)
  const route = routeOf(ctx)
  const amount = formatAmount(ctx.amount, ctx.currency)
  const subject = t("email.payInstructionsSubject", { route })

  const { methodLabel } = await import("@/lib/pc/catalog")
  const method = methodLabel(payment?.method ?? null, ctx.locale)

  /* O prazo em hora de Cabo Verde e por extenso: um `2026-09-05T14:30Z` não
     diz a ninguém até quando tem de pagar. */
  const due = payment?.pay_due_at
    ? new Intl.DateTimeFormat(LOCALE_TAGS[ctx.locale], {
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Atlantic/Cape_Verde",
      }).format(new Date(payment.pay_due_at))
    : null

  const rows = [
    summaryRow(t("email.payInstructionsMethod"), escapeHtml(method)),
    summaryRow(
      t("email.payInstructionsAmount"),
      `<span style="font-family:'IBM Plex Mono','Courier New',monospace;">${escapeHtml(amount)}</span>`
    ),
    payReference
      ? summaryRow(
          t("email.payInstructionsReference"),
          `<span style="font-family:'IBM Plex Mono','Courier New',monospace;font-size:16px;">${escapeHtml(payReference)}</span>`
        )
      : "",
    ctx.reference
      ? summaryRow(
          t("email.payInstructionsQuote"),
          `<span style="font-family:'IBM Plex Mono','Courier New',monospace;">${escapeHtml(ctx.reference)}</span>`
        )
      : "",
    due ? summaryRow(t("email.payInstructionsDue"), escapeHtml(due)) : "",
  ]
    .filter(Boolean)
    .join("")

  const html = shell(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">${escapeHtml(t("email.payInstructionsHeading"))}</h1>
     <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${EMBER_RED};">${escapeHtml(route)}</p>
     <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">
       ${t("email.payInstructionsBody", {
         name: `<strong style="color:${INK};">${escapeHtml(ctx.clientFirstName)}</strong>`,
         amount: `<strong style="color:${INK};">${escapeHtml(amount)}</strong>`,
       })}
     </p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:12px;padding:4px 20px;margin-bottom:22px;">
       ${rows}
     </table>
     ${
       payLink
         ? `${cta(payLink, t("email.payInstructionsPayNow"))}
            <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${MUTED};word-break:break-all;">
              ${escapeHtml(t("email.payInstructionsLinkNote"))}<br />
              <a href="${payLink}" style="color:${EMBER_RED};">${escapeHtml(payLink)}</a>
            </p>`
         : `<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(t("email.payInstructionsReferenceNote"))}</p>`
     }
     <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
       ${escapeHtml(t("email.payInstructionsProof"))}
       <a href="${link}" style="color:${EMBER_RED};">${escapeHtml(t("email.payInstructionsCta"))}</a>
     </p>`,
    ctx.locale,
    ctx.reference
  )

  const text = [
    t("email.payInstructionsTextHello", { name: ctx.clientFirstName }),
    "",
    t("email.payInstructionsTextBody", { amount }),
    "",
    `${t("email.payInstructionsMethod")}: ${method}`,
    payLink ? `${t("email.payInstructionsPayNow")}: ${payLink}` : "",
    payReference ? `${t("email.payInstructionsReference")}: ${payReference}` : "",
    ctx.reference ? `${t("email.payInstructionsQuote")}: ${ctx.reference}` : "",
    due ? `${t("email.payInstructionsDue")}: ${due}` : "",
    "",
    `${t("email.payInstructionsProof")} ${link}`,
    "© WeeFly Africa",
  ]
    .filter(Boolean)
    .join("\n")

  return notify({
    caseId,
    channel: "email",
    kind: "payment_instructions",
    audience: "client",
    to: ctx.clientEmail,
    locale: ctx.locale,
    subject,
    html,
    text,
    replyTo: teamRecipients(),
    dedupeKey: dedupeSuffix
      ? `payment_instructions:${dedupeSuffix}`
      : "payment_instructions",
  })
}

// ═══ NT-04 · pagamento confirmado, ao cliente ════════════════════════════════

export async function sendPaymentConfirmedEmail(
  caseId: string
): Promise<NotifyOutcome> {
  const ctx = await context(caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const { locale } = ctx
  const t = getTranslator(locale)
  const route = ctx.origin && ctx.destination ? `${ctx.origin} → ${ctx.destination}` : null
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
    locale,
    ctx.reference
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

  const outcome = await notify({
    caseId,
    channel: "email",
    kind: "payment_confirmed",
    audience: "client",
    to: ctx.clientEmail,
    locale,
    subject,
    html,
    text,
    replyTo: teamRecipients(),
    dedupeKey: "payment_confirmed",
  })

  await notify({
    caseId,
    channel: "whatsapp",
    kind: "payment_confirmed",
    audience: "client",
    to: ctx.clientWhatsApp,
    locale,
    subject,
    body: [t("email.whatsappPaid", { amount }), clientLink(ctx)].join("\n"),
    dedupeKey: "payment_confirmed",
  })

  return outcome
}

// ═══ EM-03 / NT-04 · bilhete emitido, ao cliente ═════════════════════════════

/**
 * O último email do ciclo, com o PDF anexado.
 *
 * O anexo e o link são as duas metades da mesma promessa: o anexo é o que chega
 * hoje, o link é o que ainda lá está daqui a seis meses no aeroporto quando a
 * caixa de correio já não abre.
 */
export async function sendTicketsIssuedEmail(input: {
  caseId: string
  attachments?: NotifyAttachment[]
}): Promise<NotifyOutcome> {
  const ctx = await context(input.caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const t = getTranslator(ctx.locale)
  const link = clientLink(ctx)
  const route = routeOf(ctx)
  const subject = t("email.issuedSubject", { route })

  const html = shell(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">${escapeHtml(t("email.issuedHeading"))}</h1>
     <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${EMBER_RED};">${escapeHtml(route)}${ctx.reference ? ` · ${escapeHtml(ctx.reference)}` : ""}</p>
     <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${MUTED};">
       ${t("email.issuedBody", {
         name: `<strong style="color:${INK};">${escapeHtml(ctx.clientFirstName)}</strong>`,
       })}
     </p>
     ${
       ctx.pnr
         ? `<p style="margin:0 0 20px;padding:14px 16px;background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:12px;font-size:14px;color:${INK};">
              ${escapeHtml(t("email.issuedPnr"))}
              <strong style="font-family:'IBM Plex Mono',monospace;font-size:18px;letter-spacing:0.08em;">${escapeHtml(ctx.pnr)}</strong>
            </p>`
         : ""
     }
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(t("email.issuedGuide"))}</p>
     ${cta(link, t("email.issuedCta"))}`,
    ctx.locale,
    ctx.reference
  )

  const text = [
    t("email.issuedTextHello", { name: ctx.clientFirstName }),
    "",
    t("email.issuedTextBody"),
    ctx.pnr ? `${t("email.issuedPnr")} ${ctx.pnr}` : "",
    "",
    link,
    "© WeeFly Africa",
  ]
    .filter(Boolean)
    .join("\n")

  const outcome = await notify({
    caseId: input.caseId,
    channel: "email",
    kind: "tickets_issued",
    audience: "client",
    to: ctx.clientEmail,
    locale: ctx.locale,
    subject,
    html,
    text,
    replyTo: teamRecipients(),
    attachments: input.attachments,
    /* Sem `dedupeKey`: o EM-03 pede o reenvio a partir do back-office, e um
       reenvio pedido por uma pessoa não é um duplicado. O que o impede de sair
       duas vezes por engano é ser preciso carregar num botão. */
  })

  await notify({
    caseId: input.caseId,
    channel: "whatsapp",
    kind: "tickets_issued",
    audience: "client",
    to: ctx.clientWhatsApp,
    locale: ctx.locale,
    subject,
    body: [
      t("email.whatsappIssued", { pnr: ctx.pnr ?? "—" }),
      link,
    ].join("\n"),
  })

  return outcome
}

// ═══ NT-05 · ação do cliente, ao agente do caso ══════════════════════════════

export type ClientAction =
  | "offer_selected"
  | "passengers_submitted"
  | "proof_uploaded"
  | "request_cancelled"
  /** T-18 · escreveu-nos do ecrã de pagamento. */
  | "message_sent"

const AGENT_SUBJECT: Record<ClientAction, string> = {
  offer_selected: "escolheu uma opção",
  passengers_submitted: "submeteu os passaportes",
  proof_uploaded: "enviou o comprovativo",
  request_cancelled: "cancelou o pedido",
  message_sent: "escreveu-nos",
}

/**
 * NT-05 · o agente dono do caso, avisado do que o cliente fez.
 *
 * Duas regras que o desenho tem de respeitar:
 *
 *   · **não dispara para as ações do próprio agente.** Estas quatro são todas
 *     do lado do cliente, e a verificação de `actorEmail` fecha a porta ao dia
 *     em que alguém chamar isto de dentro do back-office;
 *   · **aparece no back-office e por email.** O email é este; o back-office é a
 *     mesma linha em `case_notifications`, que a aba Comunicações lista.
 *
 * Sem dono, não sai nada. Um caso sem vendedor tem o alerta do NT-02 a dizê-lo,
 * e mandar isto para a caixa geral era transformar quatro avisos por caso em
 * ruído que ninguém lê.
 */
export async function notifyAgentOfClientAction(input: {
  caseId: string
  action: ClientAction
  detail?: string
  actorEmail?: string | null
}): Promise<NotifyOutcome> {
  const ctx = await context(input.caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const agent = ctx.sellerEmail ?? ctx.ownerEmail
  if (!agent) {
    return { ok: false, id: null, status: "skipped", reason: "caso sem vendedor" }
  }
  if (input.actorEmail && input.actorEmail.toLowerCase() === agent.toLowerCase()) {
    return { ok: false, id: null, status: "skipped", reason: "ação do próprio agente" }
  }

  const route = routeOf(ctx)
  const subject = `${ctx.clientName} ${AGENT_SUBJECT[input.action]} · ${route}`
  const link = caseAdminLink(ctx)

  const meta = [ctx.reference, route, ctx.paxLabel, ctx.clientPhone]
    .filter(Boolean)
    .join(" · ")

  const html = shell(
    subject,
    `<p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:${EMBER_RED};">O seu caso</p>
     <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:${INK};">${escapeHtml(subject)}</h1>
     <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(meta)}</p>
     ${input.detail ? `<p style="margin:0 0 18px;padding:12px 14px;background:${SURFACE_ALT};border-radius:10px;font-size:14px;color:${INK};">${escapeHtml(input.detail)}</p>` : ""}
     ${cta(link, "Abrir o caso")}`,
    DEFAULT_LOCALE,
    ctx.reference
  )

  return notify({
    caseId: input.caseId,
    channel: "email",
    kind: `agent_${input.action}`,
    audience: "agent",
    to: agent,
    subject,
    html,
    text: [subject, meta, input.detail ?? "", "", link].filter(Boolean).join("\n"),
    ...(ctx.clientEmail ? { replyTo: ctx.clientEmail } : {}),
    /*
     * T-18 · uma mensagem escrita à mão não é um estado, é uma frase.
     *
     * As outras quatro acções acontecem uma vez por caso e a chave existe para
     * isso. Uma mensagem do cliente não: a segunda é quase sempre o
     * esclarecimento da primeira, e recusá-la deixava o agente com metade da
     * conversa.
     */
    ...(input.action === "message_sent"
      ? {}
      : { dedupeKey: `agent_${input.action}` }),
  })
}

// ═══ NT-07 · avisar o cliente, escrito por uma pessoa ════════════════════════

/**
 * A mudança de horário que a companhia comunicou, ou o que for.
 *
 * O sistema não inventa estas mensagens (decisão Q5): uma pessoa decide o que
 * passar e como o dizer. O que o sistema faz é entregá-las nos canais
 * escolhidos, guardá-las com autor e hora, e pô-las no link do cliente — porque
 * um aviso que só existe num email é um aviso que se perde na caixa de entrada.
 */
export async function sendManualClientNotice(input: {
  caseId: string
  message: string
  channels: { email: boolean; whatsapp: boolean }
  actorId: string
  actorEmail: string
}): Promise<{ email: NotifyOutcome | null; whatsapp: NotifyOutcome | null }> {
  const ctx = await context(input.caseId)
  if (!ctx) return { email: null, whatsapp: null }

  const t = getTranslator(ctx.locale)
  const route = routeOf(ctx)
  const link = clientLink(ctx)
  const subject = t("email.alertSubject", { route })

  const html = shell(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">${escapeHtml(t("email.alertHeading"))}</h1>
     <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${EMBER_RED};">${escapeHtml(route)}${ctx.reference ? ` · ${escapeHtml(ctx.reference)}` : ""}</p>
     <p style="margin:0 0 20px;padding:14px 16px;border-left:3px solid ${EMBER_RED};background:${SURFACE_ALT};font-size:15px;line-height:1.65;color:${INK};white-space:pre-wrap;">${escapeHtml(input.message)}</p>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(t("email.alertFooter"))}</p>
     ${cta(link, t("email.alertCta"))}`,
    ctx.locale,
    ctx.reference
  )

  const text = [
    t("email.alertHeading"),
    "",
    input.message,
    "",
    link,
    "© WeeFly Africa",
  ].join("\n")

  /*
   * `clientVisible` só no primeiro dos dois envios.
   *
   * O alerta no link do cliente é um; o facto de ter saído por dois canais é
   * outro. Marcar os dois punha a mesma frase duas vezes no ecrã dele.
   */
  const email = input.channels.email
    ? await notify({
        caseId: input.caseId,
        channel: "email",
        kind: "manual",
        audience: "client",
        to: ctx.clientEmail,
        locale: ctx.locale,
        subject,
        html,
        text,
        body: input.message,
        clientVisible: true,
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        replyTo: teamRecipients(),
      })
    : null

  const whatsapp = input.channels.whatsapp
    ? await notify({
        caseId: input.caseId,
        channel: "whatsapp",
        kind: "manual",
        audience: "client",
        to: ctx.clientWhatsApp,
        locale: ctx.locale,
        subject,
        body: `WeeFly · ${route}\n\n${input.message}\n\n${link}`,
        clientVisible: !input.channels.email,
        actorId: input.actorId,
        actorEmail: input.actorEmail,
      })
    : null

  return { email, whatsapp }
}

// ═══ o pagamento declarado, à equipa ═════════════════════════════════════════

/**
 * À equipa, quando o cliente cumpre a sua parte do pagamento.
 *
 * Duas notícias diferentes com o mesmo destinatário: `proof: true` quer dizer
 * que entrou um ficheiro para alguém abrir; `proof: false` que o cliente
 * declarou ter pago por um método sem comprovativo. A primeira tem um prazo a
 * correr contra nós e é isso que o assunto tem de dizer.
 *
 * Vai só para dentro: a declaração ainda não é confirmação, e o cliente não
 * deve receber nada que pareça um recibo antes de alguém ver o dinheiro.
 */
export async function sendPaymentDeclaredEmail(
  caseId: string,
  options: { proof?: boolean } = {}
): Promise<NotifyOutcome> {
  const ctx = await context(caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const withProof = options.proof === true
  const route = routeOf(ctx)
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
    ctx.sellerLabel ?? ctx.sellerEmail ?? ctx.ownerEmail ?? "sem vendedor",
  ]
    .filter(Boolean)
    .join(" · ")

  const html = shell(
    subject,
    `<p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:${EMBER_RED};">${withProof ? "Por validar" : "A confirmar"}</p>
     <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:${INK};">${escapeHtml(headline)}</h1>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(meta)}</p>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(explain)}</p>
     ${cta(link, withProof ? "Abrir o comprovativo" : "Abrir o caso")}`,
    DEFAULT_LOCALE,
    ctx.reference
  )

  const text = [headline + ".", meta, "", explain, link ? `\n${link}` : ""]
    .filter(Boolean)
    .join("\n")

  return notify({
    caseId,
    channel: "email",
    kind: withProof ? "team_proof_uploaded" : "team_payment_declared",
    audience: "team",
    to: teamRecipients(),
    subject,
    html,
    text,
    ...(ctx.clientEmail ? { replyTo: ctx.clientEmail } : {}),
  })
}

// ═══ BO-04r · datas propostas, ao cliente ════════════════════════════════════

/**
 * As datas de um pedido não se mudam em silêncio: quem as pediu tem de saber
 * que mudaram, quais são as novas e porquê. O motivo escrito pelo agente vai no
 * corpo do email tal e qual — é a frase que ele escreveu sabendo que o cliente a
 * ia ler.
 */
export async function sendDatesProposedEmail(
  caseId: string,
  change: {
    fromDepart: string | null
    fromReturn: string | null
    toDepart: string
    toReturn: string | null
    reason: string
  }
): Promise<NotifyOutcome> {
  const ctx = await context(caseId)
  if (!ctx) {
    return { ok: false, id: null, status: "failed", reason: "caso não encontrado" }
  }

  const { locale } = ctx
  const t = getTranslator(locale)

  const range = (from: string | null, to: string | null) =>
    [from ? formatDate(from) : "—", to ? formatDate(to) : null]
      .filter(Boolean)
      .join(" – ")

  const before = range(change.fromDepart, change.fromReturn)
  const after = range(change.toDepart, change.toReturn)
  const route = routeOf(ctx)

  const subject = t("email.datesSubject", { route })
  const link = clientLink(ctx)

  const html = shell(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">${escapeHtml(t("email.datesHeading"))}</h1>
     <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${EMBER_RED};">${escapeHtml(route)}${ctx.reference ? ` · ${escapeHtml(ctx.reference)}` : ""}</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${MUTED};">
       ${t("email.datesBody", {
         name: `<strong style="color:${INK};">${escapeHtml(ctx.clientName)}</strong>`,
         from: `<strong style="color:${INK};">${escapeHtml(before)}</strong>`,
         to: `<strong style="color:${INK};">${escapeHtml(after)}</strong>`,
       })}
     </p>
     <p style="margin:0 0 20px;padding:12px 14px;border-left:3px solid ${EMBER_RED};background:${SURFACE_ALT};font-size:14px;line-height:1.6;color:${INK};">
       ${escapeHtml(t("email.datesReason", { reason: change.reason }))}
     </p>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">
       ${escapeHtml(t("email.datesNext"))}
     </p>
     ${cta(link, t("email.datesCta"))}`,
    locale,
    ctx.reference
  )

  const text = [
    t("email.datesTextHello", { name: ctx.clientName }),
    "",
    t("email.datesTextChange", { from: before, to: after }),
    t("email.datesTextReason", { reason: change.reason }),
    "",
    t("email.datesTextNext"),
    link,
    "© WeeFly Africa",
  ]
    .filter(Boolean)
    .join("\n")

  const outcome = await notify({
    caseId,
    channel: "email",
    kind: "dates_proposed",
    audience: "client",
    to: ctx.clientEmail,
    locale,
    subject,
    html,
    text,
    replyTo: teamRecipients(),
    /* Sem chave de duplicado: uma segunda proposta de datas é outra notícia. */
  })

  await notify({
    caseId,
    channel: "whatsapp",
    kind: "dates_proposed",
    audience: "client",
    to: ctx.clientWhatsApp,
    locale,
    subject,
    body: [
      t("email.datesTextChange", { from: before, to: after }),
      change.reason,
      link,
    ]
      .filter(Boolean)
      .join("\n"),
  })

  return outcome
}

/**
 * O nome antigo desta função, mantido para quem já o chama.
 *
 * @deprecated Use `sendNewRequestAlert` — o NT-02 acrescentou o WhatsApp e a
 * frase sobre o pedido sem vendedor, e o nome antigo já não descreve o que ela
 * faz.
 */
export const sendPcRequestReceivedEmail = sendNewRequestAlert
