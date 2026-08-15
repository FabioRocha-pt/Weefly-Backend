/**
 * WeeFly Concierge — internal team notification.
 *
 * Sent to the concierge inbox (info@weefly.africa / info@weefly.cv) for every
 * request submitted through the public form. Unlike the client confirmation,
 * this one carries the full contact details so an agent can act immediately —
 * and it sets reply-to to the client, so hitting "Reply" answers the customer.
 *
 * Vai sempre em português, e de propósito: o destinatário é a equipa em Cabo
 * Verde, não o cliente. Só as etiquetas partilhadas — tipo de viagem, classe,
 * tratamento — saem do dicionário, e saem do português.
 */

import {
  BORDER,
  EMBER_RED,
  INK,
  MUTED,
  SURFACE_ALT,
  type TravelRequestSummary,
  datesSummary,
  escapeHtml,
  passengersSummary,
  summaryRow,
} from "./shared"
import { createTranslator } from "@/i18n/translate"
import ptDictionary from "@/i18n/dictionaries/pt.json"

/** O tradutor da equipa: português, fixo. */
const t = createTranslator(ptDictionary as Record<string, unknown>)

export interface TravelRequestNotificationData extends TravelRequestSummary {
  email: string
  phonePrefix: string
  phone: string
  /** Where the lead came in from. Defaults to the public browser form. */
  sourceChannel?: string
  submittedAt?: Date
}

/** "DD/MM/YYYY HH:mm" in Cabo Verde time, the team's working timezone. */
function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Atlantic/Cape_Verde",
  }).format(date)
}

export function buildTravelRequestNotificationEmail(
  data: TravelRequestNotificationData
): { subject: string; html: string; text: string } {
  const submittedAt = data.submittedAt ?? new Date()
  const sourceChannel = data.sourceChannel ?? "Formulário online"

  const name = escapeHtml(data.fullName)
  const route = `${escapeHtml(data.origin)} → ${escapeHtml(data.destination)}`
  const phone = `${data.phonePrefix} ${data.phone}`.trim()
  const datesValue = datesSummary(data)

  const subject = `Novo pedido de viagem · ${data.origin} → ${data.destination} · ${data.fullName}`

  const tripRows = [
    summaryRow("Tipo de viagem", t(`tripTypes.${data.tripType}`)),
    summaryRow("Trajeto", route),
    summaryRow("Datas", datesValue),
    summaryRow("Passageiros", passengersSummary(data, t)),
    summaryRow("Classe", t(`cabins.${data.cabinClass}`)),
  ].join("")

  const contactRows = [
    summaryRow("Nome", `${t(`titles.${data.title}`)} ${name}`),
    summaryRow(
      "Email",
      `<a href="mailto:${escapeHtml(data.email)}" style="color:${EMBER_RED};font-weight:600;">${escapeHtml(data.email)}</a>`
    ),
    summaryRow(
      "Telefone",
      `<a href="tel:${escapeHtml(phone.replace(/\s+/g, ""))}" style="color:${EMBER_RED};font-weight:600;">${escapeHtml(phone)}</a>`
    ),
    summaryRow("Canal", escapeHtml(sourceChannel)),
    summaryRow("Recebido", formatTimestamp(submittedAt)),
  ].join("")

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE_ALT};font-family:'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
          <!-- Header -->
          <tr>
            <td style="background:${INK};padding:24px 32px;">
              <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">WeeFly</span>
              <span style="font-size:11px;font-weight:700;color:#ffffff;opacity:0.7;margin-left:8px;text-transform:uppercase;letter-spacing:0.08em;">Concierge · Interno</span>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding:32px 32px 4px;">
              <span style="display:inline-block;background:${EMBER_RED};color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:5px 10px;border-radius:999px;">Novo lead</span>
              <h1 style="margin:14px 0 6px;font-size:21px;font-weight:800;color:${INK};letter-spacing:-0.02em;">
                ${route}
              </h1>
              <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:${MUTED};">
                ${name} submeteu um pedido de viagem. Responda a este email para contactar o cliente diretamente.
              </p>
            </td>
          </tr>

          <!-- Contact card -->
          <tr>
            <td style="padding:20px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:12px;padding:8px 20px;">
                <tr>
                  <td style="padding:14px 0 4px;">
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${EMBER_RED};">Contacto</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${contactRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Trip card -->
          <tr>
            <td style="padding:16px 32px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:12px;padding:8px 20px;">
                <tr>
                  <td style="padding:14px 0 4px;">
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${EMBER_RED};">Pedido</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${tripRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <a href="mailto:${escapeHtml(data.email)}?subject=${encodeURIComponent(`WeeFly · O seu pedido de viagem ${data.origin} → ${data.destination}`)}" style="display:inline-block;background:${EMBER_RED};color:#ffffff;font-size:14px;font-weight:700;padding:13px 26px;border-radius:999px;text-decoration:none;">
                Responder ao cliente
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 32px;">
              <hr style="border:none;border-top:1px solid ${BORDER};margin:0 0 16px;" />
              <p style="margin:0;font-size:12px;line-height:1.6;color:#98A1AE;">
                Notificação automática da WeeFly Concierge · não reencaminhe este email para fora da equipa,
                contém dados pessoais do cliente.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    `NOVO PEDIDO DE VIAGEM — ${data.origin} -> ${data.destination}`,
    "",
    "Contacto:",
    `- Nome: ${t(`titles.${data.title}`)} ${data.fullName}`,
    `- Email: ${data.email}`,
    `- Telefone: ${phone}`,
    `- Canal: ${sourceChannel}`,
    `- Recebido: ${formatTimestamp(submittedAt)}`,
    "",
    "Pedido:",
    `- Tipo de viagem: ${t(`tripTypes.${data.tripType}`)}`,
    `- Trajeto: ${data.origin} -> ${data.destination}`,
    `- Datas: ${datesValue}`,
    `- Passageiros: ${passengersSummary(data, t)}`,
    `- Classe: ${t(`cabins.${data.cabinClass}`)}`,
    "",
    "Responda a este email para contactar o cliente diretamente.",
  ].join("\n")

  return { subject, html, text }
}
