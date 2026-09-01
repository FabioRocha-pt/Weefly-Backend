/**
 * EM-02 · o PDF do bilhete, o template T5 já aprovado.
 *
 * Três páginas, e a divisão não é estética — é a ordem por que alguém precisa
 * das coisas:
 *
 *   1. **itinerário e passageiros.** O que se mostra no balcão. Tem o
 *      localizador, os voos, quem viaja e o número de bilhete de cada um.
 *   2. **bagagem, check-in e preparação da viagem.** O que se lê na véspera.
 *   3. **serviços, contactos e avisos legais.** O que se procura quando algo
 *      corre mal.
 *
 * As regras que o documento cumpre, e porquê:
 *
 *   · **as etiquetas P1 P2 P3 na tabela de passageiros e repetidas dentro de
 *     cada voo**, com bilhete, lugar e bagagem. É o que remove a ambiguidade de
 *     saber qual bilhete é de quem — numa família de quatro com quatro números
 *     de treze dígitos, é a única forma de não trocar;
 *   · **nenhum valor monetário em página nenhuma.** Um bilhete não é uma
 *     factura, e imprimir preços num documento que passa por balcões de
 *     companhia é dar a informação errada a quem não tem nada a ver com ela;
 *   · **código 2D com PNR, número de bilhete, nome e referência** — o que uma
 *     pessoa ao balcão precisa de escrever, sem escrever;
 *   · **fontes embebidas.** Abre igual em qualquer máquina, sem substituições;
 *   · **legível a preto e branco.** Não há cor a distinguir informação de
 *     informação: o que separa é o peso da letra, o espaço e as linhas. O único
 *     tom forte é o cinzento muito escuro das faixas, que numa impressora sai
 *     preto com texto branco por cima.
 *
 * SÓ SERVIDOR.
 */

import fontkit from "@pdf-lib/fontkit"
import QRCode from "qrcode"
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib"

import { MONO_TTF, SANSBOLD_TTF, SANS_TTF } from "./fonts"
import type { TicketData, TicketPassenger, TicketSegment } from "./data"

// ── medidas e tons ───────────────────────────────────────────────────────────

/** A4 em pontos. O bilhete é impresso tantas vezes como é lido no telemóvel. */
const PAGE = { w: 595.28, h: 841.89 }
const M = 42

const INK = rgb(0.08, 0.11, 0.15)
const MUTED = rgb(0.42, 0.46, 0.52)
const LINE = rgb(0.84, 0.86, 0.89)
const SOFT = rgb(0.96, 0.97, 0.98)
const WHITE = rgb(1, 1, 1)

interface Fonts {
  sans: PDFFont
  bold: PDFFont
  mono: PDFFont
}

interface Ctx {
  doc: PDFDocument
  page: PDFPage
  fonts: Fonts
  /** O cursor vertical, a descer. Em PDF a origem é em baixo à esquerda. */
  y: number
}

// ── primitivas de desenho ────────────────────────────────────────────────────

function text(
  ctx: Ctx,
  value: string,
  options: {
    x: number
    y: number
    size?: number
    font?: PDFFont
    color?: RGB
    /** Largura máxima; o que não couber é cortado com reticências. */
    max?: number
    align?: "left" | "right" | "center"
  }
): void {
  const font = options.font ?? ctx.fonts.sans
  const size = options.size ?? 9.5
  let body = value ?? ""

  if (options.max) {
    while (body.length > 1 && font.widthOfTextAtSize(body, size) > options.max) {
      body = body.slice(0, -2) + "…"
    }
  }

  const width = font.widthOfTextAtSize(body, size)
  const x =
    options.align === "right"
      ? options.x - width
      : options.align === "center"
        ? options.x - width / 2
        : options.x

  ctx.page.drawText(body, {
    x,
    y: options.y,
    size,
    font,
    color: options.color ?? INK,
  })
}

/** Texto em várias linhas, com quebra por palavra. Devolve a altura ocupada. */
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
  const size = options.size ?? 9
  const leading = options.leading ?? size * 1.45

  const words = value.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > options.width && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)

  lines.forEach((entry, i) => {
    ctx.page.drawText(entry, {
      x: options.x,
      y: options.y - i * leading,
      size,
      font,
      color: options.color ?? INK,
    })
  })

  return lines.length * leading
}

