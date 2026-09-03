/**
 * WeeFly propostas — tipos e aritmética.
 *
 * Sem imports de servidor, pela mesma razão que case-status.ts: o compositor do
 * back-office recalcula totais a cada tecla no browser, e a página do cliente
 * mostra os mesmos números renderizada no servidor. Uma só implementação, ou os
 * dois lados divergem no cêntimo e ninguém percebe porquê.
 */

export type OfferDirection = "ida" | "volta"

export type Cabin = "economy" | "premium_economy" | "business" | "first"

/* As etiquetas das classes estão em `cabins.*` nos dicionários. */

export interface OfferSegment {
  id: string
  direction: OfferDirection
  position: number
  carrier_code: string | null
  flight_number: string | null
  equipment: string | null
  booking_class: string | null
  cabin: Cabin
  origin: string | null
  destination: string | null
  /** Hora local do aeroporto, "YYYY-MM-DDTHH:mm". Ver migração 0005. */
  depart_at: string | null
  arrive_at: string | null
  terminal_from: string | null
  terminal_to: string | null
}

export interface Offer {
  id: string
  position: number
  name: string
  /** Desmarcada no painel de publicação: fica composta, mas não sai. */
  include_in_proposal: boolean
  is_recommended: boolean
  is_cheapest: boolean
  is_fastest: boolean
  fare_name: string | null
  /*
   * FB-03 · a bagagem, em contagem.
   *
   * `baggage_cabin` e `baggage_hold` são as colunas de texto que estas
   * substituem. Ficam no tipo porque ficam na base (ver a migração 0012): são a
   * única cópia do peso que alguma vez foi escrito, e continuam a ser lidas
   * quando uma oferta antiga não tem contagem. Ninguém as escreve.
   */
  baggage_cabin_count: number | null
  baggage_hold_count: number | null
  /** @deprecated Só leitura, e só para ofertas anteriores à migração 0012. */
  baggage_cabin: string | null
  /** @deprecated Só leitura, e só para ofertas anteriores à migração 0012. */
  baggage_hold: string | null
  /**
   * PC-B · não reembolsável, como campo.
   *
   * O ecrã do cliente decidia isto correndo uma expressão regular sobre
   * `refund_policy`, em três línguas. `refund_policy` continua a existir para a
   * letra pequena; a decisão passou a ser esta.
   */
  non_refundable: boolean
  /** PC-06a · as horas já foram confirmadas por uma pessoa? Ver migração 0012. */
  times_confirmed: boolean
  /**
   * C-24 · alguém assumiu que esta oferta parte num dia diferente do pedido.
   *
   * Sem isto uma data diferente tranca a publicação e não há por onde sair — a
   * única porta reescrevia o pedido do cliente. Ver a migração 0014.
   */
  date_change_confirmed: boolean
  date_change_reason: string | null
  change_policy: string | null
  refund_policy: string | null
  seat_policy: string | null
  documents: string | null
  price_adult: number
  price_child: number
  price_infant: number
  taxes_total: number
  service_fee: number
  lock_fee: number
  lock_fee_enabled: boolean
  /**
   * A validade **comercial** da proposta: o prazo que a WeeFly dá ao cliente
   * para decidir. Escrita à mão pelo vendedor. Não é, e nunca foi, prova de que
   * a tarifa está retida — ver `fare_held_until`.
   */
  valid_until: string | null
  /**
   * FB-04 · o instante até ao qual a companhia segura o lugar e o preço.
   *
   * Só isto autoriza a palavra "garantido" no ecrã do cliente. Vem do `option
   * time` do Amadeus, ou de uma retenção que o vendedor confirmou com a
   * companhia e registou. Nulo é o caso normal.
   */
  fare_held_until: string | null
  fare_held_source: "amadeus" | "manual" | null
  fare_held_ref: string | null
  agent_note: string | null
  segments: OfferSegment[]
}

