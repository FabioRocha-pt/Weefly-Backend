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
import type { Translator } from "@/i18n/translate"

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

// ── bagagem ──────────────────────────────────────────────────────────────────

/**
 * VIP-10 · quantas malas de porão o formulário oferece.
 *
 * O seletor mostra 0, 1 e 2, que é o que uma pessoa escolhe sem pensar. A
 * restrição da base de dados tem folga até nove pela mesma razão do `MAX_LEGS`:
 * o limite é do produto e muda aqui, não numa migração.
 *
 * Isto é o que o cliente **pede**, não o que a tarifa **inclui** — quem cota vê
 * este número ao lado e responde com a bagagem da oferta (`FB-03`). Confundir os
 * dois faria uma proposta prometer o que ninguém verificou.
 */
export const MAX_BAGGAGE = 2

/**
 * Uma contagem de bagagem, escrita como uma pessoa a lê.
 *
 * Um só sítio para as duas pontas — o seletor do formulário (`VIP-10`) e as
 * condições da oferta (`FB-03`) — porque são o mesmo número visto duas vezes, e
 * duas maneiras de o escrever fariam o cliente pensar que são coisas
 * diferentes.
 *
 * Zero tem palavras próprias: "Sem bagagem de porão" é o que faz alguém
 * escolher outra opção, e "0 malas de porão" é uma linha que os olhos saltam.
 *
 * Sprint 3.1 · o `t` é opcional pela mesma razão das funções de `format.ts`:
 * o comparador de ofertas do back-office chama isto e lê em inglês, e o ecrã
 * do cliente passa o tradutor.
 */
export function baggageLabel(
  count: number,
  kind: "cabin" | "hold" = "hold",
  t?: Translator
): string {
  if (t) {
    if (count <= 0) return t(kind === "cabin" ? "pc.bags.cabinNone" : "pc.bags.holdNone")
    return t(kind === "cabin" ? "pc.bags.cabin" : "pc.bags.hold", { count })
  }
  const noun = kind === "cabin" ? "cabin bag" : "checked bag"
  if (count <= 0) return `No ${noun}`
  return `${count} ${noun}${count === 1 ? "" : "s"}`
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

/*
 * C-33 · os cinco métodos, e só os cinco.
 *
 * Isto era uma taxonomia de **famílias** de pagamento — `transfer`, `link`,
 * `card`, `momo`, `local`, `cash` — com tabelas de provedores por país por
 * baixo de cada uma. Fazia sentido enquanto o cliente pagava dentro do link: o
 * ecrã tinha de saber que em Cabo Verde se paga por Vinti4 e nos Países Baixos
 * por iDEAL.
 *
 * O Sprint 3 muda a premissa, e está escrito nas decisões confirmadas: **o
 * pagamento acontece fora da plataforma; a validação acontece dentro dela.** O
 * cliente escolhe uma via, a escolha chega ao back-office, e é o agente que
 * fornece o link ou a referência. A plataforma não gera nada — guarda o que o
 * agente lhe dá.
 *
 * Com essa premissa, as famílias deixam de ter função: o que interessa saber de
 * um método é **o que o agente tem de escrever**. Um link, uma referência, ou
 * qualquer dos dois. É isso que `supply` diz, e é isso que decide os campos que
 * a aba Pagamento mostra.
 *
 * Sem transferência bancária — decisão confirmada, "removed from this phase".
 */
export type PayMethodId = "stripe" | "vinti4" | "revolut" | "instapay" | "paypal"

/** O que o agente fornece: um endereço, uma referência, ou qualquer dos dois. */
export type PaySupply = "link" | "reference" | "either"

/**
 * C-08 · o serviço WeeFly, pré-preenchido a 20 e editável.
 *
 * Em unidades menores da moeda do caso — 2000 = 20,00. É **por reserva** e não
 * por passageiro, e sempre foi (ver a parte 4 da migração 0013).
 *
 * A migração já põe isto como `default` da coluna, e é por isso que este
 * constante existe: `lib/proposal-prefill.ts` escrevia `service_fee: 0`
 * explicitamente ao gerar um rascunho a partir da pesquisa, o que passa por
 * cima do default da base. O resultado era que uma proposta pré-preenchida
 * saía com o serviço a zero e uma composta à mão saía com 20 — a mesma regra
 * a dar dois números, dependendo do caminho.
 *
 * Um valor por omissão em dois sítios diverge. Este é o sítio.
 */
export const DEFAULT_SERVICE_FEE = 2000

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
  /** O que o cliente lê no cartão da escolha. */
  t: string
  s: string
  /** O que o agente fornece a seguir. Decide os campos da aba Pagamento. */
  supply: PaySupply
  /** A etiqueta do campo no back-office, em português. */
  fieldPt: string
  /** Um exemplo do que ali se escreve, para o `placeholder`. */
  samplePt: string
}