function rule(ctx: Ctx, y: number, color: RGB = LINE): void {
  ctx.page.drawLine({
    start: { x: M, y },
    end: { x: PAGE.w - M, y },
    thickness: 0.7,
    color,
  })
}

function box(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: RGB = SOFT,
  border: RGB | null = LINE
): void {
  ctx.page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: fill,
    ...(border ? { borderColor: border, borderWidth: 0.7 } : {}),
  })
}

/** A pastilha de uma etiqueta de passageiro: P1, P2, P3. */
function tag(ctx: Ctx, label: string, x: number, y: number): number {
  const w = Math.max(17, ctx.fonts.bold.widthOfTextAtSize(label, 7.5) + 9)
  ctx.page.drawRectangle({
    x,
    y: y - 2.5,
    width: w,
    height: 12,
    color: INK,
  })
  text(ctx, label, {
    x: x + w / 2,
    y: y + 0.8,
    size: 7.5,
    font: ctx.fonts.bold,
    color: WHITE,
    align: "center",
  })
  return w
}

// ── formatação ───────────────────────────────────────────────────────────────

const MONTHS = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
]

/** "14 SET 2026" — sem depender de `Intl`, que muda com o ICU do servidor. */
function longDate(value: string | null): string {
  if (!value) return "—"
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return value
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? "—"} ${m[1]}`
}

/** "08:40" da hora local do aeroporto, sem passar por `Date`. Ver a 0005. */
const clock = (value: string | null): string => value?.slice(11, 16) ?? "--:--"

const CABIN_PT: Record<string, string> = {
  economy: "Económica",
  premium_economy: "Económica premium",
  business: "Executiva",
  first: "Primeira",
}

/** "047 1234567890" — o prefixo da companhia separado do documento. */
function ticketNo(value: string | null): string {
  if (!value) return "—"
  const digits = value.replace(/\D/g, "")
  return digits.length === 13 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : value
}

// ── o código 2D ──────────────────────────────────────────────────────────────

/**
 * O código 2D, desenhado módulo a módulo.
 *
 * Leva o que uma pessoa ao balcão teria de escrever à mão: localizador, número
 * de bilhete, nome no documento e a referência do caso. Não leva o link do
 * cliente — um código impresso num papel que fica em cima de um balcão não deve
 * abrir a página com os passaportes de ninguém.
 *
 * Desenhado com rectângulos e não como imagem: um PNG dentro de um PDF perde
 * nitidez ao imprimir, e os módulos vectoriais saem sempre a preto pleno, que é
 * o que os leitores de código querem.
 */
async function drawQr(
  ctx: Ctx,
  payload: string,
  x: number,
  y: number,
  size: number
): Promise<void> {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" })
  const count = qr.modules.size
  const data = qr.modules.data
  /* O lado de um módulo do código. Não se chama `module`: essa variável tem um
     significado próprio no empacotador do Next e o lint recusa-a, com razão. */
  const cell = size / count

  /* O quadrado branco por baixo garante a zona de silêncio mesmo quando o
     código cai sobre uma faixa cinzenta. */
  ctx.page.drawRectangle({
    x: x - cell * 2,
    y: y - cell * 2,
    width: size + cell * 4,
    height: size + cell * 4,
    color: WHITE,
  })

  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!data[row * count + col]) continue
      ctx.page.drawRectangle({
        x: x + col * cell,
        /* A linha 0 do QR é a de cima; em PDF o y cresce para cima. */
        y: y + size - (row + 1) * cell,
        width: cell,
        height: cell,
        color: INK,
      })
    }
  }
}

// ── cabeçalho e rodapé, iguais nas três páginas ──────────────────────────────

function header(ctx: Ctx, data: TicketData, subtitle: string): number {
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE.h - 92,
    width: PAGE.w,
    height: 92,
    color: INK,
  })

  text(ctx, "WeeFly", {
    x: M,
    y: PAGE.h - 44,
    size: 20,
    font: ctx.fonts.bold,
    color: WHITE,
  })
  text(ctx, "CONCIERGE", {
    x: M + 74,
    y: PAGE.h - 42,
    size: 7.5,
    font: ctx.fonts.bold,
    color: rgb(0.78, 0.8, 0.83),
  })
  text(ctx, subtitle, {
    x: M,
    y: PAGE.h - 64,
    size: 9,
    color: rgb(0.78, 0.8, 0.83),
  })

  text(ctx, "LOCALIZADOR", {
    x: PAGE.w - M,
    y: PAGE.h - 40,
    size: 7,
    font: ctx.fonts.bold,
    color: rgb(0.7, 0.73, 0.77),
    align: "right",
  })
  text(ctx, data.pnr, {
    x: PAGE.w - M,
    y: PAGE.h - 58,
    size: 17,
    font: ctx.fonts.mono,
    color: WHITE,
    align: "right",
  })
  text(ctx, data.documentNumber, {
    x: PAGE.w - M,
    y: PAGE.h - 74,
    size: 7.5,
    font: ctx.fonts.mono,
    color: rgb(0.7, 0.73, 0.77),
    align: "right",
  })

  return PAGE.h - 118
}

function footer(ctx: Ctx, data: TicketData, page: number, total: number): void {
  rule(ctx, 54, LINE)
  text(ctx, `WeeFly Africa · Praia, Cabo Verde · ${data.documentNumber}`, {
    x: M,
    y: 40,
    size: 7.5,
    color: MUTED,
  })
  text(ctx, `${page} / ${total}`, {
    x: PAGE.w - M,
    y: 40,
    size: 7.5,
    font: ctx.fonts.mono,
    color: MUTED,
    align: "right",
  })
}

/** O título de uma secção: letra pequena, maiúscula, e uma linha por baixo. */
function section(ctx: Ctx, title: string, y: number): number {
  text(ctx, title.toUpperCase(), {
    x: M,
    y,
    size: 8,
    font: ctx.fonts.bold,
    color: MUTED,
  })
  rule(ctx, y - 7)
  return y - 22
}

// ── página 1 · itinerário e passageiros ──────────────────────────────────────

function drawFlight(ctx: Ctx, segment: TicketSegment, y: number): number {
  const width = PAGE.w - M * 2
  /* Uma linha por passageiro dentro do voo, mais o cabeçalho da caixa. */
  const height = 74 + segment.seats.length * 13

  box(ctx, M, y - height, width, height, WHITE, LINE)

  const inner = M + 13
  let cursor = y - 18

  const flight = [segment.carrierCode, segment.flightNumber]
    .filter(Boolean)
    .join(" ")

  text(ctx, flight || "—", {
    x: inner,
    y: cursor,
    size: 11,
    font: ctx.fonts.mono,
  })
  text(ctx, segment.carrierLabel, {
    x: inner + 62,
    y: cursor,
    size: 9.5,
    font: ctx.fonts.bold,
    max: 190,
  })
  text(
    ctx,
    [
      CABIN_PT[segment.cabin] ?? segment.cabin,
      segment.bookingClass ? `classe ${segment.bookingClass}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    {
      x: PAGE.w - M - 13,
      y: cursor,
      size: 8.5,
      color: MUTED,
      align: "right",
    }
  )

  cursor -= 26

  /* Partida à esquerda, chegada à direita, a rota no meio. É a leitura do
     cartão de embarque, e é a que se procura com pressa. */
  text(ctx, clock(segment.departAt), {
    x: inner,
    y: cursor,
    size: 15,
    font: ctx.fonts.mono,
  })
  text(ctx, `${segment.origin ?? "—"} · ${longDate(segment.departAt)}`, {
    x: inner,
    y: cursor - 13,
    size: 8,
    color: MUTED,
    max: 150,
  })
  text(ctx, segment.originCity || "", {
    x: inner,
    y: cursor - 23,
    size: 8,
    color: MUTED,
    max: 150,
  })

  text(ctx, "————————→", {
    x: PAGE.w / 2,
    y: cursor + 2,
    size: 9,
    color: LINE,
    align: "center",
  })
  if (segment.terminalFrom || segment.terminalTo) {
    text(
      ctx,
      [
        segment.terminalFrom ? `T${segment.terminalFrom}` : "",
        segment.terminalTo ? `T${segment.terminalTo}` : "",
      ]
        .filter(Boolean)
        .join(" → "),
      { x: PAGE.w / 2, y: cursor - 12, size: 7.5, color: MUTED, align: "center" }
    )
  }

  text(ctx, clock(segment.arriveAt), {
    x: PAGE.w - M - 13,
    y: cursor,
    size: 15,
    font: ctx.fonts.mono,
    align: "right",
  })
  text(ctx, `${segment.destination ?? "—"} · ${longDate(segment.arriveAt)}`, {
    x: PAGE.w - M - 13,
    y: cursor - 13,
    size: 8,
    color: MUTED,
    align: "right",
    max: 150,
  })
  text(ctx, segment.destinationCity || "", {
    x: PAGE.w - M - 13,
    y: cursor - 23,
    size: 8,
    color: MUTED,
    align: "right",
    max: 150,
  })

  cursor -= 38
  ctx.page.drawLine({
    start: { x: inner, y: cursor + 6 },
    end: { x: PAGE.w - M - 13, y: cursor + 6 },
    thickness: 0.6,
    color: LINE,
  })

  /*
   * EM-02 · as etiquetas repetidas dentro do voo.
   *
   * "P1 P2 P3 na tabela de passageiros **e repetidas dentro de cada voo**, com
   * número de bilhete, lugar e bagagem por passageiro." É esta a razão por que
   * cada voo tem esta lista em vez de uma tabela única lá em cima: o lugar de
   * P2 no voo da ida não é o do voo da volta, e uma tabela só não o sabe dizer.
   */
  for (const seat of segment.seats) {
    const width = tag(ctx, seat.tag, inner, cursor)
    text(ctx, ticketNo(seat.ticketNumber), {
      x: inner + width + 8,
      y: cursor,
      size: 8.5,
      font: ctx.fonts.mono,
    })
    text(ctx, seat.seat ? `Lugar ${seat.seat}` : "Lugar por atribuir", {
      x: inner + width + 130,
      y: cursor,
      size: 8.5,
      color: seat.seat ? INK : MUTED,
    })
    cursor -= 13
  }

  return y - height - 12
}

