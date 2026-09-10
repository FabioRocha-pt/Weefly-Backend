/**
 * WeeFly Price Checker — as funções de formatação que os ecrãs partilham.
 *
 * Portadas do mockup sem mudar o resultado: as durações continuam a sair "8h
 * 25m", porque é assim que o desenho as mostra.
 *
 * Sprint 3.1 · o tradutor entra por parâmetro, e é opcional.
 *
 * Estas funções são chamadas de dentro de `map`s e de outras funções puras, e
 * um hook não cabe lá. Quem passa o `t` recebe a frase na língua de quem lê;
 * quem não passa continua a receber o inglês — que é o que o back-office e o
 * PDF do bilhete esperam, e o que já estava escrito nos dois. Sem o parâmetro
 * opcional, traduzir o ecrã do cliente obrigava a traduzir o back-office no
 * mesmo passo.
 *
 * Sem imports de servidor — o servidor renderiza os mesmos ecrãs.
 */

import {
  CABIN_TO_DB,
  CUR,
  MONTHS,
  TRIP_TO_DB,
  type CabinKind,
  type TripKind,
} from "@/lib/pc/catalog"
import type { Translator } from "@/i18n/translate"

export const pad = (n: number) => String(n).padStart(2, "0")

export const todayISO = () => new Date().toISOString().slice(0, 10)

// ── dinheiro ─────────────────────────────────────────────────────────────────

/**
 * Um valor em unidades menores, na moeda do caso.
 *
 * As unidades menores são a convenção de toda a base (ver case_payments.amount).
 * Não há conversão de moeda: o preço é o que o vendedor escreveu, na moeda em
 * que o escreveu.
 */
export function money(minor: number, currency: string): string {
  const c = CUR[currency] ?? CUR.EUR
  const value = minor / 100
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: c.dp,
    maximumFractionDigits: c.dp,
  })
  return c.pos === "before" ? `${c.sym}${text}` : `${text} ${c.sym}`
}

// ── datas ────────────────────────────────────────────────────────────────────

/** A abreviatura do mês, na língua de quem lê. "set" em vez de "Sep". */
const monthOf = (m: number, t?: Translator): string =>
  t ? t(`pc.months.m${m}`) : MONTHS[m - 1]

/** "1 set" */
export function fmtDate(iso: string | null | undefined, t?: Translator): string {
  if (!iso) return ""
  const [, m, d] = iso.split("-")
  return `${+d} ${monthOf(+m, t)}`
}

/** "1 set 2026" */
export function fmtDateY(iso: string | null | undefined, t?: Translator): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${+d} ${monthOf(+m, t)} ${y}`
}

/** "1 – 12 set 2026", encurtado quando o mês ou o ano coincidem. */
export function fmtRange(
  a: string | null,
  b: string | null,
  t?: Translator
): string {
  if (!a) return ""
  if (!b) return fmtDateY(a, t)
  const [ya, ma] = a.split("-")
  const [yb, mb] = b.split("-")
  if (ya === yb && ma === mb) return `${+a.slice(8)} – ${fmtDateY(b, t)}`
  if (ya === yb) return `${fmtDate(a, t)} – ${fmtDateY(b, t)}`
  return `${fmtDateY(a, t)} – ${fmtDateY(b, t)}`
}

/** "14:07" a partir de um instante. */
export function clockOf(ts: string | number | null | undefined): string {
  if (!ts) return "—"
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "hoje, 14:07" ou "12 ago, 14:07". */
export function whenLabel(
  ts: string | number | null | undefined,
  t?: Translator
): string {
  if (!ts) return "—"
  const d = new Date(ts)
  const now = new Date()
  const time = clockOf(ts)
  if (d.toDateString() === now.toDateString()) {
    return t ? t("pc.when.today", { time }) : `today, ${time}`
  }
  const date = fmtDate(d.toISOString().slice(0, 10), t)
  return t ? t("pc.when.on", { date, time }) : `${date}, ${time}`
}

export function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
}

export function addMonths(iso: string, n: number): string {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** A idade que alguém tem numa data — é o que decide adulto, criança ou bebé. */
export function ageAt(dob: string | null, when: string | null): number | null {
  if (!dob || !when) return null
  const b = new Date(dob)
  const w = new Date(when)
  let age = w.getFullYear() - b.getFullYear()
  const m = w.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && w.getDate() < b.getDate())) age--
  return age
}

/** Minutos absolutos → "04:05". */
export function hhmm(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** Minutos → "8h 25m". */
export function dur(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h${m ? ` ${pad(m)}m` : ""}`
}

/**
 * Contagem decrescente "12:04:31" / "04:31".
 *
 * Devolve null quando já passou, para quem chama poder mostrar outra coisa em
 * vez de um zero que não explica nada.
 */
