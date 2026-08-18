"use client"

/**
 * B3 · a ficha do caso, com as sete abas do mockup.
 *
 * A aba que abre não é sempre a mesma: é a que tem trabalho. Um caso com
 * comprovativo à espera abre no Pagamento — deixá-lo abrir no Pedido obrigaria a
 * dois cliques para chegar à única coisa que falta fazer.
 */

import { useState } from "react"
import Link from "next/link"

import type { BoCaseDetail } from "@/lib/pc/bo-queue"
import { BO_STATE_CLASS, BO_STATE_LABEL } from "@/lib/pc/bo-queue"
import type { PaymentProof, PcPayment } from "@/lib/pc/payment"
import type { PublicProposalView } from "@/lib/proposals"
import type { CaseEvent } from "@/lib/case-events"
import type { CasePassenger } from "@/lib/case-status"
import { elapsedSince } from "@/lib/case-status"
import { formatMoney } from "@/lib/proposal-math"
import { BoPaymentPanel } from "@/components/bo/payment-panel"
import { BoIssuancePanel } from "@/components/bo/issuance-panel"
import { BoNoteForm } from "@/components/bo/note-form"
import { CCS } from "@/lib/pc/catalog"

type TabId =
  | "t-pedido"
  | "t-propostas"
  | "t-pax"
  | "t-pag"
  | "t-emi"
  | "t-com"
  | "t-log"

const TABS: { id: TabId; label: string }[] = [
  { id: "t-pedido", label: "Pedido" },
  { id: "t-propostas", label: "Propostas" },
  { id: "t-pax", label: "Passageiros" },
  { id: "t-pag", label: "Pagamento" },
  { id: "t-emi", label: "Emissão" },
  { id: "t-com", label: "Comunicações" },
  { id: "t-log", label: "Registo" },
]

/** A aba onde está o trabalho, para este estado. */
function defaultTab(detail: BoCaseDetail): TabId {
  switch (detail.row.state) {
    case "comprovativo_por_validar":
    case "aguarda_pagamento":
      return "t-pag"
    case "pago_sem_bilhete":
      return "t-emi"
    case "novo":
    case "em_cotacao":
      return "t-propostas"
    case "aguarda_passaportes":
      return "t-pax"
    default:
      return "t-pedido"
  }
}

const dt = (iso: string | null | undefined, withTime = true): string => {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Atlantic/Cape_Verde",
  })
}

const marketName = (prefix: string) =>
  CCS.find((c) => c.c === prefix)?.n ?? prefix

