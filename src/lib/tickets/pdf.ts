/**
 * EM-02 · o PDF do bilhete — layout v2 (Ivandro, 19 out 2026).
 *
 * Duas páginas, e a divisão é a ordem por que alguém precisa das coisas:
 *
 *   1. **o que o passageiro precisa no balcão.** Localizador, rota, um cartão
 *      por trecho com o logótipo da companhia, horas, duração e uma linha por
 *      passageiro (bilhete, lugar, bagagem), a tabela de passageiros e a tarifa;
 *   2. **antes de viajar.** Bagagem por passageiro e por trecho, check-in,
 *      documentos, véspera, o que tratamos, contacto com QR e avisos legais.
 *
 * Regras que o documento cumpre:
 *
 *   · **nomes nunca são cortados.** Um nome longo passa para a segunda linha;
 *   · **cada trecho mostra o logótipo da sua companhia**, pelo código IATA, e
 *     sem logótipo um bloco com a sigla e o nome — nunca um espaço vazio;
 *   · **a duração usa o fuso de cada aeroporto** (ver `places.ts`);
 *   · **setas e avião desenhados em vector**, não com caracteres da fonte;
 *   · **a marca é a de quem vendeu**: WeeFly, ou o parceiro com "Powered by
 *     WeeFly" no rodapé da última página;
 *   · **nenhum valor monetário.** Um bilhete não é uma factura.
 *
 * Quando o conteúdo não cabe (muitos passageiros, muitos trechos), a página
 * continua noutra em vez de cortar: um voo partido a meio é um voo que se perde.
 *
 * SÓ SERVIDOR.
 */

import fontkit from "@pdf-lib/fontkit"
import QRCode from "qrcode"
import {
  PDFDocument,
  type PDFImage,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  setCharacterSpacing,
  type RGB,
} from "pdf-lib"

import { readAirlineLogos } from "@/lib/tickets/airline-logo"
import { MONO_TTF, SANSBOLD_TTF, SANS_TTF } from "./fonts"
import { WEEFLY_LOGO_PATHS, WEEFLY_LOGO_VIEWBOX } from "./weefly-logo"
import type {
  TicketBaggage,
  TicketData,
  TicketPassenger,
  TicketSegment,
} from "./data"

// ── medidas e cores ──────────────────────────────────────────────────────────

/** A4 em pontos. */
const PAGE = { w: 595.28, h: 841.89 }
const M = 40
const W = PAGE.w - M * 2
/** Onde o conteúdo pára: abaixo disto é o rodapé. */
const BOTTOM = PAGE.h - 44

