"use client"

/**
 * PC-B · o compositor de propostas, reduzido ao que faz decidir.
 *
 * Era `components/admin/offer-composer.tsx`, 2058 linhas, e era o último resto
 * da geração antiga do back-office: o resto já vivia em `components/bo/`, e
 * este ficheiro era o único consumidor vivo daquela pasta. Mudar-se para cá
 * fechou-a.
 *
 * O que o compositor pedia era um formulário de emissão de bilhete a fazer-se
 * passar por um formulário de proposta. Trinta campos para responder a um
 * cliente que quer saber três coisas: a que horas parte, quanto custa e quantas
 * malas leva. Tudo o que serve para *emitir* e não para *escolher* passou para
 * `components/bo/ticket-builder.tsx`, no separador da Emissão — o nome da
 * tarifa, o equipamento, a classe de reserva, os terminais e as políticas.
 *
 * O que ficou é a lista do backlog: rota e datas (pré-preenchidas do pedido,
 * FB-01), horas de partida e chegada (PC-06a, com a marca *a confirmar*),
 * tempo de voo e escalas (calculados), bagagem em contadores (FB-03), não
 * reembolsável, preço e taxas (PC-06b), nome da proposta, etiquetas e a
 * companhia escolhida do catálogo (PC-12).
 *
 * A gravação automática (BO-05) e a validação de datas (BO-07) vivem aqui
 * dentro e não se mexeram. Eram a razão pela qual partir este ficheiro não era
 * um copiar-colar.
 */

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  addOffer,
  duplicateOffer,
  publishProposal,
  removeOffer,
  reorderOffers,
  saveOffer,
  saveProposalMeta,
  startRevision,
  type OfferDraft,
  type SegmentDraft,
} from "@/actions/proposals"
import {
  type AdminOffer,
  type Cabin,
  type Offer,
  type OfferDirection,
  type OfferSegment,
  type PaxCounts,
  type Proposal,
  flightCodes,
  formatAmountPlain,
  formatDuration,
  formatMoney,
  layoverMinutes,
  legMinutes,
  legsOf,
  dayOffset,
  blockerText,
  offerBlockers,
  offerDateChange,
  offerFareTotal,
  offerTotal,
  offerWarnings,
  type RequestedDates,
  parseMoney,
  segmentMinutes,
  stopsLabel,
  timeOf,
} from "@/lib/proposal-math"
import {
  Check2,
  CountField,
  Field,
  Flag,
  IconButton,
  Input,
  MoneyInput,
  PriceRow,
  Section,
  inputClass,
  useAirportNames,
} from "@/components/bo/composer-bits"
import { BoAirportField } from "@/components/bo/airport-field"
import { BoErrorList } from "@/components/bo/error-list"
import { CARRIERS } from "@/lib/pc/catalog"
import { FALLBACK_AIRLINES, airlineName } from "@/lib/airlines-catalog"
import { CarrierMark } from "@/components/bo/carrier-mark"
import { useT } from "@/i18n/provider"
import type { Translator } from "@/i18n/translate"

const CURRENCIES = ["CVE", "EUR", "USD"]

/** A ordem em que as cabinas aparecem no seletor de cada trecho. */
const CABINS: Cabin[] = ["economy", "premium_economy", "business", "first"]

/**
 * C-10 · as 31 companhias do backlog, na ordem que ele lhes dá.
 *
 * Eram as dez de `CARRIERS`, ordenadas por código — o que punha a `AF` antes da
 * `VR` num back-office cabo-verdiano. A ordem passa a ser a prioridade escrita
 * no backlog: primeiro as que a WeeFly vende todos os dias (`VR`, `TP`, `AT`…),
 * depois as grandes, depois as regionais. Dentro de cada grupo, por nome.
 *
 * A lista vem de `airlines-catalog`, que lê do ficheiro e serve de recurso à
 * tabela `airlines` (migração 0017) — acrescentar a trigésima segunda é um
 * `insert`, que é o critério.
 */
const CARRIER_CODES: string[] = FALLBACK_AIRLINES.map((a) => a.iata)

/*
 * PC-12 · `CARRIERS` continua a existir, e só para o que a tabela não tem.
 *
 * Guarda o prefixo do bilhete e o hub de dez companhias — dados de emissão que
 * as outras vinte e uma não têm preenchidos, e inventá-los seria escrever
 * números de bilhete que ninguém confirmou. O nome e a ordem do seletor vêm
 * agora de `airlines-catalog`; isto fica para quem emite.
 */

// --- Estado local ------------------------------------------------------------
// Os montantes vivem como texto enquanto se escreve: "1 84" não é um número mas
// é um estado legítimo de um campo a meio de ser preenchido. A conversão para
// unidades menores acontece no cálculo e ao gravar, nunca a cada tecla.
//
// PC-B · alguns destes campos já não aparecem em lado nenhum deste ecrã.
//
// `fare_name`, as políticas de alteração, reembolso e lugar, os documentos, e
// nos trechos o equipamento, a classe de reserva e os terminais passaram para o
// construtor de bilhete, na emissão (`components/bo/ticket-builder.tsx`). O
// estado continua a carregá-los porque `saveOffer` grava a oferta inteira e
// substitui os trechos em bloco: um campo que o estado não trouxesse seria um
// campo apagado à primeira gravação automática.
//
// Não há aqui risco de as duas metades se pisarem. O construtor de bilhete só
// existe depois de a proposta estar publicada, e uma proposta publicada tranca
// este compositor — `editableProposal` recusa qualquer escrita.

interface SegmentState {
  key: string
  direction: OfferDirection
  carrier_code: string
  flight_number: string
  equipment: string
  booking_class: string
  cabin: Cabin
  origin: string
  destination: string
  depart_at: string
  arrive_at: string
  terminal_from: string
  terminal_to: string
}

interface OfferState {
  id: string
  name: string
  is_recommended: boolean
  is_cheapest: boolean
  is_fastest: boolean
  fare_name: string
  /* FB-03 · contagens, não texto. `null` é "por responder" e é diferente de 0,
     que é "não inclui" — ver o comentário em `count()`, em actions/proposals. */
  baggage_cabin_count: number | null
  baggage_hold_count: number | null
  /* PC-B · "não reembolsável" como campo. O ecrã do cliente decidia-o com uma
     expressão regular sobre `refund_policy`, em três línguas. */
  non_refundable: boolean
  /* PC-06a · as horas foram pré-preenchidas e ainda ninguém olhou para elas. */
  times_confirmed: boolean
  /* C-24 · a data desta oferta é diferente da pedida, e alguém a assumiu. */
  date_change_confirmed: boolean
  date_change_reason: string
  change_policy: string
  refund_policy: string
  seat_policy: string
  documents: string
  price_adult: string
  price_child: string
  price_infant: string
  taxes_total: string
  service_fee: string
  lock_fee: string
  lock_fee_enabled: boolean
  cost_total: string
  /* FB-04 · a retenção da companhia, que é o que autoriza dizer "garantido".
     `valid_until` saiu do compositor: a validade comercial passou a derivar de
     `published_at` (uma hora), e deixou de ser algo que alguém escreve. */
  fare_held_until: string
  fare_held_source: "amadeus" | "manual" | null
  fare_held_ref: string
  agent_note: string
  segments: SegmentState[]
}

/** `datetime-local` só aceita "YYYY-MM-DDTHH:mm"; a base devolve os segundos. */
function localMoment(value: string | null): string {
  return value ? value.slice(0, 16) : ""
}

let keySeed = 0
function nextKey(): string {
  return `s${keySeed++}`
}

/** No máximo um aviso de gravação a cada dez minutos (BO-05). */
const AUTOSAVE_TOAST_MS = 10 * 60 * 1000

const draftKey = (caseId: string, offerId: string) =>
  `weefly.bo.composer.${caseId}.${offerId}`

/**
 * O rascunho de emergência.
 *
 * Só é escrito quando a gravação no servidor falha — sessão expirada, rede em
 * baixo — e existe para responder à única pergunta que interessa nesse momento:
 * "perdi o que escrevi?". Não perdeu. Fica no browser desta pessoa até a
 * gravação seguinte passar.
 */
function keepLocalDraft(caseId: string, offerId: string, serial: string) {
  try {
    window.localStorage.setItem(
      draftKey(caseId, offerId),
      JSON.stringify({ at: new Date().toISOString(), draft: serial })
    )
  } catch {
    /* sem quota o aviso de erro continua a aparecer no ecrã */
  }
}

function dropLocalDraft(caseId: string, offerId: string) {
  try {
    window.localStorage.removeItem(draftKey(caseId, offerId))
  } catch {
    /* nada a limpar */
  }
}

