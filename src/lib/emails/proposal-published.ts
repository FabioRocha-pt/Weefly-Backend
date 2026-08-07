/**
 * WeeFly Concierge — emails do momento de publicar uma proposta.
 *
 * Dois destinatários, duas mensagens: o cliente recebe as opções e o endereço
 * onde as escolhe; a equipa recebe o registo de que a proposta saiu, com a
 * margem que o cliente nunca vê.
 *
 * Nota sobre o link: a confirmação de pedido (travel-request-confirmation.ts)
 * diz que estes emails não transportam tokens. Aqui transporta, e é
 * deliberado — o token É a credencial do cliente, tal como num link mágico de
 * autenticação, e sem ele o email não tem para onde apontar. É por isso que a
 * página do cliente leva `robots: noindex` e o rodapé avisa que o endereço é
 * pessoal.
 */

import {
  BORDER,
  EMBER_RED,
  INK,
  MUTED,
  SURFACE_ALT,
  escapeHtml,
} from "./shared"
import {
  type Offer,
  type PaxCounts,
  flightCodes,
  formatDuration,
  formatMoney,
  legMinutes,
  legsOf,
  offerTotal,
  stopsLabel,
  timeOf,
} from "@/lib/proposal-math"

export interface ProposalEmailData {
  clientName: string
  reference: string | null
  origin: string
  destination: string
  offers: Offer[]
  pax: PaxCounts
  currency: string
  openingMessage: string | null
  /** URL completo do link 2. */
  link: string
  revision: number
}

function paxLine(pax: PaxCounts): string {
  const parts = [`${pax.adults} ${pax.adults === 1 ? "adulto" : "adultos"}`]
  if (pax.children > 0) {
    parts.push(`${pax.children} ${pax.children === 1 ? "criança" : "crianças"}`)
  }
  if (pax.infants > 0) {
    parts.push(`${pax.infants} ${pax.infants === 1 ? "bebé" : "bebés"}`)
  }
  return parts.join(" · ")
}

/** "08:40 RAI → 14:15 BOS · 10h 35m · 1 escala · SID 1h 20m" */
function legLine(offer: Offer, direction: "ida" | "volta"): string | null {
  const segments = legsOf(offer)[direction]
  if (segments.length === 0) return null
  const first = segments[0]
  const last = segments[segments.length - 1]
  return [
    `${timeOf(first.depart_at)} ${first.origin ?? "—"} → ${timeOf(last.arrive_at)} ${last.destination ?? "—"}`,
    formatDuration(legMinutes(segments)),
    stopsLabel(segments),
  ].join(" · ")
}