/** `cost_total` só existe do lado do back-office — ver migração 0005. */
export interface AdminOffer extends Offer {
  cost_total: number
}

export interface PaxCounts {
  adults: number
  children: number
  infants: number
}

export type ProposalStatus = "rascunho" | "publicada"

export interface Proposal {
  id: string
  case_id: string
  revision: number
  status: ProposalStatus
  currency: string
  opening_message: string | null
  published_at: string | null
  selected_offer_id: string | null
  selected_at: string | null
}

// --- Dinheiro ---------------------------------------------------------------
// Tudo em unidades menores (bigint na base), como em case_payments.amount.

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", CVE: "$" }

function groups(minor: number): string {
  return (minor / 100)
    .toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    /* pt-PT agrupa milhares com espaço insecável — normal ou estreito, conforme
       a versão do ICU. `\s` apanha os dois sem os escrever: caracteres
       invisíveis no código-fonte são um convite a que alguém os apague sem dar
       por isso. Um número formatado não contém mais nenhum espaço. */
    .replace(/\s/g, " ")
}

/** "$ 1 842,00" — símbolo quando existe, código quando não. */
export function formatMoney(minor: number, currency: string): string {
  const symbol = SYMBOLS[currency.toUpperCase()]
  return symbol
    ? `${symbol} ${groups(minor)}`
    : `${groups(minor)} ${currency.toUpperCase()}`
}

/** Sem símbolo, para dentro de tabelas onde a moeda já está no cabeçalho. */
export function formatAmountPlain(minor: number): string {
  return groups(minor)
}

/**
 * "1 842,00", "1842.00", "1.842,00" → 184200.
 *
 * O vendedor escreve como lhe sai, e o que lhe sai depende de estar a copiar de
 * um email em inglês ou a escrever de cabeça em português. Ambos têm de dar o
 * mesmo número.
 */
export function parseMoney(input: string): number {
  const cleaned = String(input).replace(/[^\d.,-]/g, "")
  if (!cleaned) return 0

  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")
  const decimalAt = Math.max(lastComma, lastDot)

  // Sem separador decimal, ou com um que na verdade agrupa milhares ("1.842").
  const looksDecimal = decimalAt !== -1 && cleaned.length - decimalAt - 1 <= 2

  const digitsOnly = (s: string) => s.replace(/[^\d]/g, "")
  const whole = looksDecimal ? cleaned.slice(0, decimalAt) : cleaned
  const frac = looksDecimal ? digitsOnly(cleaned.slice(decimalAt + 1)) : ""

  const major = Number(digitsOnly(whole) || "0")
  const cents = Number((frac + "00").slice(0, 2))
  const value = major * 100 + cents
  return cleaned.startsWith("-") ? -value : value
}

// --- Totais -----------------------------------------------------------------

/**
 * BO-13 · o serviço WeeFly, pré-preenchido.
 *
 * Vinte na moeda do caso, em unidades menores. É **por reserva** e não por
 * passageiro — sempre foi, `service_fee` sempre foi um total — e o que mudou é a
 * omissão: uma oferta nova nascia a zero e alguém tinha de se lembrar. O número
 * vive aqui e na omissão da coluna (migração 0013), e em mais lado nenhum.
 */
export const WEEFLY_SERVICE_DEFAULT = 2000

/**
 * BO-13 · a primeira das duas linhas que o cliente vê: "Preço".
 *
 * O preço por passageiro passa a ser **o preço final da companhia, taxas já
 * incluídas** — o campo de taxas de aeroporto saiu do formulário. `taxes_total`
 * continua a somar aqui porque as propostas anteriores a esta mudança têm as
 * taxas escritas à parte, e dobrá-las no preço unitário exigiria dividi-las pelo
 * número de passageiros: um valor que ninguém escreveu.
 *
 * Para uma oferta nova a soma é preço × passageiros e mais nada. Para uma antiga
 * é preço × passageiros + taxas. Nos dois casos é a tarifa completa, que é o que
 * a linha diz — e em nenhum dos dois o total muda.
 */