export function BoCaseView({
  detail,
  payment,
  proofs,
  proposal,
  passengers,
  events,
  initialTab,
  viewer,
}: {
  detail: BoCaseDetail
  payment: PcPayment | null
  proofs: PaymentProof[]
  proposal: PublicProposalView | null
  passengers: CasePassenger[]
  events: CaseEvent[]
  initialTab?: string
  viewer: { label: string; email: string }
}) {
  const [tab, setTab] = useState<TabId>(
    TABS.some((t) => t.id === initialTab)
      ? (initialTab as TabId)
      : defaultTab(detail)
  )

  const row = detail.row

  return (
    <>
      <section className="casebar">
        <div className="case-top">
          <div>
            <p className="crumb">
              <Link href="/admin/price-checker">Price Checker</Link> ·{" "}
              <Link href={`/admin/price-checker?tab=tudo`}>Casos</Link>
            </p>
            <h2 className="case">
              {row.clientName} <span className="token mono">{row.reference}</span>{" "}
              <span className={`state ${BO_STATE_CLASS[row.state]}`}>
                <span className={`dot ${row.waiting === "bad" ? "bad" : row.waiting}`} />
                {BO_STATE_LABEL[row.state]}
              </span>
            </h2>
            <div className="case-meta">
              <div className="cm">
                <span className="cm-k">Entrada</span>
                {detail.trip.intake === "price_checker" ? "Link" : detail.trip.intake} ·{" "}
                <span className="mono">
                  {row.agentSlug ? `agent=${row.agentSlug}` : "sem agente"}
                </span>
              </div>
              <div className="cm">
                <span className="cm-k">Mercado e moeda</span>
                {marketName(row.market)} · <span className="mono">{row.currency}</span> ·{" "}
                <span className="mono">lang={row.locale}</span>
              </div>
              <div className="cm">
                <span className="cm-k">Vendedor</span>
                {detail.ownerEmail ?? "sem dono"}
              </div>
              <div className="cm">
                <span className="cm-k">Submetido</span>
                {dt(row.submittedAt)} ·{" "}
                <span style={{ color: "var(--warn)" }}>
                  há {elapsedSince(row.submittedAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="case-actions">
            <Link className="btn btn-sm" href={`/pc/${row.token}`} target="_blank">
              Ver como cliente
            </Link>
            <a
              className="btn btn-sm"
              href={`https://wa.me/${row.clientPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                `Olá ${row.clientName.split(" ")[0]}, sobre o pedido ${row.reference}:`
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            <Link className="btn btn-sm" href={`/admin/casos/${row.caseId}`}>
              Ficha antiga
            </Link>
          </div>
        </div>

        <div className="tabs" role="tablist">
          {TABS.map((entry) => {
            const count =
              entry.id === "t-propostas"
                ? proposal?.offers.length
                : entry.id === "t-pax"
                  ? passengers.length
                  : entry.id === "t-com" || entry.id === "t-log"
                    ? events.length
                    : undefined
            return (
              <button
                key={entry.id}
                className="tab"
                role="tab"
                type="button"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
                {count ? <span className="n">{count}</span> : null}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── PEDIDO ── */}
      {tab === "t-pedido" && (
        <div className="cols two tabpane">
          <aside className="panel sticky">
            <div className="panel-h">
              <h3>Pedido do cliente</h3>
            </div>
            <div className="panel-b">
              <div className="routebox">
                <div>
                  <div className="iata mono">{row.origin}</div>
                  <div className="city">{row.origin}</div>
                </div>
                <div style={{ color: "var(--muted)" }}>→</div>
                <div style={{ textAlign: "right" }}>
                  <div className="iata mono">{row.destination}</div>
                  <div className="city">{row.destination}</div>
                </div>
              </div>
              <Kv k="Tipo" v={detail.trip.tripLabel} />
              <Kv k="Ida" v={dt(row.departDate, false)} mono />
              {row.returnDate && <Kv k="Volta" v={dt(row.returnDate, false)} mono />}
              <Kv k="Adultos" v={String(detail.trip.adults)} mono />
              <Kv k="Crianças 2–11" v={String(detail.trip.children)} mono />
              <Kv
                k="Bebés"
                v={`${detail.trip.infantsInSeat} c/ assento · ${detail.trip.infantsOnLap} colo`}
                mono
              />
              <Kv k="Classe" v={detail.trip.cabinLabel} />
              {detail.trip.legs.length > 0 && (
                <>
                  {detail.trip.legs.map((leg) => (
                    <Kv
                      key={leg.position}
                      k={`Voo ${leg.position}`}
                      v={`${leg.origin} → ${leg.destination} · ${dt(leg.date, false)}`}
                      mono
                    />
                  ))}
                </>
              )}
            </div>
          </aside>

          <main className="stack">
            <div className="panel">
              <div className="panel-h">
                <h3>Contacto</h3>
              </div>
              <div className="panel-b">
                <div className="fgrid">
                  <div className="f s6">
                    <label>Nome completo</label>
                    <input value={row.clientName} readOnly />
                  </div>
                  <div className="f s6">
                    <label>Telefone · WhatsApp</label>
                    <input className="mono" value={row.clientPhone} readOnly />
                  </div>
                  <div className="f s6">
                    <label>Email</label>
                    <input value={row.clientEmail} readOnly />
                  </div>
                  <div className="f s6">
                    <label>Consentimento</label>
                    <input
                      value={[
                        dt(detail.trip.consentAt),
                        detail.trip.consentIp,
                        detail.trip.consentAgent?.slice(0, 40),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      readOnly
                    />
                  </div>
                </div>
              </div>
            </div>

            <BoNoteForm caseId={row.caseId} notes={detail.notes} />
          </main>
        </div>
      )}

      {/* ── PROPOSTAS ── */}
      {tab === "t-propostas" && (
        <div className="cols two tabpane">
          <aside className="panel sticky">
            <div className="panel-h">
              <h3>Pedido</h3>
            </div>
            <div className="panel-b">
              <div className="routebox">
                <div>
                  <div className="iata mono">{row.origin}</div>
                </div>
                <div style={{ color: "var(--muted)" }}>→</div>
                <div style={{ textAlign: "right" }}>
                  <div className="iata mono">{row.destination}</div>
                </div>
              </div>
              <Kv k="Datas" v={`${dt(row.departDate, false)}${row.returnDate ? ` – ${dt(row.returnDate, false)}` : ""}`} mono />
              <Kv k="Passageiros" v={row.paxLabel} />
              <Kv k="Classe" v={detail.trip.cabinLabel} />
              <Kv k="Moeda" v={row.currency} mono />
              {detail.notes[0] && <p className="quote">“{detail.notes[0].body}”</p>}
            </div>
          </aside>

          <main className="stack">
            <div className="panel">
              <div className="panel-h">
                <h3>Propostas publicadas</h3>
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                  {proposal ? `revisão R${proposal.proposal.revision}` : "sem proposta"}
                </span>
              </div>
              <div className="panel-b">
                {!proposal ? (
                  <p className="note">
                    Ainda não há proposta publicada. O compositor de ofertas — com
                    importação do Amadeus, itinerário, preço e pré-visualização do
                    cartão do cliente — é o mesmo que já existe no back-office.
                  </p>
                ) : (
                  <>
                    {proposal.offers.map((offer) => (
                      <div className="orow" key={offer.id}>
                        <div className="oi">
                          <div className="nm">{offer.name || "Opção sem nome"}</div>
                          <div className="ms mono">
                            {offer.segments
                              .sort((a, b) => a.position - b.position)
                              .map(
                                (s) =>
                                  `${s.origin ?? "?"} ${s.depart_at?.slice(11, 16) ?? ""} → ${
                                    s.destination ?? "?"
                                  } ${s.arrive_at?.slice(11, 16) ?? ""}`
                              )
                              .join(" · ")}
                          </div>
                        </div>
                        {offer.valid_until && (
                          <span
                            className="flag"
                            aria-pressed="true"
                            style={{
                              background: "var(--grey-bg)",
                              color: "var(--txt-2)",
                              borderColor: "var(--line)",
                            }}
                          >
                            garantido até {offer.valid_until.slice(11, 16)}
                          </span>
                        )}
                        {proposal.proposal.selected_offer_id === offer.id && (
                          <span className="flag" aria-pressed="true">
                            escolhida
                          </span>
                        )}
                        <div className="pv mono">
                          {formatMoney(
                            offer.price_adult * detail.trip.adults +
                              offer.price_child * detail.trip.children +
                              offer.price_infant *
                                (detail.trip.infantsInSeat + detail.trip.infantsOnLap) +
                              offer.taxes_total +
                              offer.service_fee,
                            proposal.proposal.currency
                          )}
                        </div>
                      </div>
                    ))}
                    {proposal.proposal.selected_at && (
                      <p className="note" style={{ marginTop: 12 }}>
                        O cliente escolheu em {dt(proposal.proposal.selected_at)}.
                      </p>
                    )}
                  </>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <Link
                    className="btn btn-sm btn-primary"
                    href={`/admin/casos/${row.caseId}/ofertas`}
                  >
                    {proposal ? "Editar propostas" : "Compor propostas"}
                  </Link>
                  <Link className="btn btn-sm" href={`/pc/${row.token}`} target="_blank">
                    Ver como o cliente vê
                  </Link>
                </div>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* ── PASSAGEIROS ── */}
      {tab === "t-pax" && (
        <div className="cols two tabpane">
          <aside className="panel sticky">
            <div className="panel-h">
              <h3>Opção escolhida</h3>
            </div>
            <div className="panel-b">
              <Kv
                k="Opção"
                v={
                  proposal?.offers.find(
                    (o) => o.id === proposal.proposal.selected_offer_id
                  )?.name ?? "—"
                }
              />
              <Kv k="Rota" v={`${row.origin} → ${row.destination}`} mono />
              <Kv
                k="Total"
                v={row.amount ? formatMoney(row.amount, row.currency) : "—"}
                mono
              />
              <Kv k="Escolhida em" v={dt(proposal?.proposal.selected_at)} />
            </div>
          </aside>
          <main className="stack">
            <div className="panel">
              <div className="panel-h">
                <h3>Dados submetidos pelo cliente</h3>
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                  {passengers.length} de{" "}
                  {detail.trip.adults +
                    detail.trip.children +
                    detail.trip.infantsInSeat +
                    detail.trip.infantsOnLap}{" "}
                  completos
                </span>
              </div>
              <div className="panel-b">
                {passengers.length === 0 ? (
                  <p className="note">
                    O cliente ainda não submeteu os passaportes.
                  </p>
                ) : (
                  <>
                    <PassportWarnings passengers={passengers} returnDate={row.returnDate ?? row.departDate} />
                    {passengers.map((p, index) => (
                      <PassengerCard
                        key={p.id}
                        passenger={p}
                        index={index}
                        lastDate={row.returnDate ?? row.departDate}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      {/* ── PAGAMENTO ── */}
      {tab === "t-pag" && (
        <BoPaymentPanel
          caseId={row.caseId}
          reference={row.reference}
          currency={row.currency}
          market={marketName(row.market)}
          payment={payment}
          proofs={proofs}
          state={row.state}
          viewer={viewer}
        />
      )}

      {/* ── EMISSÃO ── */}
      {tab === "t-emi" && (
        <BoIssuancePanel
          caseId={row.caseId}
          payment={payment}
          passengers={passengers}
          issuance={detail.issuance}
          amount={row.amount}
          currency={row.currency}
        />
      )}

      {/* ── COMUNICAÇÕES ── */}
      {tab === "t-com" && (
        <div className="cols two tabpane">
          <aside className="panel sticky">
            <div className="panel-h">
              <h3>Canais</h3>
            </div>
            <div className="panel-b">
              <Kv k="WhatsApp" v={row.clientPhone} mono />
              <Kv k="Email" v={row.clientEmail} />
              <Kv k="Idioma" v={row.locale} mono />
              <Kv k="Link do cliente" v={`/pc/${row.token.slice(0, 8)}…`} mono />
            </div>
          </aside>
          <main className="stack">
            <div className="panel">
              <div className="panel-h">
                <h3>O que o sistema enviou e recebeu</h3>
              </div>
              <div className="panel-b">
                <div className="log">
                  {events
                    .filter((event) =>
                      [
                        "request_submitted",
                        "offer_selected",
                        "passengers_submitted",
                        "proof_uploaded",
                        "client_declared_paid",
                        "payment_confirmed",
                        "proof_rejected",
                        "tickets_issued",
                      ].includes(event.kind)
                    )
                    .map((event) => (
                      <LogRow key={event.id} event={event} />
                    ))}
                </div>
              </div>
            </div>
            <BoNoteForm caseId={row.caseId} notes={detail.notes} />
          </main>
        </div>
      )}

      {/* ── REGISTO ── */}
      {tab === "t-log" && (
        <div className="cols two tabpane">
          <aside className="panel sticky">
            <div className="panel-h">
              <h3>Este caso</h3>
            </div>
            <div className="panel-b">
              <Kv k="Criado" v={dt(row.submittedAt)} />
              <Kv k="Última alteração" v={dt(row.updatedAt)} />
              <Kv k="Token do link" v={row.token} mono />
              <p className="note" style={{ marginTop: 12 }}>
                Nada é apagado. Cada acontecimento do caso deixa uma linha, com
                quem o provocou.
              </p>
            </div>
          </aside>
          <main className="panel">
            <div className="panel-h">
              <h3>Histórico completo</h3>
              <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                hora local de Cabo Verde
              </span>
            </div>
            <div className="panel-b">
              <div className="log">
                {events.length === 0 ? (
                  <p className="note">Sem registos.</p>
                ) : (
                  events.map((event) => <LogRow key={event.id} event={event} />)
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      <div className="spacer" />
    </>
  )
}

// ── peças ────────────────────────────────────────────────────────────────────

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className={`kv-v${mono ? " mono" : ""}`}>{v}</span>
    </div>
  )
}

function LogRow({ event }: { event: CaseEvent }) {
  return (
    <div className="logrow">
      <span className="t mono">
        {new Date(event.created_at).toLocaleString("pt-PT", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Atlantic/Cape_Verde",
        })}
      </span>
      <div>
        <b>{event.title}</b>
        <span>{event.detail ?? event.actor_email ?? ""}</span>
      </div>
    </div>
  )
}

/**
 * Os dois avisos automáticos do mockup, calculados de verdade.
 *
 * Passaporte com menos de 6 meses de validade após o regresso, e nomes com
 * acentos ou caracteres que a companhia não aceita no bilhete. São os dois erros
 * que se descobrem tarde, já com o bilhete emitido.
 */
function PassportWarnings({
  passengers,
  returnDate,
}: {
  passengers: CasePassenger[]
  returnDate: string
}) {
  const warnings: string[] = []

  passengers.forEach((p, index) => {
    if (p.passport_expiry && returnDate) {
      const needed = new Date(returnDate)
      needed.setMonth(needed.getMonth() + 6)
      if (Date.parse(p.passport_expiry) < needed.getTime()) {
        warnings.push(
          `P${index + 1} tem passaporte válido só até ${p.passport_expiry} — menos de 6 meses após o regresso.`
        )
      }
    }
    const raw = `${p.first_name} ${p.last_name}`
    if (/[^\x20-\x7E]/.test(raw)) {
      warnings.push(
        `P${index + 1} tem acentos no nome (${raw}) — o bilhete precisa da versão sem acentos.`
      )
    }
  })

  if (!warnings.length) {
    return (
      <p className="note ok" style={{ marginBottom: 13 }}>
        Sem avisos automáticos: validades e nomes passam as verificações.
      </p>
    )
  }

  return (
    <div className="note warn" style={{ marginBottom: 13 }}>
      <b>Verifique antes de emitir:</b>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  )
}

const TYPE_LABEL: Record<string, string> = {
  adult: "Adulto",
  child: "Criança",
  infant: "Bebé",
  infant_seat: "Bebé c/ assento",
  infant_lap: "Bebé de colo",
}

function PassengerCard({
  passenger,
  index,
  lastDate,
}: {
  passenger: CasePassenger
  index: number
  lastDate: string
}) {
  const flaggedExpiry = (() => {
    if (!passenger.passport_expiry || !lastDate) return false
    const needed = new Date(lastDate)
    needed.setMonth(needed.getMonth() + 6)
    return Date.parse(passenger.passport_expiry) < needed.getTime()
  })()

  const accent = /[^\x20-\x7E]/.test(`${passenger.first_name} ${passenger.last_name}`)

  return (
    <div className="paxcard">
      <div className="paxcard-h">
        <span className={`paxtag${passenger.passenger_type === "adult" ? "" : " child"}`}>
          P{index + 1}
        </span>
        <b>{`${passenger.last_name}/${passenger.first_name}`.toUpperCase()}</b>
        <span className="st state st-n" style={{ marginLeft: "auto" }}>
          {TYPE_LABEL[passenger.passenger_type] ?? passenger.passenger_type}
          {index === 0 ? " · titular" : ""}
        </span>
      </div>
      <div className="paxgrid">
        <div>
          <span className="k">Nascimento</span>
          <span className="v mono">{passenger.birth_date ?? "—"}</span>
        </div>
        <div>
          <span className="k">Sexo</span>
          <span className="v">
            {passenger.gender === "f" ? "Feminino" : passenger.gender === "m" ? "Masculino" : "—"}
          </span>
        </div>
        <div>
          <span className="k">Nacionalidade</span>
          <span className="v">{passenger.nationality ?? "—"}</span>
        </div>
        <div>
          <span className="k">Passaporte</span>
          <span className="v mono">{passenger.passport_number ?? "—"}</span>
        </div>
        <div>
          <span className="k">Válido até</span>
          <span className={`v mono${flaggedExpiry ? " flagged" : ""}`}>
            {passenger.passport_expiry ?? "—"}
            {flaggedExpiry ? " ⚠" : ""}
          </span>
        </div>
        <div>
          <span className="k">País emissor</span>
          <span className="v">{passenger.issuing_country ?? "—"}</span>
        </div>
        <div>
          <span className="k">Nome para bilhete</span>
          <span className={`v${accent ? " flagged" : ""}`}>
            {accent
              ? `${passenger.first_name} ${passenger.last_name}`
                  .normalize("NFD")
                  .replace(/[̀-ͯ]/g, "")
                  .toUpperCase() + " · sem acentos"
              : "OK"}
          </span>
        </div>
        <div>
          <span className="k">Bilhete</span>
          <span className="v mono">{passenger.ticket_number ?? "—"}</span>
        </div>
      </div>
    </div>
  )
}
