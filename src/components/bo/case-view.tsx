"use client"

/**
 * B3 · a ficha do caso, com as sete abas do mockup.
 *
 * A aba que abre não é sempre a mesma: é a que tem trabalho. Um caso com
 * comprovativo à espera abre no Pagamento — deixá-lo abrir no Pedido obrigaria a
 * dois cliques para chegar à única coisa que falta fazer.
 */

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { boClaimCase } from "@/actions/bo-price-checker"

import type { BoCaseDetail } from "@/lib/pc/bo-queue"
import type { PaymentProof, PcPayment } from "@/lib/pc/payment"
import type { PublicProposalView } from "@/lib/proposals"
import type { CaseEvent } from "@/lib/case-events"
import type { CaseNotification } from "@/lib/notifications"
import type { CasePassenger, LinkState } from "@/lib/case-status"
import type { PassengerBaggage, SegmentIssuance } from "@/lib/issuance"
import { fareAgeChange } from "@/lib/validations"
import { formatMoney, offerTotal } from "@/lib/proposal-math"
import { BoPaymentPanel } from "@/components/bo/payment-panel"
import { BoIssuancePanel } from "@/components/bo/issuance-panel"
import { BoTicketBuilder } from "@/components/bo/ticket-builder"
import { BoNoteForm } from "@/components/bo/note-form"
import { BoDatesPanel } from "@/components/bo/dates-panel"
import { BoFreezePanel } from "@/components/bo/freeze-panel"
import {
  BO_TABS,
  BoCaseHeader,
  marketName,
  type BoSellerOption,
  type BoTabId,
} from "@/components/bo/case-header"
import { useI18n, useT } from "@/i18n/provider"
import { LOCALE_TAGS } from "@/i18n/config"
import { translateOr, type Translator } from "@/i18n/translate"

type TabId = BoTabId

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

/*
 * I18N-01 · o tipo de viagem e a classe chegam já escritos em português
 * (`TRIP_LABEL_PT` / `CABIN_LABEL_PT` em bo-queue). O código volta a sair da
 * etiqueta, para o ecrã a poder mostrar na língua do agente.
 */
const TRIP_CODE_BY_LABEL: Record<string, string> = {
  "Ida e volta": "round",
  "Só ida": "oneway",
  "Multi-destino": "multi",
}

const CABIN_CODE_BY_LABEL: Record<string, string> = {
  "Económica": "economy",
  "Económica premium": "premium",
  "Executiva": "business",
  "Primeira": "first",
}

const tripText = (t: Translator, label: string) =>
  TRIP_CODE_BY_LABEL[label] ? t(`bo.caseView.trip.${TRIP_CODE_BY_LABEL[label]}`) : label

const cabinText = (t: Translator, label: string) =>
  CABIN_CODE_BY_LABEL[label] ? t(`bo.caseView.cabin.${CABIN_CODE_BY_LABEL[label]}`) : label

/** O título do acontecimento na língua de quem lê; o guardado se não houver chave. */
const eventTitle = (t: Translator, event: CaseEvent) => {
  /* `seller_assigned` guarda dois títulos: atribuído e removido. */
  const kind =
    event.kind === "seller_assigned" && event.title === "Vendedor removido"
      ? "seller_removed"
      : event.kind
  return translateOr(t, `bo.events.${kind}`, event.title)
}

const LINK_STATE_TONE: Record<LinkState, string> = {
  bloqueado: "var(--muted)",
  aberto: "var(--ok)",
  submetido: "var(--blue)",
  expirado: "var(--ember)",
  fechado: "var(--muted)",
}

const formatDt = (tag: string, iso: string | null | undefined, withTime = true): string => {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(tag, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Atlantic/Cape_Verde",
  })
}

/** As datas na língua do agente, sempre na hora de Cabo Verde. */
function useDt() {
  const { locale } = useI18n()
  return (iso: string | null | undefined, withTime = true) =>
    formatDt(LOCALE_TAGS[locale], iso, withTime)
}

