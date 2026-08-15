/**
 * WeeFly Concierge — shared email building blocks.
 *
 * Labels, formatters and design tokens used by both the client confirmation
 * and the internal team notification, so a trip renders identically in the
 * customer's inbox and in the concierge team's inbox.
 */

import type { Translator } from "@/i18n/translate"

export interface TravelRequestSummary {
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

/** WeeFly design system tokens (inline CSS only — email clients strip <style>). */
export const EMBER_RED = "#EF5129"
export const INK = "#1A222E"
export const MUTED = "#5A6270"
export const BORDER = "#E4E8ED"
export const SURFACE_ALT = "#F5F7F9"

/*
 * As etiquetas do tipo de viagem, da classe e do tratamento estão nos
 * dicionários — `tripTypes.*`, `cabins.*` e `titles.*`. Um email ao cliente sai
 * na língua dele, e uma tabela fixa aqui só sabia escrever numa.
 */

/** Format a "YYYY-MM-DD" input value as "DD/MM/YYYY" without timezone drift. */
export function formatDate(value?: string): string {
  if (!value) return "—"
  const [y, m, d] = value.split("-")
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function passengersSummary(
  data: TravelRequestSummary,
  t: Translator
): string {
  const parts = [t("common.adults", { count: data.adults })]
  if (data.children > 0) {
    parts.push(t("common.children", { count: data.children }))
  }
  if (data.infants > 0) {
    parts.push(t("common.infants", { count: data.infants }))
  }
  return parts.join(" · ")
}

/** Departure date, plus the return leg when the trip is a round trip. */
export function datesSummary(data: TravelRequestSummary): string {
  return data.tripType === "round_trip"
    ? `${formatDate(data.departDate)} — ${formatDate(data.returnDate)}`
    : formatDate(data.departDate)
}

/** A single label/value row inside a summary card. */
export function summaryRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${MUTED};font-size:13px;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${INK};font-size:14px;font-weight:600;text-align:right;">${value}</td>
    </tr>`
}
