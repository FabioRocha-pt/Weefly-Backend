"use client"

/**
 * WeeFly Price Checker — os ecrãs de estado: P3, P4a, P4b, P7b, P8 e P9.
 *
 * Todos têm a mesma forma — um cabeçalho, o resumo do pedido, o tracker e uma
 * caixa de contacto — e todos derivam do mesmo estado. O que muda é o que o
 * cliente pode fazer a partir de cada um.
 */

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { cancelPcRequest, requestPcResearch } from "@/actions/pc"
import type { PcState } from "@/lib/pc/state"
import { selectedOfferOf } from "@/components/pc/offer-view"
import {
  clockOf,
  fmtRange,
  fmtDate,
  money,
  paxFull,
  paxShort,
  phoneDisplay,
  whenLabel,
  CABIN_LABEL,
} from "@/lib/pc/format"
import {
  METHOD_LABEL,
  PROOF_REVIEW_HOURS,
  baggageLabel,
  type PayMethodId,
} from "@/lib/pc/catalog"
import { priceNature } from "@/lib/proposal-math"
import {
  IcBigCheck,
  IcCancelled,
  IcDownload,
  IcExpired,
  IcHourglass,
  IcNext,
  IcWa,
  RouteSummary,
  Rows,
  SummaryRows,
  Track,
} from "@/components/pc/bits"
import { CopyButton, WaButton, useToast } from "@/components/pc/chrome"
import { useT } from "@/i18n/provider"
import type { Translator } from "@/i18n/translate"

// ── P3 · pedido recebido ─────────────────────────────────────────────────────

export function ScreenP3({ state }: { state: PcState }) {
  const t = useT()
  const phone = phoneDisplay(state.contact.dialCode, state.contact.phone)

  return (
    <main className="shell view">
      <div className="card p3top">
        <div className="done-badge">
          <IcBigCheck />
        </div>
        <h2>
          {t("pc.status.receivedHeading")}
          <em>{state.contact.firstName || "—"}</em>
        </h2>
        <p>{t("pc.status.receivedBody")}</p>
        <div className="refbox">
          <span>{t("pc.status.yourReference")}</span>
          <b className="mono">{state.request.reference}</b>
          <CopyButton
            value={state.request.reference}
            label={t("pc.status.copyReference")}
          />
        </div>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>Your request</h3>
          <span className="rt">{whenLabel(state.request.createdAt)}</span>
        </div>
        <div className="sumroute">
          <RouteSummary request={state.request} />
        </div>
        <div className="sumrows">
          <SummaryRows request={state.request} contact={state.contact} withContact />
        </div>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>Request status</h3>
          <span className="rt" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {state.cancelled ? (
              <span style={{ color: "var(--ember)", fontWeight: 700 }}>
                {t("pc.status.cancelled")}
              </span>
            ) : (
              <>
                <span className="pulse" />
                {t("pc.status.inProgress")}
              </>
            )}
          </span>
        </div>
        <Track state={state} />
        <p className="eta">
          {t("pc.status.etaBefore")}
          <b>{t("pc.status.etaBold")}</b>
          {t("pc.status.etaAfter")}
          <b className="mono">{phone}</b>.
          <br />
          {t("pc.status.etaComeBack", {
            bold: t("pc.status.etaComeBackBold"),
          })}
        </p>
      </div>

      <InstallCard />

      <ContactCard state={state} showCancel />
      <div className="spacer" />
    </main>
  )
}

// ── P4a · à espera ───────────────────────────────────────────────────────────

