/**
 * WeeFly Concierge — client confirmation email.
 *
 * Builds a transactional HTML email (inline CSS, table layout for client
 * compatibility) acknowledging a travel request. Branding follows the WeeFly
 * design system: Ember Red (#EF5129) for highlights and the CTA, white
 * background, "Plus Jakarta Sans" as the primary font-family.
 *
 * Per the technical spec (§9), transactional emails never carry passwords,
 * payment data or tokens — this template only echoes the trip summary the
 * client just submitted.
 *
 * O idioma vem de fora, num `Translator`: este email sai no seguimento de um
 * pedido HTTP, e é a língua em que a pessoa estava a preencher o formulário
 * que manda — não a do servidor.
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
import { DEFAULT_LOCALE, LOCALE_TAGS, type Locale } from "@/i18n/config"
import { createTranslator, type Translator } from "@/i18n/translate"
import ptDictionary from "@/i18n/dictionaries/pt.json"

export type TravelRequestEmailData = TravelRequestSummary

/** O tradutor português, para quem chame sem indicar idioma. */
const defaultTranslator = () =>
  createTranslator(ptDictionary as Record<string, unknown>)

export function buildTravelRequestConfirmationEmail(
  data: TravelRequestEmailData,
  t: Translator = defaultTranslator(),
  locale: Locale = DEFAULT_LOCALE
): {
  subject: string
  html: string
  text: string
} {
  const greeting = t(data.title === "ms" ? "email.greetingMs" : "email.greetingMr")
  const name = escapeHtml(data.fullName)
  const route = `${escapeHtml(data.origin)} → ${escapeHtml(data.destination)}`
  const datesValue = datesSummary(data)

  const subject = t("email.confirmSubject")

  const rows = [
    summaryRow(t("email.rowTripType"), t(`tripTypes.${data.tripType}`)),
    summaryRow(t("email.rowRoute"), route),
    summaryRow(t("email.rowDates"), datesValue),
    summaryRow(t("email.rowPassengers"), passengersSummary(data, t)),
    summaryRow(t("email.rowCabin"), t(`cabins.${data.cabinClass}`)),
  ].join("")

  /*
   * O <strong> viaja dentro do valor interpolado e não dentro da frase: assim
   * a frase fica inteira no dicionário, e cada língua pode pôr o nome onde a
   * sua gramática o quer.
   */
  const body = t("email.confirmBody", {
    greeting,
    name: `<strong style="color:${INK};">${name}</strong>`,
    concierge: `<strong style="color:${INK};">Concierge</strong>`,
  })

  const html = `<!DOCTYPE html>
<html lang="${LOCALE_TAGS[locale]}">
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
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
          <!-- Header -->
          <tr>
            <td style="background:${EMBER_RED};padding:28px 32px;">
              <span style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">WeeFly</span>
              <span style="font-size:12px;font-weight:700;color:#ffffff;opacity:0.85;margin-left:8px;text-transform:uppercase;letter-spacing:0.08em;">Concierge</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 8px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">
                ${escapeHtml(t("email.confirmHeading"))}
              </h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">
                ${body}
              </p>
            </td>
          </tr>

          <!-- Trip summary card -->
          <tr>
            <td style="padding:0 32px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:12px;padding:8px 20px;">
                <tr>
                  <td style="padding:14px 0 4px;">
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${EMBER_RED};">${escapeHtml(t("email.confirmSummaryTitle"))}</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${rows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Reassurance / CTA -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">
                ${escapeHtml(t("email.confirmNoAction"))}
              </p>
              <a href="https://weefly.africa" style="display:inline-block;background:${EMBER_RED};color:#ffffff;font-size:14px;font-weight:700;padding:13px 26px;border-radius:999px;">
                ${escapeHtml(t("email.confirmCta"))}
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 32px 32px;">
              <hr style="border:none;border-top:1px solid ${BORDER};margin:0 0 16px;" />
              <p style="margin:0;font-size:12px;line-height:1.6;color:#98A1AE;">
                ${escapeHtml(t("email.confirmFooter"))}
              </p>
              <p style="margin:12px 0 0;font-size:12px;color:#98A1AE;">
                ${escapeHtml(t("email.copyright", { year: new Date().getFullYear() }))}
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
    `${greeting} ${data.fullName},`,
    "",
    t("email.confirmTextIntro"),
    "",
    `${t("email.confirmSummaryTitle")}:`,
    `- ${t("email.rowTripType")}: ${t(`tripTypes.${data.tripType}`)}`,
    `- ${t("email.rowRoute")}: ${data.origin} -> ${data.destination}`,
    `- ${t("email.rowDates")}: ${datesValue}`,
    `- ${t("email.rowPassengers")}: ${passengersSummary(data, t)}`,
    `- ${t("email.rowCabin")}: ${t(`cabins.${data.cabinClass}`)}`,
    "",
    t("email.confirmTextThanks"),
    "© WeeFly Africa",
  ].join("\n")

  return { subject, html, text }
}
