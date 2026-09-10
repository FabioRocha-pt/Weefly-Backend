"use client"

/**
 * WeeFly Price Checker — o cartão de uma opção, como o cliente a vê.
 *
 * O mockup gerava itinerários a partir de uma tabela de aeroportos e um pouco de
 * aritmética. Aqui os trechos são os que o vendedor compôs no back-office
 * (`case_offer_segments`), e é por isso que este ficheiro é sobretudo tradução:
 * de linhas de base de dados para as mesmas classes de CSS do desenho.
 *
 * As etiquetas estão em inglês porque este ecrã é o do cliente — as funções
 * partilhadas em `proposal-math` devolvem-nas em português, que é a língua do
 * back-office.
 */

import type { Offer, OfferSegment, PriceNature } from "@/lib/proposal-math"
import {
  dayOffset,
  formatDuration,
  layoverMinutes,
  legMinutes,
  priceNature,
  timeOf,
} from "@/lib/proposal-math"
import type { PcState } from "@/lib/pc/state"
import { baggageLabel, carrierName } from "@/lib/pc/catalog"
import { cityOf, fmtDateY, money, paxFull } from "@/lib/pc/format"
import { TermIcon } from "@/components/pc/bits"
import { useT } from "@/i18n/provider"
import type { Translator } from "@/i18n/translate"

export function selectedOfferOf(state: PcState): Offer | null {
  if (!state.selectedOfferId) return null
  return state.offers.find((o) => o.id === state.selectedOfferId) ?? null
}

export function legsOfOffer(offer: Offer): {
  direction: "ida" | "volta"
  segments: OfferSegment[]
}[] {
  const sort = (a: OfferSegment, b: OfferSegment) => a.position - b.position
  const out: { direction: "ida" | "volta"; segments: OfferSegment[] }[] = []
  for (const direction of ["ida", "volta"] as const) {
    const segments = offer.segments.filter((s) => s.direction === direction).sort(sort)
    if (segments.length) out.push({ direction, segments })
  }
  return out
}

/**
 * "Directo" · "1 escala em Lisboa" — na língua de quem lê.
 *
 * T-08 · o tradutor entra por parâmetro e não por hook porque estas funções são
 * chamadas de dentro de `map`s e de outras funções puras. Quem não o passa fica
 * com o inglês, que é o que os ecrãs internos do back-office esperam.
 */
export function stopsEn(
  segments: OfferSegment[],
  cities?: Record<string, string>,
  t?: Translator
): string {
  const stops = segments.length - 1
  if (stops <= 0) return t ? t("pc.offer.nonStop") : "Non-stop"
  if (stops === 1) {
    const wait = layoverMinutes(segments[0], segments[1])
    const where = cityOf(segments[0].destination, cities)
    if (wait !== null) return `${where} · ${formatDuration(wait)}`
    return t ? t("pc.offer.oneStopIn", { city: where }) : `1 stop in ${where}`
  }
  return t ? t("pc.offer.stops", { count: stops }) : `${stops} stops`
}

export function offerStopsSummary(
  offer: Offer,
  cities?: Record<string, string>,
  t?: Translator
): string {
  const legs = legsOfOffer(offer)
  if (!legs.length) return ""
  if (legs.every((l) => l.segments.length === 1)) {
    return t ? t("pc.offer.nonStop") : "Non-stop"
  }
  if (legs.length === 1) return stopsEn(legs[0].segments, cities, t)
  const outbound = legs[0].segments.length > 1
  const inbound = legs[1].segments.length > 1
  if (outbound && inbound) {
    return t ? t("pc.offer.oneStopEachWay") : "1 stop each way"
  }
  if (outbound) return t ? t("pc.offer.oneStopOut") : "1 stop out, non-stop back"
  return t ? t("pc.offer.oneStopBack") : "Non-stop out, 1 stop back"
}

/**
 * As condições da tarifa, na ordem e com os ícones do desenho.
 *
 * FB-03 · a bagagem vem da contagem. O texto livre só é lido quando a contagem
 * não existe, e isso só acontece em ofertas anteriores à migração 0012 que a
 * conversão não conseguiu ler — nas novas, o campo ou tem número ou está por
 * responder, e por responder não aparece ao cliente.
 *
 * Zero aparece, e aparece marcado: "No checked bag" é a informação que faz
 * alguém escolher outra opção, e escondê-la faria a tarifa mais barata parecer
 * simplesmente a mais barata.
 */