async function pageOne(ctx: Ctx, data: TicketData): Promise<void> {
  let y = header(ctx, data, "Bilhete eletrónico · itinerário e passageiros")

  /* A faixa do resumo: quem viaja, para onde e com que referência. */
  box(ctx, M, y - 54, PAGE.w - M * 2, 54, SOFT, LINE)

  /*
   * A rota da viagem, e não a do itinerário inteiro.
   *
   * Numa ida e volta o último trecho aterra onde o primeiro descolou, e
   * `primeiro.origem → último.destino` escrevia "RAI → RAI" — verdadeiro e
   * inútil. O que a linha tem de dizer é para onde a pessoa vai: os extremos da
   * **ida**. Quando não há ida marcada (um itinerário só de volta, que existe),
   * cai nos extremos do que houver.
   */
  const outbound = data.segments.filter((s) => s.direction === "ida")
  const leg = outbound.length > 0 ? outbound : data.segments
  const first = leg[0]
  const last = leg[leg.length - 1]
  const roundTrip = data.segments.some((s) => s.direction === "volta")

  text(ctx, "VIAGEM", { x: M + 13, y: y - 18, size: 7, font: ctx.fonts.bold, color: MUTED })
  text(
    ctx,
    `${first?.origin ?? "—"} ${roundTrip ? "⇄" : "→"} ${last?.destination ?? "—"}`,
    { x: M + 13, y: y - 34, size: 13, font: ctx.fonts.bold }
  )
  text(ctx, `${data.passengers.length} passageiro(s) · ${data.reference}`, {
    x: M + 13,
    y: y - 47,
    size: 8,
    color: MUTED,
  })

  text(ctx, "EMITIDO POR", {
    x: M + 250,
    y: y - 18,
    size: 7,
    font: ctx.fonts.bold,
    color: MUTED,
  })
  text(ctx, data.issuingCarrierLabel || "WeeFly Africa", {
    x: M + 250,
    y: y - 32,
    size: 9.5,
    max: 150,
  })
  text(ctx, `em ${longDate(data.issuedAt.slice(0, 10))}`, {
    x: M + 250,
    y: y - 45,
    size: 8,
    color: MUTED,
  })

  /*
   * O código 2D, no canto do resumo.
   *
   * O que ele leva é o que alguém teria de escrever à mão ao balcão. Sem o
   * link do cliente, de propósito: um código impresso não deve abrir a página
   * com os passaportes de quem quer que seja.
   */
  await drawQr(
    ctx,
    [
      `PNR:${data.pnr}`,
      `TKT:${(data.passengers[0]?.ticketNumber ?? "").replace(/\D/g, "")}`,
      `PAX:${data.passengers[0]?.documentName ?? ""}`,
      `REF:${data.reference}`,
    ].join("|"),
    PAGE.w - M - 52,
    y - 48,
    44
  )

  y -= 74

  // ── os voos ──
  y = section(ctx, "Itinerário", y)
  for (const segment of data.segments) {
    /* Cada voo ocupa entre 90 e 140 pontos. Quando não cabe, a página passa a
       ser a seguinte — um voo cortado a meio é um voo que se perde. */
    const needed = 86 + segment.seats.length * 13
    if (y - needed < 120) {
      footer(ctx, data, 1, 3)
      ctx.page = ctx.doc.addPage([PAGE.w, PAGE.h])
      y = header(ctx, data, "Bilhete eletrónico · itinerário (continuação)")
      y = section(ctx, "Itinerário", y)
    }
    y = drawFlight(ctx, segment, y)
  }

  // ── os passageiros ──
  y -= 6
  y = section(ctx, "Passageiros", y)

  const cols = [M + 30, M + 190, M + 300, M + 400]
  text(ctx, "NOME NO DOCUMENTO", { x: cols[0], y, size: 7, font: ctx.fonts.bold, color: MUTED })
  text(ctx, "TIPO", { x: cols[1], y, size: 7, font: ctx.fonts.bold, color: MUTED })
  text(ctx, "PASSAPORTE", { x: cols[2], y, size: 7, font: ctx.fonts.bold, color: MUTED })
  text(ctx, "Nº DE BILHETE", { x: cols[3], y, size: 7, font: ctx.fonts.bold, color: MUTED })
  y -= 6
  rule(ctx, y)
  y -= 15

  const TYPE_PT: Record<string, string> = {
    adult: "Adulto",
    child: "Criança",
    infant: "Bebé",
    infant_seat: "Bebé c/ assento",
    infant_lap: "Bebé de colo",
  }

  for (const passenger of data.passengers) {
    tag(ctx, passenger.tag, M, y)
    text(ctx, passenger.documentName, {
      x: cols[0],
      y,
      size: 9,
      font: ctx.fonts.bold,
      max: 155,
    })
    text(ctx, TYPE_PT[passenger.type] ?? passenger.type, {
      x: cols[1],
      y,
      size: 8.5,
      color: MUTED,
      max: 105,
    })
    text(ctx, passenger.passportNumber ?? "—", {
      x: cols[2],
      y,
      size: 8.5,
      font: ctx.fonts.mono,
      max: 95,
    })
    text(ctx, ticketNo(passenger.ticketNumber), {
      x: cols[3],
      y,
      size: 8.5,
      font: ctx.fonts.mono,
    })
    y -= 17
  }

  y -= 6
  rule(ctx, y + 6)
  y -= 8

  const doc = [
    data.fareBasis ? `Base tarifária ${data.fareBasis}` : "",
    data.nvb ? `Não válido antes de ${data.nvb}` : "",
    data.nva ? `Não válido depois de ${data.nva}` : "",
    data.endorsements ?? "",
  ]
    .filter(Boolean)
    .join(" · ")

  if (doc) {
    text(ctx, doc, { x: M, y, size: 8, font: ctx.fonts.mono, color: MUTED, max: PAGE.w - M * 2 })
  }

  footer(ctx, data, 1, 3)
}

