/**
 * WeeFly Price Checker — os catálogos que o ecrã e o servidor partilham.
 *
 * Tudo isto vinha em duro dentro do mockup (public/mockups/price-checker.html).
 * Passa a viver aqui porque as duas pontas precisam dos mesmos valores: o
 * formulário para autocompletar aeroportos e o servidor para validar o que
 * recebeu. Um catálogo duplicado seria um catálogo que divergia.
 *
 * Sem importações de servidor — é usado por Client Components.
 */

// ── aeroportos ───────────────────────────────────────────────────────────────

export interface Airport {
  /** IATA */
  ia: string
  /** cidade */
  ct: string
  /** país e nome do aeroporto, como aparece na sugestão */
  cy: string
  /** ISO-3166 alpha-2 */
  co: string
}

export const AIRPORTS: Airport[] = [
  { ia: "RAI", ct: "Praia",         cy: "Cape Verde · Nelson Mandela",     co: "CV" },
  { ia: "SID", ct: "Sal",           cy: "Cape Verde · Amilcar Cabral",     co: "CV" },
  { ia: "VXE", ct: "Sao Vicente",   cy: "Cape Verde · Cesaria Evora",      co: "CV" },
  { ia: "BVC", ct: "Boa Vista",     cy: "Cape Verde · Aristides Pereira",  co: "CV" },
  { ia: "LIS", ct: "Lisbon",        cy: "Portugal · Humberto Delgado",     co: "PT" },
  { ia: "OPO", ct: "Porto",         cy: "Portugal · Francisco Sa Carneiro", co: "PT" },
  { ia: "FNC", ct: "Funchal",       cy: "Portugal · Madeira",              co: "PT" },
  { ia: "ORY", ct: "Paris Orly",    cy: "France",                          co: "FR" },
  { ia: "CDG", ct: "Paris Charles de Gaulle", cy: "France",                co: "FR" },
  { ia: "LYS", ct: "Lyon",          cy: "France · Saint-Exupery",          co: "FR" },
  { ia: "MRS", ct: "Marseille",     cy: "France · Provence",               co: "FR" },
  { ia: "BOS", ct: "Boston",        cy: "United States · Logan",           co: "US" },
  { ia: "JFK", ct: "New York",      cy: "United States · JFK",             co: "US" },
  { ia: "IAD", ct: "Washington",    cy: "United States · Dulles",          co: "US" },
  { ia: "AMS", ct: "Amsterdam",     cy: "Netherlands · Schiphol",          co: "NL" },
  { ia: "BRU", ct: "Brussels",      cy: "Belgium · Zaventem",              co: "BE" },
  { ia: "LUX", ct: "Luxembourg",    cy: "Luxembourg · Findel",             co: "LU" },
  { ia: "GVA", ct: "Geneva",        cy: "Switzerland · Cointrin",          co: "CH" },
  { ia: "LHR", ct: "London",        cy: "United Kingdom · Heathrow",       co: "GB" },
  { ia: "MAD", ct: "Madrid",        cy: "Spain · Barajas",                 co: "ES" },
  { ia: "BCN", ct: "Barcelona",     cy: "Spain · El Prat",                 co: "ES" },
  { ia: "MXP", ct: "Milan",         cy: "Italy · Malpensa",                co: "IT" },
  { ia: "CMN", ct: "Casablanca",    cy: "Morocco · Mohammed V",            co: "MA" },
  { ia: "DSS", ct: "Dakar",         cy: "Senegal · Blaise Diagne",         co: "SN" },
  { ia: "ABJ", ct: "Abidjan",       cy: "Ivory Coast · Felix Houphouet",   co: "CI" },
  { ia: "ACC", ct: "Accra",         cy: "Ghana · Kotoka",                  co: "GH" },
  { ia: "BIS", ct: "Bissau",        cy: "Guinea-Bissau · Osvaldo Vieira",  co: "GW" },
  { ia: "LAD", ct: "Luanda",        cy: "Angola · Quatro de Fevereiro",    co: "AO" },
  { ia: "MPM", ct: "Maputo",        cy: "Mozambique",                      co: "MZ" },
  { ia: "FOR", ct: "Fortaleza",     cy: "Brazil · Pinto Martins",          co: "BR" },
  { ia: "GRU", ct: "Sao Paulo",     cy: "Brazil · Guarulhos",              co: "BR" },
  { ia: "REC", ct: "Recife",        cy: "Brazil · Guararapes",             co: "BR" },
]

