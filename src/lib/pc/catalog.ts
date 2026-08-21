/**
 * WeeFly Price Checker — os catálogos que o ecrã e o servidor partilham.
 *
 * O que ficou aqui é o vocabulário do produto: tipos de viagem, classes,
 * companhias, moedas e métodos de pagamento. Os catálogos grandes saíram para
 * onde a sua dimensão manda:
 *
 *   · aeroportos, cidades e países → `lib/airports.ts` (só servidor, nove mil
 *     linhas) e `/api/airports` para quem pesquisa;
 *   · indicativos telefónicos e nomes de países → `lib/countries.ts`
 *     (isomórfico, 7 KB, porque o formulário filtra a cada tecla).
 *
 * Sem importações de servidor — é usado por Client Components.
 */

// ── países, para os campos que pedem um país pelo nome ───────────────────────

import { COUNTRIES } from "@/lib/countries"

/**
 * As nacionalidades e os países emissores de passaporte.
 *
 * Era uma lista de vinte países com "Other" no fim, e "Other" num passaporte
 * não serve para emitir um bilhete. São agora todos, pela mesma razão dos
 * indicativos: quem viaja com um passaporte angolano emitido em Lisboa tem de
 * poder dizer as duas coisas. "Other" fica aceite porque há pedidos antigos
 * guardados com ele.
 */
export const NATIONALITIES: string[] = [
  ...COUNTRIES.map((c) => c.name).sort((a, b) => a.localeCompare(b, "en")),
  "Other",
]

// ── viagem ───────────────────────────────────────────────────────────────────

/**
 * Quantos voos cabem num multi-city.
 *
 * Quatro é a sugestão da Q3 do change request log; a resposta do cliente muda
 * este número e mais nada — o formulário, a validação do servidor e o
 * back-office leem-no todos daqui. A restrição da base de dados
 * (`trip_request_legs.position`) tem folga até seis, para que subir este limite
 * não obrigue a uma migração.
 */
export const MAX_LEGS = 4
export const MIN_LEGS = 2

export type TripKind = "round" | "oneway" | "multi"
export type CabinKind = "economy" | "premium" | "business" | "first"

export const TRIPS: Record<TripKind, string> = {
  round: "Round trip",
  oneway: "One way",
  multi: "Multi-city",
}

export const CABINS: Record<CabinKind, string> = {
  economy: "Economy",
  premium: "Premium economy",
  business: "Business",
  first: "First class",
}

/*
 * O ecrã fala 'round' e 'premium'; a base de dados fala 'round_trip' e
 * 'premium_economy'. A tradução vive aqui, nos dois sentidos, para não haver
 * um terceiro vocabulário a nascer no meio.
 */