export function countdown(target: string | null): string | null {
  if (!target) return null
  const left = Math.floor((Date.parse(target) - Date.now()) / 1000)
  if (left <= 0) return null
  const h = Math.floor(left / 3600)
  const m = Math.floor((left % 3600) / 60)
  const s = left % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// ── passageiros ──────────────────────────────────────────────────────────────

export interface PaxMix {
  adults: number
  children: number
  infantsInSeat: number
  infantsOnLap: number
}

export const paxTotalOf = (p: PaxMix) =>
  p.adults + p.children + p.infantsInSeat + p.infantsOnLap

/** "2 adultos · 1 criança · 1 bebé ao colo" */
export function paxFull(p: PaxMix, t?: Translator): string {
  const parts: string[] = []
  if (p.adults) {
    parts.push(
      t
        ? t("common.adults", { count: p.adults })
        : `${p.adults} ${p.adults > 1 ? "adults" : "adult"}`
    )
  }
  if (p.children) {
    parts.push(
      t
        ? t("common.children", { count: p.children })
        : `${p.children} ${p.children > 1 ? "children" : "child"}`
    )
  }
  if (p.infantsInSeat) {
    parts.push(
      t
        ? t("pc.paxMix.infantsSeat", { count: p.infantsInSeat })
        : `${p.infantsInSeat} ${p.infantsInSeat > 1 ? "infants in seat" : "infant in seat"}`
    )
  }
  if (p.infantsOnLap) {
    parts.push(
      t
        ? t("pc.paxMix.infantsLap", { count: p.infantsOnLap })
        : `${p.infantsOnLap} ${p.infantsOnLap > 1 ? "infants on lap" : "infant on lap"}`
    )
  }
  return parts.join(" · ")
}

/** "3 passageiros" */
export function paxShort(p: PaxMix, t?: Translator): string {
  const n = paxTotalOf(p)
  if (t) return t("common.passengers", { count: n })
  return `${n} ${n > 1 ? "passengers" : "passenger"}`
}

/** "+238 991 44 07" — o número como o cliente o reconhece. */
export function phoneDisplay(dialCode: string, phone: string): string {
  const spaced = (phone || "").replace(/(\d{3})(?=\d)/g, "$1 ").trim()
  return `${dialCode} ${spaced}`.trim()
}

// ── rótulos ──────────────────────────────────────────────────────────────────

export const TRIP_LABEL: Record<TripKind, string> = {
  round: "Round trip",
  oneway: "One way",
  multi: "Multi-city",
}

export const CABIN_LABEL: Record<CabinKind, string> = {
  economy: "Economy",
  premium: "Premium economy",
  business: "Business",
  first: "First class",
}

/*
 * Os mesmos dois rótulos, na língua de quem lê.
 *
 * As chaves são as de `tripTypes` e `cabins`, que já existiam para o
 * back-office e para os emails — o vocabulário é o mesmo e não ganha nada em
 * ser escrito duas vezes. O ecrã fala 'round' e 'premium' e o dicionário fala
 * 'round_trip' e 'premium_economy'; a tradução entre os dois já vive em
 * `catalog.ts`, e é ela que se usa aqui.
 */
export function tripLabel(trip: TripKind, t?: Translator): string {
  return t ? t(`tripTypes.${TRIP_TO_DB[trip]}`) : TRIP_LABEL[trip]
}

export function cabinLabel(cabin: CabinKind, t?: Translator): string {
  return t ? t(`cabins.${CABIN_TO_DB[cabin]}`) : CABIN_LABEL[cabin]
}

/**
 * "Praia" a partir de um IATA.
 *
 * O mapa vem do servidor (`PcRequestView.cities`), que é o único lado que tem o
 * catálogo dos nove mil aeroportos. Sem mapa — ou com um código que ele não
 * traz — fica o próprio código, que é curto mas nunca está errado.
 */
export function cityOf(
  ia: string | null | undefined,
  cities?: Record<string, string>
): string {
  if (!ia) return "—"
  return cities?.[ia] ?? ia
}

/**
 * O link do WhatsApp com a referência já escrita na mensagem.
 *
 * A mensagem é escrita pelo cliente, e por isso sai na língua dele: mandar um
 * "Hello, this is about request…" a partir de um ecrã em português punha-o a
 * abrir a conversa numa língua que não escolheu.
 */
export function waLink(
  waNumber: string,
  reference?: string | null,
  t?: Translator
): string {
  const text = reference
    ? t
      ? t("pc.wa.aboutRequest", { reference })
      : `Hello, this is about request ${reference}`
    : t
      ? t("pc.wa.help")
      : "Hello, I would like help with a flight request"
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`
}