function hex(value: string): RGB {
  const n = parseInt(value.replace("#", ""), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const EMBER = hex("#EE5128")
const EMBER_SOFT = hex("#FDEEE9")
const INK = hex("#1E2532")
const CHALK = hex("#F1F5F9")
const MUTED = hex("#64748B")
const LINE = hex("#E2E8F0")
const WHITE = rgb(1, 1, 1)
const PEACH = hex("#F9A68F")

interface Fonts {
  sans: PDFFont
  bold: PDFFont
  mono: PDFFont
}

interface Ctx {
  doc: PDFDocument
  page: PDFPage
  pages: PDFPage[]
  fonts: Fonts
  /** Os logótipos das companhias, já embutidos, por código IATA. */
  logos: Map<string, PDFImage>
  /** O logótipo do parceiro, quando a venda é de um parceiro com marca. */
  brandLogo: PDFImage | null
}

// ── primitivas (coordenadas a partir do topo da página) ──────────────────────

interface TextOptions {
  x: number
  /** A linha de base, medida a partir do topo da página. */
  y: number
  size?: number
  font?: PDFFont
  color?: RGB
  align?: "left" | "right" | "center"
  /** Espaçamento entre letras, em pontos. */
  spacing?: number
}

function widthOf(font: PDFFont, value: string, size: number, spacing = 0): number {
  return font.widthOfTextAtSize(value, size) + spacing * Math.max(0, value.length - 1)
}

function text(ctx: Ctx, value: string, options: TextOptions): number {
  const font = options.font ?? ctx.fonts.sans
  const size = options.size ?? 9
  const spacing = options.spacing ?? 0
  const body = value ?? ""
  const width = widthOf(font, body, size, spacing)
  const x =
    options.align === "right"
      ? options.x - width
      : options.align === "center"
        ? options.x - width / 2
        : options.x

  if (spacing) ctx.page.pushOperators(setCharacterSpacing(spacing))
  ctx.page.drawText(body, {
    x,
    y: PAGE.h - options.y,
    size,
    font,
    color: options.color ?? INK,
  })
  if (spacing) ctx.page.pushOperators(setCharacterSpacing(0))
  return width
}

/** Um rótulo pequeno, em maiúsculas e espaçado. */
function label(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  options: { color?: RGB; align?: TextOptions["align"]; size?: number } = {}
): number {
  return text(ctx, value.toUpperCase(), {
    x,
    y,
    size: options.size ?? 6.6,
    font: ctx.fonts.bold,
    color: options.color ?? MUTED,
    align: options.align,
    spacing: 0.9,
  })
}

/**
 * Parte um texto em linhas que caibam na largura. Uma palavra maior do que a
 * linha inteira é partida à letra — nunca cortada com reticências.
 */
function wrap(font: PDFFont, value: string, size: number, width: number): string[] {
  const words = (value ?? "").split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""

  const pushLong = (word: string) => {
    let chunk = ""
    for (const ch of word) {
      if (font.widthOfTextAtSize(chunk + ch, size) > width && chunk) {
        lines.push(chunk)
        chunk = ch
      } else {
        chunk += ch
      }
    }
    return chunk
  }

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = font.widthOfTextAtSize(word, size) > width ? pushLong(word) : word
  }
  if (line) lines.push(line)
  return lines.length ? lines : [""]
}

/** Um parágrafo com quebra por palavra. Devolve a altura ocupada. */
function paragraph(
  ctx: Ctx,
  value: string,
  options: {
    x: number
    y: number
    width: number
    size?: number
    font?: PDFFont
    color?: RGB
    leading?: number
  }
): number {
  const font = options.font ?? ctx.fonts.sans
  const size = options.size ?? 8.6
  const leading = options.leading ?? size * 1.42
  const lines = wrap(font, value, size, options.width)
  lines.forEach((line, i) =>
    text(ctx, line, {
      x: options.x,
      y: options.y + i * leading,
      size,
      font,
      color: options.color ?? INK,
    })
  )
  return lines.length * leading
}

/** Um parágrafo com troços em fontes diferentes (o localizador a negrito). */
function rich(
  ctx: Ctx,
  runs: { text: string; font?: PDFFont }[],
  options: { x: number; y: number; width: number; size?: number; leading?: number; color?: RGB }
): number {
  const size = options.size ?? 8.6
  const leading = options.leading ?? size * 1.42
  const words: { text: string; font: PDFFont }[] = []
  for (const run of runs) {
    for (const word of run.text.split(/\s+/).filter(Boolean)) {
      words.push({ text: word, font: run.font ?? ctx.fonts.sans })
    }
  }
  const space = ctx.fonts.sans.widthOfTextAtSize(" ", size)
  let x = 0
  let line = 0
  for (const word of words) {
    const w = word.font.widthOfTextAtSize(word.text, size)
    if (x > 0 && x + w > options.width) {
      line += 1
      x = 0
    }
    text(ctx, word.text, {
      x: options.x + x,
      y: options.y + line * leading,
      size,
      font: word.font,
      color: options.color ?? INK,
    })
    x += w + space
  }
  return (line + 1) * leading
}

const K = 0.5523

/** O caminho de um rectângulo de cantos redondos, em coordenadas SVG. */
function roundedPath(
  w: number,
  h: number,
  r: number | [number, number, number, number]
): string {
  const [tl, tr, br, bl] = typeof r === "number" ? [r, r, r, r] : r
  return [
    `M ${tl} 0`,
    `L ${w - tr} 0`,
    tr ? `C ${w - tr + tr * K} 0 ${w} ${tr - tr * K} ${w} ${tr}` : "",
    `L ${w} ${h - br}`,
    br ? `C ${w} ${h - br + br * K} ${w - br + br * K} ${h} ${w - br} ${h}` : "",
    `L ${bl} ${h}`,
    bl ? `C ${bl - bl * K} ${h} 0 ${h - bl + bl * K} 0 ${h - bl}` : "",
    `L 0 ${tl}`,
    tl ? `C 0 ${tl - tl * K} ${tl - tl * K} 0 ${tl} 0` : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ")
}

function roundRect(
  ctx: Ctx,
  x: number,
  top: number,
  w: number,
  h: number,
  options: {
    r?: number | [number, number, number, number]
    fill?: RGB
    border?: RGB
    borderWidth?: number
  } = {}
): void {
  ctx.page.drawSvgPath(roundedPath(w, h, options.r ?? 8), {
    x,
    y: PAGE.h - top,
    ...(options.fill ? { color: options.fill } : {}),
    ...(options.border
      ? { borderColor: options.border, borderWidth: options.borderWidth ?? 0.7 }
      : {}),
  })
}

function hline(
  ctx: Ctx,
  y: number,
  x1 = M,
  x2 = PAGE.w - M,
  options: { color?: RGB; dash?: boolean; thickness?: number } = {}
): void {
  ctx.page.drawLine({
    start: { x: x1, y: PAGE.h - y },
    end: { x: x2, y: PAGE.h - y },
    thickness: options.thickness ?? 0.6,
    color: options.color ?? LINE,
    ...(options.dash ? { dashArray: [2.2, 2.2] } : {}),
  })
}

/** A pastilha de uma etiqueta de passageiro: P1, P2, P3. */
function tag(ctx: Ctx, value: string, x: number, y: number): number {
  const w = Math.max(16, widthOf(ctx.fonts.bold, value, 6.8) + 8)
  roundRect(ctx, x, y - 8.2, w, 11, { r: 3, fill: INK })
  text(ctx, value, {
    x: x + w / 2,
    y: y,
    size: 6.8,
    font: ctx.fonts.bold,
    color: WHITE,
    align: "center",
  })
  return w
}

/** O título de uma secção: rótulo espaçado e uma linha até à margem. */
function section(ctx: Ctx, title: string, y: number): number {
  const w = label(ctx, title, M, y, { color: INK, size: 7 })
  hline(ctx, y - 2.5, M + w + 10, PAGE.w - M)
  return y + 14
}

// ── vectores: setas, avião, logótipo ─────────────────────────────────────────

/** Uma seta horizontal, em traço. `dir` 1 aponta à direita. */
function arrow(
  ctx: Ctx,
  x: number,
  y: number,
  length: number,
  options: { dir?: 1 | -1; color?: RGB; width?: number; head?: number } = {}
): void {
  const dir = options.dir ?? 1
  const head = options.head ?? 3
  const [from, to] = dir === 1 ? [0, length] : [length, 0]
  ctx.page.drawSvgPath(
    `M ${from} 0 L ${to} 0 M ${to - dir * head} ${-head} L ${to} 0 L ${to - dir * head} ${head}`,
    {
      x,
      y: PAGE.h - y,
      borderColor: options.color ?? INK,
      borderWidth: options.width ?? 1,
    }
  )
}

/** As duas setas de ida e volta (⇄), em vector. */
function swapArrows(ctx: Ctx, x: number, y: number, size: number): void {
  arrow(ctx, x, y - size * 0.25, size, { color: EMBER, width: 1.6, head: size * 0.22 })
  arrow(ctx, x, y + size * 0.25, size, { dir: -1, color: EMBER, width: 1.6, head: size * 0.22 })
}

/** Um avião a apontar para a direita, centrado em (cx, cy). */
function plane(ctx: Ctx, cx: number, cy: number, size: number): void {
  const s = size / 24
  ctx.page.drawSvgPath(
    "M21 12 C21 11.2 20.2 10.8 19.5 10.8 L14.5 10.8 L9.5 3.5 L7.8 3.5 L10.3 10.8 L5.5 10.8 L3.8 8.5 L2.5 8.5 L3.5 12 L2.5 15.5 L3.8 15.5 L5.5 13.2 L10.3 13.2 L7.8 20.5 L9.5 20.5 L14.5 13.2 L19.5 13.2 C20.2 13.2 21 12.8 21 12 Z",
    { x: cx - 12 * s, y: PAGE.h - (cy - 12 * s), scale: s, color: EMBER }
  )
}

/** O logótipo da WeeFly em vector, pela altura. Devolve a largura. */
function weeflyLogo(ctx: Ctx, x: number, top: number, height: number): number {
  const scale = height / WEEFLY_LOGO_VIEWBOX.h
  for (const d of WEEFLY_LOGO_PATHS) {
    ctx.page.drawSvgPath(d, { x, y: PAGE.h - top, scale, color: EMBER })
  }
  return WEEFLY_LOGO_VIEWBOX.w * scale
}

/** O logótipo de quem vendeu: o do parceiro, ou o da WeeFly. */
function brandMark(ctx: Ctx, x: number, top: number, height: number, maxWidth: number): number {
  if (ctx.brandLogo) {
    const ratio = ctx.brandLogo.width / ctx.brandLogo.height
    const w = Math.min(height * ratio, maxWidth)
    const h = w / ratio
    ctx.page.drawImage(ctx.brandLogo, {
      x,
      y: PAGE.h - top - (height + h) / 2,
      width: w,
      height: h,
    })
    return w
  }
  return weeflyLogo(ctx, x, top, height)
}

/**
 * O logótipo de uma companhia dentro de uma caixa, ou o bloco com a sigla e o
 * nome quando não há ficheiro. Nunca fica vazio.
 */
function carrierBox(
  ctx: Ctx,
  code: string | null,
  name: string,
  x: number,
  top: number,
  w: number,
  h: number
): void {
  roundRect(ctx, x, top, w, h, { r: 7, fill: WHITE, border: LINE })
  const logo = ctx.logos.get((code ?? "").toUpperCase())
  if (logo) {
    const ratio = logo.width / logo.height
    let lh = h - 12
    let lw = lh * ratio
    if (lw > w - 16) {
      lw = w - 16
      lh = lw / ratio
    }
    ctx.page.drawImage(logo, {
      x: x + (w - lw) / 2,
      y: PAGE.h - top - (h + lh) / 2,
      width: lw,
      height: lh,
    })
    return
  }
  /* Sem logótipo: a sigla num quadrado e o nome ao lado. */
  const badge = Math.min(h - 12, 24)
  roundRect(ctx, x + 8, top + (h - badge) / 2, badge, badge, { r: 5, fill: CHALK })
  text(ctx, (code ?? "—").toUpperCase(), {
    x: x + 8 + badge / 2,
    y: top + h / 2 + 3,
    size: 9,
    font: ctx.fonts.mono,
    align: "center",
  })
  const lines = wrap(ctx.fonts.bold, name || code || "—", 7.4, w - badge - 24).slice(0, 2)
  const start = top + h / 2 + 2.6 - ((lines.length - 1) * 9) / 2
  lines.forEach((line, i) =>
    text(ctx, line, { x: x + badge + 15, y: start + i * 9, size: 7.4, font: ctx.fonts.bold })
  )
}

// ── formatação ───────────────────────────────────────────────────────────────

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

function ymd(value: string | null): [number, number, number] | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** "22 out 2026" — sem depender do ICU do servidor. */
function longDate(value: string | null): string {
  const d = ymd(value)
  return d ? `${d[2]} ${MONTHS[d[1] - 1]} ${d[0]}` : "—"
}

/** "22 out". */
function shortDate(value: string | null): string {
  const d = ymd(value)
  return d ? `${d[2]} ${MONTHS[d[1] - 1]}` : "—"
}

/** "Quinta, 22 out 2026". */
function weekdayDate(value: string | null): string {
  const d = ymd(value)
  if (!d) return "—"
  const day = new Date(Date.UTC(d[0], d[1] - 1, d[2])).getUTCDay()
  return `${WEEKDAYS[day]}, ${longDate(value)}`
}

/** "22 a 29 out 2026", "28 out a 3 nov 2026". */
function dateRange(from: string | null, to: string | null): string {
  const a = ymd(from)
  const b = ymd(to)
  if (!a) return "—"
  if (!b || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2])) return longDate(from)
  if (a[0] !== b[0]) return `${longDate(from)} a ${longDate(to)}`
  if (a[1] !== b[1]) return `${shortDate(from)} a ${longDate(to)}`
  return `${a[2]} a ${longDate(to)}`
}