export function offerFareTotal(offer: Offer, pax: PaxCounts): number {
  return (
    offer.price_adult * pax.adults +
    offer.price_child * pax.children +
    offer.price_infant * pax.infants +
    offer.taxes_total
  )
}

/**
 * O total: a tarifa mais o serviço WeeFly.
 *
 * Bebés não pagam lugar em nenhum dos exemplos, mas pagam taxa em muitas rotas
 * africanas, por isso têm linha própria em vez de serem ignorados.
 */
export function offerTotal(offer: Offer, pax: PaxCounts): number {
  return (
    offerFareTotal(offer, pax) +
    offer.service_fee +
    (offer.lock_fee_enabled ? offer.lock_fee : 0)
  )
}

export function offerMargin(
  offer: AdminOffer,
  pax: PaxCounts
): { amount: number; pct: number } {
  const total = offerTotal(offer, pax)
  const amount = total - offer.cost_total
  return { amount, pct: total > 0 ? (amount / total) * 100 : 0 }
}

// --- Horas ------------------------------------------------------------------

/**
 * Minutos absolutos de uma hora local, lida como texto.
 *
 * `new Date("2026-09-14T08:40")` interpreta no fuso de quem corre o código —
 * o que daria durações diferentes no servidor e no browser do vendedor. Aqui os
 * campos são extraídos à mão e somados em UTC, de forma a que a subtração entre
 * duas horas do mesmo itinerário dê sempre o mesmo resultado.
 */
function naiveMinutes(value: string | null): number | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  return Date.UTC(+y, +mo - 1, +d, +h, +mi) / 60000
}

/**
 * Duração de um trecho, em minutos.
 *
 * Aviso honesto: isto ignora fusos horários, porque as horas guardadas são
 * locais de cada aeroporto e não trazem offset. Praia → Boston dá 7h20 no
 * mockup e é assim que o vendedor a lê no ecrã da companhia; a soma é a
 * diferença entre relógios, não o tempo de voo real. Para o que o cliente
 * precisa de decidir, é a leitura certa — e é a única possível sem uma base de
 * fusos por aeroporto.
 */
export function segmentMinutes(segment: OfferSegment): number | null {
  const from = naiveMinutes(segment.depart_at)
  const to = naiveMinutes(segment.arrive_at)
  if (from === null || to === null) return null
  const diff = to - from
  return diff >= 0 ? diff : null
}

/** Escala entre dois trechos consecutivos. */
export function layoverMinutes(
  previous: OfferSegment,
  next: OfferSegment
): number | null {
  const landed = naiveMinutes(previous.arrive_at)
  const departs = naiveMinutes(next.depart_at)
  if (landed === null || departs === null) return null
  const diff = departs - landed
  return diff >= 0 ? diff : null
}

/** Porta a porta: primeira partida até à última chegada. */
export function legMinutes(segments: OfferSegment[]): number | null {
  if (segments.length === 0) return null
  const from = naiveMinutes(segments[0].depart_at)
  const to = naiveMinutes(segments[segments.length - 1].arrive_at)
  if (from === null || to === null) return null
  const diff = to - from
  return diff >= 0 ? diff : null
}

/** "10h 35m", "55m". Devolve "—" quando faltam horas para calcular. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, "0")}m`
}

/** Dias que a chegada cai depois da partida — o "+1" ao lado da hora. */
export function dayOffset(segments: OfferSegment[]): number {
  if (segments.length === 0) return 0
  const from = segments[0].depart_at
  const to = segments[segments.length - 1].arrive_at
  if (!from || !to) return 0
  const start = Date.UTC(
    +from.slice(0, 4),
    +from.slice(5, 7) - 1,
    +from.slice(8, 10)
  )
  const end = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((end - start) / 86400000)
}