export function ScreenP4a({ state }: { state: PcState }) {
  const t = useT()
  const phone = phoneDisplay(state.contact.dialCode, state.contact.phone)

  return (
    <main className="shell view">
      <section className="hero">
        <span className="eyebrow">{t("pc.status.searchingEyebrow")}</span>
        <h1>
          {t("pc.status.searchingBefore")}
          <em>{t("pc.status.searchingEm")}</em>
        </h1>
        <p>
          {t("pc.status.welcomeBack")}
          {state.contact.firstName ? `, ${state.contact.firstName}` : ""}.{" "}
          {t("pc.status.searchingBody")}
        </p>
      </section>

      {/*
        FE-06 · o resumo do pedido vem antes do tracker.

        A ordem estava ao contrário, e o raciocínio do backlog é o de quem
        volta ao link dias depois: primeiro quer confirmar *"é esta a viagem
        que pedi?"* e só depois *"em que ponto está?"*. Ver a mesma troca nos
        restantes ecrãs de estado.
      */}
      <div className="card">
        <div className="sechead">
          <h3>Your request</h3>
          <span className="rt">{whenLabel(state.request.createdAt)}</span>
        </div>
        <div className="sumroute">
          <RouteSummary request={state.request} />
        </div>
        <div className="sumrows">
          <SummaryRows request={state.request} />
        </div>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>Request status</h3>
          <span className="rt" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className="pulse" />
            in progress
          </span>
        </div>
        <Track state={state} />
        <p className="eta">
          {t("pc.status.etaBefore")}
          <b>{t("pc.status.etaBold")}</b>.{" "}
          {t("pc.status.etaAlso", { phone })}
        </p>
      </div>

      <ContactCard state={state} showCancel />
      <div className="spacer" />
    </main>
  )
}

// ── P4b · opções prontas ─────────────────────────────────────────────────────

export function ScreenP4b({ state, onSeeOptions }: { state: PcState; onSeeOptions: () => void }) {
  const t = useT()
  const count = state.offers.length
  /* FB-04 · só é "garantido" o que a companhia está mesmo a segurar. */
  const guaranteed = state.offers.some(
    (o) => priceNature(o, state.proposalPublishedAt) === "guaranteed"
  )

  return (
    <main className="shell view">
      <section className="hero">
        <span className="eyebrow">{t("pc.status.searchingEyebrow")}</span>
        <h1>
          {t("pc.status.readyBefore")}
          <em>{t("pc.status.readyEm")}</em>
        </h1>
      </section>

      <div className="banner ok">
        <span className="ic">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12.5l5 5L20 6.5"
              stroke="#0E7A5B"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <b>
            {count === 1
              ? t("pc.status.foundOne")
              : t("pc.status.foundMany", { count })}
          </b>
          <p>
            {count === 1
              ? t("pc.status.alsoSentOne")
              : t("pc.status.alsoSentMany")}
            {guaranteed ? t("pc.status.oneHeld") : t("pc.status.reconfirmed")}
          </p>
        </div>
      </div>

      <div className="card tight" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="button" onClick={onSeeOptions}>
          {t("pc.status.seeOptions")}
          <IcNext />
        </button>
      </div>

      {/* FE-06 · o resumo primeiro, o tracker a seguir. */}
      <div className="card">
        <div className="sechead">
          <h3>Your request</h3>
        </div>
        <div className="sumroute">
          <RouteSummary request={state.request} />
        </div>
        <div className="sumrows">
          <SummaryRows request={state.request} />
        </div>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>Request status</h3>
          <span className="rt">
            {state.proposalPublishedAt
              ? t("pc.status.updatedAt", {
                  time: clockOf(state.proposalPublishedAt),
                })
              : "—"}
          </span>
        </div>
        <Track state={state} />
      </div>
      <div className="spacer" />
    </main>
  )
}

// ── P7b · em verificação, ou pago à espera do bilhete ────────────────────────

