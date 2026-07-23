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
 */

export interface TravelRequestEmailData {
  title: "mr" | "ms"
  fullName: string
  tripType: "round_trip" | "one_way" | "multi_city"
  origin: string
  destination: string
  departDate: string
  returnDate?: string
  adults: number
  children: number
  infants: number
  cabinClass: "economy" | "business" | "first"
}

const EMBER_RED = "#EF5129"
const INK = "#1A222E"
const MUTED = "#5A6270"
const BORDER = "#E4E8ED"
const SURFACE_ALT = "#F5F7F9"

const TRIP_TYPE_LABELS: Record<TravelRequestEmailData["tripType"], string> = {
  round_trip: "Ida e volta",
  one_way: "Só ida",
  multi_city: "Multi-destino",
}

const CABIN_LABELS: Record<TravelRequestEmailData["cabinClass"], string> = {
  economy: "Económica",
  business: "Executiva",
  first: "Primeira",
}

/** Format a "YYYY-MM-DD" input value as "DD/MM/YYYY" without timezone drift. */
function formatDate(value?: string): string {
  if (!value) return "—"
  const [y, m, d] = value.split("-")
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function passengersSummary(data: TravelRequestEmailData): string {
  const parts: string[] = [
    `${data.adults} ${data.adults === 1 ? "adulto" : "adultos"}`,
  ]
  if (data.children > 0) {
    parts.push(`${data.children} ${data.children === 1 ? "criança" : "crianças"}`)
  }
  if (data.infants > 0) {
    parts.push(`${data.infants} ${data.infants === 1 ? "bebé" : "bebés"}`)
  }
  return parts.join(" · ")
}

/** A single label/value row inside the trip summary card. */
function summaryRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${MUTED};font-size:13px;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${INK};font-size:14px;font-weight:600;text-align:right;">${value}</td>
    </tr>`
}

export function buildTravelRequestConfirmationEmail(data: TravelRequestEmailData): {
  subject: string
  html: string
  text: string
} {
  const greeting = data.title === "ms" ? "Cara Sra." : "Caro Sr."
  const name = escapeHtml(data.fullName)
  const route = `${escapeHtml(data.origin)} → ${escapeHtml(data.destination)}`

  const datesValue =
    data.tripType === "round_trip"
      ? `${formatDate(data.departDate)} — ${formatDate(data.returnDate)}`
      : formatDate(data.departDate)

  const subject = "Recebemos o seu pedido de viagem · WeeFly Concierge"

  const rows = [
    summaryRow("Tipo de viagem", TRIP_TYPE_LABELS[data.tripType]),
    summaryRow("Trajeto", route),
    summaryRow("Datas", datesValue),
    summaryRow("Passageiros", passengersSummary(data)),
    summaryRow("Classe", CABIN_LABELS[data.cabinClass]),
  ].join("")

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<title>${subject}</title>
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
                Recebemos o seu pedido
              </h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">
                ${greeting} <strong style="color:${INK};">${name}</strong>, obrigado por escolher a WeeFly.
                Confirmamos a receção do seu pedido de viagem. A nossa equipa de
                <strong style="color:${INK};">Concierge</strong> irá retornar o contacto brevemente com as
                melhores opções e tarifas de voos, selecionadas ao detalhe para si.
              </p>
            </td>
          </tr>

          <!-- Trip summary card -->
          <tr>
            <td style="padding:0 32px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:12px;padding:8px 20px;">
                <tr>
                  <td style="padding:14px 0 4px;">
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${EMBER_RED};">Resumo do pedido</span>
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
                Não é necessário fazer mais nada neste momento. Um dos nossos especialistas
                entrará em contacto consigo através do email ou telefone indicados.
              </p>
              <a href="https://weefly.africa" style="display:inline-block;background:${EMBER_RED};color:#ffffff;font-size:14px;font-weight:700;padding:13px 26px;border-radius:999px;">
                Explorar a WeeFly
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 32px 32px;">
              <hr style="border:none;border-top:1px solid ${BORDER};margin:0 0 16px;" />
              <p style="margin:0;font-size:12px;line-height:1.6;color:#98A1AE;">
                Esta mensagem foi enviada pela WeeFly Concierge porque submeteu um pedido de viagem
                em weefly.africa. Se não reconhece este pedido, por favor ignore este email.
              </p>
              <p style="margin:12px 0 0;font-size:12px;color:#98A1AE;">
                © ${new Date().getFullYear()} WeeFly Africa · Cabo Verde
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
    "Recebemos o seu pedido de viagem. A nossa equipa de Concierge irá retornar o contacto brevemente com as melhores opções e tarifas de voos.",
    "",
    "Resumo do pedido:",
    `- Tipo de viagem: ${TRIP_TYPE_LABELS[data.tripType]}`,
    `- Trajeto: ${data.origin} -> ${data.destination}`,
    `- Datas: ${datesValue}`,
    `- Passageiros: ${passengersSummary(data)}`,
    `- Classe: ${CABIN_LABELS[data.cabinClass]}`,
    "",
    "Obrigado por escolher a WeeFly.",
    "© WeeFly Africa",
  ].join("\n")

  return { subject, html, text }
}