// ── página 2 · bagagem, check-in e preparação ────────────────────────────────

function pageTwo(ctx: Ctx, data: TicketData): void {
  ctx.page = ctx.doc.addPage([PAGE.w, PAGE.h])
  let y = header(ctx, data, "Bagagem, check-in e preparação da viagem")

  y = section(ctx, "Bagagem incluída na sua tarifa", y)

  const half = (PAGE.w - M * 2 - 12) / 2
  box(ctx, M, y - 52, half, 52, SOFT, LINE)
  text(ctx, "MÃO", { x: M + 13, y: y - 17, size: 7, font: ctx.fonts.bold, color: MUTED })
  text(ctx, data.baggageCabin, { x: M + 13, y: y - 34, size: 11, font: ctx.fonts.bold, max: half - 26 })
  text(ctx, "Mais um artigo pessoal por pessoa", { x: M + 13, y: y - 46, size: 7.5, color: MUTED })

  box(ctx, M + half + 12, y - 52, half, 52, SOFT, LINE)
  text(ctx, "PORÃO", { x: M + half + 25, y: y - 17, size: 7, font: ctx.fonts.bold, color: MUTED })
  text(ctx, data.baggageHold, {
    x: M + half + 25,
    y: y - 34,
    size: 11,
    font: ctx.fonts.bold,
    max: half - 26,
  })
  text(ctx, "Por passageiro, em cada sentido", {
    x: M + half + 25,
    y: y - 46,
    size: 7.5,
    color: MUTED,
  })

  y -= 72

  /*
   * A bagagem por passageiro, com a etiqueta.
   *
   * A tarifa é a mesma para todos e por isso a contagem também é — mas o
   * critério pede a bagagem ao lado de cada etiqueta, e a razão é prática: quem
   * despacha três malas ao balcão conta-as por pessoa, não por reserva.
   */
  y = section(ctx, "Por passageiro", y)
  for (const passenger of data.passengers) {
    const width = tag(ctx, passenger.tag, M, y)
    text(ctx, passenger.documentName, {
      x: M + width + 8,
      y,
      size: 9,
      font: ctx.fonts.bold,
      max: 190,
    })
    text(ctx, `${data.baggageCabin} · ${data.baggageHold}`, {
      x: PAGE.w - M,
      y,
      size: 8.5,
      color: MUTED,
      align: "right",
    })
    y -= 17
  }

  y -= 10
  y = section(ctx, "Check-in", y)
  y -=
    paragraph(
      ctx,
      "O check-in online abre normalmente 24 a 48 horas antes da partida, no site da companhia, com o localizador que está no topo deste bilhete. No aeroporto, apresente-se no balcão pelo menos 2 horas antes num voo europeu ou regional e 3 horas antes num voo intercontinental.",
      { x: M, y, width: PAGE.w - M * 2 }
    ) + 12

  y = section(ctx, "Documentos que tem de levar", y)
  const checklist = [
    "Passaporte válido — a maioria dos destinos exige seis meses de validade a contar da data de regresso.",
    "Visto ou autorização de entrada, quando o destino o exigir. A responsabilidade de o ter é de quem viaja.",
    "Este bilhete, no telemóvel ou impresso. O localizador chega para o balcão.",
    "Comprovativos de alojamento e de regresso, que algumas fronteiras pedem à chegada.",
  ]
  for (const item of checklist) {
    ctx.page.drawRectangle({ x: M + 1, y: y + 1.5, width: 6, height: 6, color: INK })
    y -= paragraph(ctx, item, { x: M + 16, y, width: PAGE.w - M * 2 - 16 }) + 5
  }

  y -= 8
  y = section(ctx, "Antes de partir", y)
  paragraph(
    ctx,
    "Confirme o horário do voo na véspera: as companhias mudam horas e as mudanças chegam-nos por email ou pelo sistema de reservas. Sempre que soubermos de uma alteração que lhe diga respeito, avisamos por email e por WhatsApp, e ela aparece também na sua página. Se precisar de mudar alguma coisa, fale connosco antes de falar com a companhia — uma alteração feita por fora pode anular condições da tarifa.",
    { x: M, y, width: PAGE.w - M * 2 }
  )

  footer(ctx, data, 2, 3)
}