export function BoCaseView({
  detail,
  payment,
  proofs,
  proposal,
  passengers,
  events,
  notifications,
  sellers,
  seats,
  segmentIssuance,
  passengerBaggage,
  hasTicketDocument,
  initialTab,
  viewer,
}: {
  detail: BoCaseDetail
  payment: PcPayment | null
  proofs: PaymentProof[]
  proposal: PublicProposalView | null
  passengers: CasePassenger[]
  events: CaseEvent[]
  /** EM-01 · os lugares por passageiro e por voo já gravados. */
  seats: { passenger_id: string; segment_id: string; seat: string | null }[]
  /** T-04 · os campos do documento já gravados, um por voo. */
  segmentIssuance: SegmentIssuance[]
  /** T-04 · a bagagem já gravada, por passageiro e por voo. */
  passengerBaggage: PassengerBaggage[]
  /** EM-03 · já existe PDF guardado para este caso? */
  hasTicketDocument: boolean
  /** NT-06 · o registo de entrega, que a aba Comunicações mostra. */
  notifications: CaseNotification[]
  /** BO-14 · os vendedores que existem no sistema. */
  sellers: BoSellerOption[]
  initialTab?: string
  viewer: { label: string; email: string }
}) {
  const t = useT()
  const dt = useDt()
  const { locale } = useI18n()
  const [tab, setTab] = useState<TabId>(
    BO_TABS.some((entry) => entry.id === initialTab)
      ? (initialTab as TabId)
      : defaultTab(detail)
  )

  const row = detail.row

  return (
    <>
      {/* BO-08 · o cabeçalho é o mesmo componente que o compositor desenha, e é
          por isso que ele deixou de desaparecer ao entrar lá. */}
      <BoCaseHeader
        detail={detail}
        sellers={sellers}
        active={tab}
        counts={{
          "t-propostas": proposal?.offers.length,
          "t-pax": passengers.length,
          "t-com": notifications.length,
          "t-log": events.length,
        }}
        onSelect={setTab}
      />

      {/* ── PEDIDO ── */}
      {tab === "t-pedido" && (
        <div className="cols two tabpane">
          <aside className="panel sticky">
            <div className="panel-h">
              <h3>{t("bo.caseView.request.title")}</h3>
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
              <Kv k={t("bo.caseView.request.type")} v={tripText(t, detail.trip.tripLabel)} />
              <Kv k={t("bo.caseView.request.depart")} v={dt(row.departDate, false)} mono />
              {row.returnDate && <Kv k={t("bo.caseView.request.return")} v={dt(row.returnDate, false)} mono />}
              {detail.trip.datesChangedAt && (
                <Kv
                  k={t("bo.caseView.request.datesChanged")}
                  v={`${dt(detail.trip.datesChangedAt)} · ${detail.trip.datesChangedBy ?? t("bo.caseView.common.team")}`}
                />
              )}
              <Kv k={t("bo.caseView.request.adults")} v={String(detail.trip.adults)} mono />
              <Kv k={t("bo.caseView.request.children")} v={String(detail.trip.children)} mono />
              <Kv
                k={t("bo.caseView.request.infants")}
                v={t("bo.caseView.request.infantsValue", {
                  seat: detail.trip.infantsInSeat,
                  lap: detail.trip.infantsOnLap,
                })}
                mono
              />
              <Kv k={t("bo.caseView.request.cabin")} v={cabinText(t, detail.trip.cabinLabel)} />
              {/* VIP-10 · o que o cliente pediu em malas. Aqui e no contador da
                  oferta, para que quem cota não tenha de adivinhar. */}
              <Kv
                k={t("bo.caseView.request.baggageHold")}
                v={
                  detail.trip.baggageHold === 0
                    ? t("bo.caseView.request.baggageNone")
                    : t("bo.caseView.request.bags", { count: detail.trip.baggageHold })
                }
                mono
              />
              {detail.trip.legs.length > 0 && (
                <>
                  {detail.trip.legs.map((leg) => (
                    <Kv
                      key={leg.position}
                      k={t("bo.caseView.request.flight", { n: leg.position })}
                      v={`${leg.origin} → ${leg.destination} · ${dt(leg.date, false)}`}
                      mono
                    />
                  ))}
                </>
              )}

              {/*
                FE-05 · os pedidos especiais, na coluna esquerda e debaixo do
                resumo — que é onde o backlog os põe, e é onde quem cota olha
                antes de escrever a proposta.

                É aqui que aparece "não chegar de noite", "viajo com a minha mãe
                em cadeira de rodas" e "tenho de estar em Lisboa antes das 14h".
                Nenhum campo estruturado apanha isto, e é isto que faz a cotação
                certa à primeira.
              */}
              {detail.trip.specialRequests && (
                <div className="note warn" style={{ marginTop: 13 }}>
                  <b>{t("bo.caseView.request.specialRequestsClient")}</b>
                  <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                    {detail.trip.specialRequests}
                  </p>
                </div>
              )}
            </div>
          </aside>

          <main className="stack">
            <div className="panel">
              <div className="panel-h">
                <h3>{t("bo.caseView.contact.title")}</h3>
              </div>
              <div className="panel-b">
                <div className="fgrid">
                  <div className="f s6">
                    <label>{t("bo.caseView.contact.fullName")}</label>
                    <input value={row.clientName} readOnly />
                  </div>
                  <div className="f s6">
                    <label>{t("bo.caseView.contact.phone")}</label>
                    <input className="mono" value={row.clientPhone} readOnly />
                  </div>
                  <div className="f s6">
                    <label>{t("bo.caseView.common.email")}</label>
                    <input value={row.clientEmail} readOnly />
                  </div>
                  <div className="f s6">
                    <label>{t("bo.caseView.contact.consent")}</label>
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

            <BoDatesPanel
              caseId={row.caseId}
              origin={row.origin}
              destination={row.destination}
              departDate={row.departDate}
              returnDate={row.returnDate}
              tripLabel={tripText(t, detail.trip.tripLabel)}
              roundTrip={Boolean(row.returnDate) || detail.trip.tripLabel === "Ida e volta"}
              original={{
                departDate: detail.trip.originalDepartDate,
                returnDate: detail.trip.originalReturnDate,
                changedAt: detail.trip.datesChangedAt,
                changedBy: detail.trip.datesChangedBy,
                reason: detail.trip.datesChangeReason,
              }}
              locked={row.state === "emitido" || row.state === "pago_sem_bilhete"}
              lockedReason={
                row.state === "emitido"
                  ? t("bo.caseView.datesLock.issued")
                  : t("bo.caseView.datesLock.paid")
              }
            />

            <BoNoteForm caseId={row.caseId} notes={detail.notes} />
          </main>
        </div>
      )}

      {/* ── PROPOSTAS ── */}
      {tab === "t-propostas" && (
        <div className="cols two tabpane">
          <aside className="panel sticky">
            <div className="panel-h">
              <h3>{t("bo.caseView.proposals.asideTitle")}</h3>
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
              <Kv k={t("bo.caseView.proposals.dates")} v={`${dt(row.departDate, false)}${row.returnDate ? ` – ${dt(row.returnDate, false)}` : ""}`} mono />
              <Kv k={t("bo.caseView.proposals.passengers")} v={row.paxLabel} />
              <Kv k={t("bo.caseView.request.cabin")} v={cabinText(t, detail.trip.cabinLabel)} />
              <Kv k={t("bo.caseView.proposals.currency")} v={row.currency} mono />
              {/* FE-05 · também aqui: compor a proposta é o momento em que os
                  pedidos especiais mudam o que se escreve. */}
              {detail.trip.specialRequests && (
                <div className="note warn" style={{ marginTop: 12 }}>
                  <b>{t("bo.caseView.proposals.specialRequests")}</b>
                  <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                    {detail.trip.specialRequests}
                  </p>
                </div>
              )}
              {detail.notes[0] && <p className="quote">“{detail.notes[0].body}”</p>}
            </div>
          </aside>

          <main className="stack">
            <div className="panel">
              <div className="panel-h">
                <h3>{t("bo.caseView.proposals.published")}</h3>
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                  {proposal
                    ? t("bo.caseView.proposals.revision", { n: proposal.proposal.revision })
                    : t("bo.caseView.proposals.none")}
                </span>
              </div>
              <div className="panel-b">
                {!proposal ? (
                  <p className="note">
                    {t("bo.caseView.proposals.emptyNote")}
                  </p>
                ) : (
                  <>
                    {proposal.offers.map((offer) => (
                      <div className="orow" key={offer.id}>
                        <div className="oi">
                          <div className="nm">{offer.name || t("bo.caseView.proposals.unnamedOffer")}</div>
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
                        {/* FB-04 · "garantido" aqui dizia o mesmo que dizia ao
                            cliente, e pela mesma razão errada: `valid_until` é
                            uma data escrita à mão. Agora só aparece quando há
                            retenção registada, e diz de onde ela veio — porque
                            uma retenção manual depende de alguém a ter
                            confirmado, e uma do Amadeus não. */}
                        {offer.fare_held_until && offer.fare_held_source && (
                          <span
                            className="flag"
                            aria-pressed="true"
                            style={{
                              background: "var(--grey-bg)",
                              color: "var(--txt-2)",
                              borderColor: "var(--line)",
                            }}
                          >
                            {t("bo.caseView.proposals.heldUntil", {
                              source: offer.fare_held_source,
                              date: dt(offer.fare_held_until),
                            })}
                          </span>
                        )}
                        {proposal.proposal.selected_offer_id === offer.id && (
                          <span className="flag" aria-pressed="true">
                            {t("bo.caseView.proposals.chosen")}
                          </span>
                        )}
                        {/* BO-13 · o mesmo total que o cliente vê, calculado
                            pela mesma função. Estava escrito à mão aqui, e uma
                            segunda cópia da aritmética do preço é uma cópia que
                            diverge — foi por isso que a linha de serviço deixou
                            de aparecer nesta coluna no dia em que mudou. */}
                        <div className="pv mono">
                          {formatMoney(
                            offerTotal(offer, {
                              adults: detail.trip.adults,
                              children: detail.trip.children,
                              infants:
                                detail.trip.infantsInSeat + detail.trip.infantsOnLap,
                            }),
                            proposal.proposal.currency
                          )}
                        </div>
                      </div>
                    ))}
                    {proposal.proposal.selected_at && (
                      <p className="note" style={{ marginTop: 12 }}>
                        {t("bo.caseView.proposals.clientChoseAt", {
                          date: dt(proposal.proposal.selected_at),
                        })}
                      </p>
                    )}
                  </>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {/* BO-09 · "Compor propostas" passa a "Criar proposta". Uma
                      proposta com várias opções continua a ser uma proposta, e
                      o plural fazia crer que se enviavam várias. */}
                  {/*
                    T-01 · sem dono não há caminho para o compositor.

                    O botão era um link para `/ofertas` com o rótulo trocado. O
                    endereço abria — e o que aparecia lá era o painel de
                    reclamar. Funcionava, e continuava a ser uma porta para o
                    compositor num caso sem dono, que é o que o critério manda
                    tirar: "nenhum caminho chega ao compositor num caso não
                    reclamado".

                    Agora reclama-se **aqui**, e só depois se navega. Um caso já
                    reclamado por outra pessoa nunca chega a mudar de página.
                  */}
                  {!row.ownerId ? (
                    <ClaimAndQuote caseId={row.caseId} />
                  ) : (
                    <Link
                      className="btn btn-sm btn-primary"
                      href={`/admin/price-checker/${row.caseId}/ofertas`}
                    >
                      {proposal ? t("bo.caseView.proposals.edit") : t("bo.caseView.proposals.create")}
                    </Link>
                  )}
                  <Link className="btn btn-sm" href={`/pc/${row.token}`} target="_blank">
                    {t("bo.caseView.proposals.viewAsClient")}
                  </Link>
                </div>
              </div>
            </div>

            {/* BO-15 · o voo escolhido congela na fase de pagamento, e o estado
                congelado é visível — não apenas imposto. */}
            <BoFreezePanel
              caseId={row.caseId}
              frozen={Boolean(payment) && Boolean(proposal?.proposal.selected_offer_id)}
              paid={Boolean(payment?.admin_confirmed) || payment?.status === "COMPLETED"}
              issued={Boolean(detail.issuance.issuedAt)}
              offerName={
                proposal?.offers.find(
                  (o) => o.id === proposal.proposal.selected_offer_id
                )?.name ?? null
              }
            />
          </main>
        </div>
      )}

      {/* ── PASSAGEIROS ── */}
      {tab === "t-pax" && (
        <div className="cols two tabpane">
          <aside className="panel sticky">
            <div className="panel-h">
              <h3>{t("bo.caseView.pax.chosenOffer")}</h3>
            </div>
            <div className="panel-b">
              <Kv
                k={t("bo.caseView.pax.offer")}
                v={
                  proposal?.offers.find(
                    (o) => o.id === proposal.proposal.selected_offer_id
                  )?.name ?? "—"
                }
              />
              <Kv k={t("bo.caseView.pax.route")} v={`${row.origin} → ${row.destination}`} mono />
              <Kv
                k={t("bo.caseView.pax.total")}
                v={row.amount ? formatMoney(row.amount, row.currency) : "—"}
                mono
              />
              <Kv k={t("bo.caseView.pax.chosenAt")} v={dt(proposal?.proposal.selected_at)} />
            </div>
          </aside>
          <main className="stack">
            <div className="panel">
              <div className="panel-h">
                <h3>{t("bo.caseView.pax.submittedTitle")}</h3>
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                  {t("bo.caseView.pax.completeCount", {
                    done: passengers.length,
                    total:
                      detail.trip.adults +
                      detail.trip.children +
                      detail.trip.infantsInSeat +
                      detail.trip.infantsOnLap,
                  })}
                </span>
              </div>
              <div className="panel-b">
                {passengers.length === 0 ? (
                  <p className="note">
                    {t("bo.caseView.pax.none")}
                  </p>
                ) : (
                  <>
                    <PassportWarnings passengers={passengers} returnDate={row.returnDate ?? row.departDate} />
                    {/* C-06 · quem muda de tarifa entre a marcação e a partida. */}
                    <FareAgeWarnings
                      passengers={passengers}
                      bookedAt={row.submittedAt}
                      departDate={row.departDate}
                    />
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
          market={marketName(row.market, LOCALE_TAGS[locale])}
          payment={payment}
          proofs={proofs}
          state={row.state}
          viewer={viewer}
        />
      )}

      {/* ── EMISSÃO ── */}
      {tab === "t-emi" && (
        <div className="tabpane" style={{ display: "grid", gap: 14 }}>
          <BoIssuancePanel
            caseId={row.caseId}
            payment={payment}
            passengers={passengers}
            /* EM-01 · os trechos da opção escolhida, para haver um lugar por
               passageiro em cada voo em vez de "ida" e "volta". */
            segments={
              proposal?.offers.find(
                (o) => o.id === proposal.proposal.selected_offer_id
              )?.segments ?? []
            }
            savedSeats={seats}
            savedFlights={segmentIssuance}
            savedBaggage={passengerBaggage}
            issuance={detail.issuance}
            amount={row.amount}
            currency={row.currency}
            hasDocument={hasTicketDocument}
          />
          {/* PC-B · a outra metade do compositor. O construtor de bilhete
              completo continua alcançável — está aqui, no momento em que os
              campos que ele tem fazem falta. */}
          <BoTicketBuilder
            caseId={row.caseId}
            offer={
              proposal?.offers.find(
                (o) => o.id === proposal.proposal.selected_offer_id
              ) ?? null
            }
            issued={Boolean(detail.issuance.issuedAt)}
          />
        </div>
      )}

      {/* ── COMUNICAÇÕES ── */}
      {tab === "t-com" && (
        <div className="cols two tabpane">
          <aside className="panel sticky">
            <div className="panel-h">
              <h3>{t("bo.caseView.com.channels")}</h3>
            </div>
            <div className="panel-b">
              <Kv k={t("bo.caseView.common.whatsapp")} v={row.clientPhone} mono />
              <Kv k={t("bo.caseView.common.email")} v={row.clientEmail} />
              <Kv k={t("bo.caseView.com.language")} v={row.locale} mono />
              <Kv k={t("bo.caseView.com.clientLink")} v={`/pc/${row.token.slice(0, 8)}…`} mono />

              {/*
                C-05 · o estado de cada link, e a última vez que o cliente o abriu.

                O back-office dava um link fechado como aberto. Mostrava-se a
                coluna `case_links.status`, que cinco caminhos diferentes
                escrevem — e um valor com cinco escritores e nenhum dono
                diverge. Agora o que aparece é derivado do estado do caso
                (`deriveLinkState`), e a data é o acesso real e não a primeira
                visita de sempre.
              */}
              <div style={{ marginTop: 13 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: ".1em",
                    color: "var(--muted)",
                    marginBottom: 7,
                  }}
                >
                  {t("bo.caseView.com.linksState")}
                </div>
                {row.links.length === 0 ? (
                  <p className="note">{t("bo.caseView.com.noLinks")}</p>
                ) : (
                  row.links.map((link) => (
                    <div className="kv" key={link.stage}>
                      <span className="kv-k">
                        {translateOr(
                          t,
                          `bo.caseView.com.stage.${link.stage}`,
                          t("bo.caseView.com.stageN", { n: link.stage })
                        )}
                      </span>
                      <span
                        className="kv-v"
                        style={{ color: LINK_STATE_TONE[link.state] }}
                      >
                        {t(`bo.caseView.com.linkState.${link.state}`)}
                        {link.lastOpenedAt
                          ? ` · ${t("bo.caseView.com.openedAt", { date: dt(link.lastOpenedAt) })}`
                          : link.state === "aberto"
                            ? ` · ${t("bo.caseView.com.neverOpened")}`
                            : ""}
                        {link.openCount > 1 ? ` · ${link.openCount}×` : ""}
                      </span>
                    </div>
                  ))
                )}

                {/* Uma divergência não se corrige em silêncio: quem atende tem
                    de saber que a base de dados diz outra coisa. */}
                {row.links.some((link) => link.drifted) && (
                  <p className="note warn" style={{ marginTop: 9 }}>
                    {t("bo.caseView.com.drifted")}
                  </p>
                )}
              </div>
            </div>
          </aside>
          <main className="stack">
            {/*
              NT-06 · o registo de entrega, que é o ponto todo do item.

              "Cada envio fica registado no caso com o seu estado de entrega:
              queued · sent · delivered · bounced." Sem isto o email sai e
              ninguém sabe se chegou — e a equipa descobre que não chegou pelo
              cliente a telefonar a perguntar pela proposta.
            */}
            <div className="panel">
              <div className="panel-h">
                <h3>{t("bo.caseView.com.sent")}</h3>
                <span
                  style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}
                >
                  {t("bo.caseView.com.sends", { count: notifications.length })}
                </span>
              </div>
              <div className="panel-b">
                {notifications.length === 0 ? (
                  <p className="note">
                    {t("bo.caseView.com.noneSent")}
                  </p>
                ) : (
                  notifications.map((entry) => (
                    <NotificationRow key={entry.id} entry={entry} />
                  ))
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">
                <h3>{t("bo.caseView.com.clientDid")}</h3>
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
                        "client_notified",
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
              <h3>{t("bo.caseView.log.thisCase")}</h3>
            </div>
            <div className="panel-b">
              <Kv k={t("bo.caseView.log.created")} v={dt(row.submittedAt)} />
              <Kv k={t("bo.caseView.log.updated")} v={dt(row.updatedAt)} />
              <Kv k={t("bo.caseView.log.token")} v={row.token} mono />
              <p className="note" style={{ marginTop: 12 }}>
                {t("bo.caseView.log.nothingDeleted")}
              </p>
            </div>
          </aside>
          <main className="panel">
            <div className="panel-h">
              <h3>{t("bo.caseView.log.history")}</h3>
              <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                {t("bo.caseView.log.cvTime")}
              </span>
            </div>
            <div className="panel-b">
              <div className="log">
                {events.length === 0 ? (
                  <p className="note">{t("bo.caseView.log.empty")}</p>
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

/**
 * T-01 · reclamar e cotar, por esta ordem e num gesto só.
 *
 * A navegação só acontece se a reclamação passar. Quando outra pessoa chegou
 * primeiro, o que aparece é a frase que o diz — e não o compositor de um caso
 * que já não é de quem está a olhar.
 */
function ClaimAndQuote({ caseId }: { caseId: string }) {
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        className="btn btn-sm btn-primary"
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await boClaimCase(caseId)
            if (!result.ok) {
              setError(result.error)
              return
            }
            router.push(`/admin/price-checker/${caseId}/ofertas`)
          })
        }}
      >
        {pending ? t("bo.caseView.proposals.claiming") : t("bo.caseView.proposals.claimAndQuote")}
      </button>
      {error && (
        <span className="note bad" style={{ width: "100%" }}>
          {error}
        </span>
      )}
    </>
  )
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className={`kv-v${mono ? " mono" : ""}`}>{v}</span>
    </div>
  )
}

/**
 * NT-06 · uma linha do registo de entrega.
 *
 * O estado é a informação: `sent` diz que o fornecedor aceitou, `delivered` que
 * o servidor do destinatário aceitou, `bounced` que recusou de vez. São três
 * coisas diferentes e só a segunda responde a "chegou?".
 */
const DELIVERY_TONE: Record<string, string> = {
  queued: "var(--muted)",
  sent: "var(--blue)",
  delivered: "var(--ok)",
  bounced: "var(--ember)",
  failed: "var(--ember)",
  skipped: "var(--muted)",
}

function NotificationRow({ entry }: { entry: CaseNotification }) {
  const t = useT()
  const dt = useDt()
  const when = entry.delivered_at ?? entry.sent_at ?? entry.created_at
  return (
    <div
      className="note"
      style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}
    >
      <span style={{ flex: 1 }}>
        <b>{translateOr(t, `bo.caseView.com.notificationKind.${entry.kind}`, entry.kind)}</b>
        {" · "}
        <span className="mono" style={{ fontSize: 11 }}>
          {entry.channel}
        </span>
        <br />
        <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
          {entry.recipient} · {dt(when)}
          {entry.subject ? ` · ${entry.subject}` : ""}
        </span>
        {entry.body && (
          <>
            <br />
            <span style={{ fontSize: 11.5, whiteSpace: "pre-wrap" }}>
              “{entry.body.slice(0, 300)}”
            </span>
          </>
        )}
        {entry.last_error && (
          <>
            <br />
            <span style={{ color: "var(--ember)", fontSize: 11 }}>
              {entry.last_error}
            </span>
          </>
        )}
      </span>
      <span
        className="st state"
        style={{
          color: DELIVERY_TONE[entry.status] ?? "var(--muted)",
          whiteSpace: "nowrap",
        }}
      >
        {translateOr(t, `bo.caseView.com.delivery.${entry.status}`, entry.status)}
        {entry.attempts > 1 ? ` · ${entry.attempts}×` : ""}
      </span>
    </div>
  )
}

function LogRow({ event }: { event: CaseEvent }) {
  const t = useT()
  const { locale } = useI18n()
  return (
    <div className="logrow">
      <span className="t mono">
        {new Date(event.created_at).toLocaleString(LOCALE_TAGS[locale], {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Atlantic/Cape_Verde",
        })}
      </span>
      <div>
        <b>{eventTitle(t, event)}</b>
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
  const t = useT()
  const warnings: string[] = []

  passengers.forEach((p, index) => {
    if (p.passport_expiry && returnDate) {
      const needed = new Date(returnDate)
      needed.setMonth(needed.getMonth() + 6)
      if (Date.parse(p.passport_expiry) < needed.getTime()) {
        warnings.push(
          t("bo.caseView.warnings.passportShort", { n: index + 1, date: p.passport_expiry })
        )
      }
    }
    const raw = `${p.first_name} ${p.last_name}`
    if (/[^\x20-\x7E]/.test(raw)) {
      warnings.push(
        t("bo.caseView.warnings.accents", { n: index + 1, name: raw })
      )
    }
  })

  if (!warnings.length) {
    return (
      <p className="note ok" style={{ marginBottom: 13 }}>
        {t("bo.caseView.warnings.none")}
      </p>
    )
  }

  return (
    <div className="note warn" style={{ marginBottom: 13 }}>
      <b>{t("bo.caseView.warnings.checkBeforeIssue")}</b>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * C-06 · o passageiro que muda de tarifa antes de partir.
 *
 * "Um alerta dispara se uma criança fizer 12 anos entre a marcação e a
 * partida." É o erro que só se descobre ao balcão: o tipo do passageiro foi
 * decidido no dia do pedido, a companhia decide-o no dia do voo, e entre os
 * dois há um aniversário. A tarifa de criança deixa de ser válida e o bilhete
 * tem de ser reemitido — com o preço de adulto e a taxa de alteração.
 *
 * A fronteira dos 2 anos aparece pela mesma razão: um bebé de colo que faz 2
 * anos passa a ocupar lugar, e um lugar que ninguém reservou não existe.
 */
function FareAgeWarnings({
  passengers,
  bookedAt,
  departDate,
}: {
  passengers: CasePassenger[]
  bookedAt: string
  departDate: string
}) {
  const t = useT()
  const dt = useDt()
  if (!departDate) return null

  const booking = bookedAt.slice(0, 10)
  const travel = departDate.slice(0, 10)

  const changes = passengers.flatMap((p, index) => {
    if (!p.birth_date) return []
    const change = fareAgeChange(p.birth_date, booking, travel)
    if (!change) return []
    return [
      {
        tag: `P${index + 1}`,
        name: `${p.last_name}/${p.first_name}`.toUpperCase(),
        change,
      },
    ]
  })

  if (changes.length === 0) return null

  const label = (type: string) => translateOr(t, `bo.caseView.fareAge.type.${type}`, type)

  return (
    <div className="note bad" style={{ marginBottom: 13 }}>
      <b>{t("bo.caseView.fareAge.title")}</b>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {changes.map((entry) => (
          <li key={entry.tag}>
            {t("bo.caseView.fareAge.lineStart", {
              tag: entry.tag,
              name: entry.name,
              turns: entry.change.turns,
              date: dt(departDate, false),
            })}{" "}
            <b>{label(entry.change.to)}</b>{" "}
            {t("bo.caseView.fareAge.lineMid", { from: label(entry.change.from) })}{" "}
            {entry.change.to === "adult"
              ? t("bo.caseView.fareAge.adultTail")
              : t("bo.caseView.fareAge.seatTail")}
          </li>
        ))}
      </ul>
    </div>
  )
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
  const t = useT()
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
          {translateOr(t, `bo.caseView.pax.type.${passenger.passenger_type}`, passenger.passenger_type)}
          {index === 0 ? ` · ${t("bo.caseView.pax.holder")}` : ""}
        </span>
      </div>
      <div className="paxgrid">
        <div>
          <span className="k">{t("bo.caseView.pax.birth")}</span>
          <span className="v mono">{passenger.birth_date ?? "—"}</span>
        </div>
        <div>
          <span className="k">{t("bo.caseView.pax.sex")}</span>
          <span className="v">
            {passenger.gender === "f"
              ? t("bo.caseView.pax.female")
              : passenger.gender === "m"
                ? t("bo.caseView.pax.male")
                : "—"}
          </span>
        </div>
        <div>
          <span className="k">{t("bo.caseView.pax.nationality")}</span>
          <span className="v">{passenger.nationality ?? "—"}</span>
        </div>
        <div>
          <span className="k">{t("bo.caseView.pax.passport")}</span>
          <span className="v mono">{passenger.passport_number ?? "—"}</span>
        </div>
        <div>
          <span className="k">{t("bo.caseView.pax.validUntil")}</span>
          <span className={`v mono${flaggedExpiry ? " flagged" : ""}`}>
            {passenger.passport_expiry ?? "—"}
            {flaggedExpiry ? " ⚠" : ""}
          </span>
        </div>
        <div>
          <span className="k">{t("bo.caseView.pax.issuingCountry")}</span>
          <span className="v">{passenger.issuing_country ?? "—"}</span>
        </div>
        <div>
          <span className="k">{t("bo.caseView.pax.ticketName")}</span>
          <span className={`v${accent ? " flagged" : ""}`}>
            {accent
              ? `${passenger.first_name} ${passenger.last_name}`
                  .normalize("NFD")
                  .replace(/[̀-ͯ]/g, "")
                  .toUpperCase() + ` · ${t("bo.caseView.pax.noAccents")}`
              : t("bo.caseView.pax.ok")}
          </span>
        </div>
        <div>
          <span className="k">{t("bo.caseView.pax.ticket")}</span>
          <span className="v mono">{passenger.ticket_number ?? "—"}</span>
        </div>
      </div>
    </div>
  )
}