function offerCard(offer: Offer, data: ProposalEmailData): string {
  const total = formatMoney(offerTotal(offer, data.pax), data.currency)
  const badges = [
    offer.is_recommended ? "Recomendada pelo agente" : null,
    offer.is_cheapest ? "Mais barata" : null,
    offer.is_fastest ? "Mais rápida" : null,
  ].filter(Boolean) as string[]

  const badgeHtml = badges
    .map(
      (b) =>
        `<span style="display:inline-block;background:${INK};color:#fff;font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;border-radius:5px;padding:4px 7px;margin:0 5px 6px 0;">${escapeHtml(b)}</span>`
    )
    .join("")

  const legs = (["ida", "volta"] as const)
    .map((d) => {
      const line = legLine(offer, d)
      if (!line) return ""
      const label = d === "ida" ? "Ida" : "Volta"
      return `<tr>
        <td style="padding:5px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};width:44px;vertical-align:top;">${label}</td>
        <td style="padding:5px 0;font-size:13px;color:${INK};">${escapeHtml(line)}</td>
      </tr>`
    })
    .join("")

  const codes = flightCodes([...legsOf(offer).ida, ...legsOf(offer).volta])

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;margin:0 0 12px;">
    <tr>
      <td style="padding:16px 18px;">
        ${badgeHtml}
        <p style="margin:${badges.length ? "4px" : "0"} 0 10px;font-size:16px;font-weight:700;color:${INK};">${escapeHtml(offer.name || "Opção sem nome")}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${legs}</table>
        ${codes ? `<p style="margin:10px 0 0;font-size:11px;color:${MUTED};font-family:monospace;">${escapeHtml(codes)}${offer.fare_name ? ` — ${escapeHtml(offer.fare_name)}` : ""}</p>` : ""}
        ${offer.agent_note ? `<p style="margin:10px 0 0;background:${SURFACE_ALT};border-radius:8px;padding:10px 11px;font-size:12.5px;line-height:1.5;color:${MUTED};">${escapeHtml(offer.agent_note)}</p>` : ""}
      </td>
    </tr>
    <tr>
      <td style="padding:0 18px 16px;border-top:1px solid ${BORDER};">
        <p style="margin:12px 0 0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${MUTED};">Total · ${escapeHtml(paxLine(data.pax))}</p>
        <p style="margin:2px 0 0;font-size:20px;font-weight:700;color:${INK};letter-spacing:-0.02em;">${escapeHtml(total)}</p>
      </td>
    </tr>
  </table>`
}

export function buildProposalPublishedEmail(data: ProposalEmailData): {
  subject: string
  html: string
  text: string
} {
  const count = data.offers.length
  const name = escapeHtml(data.clientName)
  const route = `${escapeHtml(data.origin)} → ${escapeHtml(data.destination)}`

  const subject =
    data.revision > 1
      ? `Atualizámos a sua proposta · ${data.origin} → ${data.destination}`
      : `A sua proposta de viagem está pronta · ${data.origin} → ${data.destination}`

  const intro =
    data.revision > 1
      ? "Revimos os valores da sua proposta. As opções abaixo substituem as que lhe tínhamos enviado."
      : `Preparámos ${count === 1 ? "uma opção" : `${count} opções`} para a sua viagem. Abra o link para ver o itinerário completo, as bagagens incluídas e o preço detalhado de cada uma.`

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(subject)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  body { margin:0; padding:0; background:${SURFACE_ALT}; }
  a { text-decoration:none; }
</style>
</head>
<body style="margin:0;padding:0;background:${SURFACE_ALT};font-family:'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
        <tr>
          <td style="background:${EMBER_RED};padding:28px 32px;">
            <span style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">WeeFly</span>
            <span style="font-size:12px;font-weight:700;color:#ffffff;opacity:0.85;margin-left:8px;text-transform:uppercase;letter-spacing:0.08em;">Concierge</span>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 32px 4px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">
              ${data.revision > 1 ? "Proposta atualizada" : `Encontrámos ${count === 1 ? "uma opção" : `${count} opções`} para si`}
            </h1>
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${EMBER_RED};">${route}${data.reference ? ` · ${escapeHtml(data.reference)}` : ""}</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">
              Olá <strong style="color:${INK};">${name}</strong>. ${escapeHtml(intro)}
            </p>
            ${
              data.openingMessage
                ? `<p style="margin:0 0 20px;background:${SURFACE_ALT};border-left:3px solid ${EMBER_RED};border-radius:0 10px 10px 0;padding:14px 16px;font-size:14px;line-height:1.6;color:${INK};">${escapeHtml(data.openingMessage)}</p>`
                : ""
            }
          </td>
        </tr>

        <tr>
          <td style="padding:8px 32px 0;">
            ${data.offers.map((o) => offerCard(o, data)).join("")}
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px 8px;" align="center">
            <a href="${data.link}" style="display:inline-block;background:${EMBER_RED};color:#ffffff;font-size:15px;font-weight:700;padding:15px 30px;border-radius:999px;">
              Ver e escolher a minha opção
            </a>
            <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
              Este endereço é pessoal — depois de escolher, é aí que preenche os dados dos passaportes.
              Não o partilhe.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 32px;">
            <hr style="border:none;border-top:1px solid ${BORDER};margin:0 0 16px;" />
            <p style="margin:0;font-size:12px;line-height:1.6;color:#98A1AE;">
              Recebe esta mensagem porque pediu uma cotação de viagem à WeeFly.
              Se tiver dúvidas, responda a este email e fala diretamente com o seu agente.
            </p>
            <p style="margin:12px 0 0;font-size:12px;color:#98A1AE;">
              © ${new Date().getFullYear()} WeeFly Africa · Praia, Cabo Verde
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    `Olá ${data.clientName},`,
    "",
    intro,
    data.openingMessage ? `\n${data.openingMessage}` : "",
    "",
    ...data.offers.flatMap((offer) => {
      const lines = [
        `— ${offer.name || "Opção sem nome"} — ${formatMoney(offerTotal(offer, data.pax), data.currency)}`,
      ]
      const ida = legLine(offer, "ida")
      const volta = legLine(offer, "volta")
      if (ida) lines.push(`  Ida:   ${ida}`)
      if (volta) lines.push(`  Volta: ${volta}`)
      if (offer.agent_note) lines.push(`  ${offer.agent_note}`)
      return [...lines, ""]
    }),
    `Ver e escolher: ${data.link}`,
    "",
    "Este endereço é pessoal. Não o partilhe.",
    "© WeeFly Africa",
  ].join("\n")

  return { subject, html, text }
}

// --- Aviso interno ----------------------------------------------------------

export interface ProposalTeamEmailData extends ProposalEmailData {
  clientEmail: string | null
  agentName: string | null
  /** Custo no consolidador por oferta, na ordem de `offers`. */
  costs: number[]
}

/**
 * O aviso à equipa. Ao contrário do email do cliente, este mostra a margem —
 * é a única mensagem em todo o fluxo que o faz, e por isso vai só para os
 * endereços internos configurados.
 */
export function buildProposalTeamEmail(data: ProposalTeamEmailData): {
  subject: string
  html: string
  text: string
} {
  const subject = `Proposta R${data.revision} enviada · ${data.clientName} · ${data.origin} → ${data.destination}`

  const rows = data.offers
    .map((offer, i) => {
      const total = offerTotal(offer, data.pax)
      const cost = data.costs[i] ?? 0
      const margin = total - cost
      const pct = total > 0 ? ((margin / total) * 100).toFixed(1) : "0,0"
      const colour = margin <= 0 ? EMBER_RED : "#2F9E77"
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:13px;color:${INK};">
          ${escapeHtml(offer.name || "Opção sem nome")}
          ${offer.is_recommended ? `<span style="color:${MUTED};font-size:11px;"> · recomendada</span>` : ""}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:13px;color:${INK};text-align:right;font-weight:600;">${escapeHtml(formatMoney(total, data.currency))}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:13px;color:${colour};text-align:right;font-weight:600;">${escapeHtml(formatMoney(margin, data.currency))} · ${pct}%</td>
      </tr>`
    })
    .join("")

  const html = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8" /><meta name="color-scheme" content="light only" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:${SURFACE_ALT};font-family:'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif;color:${INK};">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:0 auto;background:#fff;border:1px solid ${BORDER};border-radius:14px;">
    <tr><td style="padding:24px 26px 8px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:${EMBER_RED};">Proposta enviada · revisão R${data.revision}</p>
      <h1 style="margin:0 0 4px;font-size:19px;font-weight:800;color:${INK};">${escapeHtml(data.clientName)} · ${escapeHtml(data.origin)} → ${escapeHtml(data.destination)}</h1>
      <p style="margin:0 0 18px;font-size:13px;color:${MUTED};">
        ${escapeHtml(paxLine(data.pax))}${data.reference ? ` · ${escapeHtml(data.reference)}` : ""}${data.clientEmail ? ` · ${escapeHtml(data.clientEmail)}` : ""}${data.agentName ? ` · enviada por ${escapeHtml(data.agentName)}` : ""}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 0 6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:${MUTED};">Opção</td>
          <td style="padding:0 0 6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:${MUTED};text-align:right;">Total</td>
          <td style="padding:0 0 6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:${MUTED};text-align:right;">Margem</td>
        </tr>
        ${rows}
      </table>
      <p style="margin:18px 0 24px;font-size:12px;color:${MUTED};">
        O cliente escolhe em <a href="${data.link}" style="color:${EMBER_RED};font-weight:600;">${escapeHtml(data.link)}</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    `Proposta R${data.revision} enviada`,
    `${data.clientName} · ${data.origin} -> ${data.destination}`,
    `${paxLine(data.pax)}${data.reference ? ` · ${data.reference}` : ""}${data.clientEmail ? ` · ${data.clientEmail}` : ""}`,
    "",
    ...data.offers.map((offer, i) => {
      const total = offerTotal(offer, data.pax)
      const margin = total - (data.costs[i] ?? 0)
      const pct = total > 0 ? ((margin / total) * 100).toFixed(1) : "0,0"
      return `- ${offer.name || "Opção sem nome"}: ${formatMoney(total, data.currency)} · margem ${formatMoney(margin, data.currency)} (${pct}%)`
    }),
    "",
    `Link do cliente: ${data.link}`,
  ].join("\n")

  return { subject, html, text }
}
