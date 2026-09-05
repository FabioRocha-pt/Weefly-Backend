"use client"

/**
 * EM-01 · o ecrã da emissão.
 *
 * O que mudou em relação ao Sprint 1, e porquê:
 *
 *   · **os lugares passam a ser por voo.** Havia "lugar ida" e "lugar volta", o
 *     que chega para um voo direto e mente em tudo o resto: numa ida com escala
 *     há dois voos, e o lugar do segundo não é o do primeiro. O bilhete repete a
 *     etiqueta do passageiro dentro de cada voo com o lugar desse voo, e sem uma
 *     casa por par (passageiro, trecho) não há de onde a tirar;
 *   · **a companhia emissora escolhe-se do catálogo** e traz o logótipo com ela
 *     (PC-12) — e o prefixo de três dígitos que abre cada número de bilhete;
 *   · **os erros estão listados em cima**, cada um a levar ao seu campo
 *     (BO-11), em vez de um parágrafo a dizer que falta qualquer coisa.
 *
 * O que não mudou: o botão só acende com o pagamento confirmado. Emitir sem
 * pagamento confirmado é o único erro deste ecrã que custa dinheiro à WeeFly, e
 * por isso é o único que ele impede em vez de avisar.
 */

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  boGenerateTickets,
  boIssueTickets,
  boResendTickets,
} from "@/actions/bo-price-checker"
import type { PcPayment } from "@/lib/pc/payment"
import type { CasePassenger } from "@/lib/case-status"
import type { OfferSegment } from "@/lib/proposal-math"
import type { PassengerBaggage, SegmentIssuance } from "@/lib/issuance"
import { formatAmountPlain, formatMoney, parseMoney } from "@/lib/proposal-math"
import { CARRIERS } from "@/lib/pc/catalog"
import { CarrierMark } from "@/components/bo/carrier-mark"
import { BoErrorList, focusField, type BoFieldError } from "@/components/bo/error-list"
import { FALLBACK_AIRLINES, airlineName } from "@/lib/airlines-catalog"

interface TicketRow {
  passengerId: string
  ticketNumber: string
}

/**
 * T-04 · o documento de um voo.
 *
 * Os campos do cupão deixaram de ser um só para a viagem inteira. Uma ida e
 * volta tem dois cupões, cada um com a sua base tarifária e as suas validades —
 * a ida pode ser TLXCV3 e a volta YLOWCV, e escrever uma só delas produzia um
 * bilhete de volta que não existia.
 */
interface FlightDoc {
  fareBasis: string
  nvb: string
  nva: string
  couponNumber: string
  aircraft: string
  cabin: string
  bookingClass: string
  terminalFrom: string
  terminalTo: string
  airlinePnr: string
  baggageThrough: boolean
}

const EMPTY_DOC: FlightDoc = {
  fareBasis: "",
  nvb: "",
  nva: "",
  couponNumber: "",
  aircraft: "",
  cabin: "",
  bookingClass: "",
  terminalFrom: "",
  terminalTo: "",
  airlinePnr: "",
  baggageThrough: true,
}

/** A chave de um lugar: um passageiro num voo. */
const seatKey = (passengerId: string, segmentId: string) =>
  `${passengerId}::${segmentId}`

/** A mesma chave serve a bagagem: um passageiro num voo. */
const bagKey = seatKey

interface BagRow {
  checkedPieces: number
  checkedKg: string
  cabinPieces: number
  cabinKg: string
}

const EMPTY_BAG: BagRow = {
  checkedPieces: 0,
  checkedKg: "",
  cabinPieces: 1,
  cabinKg: "",
}

/** O rótulo de um voo, como quem emite o reconhece. */
function flightLabel(segment: OfferSegment): string {
  const flight = [segment.carrier_code, segment.flight_number]
    .filter(Boolean)
    .join(" ")
  const route = `${segment.origin ?? "?"} → ${segment.destination ?? "?"}`
  return flight ? `${flight} · ${route}` : route
}

/* C-10 · as 31 do backlog, na ordem de prioridade dele. Eram as dez de
   `CARRIERS`, por código — o que punha a AF antes da VR. */
const CARRIER_CODES = FALLBACK_AIRLINES.map((a) => a.iata)