/** "HH:MM" da parte horária, sem passar por Date. */
export function timeOf(value: string | null): string {
  return value?.slice(11, 16) ?? "--:--"
}

export function legsOf(offer: Offer): Record<OfferDirection, OfferSegment[]> {
  const sort = (a: OfferSegment, b: OfferSegment) => a.position - b.position
  return {
    ida: offer.segments.filter((s) => s.direction === "ida").sort(sort),
    volta: offer.segments.filter((s) => s.direction === "volta").sort(sort),
  }
}

/** "Direto" · "1 escala · SID 1h 20m" · "2 escalas". */
export function stopsLabel(segments: OfferSegment[]): string {
  const stops = segments.length - 1
  if (stops <= 0) return "Direto"
  if (stops === 1) {
    const wait = layoverMinutes(segments[0], segments[1])
    const where = segments[0].destination ?? "escala"
    return wait === null
      ? `1 escala · ${where}`
      : `1 escala · ${where} ${formatDuration(wait)}`
  }
  return `${stops} escalas`
}

/** Companhias e voos da opção: "VR 231 · VR 3800". */
export function flightCodes(segments: OfferSegment[]): string {
  return segments
    .map((s) => [s.carrier_code, s.flight_number].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" · ")
}

/** Duração total da viagem, para ordenar por "mais rápida". */
export function offerTravelMinutes(offer: Offer): number | null {
  const { ida, volta } = legsOf(offer)
  const out = legMinutes(ida)
  const back = legMinutes(volta)
  if (out === null) return back
  return back === null ? out : out + back
}

// ── FB-04 · o preço garantido e o preço segurado ─────────────────────────────

/**
 * Quanto tempo a proposta vale, contado de quando foi enviada.
 *
 * O backlog é explícito: uma hora **a partir do momento em que a proposta
 * financeira é enviada**, e não do fim da pesquisa. A diferença importa porque
 * era a segunda que se media — o vendedor escrevia uma data à mão em cada
 * oferta, e essa data começava a contar de nada em particular.
 *
 * Um número aqui e em mais lado nenhum: o contador do cliente, a decisão de
 * expirar e o texto do ecrã leem-no todos deste sítio.
 */
export const PROPOSAL_VALIDITY_HOURS = 1

/**
 * O instante em que a proposta deixa de valer.
 *
 * Deriva de `published_at`, que é gravado pelo servidor no momento da
 * publicação (ver `publishProposal`) — não de nada que alguém escreva. É isso
 * que torna a promessa de uma hora verificável em vez de declarada.
 */
export function proposalValidUntil(publishedAt: string | null): number | null {
  if (!publishedAt) return null
  const at = Date.parse(publishedAt)
  if (!Number.isFinite(at)) return null
  return at + PROPOSAL_VALIDITY_HOURS * 3600_000
}

export function proposalExpired(
  publishedAt: string | null,
  now: number = Date.now()
): boolean {
  const deadline = proposalValidUntil(publishedAt)
  return deadline !== null && now >= deadline
}

/**
 * A natureza do preço de uma oferta, que é o que decide o que o cliente lê.
 *
 *   `guaranteed`  — a companhia está a segurar o lugar e o preço, e há um
 *                   instante dado por ela até quando. É o único caso em que a
 *                   palavra "garantido" pode aparecer no ecrã.
 *   `held`        — a WeeFly segura o preço comercialmente durante a janela da
 *                   proposta. É uma promessa nossa, não da companhia.
 *   `indicative`  — a proposta já passou da janela: o valor tem de ser
 *                   reconfirmado antes de valer alguma coisa.
 *
 * Antes disto, `guaranteed` era `Boolean(offer.valid_until)` — uma data escrita
 * à mão pelo vendedor. A aplicação prometia ao cliente uma tarifa retida sem
 * que existisse retenção nenhuma, que é exactamente o que o backlog fecha a
 * proibir: nunca um contador ao lado de um preço que não está seguro.
 */