export function ScreenP7b({ state }: { state: PcState }) {
  const t = useT()
  const payment = state.payment
  const paid = Boolean(payment?.admin_confirmed) || payment?.status === "COMPLETED"
  const offer = selectedOfferOf(state)
  const phone = phoneDisplay(state.contact.dialCode, state.contact.phone)
  const proof = state.proofs[0]

  const rows: [string, string][] = [
    [t("pc.status.rowOption"), offer?.name || "—"],
    [
      t("pc.status.rowAmount"),
      payment ? money(payment.amount, payment.currency) : "—",
    ],
    [
      t("pc.status.rowMethod"),
      payment?.method
        ? `${METHOD_LABEL[payment.method as PayMethodId] ?? payment.method}${
            payment.pay_provider ? ` · ${payment.pay_provider}` : ""
          }`
        : "—",
    ],
    [
      t("pc.status.rowProof"),
      proof
        ? `${proof.file_name} · ${Math.max(1, Math.round(proof.size_bytes / 1024))} KB`
        : t("pc.status.rowProofNotNeeded"),
    ],
    [
      t("pc.status.rowPassengers"),
      state.passengers
        .map((p) => `${p.last_name}/${p.first_name}`.toUpperCase())
        .join(", ") || "—",
    ],
    [
      t("pc.status.rowSent"),
      whenLabel(payment?.client_declared_paid_at ?? proof?.created_at ?? null),
    ],
  ]

  return (
    <main className="shell view">
      <div className="hero-c">
        <div className="badge ok">{paid ? <IcBigCheck size={26} /> : <IcHourglass />}</div>
        <h2>
          {paid ? (
            <>
              {t("pc.status.paidHeading")}
              <em>{t("pc.status.paidHeadingEm")}</em>
            </>
          ) : (
            <>
              {t("pc.status.checkingHeading")}
              <em>{t("pc.status.checkingHeadingEm")}</em>
            </>
          )}
        </h2>
        <p>{paid ? t("pc.status.paidBody") : t("pc.status.checkingBody")}</p>
        <div className="codebox" style={{ justifyContent: "center" }}>
          <div>
            <span>{t("pc.status.request")}</span>
            <b>{state.request.reference}</b>
          </div>
        </div>
      </div>

      {/* FE-06 · o resumo do pedido antes do tracker, em todos os estados. */}
      <div className="card">
        <div className="sechead">
          <h3>Your request</h3>
          <span className="rt">{whenLabel(state.request.createdAt)}</span>
        </div>
        <div className="sumroute">
          <RouteSummary request={state.request} />
        </div>
        <div className="sumrows">
          <SummaryRows request={state.request} />
        </div>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>Request status</h3>
          <span className="rt" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className="pulse" />
            {paid
              ? t("pc.status.issuingTickets")
              : t("pc.status.checkingPayment")}
          </span>
        </div>
        <Track state={state} />
        <p className="eta">
          {paid ? (
            t("pc.status.etaIssuing", { phone })
          ) : (
            <>
              {t("pc.status.etaCheckingBefore")}
              <b>{t("pc.status.etaCheckingBold")}</b>
              {payment?.review_deadline_at
                ? t("pc.status.etaCheckingWithin", {
                    hours: PROOF_REVIEW_HOURS,
                  })
                : null}
              {t("pc.status.etaCheckingAfter", { phone })}
            </>
          )}
        </p>
      </div>

      {payment?.proof_status === "rejeitado" && payment.proof_rejected_reason && (
        <div className="card">
          <div className="sechead">
            <h3>{t("pc.status.needAnotherProof")}</h3>
          </div>
          <p className="notice">{payment.proof_rejected_reason}</p>
        </div>
      )}

      <div className="card">
        <div className="sechead">
          <h3>{t("pc.status.whatYouSent")}</h3>
        </div>
        <div className="sumrows">
          <Rows rows={rows} />
        </div>
        {!paid && (
          <div style={{ marginTop: 12 }}>
            <a
              className="btn btn-ghost btn-sm"
              style={{ width: "100%" }}
              href={`/pc/${state.token}?view=p7`}
            >
              {t("pc.status.goBackCorrect")}
            </a>
          </div>
        )}
      </div>

      <ContactCard state={state} />
      <div className="spacer" />
    </main>
  )
}