export function offerTerms(
  offer: Offer,
  t?: Translator
): { ic: string; txt: string; no?: boolean }[] {
  const terms: { ic: string; txt: string; no?: boolean }[] = []

  const cabin = bagTerm(offer.baggage_cabin_count, offer.baggage_cabin, "cabin", t)
  if (cabin) terms.push({ ic: cabin.no ? "no" : "cabin", ...cabin })

  terms.push({
    ic: "person",
    txt: t ? t("pc.offer.personalItem") : "Personal item 1 · small backpack",
  })

  const hold = bagTerm(offer.baggage_hold_count, offer.baggage_hold, "hold", t)
  if (hold) terms.push({ ic: hold.no ? "no" : "hold", ...hold })

  /*
   * PC-B · "não reembolsável" vem do campo, não de uma expressão regular.
   *
   * Isto lia `refund_policy` e decidia se a tarifa era reembolsável procurando
   * "não reembols|non-refund|nao reembols" no meio da frase. Uma tarifa passava
   * a reembolsável no ecrã do cliente por causa de uma palavra escrita de outra
   * maneira, ou numa quarta língua.
   */
  if (offer.non_refundable) {
    terms.push({
      ic: "no",
      txt: t ? t("pc.offer.nonRefundable") : "Non-refundable",
      no: true,
    })
  }
  /* A letra pequena, quando existe, aparece a seguir e sem julgar nada. */
  if (offer.refund_policy) {
    terms.push({ ic: "clock", txt: offer.refund_policy })
  }
  if (offer.change_policy) terms.push({ ic: "clock", txt: offer.change_policy })
  return terms
}

/**
 * Uma linha de bagagem, da contagem ou do texto antigo.
 *
 * Devolve null quando não há resposta nenhuma — nem contagem nem texto. Uma
 * tarifa por preencher não diz nada ao cliente em vez de dizer zero, porque
 * zero é uma afirmação e ninguém a fez.
 */
function bagTerm(
  count: number | null,
  legacy: string | null,
  kind: "cabin" | "hold",
  t?: Translator
): { txt: string; no?: boolean } | null {
  if (count === null) {
    if (!legacy) return null
    const label = t
      ? t(kind === "cabin" ? "pc.offer.cabinBag" : "pc.offer.checked")
      : kind === "cabin"
        ? "Cabin bag"
        : "Checked"
    return { txt: `${label} ${legacy}` }
  }
  return { txt: baggageLabel(count, kind, t), no: count === 0 }
}

function legLabel(
  direction: "ida" | "volta",
  index: number,
  multi: boolean,
  date: string | null,
  t: Translator
): string {
  /*
   * Sprint 3.1 · a data do trecho na língua de quem lê.
   *
   * Era `toLocaleDateString("en-GB")`, que escrevia "12 Sep 2026" num ecrã em
   * português. `fmtDateY` corta a string ISO em vez de construir um `Date`, e
   * por isso continua a não haver fuso nenhum a mexer no dia — que é a razão
   * pela qual o `timeZone: "UTC"` estava aqui.
   */
  const day = date ? date.slice(0, 10) : ""
  const pretty = day ? fmtDateY(day, t) : ""
  if (multi) {
    return `${t("pc.offer.flight", { n: index + 1 })}${pretty ? ` · ${pretty}` : ""}`
  }
  const way = t(direction === "ida" ? "pc.offer.outbound" : "pc.offer.return")
  return `${way}${pretty ? ` · ${pretty}` : ""}`
}