export type PriceNature = "guaranteed" | "held" | "indicative"

export function priceNature(
  offer: Offer,
  publishedAt: string | null,
  now: number = Date.now()
): PriceNature {
  const held = fareHeldUntil(offer)
  if (held !== null && held > now) return "guaranteed"
  return proposalExpired(publishedAt, now) ? "indicative" : "held"
}

/** O instante da retenção da companhia, ou null quando não há nenhuma. */
export function fareHeldUntil(offer: Offer): number | null {
  if (!offer.fare_held_until || !offer.fare_held_source) return null
  const at = Date.parse(offer.fare_held_until)
  return Number.isFinite(at) ? at : null
}

/**
 * O relógio que o cliente vê: o mais cedo entre a janela da proposta e a
 * retenção mais curta que exista.
 *
 * Uma retenção da companhia que caia antes do fim da janela manda, porque é a
 * primeira coisa que se perde. Uma que caia depois não estica a janela — a
 * proposta continua a valer uma hora.
 */
export function customerDeadline(
  offers: Offer[],
  publishedAt: string | null
): number | null {
  const window = proposalValidUntil(publishedAt)
  const holds = offers.map(fareHeldUntil).filter((v): v is number => v !== null)
  const candidates = [window, ...holds].filter(
    (v): v is number => v !== null
  )
  return candidates.length ? Math.min(...candidates) : null
}

/** Fuso de Cabo Verde: UTC−1 o ano inteiro, sem horário de verão. */
const CABO_VERDE_OFFSET_MINUTES = -60

/**
 * O instante real de uma validade escrita em hora de Cabo Verde.
 *
 * `valid_until` é guardada sem fuso (ver migração 0005) porque é isso que o
 * vendedor escreve e o cliente lê. Para a contagem decrescente da página do
 * cliente fazer sentido no telemóvel de quem está em Boston, é preciso um
 * instante — e é aqui, num sítio só, que a hora de parede vira instante.
 */
export function validityInstant(value: string | null): number | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  return Date.UTC(+y, +mo - 1, +d, +h, +mi) - CABO_VERDE_OFFSET_MINUTES * 60000
}

/**
 * "6 de setembro, 18:00" — como o mockup C3 a escreve.
 *
 * O nome do mês vem do `Intl` e não de uma lista escrita à mão: são doze
 * palavras por idioma que o browser já sabe de cor, e assim acompanham a
 * língua de quem lê sem ninguém as manter.
 *
 * @param localeTag Etiqueta BCP-47 — ver `LOCALE_TAGS` em `i18n/config.ts`.
 */
export function formatValidity(
  value: string | null,
  localeTag = "pt-PT"
): string | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const day = new Intl.DateTimeFormat(localeTag, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(Date.UTC(+y, +mo - 1, +d))
  return `${day}, ${h}:${mi}`
}

// --- Validação --------------------------------------------------------------

/**
 * O que falta a uma oferta para poder ser publicada.
 *
 * Publicar com um itinerário meio escrito é pior do que não publicar: o cliente
 * recebe um email a dizer que há uma proposta e encontra uma linha em branco.
 * A lista devolvida é mostrada tal e qual no painel de publicação — daí não
 * serem frases, mas chaves: a mesma verificação corre no browser (compositor) e
 * no servidor (publicação), e cada lado traduz na língua de quem está a ler.
 */
export interface OfferBlocker {
  key: string
  count?: number
}

/** As datas que o cliente pediu, contra as quais a oferta é medida. */
export interface RequestedDates {
  departDate: string | null
  returnDate: string | null
}

/**
 * Escala abaixo da qual a ligação é apertada.
 *
 * Não bloqueia — quarenta minutos em Sal é uma ligação normal e em Charles de
 * Gaulle é um voo perdido, e o sistema não sabe a diferença. Avisa, e quem
 * decide é quem está a compor.
 */