export const AIRPORT_BY_IATA: Record<string, Airport> = Object.fromEntries(
  AIRPORTS.map((a) => [a.ia, a])
)

export const AP = (ia: string | null | undefined): Airport | null =>
  (ia && AIRPORT_BY_IATA[ia]) || null

export const POPULAR = ["RAI", "SID", "LIS", "ORY", "CDG", "BOS", "AMS", "DSS"]

/** "Praia (RAI)" — como o campo mostra um aeroporto já escolhido. */
export function airportLabel(ia: string | null | undefined): string {
  const a = AP(ia)
  return a ? `${a.ct} (${a.ia})` : ""
}

export function searchAirports(query: string, limit = 8): Airport[] {
  const t = query.trim().toLowerCase()
  if (!t) return POPULAR.map((ia) => AIRPORT_BY_IATA[ia]).filter(Boolean)
  return AIRPORTS.filter(
    (a) =>
      a.ct.toLowerCase().includes(t) ||
      a.ia.toLowerCase().includes(t) ||
      a.cy.toLowerCase().includes(t)
  ).slice(0, limit)
}

// ── indicativos e países ─────────────────────────────────────────────────────

export interface DialCode {
  c: string
  n: string
  co: string
}

export const CCS: DialCode[] = [
  { c: "+238", n: "Cape Verde",     co: "CV" },
  { c: "+351", n: "Portugal",       co: "PT" },
  { c: "+33",  n: "France",         co: "FR" },
  { c: "+1",   n: "USA & Canada",   co: "US" },
  { c: "+31",  n: "Netherlands",    co: "NL" },
  { c: "+32",  n: "Belgium",        co: "BE" },
  { c: "+34",  n: "Spain",          co: "ES" },
  { c: "+39",  n: "Italy",          co: "IT" },
  { c: "+44",  n: "United Kingdom", co: "GB" },
  { c: "+41",  n: "Switzerland",    co: "CH" },
  { c: "+352", n: "Luxembourg",     co: "LU" },
  { c: "+49",  n: "Germany",        co: "DE" },
  { c: "+221", n: "Senegal",        co: "SN" },
  { c: "+225", n: "Ivory Coast",    co: "CI" },
  { c: "+233", n: "Ghana",          co: "GH" },
  { c: "+245", n: "Guinea-Bissau",  co: "GW" },
  { c: "+244", n: "Angola",         co: "AO" },
  { c: "+258", n: "Mozambique",     co: "MZ" },
  { c: "+212", n: "Morocco",        co: "MA" },
  { c: "+55",  n: "Brazil",         co: "BR" },
]

export const COUNTRY: Record<string, string> = {
  CV: "Cape Verde", PT: "Portugal", FR: "France", US: "United States",
  NL: "Netherlands", BE: "Belgium", ES: "Spain", IT: "Italy",
  GB: "United Kingdom", CH: "Switzerland", LU: "Luxembourg", DE: "Germany",
  SN: "Senegal", CI: "Ivory Coast", GH: "Ghana", GW: "Guinea-Bissau",
  AO: "Angola", MZ: "Mozambique", MA: "Morocco", BR: "Brazil",
}

export const NATIONALITIES = [
  "Cape Verde", "Portugal", "France", "United States", "Netherlands",
  "Belgium", "Spain", "Italy", "United Kingdom", "Switzerland", "Luxembourg",
  "Germany", "Senegal", "Ivory Coast", "Ghana", "Guinea-Bissau", "Angola",
  "Mozambique", "Morocco", "Brazil", "Other",
]

export function countryOfDialCode(cc: string): string {
  return CCS.find((x) => x.c === cc)?.co ?? "CV"
}

// ── viagem ───────────────────────────────────────────────────────────────────

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