function fromAdminOffer(offer: AdminOffer): OfferState {
  return {
    id: offer.id,
    name: offer.name ?? "",
    is_recommended: offer.is_recommended,
    is_cheapest: offer.is_cheapest,
    is_fastest: offer.is_fastest,
    fare_name: offer.fare_name ?? "",
    /* Ofertas anteriores à migração 0012 podem ter contagem nula e texto
       escrito. A migração já converteu o que começava por um número; o resto
       fica por responder, e é o vendedor que responde numa passagem. */
    baggage_cabin_count: offer.baggage_cabin_count,
    baggage_hold_count: offer.baggage_hold_count,
    non_refundable: offer.non_refundable,
    times_confirmed: offer.times_confirmed,
    date_change_confirmed: offer.date_change_confirmed,
    date_change_reason: offer.date_change_reason ?? "",
    change_policy: offer.change_policy ?? "",
    refund_policy: offer.refund_policy ?? "",
    seat_policy: offer.seat_policy ?? "",
    documents: offer.documents ?? "",
    price_adult: formatAmountPlain(offer.price_adult),
    price_child: formatAmountPlain(offer.price_child),
    price_infant: formatAmountPlain(offer.price_infant),
    taxes_total: formatAmountPlain(offer.taxes_total),
    service_fee: formatAmountPlain(offer.service_fee),
    lock_fee: formatAmountPlain(offer.lock_fee),
    lock_fee_enabled: offer.lock_fee_enabled,
    cost_total: formatAmountPlain(offer.cost_total),
    fare_held_until: localMoment(offer.fare_held_until),
    fare_held_source: offer.fare_held_source,
    fare_held_ref: offer.fare_held_ref ?? "",
    agent_note: offer.agent_note ?? "",
    segments: [...offer.segments]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        key: nextKey(),
        direction: s.direction,
        carrier_code: s.carrier_code ?? "",
        flight_number: s.flight_number ?? "",
        equipment: s.equipment ?? "",
        booking_class: s.booking_class ?? "",
        cabin: s.cabin,
        origin: s.origin ?? "",
        destination: s.destination ?? "",
        depart_at: localMoment(s.depart_at),
        arrive_at: localMoment(s.arrive_at),
        terminal_from: s.terminal_from ?? "",
        terminal_to: s.terminal_to ?? "",
      })),
  }
}

function draftOf(state: OfferState): OfferDraft {
  return {
    name: state.name,
    is_recommended: state.is_recommended,
    is_cheapest: state.is_cheapest,
    is_fastest: state.is_fastest,
    fare_name: state.fare_name,
    baggage_cabin_count: state.baggage_cabin_count,
    baggage_hold_count: state.baggage_hold_count,
    non_refundable: state.non_refundable,
    times_confirmed: state.times_confirmed,
    date_change_confirmed: state.date_change_confirmed,
    date_change_reason: state.date_change_reason,
    change_policy: state.change_policy,
    refund_policy: state.refund_policy,
    seat_policy: state.seat_policy,
    documents: state.documents,
    price_adult: parseMoney(state.price_adult),
    price_child: parseMoney(state.price_child),
    price_infant: parseMoney(state.price_infant),
    taxes_total: parseMoney(state.taxes_total),
    service_fee: parseMoney(state.service_fee),
    lock_fee: parseMoney(state.lock_fee),
    lock_fee_enabled: state.lock_fee_enabled,
    cost_total: parseMoney(state.cost_total),
    fare_held_until: state.fare_held_until,
    fare_held_source: state.fare_held_source,
    fare_held_ref: state.fare_held_ref,
    agent_note: state.agent_note,
    segments: state.segments.map(
      ({ key: _key, ...rest }): SegmentDraft => rest
    ),
  }
}

/** A forma que as funções de cálculo e a pré-visualização esperam. */
function asOffer(state: OfferState, position: number): Offer {
  return {
    id: state.id,
    position,
    name: state.name,
    include_in_proposal: true,
    is_recommended: state.is_recommended,
    is_cheapest: state.is_cheapest,
    is_fastest: state.is_fastest,
    fare_name: state.fare_name || null,
    baggage_cabin_count: state.baggage_cabin_count,
    baggage_hold_count: state.baggage_hold_count,
    /* As colunas de texto já não são escritas; a pré-visualização não as tem
       porque o que ela mostra é o que o cliente vai ver. */
    baggage_cabin: null,
    baggage_hold: null,
    non_refundable: state.non_refundable,
    times_confirmed: state.times_confirmed,
    date_change_confirmed: state.date_change_confirmed,
    date_change_reason: state.date_change_reason || null,
    change_policy: state.change_policy || null,
    refund_policy: state.refund_policy || null,
    seat_policy: state.seat_policy || null,
    documents: state.documents || null,
    price_adult: parseMoney(state.price_adult),
    price_child: parseMoney(state.price_child),
    price_infant: parseMoney(state.price_infant),
    taxes_total: parseMoney(state.taxes_total),
    service_fee: parseMoney(state.service_fee),
    lock_fee: parseMoney(state.lock_fee),
    lock_fee_enabled: state.lock_fee_enabled,
    /* A validade comercial já não é escrita aqui — deriva de `published_at`. */
    valid_until: null,
    fare_held_until: state.fare_held_until || null,
    fare_held_source: state.fare_held_source,
    fare_held_ref: state.fare_held_ref || null,
    agent_note: state.agent_note || null,
    segments: state.segments.map(
      (s, i): OfferSegment => ({
        id: s.key,
        position: i,
        direction: s.direction,
        carrier_code: s.carrier_code || null,
        flight_number: s.flight_number || null,
        equipment: s.equipment || null,
        booking_class: s.booking_class || null,
        cabin: s.cabin,
        origin: s.origin || null,
        destination: s.destination || null,
        depart_at: s.depart_at || null,
        arrive_at: s.arrive_at || null,
        terminal_from: s.terminal_from || null,
        terminal_to: s.terminal_to || null,
      })
    ),
  }
}

/**
 * BO-11 · onde vive cada erro.
 *
 * O prefixo do `id` do elemento; o sufixo é o id da oferta, porque o compositor
 * tem várias abertas ao mesmo tempo e dois campos com o mesmo `id` fazem o
 * `getElementById` escolher o primeiro — que seria sempre a oferta errada.
 *
 * O que não tem campo próprio aponta para a secção que o contém: um itinerário
 * incompleto não é um campo, são cinco, e mandar para o primeiro deles seria
 * uma escolha arbitrária que dava a entender que os outros estavam bem.
 */
const BLOCKER_TARGET: Record<string, string> = {
  "blockers.name": "offer-name",
  "blockers.noOutbound": "offer-itinerary",
  "blockers.incomplete": "offer-itinerary",
  "blockers.backwards": "offer-itinerary",
  "blockers.outOfOrder": "offer-itinerary",
  "blockers.departureMismatch": "offer-itinerary",
  "blockers.returnMismatch": "offer-itinerary",
  "blockers.timesToConfirm": "offer-itinerary",
  "blockers.zeroPrice": "offer-price-adult",
  "blockers.adultFare": "offer-price-adult",
  "blockers.childFare": "offer-price-child",
}

function emptySegment(direction: OfferDirection): SegmentState {
  return {
    key: nextKey(),
    direction,
    carrier_code: "",
    flight_number: "",
    equipment: "",
    booking_class: "",
    cabin: "economy",
    origin: "",
    destination: "",
    depart_at: "",
    arrive_at: "",
    terminal_from: "",
    terminal_to: "",
  }
}

// --- Compositor --------------------------------------------------------------