export const TRIP_TO_DB: Record<TripKind, string> = {
  round: "round_trip",
  oneway: "one_way",
  multi: "multi_city",
}
export const TRIP_FROM_DB: Record<string, TripKind> = {
  round_trip: "round",
  one_way: "oneway",
  multi_city: "multi",
}
export const CABIN_TO_DB: Record<CabinKind, string> = {
  economy: "economy",
  premium: "premium_economy",
  business: "business",
  first: "first",
}
export const CABIN_FROM_DB: Record<string, CabinKind> = {
  economy: "economy",
  premium_economy: "premium",
  business: "business",
  first: "first",
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

// ── companhias ───────────────────────────────────────────────────────────────

export interface Carrier {
  name: string
  /** stock IATA do número de bilhete */
  prefix: string
  hub: string
}

export const CARRIERS: Record<string, Carrier> = {
  TP: { name: "TAP Air Portugal",      prefix: "047", hub: "LIS" },
  AT: { name: "Royal Air Maroc",       prefix: "147", hub: "CMN" },
  AF: { name: "Air France",            prefix: "057", hub: "CDG" },
  KL: { name: "KLM",                   prefix: "074", hub: "AMS" },
  SN: { name: "Brussels Airlines",     prefix: "082", hub: "BRU" },
  IB: { name: "Iberia",                prefix: "075", hub: "MAD" },
  VR: { name: "Cabo Verde Airlines",   prefix: "696", hub: "SID" },
  BF: { name: "Bestfly Cabo Verde",    prefix: "632", hub: "RAI" },
  DT: { name: "TAAG Angola",           prefix: "118", hub: "LAD" },
  UA: { name: "United",                prefix: "016", hub: "IAD" },
}

export function carrierName(code: string | null | undefined): string {
  if (!code) return ""
  return CARRIERS[code.toUpperCase()]?.name ?? code.toUpperCase()
}

// ── moeda ────────────────────────────────────────────────────────────────────

export interface CurrencyDef {
  sym: string
  dp: number
  pos: "before" | "after"
  label: string
}

/*
 * Só o formato. O mockup guardava também uma taxa de conversão e mostrava tudo
 * convertido de EUR — o que numa cotação real seria inventar câmbios: o preço
 * que o cliente paga é o que o vendedor escreveu, na moeda em que o escreveu.
 * Aqui a moeda do caso é a moeda do valor, e não se converte nada.
 */
export const CUR: Record<string, CurrencyDef> = {
  EUR: { sym: "€",   dp: 2, pos: "after",  label: "EUR €" },
  USD: { sym: "$",   dp: 2, pos: "before", label: "USD $" },
  CVE: { sym: "CVE", dp: 0, pos: "after",  label: "CVE" },
}

export const CURRENCIES = Object.keys(CUR)

// ── métodos de pagamento ─────────────────────────────────────────────────────

export type PayMethodId = "transfer" | "link" | "card" | "momo" | "local" | "cash"

export const LOCAL_BY_COUNTRY: Record<string, string[]> = {
  CV: ["Vinti4", "Pagalu"], PT: ["Multibanco", "MB WAY"], ES: ["Bizum"],
  FR: ["Cartes Bancaires"], NL: ["iDEAL"], BE: ["Bancontact"],
  DE: ["Giropay", "SOFORT"], BR: ["Pix", "Boleto"], GB: ["Faster Payments"],
  IT: ["Postepay"], CH: ["TWINT"], LU: ["Payconiq"], US: ["ACH"],
  SN: ["Wave"], CI: ["Wave"], GH: ["GhIPSS"], GW: ["Orange Money"],
  AO: ["Multicaixa Express"], MZ: ["M-Pesa"], MA: ["CMI"],
}

export const MOMO_BY_COUNTRY: Record<string, string[]> = {
  SN: ["Wave", "Orange Money", "Free Money"],
  CI: ["Wave", "Orange Money", "MTN MoMo"],
  GH: ["MTN MoMo", "Telecel Cash", "AirtelTigo"],
  GW: ["Orange Money"],
  MZ: ["M-Pesa", "e-Mola"],
  AO: ["Multicaixa Express"],
  CV: ["Vinti4 Mobile"],
  MA: ["Orange Money", "inwi money"],
}

export const MOMO_COUNTRIES = Object.keys(MOMO_BY_COUNTRY)
export const LINK_PROVIDERS = ["Revolut", "Wise", "PayPal", "Other"]

export interface PayMethod {
  id: PayMethodId
  t: string
  s: string
  bg: string
  free?: boolean
}

/**
 * O catálogo é o mesmo em todo o mundo; o que muda por país é a ordem e os
 * provedores dentro de cada método.
 */
export function methodsFor(co: string): PayMethod[] {
  const list: PayMethod[] = [
    {
      id: "transfer",
      t: "Bank transfer",
      s: co === "CV" ? "Local transfer · same day" : "SEPA · arrives in 1 business day",
      bg: "No fees",
      free: true,
    },
    { id: "link", t: "Payment link", s: "Revolut · Wise · PayPal", bg: "Instant" },
    { id: "card", t: "Credit or debit card", s: "Visa · Mastercard · Amex", bg: "Instant" },
    {
      id: "momo",
      t: "Mobile money",
      s: (MOMO_BY_COUNTRY[co] ?? ["Wave", "Orange Money", "MTN MoMo", "M-Pesa"]).join(" · "),
      bg: "Instant",
    },
    {
      id: "local",
      t: "Local payment methods",
      s: (LOCAL_BY_COUNTRY[co] ?? ["Multibanco", "MB WAY", "Vinti4", "Pix", "iDEAL"]).join(" · "),
      bg: "By country",
    },
    { id: "cash", t: "Pay in person", s: "At our office in Praia", bg: "Cash or card" },
  ]

  /* Cabo Verde é verificado primeiro: tem carteira móvel, mas em casa as
     pessoas pagam-nos por transferência local ou ao balcão. */
  const order: PayMethodId[] =
    co === "CV"
      ? ["transfer", "local", "cash", "link", "card", "momo"]
      : MOMO_COUNTRIES.includes(co)
        ? ["momo", "transfer", "link", "local", "card", "cash"]
        : ["transfer", "link", "card", "local", "momo", "cash"]

  return order.map((id) => list.find((m) => m.id === id)!)
}

export function providersFor(id: PayMethodId, co: string): string[] | null {
  if (id === "link") return LINK_PROVIDERS
  if (id === "momo") return MOMO_BY_COUNTRY[co] ?? ["Wave", "Orange Money", "MTN MoMo", "M-Pesa"]
  if (id === "local") return LOCAL_BY_COUNTRY[co] ?? ["Multibanco", "MB WAY", "Vinti4", "Pix", "iDEAL"]
  return null
}

export const METHOD_LABEL: Record<PayMethodId, string> = {
  transfer: "Bank transfer",
  link: "Payment link",
  card: "Card",
  momo: "Mobile money",
  local: "Local method",
  cash: "In person",
}

/** As mesmas etiquetas em português, para o back-office. */
export const METHOD_LABEL_PT: Record<PayMethodId, string> = {
  transfer: "Transferência bancária",
  link: "Link de pagamento",
  card: "Cartão",
  momo: "Mobile money",
  local: "Métodos locais",
  cash: "Presencial",
}

/** Coordenadas bancárias por país. CV para quem paga em Cabo Verde, PT para o resto. */
export const BANK_DETAILS = {
  CV: {
    bank: "Banco Comercial do Atlântico",
    iban: "CV64 0002 0000 3874 5619 0154 7",
    ibanFlat: "CV64000200003874561901547",
  },
  PT: {
    bank: "Caixa Geral de Depósitos",
    iban: "PT50 0035 0734 0004 3564 2017 3",
    ibanFlat: "PT50003507340004356420173",
  },
} as const

export const BENEFICIARY = "WeeFly Africa, Lda"
export const OFFICE_ADDRESS = "Avenida Cidade de Lisboa, Praia"
export const OFFICE_HOURS = "Mon–Fri, 08:00–18:00"
export const WA_NUMBER = "2385151515"
export const WA_DISPLAY = "+238 515 15 15"

/** Limite do comprovativo, igual ao do bucket na migração 0009. */
export const PROOF_MAX_BYTES = 8 * 1024 * 1024
export const PROOF_MIME = ["application/pdf", "image/jpeg", "image/png"]

/**
 * Quantas horas o back-office tem para validar um comprovativo antes de o
 * pagamento expirar. Decisão de negócio, num sítio só: o ecrã do cliente
 * anuncia-a, o servidor calcula a data com ela e o back-office mostra-a.
 */
export const PROOF_REVIEW_HOURS = 48

/** Quanto tempo o cliente tem para pagar depois de escolher a opção. */
export const PAY_WINDOW_HOURS = 24