// ── P8 · expirado ────────────────────────────────────────────────────────────

export function ScreenP8({ state }: { state: PcState }) {
  const router = useRouter()
  const toast = useToast()
  const t = useT()
  const [pending, startTransition] = useTransition()

  const lastTotal = state.offers.length
    ? state.totals[state.offers[0].id]
    : null

  const rows: [string, string][] = [
    [
      t("pc.status.rowDates"),
      state.request.trip === "multi"
        ? state.request.legs.map((l) => fmtDate(l.date)).join(" · ")
        : fmtRange(
            state.request.departDate,
            state.request.trip === "round" ? state.request.returnDate : null
          ),
    ],
    [t("pc.status.rowPassengers"), paxFull(state.request)],
    [t("pc.status.rowCabin"), CABIN_LABEL[state.request.cabin]],
    [
      t("pc.status.rowLastOption"),
      state.proposalPublishedAt && lastTotal
        ? `${whenLabel(state.proposalPublishedAt)} · ${money(lastTotal, state.request.currency)}`
        : "—",
    ],
  ]

  const overdueOnUs = state.expiry.cause === "review_overdue"

  return (
    <main className="shell view">
      <div className="hero-c">
        <div className="badge warn">
          <IcExpired />
        </div>
        <h2>
          {overdueOnUs
            ? t("pc.status.windowClosed")
            : t("pc.status.optionsExpired")}
        </h2>
        <p>
          {overdueOnUs
            ? t("pc.status.windowClosedBody")
            : t("pc.status.optionsExpiredBody")}
        </p>
        <div className="codebox" style={{ justifyContent: "center" }}>
          <div>
            <span>{t("pc.status.request")}</span>
            <b>{state.request.reference}</b>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>{t("pc.status.whatYouAsked")}</h3>
        </div>
        <div className="sumroute">
          <RouteSummary request={state.request} />
        </div>
        <div className="sumrows">
          <Rows rows={rows} />
        </div>
      </div>

      <div className="card tight">
        <button
          className="btn btn-primary"
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await requestPcResearch(state.token)
              if (result.ok) {
                toast(t("pc.status.searchingAgain"))
                router.refresh()
              } else {
                toast(result.error)
              }
            })
          }
        >
          {pending ? t("pc.status.sending") : t("pc.status.searchAgain")}
        </button>
        <p className="subnote">{t("pc.status.sameDates")}</p>
        <div style={{ marginTop: 12 }}>
          <a
            className="btn btn-ghost btn-sm"
            style={{ width: "100%" }}
            href="/pc"
          >
            {t("pc.status.changeDates")}
          </a>
        </div>
        <div style={{ marginTop: 9 }}>
          <WaButton
            reference={state.request.reference}
            className="btn btn-ghost btn-sm"
            style={{ width: "100%" }}
          >
            {t("pc.status.messageTeam")}
          </WaButton>
        </div>
      </div>
      <div className="spacer" />
    </main>
  )
}

// ── P9 · emitido ─────────────────────────────────────────────────────────────