export const TIGHT_CONNECTION_MINUTES = 45

/**
 * A data de partida de um sentido: a do primeiro trecho.
 *
 * Só a parte da data, sem hora — é o que se compara com o que o cliente pediu.
 */
function legDate(segments: OfferSegment[]): string | null {
  return segments[0]?.depart_at?.slice(0, 10) ?? null
}

export function offerBlockers(
  offer: Offer,
  pax: PaxCounts,
  requested?: RequestedDates
): OfferBlocker[] {
  const problems: OfferBlocker[] = []
  const { ida, volta } = legsOf(offer)

  if (!offer.name.trim()) problems.push({ key: "blockers.name" })
  if (ida.length === 0) problems.push({ key: "blockers.noOutbound" })

  const incomplete = offer.segments.filter(
    (s) => !s.origin || !s.destination || !s.depart_at || !s.arrive_at
  )
  if (incomplete.length > 0) {
    problems.push({ key: "blockers.incomplete", count: incomplete.length })
  }

  /*
   * BO-07 · as datas, aos três níveis que o pedido descreve.
   *
   * 1 · dentro do trecho: a chegada é depois da partida. Uma chegada de
   *     madrugada no dia seguinte é legítima e passa — é o "+1" que o cartão
   *     mostra; o que não passa é chegar antes de sair, que só pode ser um erro
   *     de escrita.
   */
  const backwards = offer.segments.filter(
    (s) => s.depart_at && s.arrive_at && (segmentMinutes(s) ?? -1) <= 0
  )
  if (backwards.length > 0) problems.push({ key: "blockers.backwards" })

  /*
   * 2 · entre trechos: cada voo parte depois de o anterior aterrar. Sem isto
   *     publica-se um itinerário em que o cliente embarca antes de chegar à
   *     escala, e é ele que descobre no aeroporto.
   */
  const outOfOrder = [ida, volta].some((leg) =>
    leg.some(
      (segment, i) =>
        i > 0 &&
        leg[i - 1].arrive_at &&
        segment.depart_at &&
        (layoverMinutes(leg[i - 1], segment) ?? -1) < 0
    )
  )
  if (outOfOrder) problems.push({ key: "blockers.outOfOrder" })

  /*
   * 3 · contra o pedido: a ida parte no dia que o cliente pediu, e a volta no
   *     dia que ele pediu para voltar.
   *
   * C-24 · isto era um bloqueio definitivo, e foi o item mais grave do teste.
   *
   * A regra continua a valer — uma data que ninguém pediu é uma viagem
   * diferente e não pode sair por distracção. O que mudou é a saída. Era
   * reescrever o pedido do cliente por "Propor novas datas": mudava as datas
   * dele, exigia motivo, e mandava uma proposta publicada de volta a rascunho
   * numa revisão nova. Quem encontrasse uma tarifa melhor no dia seguinte não
   * tinha como a oferecer, e o backlog é explícito quanto ao custo disso — "não
   * se pode oferecer uma opção mais barata ou melhor por causa de uma
   * validação".
   *
   * Agora a mudança pertence à oferta. Um gesto explícito na oferta, com
   * motivo, assume-a; o pedido original fica intacto no histórico, que é onde o
   * cliente o reconhece. Sem esse gesto continua a travar: a diferença entre
   * uma pergunta e uma parede é haver resposta, não deixar de perguntar.
   */
  if (!offer.date_change_confirmed) {
    if (requested?.departDate && ida.length > 0) {
      const out = legDate(ida)
      if (out && out !== requested.departDate.slice(0, 10)) {
        problems.push({ key: "blockers.departureMismatch" })
      }
    }
    if (requested?.returnDate && volta.length > 0) {
      const back = legDate(volta)
      if (back && back !== requested.returnDate.slice(0, 10)) {
        problems.push({ key: "blockers.returnMismatch" })
      }
    }
  }

  if (offerTotal(offer, pax) <= 0) problems.push({ key: "blockers.zeroPrice" })
  if (pax.adults > 0 && offer.price_adult <= 0) {
    problems.push({ key: "blockers.adultFare" })
  }
  if (pax.children > 0 && offer.price_child <= 0) {
    problems.push({ key: "blockers.childFare" })
  }

  /*
   * BO-13 · o bloqueio das taxas caiu, e caiu por deixar de ter objecto.
   *
   * Existia porque as taxas eram uma linha própria e uma proposta sem elas
   * escondia parte do que o cliente ia pagar. Agora o preço por passageiro é o
   * preço final da companhia com as taxas dentro: não há campo de taxas para
   * ficar por preencher, e exigir um valor numa coluna que o formulário já não
   * mostra travaria toda e qualquer proposta nova.
   *
   * O que continua travado é o que o backlog manda travar: "uma proposta não
   * pode ser publicada com preço por passageiro vazio ou a zero" — é o
   * `zeroPrice` e o `adultFare`, acima.
   */

  /* PC-06a · horas pré-preenchidas por reconhecer. */
  if (!offer.times_confirmed) problems.push({ key: "blockers.timesToConfirm" })

  return problems
}