export function BoProposalComposer({
  caseId,
  token,
  proposal,
  offers: serverOffers,
  pax,
  requested,
  requestedBaggage,
  requestedRoute,
  brief,
}: {
  caseId: string
  token: string
  proposal: Proposal
  offers: AdminOffer[]
  pax: PaxCounts
  /** BO-07 · as datas que o cliente pediu, para as validar contra a oferta. */
  requested: RequestedDates
  /** VIP-10 · malas de porão pedidas, para o contador da oferta as mostrar. */
  requestedBaggage: number
  /**
   * FB-01 · a rota que o cliente pediu.
   *
   * Serve para marcar os campos que ainda têm o valor dele. O pedido é
   * explícito: um valor pré-preenchido tem de se distinguir de um que o agente
   * escreveu, senão quem abre a proposta a meio não sabe o que já foi
   * verificado por uma pessoa.
   */
  requestedRoute: { origin: string | null; destination: string | null }
  /** A coluna do pedido do cliente, renderizada no servidor. */
  brief: React.ReactNode
}) {
  const t = useT()
  const router = useRouter()
  const published = proposal.status === "publicada"

  const [offers, setOffers] = useState<OfferState[]>(() =>
    serverOffers.map(fromAdminOffer)
  )
  const [openId, setOpenId] = useState<string | null>(
    () => serverOffers[0]?.id ?? null
  )
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /* Quando saiu o último aviso de gravação. Começa no passado para o primeiro
     aparecer — é o que diz ao vendedor que a gravação automática existe. */
  const lastToast = useRef(0)

  const snapshots = useRef<Record<string, string>>(
    Object.fromEntries(
      serverOffers.map((o) => [o.id, JSON.stringify(draftOf(fromAdminOffer(o)))])
    )
  )

  /*
   * O servidor manda a lista de ofertas em cada render. Quando o conjunto de
   * ids muda — alguém adicionou, duplicou ou removeu — o estado local é
   * substituído. Quando os ids são os mesmos, o local é que está mais fresco
   * (é onde o vendedor está a escrever) e fica.
   */
  useEffect(() => {
    const incoming = serverOffers.map(fromAdminOffer)
    const sameSet =
      incoming.length === offers.length &&
      incoming.every((o, i) => o.id === offers[i]?.id)
    if (sameSet) return

    const appeared = incoming.find((o) => !offers.some((x) => x.id === o.id))
    setOffers(incoming)
    snapshots.current = Object.fromEntries(
      incoming.map((o) => [o.id, JSON.stringify(draftOf(o))])
    )
    if (appeared) setOpenId(appeared.id)
    else if (!incoming.some((o) => o.id === openId)) {
      setOpenId(incoming[0]?.id ?? null)
    }
    // `offers` e `openId` são deliberadamente omitidos: este efeito reage a
    // mudanças vindas do servidor, não às edições locais que ele próprio causa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverOffers])

  const open = offers.find((o) => o.id === openId) ?? null

  /*
   * BO-05 · a gravação automática, sem piscar e sem gritar.
   *
   * Três coisas mudaram em relação ao comportamento que o cliente viu:
   *
   *   · não há `router.refresh()` nenhum atrás da gravação. Gravar é escrever no
   *     servidor, não voltar a desenhar o painel: o que está no ecrã é o que o
   *     vendedor acabou de escrever, e é o mais fresco que existe;
   *   · a confirmação é um aviso discreto, no máximo um a cada dez minutos. O
   *     indicador "a gravar / gravado" continua no cabeçalho para quem o
   *     procurar, mas deixa de haver um sobressalto visual por cada pausa entre
   *     duas palavras;
   *   · se a gravação falhar, o rascunho fica guardado no browser e o vendedor é
   *     avisado com uma frase que diz o que fazer — em vez de um estado
   *     silencioso que só se descobre ao recarregar.
   */
  useEffect(() => {
    if (published || !open) return
    const serial = JSON.stringify(draftOf(open))
    if (snapshots.current[open.id] === serial) return

    const timer = setTimeout(() => {
      setSaveState("saving")
      startTransition(async () => {
        const result = await saveOffer(caseId, open.id, draftOf(open))
        if (result.error) {
          setSaveState("error")
          setError(result.error)
          keepLocalDraft(caseId, open.id, serial)
          return
        }
        snapshots.current[open.id] = serial
        dropLocalDraft(caseId, open.id)
        setSaveState("saved")
        setError(null)

        const now = Date.now()
        if (now - lastToast.current > AUTOSAVE_TOAST_MS) {
          lastToast.current = now
          setToast(t("admin.composerAutosaved"))
        }
      })
    }, 900)

    return () => clearTimeout(timer)
  }, [open, caseId, published, t])

  /* O aviso apaga-se sozinho: é uma confirmação, não uma mensagem para ler. */
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  function patch(id: string, changes: Partial<OfferState>) {
    setOffers((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...changes } : o))
    )
  }

  function patchSegment(
    offerId: string,
    key: string,
    changes: Partial<SegmentState>
  ) {
    setOffers((prev) =>
      prev.map((o) =>
        o.id === offerId
          ? {
              ...o,
              segments: o.segments.map((s) =>
                s.key === key ? { ...s, ...changes } : s
              ),
            }
          : o
      )
    )
  }

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  /**
   * Trocar a ordem das opções.
   *
   * A ordem nova aplica-se no ecrã e vai para o servidor, mas sem
   * `router.refresh()` a seguir: a lista que o servidor devolveria é a mesma que
   * já está desenhada, e voltar a desenhá-la a cada clique na seta era metade do
   * piscar de que a BO-05 se queixa.
   */
  function move(id: string, delta: number) {
    const from = offers.findIndex((o) => o.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= offers.length) return
    const next = [...offers]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOffers(next)
    setError(null)
    startTransition(async () => {
      const result = await reorderOffers(
        caseId,
        next.map((o) => o.id)
      )
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[262px_minmax(0,1fr)_350px]">
      {brief}

      {/* ═══ centro · compositor ═══ */}
      <main className="flex min-w-0 flex-col gap-3.5">
        {published && (
          <div className="rounded-xl border border-adm-ok/30 bg-adm-ok/10 p-4 text-[12.5px] leading-relaxed text-adm-ok">
            {t("admin.composerLocked", { revision: proposal.revision })}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-adm-ember/40 bg-adm-ember/10 p-4 text-[12.5px] leading-relaxed text-adm-ember">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {error}
              {saveState === "error" && ` ${t("admin.composerSaveFailedKept")}`}
            </span>
          </div>
        )}

        {offers.length === 0 && (
          <div className="rounded-xl border border-adm-line bg-adm-panel p-8 text-center">
            <p className="text-[13px] text-adm-muted">
              {t("admin.composerEmpty")}
            </p>
          </div>
        )}

        {offers.map((offer, index) =>
          offer.id === openId ? (
            <OpenOffer
              key={offer.id}
              offer={offer}
              index={index}
              pax={pax}
              requested={requested}
              requestedBaggage={requestedBaggage}
              requestedRoute={requestedRoute}
              currency={proposal.currency}
              disabled={published || pending}
              locked={published}
              onPatch={(changes) => patch(offer.id, changes)}
              onPatchSegment={(key, changes) =>
                patchSegment(offer.id, key, changes)
              }
              onDuplicate={() => run(() => duplicateOffer(caseId, offer.id))}
              onRemove={() => run(() => removeOffer(caseId, offer.id))}
              onCollapse={() => setOpenId(null)}
              t={t}
            />
          ) : (
            <CollapsedOffer
              key={offer.id}
              offer={offer}
              index={index}
              total={offers.length}
              pax={pax}
              currency={proposal.currency}
              disabled={published || pending}
              onOpen={() => setOpenId(offer.id)}
              onMove={(delta) => move(offer.id, delta)}
              t={t}
            />
          )
        )}

        {!published && (
          <button
            type="button"
            onClick={() => run(() => addOffer(caseId))}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-adm-line p-3.5 text-[13px] font-bold text-adm-muted transition-colors hover:border-[#46587A] hover:text-adm-txt-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {t("admin.composerNewOffer")}
            <span className="font-normal text-adm-muted">
              {t("admin.composerNewOfferHint")}
            </span>
          </button>
        )}
      </main>

      {/*
        BO-05 · a confirmação da gravação automática.
        Fixa no canto, some sozinha, e no máximo uma a cada dez minutos — o
        contrário do painel inteiro a repintar-se a cada pausa na escrita.
      */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full border border-adm-line bg-adm-panel px-3.5 py-2 text-[12px] font-semibold text-adm-txt-2 shadow-lg"
        >
          <Check className="h-3.5 w-3.5 text-adm-ok" />
          {toast}
        </div>
      )}

      {/* ═══ direita · pré-visualização e publicação ═══ */}
      <aside className="flex flex-col gap-[18px] xl:sticky xl:top-[18px]">
        <ClientPreview
          offer={open ? asOffer(open, 0) : null}
          pax={pax}
          currency={proposal.currency}
          token={token}
          published={published}
          t={t}
        />
        <PublishPanel
          caseId={caseId}
          token={token}
          proposal={proposal}
          offers={offers}
          serverOffers={serverOffers}
          pax={pax}
          requested={requested}
          pending={pending}
          saveState={saveState}
          onError={setError}
          onDone={() => router.refresh()}
          onRevision={() => run(() => startRevision(caseId))}
          t={t}
        />
      </aside>
    </div>
  )
}

// --- Oferta aberta -----------------------------------------------------------

function OpenOffer({
  offer,
  index,
  pax,
  requested,
  requestedBaggage,
  requestedRoute,
  currency,
  disabled,
  locked,
  onPatch,
  onPatchSegment,
  onDuplicate,
  onRemove,
  onCollapse,
  t,
}: {
  offer: OfferState
  index: number
  pax: PaxCounts
  requested: RequestedDates
  requestedBaggage: number
  requestedRoute: { origin: string | null; destination: string | null }
  currency: string
  disabled: boolean
  locked: boolean
  onPatch: (changes: Partial<OfferState>) => void
  onPatchSegment: (key: string, changes: Partial<SegmentState>) => void
  onDuplicate: () => void
  onRemove: () => void
  onCollapse: () => void
  t: Translator
}) {
  const [leg, setLeg] = useState<OfferDirection>("ida")
  const preview = asOffer(offer, index)
  const legs = legsOf(preview)
  const segments = offer.segments.filter((s) => s.direction === leg)

  const total = offerTotal(preview, pax)
  const cost = parseMoney(offer.cost_total)
  const margin = total - cost
  const marginPct = total > 0 ? ((margin / total) * 100).toFixed(1) : "0,0"

  const airportNames = useAirportNames(
    offer.segments.flatMap((seg) => [seg.origin, seg.destination])
  )

  /*
   * BO-11 · o que falta a esta oferta, com o campo de cada coisa.
   *
   * Deriva de `offerBlockers`, a mesma função que trava a publicação e que
   * corre outra vez no servidor. Aqui não é uma segunda regra: é a mesma lista,
   * com um endereço colado a cada linha. Actualiza-se enquanto se escreve
   * porque nasce do estado, não de uma tentativa de gravar.
   */
  const problems = offerBlockers(preview, pax, requested)
  const errors = problems.map((problem) => ({
    target: `${BLOCKER_TARGET[problem.key] ?? "itinerary"}-${offer.id}`,
    label: blockerText(problem, t),
  }))

  function addSegment() {
    onPatch({ segments: [...offer.segments, emptySegment(leg)] })
  }

  function removeSegment(key: string) {
    onPatch({ segments: offer.segments.filter((s) => s.key !== key) })
  }

  return (
    <article className="rounded-xl border border-[#46587A] bg-adm-panel shadow-[0_0_0_1px_rgba(70,88,122,.5)]">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-adm-line-soft p-3.5">
        <input
          id={`offer-name-${offer.id}`}
          value={offer.name}
          disabled={disabled}
          aria-invalid={!offer.name.trim() || undefined}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder={t("admin.composerOfferName")}
          className="min-w-[210px] flex-1 rounded-lg border border-adm-line bg-adm-panel-2 px-2.5 py-1.5 text-sm font-bold text-adm-txt outline-none transition-colors placeholder:font-normal placeholder:text-adm-muted focus:border-[#46587A] disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Flag
            label={t("admin.composerFlagRecommended")}
            on={offer.is_recommended}
            tone="ok"
            disabled={disabled}
            onClick={() => onPatch({ is_recommended: !offer.is_recommended })}
          />
          <Flag
            label={t("admin.composerFlagCheapest")}
            on={offer.is_cheapest}
            disabled={disabled}
            onClick={() => onPatch({ is_cheapest: !offer.is_cheapest })}
          />
          <Flag
            label={t("admin.composerFlagFastest")}
            on={offer.is_fastest}
            disabled={disabled}
            onClick={() => onPatch({ is_fastest: !offer.is_fastest })}
          />
          <IconButton
            title={t("admin.composerDuplicate")}
            onClick={onDuplicate}
            disabled={disabled}
          >
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            title={t("admin.composerRemove")}
            onClick={onRemove}
            disabled={disabled}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title={t("admin.composerCollapse")} onClick={onCollapse}>
            <ChevronUp className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </header>

      <fieldset disabled={disabled} className="space-y-5 p-3.5 disabled:opacity-70">
        {/*
          BO-11 · a lista, em cima e antes de tudo.

          Não substitui os avisos que já estavam junto aos campos — substitui a
          descoberta. Um formulário com trinta campos em três colunas não se lê
          à procura do que falta, e era isso que o painel de publicação obrigava
          a fazer: dizia "falta preencher" e deixava a busca para quem o lesse.
        */}
        {!locked && (
          <BoErrorList
            title={t("admin.errorListTitle", { count: errors.length })}
            errors={errors}
          />
        )}

        {/* itinerário */}
        <Section
          id={`offer-itinerary-${offer.id}`}
          title={t("admin.composerItinerary")}
          aside={t("admin.composerLegsSummary", {
            out: t("admin.composerSegments", { count: legs.ida.length }),
            back: t("admin.composerSegments", { count: legs.volta.length }),
          })}
        >
          <DateChecks offer={preview} t={t} />

          {/*
            PC-06a · as horas vieram de uma pesquisa e ninguém olhou para elas.

            O pré-preenchimento poupa a escrita toda e é isso que o torna útil.
            O que ele não pode fazer é publicar uma hora de partida que não
            existe: a pesquisa devolve o que devolve, e entre a pesquisa e a
            proposta pode ter mudado. Um clique a reconhecer, e não um
            formulário a repetir — obrigar a reescrever anulava o ganho.
          */}
          {!offer.times_confirmed && (
            <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-[9px] border border-adm-warn/40 bg-adm-warn/[.14] p-2.5 text-xs leading-relaxed text-[#F0C983]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                {t("admin.composerTimesToConfirm")}
              </span>
              <button
                type="button"
                onClick={() => onPatch({ times_confirmed: true })}
                className="shrink-0 rounded-lg border border-adm-warn/50 bg-adm-panel-2 px-2.5 py-1.5 text-[11.5px] font-bold text-[#F0C983] transition-colors hover:bg-adm-raise"
              >
                {t("admin.composerTimesConfirmCta")}
              </button>
            </div>
          )}

          {/*
            C-24 · o sítio próprio para confirmar que a data mudou de propósito.

            Era isto que não existia. Uma oferta noutro dia travava a publicação
            e a única saída reescrevia o pedido do cliente — pelo que quem
            encontrasse uma tarifa melhor no dia seguinte não a podia oferecer.
            O bloco aparece porque uma data mudou, e desaparece se ela voltar ao
            dia pedido: é uma decisão a tomar, não um campo permanente a ignorar.

            O motivo é obrigatório porque é a frase que o cliente vai ler. O
            pedido original dele não é tocado por este caminho — fica intacto, e
            é isso que o mantém reconhecível no histórico.
          */}
          <DateChangeConfirm
            offer={offer}
            preview={preview}
            requested={requested}
            onPatch={onPatch}
            t={t}
          />

          <div className="mb-3 flex gap-1.5">
            {(["ida", "volta"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setLeg(d)}
                aria-selected={leg === d}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors",
                  leg === d
                    ? "border-[#46587A] bg-adm-raise text-adm-txt"
                    : "border-adm-line bg-adm-panel-2 text-adm-muted hover:text-adm-txt-2"
                )}
              >
                {t(d === "ida" ? "legs.outbound" : "legs.inbound")}
              </button>
            ))}
          </div>

          {segments.length === 0 && (
            <p className="mb-2.5 rounded-lg bg-adm-panel-2 p-3 text-[12.5px] text-adm-muted">
              {t(
                leg === "ida"
                  ? "admin.composerNoOutbound"
                  : "admin.composerNoInbound"
              )}
            </p>
          )}

          {segments.map((segment, i) => {
            const previewSegments = legs[leg]
            const duration = previewSegments[i]
              ? segmentMinutes(previewSegments[i])
              : null
            const wait =
              i > 0 && previewSegments[i - 1] && previewSegments[i]
                ? layoverMinutes(previewSegments[i - 1], previewSegments[i])
                : null

            return (
              <div
                key={segment.key}
                className="mb-2.5 rounded-[10px] border border-adm-line bg-adm-panel-2 p-3"
              >
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-adm-raise text-[10px] font-extrabold text-adm-txt-2">
                    {i + 1}
                  </span>
                  <span className="text-xs font-bold text-adm-txt-2">
                    {segment.origin || "—"} → {segment.destination || "—"}
                  </span>
                  <span className="truncate text-[11px] text-adm-muted">
                    {[segment.origin, segment.destination]
                      .map((code) =>
                        !code
                          ? null
                          : airportNames[code.toUpperCase()] === null
                            ? `${code.toUpperCase()} ${t("admin.composerUnknownIata")}`
                            : (airportNames[code.toUpperCase()] ?? null)
                      )
                      .filter(Boolean)
                      .join(" → ")}
                  </span>
                  <IconButton
                    title={t("admin.composerRemoveSegment")}
                    onClick={() => removeSegment(segment.key)}
                    className="ml-auto"
                  >
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </div>

                <div className="grid grid-cols-12 gap-2.5">
                  {/* PC-12 · a companhia deixa de ser texto livre.
                      Escrevia-se o código à mão e o cartão do cliente mostrava
                      o que lá estivesse: "VR", "vr", "TAP" no campo do código.
                      Agora escolhe-se do catálogo, e o nome que o cliente lê é
                      o do catálogo. Quando houver logótipos (PC-12, Sprint 2) é
                      por este código que eles são procurados — e o próprio
                      pedido manda que a falta de logótipo caia no código, que é
                      exactamente o que se vê aqui. */}
                  <Field label={t("admin.composerCarrier")} span={4}>
                    {/* C-10 · o logótipo ao lado do seletor, para quem compõe
                        ver que escolheu a companhia certa sem ler a sigla. Uma
                        sem ficheiro mostra o código — nunca um espaço vazio. */}
                    {segment.carrier_code && (
                      <div className="mb-1.5">
                        <CarrierMark code={segment.carrier_code} />
                      </div>
                    )}
                    <select
                      value={segment.carrier_code}
                      onChange={(e) =>
                        onPatchSegment(segment.key, {
                          carrier_code: e.target.value,
                        })
                      }
                      className={inputClass}
                    >
                      <option value="">{t("admin.composerCarrierPick")}</option>
                      {CARRIER_CODES.map((code) => (
                        <option key={code} value={code}>
                          {/* C-10 · o nome vem do catálogo das 31, não das dez
                              de `CARRIERS` — que devolvia `undefined.name` e
                              rebentava o render para as vinte e uma novas. */}
                          {code} · {airlineName(code)}
                        </option>
                      ))}
                      {/* Uma companhia fora do catálogo não bloqueia a proposta:
                          fica listada como está até alguém a acrescentar. */}
                      {segment.carrier_code &&
                        !CARRIERS[segment.carrier_code] && (
                          <option value={segment.carrier_code}>
                            {segment.carrier_code} ·{" "}
                            {t("admin.composerCarrierUnknown")}
                          </option>
                        )}
                    </select>
                  </Field>
                  {/*
                    C-27 · o número de voo saiu da proposta.

                    "Não é preciso para o cliente decidir." Quem compara duas
                    opções olha para a companhia, para as horas, para as escalas
                    e para o preço — o TP1553 não muda nada nessa decisão, e é
                    mais um campo a preencher em cada trecho de cada oferta.

                    **Continua no ecrã de emissão e no bilhete**, que é onde ele
                    é obrigatório. A coluna `flight_number` não é tocada: o que
                    desaparece é o campo aqui, e as ofertas que já o têm escrito
                    mantêm-no — ver `draftOf`, que continua a gravá-lo.
                  */}
                  <Field label={t("admin.composerCabin")} span={2}>
                    <select
                      value={segment.cabin}
                      onChange={(e) =>
                        onPatchSegment(segment.key, {
                          cabin: e.target.value as Cabin,
                        })
                      }
                      className={inputClass}
                    >
                      {CABINS.map((c) => (
                        <option key={c} value={c}>
                          {t("cabins." + c)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {/* FB-01 · a marca aparece enquanto o campo ainda tem o valor
                      que o cliente deu, e some assim que alguém lhe toca. É
                      isso que a distingue de um rótulo decorativo: diz o que é
                      verdade agora, não o que era verdade quando a oferta
                      nasceu. Só no primeiro trecho — a origem do segundo é uma
                      escala, e a escala é escolha de quem cota. */}
                  {/* BO-10 · o mesmo catálogo do formulário do cliente, pela
                      mesma porta (`/api/airports`). Escrever estreita as
                      opções, casa por código, cidade e país, e o campo só
                      aceita uma entrada escolhida. */}
                  <Field
                    label={t("admin.composerOrigin")}
                    span={3}
                    prefilled={
                      i === 0 &&
                      leg === "ida" &&
                      Boolean(segment.origin) &&
                      segment.origin === requestedRoute.origin
                    }
                  >
                    <BoAirportField
                      value={segment.origin}
                      onChange={(iata) =>
                        onPatchSegment(segment.key, { origin: iata })
                      }
                      disabled={disabled}
                      placeholder="RAI"
                    />
                  </Field>
                  <Field
                    label={t("admin.composerDeparture")}
                    span={3}
                    prefilled={!offer.times_confirmed}
                  >
                    <Input
                      type="datetime-local"
                      value={segment.depart_at}
                      onChange={(v) =>
                        onPatchSegment(segment.key, { depart_at: v })
                      }
                    />
                  </Field>
                  <Field
                    label={t("admin.composerDestination")}
                    span={3}
                    prefilled={
                      i === segments.length - 1 &&
                      leg === "ida" &&
                      Boolean(segment.destination) &&
                      segment.destination === requestedRoute.destination
                    }
                  >
                    <BoAirportField
                      value={segment.destination}
                      onChange={(iata) =>
                        onPatchSegment(segment.key, { destination: iata })
                      }
                      disabled={disabled}
                      placeholder="SID"
                    />
                  </Field>
                  <Field
                    label={t("admin.composerArrival")}
                    span={3}
                    prefilled={!offer.times_confirmed}
                  >
                    <Input
                      type="datetime-local"
                      value={segment.arrive_at}
                      onChange={(v) =>
                        onPatchSegment(segment.key, { arrive_at: v })
                      }
                    />
                  </Field>

                  {/* Terminais, equipamento e classe de reserva saíram para o
                      construtor de bilhete: nenhum deles muda a escolha de quem
                      lê a proposta, e todos são precisos na emissão. */}

                  <div className="col-span-12">
                    <div className="flex flex-wrap gap-4 rounded-lg bg-adm-muted/[.14] px-2.5 py-2 text-xs text-adm-txt-2">
                      <span>
                        {t("admin.composerDuration")}{" "}
                        <b className="font-mono font-semibold text-adm-txt">
                          {formatDuration(duration)}
                        </b>
                      </span>
                      {wait !== null && (
                        <span>
                          {t("admin.composerLayoverAt", {
                            place: segment.origin || "—",
                          })}{" "}
                          <b className="font-mono font-semibold text-adm-txt">
                            {formatDuration(wait)}
                          </b>
                        </span>
                      )}
                      {i === previewSegments.length - 1 && (
                        <span>
                          {t(
                            leg === "ida"
                              ? "admin.composerLegTotalOut"
                              : "admin.composerLegTotalBack"
                          )}{" "}
                          <b className="font-mono font-semibold text-adm-txt">
                            {formatDuration(legMinutes(previewSegments))}
                          </b>
                        </span>
                      )}
                      <span className="text-adm-muted">
                        {t("admin.composerComputed")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          <button
            type="button"
            onClick={addSegment}
            className="w-full rounded-[9px] border border-dashed border-adm-line py-2.5 text-xs font-bold text-adm-muted transition-colors hover:border-[#46587A] hover:text-adm-txt-2"
          >
            {/* BO-06 · "Adicionar trecho à ida" dizia duas vezes a mesma coisa:
                a direção já está no separador em que o botão vive. */}
            {t("admin.composerAddSegment")}
          </button>
        </Section>

        {/*
          PC-B · as condições, reduzidas ao que o cliente precisa para decidir.

          Saíram daqui o nome da tarifa, as políticas de alteração e de lugar e
          os documentos. Não desapareceram: vivem no construtor de bilhete, na
          emissão, que é o momento em que alguém precisa deles. O que ficou é o
          que muda uma escolha — quantas malas leva e se pode desistir.
        */}
        <Section title={t("admin.composerConditions")}>
          <div className="grid grid-cols-12 gap-2.5">
            {/* FB-03 · contadores em vez de texto livre.
                "1 peça, 8 kg", "uma mala", "8kg" e "sim" eram todos respostas
                válidas ao mesmo campo, e nenhuma delas se compara com outra —
                que é a única coisa que o ecrã do cliente faz com este valor. */}
            <Field label={t("admin.composerBaggageCabin")} span={4}>
              <CountField
                value={offer.baggage_cabin_count}
                onChange={(v) => onPatch({ baggage_cabin_count: v })}
              />
            </Field>
            <Field label={t("admin.composerBaggageHold")} span={4}>
              <CountField
                value={offer.baggage_hold_count}
                onChange={(v) => onPatch({ baggage_hold_count: v })}
                /* VIP-10 · o que o cliente pediu, ao lado do que a tarifa dá.
                   Uma proposta com menos bagagem do que a pedida não é um erro
                   — é uma tarifa mais barata — mas tem de ser uma escolha. */
                requested={requestedBaggage}
              />
            </Field>
            {/* PC-B · "não reembolsável" passa a caixa.
                Era uma frase em texto livre, e o cartão do cliente decidia se a
                tarifa era reembolsável correndo uma expressão regular sobre ela
                — em três línguas. Uma palavra mal escrita tornava reembolsável
                uma tarifa que não é. A letra pequena continua a caber no
                construtor de bilhete; a decisão é esta caixa. */}
            <Field label={t("admin.composerRefund")} span={4}>
              <div className="flex h-[38px] items-center">
                <Check2
                  label={t("admin.composerNonRefundable")}
                  checked={offer.non_refundable}
                  onChange={(v) => onPatch({ non_refundable: v })}
                  disabled={disabled}
                />
              </div>
            </Field>
          </div>
        </Section>

        {/* preço */}
        <Section
          title={t("admin.composerPrice")}
          aside={
            <>
              {t("admin.composerUnitValues")}{" "}
              <b className="font-mono font-semibold text-adm-txt-2">
                {currency}
              </b>
            </>
          }
        >
          <div className="overflow-hidden rounded-[10px] border border-adm-line bg-adm-panel-2">
            <PriceRow
              id={`offer-price-adult-${offer.id}`}
              invalid={parseMoney(offer.price_adult) <= 0 && pax.adults > 0}
              label={t("admin.composerRowAdult")}
              hint={t("admin.composerRowAdultNote")}
              qty={`× ${pax.adults}`}
              value={offer.price_adult}
              onChange={(v) => onPatch({ price_adult: v })}
            />
            {pax.children > 0 && (
              <PriceRow
                id={`offer-price-child-${offer.id}`}
                invalid={parseMoney(offer.price_child) <= 0}
                label={t("admin.composerRowChild")}
                hint={t("admin.composerRowChildNote")}
                qty={`× ${pax.children}`}
                value={offer.price_child}
                onChange={(v) => onPatch({ price_child: v })}
              />
            )}
            {pax.infants > 0 && (
              <PriceRow
                label={t("admin.composerRowInfant")}
                hint={t("admin.composerRowInfantNote")}
                qty={`× ${pax.infants}`}
                value={offer.price_infant}
                onChange={(v) => onPatch({ price_infant: v })}
              />
            )}
            {/*
              BO-13 · a linha das taxas de aeroporto saiu daqui.

              "O preço por passageiro é o preço final da companhia, taxas já
              incluídas." Era o campo que obrigava quem cota a separar duas
              coisas que a companhia lhe dá juntas — e a separação não servia a
              ninguém: o cliente somava as duas na cabeça para saber o que ia
              pagar, e o vendedor tinha uma linha a mais para se enganar.

              A coluna `taxes_total` fica na base e continua a contar para o
              total das propostas antigas (ver `offerFareTotal`). O que
              desaparece é o campo.
            */}
            <PriceRow
              label={t("admin.composerRowService")}
              hint={t("admin.composerRowServiceNote")}
              qty={t("admin.composerPerBooking")}
              value={offer.service_fee}
              onChange={(v) => onPatch({ service_fee: v })}
              tone="fee"
            />
            <div className="grid grid-cols-[1fr_96px_128px] items-center gap-2.5 border-b border-adm-line-soft px-3 py-2.5">
              <div>
                <label className="flex items-center gap-2 text-xs text-adm-muted">
                  <input
                    type="checkbox"
                    checked={offer.lock_fee_enabled}
                    onChange={(e) =>
                      onPatch({ lock_fee_enabled: e.target.checked })
                    }
                    className="h-[15px] w-[15px] accent-adm-ember"
                  />
                  {t("admin.composerRowLock")}
                </label>
                <small className="mt-0.5 block text-[11px] text-adm-muted">
                  {t("admin.composerRowLockNote")}
                </small>
              </div>
              <div className="text-center font-mono text-xs text-adm-muted">
                {t("admin.composerTotalUnit")}
              </div>
              <MoneyInput
                value={offer.lock_fee}
                disabled={!offer.lock_fee_enabled}
                onChange={(v) => onPatch({ lock_fee: v })}
              />
            </div>
            <div className="grid grid-cols-[1fr_96px_128px] items-center gap-2.5 border-t border-adm-line bg-adm-raise px-3 py-2.5">
              <div className="text-sm font-extrabold text-adm-txt">
                {t("admin.composerTotal")}
              </div>
              <div className="text-center font-mono text-xs text-adm-muted">
                {currency}
              </div>
              <div className="text-right font-mono text-[19px] font-semibold text-adm-txt">
                {formatMoney(total, currency)}
              </div>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-12 gap-2.5">
            <Field
              label={t("admin.composerCost")}
              span={4}
              hint={t("admin.composerCostNote")}
            >
              <MoneyInput
                value={offer.cost_total}
                onChange={(v) => onPatch({ cost_total: v })}
              />
            </Field>
            <Field label={t("admin.composerMargin")} span={4}>
              <div className="rounded-lg bg-adm-muted/[.14] px-2.5 py-2 text-xs">
                <b
                  className={cn(
                    "font-mono font-semibold",
                    margin <= 0 ? "text-adm-ember" : "text-adm-ok"
                  )}
                >
                  {formatMoney(margin, currency)} · {marginPct}%
                </b>
              </div>
            </Field>
            <Field
              label={t("admin.composerHeldUntil")}
              span={4}
              hint={t("admin.composerHeldUntilNote")}
            >
              <Input
                type="datetime-local"
                value={offer.fare_held_until}
                onChange={(v) => onPatch({ fare_held_until: v })}
              />
            </Field>
          </div>

          {/*
            FB-04 · a retenção da companhia.
            Só isto autoriza a palavra "garantido" no ecrã do cliente. O campo
            que estava aqui — "válido até" — era a validade comercial escrita à
            mão, e era ela que fazia a aplicação prometer uma tarifa retida sem
            que existisse retenção nenhuma. A validade comercial passou a ser
            automática: uma hora a contar de quando a proposta é enviada.

            Origem e referência só aparecem depois de haver instante, porque
            sozinhas não afirmam nada — e a base recusa um sem o outro.
          */}
          {offer.fare_held_until && (
            <div className="mt-2.5 grid grid-cols-12 gap-2.5">
              <Field label={t("admin.composerHeldSource")} span={4}>
                <select
                  value={offer.fare_held_source ?? ""}
                  onChange={(e) =>
                    onPatch({
                      fare_held_source: (e.target.value || null) as
                        | "amadeus"
                        | "manual"
                        | null,
                    })
                  }
                  className={inputClass}
                >
                  <option value="">{t("admin.composerHeldSourcePick")}</option>
                  <option value="amadeus">Amadeus (option time)</option>
                  <option value="manual">{t("admin.composerHeldManual")}</option>
                </select>
              </Field>
              <Field
                label={t("admin.composerHeldRef")}
                span={8}
                hint={t("admin.composerHeldRefNote")}
              >
                <Input
                  value={offer.fare_held_ref}
                  onChange={(v) => onPatch({ fare_held_ref: v })}
                  mono
                  placeholder="ABC123"
                />
              </Field>
            </div>
          )}
        </Section>

        {/* nota */}
        <Section
          title={t("admin.composerNote")}
          aside={t("admin.composerNoteHint")}
        >
          <textarea
            value={offer.agent_note}
            onChange={(e) => onPatch({ agent_note: e.target.value })}
            placeholder={t("admin.composerNotePlaceholder")}
            className={cn(inputClass, "min-h-[74px] resize-y leading-relaxed")}
          />
        </Section>

        {locked && (
          <p className="text-[11.5px] text-adm-muted">
            {t("admin.composerLockedFields")}
          </p>
        )}
      </fieldset>
    </article>
  )
}

/**
 * BO-07 · o que as datas desta oferta dizem, enquanto se escreve.
 *
 * Duas listas e a diferença entre elas é o ponto: em cima o que impede
 * publicar, em baixo o que é para verificar. As mesmas regras correm outra vez
 * no servidor ao publicar (`publishProposal`) — esta é a versão rápida, para
 * quem está a escrever ver o erro no momento em que o comete.
 */
function DateChecks({ offer, t }: { offer: Offer; t: Translator }) {
  /*
   * BO-11 · os bloqueios saíram daqui.
   *
   * Estavam nesta caixa **e** no painel de publicação, e agora estão também na
   * lista do topo, que é a que leva ao campo. Três sítios a dizer a mesma coisa
   * é ruído a cada tecla, e o que se perde no ruído é o aviso que não é
   * bloqueio nenhum — o que fica aqui.
   */
  const warnings = offerWarnings(offer)
  if (warnings.length === 0) return null

  return (
    <div className="mb-3 rounded-[9px] bg-adm-warn/[.14] p-2.5 text-xs leading-relaxed text-[#F0C983]">
      {t("blockers.warnings", {
        items: warnings.map((w) => blockerText(w, t)).join(" · "),
      })}
    </div>
  )
}

/**
 * C-24 · a justificação e o botão que desbloqueiam a data diferente.
 *
 * Três estados, e a ordem importa:
 *
 *   · a data é a pedida → não aparece nada. Não há decisão nenhuma para tomar;
 *   · a data mudou e ninguém a assumiu → o campo do motivo e **Confirmar
 *     alteração de data**. A publicação continua travada, e o aviso diz que é
 *     esta a maneira de a destravar — que é a metade que faltava;
 *   · a data mudou e está assumida → uma linha a dizê-lo, com o motivo e com
 *     como voltar atrás. Um estado assumido tem de ser visível, senão a
 *     validação parece ter-se desligado sozinha.
 */
function DateChangeConfirm({
  offer,
  preview,
  requested,
  onPatch,
  t,
}: {
  offer: OfferState
  preview: Offer
  requested: RequestedDates
  onPatch: (patch: Partial<OfferState>) => void
  t: Translator
}) {
  const change = offerDateChange(preview, requested)

  /* Confirmada mas já sem nada de diferente: a data voltou ao pedido e a
     confirmação não tem objecto. Limpa-se sozinha em vez de ficar a autorizar
     uma mudança que não existe. */
  useEffect(() => {
    if (!change.any && offer.date_change_confirmed) {
      onPatch({ date_change_confirmed: false, date_change_reason: "" })
    }
  }, [change.any, offer.date_change_confirmed, onPatch])

  if (!change.any) return null

  const dmy = (iso: string | null) => {
    if (!iso) return "—"
    const [y, m, d] = iso.slice(0, 10).split("-")
    return y && m && d ? `${d}/${m}/${y}` : iso
  }

  const moved = [
    change.depart
      ? t("admin.composerDateMovedOut", {
          from: dmy(requested.departDate),
          to: dmy(change.depart),
        })
      : null,
    change.return
      ? t("admin.composerDateMovedBack", {
          from: dmy(requested.returnDate),
          to: dmy(change.return),
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  if (offer.date_change_confirmed) {
    return (
      <div className="mb-3 rounded-[9px] border border-adm-ok/40 bg-adm-ok/[.10] p-2.5 text-xs leading-relaxed text-adm-txt-2">
        <b className="text-adm-txt">{t("admin.composerDateChangeDone")}</b> {moved}
        {offer.date_change_reason ? ` — “${offer.date_change_reason}”` : ""}
        <button
          type="button"
          onClick={() =>
            onPatch({ date_change_confirmed: false, date_change_reason: "" })
          }
          className="ml-2 rounded-lg border border-adm-line bg-adm-panel-2 px-2 py-1 text-[11px] font-bold text-adm-muted transition-colors hover:text-adm-txt"
        >
          {t("admin.composerDateChangeUndo")}
        </button>
      </div>
    )
  }

  const reason = offer.date_change_reason.trim()
  const tooShort = reason.length < 12

  return (
    <div className="mb-3 rounded-[9px] border border-adm-warn/40 bg-adm-warn/[.14] p-2.5 text-xs leading-relaxed text-[#F0C983]">
      <div className="mb-2 flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          <b>{t("admin.composerDateChangeTitle")}</b> {moved}
          <br />
          {t("admin.composerDateChangeHelp")}
        </span>
      </div>

      <textarea
        value={offer.date_change_reason}
        onChange={(event) => onPatch({ date_change_reason: event.target.value })}
        placeholder={t("admin.composerDateChangePlaceholder")}
        rows={2}
        className="w-full resize-y rounded-lg border border-adm-line bg-adm-panel-2 px-2.5 py-2 text-[12.5px] text-adm-txt outline-none placeholder:text-adm-muted focus:border-[#46587A]"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={tooShort}
          onClick={() => onPatch({ date_change_confirmed: true })}
          className="rounded-lg border border-adm-warn/50 bg-adm-panel-2 px-2.5 py-1.5 text-[11.5px] font-bold text-[#F0C983] transition-colors hover:bg-adm-raise disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t("admin.composerDateChangeCta")}
        </button>
        {tooShort && (
          <span className="text-[11px]">{t("admin.composerDateChangeNeedsReason")}</span>
        )}
      </div>
    </div>
  )
}

// --- Oferta fechada ----------------------------------------------------------

function CollapsedOffer({
  offer,
  index,
  total,
  pax,
  currency,
  disabled,
  onOpen,
  onMove,
  t,
}: {
  offer: OfferState
  index: number
  total: number
  pax: PaxCounts
  currency: string
  disabled: boolean
  onOpen: () => void
  onMove: (delta: number) => void
  t: Translator
}) {
  const preview = asOffer(offer, index)
  const { ida } = legsOf(preview)
  const badges = [
    offer.is_recommended && t("admin.composerFlagRecommended"),
    offer.is_cheapest && t("admin.composerFlagCheapest"),
    offer.is_fastest && t("admin.composerFlagFastest"),
  ].filter(Boolean) as string[]

  const summary =
    ida.length > 0
      ? `${ida[0].origin ?? "—"} ${timeOf(ida[0].depart_at)} → ${ida[ida.length - 1].destination ?? "—"} ${timeOf(ida[ida.length - 1].arrive_at)} · ${formatDuration(legMinutes(ida))} · ${stopsLabel(ida)}`
      : t("admin.composerNoItinerary")

  return (
    <div className="flex items-center gap-3 rounded-xl border border-adm-line bg-adm-panel px-3.5 py-3 transition-colors hover:border-[#41506A]">
      <div className="flex shrink-0 flex-col">
        <IconButton
          title={t("admin.composerUp")}
          onClick={() => onMove(-1)}
          disabled={disabled || index === 0}
          className="!p-1"
        >
          <ChevronUp className="h-3 w-3" />
        </IconButton>
        <IconButton
          title={t("admin.composerDown")}
          onClick={() => onMove(1)}
          disabled={disabled || index === total - 1}
          className="!p-1"
        >
          <ChevronDown className="h-3 w-3" />
        </IconButton>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate text-sm font-bold text-adm-txt">
          {offer.name || t("admin.composerUnnamed")}
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-adm-muted">
          {summary}
        </div>
      </button>
      {badges.map((b) => (
        <span
          key={b}
          className="hidden shrink-0 rounded-md border border-adm-line bg-adm-muted/[.14] px-2 py-1 text-[11px] font-bold text-adm-txt-2 sm:inline"
        >
          {b}
        </span>
      ))}
      <div className="shrink-0 whitespace-nowrap font-mono text-base font-semibold text-adm-txt">
        {formatMoney(offerTotal(preview, pax), currency)}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 rounded-[9px] border border-adm-line bg-adm-panel-2 px-2.5 py-1.5 text-xs font-semibold text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt"
      >
        {t("admin.composerOpen")}
      </button>
    </div>
  )
}

// --- Pré-visualização --------------------------------------------------------

/**
 * O cartão exatamente como o cliente o vai receber, atualizado enquanto se
 * escreve. É a única defesa contra publicar um itinerário que faz sentido para
 * quem o escreveu e nenhum para quem o lê.
 */
function ClientPreview({
  offer,
  pax,
  currency,
  token,
  published,
  t,
}: {
  offer: Offer | null
  pax: PaxCounts
  currency: string
  token: string
  published: boolean
  t: Translator
}) {
  const legs = offer ? legsOf(offer) : { ida: [], volta: [] }
  const badges = offer
    ? ([
        offer.is_recommended && t("proposal.badgeRecommended"),
        offer.is_cheapest && t("proposal.badgeCheapest"),
        offer.is_fastest && t("proposal.badgeFastest"),
      ].filter(Boolean) as string[])
    : []

  return (
    <section className="rounded-xl border border-adm-line bg-adm-panel">
      <header className="flex items-center gap-2.5 border-b border-adm-line-soft p-3.5">
        <h2 className="text-xs font-extrabold uppercase tracking-[.11em] text-adm-muted">
          {t("admin.previewTitle")}
        </h2>
        {published && (
          <a
            href={`/pc/${token}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 rounded-[9px] border border-adm-line bg-adm-panel-2 px-2.5 py-1.5 text-xs font-semibold text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt"
          >
            {t("admin.previewOpenLink")}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </header>
      <div className="p-3.5">
        <p className="mb-2.5 text-[11px] text-adm-muted">
          {t("admin.previewLive")}
        </p>
        <div className="rounded-[10px] bg-slate-100 p-3 text-[#12161F]">
          {!offer ? (
            <p className="py-6 text-center text-xs text-slate-500">
              {t("admin.previewEmpty")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-[11px] border border-[#DFE5EC] bg-white">
              <div className="px-3.5 py-3">
                {badges.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {badges.map((b, i) => (
                      <span
                        key={b}
                        className={cn(
                          "rounded-[5px] px-1.5 py-1 text-[9px] font-extrabold uppercase tracking-[.08em]",
                          i === 0
                            ? "bg-[#1E2532] text-white"
                            : "bg-slate-100 text-[#3A4557]"
                        )}
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}
                {(["ida", "volta"] as const).map((d) =>
                  legs[d].length === 0 ? null : (
                    <PreviewLeg
                      key={d}
                      label={t(d === "ida" ? "legs.outbound" : "legs.inbound")}
                      segments={legs[d]}
                    />
                  )
                )}
                <p className="mt-1.5 font-mono text-[10px] text-[#64748B]">
                  {flightCodes([...legs.ida, ...legs.volta]) || "—"}
                  {offer.fare_name ? ` — ${offer.fare_name}` : ""}
                </p>
                {offer.agent_note && (
                  <p className="mt-2.5 rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] leading-relaxed text-[#3A4557]">
                    {offer.agent_note}
                  </p>
                )}
              </div>
              {/*
                BO-13 · as duas linhas que o cliente vê, e o total.

                "Preço 566 € + serviço WeeFly 20 € = 586 €". Estão aqui pela
                mesma razão por que estão no ecrã dele: para que ninguém tenha
                de perguntar porque é que o total é 586 e não 566. A
                pré-visualização não seria pré-visualização nenhuma se mostrasse
                o total sozinho.
              */}
              <div className="border-t border-dashed border-[#DFE5EC] px-3.5 py-3">
                <div className="mb-2 space-y-1">
                  <div className="flex items-baseline justify-between text-[11px] text-[#3A4557]">
                    <span>
                      {t("proposal.priceLine", {
                        count: pax.adults + pax.children + pax.infants,
                      })}
                    </span>
                    <span className="font-mono font-semibold">
                      {formatMoney(offerFareTotal(offer, pax), currency)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px] text-[#3A4557]">
                    <span>{t("proposal.serviceLine")}</span>
                    <span className="font-mono font-semibold">
                      {formatMoney(offer.service_fee, currency)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 border-t border-[#DFE5EC] pt-2.5">
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-[.08em] text-[#64748B]">
                      {t("proposal.totalFor", {
                        count: pax.adults + pax.children + pax.infants,
                      })}
                    </span>
                    <span className="font-mono text-xl font-semibold leading-tight tracking-tight">
                      {formatMoney(offerTotal(offer, pax), currency)}
                    </span>
                  </div>
                  <span className="ml-auto rounded-lg bg-[#EE5128] px-3 py-2.5 text-[11.5px] font-bold text-white">
                    {t("admin.previewChoose")}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function PreviewLeg({
  label,
  segments,
}: {
  label: string
  segments: OfferSegment[]
}) {
  const first = segments[0]
  const last = segments[segments.length - 1]
  return (
    <div className="flex items-center gap-2.5 border-t border-dashed border-[#DFE5EC] py-2 first:border-t-0">
      <span className="w-[34px] shrink-0 text-[9px] font-extrabold uppercase tracking-[.07em] text-[#64748B]">
        {label}
      </span>
      <div>
        <span className="block font-mono text-sm font-semibold leading-tight">
          {timeOf(first.depart_at)}
        </span>
        <span className="font-mono text-[10px] font-semibold tracking-[.06em] text-[#3A4557]">
          {first.origin ?? "—"}
        </span>
      </div>
      <div className="relative min-w-[34px] flex-1 px-1 text-center">
        <span className="block text-[9.5px] font-semibold text-[#3A4557]">
          {formatDuration(legMinutes(segments))}
        </span>
        <span className="my-0.5 block h-px bg-[#DFE5EC]" />
        <span className="block whitespace-nowrap text-[9.5px] text-[#64748B]">
          {stopsLabel(segments)}
        </span>
      </div>
      <div className="text-right">
        <span className="block font-mono text-sm font-semibold leading-tight">
          {timeOf(last.arrive_at)}
          {/* BO-07 · uma chegada no dia seguinte é aceite e mostrada como +1,
              aqui e no cartão do cliente. Rejeitá-la seria rejeitar metade dos
              voos de longo curso. */}
          {dayOffset(segments) > 0 && (
            <sup className="ml-0.5 text-[9px] font-bold">
              +{dayOffset(segments)}
            </sup>
          )}
        </span>
        <span className="font-mono text-[10px] font-semibold tracking-[.06em] text-[#3A4557]">
          {last.destination ?? "—"}
        </span>
      </div>
    </div>
  )
}

// --- Painel de publicação ----------------------------------------------------

function PublishPanel({
  caseId,
  token,
  proposal,
  offers,
  serverOffers,
  pax,
  requested,
  pending,
  saveState,
  onError,
  onDone,
  onRevision,
  t,
}: {
  caseId: string
  token: string
  proposal: Proposal
  offers: OfferState[]
  serverOffers: AdminOffer[]
  pax: PaxCounts
  requested: RequestedDates
  pending: boolean
  saveState: "idle" | "saving" | "saved" | "error"
  onError: (message: string | null) => void
  onDone: () => void
  onRevision: () => void
  t: Translator
}) {
  const published = proposal.status === "publicada"
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      serverOffers.map((o) => [o.id, o.include_in_proposal !== false])
    )
  )
  const [message, setMessage] = useState(proposal.opening_message ?? "")
  /* NT-04 · o que mudou, obrigatório de R2 em diante. Ver `publishProposal`. */
  const [changeNote, setChangeNote] = useState("")
  const [notifyClient, setNotifyClient] = useState(true)
  const [notifyTeam, setNotifyTeam] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)
  const [publishing, startPublish] = useTransition()

  useEffect(() => {
    setIncluded((prev) =>
      Object.fromEntries(
        serverOffers.map((o) => [
          o.id,
          prev[o.id] ?? o.include_in_proposal !== false,
        ])
      )
    )
  }, [serverOffers])

  const going = offers.filter((o) => included[o.id])
  const blockers = going.flatMap((offer, i) => {
    const problems = offerBlockers(asOffer(offer, i), pax, requested)
    return problems.length === 0
      ? []
      : [
          t("blockers.line", {
            offer: offer.name || t("admin.composerUnnamed"),
            problems: problems.map((b) => blockerText(b, t)).join(", "),
          }),
        ]
  })

  function publish() {
    onError(null)
    setWarning(null)
    startPublish(async () => {
      // Grava a mensagem de abertura antes de publicar; a gravação automática
      // só cobre a oferta aberta, e esta caixa não pertence a nenhuma.
      await saveProposalMeta(caseId, { openingMessage: message })
      const result = await publishProposal(caseId, {
        includedOfferIds: going.map((o) => o.id),
        openingMessage: message,
        notifyClient,
        notifyTeam,
        changeNote,
      })
      if (result.error) onError(result.error)
      else {
        if (result.warning) setWarning(result.warning)
        onDone()
      }
    })
  }

  if (published) {
    return (
      <section className="rounded-xl border border-adm-line bg-adm-panel">
        <header className="border-b border-adm-line-soft p-3.5">
          <h2 className="text-xs font-extrabold uppercase tracking-[.11em] text-adm-muted">
            {t("admin.publishedTitle")}
          </h2>
        </header>
        <div className="space-y-3.5 p-3.5">
          <p className="text-[12.5px] leading-relaxed text-adm-txt-2">
            {t("admin.publishedBody", {
              revision: proposal.revision,
              when: proposal.published_at
                ? t("admin.publishedAt", {
                    when: new Intl.DateTimeFormat("pt-PT", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Atlantic/Cape_Verde",
                    }).format(new Date(proposal.published_at)),
                  })
                : "",
            })}
          </p>
          {proposal.selected_offer_id && (
            <p className="rounded-lg bg-adm-ok/10 p-3 text-[12px] leading-relaxed text-adm-ok">
              {t("admin.publishedChosen")}
            </p>
          )}
          <CopyLink token={token} t={t} />
          {/*
            C-30 · o botão "Nova revisão" foi removido.

            "O conceito está certo, a implementação prende o utilizador." Abrir
            uma revisão desbloqueia a edição **e esconde os preços ao cliente**
            enquanto ela estiver aberta — e não havia forma de voltar atrás: o
            agente ficava num estado intermédio, com a proposta invisível do
            outro lado, sem saber como sair dele.

            O que fica: a numeração das revisões não é tocada no modelo de
            dados (`case_proposals.revision` continua igual, e o `publishProposal`
            continua a exigir a nota de alteração de R2 em diante), e as
            propostas publicadas continuam trancadas como hoje. O que desaparece
            é a única porta que levava ao estado sem saída.

            Volta no Sprint 5, com uma acção de cancelar e uma explicação clara
            do estado — que é o que faltava.
          */}
          <p className="text-[11px] leading-relaxed text-adm-muted">
            {t("admin.publishedRevisionRemoved")}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-adm-line bg-adm-panel">
      <header className="flex items-center gap-2.5 border-b border-adm-line-soft p-3.5">
        <h2 className="text-xs font-extrabold uppercase tracking-[.11em] text-adm-muted">
          {t("admin.publishTitle")}
        </h2>
        <span className="ml-auto text-[11px] text-adm-muted">
          {saveState === "saving" && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {t("admin.publishSaving")}
            </span>
          )}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1 text-adm-ok">
              <Check className="h-3 w-3" /> {t("admin.publishSaved")}
            </span>
          )}
        </span>
      </header>

      <div className="p-3.5">
        {offers.length === 0 ? (
          <p className="text-[12.5px] text-adm-muted">
            {t("admin.publishNoOffers")}
          </p>
        ) : (
          offers.map((offer, i) => (
            <label
              key={offer.id}
              className="flex items-center gap-2.5 border-b border-adm-line-soft py-2.5 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={included[offer.id] ?? true}
                onChange={(e) =>
                  setIncluded((prev) => ({
                    ...prev,
                    [offer.id]: e.target.checked,
                  }))
                }
                className="h-[15px] w-[15px] accent-adm-ember"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-adm-txt">
                {offer.name || t("admin.composerUnnamed")}
              </span>
              <span className="font-mono text-[13px] font-semibold text-adm-txt-2">
                {formatMoney(
                  offerTotal(asOffer(offer, i), pax),
                  proposal.currency
                )}
              </span>
            </label>
          ))
        )}

        {/*
          NT-04 · "uma revisão — R2 em diante — avisa com o que mudou".

          Só aparece a partir da segunda revisão, porque em R1 não há nada com
          que comparar. É obrigatório e o servidor recusa sem ele: um cliente
          que recebe a segunda versão de uma proposta e não vê o que mudou tem
          de comparar dois emails linha a linha, e não vai fazer isso.
        */}
        {proposal.revision > 1 && (
          <div className="mt-3.5">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.07em] text-adm-muted">
              {t("admin.publishChangeNote", { revision: proposal.revision })}
            </label>
            <textarea
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder={t("admin.publishChangeNotePlaceholder")}
              className={cn(inputClass, "min-h-[56px] resize-y leading-relaxed")}
            />
            <p className="mt-1 text-[10.5px] text-adm-muted">
              {t("admin.publishChangeNoteHint")}
            </p>
          </div>
        )}

        <div className="mt-3.5">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.07em] text-adm-muted">
            {t("admin.publishMessage")}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("admin.publishMessagePlaceholder")}
            className={cn(inputClass, "min-h-[64px] resize-y leading-relaxed")}
          />
        </div>

        <div className="mt-3.5 flex flex-col gap-2.5">
          <Check2
            label={t("admin.publishNotifyEmail")}
            checked={notifyClient}
            onChange={setNotifyClient}
          />
          <Check2
            label={t("admin.publishNotifyTeam")}
            checked={notifyTeam}
            onChange={setNotifyTeam}
          />
          <label className="flex cursor-not-allowed items-center gap-2.5 text-[13px] text-adm-muted opacity-60">
            <input
              type="checkbox"
              disabled
              className="h-[15px] w-[15px] accent-adm-ember"
            />
            {t("admin.publishNotifyWhatsapp")}
            <span className="text-[11px]">
              {t("admin.publishNotifyWhatsappHint")}
            </span>
          </label>
        </div>

        {blockers.length > 0 && (
          <div className="mt-3.5 rounded-[9px] bg-adm-warn/[.14] p-2.5 text-xs leading-relaxed text-[#F0C983]">
            <b className="mb-1 block">{t("admin.publishBlockers")}</b>
            <ul className="list-inside list-disc space-y-0.5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3.5 rounded-[9px] bg-adm-warn/[.14] p-2.5 text-xs leading-relaxed text-[#F0C983]">
          {t("admin.publishWarning", { next: proposal.revision + 1 })}
        </div>

        {warning && (
          <div className="mt-3.5 rounded-[9px] bg-adm-warn/[.14] p-2.5 text-xs leading-relaxed text-[#F0C983]">
            {warning}
          </div>
        )}

        <div className="mt-3.5 flex flex-col gap-2">
          <button
            type="button"
            onClick={publish}
            disabled={
              publishing ||
              pending ||
              going.length === 0 ||
              blockers.length > 0 ||
              (proposal.revision > 1 && changeNote.trim().length < 8)
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-adm-ember px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-adm-ember-dark disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("admin.publishCta")}
          </button>
          <p className="text-center text-[11px] text-adm-muted">
            {t("admin.publishAutoSave")}
          </p>
        </div>
      </div>
    </section>
  )
}

function CopyLink({ token, t }: { token: string; t: Translator }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(
          `${window.location.origin}/pc/${token}`
        )
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-adm-line bg-adm-panel-2 px-4 py-2.5 text-[13px] font-semibold text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? t("common.copied") : t("admin.publishedCopyLink")}
    </button>
  )
}