export function ScreenP9({ state }: { state: PcState }) {
  const t = useT()
  const offer = selectedOfferOf(state)

  return (
    <main className="shell view">
      <div className="hero-c">
        <div className="badge ok">
          <IcBigCheck size={26} />
        </div>
        <h2>
          {t("pc.status.issuedHeading")}
          <em>{t("pc.status.issuedHeadingEm")}</em>
        </h2>
        <p>{t("pc.status.issuedBody", { email: state.contact.email })}</p>
        <div className="codebox">
          <div>
            <span>{t("pc.status.bookingReference")}</span>
            <b>{state.issued.pnr ?? "—"}</b>
          </div>
          <div>
            <span>{t("pc.status.weeflyReference")}</span>
            <b style={{ fontSize: 15 }}>{state.request.reference}</b>
          </div>
        </div>
      </div>

      {/*
        FE-07 · the ticket lives in the link, not only in the email.

        These were buttons that popped a toast saying an agent would send the
        PDF by hand. Now they are links to a route that streams the document
        that was generated at issuance — the very same file the customer got
        attached, with the same document number. Available for as long as the
        link is, which is the point: an inbox from six months ago is not where
        anyone looks from an airport queue.
      */}
      <div className="card tight">
        {state.issued.documentReady ? (
          <>
            <a
              className="btn btn-primary"
              href={`/api/pc/${state.token}/ticket`}
              target="_blank"
              rel="noreferrer"
            >
              <IcDownload />
              {t("pc.status.downloadAll")}
            </a>
            <p className="subnote" id="dlSub">
              {state.passengers.length === 1
                ? t("pc.status.onePdfOne")
                : t("pc.status.onePdfMany", {
                    count: state.passengers.length,
                  })}
            </p>
            <div style={{ marginTop: 10 }}>
              <a
                className="btn btn-ghost btn-sm"
                style={{ width: "100%" }}
                href={`/api/pc/${state.token}/ticket?guide=1`}
                target="_blank"
                rel="noreferrer"
              >
                {t("pc.status.howToRead")}
              </a>
            </div>
          </>
        ) : (
          <p className="notice">{t("pc.status.pdfComing")}</p>
        )}
      </div>

      <div className="card">
        <div className="sechead">
          <h3>{t("pc.status.ticketsByPassenger")}</h3>
          <span className="rt">{paxShort(state.request)}</span>
        </div>
        {state.passengers.map((p, i) => (
          <div className="tk" key={p.id}>
            <span className={`paxtag${p.passenger_type === "adult" ? "" : " child"}`}>
              P{i + 1}
            </span>
            <span className="nm">
              {`${p.last_name}/${p.first_name}`.toUpperCase()}
              <span className="no">{p.ticket_number ?? "—"}</span>
            </span>
            {state.issued.documentReady ? (
              <a
                className="dl"
                /* Com um passageiro só não há PDF individual: seria o mesmo
                   ficheiro com outro nome. O link vai para o combinado. */
                href={
                  state.issued.documentsByPassenger.includes(p.id)
                    ? `/api/pc/${state.token}/ticket?pax=${p.id}`
                    : `/api/pc/${state.token}/ticket`
                }
                target="_blank"
                rel="noreferrer"
              >
                PDF
              </a>
            ) : (
              <span className="dl" style={{ opacity: 0.45 }}>
                PDF
              </span>
            )}
          </div>
        ))}
      </div>

      {/*
        FE-07 · "the same content rendered on screen, readable without
        downloading". This is that: flight by flight, with each passenger's tag,
        ticket number and seat on that flight — the same three things the PDF
        repeats inside every flight, for the same reason.
      */}
      {offer && (
        <div className="card">
          <div className="sechead">
            <h3>{t("pc.status.ticketOnScreen")}</h3>
            <span className="rt mono">{state.issued.pnr ?? "—"}</span>
          </div>
          {[...offer.segments]
            .sort(
              (a, b) =>
                (a.direction === b.direction ? 0 : a.direction === "ida" ? -1 : 1) ||
                a.position - b.position
            )
            .map((segment) => (
              <div className="tkseg" key={segment.id} style={{ marginTop: 12 }}>
                <div className="sechead" style={{ marginBottom: 6 }}>
                  <h3 style={{ fontSize: 13 }}>
                    {[segment.carrier_code, segment.flight_number]
                      .filter(Boolean)
                      .join(" ")}{" "}
                    · {segment.origin} → {segment.destination}
                  </h3>
                  <span className="rt mono">
                    {segment.depart_at?.slice(11, 16) ?? "--:--"} →{" "}
                    {segment.arrive_at?.slice(11, 16) ?? "--:--"}
                  </span>
                </div>
                {state.passengers.map((p, i) => (
                  <div className="tk" key={`${segment.id}-${p.id}`}>
                    <span
                      className={`paxtag${p.passenger_type === "adult" ? "" : " child"}`}
                    >
                      P{i + 1}
                    </span>
                    <span className="nm">
                      {`${p.last_name}/${p.first_name}`.toUpperCase()}
                      <span className="no">{p.ticket_number ?? "—"}</span>
                    </span>
                    <span className="mono" style={{ fontSize: 12.5 }}>
                      {state.seats.find(
                        (s) => s.passenger_id === p.id && s.segment_id === segment.id
                      )?.seat ?? t("pc.status.seatAtCheckIn")}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          <div className="sumrows" style={{ marginTop: 14 }}>
            <Rows rows={itineraryRows(state, t)} />
          </div>
        </div>
      )}

      <div className="card">
        <div className="sechead">
          <h3>{t("pc.status.beforeYouTravel")}</h3>
        </div>
        <div className="sumrows">
          <Rows
            rows={[
              [t("pc.status.checkInOpens"), t("pc.status.checkInValue")],
              [
                t("pc.status.atTheAirport"),
                t("pc.status.atTheAirportValue", {
                  origin: state.request.origin,
                }),
              ],
              [
                t("pc.status.baggageIncluded"),
                /* FB-03 · da contagem. O texto antigo continua a servir as
                   ofertas anteriores à migração 0012; sem nenhum dos dois, a
                   linha manda ler o bilhete em vez de afirmar um número. */
                offer?.baggage_hold_count != null
                  ? baggageLabel(offer.baggage_hold_count)
                  : (offer?.baggage_hold ?? t("pc.status.seeYourTicket")),
              ],
              [t("pc.status.documents"), t("pc.status.documentsValue")],
            ]}
          />
        </div>
        <p className="notice" style={{ marginTop: 12 }}>
          {t("pc.status.guideNote")}
        </p>
      </div>

      <ContactCard state={state} />
      <div className="spacer" />
    </main>
  )
}

function itineraryRows(state: PcState, t: Translator): [string, string][] {
  const offer = selectedOfferOf(state)
  if (!offer) return []
  const rows: [string, string][] = []
  for (const direction of ["ida", "volta"] as const) {
    const segments = offer.segments
      .filter((s) => s.direction === direction)
      .sort((a, b) => a.position - b.position)
    if (!segments.length) continue
    const first = segments[0]
    const last = segments[segments.length - 1]
    rows.push([
      t(direction === "ida" ? "pc.status.outbound" : "pc.status.return"),
      `${first.origin} ${first.depart_at?.slice(11, 16) ?? "--:--"} → ${
        last.destination
      } ${last.arrive_at?.slice(11, 16) ?? "--:--"}${
        segments.length > 1 ? t("pc.status.oneStop") : t("pc.status.nonStop")
      }`,
    ])
  }
  return rows
}

// ── peças partilhadas ────────────────────────────────────────────────────────

/**
 * A caixa de contacto, com o cancelamento onde o mockup o põe: escondido atrás
 * de um painel, com um motivo opcional e uma confirmação.
 */
function ContactCard({
  state,
  showCancel = false,
}: {
  state: PcState
  showCancel?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  const cancelled = state.cancelled

  return (
    <div className="card tight">
      <WaButton reference={state.request.reference}>
        <IcWa />
        {t("pc.status.messageWhatsApp")}
      </WaButton>
      <p className="subnote">{t("pc.status.opensChat")}</p>

      {showCancel && !cancelled && (
        <>
          <div className="rowbtn" style={{ marginTop: 14 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: "100%" }}
              type="button"
              onClick={() => setOpen(true)}
            >
              {t("pc.status.cancelRequest")}
            </button>
          </div>

          <div className={`cancelpanel${open ? " on" : ""}`}>
            <h4>{t("pc.status.cancelTitle")}</h4>
            <p>{t("pc.status.cancelBody")}</p>
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="" disabled>
                {t("pc.status.cancelReason")}
              </option>
              <option>{t("pc.status.reasonBooked")}</option>
              <option>{t("pc.status.reasonPlans")}</option>
              <option>{t("pc.status.reasonDates")}</option>
              <option>{t("pc.status.reasonSlow")}</option>
              <option>{t("pc.status.reasonOther")}</option>
            </select>
            <div className="rowbtn">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => setOpen(false)}
              >
                {t("pc.status.keepRequest")}
              </button>
              <button
                className="btn btn-sm danger"
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await cancelPcRequest(state.token, reason)
                    setOpen(false)
                    if (result.ok) {
                      toast(t("pc.status.cancelledToast"))
                      router.refresh()
                    } else {
                      toast(result.error)
                    }
                  })
                }
              >
                {t("pc.status.yesCancel")}
              </button>
            </div>
          </div>
        </>
      )}

      {cancelled && (
        <div style={{ marginTop: 14 }}>
          <div className="cancelled">
            <IcCancelled />
            <div>
              <b>{t("pc.status.cancelledBold")}</b>
              {t("pc.status.cancelledRest", {
                reference: state.request.reference,
              })}
            </div>
          </div>
          <a
            className="btn btn-ghost btn-sm"
            style={{ width: "100%", marginTop: 11 }}
            href="/pc"
          >
            {t("pc.status.startNew")}
          </a>
        </div>
      )}
    </div>
  )
}

/**
 * O convite a guardar a WeeFly no telefone.
 *
 * Só aparece quando é verdade que dá: no Android e no desktop depende de o
 * browser ter oferecido o `beforeinstallprompt`, e no iOS as três instruções do
 * Safari funcionam sempre. Fora disso a caixa não é mostrada — um botão
 * "Instalar" que não instala nada custa mais confiança do que ganha.
 */
function InstallCard() {
  const t = useT()
  const [platform, setPlatform] = useState<"ios" | "prompt" | "installed" | null>(null)
  const [deferred, setDeferred] = useState<any>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    if (standalone) {
      setPlatform("installed")
      return
    }

    const ua = navigator.userAgent
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

    if (isIos) setPlatform("ios")

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event)
      setPlatform("prompt")
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  if (!platform) return null

  if (platform === "installed") {
    return (
      <div className="install">
        <div className="installed">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12.5l5 5L20 6.5"
              stroke="#0E7A5B"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("pc.install.saved")}
        </div>
      </div>
    )
  }

  if (platform === "ios") {
    return (
      <div className="install">
        <div className="ih">
          <div>
            <h3>{t("pc.install.iosTitle")}</h3>
            <p>{t("pc.install.iosBody")}</p>
          </div>
        </div>
        <p className="why">
          <b>{t("pc.install.whyBold")}</b>
          {t("pc.install.iosWhy")}
        </p>
        <div className="tut">
          <div className="tutrow">
            <span className="n">1</span>
            <span className="t">
              {t("pc.install.step1", { b: t("pc.install.step1b") })}
            </span>
          </div>
          <div className="tutrow">
            <span className="n">2</span>
            <span className="t">
              {t("pc.install.step2", { b: t("pc.install.step2b") })}
            </span>
          </div>
          <div className="tutrow">
            <span className="n">3</span>
            <span className="t">
              {t("pc.install.step3", { b: t("pc.install.step3b") })}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="install">
      <div className="ih">
        <div>
          <h3>{t("pc.install.title")}</h3>
          <p>{t("pc.install.body")}</p>
        </div>
      </div>
      <p className="why">
        <b>{t("pc.install.whyBold")}</b>
        {t("pc.install.why")}
      </p>
      <button
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        type="button"
        onClick={async () => {
          if (!deferred) return
          deferred.prompt()
          const choice = await deferred.userChoice
          setDeferred(null)
          if (choice?.outcome === "accepted") setPlatform("installed")
        }}
      >
        <IcDownload />
        {t("pc.install.install")}
      </button>
    </div>
  )
}