export function BoIssuancePanel({
  caseId,
  payment,
  passengers,
  segments,
  savedSeats,
  savedFlights,
  savedBaggage,
  issuance,
  amount,
  currency,
  hasDocument,
}: {
  caseId: string
  payment: PcPayment | null
  passengers: CasePassenger[]
  /** Os trechos da opção escolhida — um lugar por passageiro em cada um. */
  segments: OfferSegment[]
  /** Os lugares já gravados, de uma emissão anterior ou de uma correcção. */
  savedSeats: { passenger_id: string; segment_id: string; seat: string | null }[]
  /** T-04 · os campos do documento já gravados, por voo. */
  savedFlights: SegmentIssuance[]
  /** T-04 · a bagagem já gravada, por passageiro e por voo. */
  savedBaggage: PassengerBaggage[]
  issuance: {
    pnr: string | null
    issuingCarrier: string | null
    consolidator: string | null
    costReal: number | null
    fareBasis: string | null
    nvb: string | null
    nva: string | null
    endorsements: string | null
    issuedAt: string | null
  }
  amount: number | null
  currency: string
  /** EM-03 · já existe PDF guardado? Decide entre "gerar" e "reenviar". */
  hasDocument: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const paid = Boolean(payment?.admin_confirmed) || payment?.status === "COMPLETED"
  const issued = Boolean(issuance.issuedAt)

  const [pnr, setPnr] = useState(issuance.pnr ?? "")
  /*
   * C-26 · a companhia da proposta é o valor de partida.
   *
   * `issuance.issuingCarrier` é o que já foi gravado neste ecrã; quando está
   * vazio — o caso normal na primeira emissão — herda-se a companhia do
   * primeiro trecho da opção que o cliente escolheu. Não é um valor confirmado,
   * e a dica debaixo do campo di-lo: é a resposta certa em vez de um campo em
   * branco a obrigar a ir procurá-la noutro separador.
   */
  const proposedCarrier =
    [...segments]
      .sort((a, b) => a.position - b.position)
      .find((s) => s.carrier_code)?.carrier_code ?? ""

  const [carrier, setCarrier] = useState(
    issuance.issuingCarrier ?? proposedCarrier
  )
  const [consolidator, setConsolidator] = useState(issuance.consolidator ?? "")
  const [costReal, setCostReal] = useState(
    issuance.costReal ? formatAmountPlain(issuance.costReal) : ""
  )
  const [fareBasis, setFareBasis] = useState(issuance.fareBasis ?? "")
  const [nvb, setNvb] = useState(issuance.nvb ?? "")
  const [nva, setNva] = useState(issuance.nva ?? "")
  const [endorsements, setEndorsements] = useState(
    issuance.endorsements ?? "NON-END / NON-REF"
  )

  const [tickets, setTickets] = useState<TicketRow[]>(
    passengers.map((p) => ({
      passengerId: p.id,
      ticketNumber: p.ticket_number ?? "",
    }))
  )

  const ordered = useMemo(
    () =>
      [...segments].sort(
        (a, b) =>
          (a.direction === b.direction ? 0 : a.direction === "ida" ? -1 : 1) ||
          a.position - b.position
      ),
    [segments]
  )

  /* Os lugares já gravados entram no estado uma vez, na montagem: a partir daí
     quem manda é o que está a ser escrito no ecrã. */
  const [seats, setSeats] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const row of savedSeats) {
      if (row.seat) initial[seatKey(row.passenger_id, row.segment_id)] = row.seat
    }
    return initial
  })

  /*
   * T-04 · um bloco por voo, e não um conjunto de campos para a viagem toda.
   *
   * O estado nasce do que já está gravado; um voo sem linha começa vazio, com
   * duas excepções que poupam trabalho a quem emite e não inventam nada:
   *
   *   · a cabina vem da que a proposta vendeu — é a que o cliente comprou;
   *   · os valores antigos de `booking_cases` entram no **primeiro** voo, que é
   *     onde eles sempre estiveram na prática. Um caso emitido antes desta
   *     mudança reabre com a sua base tarifária no sítio certo em vez de a
   *     perder.
   */
  const [flights, setFlights] = useState<Record<string, FlightDoc>>(() => {
    const saved = new Map(savedFlights.map((row) => [row.segment_id, row]))
    const initial: Record<string, FlightDoc> = {}
    const ordered = [...segments].sort(
      (a, b) =>
        (a.direction === b.direction ? 0 : a.direction === "ida" ? -1 : 1) ||
        a.position - b.position
    )

    ordered.forEach((segment, index) => {
      const row = saved.get(segment.id)
      initial[segment.id] = {
        fareBasis: row?.fare_basis ?? (index === 0 ? (issuance.fareBasis ?? "") : ""),
        nvb: row?.nvb ?? (index === 0 ? (issuance.nvb ?? "") : ""),
        nva: row?.nva ?? (index === 0 ? (issuance.nva ?? "") : ""),
        couponNumber: row?.coupon_number ?? String(index + 1),
        /* Aeronave, classe e terminais já foram escritos na proposta — o
           compositor tem-nos (ver `OfferSegment`). Repeti-los aqui em branco
           era pedir a quem emite que fosse buscá-los a outro separador. */
        aircraft: row?.aircraft ?? segment.equipment ?? "",
        cabin: row?.cabin ?? segment.cabin ?? "",
        bookingClass: row?.booking_class ?? segment.booking_class ?? "",
        terminalFrom: row?.terminal_from ?? segment.terminal_from ?? "",
        terminalTo: row?.terminal_to ?? segment.terminal_to ?? "",
        airlinePnr: row?.airline_pnr ?? "",
        baggageThrough: row?.baggage_through ?? true,
      }
    })
    return initial
  })

  const [bags, setBags] = useState<Record<string, BagRow>>(() => {
    const initial: Record<string, BagRow> = {}
    for (const row of savedBaggage) {
      initial[bagKey(row.passenger_id, row.segment_id)] = {
        checkedPieces: row.checked_pieces,
        checkedKg: row.checked_kg === null ? "" : String(row.checked_kg),
        cabinPieces: row.cabin_pieces,
        cabinKg: row.cabin_kg === null ? "" : String(row.cabin_kg),
      }
    }
    return initial
  })

  const patchFlight = (segmentId: string, patch: Partial<FlightDoc>) =>
    setFlights((current) => ({
      ...current,
      [segmentId]: { ...(current[segmentId] ?? EMPTY_DOC), ...patch },
    }))

  const patchBag = (key: string, patch: Partial<BagRow>) =>
    setBags((current) => ({
      ...current,
      [key]: { ...(current[key] ?? EMPTY_BAG), ...patch },
    }))

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const numbers = tickets.map((t) => t.ticketNumber.replace(/[\s-]/g, ""))
  const filled = numbers.filter(Boolean)
  const duplicated = new Set(filled).size !== filled.length

  /*
   * BO-11 · o que falta, com o campo de cada coisa.
   *
   * Deriva do estado e não de uma tentativa de gravar: um item que desaparece
   * enquanto se escreve é a confirmação de que ficou resolvido.
   */
  const errors: BoFieldError[] = []
  if (!paid) {
    errors.push({
      target: "em-pnr",
      label: "O pagamento ainda não está confirmado — confirme-o na aba Pagamento.",
    })
  }
  if (!/^[A-Za-z0-9]{6}$/.test(pnr)) {
    errors.push({ target: "em-pnr", label: "O PNR tem de ter 6 caracteres." })
  }
  passengers.forEach((passenger, index) => {
    const value = numbers[index] ?? ""
    if (!/^\d{13}$/.test(value)) {
      errors.push({
        target: `em-ticket-${passenger.id}`,
        label: `P${index + 1} ${passenger.last_name}: o número de bilhete são 3 dígitos de companhia + 10 do documento.`,
      })
    }
  })
  if (duplicated) {
    errors.push({
      target: `em-ticket-${passengers[0]?.id ?? ""}`,
      label: "Há números de bilhete repetidos — cada passageiro tem o seu.",
    })
  }
  /*
   * T-04 · "o botão de emitir fica desactivado até cada voo estar completo".
   *
   * Era um trio de campos para a viagem inteira — uma base tarifária, um NVB, um
   * NVA — e por isso uma ida e volta emitia com metade do documento por
   * escrever. Agora falta-por-voo, com o voo nomeado no erro: `TP 1234
   * PRA→LIS` diz onde ir, e "falta o NVA" não dizia.
   *
   * Quando a opção escolhida não tem trechos gravados cai-se nos campos antigos:
   * é o caso das propostas anteriores ao compositor de itinerário, e recusar a
   * emissão delas seria recusar uma emissão legítima.
   */
  if (ordered.length > 0) {
    for (const segment of ordered) {
      const doc = flights[segment.id] ?? EMPTY_DOC
      const gaps = [
        doc.fareBasis.trim() ? "" : "base tarifária",
        doc.nvb.trim() ? "" : "NVB",
        doc.nva.trim() ? "" : "NVA",
      ].filter(Boolean)
      if (gaps.length) {
        errors.push({
          target: `em-fare-${segment.id}`,
          label: `${flightLabel(segment)}: falta ${gaps.join(", ")}.`,
        })
      }
    }
  } else {
    if (!fareBasis.trim()) {
      errors.push({ target: "em-fare-basis", label: "Falta a base tarifária." })
    }
    if (!nvb.trim()) errors.push({ target: "em-nvb", label: "Falta o NVB." })
    if (!nva.trim()) errors.push({ target: "em-nva", label: "Falta o NVA." })
  }
  if (passengers.length === 0) {
    errors.push({
      target: "em-pnr",
      label: "Sem passageiros submetidos não há a quem emitir bilhete.",
    })
  }

  const ready = errors.length === 0

  const patchTicket = (index: number, value: string) =>
    setTickets((current) =>
      current.map((row, i) => (i === index ? { ...row, ticketNumber: value } : row))
    )

  const margin = amount && costReal ? amount - parseMoney(costReal) : null

  /** O prefixo da companhia escolhida, para pré-preencher os treze dígitos. */
  const prefix = carrier ? (CARRIERS[carrier.toUpperCase()]?.prefix ?? "") : ""

  function run(action: () => Promise<{ ok: boolean; notice?: string; error?: string }>) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        setNotice(result.notice ?? null)
        router.refresh()
      } else {
        setError(result.error ?? "Falhou.")
      }
    })
  }

  return (
    <div className="cols two tabpane">
      <aside className="panel sticky">
        <div className="panel-h">
          <h3>{issued ? "Emitido" : "Pronto a emitir"}</h3>
        </div>
        <div className="panel-b">
          <div className="kv">
            <span className="kv-k">Pagamento</span>
            <span className="kv-v" style={{ color: paid ? "var(--ok)" : "var(--warn)" }}>
              {paid ? "Confirmado" : "Não confirmado"}
            </span>
          </div>
          <div className="kv">
            <span className="kv-k">Passageiros</span>
            <span className="kv-v">{passengers.length}</span>
          </div>
          <div className="kv">
            <span className="kv-k">Voos</span>
            <span className="kv-v">{ordered.length}</span>
          </div>
          <div className="kv">
            <span className="kv-k">Cobrado</span>
            <span className="kv-v mono">
              {amount ? formatMoney(amount, currency) : "—"}
            </span>
          </div>
          {issued && (
            <div className="kv">
              <span className="kv-k">Emitido em</span>
              <span className="kv-v">
                {new Date(issuance.issuedAt!).toLocaleString("pt-PT", {
                  timeZone: "Atlantic/Cape_Verde",
                })}
              </span>
            </div>
          )}

          {paid && !issued && (
            <p className="note bad" style={{ marginTop: 12 }}>
              Este é o estado mais crítico do sistema. O cliente já pagou e ainda
              não tem bilhete.
            </p>
          )}
          {!paid && (
            <p className="note warn" style={{ marginTop: 12 }}>
              Confirme o pagamento na aba anterior antes de emitir.
            </p>
          )}

          {/* EM-03 · o documento, depois de emitido. */}
          {issued && (
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {hasDocument ? (
                <>
                  <a
                    className="btn btn-sm"
                    href={`/api/bo/ticket/${caseId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir o bilhete
                  </a>
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => boResendTickets(caseId))}
                  >
                    Reenviar ao cliente
                  </button>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    O reenvio manda o mesmo ficheiro, com o mesmo número de
                    documento. Não gera nada de novo.
                  </span>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-sm btn-primary"
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => boGenerateTickets(caseId))}
                  >
                    Gerar o bilhete
                  </button>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    O caso está emitido mas o PDF ainda não existe.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="stack">
        <div className="panel">
          <div className="panel-h">
            <h3>Dados da emissão</h3>
            {carrier && <CarrierMark code={carrier} className="ml-auto" />}
          </div>
          <div className="panel-b">
            {!issued && (
              <div style={{ marginBottom: 14 }}>
                <BoErrorList
                  title={
                    errors.length === 1
                      ? "Falta 1 campo para poder emitir"
                      : `Faltam ${errors.length} campos para poder emitir`
                  }
                  errors={errors}
                />
              </div>
            )}

            <div className="fgrid">
              <div className="f s3">
                <label>PNR</label>
                <input
                  id="em-pnr"
                  className="mono"
                  placeholder="6 caracteres"
                  maxLength={6}
                  style={{ textTransform: "uppercase" }}
                  value={pnr}
                  aria-invalid={!issued && !/^[A-Za-z0-9]{6}$/.test(pnr)}
                  onChange={(event) => setPnr(event.target.value.toUpperCase())}
                  disabled={issued}
                />
              </div>
              <div className="f s3">
                <label>Companhia emissora</label>
                {/*
                  C-26 · vem da proposta, sem ser reescolhida.

                  "A companhia escolhida na proposta aparece no ecrã de emissão
                  sem ser reescolhida." Antes começava vazia, num «Escolher…», e
                  quem emitia tinha de ir ver a oferta noutro separador para
                  saber qual das trinta e uma escolher — com o custo óbvio de
                  escolher a errada.
                  O logótipo em cima é a confirmação visual de que é a certa.
                */}
                {carrier && (
                  <div style={{ marginBottom: 6 }}>
                    <CarrierMark code={carrier} />
                  </div>
                )}
                <select
                  id="em-carrier"
                  value={carrier}
                  onChange={(event) => setCarrier(event.target.value)}
                  disabled={issued}
                >
                  <option value="">Escolher…</option>
                  {CARRIER_CODES.map((code) => (
                    <option key={code} value={code}>
                      {/* C-10 · o nome das 31 vem do catálogo novo; o prefixo do
                          bilhete só existe para as dez antigas, e é omitido em
                          vez de escrever `undefined`. */}
                      {code} · {airlineName(code)}
                      {CARRIERS[code] ? ` · ${CARRIERS[code].prefix}` : ""}
                    </option>
                  ))}
                  {carrier && !CARRIER_CODES.includes(carrier) && (
                    <option value={carrier}>{carrier} · fora do catálogo</option>
                  )}
                </select>
                {!issuance.issuingCarrier && carrier && (
                  <span className="hint">da proposta · confirme antes de emitir</span>
                )}
              </div>
              <div className="f s3">
                <label>Consolidador</label>
                <input
                  placeholder="Atlântida"
                  value={consolidator}
                  onChange={(event) => setConsolidator(event.target.value)}
                  disabled={issued}
                />
              </div>
              <div className="f s3">
                <label>Custo real</label>
                <input
                  className="mono"
                  placeholder="946,00"
                  value={costReal}
                  onChange={(event) => setCostReal(event.target.value)}
                  disabled={issued}
                />
                {margin !== null && (
                  <span className="hint">margem {formatMoney(margin, currency)}</span>
                )}
              </div>
            </div>

            <div className="sec" style={{ marginTop: 18 }}>
              <div className="sec-h">
                <h4>Bilhete por passageiro</h4>
                <span className="rule" />
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {prefix ? `${prefix} + 10 dígitos` : "3 + 10 dígitos"} · sem
                  duplicados
                </span>
              </div>

              {passengers.length === 0 && (
                <p className="note">
                  Sem passageiros submetidos não há a quem emitir bilhete.
                </p>
              )}

              {passengers.map((passenger, index) => (
                <div className="paxcard" key={passenger.id}>
                  <div className="paxcard-h">
                    <span
                      className={`paxtag${passenger.passenger_type === "adult" ? "" : " child"}`}
                    >
                      P{index + 1}
                    </span>
                    <b>
                      {`${passenger.last_name}/${passenger.first_name}`.toUpperCase()}
                    </b>
                    {prefix && !tickets[index]?.ticketNumber && !issued && (
                      <button
                        className="btn btn-sm"
                        type="button"
                        style={{ marginLeft: "auto" }}
                        onClick={() => {
                          patchTicket(index, prefix)
                          focusField(`em-ticket-${passenger.id}`)
                        }}
                      >
                        Começar com {prefix}
                      </button>
                    )}
                  </div>
                  <div
                    className="paxcard-h"
                    style={{ background: "none", borderBottom: 0, padding: "11px 13px" }}
                  >
                    <div className="fgrid" style={{ width: "100%" }}>
                      <div className="f s4">
                        <label>Nº do bilhete</label>
                        <input
                          id={`em-ticket-${passenger.id}`}
                          className="mono"
                          placeholder={`${prefix || "047"}1234567890`}
                          maxLength={16}
                          value={tickets[index]?.ticketNumber ?? ""}
                          aria-invalid={
                            !issued &&
                            !/^\d{13}$/.test(
                              (tickets[index]?.ticketNumber ?? "").replace(/[\s-]/g, "")
                            )
                          }
                          onChange={(event) => patchTicket(index, event.target.value)}
                          disabled={issued}
                        />
                      </div>

                      {/*
                        EM-01 · "lugares por passageiro **por voo**".

                        Um campo por trecho, e a etiqueta do voo em cima de cada
                        um: com escala são quatro lugares por pessoa numa ida e
                        volta, e dois campos chamados "ida" e "volta" não sabiam
                        dizer qual era qual.
                      */}
                      {/*
                        EM-01 e T-04 · lugar **e bagagem**, por voo.

                        "Por passageiro por voo: lugar e bagagem." A bagagem
                        estava numa linha só da oferta, para a viagem inteira —
                        e o T-10 explica porque isso não chega: um cliente pode
                        deliberadamente ir com duas malas e voltar com nenhuma
                        para pagar menos. Um número para os dois sentidos não
                        sabe dizer isso, e o balcão da volta cobra a diferença.
                      */}
                      {ordered.map((segment) => {
                        const key = seatKey(passenger.id, segment.id)
                        const bag = bags[key] ?? EMPTY_BAG
                        return (
                          <div className="f s4" key={segment.id}>
                            <label>
                              {[segment.carrier_code, segment.flight_number]
                                .filter(Boolean)
                                .join(" ") || segment.origin}
                              <br />
                              <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                                {segment.origin}→{segment.destination}
                              </span>
                            </label>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input
                                className="mono"
                                style={{ width: 74 }}
                                placeholder="12A"
                                maxLength={6}
                                title="Lugar"
                                value={seats[key] ?? ""}
                                onChange={(event) =>
                                  setSeats((current) => ({
                                    ...current,
                                    [key]: event.target.value.toUpperCase(),
                                  }))
                                }
                                disabled={issued}
                              />
                              <input
                                className="mono"
                                style={{ width: 56 }}
                                type="number"
                                min={0}
                                max={9}
                                title="Malas de porão neste voo"
                                value={bag.checkedPieces}
                                onChange={(event) =>
                                  patchBag(key, {
                                    checkedPieces: Number(event.target.value || 0),
                                  })
                                }
                                disabled={issued}
                              />
                              <input
                                className="mono"
                                style={{ width: 66 }}
                                placeholder="kg"
                                title="Peso por mala, em quilos"
                                value={bag.checkedKg}
                                onChange={(event) =>
                                  patchBag(key, { checkedKg: event.target.value })
                                }
                                disabled={issued}
                              />
                            </div>
                            <span className="hint">lugar · malas · kg</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {ordered.length === 0 && passengers.length > 0 && (
                <p className="note warn">
                  A opção escolhida não tem trechos gravados, por isso não há onde
                  atribuir lugares. Os bilhetes podem ser emitidos à mesma.
                </p>
              )}
            </div>

            {/*
              T-04 · um bloco por voo.

              "Uma ida e volta produz pelo menos dois blocos; um multi-city
              produz um por trecho." Os campos que estavam aqui em cima — uma
              base tarifária, um NVB, um NVA para a viagem inteira — só sabiam
              descrever um voo, e era por isso que a volta não se conseguia
              emitir.

              A ordem dos campos dentro de cada bloco é a do critério:
              companhia, número de voo, aeronave, cabina, partida, chegada,
              terminais, base tarifária, NVB, NVA, número do cupão.
            */}
            {ordered.length > 0 && (
              <div className="sec">
                <div className="sec-h">
                  <h4>Documento por voo</h4>
                  <span className="rule" />
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {ordered.length} voo{ordered.length === 1 ? "" : "s"} · um
                    cupão cada
                  </span>
                </div>

                {ordered.map((segment, index) => {
                  const doc = flights[segment.id] ?? EMPTY_DOC
                  return (
                    <div className="paxcard" key={`doc-${segment.id}`}>
                      <div className="paxcard-h">
                        <span className="paxtag">Voo {index + 1}</span>
                        <b>{flightLabel(segment)}</b>
                        <span
                          className="st state st-n"
                          style={{ marginLeft: "auto" }}
                        >
                          {segment.direction === "ida" ? "Ida" : "Volta"}
                        </span>
                      </div>
                      <div
                        className="paxcard-h"
                        style={{
                          background: "none",
                          borderBottom: 0,
                          padding: "11px 13px",
                        }}
                      >
                        <div className="fgrid" style={{ width: "100%" }}>
                          <div className="f s3">
                            <label>Partida</label>
                            <input
                              className="mono"
                              value={segment.depart_at?.replace("T", " ") ?? "—"}
                              disabled
                            />
                          </div>
                          <div className="f s3">
                            <label>Chegada</label>
                            <input
                              className="mono"
                              value={segment.arrive_at?.replace("T", " ") ?? "—"}
                              disabled
                            />
                          </div>
                          <div className="f s3">
                            <label>Aeronave</label>
                            <input
                              placeholder="Airbus A330-900"
                              value={doc.aircraft}
                              onChange={(event) =>
                                patchFlight(segment.id, {
                                  aircraft: event.target.value,
                                })
                              }
                              disabled={issued}
                            />
                          </div>
                          <div className="f s3">
                            <label>Cabina · classe</label>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input
                                value={doc.cabin}
                                placeholder="economy"
                                onChange={(event) =>
                                  patchFlight(segment.id, {
                                    cabin: event.target.value,
                                  })
                                }
                                disabled={issued}
                              />
                              <input
                                className="mono"
                                style={{ width: 60 }}
                                maxLength={2}
                                placeholder="T"
                                value={doc.bookingClass}
                                onChange={(event) =>
                                  patchFlight(segment.id, {
                                    bookingClass:
                                      event.target.value.toUpperCase(),
                                  })
                                }
                                disabled={issued}
                              />
                            </div>
                          </div>
                          <div className="f s3">
                            <label>Terminal de partida</label>
                            <input
                              value={doc.terminalFrom}
                              placeholder="1"
                              onChange={(event) =>
                                patchFlight(segment.id, {
                                  terminalFrom: event.target.value,
                                })
                              }
                              disabled={issued}
                            />
                          </div>
                          <div className="f s3">
                            <label>Terminal de chegada</label>
                            <input
                              value={doc.terminalTo}
                              placeholder="2"
                              onChange={(event) =>
                                patchFlight(segment.id, {
                                  terminalTo: event.target.value,
                                })
                              }
                              disabled={issued}
                            />
                          </div>
                          <div className="f s3">
                            <label>Localizador da companhia</label>
                            <input
                              className="mono"
                              placeholder="ABC123"
                              maxLength={12}
                              value={doc.airlinePnr}
                              onChange={(event) =>
                                patchFlight(segment.id, {
                                  airlinePnr: event.target.value.toUpperCase(),
                                })
                              }
                              disabled={issued}
                            />
                            <span className="hint">
                              o PNR da companhia, se for diferente do nosso
                            </span>
                          </div>
                          <div className="f s3">
                            <label>Nº do cupão</label>
                            <input
                              className="mono"
                              maxLength={4}
                              value={doc.couponNumber}
                              onChange={(event) =>
                                patchFlight(segment.id, {
                                  couponNumber: event.target.value,
                                })
                              }
                              disabled={issued}
                            />
                          </div>
                          <div className="f s4">
                            <label>Fare basis</label>
                            <input
                              id={`em-fare-${segment.id}`}
                              className="mono"
                              placeholder="TLXCV3"
                              value={doc.fareBasis}
                              aria-invalid={!issued && !doc.fareBasis.trim()}
                              onChange={(event) =>
                                patchFlight(segment.id, {
                                  fareBasis: event.target.value.toUpperCase(),
                                })
                              }
                              disabled={issued}
                            />
                          </div>
                          <div className="f s4">
                            <label>NVB</label>
                            <input
                              className="mono"
                              placeholder="01SEP26"
                              value={doc.nvb}
                              aria-invalid={!issued && !doc.nvb.trim()}
                              onChange={(event) =>
                                patchFlight(segment.id, {
                                  nvb: event.target.value.toUpperCase(),
                                })
                              }
                              disabled={issued}
                            />
                          </div>
                          <div className="f s4">
                            <label>NVA</label>
                            <input
                              className="mono"
                              placeholder="12SEP26"
                              value={doc.nva}
                              aria-invalid={!issued && !doc.nva.trim()}
                              onChange={(event) =>
                                patchFlight(segment.id, {
                                  nva: event.target.value.toUpperCase(),
                                })
                              }
                              disabled={issued}
                            />
                          </div>

                          {/* TK-04 · numa ligação, a bagagem segue ou não? É a
                              pergunta que mais se faz ao balcão de transferência,
                              e o bilhete tem de a responder. Só aparece quando há
                              um voo a seguir a este. */}
                          {index < ordered.length - 1 &&
                            ordered[index + 1].direction ===
                              segment.direction && (
                              <div className="f s12">
                                <label className="chk" style={{ display: "flex", gap: 8 }}>
                                  <input
                                    type="checkbox"
                                    checked={doc.baggageThrough}
                                    onChange={(event) =>
                                      patchFlight(segment.id, {
                                        baggageThrough: event.target.checked,
                                      })
                                    }
                                    disabled={issued}
                                  />
                                  <span>
                                    A bagagem segue directa até ao destino final
                                    — o passageiro não a levanta na escala de{" "}
                                    {segment.destination}
                                  </span>
                                </label>
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="sec">
              <div className="sec-h">
                <h4>
                  {ordered.length > 0
                    ? "Campos comuns ao bilhete"
                    : "Campos do documento"}
                </h4>
                <span className="rule" />
              </div>
              <div className="fgrid">
                {/* Sem itinerário gravado não há blocos por voo, e estes três
                    campos voltam a ser a única forma de descrever o documento.
                    É o caso das propostas anteriores ao compositor. */}
                {ordered.length === 0 && (
                  <>
                    <div className="f s3">
                      <label>Fare basis</label>
                      <input
                        id="em-fare-basis"
                        className="mono"
                        placeholder="TLXCV3"
                        value={fareBasis}
                        aria-invalid={!issued && !fareBasis.trim()}
                        onChange={(event) => setFareBasis(event.target.value)}
                        disabled={issued}
                      />
                    </div>
                    <div className="f s3">
                      <label>NVB</label>
                      <input
                        id="em-nvb"
                        className="mono"
                        placeholder="01SEP26"
                        value={nvb}
                        aria-invalid={!issued && !nvb.trim()}
                        onChange={(event) => setNvb(event.target.value)}
                        disabled={issued}
                      />
                    </div>
                    <div className="f s3">
                      <label>NVA</label>
                      <input
                        id="em-nva"
                        className="mono"
                        placeholder="12SEP26"
                        value={nva}
                        aria-invalid={!issued && !nva.trim()}
                        onChange={(event) => setNva(event.target.value)}
                        disabled={issued}
                      />
                    </div>
                  </>
                )}
                <div className="f s3">
                  <label>Endossos</label>
                  <input
                    className="mono"
                    value={endorsements}
                    onChange={(event) => setEndorsements(event.target.value)}
                    disabled={issued}
                  />
                </div>
              </div>
            </div>

            {error && <div className="note bad">{error}</div>}
            {notice && <div className="note ok">{notice}</div>}

            {!issued && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!ready || pending}
                  onClick={() =>
                    run(() =>
                      boIssueTickets({
                        caseId,
                        pnr,
                        issuingCarrier: carrier,
                        consolidator,
                        costReal,
                        fareBasis,
                        nvb,
                        nva,
                        endorsements,
                        tickets: tickets.map((row) => ({
                          passengerId: row.passengerId,
                          /* As colunas antigas guardam o primeiro lugar de cada
                             sentido, para os ecrãs que ainda as leem. */
                          ticketNumber: row.ticketNumber,
                          seatOutbound:
                            seats[
                              seatKey(
                                row.passengerId,
                                ordered.find((s) => s.direction === "ida")?.id ?? ""
                              )
                            ] ?? "",
                          seatInbound:
                            seats[
                              seatKey(
                                row.passengerId,
                                ordered.find((s) => s.direction === "volta")?.id ?? ""
                              )
                            ] ?? "",
                        })),
                        seats: Object.entries(seats)
                          .filter(([, seat]) => seat.trim())
                          .map(([key, seat]) => {
                            const [passengerId, segmentId] = key.split("::")
                            return { passengerId, segmentId, seat }
                          }),
                        /* T-04 · o cupão de cada voo. */
                        segments: ordered.map((segment) => {
                          const doc = flights[segment.id] ?? EMPTY_DOC
                          return {
                            segmentId: segment.id,
                            fareBasis: doc.fareBasis,
                            nvb: doc.nvb,
                            nva: doc.nva,
                            couponNumber: doc.couponNumber,
                            aircraft: doc.aircraft,
                            cabin: doc.cabin,
                            bookingClass: doc.bookingClass,
                            terminalFrom: doc.terminalFrom,
                            terminalTo: doc.terminalTo,
                            airlinePnr: doc.airlinePnr,
                            segmentStatus: "confirmed",
                            baggageThrough: doc.baggageThrough,
                          }
                        }),
                        /* T-04 · a bagagem, por passageiro e por voo. Só as
                           linhas que alguém preencheu: um par sem resposta é
                           "por atribuir", e gravar zeros seria afirmar que a
                           tarifa não leva mala nenhuma. */
                        baggage: Object.entries(bags)
                          .filter(
                            ([, bag]) =>
                              bag.checkedPieces > 0 ||
                              bag.checkedKg.trim() !== "" ||
                              bag.cabinPieces !== EMPTY_BAG.cabinPieces
                          )
                          .map(([key, bag]) => {
                            const [passengerId, segmentId] = key.split("::")
                            return {
                              passengerId,
                              segmentId,
                              checkedPieces: bag.checkedPieces,
                              checkedKg: bag.checkedKg.trim()
                                ? Number(bag.checkedKg.replace(",", "."))
                                : null,
                              cabinPieces: bag.cabinPieces,
                              cabinKg: bag.cabinKg.trim()
                                ? Number(bag.cabinKg.replace(",", "."))
                                : null,
                            }
                          }),
                      })
                    )
                  }
                >
                  {pending ? "A emitir…" : "Emitir, gerar o bilhete e avisar o cliente"}
                </button>
              </div>
            )}

            {issued && (
              <div className="note ok">
                Emitido com o PNR <b className="mono">{issuance.pnr}</b>. O cliente
                vê os bilhetes no link dele.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