/**
 * C-24 · esta oferta parte num dia diferente do que o cliente pediu?
 *
 * Separada de `offerBlockers` porque responde a outra pergunta. O bloqueio diz
 * "não podes publicar"; isto diz "há aqui uma decisão para alguém tomar", e é
 * verdade tanto antes como depois de ela ser tomada — o ecrã tem de continuar a
 * mostrar que a data foi mudada de propósito, e por quem, depois de confirmada.
 */
export function offerDateChange(
  offer: Offer,
  requested?: { departDate: string | null; returnDate: string | null } | null
): { depart: string | null; return: string | null; any: boolean } {
  const { ida, volta } = legsOf(offer)

  const changedDepart =
    requested?.departDate && ida.length > 0
      ? (() => {
          const out = legDate(ida)
          return out && out !== requested.departDate!.slice(0, 10) ? out : null
        })()
      : null

  const changedReturn =
    requested?.returnDate && volta.length > 0
      ? (() => {
          const back = legDate(volta)
          return back && back !== requested.returnDate!.slice(0, 10) ? back : null
        })()
      : null

  return {
    depart: changedDepart,
    return: changedReturn,
    any: Boolean(changedDepart || changedReturn),
  }
}

/**
 * O que merece um aviso mas não impede publicar.
 *
 * A diferença entre isto e `offerBlockers` é quem decide: um bloqueio é uma
 * regra ("não se publica um itinerário que chega antes de partir"), um aviso é
 * um julgamento que é de quem compõe ("45 minutos em Lisboa dá; em Paris não").
 */
export function offerWarnings(offer: Offer): OfferBlocker[] {
  const warnings: OfferBlocker[] = []
  const { ida, volta } = legsOf(offer)

  for (const leg of [ida, volta]) {
    for (let i = 1; i < leg.length; i++) {
      const wait = layoverMinutes(leg[i - 1], leg[i])
      if (wait !== null && wait >= 0 && wait < TIGHT_CONNECTION_MINUTES) {
        warnings.push({ key: "blockers.tightConnection", count: wait })
      }
    }
    /* A chegada no dia seguinte é normal em voos de longo curso; o aviso existe
       para que ninguém a leia como um erro de escrita ao rever a oferta. */
    const plus = dayOffset(leg)
    if (plus > 0) warnings.push({ key: "blockers.overnight", count: plus })
  }

  return warnings
}

/** As chaves de um bloqueio viradas em frase, na língua de quem lê. */
export function blockerText(
  blocker: OfferBlocker,
  t: (key: string, values?: Record<string, string | number | undefined>) => string
): string {
  return blocker.count === undefined
    ? t(blocker.key)
    : t(blocker.key, { count: blocker.count })
}