// ── página 3 · serviços, contactos e avisos legais ───────────────────────────

function pageThree(ctx: Ctx, data: TicketData): void {
  ctx.page = ctx.doc.addPage([PAGE.w, PAGE.h])
  let y = header(ctx, data, "Serviços, contactos e avisos legais")

  y = section(ctx, "Falar connosco", y)
  box(ctx, M, y - 62, PAGE.w - M * 2, 62, SOFT, LINE)
  text(ctx, "WeeFly Concierge", { x: M + 13, y: y - 19, size: 11, font: ctx.fonts.bold })
  text(ctx, "info@weefly.africa · weefly.africa", { x: M + 13, y: y - 34, size: 9 })
  text(ctx, "Praia, Cabo Verde", { x: M + 13, y: y - 47, size: 8.5, color: MUTED })
  text(ctx, "A SUA PÁGINA", {
    x: PAGE.w - M - 13,
    y: y - 19,
    size: 7,
    font: ctx.fonts.bold,
    color: MUTED,
    align: "right",
  })
  text(ctx, data.link || "weefly.africa", {
    x: PAGE.w - M - 13,
    y: y - 34,
    size: 8,
    font: ctx.fonts.mono,
    align: "right",
    max: 260,
  })
  text(ctx, "Bilhetes, itinerário e alterações, sempre no mesmo endereço.", {
    x: PAGE.w - M - 13,
    y: y - 47,
    size: 7.5,
    color: MUTED,
    align: "right",
  })
  y -= 82

  y = section(ctx, "O que a WeeFly trata por si", y)
  const services = [
    "Alterações de data e de nome, dentro do que a tarifa permitir.",
    "Reemissões quando a companhia muda ou cancela o voo.",
    "Pedidos especiais junto da companhia: refeições, assistência, cadeira de rodas, bebé ao colo.",
    "Acompanhamento até ao embarque, e depois dele se algo correr mal.",
  ]
  for (const item of services) {
    ctx.page.drawCircle({ x: M + 3.5, y: y + 3, size: 2, color: INK })
    y -= paragraph(ctx, item, { x: M + 16, y, width: PAGE.w - M * 2 - 16 }) + 5
  }

  y -= 10
  y = section(ctx, "Avisos legais", y)

  const legal = [
    "Este documento é o comprovativo do bilhete eletrónico emitido em nome dos passageiros indicados. O contrato de transporte é celebrado entre o passageiro e a companhia aérea emissora; a WeeFly Africa actua como intermediária na reserva e na emissão.",
    "O transporte está sujeito às condições gerais da companhia aérea, às condições da tarifa aplicada e às convenções internacionais aplicáveis, incluindo a Convenção de Montreal de 1999 no que respeita a responsabilidade por danos a pessoas e a bagagem.",
    "As condições de alteração e de reembolso são as da tarifa emitida e constam da página 1 deste documento. Uma tarifa não reembolsável não deixa de o ser por o voo não ter sido utilizado.",
    "Os horários indicados são horas locais de cada aeroporto e podem ser alterados pela companhia. Confirme sempre o horário na véspera da partida.",
    "A obtenção de passaporte, vistos e demais documentos de entrada é da responsabilidade do passageiro. A recusa de embarque por falta de documentação não dá direito a reembolso.",
    "Dados pessoais tratados nos termos do Regulamento (UE) 2016/679 e da legislação cabo-verdiana aplicável, para a execução da reserva e para o cumprimento de obrigações legais. Os direitos de acesso, retificação e eliminação exercem-se por info@weefly.africa.",
  ]

  for (const clause of legal) {
    y -= paragraph(ctx, clause, {
      x: M,
      y,
      width: PAGE.w - M * 2,
      size: 7.6,
      color: MUTED,
      leading: 10.5,
    }) + 7
  }

  footer(ctx, data, 3, 3)
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

  doc.setTitle(`WeeFly · bilhete ${data.pnr}`)
  doc.setAuthor("WeeFly Africa")
  doc.setSubject(`Bilhete eletrónico ${data.documentNumber}`)
  doc.setProducer("WeeFly Concierge")
  doc.setCreator("WeeFly Concierge")

  /*
   * `subset: false` de propósito.
   *
   * Um subconjunto é mais pequeno, mas guarda só os glifos usados — e um
   * documento que alguém reabra num visualizador que reflua o texto fica sem
   * letras. Um bilhete tem de abrir igual em qualquer máquina, e é isso que o
   * critério pede: as fontes vão inteiras.
   */
  const fonts: Fonts = {
    sans: await doc.embedFont(SANS_TTF, { subset: false }),
    bold: await doc.embedFont(SANSBOLD_TTF, { subset: false }),
    mono: await doc.embedFont(MONO_TTF, { subset: false }),
  }

  const ctx: Ctx = {
    doc,
    page: doc.addPage([PAGE.w, PAGE.h]),
    fonts,
    y: PAGE.h,
  }

  await pageOne(ctx, data)
  pageTwo(ctx, data)
  pageThree(ctx, data)

  return doc.save()
}

