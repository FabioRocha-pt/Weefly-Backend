"use client"

/**
 * A aba da Emissão.
 *
 * O botão só acende quando há PNR, um número de bilhete por passageiro e os
 * campos do documento — e quando o pagamento está confirmado. Emitir sem
 * pagamento confirmado é o único erro deste ecrã que custa dinheiro à WeeFly, e
 * por isso é o único que o ecrã impede em vez de avisar.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { boIssueTickets } from "@/actions/bo-price-checker"
import type { PcPayment } from "@/lib/pc/payment"
import type { CasePassenger } from "@/lib/case-status"
import { formatAmountPlain, formatMoney } from "@/lib/proposal-math"

interface TicketRow {
  passengerId: string
  ticketNumber: string
  seatOutbound: string
  seatInbound: string
}

export function BoIssuancePanel({
  caseId,
  payment,
  passengers,
  issuance,
  amount,
  currency,
}: {
  caseId: string
  payment: PcPayment | null
  passengers: CasePassenger[]
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
      seatOutbound: p.seat_outbound ?? "",
      seatInbound: p.seat_inbound ?? "",
    }))
  )

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const numbers = tickets.map((t) => t.ticketNumber.replace(/\s+/g, ""))
  const allTickets = numbers.every((n) => /^\d{13}$/.test(n))
  const duplicated = new Set(numbers.filter(Boolean)).size !== numbers.filter(Boolean).length
  const ready =
    paid &&
    /^[A-Za-z0-9]{6}$/.test(pnr) &&
    allTickets &&
    !duplicated &&
    Boolean(fareBasis && nvb && nva) &&
    passengers.length > 0

  const patch = (index: number, key: keyof TicketRow, value: string) =>
    setTickets((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    )

  const margin =
    amount && costReal ? amount - Number(costReal.replace(/[^\d]/g, "")) : null

  return (
    <div className="cols two tabpane">
      <aside className="panel sticky">
        <div className="panel-h">
          <h3>{issued ? "Emitido" : "Pronto a emitir"}</h3>
        </div>
        <div className="panel-b">
          <div className="kv">
            <span className="kv-k">Pagamento</span>
            <span
              className="kv-v"
              style={{ color: paid ? "var(--ok)" : "var(--warn)" }}
            >
              {paid ? "Confirmado" : "Não confirmado"}
            </span>
          </div>
          <div className="kv">
            <span className="kv-k">Passageiros</span>
            <span className="kv-v">{passengers.length}</span>
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
        </div>
      </aside>

      <main className="stack">
        <div className="panel">
          <div className="panel-h">
            <h3>Dados da emissão</h3>
          </div>
          <div className="panel-b">
            <div className="fgrid">
              <div className="f s3">
                <label>PNR</label>
                <input
                  className="mono"
                  placeholder="6 caracteres"
                  maxLength={6}
                  style={{ textTransform: "uppercase" }}
                  value={pnr}
                  onChange={(event) => setPnr(event.target.value.toUpperCase())}
                  disabled={issued}
                />
              </div>
              <div className="f s3">
                <label>Companhia emissora</label>
                <input
                  className="mono"
                  placeholder="TP · 047"
                  value={carrier}
                  onChange={(event) => setCarrier(event.target.value)}
                  disabled={issued}
                />
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
                  <span className="hint">
                    margem {formatMoney(margin, currency)}
                  </span>
                )}
              </div>
            </div>

            <div className="sec" style={{ marginTop: 18 }}>
              <div className="sec-h">
                <h4>Por passageiro</h4>
                <span className="rule" />
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  13 dígitos · sem duplicados
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
                  </div>
                  <div
                    className="paxcard-h"
                    style={{ background: "none", borderBottom: 0, padding: "11px 13px" }}
                  >
                    <div className="fgrid" style={{ width: "100%" }}>
                      <div className="f s5">
                        <label>Nº do bilhete</label>
                        <input
                          className="mono"
                          placeholder="0471234567890"
                          value={tickets[index]?.ticketNumber ?? ""}
                          onChange={(event) =>
                            patch(index, "ticketNumber", event.target.value)
                          }
                          disabled={issued}
                        />
                      </div>
                      <div className="f s3">
                        <label>Lugar ida</label>
                        <input
                          className="mono"
                          placeholder="12A"
                          value={tickets[index]?.seatOutbound ?? ""}
                          onChange={(event) =>
                            patch(index, "seatOutbound", event.target.value)
                          }
                          disabled={issued}
                        />
                      </div>
                      <div className="f s3">
                        <label>Lugar volta</label>
                        <input
                          className="mono"
                          placeholder="14A"
                          value={tickets[index]?.seatInbound ?? ""}
                          onChange={(event) =>
                            patch(index, "seatInbound", event.target.value)
                          }
                          disabled={issued}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {duplicated && (
                <div className="note bad">Há números de bilhete repetidos.</div>
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
                    className="mono"
                    placeholder="TLXCV3"
                    value={fareBasis}
                    onChange={(event) => setFareBasis(event.target.value)}
                    disabled={issued}
                  />
                </div>
                <div className="f s3">
                  <label>NVB</label>
                  <input
                    className="mono"
                    placeholder="01SEP26"
                    value={nvb}
                    onChange={(event) => setNvb(event.target.value)}
                    disabled={issued}
                  />
                </div>
                <div className="f s3">
                  <label>NVA</label>
                  <input
                    className="mono"
                    placeholder="12SEP26"
                    value={nva}
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
              <>
                <p className="note warn">
                  O botão só ativa com <b>PNR</b>, um <b>número de bilhete por
                  passageiro</b>, <b>fare basis</b>, <b>NVB</b> e <b>NVA</b>
                  preenchidos, sem duplicados, e com o pagamento confirmado.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!ready || pending}
                    onClick={() => {
                      setError(null)
                      setNotice(null)
                      startTransition(async () => {
                        const result = await boIssueTickets({
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
                            ticketNumber: row.ticketNumber,
                            seatOutbound: row.seatOutbound,
                            seatInbound: row.seatInbound,
                          })),
                        })
                        if (result.ok) {
                          setNotice(result.notice ?? "Emitido.")
                          router.refresh()
                        } else {
                          setError(result.error)
                        }
                      })
                    }}
                  >
                    {pending ? "A emitir…" : "Emitir e fechar o caso"}
                  </button>
                </div>
              </>
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