/** "08:40" da hora local do aeroporto, sem passar por `Date`. Ver a 0005. */
const clock = (value: string | null): string => value?.slice(11, 16) ?? "--:--"

/** "4h 10m". */
function duration(minutes: number | null): string {
  if (minutes === null) return ""
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, "0")}m`
}

/** "15 out 2026, 13:40" na hora de Cabo Verde. */
function issuedLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Atlantic/Cape_Verde",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
  return `${longDate(`${get("year")}-${get("month")}-${get("day")}`)}, ${get("hour")}:${get("minute")}`
}

const CABIN_PT: Record<string, string> = {
  economy: "Económica",
  premium_economy: "Económica premium",
  business: "Executiva",
  first: "Primeira",
}

const TYPE_PT: Record<string, string> = {
  adult: "Adulto",
  child: "Criança",
  infant: "Bebé",
  infant_seat: "Bebé c/ assento",
  infant_lap: "Bebé de colo",
}

/** "047 2134567890" — o prefixo da companhia separado do documento. */
function ticketNo(value: string | null): string {
  if (!value) return "—"
  const digits = value.replace(/\D/g, "")
  return digits.length === 13 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : value
}

/** "1 × 23 kg", "1", "—". */
function pieces(count: number | null, kg: number | null): string {
  if (count === null) return "—"
  return count > 0 && kg !== null ? `${count} × ${kg} kg` : String(count)
}

function bagLine(bag: TicketBaggage): string {
  return `Mão ${pieces(bag.cabinPieces, bag.cabinKg)} · Porão ${pieces(bag.checkedPieces, bag.checkedKg)}`
}

function personalItem(bag: TicketBaggage): string {
  return bag.personal === false ? "Sem artigo pessoal" : "1 · debaixo do banco"
}

/** "22OCT26" → "22OCT": o ano não ajuda ninguém a ler a validade. */
function shortValidity(value: string): string {
  return value.replace(/^(\d{1,2}[A-Z]{3})\d{2}$/i, "$1").toUpperCase()
}

function legName(direction: string): string {
  return direction === "volta" ? "Volta" : "Ida"
}

// ── o código 2D ──────────────────────────────────────────────────────────────

/** O código, desenhado módulo a módulo: um PNG perde nitidez a imprimir. */
function drawQr(ctx: Ctx, payload: string, x: number, top: number, size: number): void {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" })
  const count = qr.modules.size
  const data = qr.modules.data
  const cell = size / count
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!data[row * count + col]) continue
      ctx.page.drawRectangle({
        x: x + col * cell,
        y: PAGE.h - top - (row + 1) * cell,
        width: cell + 0.05,
        height: cell + 0.05,
        color: INK,
      })
    }
  }
}

// ── páginas ──────────────────────────────────────────────────────────────────

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE.w, PAGE.h])
  ctx.pages.push(ctx.page)
  /* A faixa Ember no topo de todas as páginas. */
  ctx.page.drawRectangle({ x: 0, y: PAGE.h - 9, width: PAGE.w, height: 9, color: EMBER })
}

/** O cabeçalho: logótipo, título e localizador. Devolve onde o conteúdo começa. */
function header(
  ctx: Ctx,
  data: TicketData,
  title: string,
  subtitle: string,
  options: { large?: boolean } = {}
): number {
  const large = options.large ?? false
  const logoH = large ? 44 : 34
  const top = large ? 32 : 30
  const logoW = brandMark(ctx, M, top, logoH, 110)

  const dividerX = M + logoW + 14
  ctx.page.drawLine({
    start: { x: dividerX, y: PAGE.h - top - 2 },
    end: { x: dividerX, y: PAGE.h - top - logoH + 2 },
    thickness: 0.7,
    color: LINE,
  })
  text(ctx, title, {
    x: dividerX + 14,
    y: top + logoH / 2 - 1,
    size: large ? 12.5 : 12,
    font: ctx.fonts.bold,
  })
  text(ctx, subtitle, {
    x: dividerX + 14,
    y: top + logoH / 2 + 12,
    size: 8.4,
    color: MUTED,
  })

  label(ctx, "Localizador", PAGE.w - M, top + 6, { align: "right" })
  text(ctx, data.pnr, {
    x: PAGE.w - M,
    y: top + (large ? 31 : 24),
    size: large ? 25 : 16,
    font: ctx.fonts.mono,
    color: EMBER,
    align: "right",
    spacing: large ? 1.5 : 1,
  })
  if (large) {
    text(ctx, `Emitido a ${issuedLabel(data.issuedAt)}`, {
      x: PAGE.w - M,
      y: top + 44,
      size: 7.4,
      color: MUTED,
      align: "right",
    })
  }
  return top + logoH + (large ? 20 : 24)
}

function footers(ctx: Ctx, data: TicketData): void {
  const total = ctx.pages.length
  ctx.pages.forEach((page, index) => {
    ctx.page = page
    hline(ctx, PAGE.h - 36)
    const last = index === total - 1
    const left =
      last && data.brand.poweredByWeefly
        ? `${data.brand.footer} · Powered by WeeFly`
        : data.brand.footer
    text(ctx, left, { x: M, y: PAGE.h - 22, size: 6.8, color: MUTED })
    text(ctx, `${data.documentNumber} · ${index + 1} / ${total}`, {
      x: PAGE.w - M,
      y: PAGE.h - 22,
      size: 6.8,
      font: ctx.fonts.mono,
      color: MUTED,
      align: "right",
    })
  })
}

/** Garante espaço; sem ele, continua numa página nova. */
function ensure(ctx: Ctx, data: TicketData, y: number, needed: number, title: string): number {
  if (y + needed <= BOTTOM) return y
  newPage(ctx)
  return header(ctx, data, title, "Continuação")
}

// ── página 1 · o balcão ──────────────────────────────────────────────────────

function summary(ctx: Ctx, data: TicketData, y: number): number {
  const h = 100
  roundRect(ctx, M, y, W, h, { r: 10, fill: CHALK })

  const outbound = data.segments.filter((s) => s.direction === "ida")
  const inbound = data.segments.filter((s) => s.direction === "volta")
  const leg = outbound.length > 0 ? outbound : data.segments
  const first = leg[0]
  const last = leg[leg.length - 1]
  const roundTrip = inbound.length > 0

  const from = first?.originCity || first?.origin || "—"
  const to = last?.destinationCity || last?.destination || "—"

  /* A rota em letra grande, a encolher se as cidades forem compridas. */
  let size = 19
  const room = 270
  const arrowW = () => size * 1.05
  while (
    size > 11 &&
    widthOf(ctx.fonts.bold, from, size) + widthOf(ctx.fonts.bold, to, size) + arrowW() + 20 > room
  ) {
    size -= 0.5
  }
  const x0 = M + 18
  const base = y + 36
  const w1 = text(ctx, from, { x: x0, y: base, size, font: ctx.fonts.bold })
  const ax = x0 + w1 + 10
  if (roundTrip) swapArrows(ctx, ax, base - size * 0.33, arrowW())
  else arrow(ctx, ax, base - size * 0.33, arrowW(), { color: EMBER, width: 1.6, head: size * 0.22 })
  text(ctx, to, { x: ax + arrowW() + 10, y: base, size, font: ctx.fonts.bold })

  const kind = roundTrip ? "Ida e volta" : data.segments.length > 1 && outbound.length === 0 ? "Multidestino" : "Só ida"
  const lastSegment = data.segments[data.segments.length - 1]
  const range = dateRange(first?.departAt ?? null, roundTrip ? (lastSegment?.departAt ?? null) : null)
  const paxLabel = `${data.passengers.length} passageiro${data.passengers.length === 1 ? "" : "s"}`
  const kx = text(ctx, `${kind} · `, { x: x0, y: base + 18, size: 8.6, color: INK })
  const rx = text(ctx, range, { x: x0 + kx, y: base + 18, size: 8.6, font: ctx.fonts.bold })
  text(ctx, ` · ${paxLabel}`, { x: x0 + kx + rx, y: base + 18, size: 8.6 })
  const px = text(ctx, "Pedido ", { x: x0, y: base + 35, size: 8.6 })
  text(ctx, data.reference || "—", { x: x0 + px, y: base + 35, size: 8.6, font: ctx.fonts.mono })

  /* Viaja com: a companhia emissora, ou a do primeiro voo. */
  const code = data.issuingCarrier ?? first?.carrierCode ?? null
  const name = data.issuingCarrierLabel || first?.carrierLabel || ""
  const boxW = 118
  const boxX = PAGE.w - M - 18 - 64 - 22 - boxW
  label(ctx, "Viaja com", boxX + boxW / 2, y + 27, { align: "center" })
  carrierBox(ctx, code, name, boxX, y + 37, boxW, 42)

  /* O código 2D: a página do cliente, com o bilhete e as alterações. */
  const qrSize = 58
  const qrX = PAGE.w - M - 18 - qrSize
  roundRect(ctx, qrX - 4, y + 14, qrSize + 8, qrSize + 8, { r: 5, fill: WHITE })
  drawQr(ctx, data.link, qrX, y + 18, qrSize)
  text(ctx, "A sua página", { x: qrX + qrSize / 2, y: y + 91, size: 6.4, color: MUTED, align: "center" })

  return y + h + 22
}

function flightCard(ctx: Ctx, data: TicketData, segment: TicketSegment, y: number): number {
  const nameW = 150
  const nameSize = 7.6
  const rows = segment.seats.map((seat) => {
    const passenger = data.passengers.find((p) => p.tag === seat.tag)
    const lines = wrap(ctx.fonts.bold, passenger?.documentName ?? seat.tag, nameSize, nameW)
    return { seat, lines, h: Math.max(15, lines.length * 9.6 + 5.4) }
  })
  const bandH = 25
  const bodyH = 86
  const rowsH = rows.reduce((sum, r) => sum + r.h, 0) + 10
  const h = bandH + bodyH + rowsH

  y = ensure(ctx, data, y, h + 12, "Bilhete eletrónico")

  roundRect(ctx, M, y, W, h, { r: 10, fill: WHITE, border: LINE })
  roundRect(ctx, M + 0.35, y + 0.35, W - 0.7, bandH, { r: [10, 10, 0, 0], fill: EMBER_SOFT })

  /* A faixa: IDA/VOLTA, o dia, e o voo com a cabina. */
  const legText =
    segment.legCount > 1
      ? `${legName(segment.direction)} ${segment.legIndex}/${segment.legCount}`.toUpperCase()
      : legName(segment.direction).toUpperCase()
  const pillW = widthOf(ctx.fonts.bold, legText, 7, 0.8) + 18
  roundRect(ctx, M + 14, y + 6.5, pillW, 13, { r: 6.5, fill: EMBER })
  text(ctx, legText, {
    x: M + 14 + pillW / 2,
    y: y + 15.6,
    size: 7,
    font: ctx.fonts.bold,
    color: WHITE,
    align: "center",
    spacing: 0.8,
  })
  text(ctx, weekdayDate(segment.departAt), {
    x: M + 14 + pillW + 9,
    y: y + 16,
    size: 8.8,
    font: ctx.fonts.bold,
  })

  const cabin = [
    CABIN_PT[segment.cabin] ?? segment.cabin,
    segment.bookingClass ? `(${segment.bookingClass})` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const flight = [segment.carrierCode, segment.flightNumber].filter(Boolean).join(" ") || "—"
  let rx = PAGE.w - M - 14
  rx -= text(ctx, ` · ${cabin}`, { x: rx, y: y + 16, size: 8, color: INK, align: "right" })
  rx -= text(ctx, flight, { x: rx, y: y + 16, size: 8, font: ctx.fonts.bold, align: "right" })
  text(ctx, "Voo ", { x: rx, y: y + 16, size: 8, color: INK, align: "right" })

  /* O corpo: companhia à esquerda, partida, duração, chegada. */
  const body = y + bandH
  carrierBox(ctx, segment.carrierCode, segment.carrierLabel, M + 14, body + 11, 112, 36)
  const carrierLines = wrap(ctx.fonts.bold, segment.carrierLabel || segment.carrierCode || "—", 8, 118)
  carrierLines.slice(0, 2).forEach((line, i) =>
    text(ctx, line, { x: M + 14, y: body + 60 + i * 9.5, size: 8, font: ctx.fonts.bold })
  )
  if (segment.aircraft) {
    text(ctx, segment.aircraft, {
      x: M + 14,
      y: body + 60 + Math.min(2, carrierLines.length) * 9.5 + 0.5,
      size: 7.2,
      color: MUTED,
    })
  }

  const depX = M + 145
  const arrX = PAGE.w - M - 14
  text(ctx, clock(segment.departAt), { x: depX, y: body + 34, size: 20, font: ctx.fonts.mono })
  const ow = text(ctx, segment.origin ?? "—", { x: depX, y: body + 50, size: 8.8, font: ctx.fonts.bold })
  text(ctx, ` ${segment.originCity}`, { x: depX + ow, y: body + 50, size: 8.8 })
  text(
    ctx,
    [shortDate(segment.departAt), segment.terminalFrom ? `Terminal ${segment.terminalFrom}` : ""]
      .filter(Boolean)
      .join(" · "),
    { x: depX, y: body + 62, size: 7.2, color: MUTED }
  )

  text(ctx, clock(segment.arriveAt), { x: arrX, y: body + 34, size: 20, font: ctx.fonts.mono, align: "right" })
  const dw = text(ctx, segment.destination ?? "—", {
    x: arrX,
    y: body + 50,
    size: 8.8,
    font: ctx.fonts.bold,
    align: "right",
  })
  text(ctx, `${segment.destinationCity} `, { x: arrX - dw, y: body + 50, size: 8.8, align: "right" })
  text(
    ctx,
    [shortDate(segment.arriveAt), segment.terminalTo ? `Terminal ${segment.terminalTo}` : ""]
      .filter(Boolean)
      .join(" · "),
    { x: arrX, y: body + 62, size: 7.2, color: MUTED, align: "right" }
  )

  /* A linha do meio: duração, avião, escalas. */
  const midL = depX + 75
  const midR = arrX - 75
  const mid = (midL + midR) / 2
  const dur = duration(segment.durationMinutes)
  if (dur) text(ctx, dur, { x: mid, y: body + 22, size: 8, font: ctx.fonts.bold, align: "center" })
  hline(ctx, body + 30, midL, mid - 9, { dash: true, color: hex("#CBD5E1") })
  hline(ctx, body + 30, mid + 9, midR, { dash: true, color: hex("#CBD5E1") })
  plane(ctx, mid, body + 30, 12)
  const stop =
    segment.legIndex < segment.legCount
      ? `Ligação em ${segment.destinationCity || segment.destination}${segment.layoverMinutes !== null ? ` · ${duration(segment.layoverMinutes)}` : ""}`
      : "Direto"
  text(ctx, stop, { x: mid, y: body + 43, size: 7.4, color: MUTED, align: "center" })

  /* Uma linha por passageiro: bilhete, lugar e bagagem neste voo. */
  const rowsTop = body + bodyH
  hline(ctx, rowsTop, M + 14, PAGE.w - M - 14, { dash: true })
  let ry = rowsTop + 8
  for (const row of rows) {
    const mid = ry + row.h / 2
    const lineY = mid + 2.6 - ((row.lines.length - 1) * 9.6) / 2
    tag(ctx, row.seat.tag, M + 14, mid + 2.8)
    row.lines.forEach((line, i) =>
      text(ctx, line, { x: M + 40, y: lineY + i * 9.6, size: nameSize, font: ctx.fonts.bold })
    )
    const bx = M + 196
    const bw = text(ctx, "Bilhete ", { x: bx, y: mid + 2.6, size: 7.4, color: MUTED })
    text(ctx, ticketNo(row.seat.ticketNumber), { x: bx + bw, y: mid + 2.6, size: 7.6, font: ctx.fonts.mono })
    const sx = M + 316
    const sw = text(ctx, "Lugar ", { x: sx, y: mid + 2.6, size: 7.4, color: MUTED })
    text(ctx, row.seat.seat ?? "A atribuir", { x: sx + sw, y: mid + 2.6, size: 7.6 })
    text(ctx, bagLine(row.seat.baggage), {
      x: PAGE.w - M - 14,
      y: mid + 2.6,
      size: 7.4,
      align: "right",
    })
    ry += row.h
  }

  return y + h + 12
}

function passengerTable(ctx: Ctx, data: TicketData, y: number): number {
  const cols = { name: M + 30, type: M + 300, passport: M + 360, ticket: M + 440 }
  const nameW = cols.type - cols.name - 12
  const rows = data.passengers.map((p) => ({
    passenger: p,
    lines: wrap(ctx.fonts.bold, p.documentName, 8.2, nameW),
  }))
  const height = 30 + rows.reduce((sum, r) => sum + 14 + r.lines.length * 10.4, 0)

  y = ensure(ctx, data, y, Math.min(height, 120) + 14, "Bilhete eletrónico")
  y = section(ctx, "Passageiros", y)

  label(ctx, "Nome no documento", cols.name, y + 6)
  label(ctx, "Tipo", cols.type, y + 6)
  label(ctx, "Passaporte", cols.passport, y + 6)
  label(ctx, "Nº de bilhete", cols.ticket, y + 6)
  y += 13
  hline(ctx, y)

  for (const row of rows) {
    const h = 14 + row.lines.length * 10.4
    y = ensure(ctx, data, y, h, "Bilhete eletrónico")
    const base = y + 7 + 8.4
    tag(ctx, row.passenger.tag, M + 4, base)
    row.lines.forEach((line, i) =>
      text(ctx, line, { x: cols.name, y: base + i * 10.4, size: 8.2, font: ctx.fonts.bold })
    )
    text(ctx, TYPE_PT[row.passenger.type] ?? row.passenger.type, { x: cols.type, y: base, size: 8.2 })
    text(ctx, row.passenger.passportNumber ?? "—", { x: cols.passport, y: base, size: 7.8, font: ctx.fonts.mono })
    text(ctx, ticketNo(row.passenger.ticketNumber), { x: cols.ticket, y: base, size: 7.8, font: ctx.fonts.mono })
    y += h
    hline(ctx, y)
  }
  return y + 18
}

function fareBlock(ctx: Ctx, data: TicketData, y: number): number {
  const byDirection = (["ida", "volta"] as const)
    .map((direction) => data.segments.filter((s) => s.direction === direction))
    .filter((list) => list.length > 0)

  const bases = byDirection
    .map((list) =>
      Array.from(new Set(list.map((s) => s.fareBasis).filter((v): v is string => Boolean(v)))).join("/")
    )
    .filter(Boolean)
    .join(" · ")

  const firstCabin = data.segments[0]?.cabin ?? "economy"
  const boxes: { title: string; value: string; mono?: boolean; soft?: boolean }[] = [
    { title: "Tarifa", value: data.fare.name || CABIN_PT[firstCabin] || "—" },
    {
      title: "Reembolso",
      value: data.fare.nonRefundable ? "Não reembolsável" : data.fare.refund || "Conforme a tarifa",
      soft: data.fare.nonRefundable,
    },
    { title: "Alterações", value: data.fare.change || "Conforme a tarifa" },
    { title: "Base tarifária", value: bases || data.fareBasis || "—", mono: true },
  ]

  const gap = 7
  const bw = (W - gap * 3) / 4
  const lines = boxes.map((b) =>
    wrap(b.mono ? ctx.fonts.mono : ctx.fonts.bold, b.value, 8.2, bw - 20).slice(0, 4)
  )
  const bh = Math.max(52, 30 + Math.max(...lines.map((l) => l.length)) * 10.6)

  y = ensure(ctx, data, y, bh + 40, "Bilhete eletrónico")
  y = section(ctx, "Tarifa", y)
  boxes.forEach((b, i) => {
    const x = M + i * (bw + gap)
    roundRect(ctx, x, y, bw, bh, { r: 8, fill: b.soft ? EMBER_SOFT : CHALK })
    label(ctx, b.title, x + 10, y + 15)
    lines[i].forEach((line, j) =>
      text(ctx, line, {
        x: x + 10,
        y: y + 30 + j * 10.6,
        size: 8.2,
        font: b.mono ? ctx.fonts.mono : ctx.fonts.bold,
      })
    )
  })
  y += bh + 14

  /* Endossos e validades, numa linha: "Ida válida só a 22OCT". */
  const validity = byDirection.map((list) => {
    const s = list[0]
    const name = legName(s.direction)
    const nvb = s.nvb ? shortValidity(s.nvb) : null
    const nva = s.nva ? shortValidity(s.nva) : null
    if (nvb && nva) return nvb === nva ? `${name} válida só a ${nva}` : `${name} válida de ${nvb} a ${nva}`
    if (nva) return `${name} válida até ${nva}`
    if (nvb) return `${name} válida a partir de ${nvb}`
    return ""
  })
  const endorsements = [data.endorsements ? `Endossos: ${data.endorsements}` : "", ...validity]
    .filter(Boolean)
    .join(" · ")
  if (endorsements) {
    y += paragraph(ctx, endorsements, { x: M, y, width: W, size: 7.4, font: ctx.fonts.mono, color: MUTED })
  }
  return y
}

function pageOne(ctx: Ctx, data: TicketData): void {
  newPage(ctx)
  let y = header(ctx, data, "Bilhete eletrónico", "Itinerário e passageiros", { large: true })
  y = summary(ctx, data, y)
  y = section(ctx, "Itinerário", y)
  for (const segment of data.segments) {
    y = flightCard(ctx, data, segment, y)
  }
  y = passengerTable(ctx, data, y + 12)
  fareBlock(ctx, data, y)
}

// ── página 2 · antes de viajar ───────────────────────────────────────────────

function baggageTable(ctx: Ctx, data: TicketData, y: number): number {
  y = section(ctx, "Bagagem incluída", y)
  const cols = { name: M + 30, leg: M + 262, personal: M + 332, cabin: M + 424, hold: M + 472 }
  label(ctx, "Passageiro", cols.name, y + 6)
  label(ctx, "Trecho", cols.leg, y + 6)
  label(ctx, "Artigo pessoal", cols.personal, y + 6)
  label(ctx, "Mão", cols.cabin, y + 6)
  label(ctx, "Porão", cols.hold, y + 6)
  y += 13
  hline(ctx, y)

  for (const passenger of data.passengers) {
    const lines = wrap(ctx.fonts.bold, passenger.documentName, 8.2, cols.leg - cols.name - 12)
    data.segments.forEach((segment, index) => {
      const seat = segment.seats.find((s) => s.passengerId === passenger.id)
      const bag = seat?.baggage ?? {
        personal: null,
        cabinPieces: null,
        cabinKg: null,
        checkedPieces: null,
        checkedKg: null,
      }
      const h = index === 0 ? Math.max(22, 12 + lines.length * 10.4) : 22
      y = ensure(ctx, data, y, h, "Antes de viajar")
      const base = y + 14
      if (index === 0) {
        tag(ctx, passenger.tag, M + 4, base)
        lines.forEach((line, i) =>
          text(ctx, line, { x: cols.name, y: base + i * 10.4, size: 8.2, font: ctx.fonts.bold })
        )
      }
      const ow = text(ctx, segment.origin ?? "—", { x: cols.leg, y: base, size: 7.6, font: ctx.fonts.mono })
      arrow(ctx, cols.leg + ow + 4, base - 2.6, 9, { color: MUTED, width: 0.8, head: 2.2 })
      text(ctx, segment.destination ?? "—", { x: cols.leg + ow + 17, y: base, size: 7.6, font: ctx.fonts.mono })
      text(ctx, personalItem(bag), { x: cols.personal, y: base, size: 7.8 })
      text(ctx, pieces(bag.cabinPieces, bag.cabinKg), { x: cols.cabin, y: base, size: 7.8 })
      text(ctx, pieces(bag.checkedPieces, bag.checkedKg), { x: cols.hold, y: base, size: 7.8 })
      y += h
      hline(ctx, y)
    })
  }

  const carrier = data.issuingCarrierLabel || data.segments[0]?.carrierLabel || "da companhia"
  y += 6
  y += paragraph(
    ctx,
    `Pesos e medidas máximas são os da ${carrier}. Bagagem extra compra-se connosco ou no site da companhia, antes do voo e mais barato do que no aeroporto.`,
    { x: M, y: y + 6, width: W, size: 7.4, color: MUTED }
  )
  return y + 16
}

function infoCard(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  draw: (x: number, y: number, w: number) => void
): void {
  roundRect(ctx, x, y, w, h, { r: 10, fill: WHITE, border: LINE })
  label(ctx, title, x + 13, y + 18, { color: EMBER, size: 6.8 })
  draw(x + 13, y + 33, w - 26)
}

function bullets(ctx: Ctx, items: string[], x: number, y: number, w: number): number {
  let used = 0
  for (const item of items) {
    ctx.page.drawCircle({ x: x + 2.5, y: PAGE.h - (y + used - 2.8), size: 2.2, color: EMBER })
    used += paragraph(ctx, item, { x: x + 11, y: y + used, width: w - 11, size: 8.2 }) + 4
  }
  return used
}

/** A altura de uma lista com marcadores, sem a desenhar. */
function bulletsHeight(ctx: Ctx, items: string[], w: number): number {
  return items.reduce(
    (sum, item) => sum + wrap(ctx.fonts.sans, item, 8.2, w - 11).length * 8.2 * 1.42 + 4,
    0
  )
}

function pageTwo(ctx: Ctx, data: TicketData): void {
  newPage(ctx)
  let y = header(ctx, data, "Antes de viajar", "Bagagem, check-in, documentos e contactos")
  y = baggageTable(ctx, data, y)

  const carrier = data.issuingCarrierLabel || data.segments[0]?.carrierLabel || "companhia"
  const half = (W - 12) / 2
  const inner = half - 26

  const checkin = [
    { text: `O check-in online abre 24 a 48 horas antes da partida, no site ou na app da ${carrier}. Use o localizador` },
    { text: data.pnr, font: ctx.fonts.bold },
    { text: "e o apelido." },
  ]
  const checkin2 =
    "No aeroporto, chegue ao balcão com 2 horas de antecedência em voos regionais e europeus, e com 3 horas em voos intercontinentais."
  const eve1 =
    "Confirme o horário. As companhias mudam horas com frequência e, quando isso acontece, avisamos por email e WhatsApp."
  const eve2 =
    "Precisa de alterar alguma coisa? Fale primeiro connosco. Uma alteração feita diretamente na companhia pode anular as condições da sua tarifa."
  const bring = [
    "Passaporte válido. A maioria dos destinos pede seis meses de validade a contar do regresso.",
    "Visto ou autorização de entrada, quando o destino o exige. É responsabilidade de quem viaja.",
    "Este bilhete, no telemóvel ou impresso.",
    "Reserva de alojamento e bilhete de regresso, que algumas fronteiras pedem.",
  ]
  const handle = [
    "Alterações de data e de nome, dentro do que a tarifa permite.",
    "Nova emissão quando a companhia muda ou cancela o voo.",
    "Pedidos especiais: refeições, assistência, cadeira de rodas, bebé ao colo.",
    "Acompanhamento até ao embarque e depois dele, se algo correr mal.",
  ]

  const leading = 8.6 * 1.42
  const para = (value: string) => wrap(ctx.fonts.sans, value, 8.6, inner).length * leading
  const row1 = 38 + Math.max(para(checkin.map((r) => r.text).join(" ")) + 6 + para(checkin2), para(eve1) + 6 + para(eve2))
  const row2 = 36 + Math.max(bulletsHeight(ctx, bring, inner), bulletsHeight(ctx, handle, inner))

  y = ensure(ctx, data, y, row1 + row2 + 40, "Antes de viajar")
  y = section(ctx, "Check-in e documentos", y)

  infoCard(ctx, M, y, half, row1, "Check-in", (x, cy, w) => {
    const used = rich(ctx, checkin, { x, y: cy, width: w })
    paragraph(ctx, checkin2, { x, y: cy + used + 6, width: w })
  })
  infoCard(ctx, M + half + 12, y, half, row1, "Na véspera", (x, cy, w) => {
    const used = paragraph(ctx, eve1, { x, y: cy, width: w })
    paragraph(ctx, eve2, { x, y: cy + used + 6, width: w })
  })
  y += row1 + 10
  infoCard(ctx, M, y, half, row2, "Leve consigo", (x, cy, w) => {
    bullets(ctx, bring, x, cy, w)
  })
  infoCard(ctx, M + half + 12, y, half, row2, "O que tratamos por si", (x, cy, w) => {
    bullets(ctx, handle, x, cy, w)
  })
  y += row2 + 18

  /* Falar connosco: o contacto de quem vendeu e o QR da página do cliente. */
  y = ensure(ctx, data, y, 110, "Antes de viajar")
  y = section(ctx, "Falar connosco", y)
  const boxH = 84
  roundRect(ctx, M, y, W, boxH, { r: 10, fill: INK })
  text(ctx, data.brand.contactName, { x: M + 18, y: y + 26, size: 11.5, font: ctx.fonts.bold, color: WHITE })

  const contactRuns: { text: string; font?: PDFFont }[] = [
    { text: "Email" },
    { text: data.brand.email, font: ctx.fonts.bold },
  ]
  if (data.brand.site) contactRuns.push({ text: `· ${data.brand.site}` })
  if (data.brand.whatsapp) {
    const digits = data.brand.whatsapp.replace(/\D/g, "")
    contactRuns.push({ text: "· WhatsApp" }, { text: `+${digits}`, font: ctx.fonts.bold })
  }
  rich(ctx, contactRuns, { x: M + 18, y: y + 43, width: W - 130, size: 8.4, color: hex("#CBD5E1") })
  const linkLines = wrap(ctx.fonts.mono, data.link, 7.4, W - 130).slice(0, 2)
  linkLines.forEach((line, i) =>
    text(ctx, line, { x: M + 18, y: y + 62 + i * 9.5, size: 7.4, font: ctx.fonts.mono, color: PEACH })
  )
  const qrSize = 50
  const qrX = PAGE.w - M - 18 - qrSize
  roundRect(ctx, qrX - 5, y + 10, qrSize + 10, qrSize + 10, { r: 6, fill: WHITE })
  drawQr(ctx, data.link, qrX, y + 15, qrSize)
  text(ctx, "Bilhete e alterações", {
    x: qrX + qrSize / 2,
    y: y + boxH - 6,
    size: 6.4,
    color: hex("#CBD5E1"),
    align: "center",
  })
  y += boxH + 18

  /* Avisos legais, em duas colunas. */
  const seller = data.brand.kind === "partner" ? data.brand.name : "A WeeFly Africa"
  const legal = [
    "Este documento comprova a emissão do bilhete eletrónico em nome dos passageiros indicados. O contrato de transporte é celebrado entre o passageiro e a companhia aérea emissora. " +
      `${seller} atua como intermediária na reserva e na emissão.`,
    "O transporte está sujeito às condições gerais da companhia aérea, às condições da tarifa aplicada e às convenções internacionais aplicáveis, incluindo a Convenção de Montreal de 1999 quanto à responsabilidade por danos a pessoas e bagagem.",
    "As condições de alteração e de reembolso são as da tarifa emitida e constam da página 1. Uma tarifa não reembolsável continua a sê-lo mesmo que o voo não seja utilizado.",
    "Os horários são horas locais de cada aeroporto e podem ser alterados pela companhia.",
    "Passaporte, vistos e demais documentos de entrada são da responsabilidade do passageiro. A recusa de embarque por falta de documentação não dá direito a reembolso.",
    `Os dados pessoais são tratados nos termos do Regulamento (UE) 2016/679 e da legislação cabo-verdiana aplicável, para executar a reserva e cumprir obrigações legais. Os direitos de acesso, retificação e eliminação exercem-se através de ${data.brand.email}.`,
  ]
  const colW = (W - 20) / 2
  const size = 6.5
  const lead = 8.4
  const heights = legal.map((c) => wrap(ctx.fonts.sans, c, size, colW).length * lead + 5)
  const leftH = heights.slice(0, 3).reduce((a, b) => a + b, 0)
  const rightH = heights.slice(3).reduce((a, b) => a + b, 0)

  y = ensure(ctx, data, y, Math.max(leftH, rightH) + 20, "Antes de viajar")
  y = section(ctx, "Avisos legais", y)
  let ly = y + 2
  let ryy = y + 2
  legal.forEach((clause, i) => {
    if (i < 3) ly += paragraph(ctx, clause, { x: M, y: ly, width: colW, size, color: MUTED, leading: lead }) + 5
    else ryy += paragraph(ctx, clause, { x: M + colW + 20, y: ryy, width: colW, size, color: MUTED, leading: lead }) + 5
  })
}

// ── a montagem ───────────────────────────────────────────────────────────────

/**
 * Compõe o PDF de um bilhete.
 *
 * `only` limita o documento a um passageiro — é o PDF individual que o FE-07
 * pede ao lado do combinado. O itinerário é o mesmo; o que muda é quem aparece
 * na tabela e dentro de cada voo.
 */
export async function renderTicketPdf(
  input: TicketData,
  only?: TicketPassenger
): Promise<Uint8Array> {
  const data: TicketData = only
    ? {
        ...input,
        passengers: [only],
        segments: input.segments.map((segment) => ({
          ...segment,
          seats: segment.seats.filter((s) => s.tag === only.tag),
        })),
      }
    : input

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  doc.setTitle(`${data.brand.kind === "partner" ? data.brand.name : "WeeFly"} · bilhete ${data.pnr}`)
  doc.setAuthor(data.brand.name)
  doc.setSubject(`Bilhete eletrónico ${data.documentNumber}`)
  doc.setProducer("WeeFly Concierge")
  doc.setCreator("WeeFly Concierge")

  /* `subset: false`: um bilhete tem de abrir igual em qualquer máquina. */
  const fonts: Fonts = {
    sans: await doc.embedFont(SANS_TTF, { subset: false }),
    bold: await doc.embedFont(SANSBOLD_TTF, { subset: false }),
    mono: await doc.embedFont(MONO_TTF, { subset: false }),
  }

  /* Os logótipos, embutidos uma vez: uma ida e volta na mesma companhia leva
     a imagem uma só vez. */
  const logos = new Map<string, PDFImage>()
  const logoBytes = await readAirlineLogos([
    data.issuingCarrier,
    ...data.segments.map((segment) => segment.carrierCode),
  ])
  for (const [code, bytes] of Array.from(logoBytes.entries())) {
    try {
      logos.set(code, await doc.embedPng(bytes))
    } catch {
      /* Um PNG que o pdf-lib recuse não pode impedir a emissão do bilhete. */
      console.warn("[tickets] logótipo recusado pelo pdf-lib: %s", code)
    }
  }

  let brandLogo: PDFImage | null = null
  if (data.brand.logo) {
    try {
      brandLogo =
        data.brand.logo.type === "png"
          ? await doc.embedPng(data.brand.logo.bytes)
          : await doc.embedJpg(data.brand.logo.bytes)
    } catch {
      console.warn("[tickets] logótipo do parceiro recusado pelo pdf-lib")
    }
  }

  const ctx: Ctx = {
    doc,
    page: undefined as unknown as PDFPage,
    pages: [],
    fonts,
    logos,
    brandLogo,
  }

  pageOne(ctx, data)
  pageTwo(ctx, data)
  footers(ctx, data)

  return doc.save()
}

/**
 * EM-04 · o guia de uma página, entregue ao lado do bilhete.
 *
 * Usa as fontes standard do PDF e não as embebidas: o guia é o mesmo para toda
 * a gente e não tem dados de ninguém, e 500 KB de fontes por cópia de um
 * documento genérico seriam 500 KB a mais em cada email.
 */
export async function renderTicketGuidePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle("WeeFly · como ler o seu bilhete")
  doc.setAuthor("WeeFly Africa")

  const sans = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = {
    doc,
    page: undefined as unknown as PDFPage,
    pages: [],
    fonts: { sans, bold, mono: sans },
    logos: new Map(),
    brandLogo: null,
  }
  newPage(ctx)

  weeflyLogo(ctx, M, 32, 40)
  text(ctx, "Como ler o seu bilhete", { x: M + 72, y: 58, size: 13, font: bold })

  let y = 112
  const entries: [string, string][] = [
    [
      "Localizador",
      "Seis letras e números no canto superior direito. É o que a companhia pede ao balcão e o que abre o check-in online no site dela. Se só levar uma coisa de cor, leve esta.",
    ],
    [
      "Número de bilhete",
      "Treze dígitos por pessoa: os três primeiros identificam a companhia, os dez seguintes o documento. Cada passageiro tem o seu, ao lado da etiqueta de cada um.",
    ],
    [
      "P1, P2, P3",
      "As etiquetas dos passageiros. Aparecem na tabela e repetidas dentro de cada voo, com o lugar, o bilhete e a bagagem de cada pessoa nesse voo.",
    ],
    [
      "Horas",
      "São sempre horas locais do aeroporto de cada ponta: a de partida na cidade de onde parte, a de chegada na cidade onde aterra. A duração já conta com a diferença de fuso.",
    ],
    [
      "Código quadrado",
      "Abre a sua página, com o bilhete, o itinerário e as alterações, sempre no mesmo endereço.",
    ],
    [
      "Bagagem",
      "A página 2 diz o que a sua tarifa inclui por passageiro e por trecho. Uma mala a mais sai quase sempre mais barata antes do aeroporto do que no balcão.",
    ],
    [
      "Se o voo mudar",
      "As companhias mudam horários. Quando isso acontecer, avisamos por email e por WhatsApp, e o aviso aparece também na sua página.",
    ],
    [
      "Se precisar de alterar",
      "Fale connosco antes de falar com a companhia. Uma alteração feita por fora pode anular condições da tarifa.",
    ],
  ]

  for (const [title, body] of entries) {
    text(ctx, title, { x: M, y, size: 11, font: bold })
    y += 15
    y += paragraph(ctx, body, { x: M, y, width: W, size: 9.5, font: sans }) + 14
  }

  hline(ctx, PAGE.h - 60)
  text(ctx, "WeeFly Africa · info@weefly.africa · Praia, Cabo Verde", {
    x: M,
    y: PAGE.h - 44,
    size: 8.5,
    color: MUTED,
    font: sans,
  })

  return doc.save()
}