/** Um sentido: horas, aeroportos, duração e a escala. */
export function LegStrip({
  segments,
  label,
  cities,
}: {
  segments: OfferSegment[]
  label: string
  cities?: Record<string, string>
}) {
  const t = useT()
  const first = segments[0]
  const last = segments[segments.length - 1]
  const plus = dayOffset(segments)
  const total = legMinutes(segments)

  return (
    <div className="dir">
      <span className="dirtag">{label}</span>
      <div className="strip">
        <div className="node">
          <span className="tm">{timeOf(first.depart_at)}</span>
          <span className="ia">{first.origin ?? "—"}</span>
          <span className="dt">{cityOf(first.origin, cities)}</span>
        </div>
        <div className="bar" aria-hidden="true">
          <span className="du">{formatDuration(total)}</span>
          <span className="ln" />
          <span className="d a" />
          {segments.length > 1 && <span className="st" />}
          <span className="d b" />
          <span className="sp">{stopsEn(segments, cities, t)}</span>
        </div>
        <div className="node r">
          <span className="tm">
            {timeOf(last.arrive_at)}
            {plus > 0 && <sup style={{ fontSize: 10 }}>+{plus}</sup>}
          </span>
          <span className="ia">{last.destination ?? "—"}</span>
          <span className="dt">{cityOf(last.destination, cities)}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * O cartão de uma opção.
 *
 * FB-04 · a natureza do preço vem de `priceNature`, e são três e não duas.
 *
 * Dizia "Price guaranteed" sempre que `valid_until` existisse — e `valid_until`
 * é uma data que o vendedor escreve à mão. Não havia tarifa retida em lado
 * nenhum: a aplicação prometia ao cliente uma garantia que ninguém tinha dado.
 * Agora "garantido" exige uma retenção real da companhia, com instante e origem
 * (ver `fare_held_until`, migração 0012). Sem ela o preço está **seguro por nós**
 * enquanto a proposta vale, e passa a **indicativo** quando ela cai.
 */
export function OfferCard({
  offer,
  total,
  currency,
  request,
  publishedAt,
  chosen = false,
  pending,
  onChoose,
}: {
  offer: Offer
  total: number
  currency: string
  request: PcState["request"]
  /** Quando a proposta foi enviada — a origem da janela de validade. */
  publishedAt: string | null
  /**
   * T-02 · esta é a opção que o cliente já escolheu.
   *
   * O critério pede as duas coisas: "a opção escolhida é mostrada como tal, e
   * pode voltar a ser escolhida". Marcada e **não** desactivada — quem voltou às
   * opções e mudou de ideias tem de conseguir confirmar a mesma, e um botão
   * cinzento seria o segundo beco sem saída no mesmo ecrã.
   */
  chosen?: boolean
  pending: boolean
  onChoose: () => void
}) {
  const t = useT()
  const nature = priceNature(offer, publishedAt)
  const guaranteed = nature === "guaranteed"
  const legs = legsOfOffer(offer)
  const multi = request.trip === "multi"
  const category = offer.is_recommended
    ? t("pc.offer.best")
    : offer.is_cheapest
      ? t("pc.offer.cheapest")
      : offer.is_fastest
        ? t("pc.offer.fastest")
        : offer.name || t("pc.offer.option")

  /*
   * BO-13 · duas linhas e o total, e é esta a mudança.
   *
   * Dizia "Fare X + Taxes Y", e nenhum dos dois números era o que o cliente
   * queria saber. As taxas passaram a estar dentro do preço da companhia (não há
   * campo de taxas na proposta) e o que sobra é a distinção que ele precisa de
   * ver: o que custa a viagem, e o que a WeeFly cobra por a tratar.
   *
   * As duas linhas existem para que ninguém tenha de perguntar porque é que o
   * total é 586 e não 566.
   */
  const fare =
    offer.price_adult * request.adults +
    offer.price_child * request.children +
    offer.price_infant * (request.infantsInSeat + request.infantsOnLap) +
    /* Propostas anteriores ao BO-13 têm as taxas numa coluna à parte. Somam-se
       aqui, na linha da tarifa, que é onde elas sempre pertenceram. */
    offer.taxes_total +
    (offer.lock_fee_enabled ? offer.lock_fee : 0)

  return (
    <article className={`prop${chosen ? " chosen" : ""}`}>
      <div className="prop-band">
        <span className="cat">{category}</span>
        {chosen && <span className="nat picked">{t("pc.offer.chosen")}</span>}
        <span className={`nat ${NATURE_CLASS[nature]}`}>
          {t(NATURE_KEY[nature])}
        </span>
      </div>

      <div className="prop-price">
        <div>
          <div className="tot">{money(total, currency)}</div>
          <div className="brk">
            {t("pc.offer.priceLine", {
              fare: money(fare, currency),
              service: money(offer.service_fee, currency),
            })}
          </div>
        </div>
        <div className="paxn">
          {paxFull(request, t)}
          <br />
          {t("pc.offer.totalToPay")}
        </div>
      </div>

      <div className="prop-body">
        <div className="airline">
          {offer.name || carrierName(offer.segments[0]?.carrier_code)}{" "}
          <span className="tagline">
            {offerStopsSummary(offer, request.cities, t)}
          </span>
        </div>

        {legs.map((leg, index) => (
          <LegStrip
            key={leg.direction}
            segments={leg.segments}
            cities={request.cities}
            label={legLabel(leg.direction, index, multi, leg.segments[0].depart_at, t)}
          />
        ))}

        <div className="terms">
          {offerTerms(offer, t).map((term, i) => (
            <div className={`trow${term.no ? " no" : ""}`} key={i}>
              <span className="ti">
                <TermIcon kind={term.ic} />
              </span>
              <span className="tt">{term.txt}</span>
            </div>
          ))}
        </div>

        {offer.agent_note && (
          <p className="notice" style={{ marginTop: 12 }}>
            <b>{t("pc.offer.teamNote")}</b> {offer.agent_note}
          </p>
        )}
      </div>

      <div className="prop-cta">
        <button
          className={`btn ${chosen ? "btn-ghost" : "btn-primary"}`}
          type="button"
          disabled={pending}
          onClick={onChoose}
        >
          {pending
            ? t("pc.offer.choosing")
            : chosen
              ? t("pc.offer.keep")
              : t("pc.offer.choose")}
        </button>
        <p className="subnote">
          {guaranteed ? t("pc.offer.payAfter") : t("pc.offer.reconfirm")}
        </p>
      </div>
    </article>
  )
}

/**
 * FB-04 · as três naturezas, escritas como o cliente as lê.
 *
 * "Held by WeeFly" é deliberadamente diferente de "Price guaranteed": a
 * primeira é uma promessa comercial nossa, que podemos cumprir; a segunda é da
 * companhia, e só ela a pode dar. Chamar às duas a mesma coisa era o erro.
 */
const NATURE_KEY: Record<PriceNature, string> = {
  guaranteed: "pc.offer.natureGuaranteed",
  held: "pc.offer.natureHeld",
  indicative: "pc.offer.natureIndicative",
}

const NATURE_CLASS: Record<PriceNature, string> = {
  guaranteed: "guar",
  held: "held",
  indicative: "ind",
}