/**
 * Os cinco métodos, na ordem em que o cliente os vê.
 *
 * O catálogo deixou de depender do país. Um cliente da diáspora em França e um
 * cliente na Praia escolhem da mesma lista, porque nenhuma destas vias é
 * fornecida pela plataforma — é o agente que a monta do outro lado, e ele sabe
 * o que consegue montar melhor do que uma tabela de países sabe.
 */
export const PAY_METHODS: PayMethod[] = [
  {
    id: "stripe",
    t: "Card via Stripe",
    s: "Visa · Mastercard · Amex",
    supply: "link",
    fieldPt: "Link de pagamento Stripe",
    samplePt: "https://buy.stripe.com/…",
  },
  {
    id: "vinti4",
    t: "Vinti4 / 24",
    s: "Cabo Verde · SISP",
    /* O único com as duas: a SISP dá uma referência para pagar no 24 e, em
       alternativa, um endereço de pagamento. O agente usa o que tiver. */
    supply: "either",
    fieldPt: "Referência SISP ou link",
    samplePt: "Referência 1234 5678 9012 — ou https://…",
  },
  {
    id: "revolut",
    t: "Revolut",
    s: "Transferência instantânea",
    supply: "link",
    fieldPt: "Link Revolut",
    samplePt: "https://revolut.me/…",
  },
  {
    id: "instapay",
    t: "Instapay",
    s: "Referência de pagamento",
    supply: "reference",
    fieldPt: "Referência Instapay",
    samplePt: "INSTA-000-000",
  },
  {
    id: "paypal",
    t: "PayPal",
    s: "Conta ou cartão",
    supply: "link",
    fieldPt: "Link PayPal",
    samplePt: "https://paypal.me/…",
  },
]

export const PAY_METHOD_IDS: PayMethodId[] = PAY_METHODS.map((m) => m.id)

export const payMethod = (id: string | null | undefined): PayMethod | null =>
  PAY_METHODS.find((m) => m.id === id) ?? null

export const METHOD_LABEL: Record<PayMethodId, string> = {
  stripe: "Card via Stripe",
  vinti4: "Vinti4 / 24",
  revolut: "Revolut",
  instapay: "Instapay",
  paypal: "PayPal",
}

/** As mesmas etiquetas em português, para o back-office. */
export const METHOD_LABEL_PT: Record<PayMethodId, string> = {
  stripe: "Stripe",
  vinti4: "Vinti4 / 24",
  revolut: "Revolut",
  instapay: "Instapay",
  paypal: "PayPal",
}

/**
 * As etiquetas antigas, para os casos que já existem.
 *
 * Doze casos na base de dados têm `method` da taxonomia anterior. Não se
 * migram: `transfer` não é nenhum dos cinco novos, e reescrevê-lo para um deles
 * seria inventar um método que aquele cliente nunca escolheu. O que se faz é
 * continuar a saber lê-los — um caso antigo tem de mostrar o que aconteceu, e
 * não um campo vazio.
 */
export const LEGACY_METHOD_LABEL_PT: Record<string, string> = {
  transfer: "Transferência bancária (método antigo)",
  link: "Link de pagamento (método antigo)",
  card: "Cartão (método antigo)",
  momo: "Mobile money (método antigo)",
  local: "Métodos locais (método antigo)",
  cash: "Presencial (método antigo)",
}

/** A etiqueta de qualquer método, novo ou antigo. Nunca devolve vazio. */
export function methodLabelPt(id: string | null | undefined): string {
  if (!id) return "—"
  return (
    METHOD_LABEL_PT[id as PayMethodId] ?? LEGACY_METHOD_LABEL_PT[id] ?? id
  )
}

/**
 * T-17 · a etiqueta na língua de quem lê.
 *
 * "Stripe" e "PayPal" são nomes próprios e não se traduzem; o que muda é a
 * frase à volta deles, que já vem do dicionário. Esta função existe para o
 * email ao cliente não escrever "Vinti4 / 24" em português dentro de uma frase
 * em francês — e para o back-office continuar a ler em português sem ter de
 * pensar nisso.
 */
export function methodLabel(
  id: string | null | undefined,
  locale: string | null | undefined
): string {
  if (!id) return "—"
  if (locale === "pt") return methodLabelPt(id)
  return METHOD_LABEL[id as PayMethodId] ?? methodLabelPt(id)
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

/**
 * T-11 · o prazo de pagamento, contado a partir do envio das instruções.
 *
 * "O prazo tem de ser a data e a hora em que o link de pagamento foi enviado,
 * mais uma hora." É uma decisão comercial e vive num sítio só: o servidor
 * calcula-a quando as instruções saem, o back-office mostra-a e o ecrã do
 * cliente conta a partir dela.
 *
 * Distinto de `PAY_WINDOW_HOURS`, que é a validade do link e do preço. Este é a
 * promessa que vai escrita na mensagem — e é o que o cliente lê.
 */
export const PAY_DUE_HOURS = 1
