/**
 * WeeFly Concierge — shared email building blocks.
 *
 * Labels, formatters and design tokens used by both the client confirmation
 * and the internal team notification, so a trip renders identically in the
 * customer's inbox and in the concierge team's inbox.
 */

import { existsSync } from "node:fs"
import { join } from "node:path"

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

// ── T-14 · a faixa laranja, igual em todo o lado ─────────────────────────────

const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")

/**
 * T-15 · o logótipo da marca, e não um "WeeFly" escrito à mão.
 *
 * Duas coisas ao mesmo tempo, e é de propósito:
 *
 *   · a imagem é o logótipo exportado por `scripts/build-brand-logo.mjs`, que
 *     lê os caminhos do mesmo componente que a aplicação desenha. Um logótipo
 *     com duas fontes diverge, e foi por isso que o email tinha o errado;
 *   · o `alt` é a palavra "WeeFly" com o tamanho e o peso da marca. Metade dos
 *     clientes de email bloqueia imagens por omissão, e o que eles mostram no
 *     lugar é o texto alternativo — que assim continua a ser a assinatura certa
 *     em vez de um quadrado partido.
 *
 * O ficheiro preferido é o PNG: o Gmail e o Outlook não desenham SVG dentro de
 * um `<img>`. Enquanto ele não existir usa-se o SVG, que serve os clientes que
 * o sabem ler — pôr lá `public/brand/weefly-logo-white.png` faz esta função
 * mudar de alvo sozinha, sem tocar em código.
 */
export function brandLogo(
  variant: "white" | "ember" | "ink" = "white",
  height = 30
): string {
  const base = siteBase()
  const name = variant === "white" ? "weefly-logo-white" : variant === "ink" ? "weefly-logo-ink" : "weefly-logo"

  /* Sem `NEXT_PUBLIC_SITE_URL` não há endereço absoluto, e um `src` relativo
     num email não aponta para lado nenhum. Fica só a palavra. */
  if (!base) return wordmark(variant, height)

  const color = variant === "white" ? "#ffffff" : variant === "ink" ? INK : EMBER_RED
  const file = `${name}.${brandExtension(name)}`

  return `<img src="${base}/brand/${file}" alt="WeeFly" height="${height}" style="height:${height}px;width:auto;border:0;outline:none;text-decoration:none;display:inline-block;font-family:'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif;font-size:${Math.round(height * 0.72)}px;font-weight:800;letter-spacing:-0.02em;color:${color};" />`
}

/**
 * `png` quando o ficheiro existe, `svg` enquanto não existir.
 *
 * Decidido no servidor e não com um `onerror` no HTML: os clientes de email
 * removem atributos de script, e um filtro de spam desconfia deles.
 *
 * O resultado é memorizado porque isto corre uma vez por email enviado e a
 * resposta só muda quando alguém acrescenta um ficheiro ao repositório.
 */
let brandFormat: "png" | "svg" | null = null

function brandExtension(name: string): "png" | "svg" {
  if (brandFormat) return brandFormat
  try {
    brandFormat = existsSync(join(process.cwd(), "public", "brand", `${name}.png`))
      ? "png"
      : "svg"
  } catch {
    brandFormat = "svg"
  }
  return brandFormat
}

/** O recurso: a palavra, com o peso da marca. */
function wordmark(variant: "white" | "ember" | "ink", height: number): string {
  const color = variant === "white" ? "#ffffff" : variant === "ink" ? INK : EMBER_RED
  return `<span style="font-size:${Math.round(height * 0.72)}px;font-weight:800;letter-spacing:-0.02em;color:${color};">WeeFly</span>`
}

/**
 * T-14 · a referência na faixa laranja, em cima e à direita.
 *
 * "A referência aparece na faixa laranja, no canto superior direito de cada
 * template e de cada ecrã do cliente. A mesma posição e o mesmo tratamento em
 * todo o lado."
 *
 * É a única coisa que o cliente cita ao telefone e a única que a equipa pede
 * primeiro. Estava em sítios diferentes em cada email — no meio de uma linha de
 * metadados num, ausente noutro — e num telemóvel isso é procurar.
 *
 * Em monospace e dentro de um `<span>` próprio para poder ser seleccionada com
 * um toque; sem `user-select:none` em lado nenhum por cima dela.
 */
export function masthead(
  reference: string | null | undefined,
  options: { background?: string; logo?: "white" | "ember" | "ink" } = {}
): string {
  const background = options.background ?? EMBER_RED
  const logo = brandLogo(options.logo ?? "white")

  const chip = reference
    ? `<span style="display:inline-block;font-family:'IBM Plex Mono','Courier New',monospace;font-size:15px;font-weight:600;letter-spacing:0.06em;color:#ffffff;background:rgba(0,0,0,0.16);border-radius:8px;padding:6px 12px;white-space:nowrap;">${escapeHtml(reference)}</span>`
    : ""

  return `<tr><td style="background:${background};padding:20px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="left" style="vertical-align:middle;">${logo}</td>
        <td align="right" style="vertical-align:middle;">${chip}</td>
      </tr>
    </table>
  </td></tr>`
}