/**
 * EM-04 · o guia de uma página, entregue ao lado do bilhete.
 *
 * Uma página, e a ordem é a das perguntas que alguém faz com o bilhete na mão:
 * o que é cada número, o que mostrar, o que levar, e o que fazer quando o voo
 * muda. Não repete o bilhete — explica-o.
 *
 * Usa as fontes standard do PDF e não as embebidas: o guia é o mesmo para toda
 * a gente e não tem dados de ninguém, e 500 KB de fontes por cópia de um
 * documento genérico seriam 500 KB a mais em cada email.
 */
export async function renderTicketGuidePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle("WeeFly · como ler o seu bilhete")
  doc.setAuthor("WeeFly Africa")

  const page = doc.addPage([PAGE.w, PAGE.h])
  const sans = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = { doc, page, fonts: { sans, bold, mono: sans }, y: PAGE.h }

  page.drawRectangle({ x: 0, y: PAGE.h - 92, width: PAGE.w, height: 92, color: INK })
  text(ctx, "WeeFly", { x: M, y: PAGE.h - 44, size: 20, font: bold, color: WHITE })
  text(ctx, "Como ler o seu bilhete", {
    x: M,
    y: PAGE.h - 66,
    size: 11,
    color: rgb(0.78, 0.8, 0.83),
  })

  let y = PAGE.h - 124

  const entries: [string, string][] = [
    [
      "Localizador",
      "Seis letras e números no canto superior direito. É o que a companhia pede ao balcão e o que abre o check-in online no site dela. Se só levar uma coisa de cor, leve esta.",
    ],
    [
      "Número de bilhete",
      "Treze dígitos por pessoa: os três primeiros identificam a companhia, os dez seguintes o documento. Cada passageiro tem o seu — não são todos o mesmo, e é por isso que aparecem ao lado da etiqueta de cada um.",
    ],
    [
      "P1, P2, P3",
      "As etiquetas dos passageiros. Aparecem na tabela e repetidas dentro de cada voo, com o lugar e o bilhete de cada pessoa nesse voo. Servem para não trocar quatro números de treze dígitos entre quatro pessoas.",
    ],
    [
      "Horas",
      "São sempre horas locais do aeroporto de cada ponta — a de partida na cidade de onde parte, a de chegada na cidade onde aterra. Nunca é preciso converter fusos.",
    ],
    [
      "Código quadrado",
      "Leva o localizador, o número de bilhete, o nome e a referência do seu pedido. Serve para quem o atender não ter de escrever nada à mão.",
    ],
    [
      "Bagagem",
      "A página 2 diz o que a sua tarifa inclui, de mão e de porão. Uma mala a mais compra-se à companhia — e sai quase sempre mais barato antes do aeroporto do que no balcão.",
    ],
    [
      "Se o voo mudar",
      "As companhias mudam horários. Quando isso acontecer, avisamos por email e por WhatsApp, e o aviso aparece também na sua página da WeeFly. Não precisa de fazer nada até lhe dizermos o quê.",
    ],
    [
      "Se precisar de alterar",
      "Fale connosco antes de falar com a companhia. Uma alteração feita por fora pode anular condições da tarifa que só nós conseguimos recuperar.",
    ],
  ]

  for (const [title, body] of entries) {
    text(ctx, title, { x: M, y, size: 11, font: bold })
    y -= 15
    y -= paragraph(ctx, body, { x: M, y, width: PAGE.w - M * 2, size: 9.5, font: sans }) + 16
  }

  rule(ctx, 96)
  text(ctx, "WeeFly Africa · info@weefly.africa · Praia, Cabo Verde", {
    x: M,
    y: 78,
    size: 8.5,
    color: MUTED,
    font: sans,
  })

  return doc.save()
}
