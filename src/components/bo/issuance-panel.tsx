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
import { formatAmountPlain, formatMoney, parseMoney } from "@/lib/proposal-math"
import { CARRIERS } from "@/lib/pc/catalog"
import { CarrierMark } from "@/components/bo/carrier-mark"
import { BoErrorList, focusField, type BoFieldError } from "@/components/bo/error-list"

interface TicketRow {
  passengerId: string
  ticketNumber: string
}

/** A chave de um lugar: um passageiro num voo. */
const seatKey = (passengerId: string, segmentId: string) =>
  `${passengerId}::${segmentId}`

const CARRIER_CODES = Object.keys(CARRIERS).sort()

export function BoIssuancePanel({
  caseId,
  payment,
  passengers,
  segments,
  savedSeats,
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
  const [carrier, setCarrier] = useState(issuance.issuingCarrier ?? "")
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
  if (!fareBasis.trim()) {
    errors.push({ target: "em-fare-basis", label: "Falta a base tarifária." })
  }
  if (!nvb.trim()) errors.push({ target: "em-nvb", label: "Falta o NVB." })
  if (!nva.trim()) errors.push({ target: "em-nva", label: "Falta o NVA." })
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
                {/* PC-12 · do catálogo, e não texto livre. É por este código que
                    o logótipo é procurado e de onde vem o prefixo dos bilhetes. */}
                <select
                  id="em-carrier"
                  value={carrier}
                  onChange={(event) => setCarrier(event.target.value)}
                  disabled={issued}
                >
                  <option value="">Escolher…</option>
                  {CARRIER_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code} · {CARRIERS[code].name} · {CARRIERS[code].prefix}
                    </option>
                  ))}
                  {carrier && !CARRIERS[carrier] && (
                    <option value={carrier}>{carrier} · fora do catálogo</option>
                  )}
                </select>
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
                      {ordered.map((segment) => (
                        <div className="f s2" key={segment.id}>
                          <label>
                            {[segment.carrier_code, segment.flight_number]
                              .filter(Boolean)
                              .join(" ") || segment.origin}
                            <br />
                            <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                              {segment.origin}→{segment.destination}
                            </span>
                          </label>
                          <input
                            className="mono"
                            placeholder="12A"
                            maxLength={6}
                            value={seats[seatKey(passenger.id, segment.id)] ?? ""}
                            onChange={(event) =>
                              setSeats((current) => ({
                                ...current,
                                [seatKey(passenger.id, segment.id)]:
                                  event.target.value.toUpperCase(),
                              }))
                            }
                            disabled={issued}
                          />
                        </div>
                      ))}
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

            <div className="sec">
              <div className="sec-h">
                <h4>Campos do documento</h4>
                <span className="rule" />
              </div>
              <div className="fgrid">
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
