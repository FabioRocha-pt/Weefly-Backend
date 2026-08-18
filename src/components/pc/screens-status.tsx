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
import { METHOD_LABEL, PROOF_REVIEW_HOURS, type PayMethodId } from "@/lib/pc/catalog"
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

// ── P3 · pedido recebido ─────────────────────────────────────────────────────

export function ScreenP3({ state }: { state: PcState }) {
  const phone = phoneDisplay(state.contact.dialCode, state.contact.phone)

  return (
    <main className="shell view">
      <div className="card p3top">
        <div className="done-badge">
          <IcBigCheck />
        </div>
        <h2>
          Request received, <em>{state.contact.firstName || "—"}</em>
        </h2>
        <p>
          Our team is already searching for the best fare. Keep this link: you
          can come back any time to see the status of your request.
        </p>
        <div className="refbox">
          <span>Your reference</span>
          <b className="mono">{state.request.reference}</b>
          <CopyButton value={state.request.reference} label="Copy reference" />
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
              <span style={{ color: "var(--ember)", fontWeight: 700 }}>cancelled</span>
            ) : (
              <>
                <span className="pulse" />
                in progress
              </>
            )}
          </span>
        </div>
        <Track state={state} />
        <p className="eta">
          We normally reply in <b>under 2 business hours</b>. As soon as your
          options are ready we will let you know on <b className="mono">{phone}</b>.
          <br />
          You can also <b>come back to this link any time</b> to see the status of
          your request and whether the answer is ready.
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
  const phone = phoneDisplay(state.contact.dialCode, state.contact.phone)

  return (
    <main className="shell view">
      <section className="hero">
        <span className="eyebrow">Your request</span>
        <h1>
          We are searching for <em>your fares</em>
        </h1>
        <p>
          Welcome back{state.contact.firstName ? `, ${state.contact.firstName}` : ""}.
          Your options are not ready yet. Come back to this link whenever you
          like: this is always where the answer appears.
        </p>
      </section>

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
          We normally reply in <b>under 2 business hours</b>. We will let you know
          on <b className="mono">{phone}</b> and by email. You can also{" "}
          <b>come back to this link any time</b> to check whether the answer is
          ready.
        </p>
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
          <SummaryRows request={state.request} />
        </div>
      </div>

      <ContactCard state={state} showCancel />
      <div className="spacer" />
    </main>
  )
}

// ── P4b · opções prontas ─────────────────────────────────────────────────────

export function ScreenP4b({ state, onSeeOptions }: { state: PcState; onSeeOptions: () => void }) {
  const count = state.offers.length
  const guaranteed = state.offers.some((o) => o.valid_until)

  return (
    <main className="shell view">
      <section className="hero">
        <span className="eyebrow">Your request</span>
        <h1>
          Your options <em>are ready</em>
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
            We found {count} option{count === 1 ? "" : "s"} for your trip
          </b>
          <p>
            We also sent {count === 1 ? "it" : "them"} by WhatsApp and email.
            {guaranteed
              ? " One of them has a guaranteed price for a limited time."
              : " Prices are reconfirmed with the airline before issuing."}
          </p>
        </div>
      </div>

      <div className="card tight" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="button" onClick={onSeeOptions}>
          See the options
          <IcNext />
        </button>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>Request status</h3>
          <span className="rt">
            {state.proposalPublishedAt
              ? `updated at ${clockOf(state.proposalPublishedAt)}`
              : "—"}
          </span>
        </div>
        <Track state={state} />
      </div>

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
      <div className="spacer" />
    </main>
  )
}

// ── P7b · em verificação, ou pago à espera do bilhete ────────────────────────

export function ScreenP7b({ state }: { state: PcState }) {
  const payment = state.payment
  const paid = Boolean(payment?.admin_confirmed) || payment?.status === "COMPLETED"
  const offer = selectedOfferOf(state)
  const phone = phoneDisplay(state.contact.dialCode, state.contact.phone)
  const proof = state.proofs[0]

  const rows: [string, string][] = [
    ["Option", offer?.name || "—"],
    ["Amount", payment ? money(payment.amount, payment.currency) : "—"],
    [
      "Payment method",
      payment?.method
        ? `${METHOD_LABEL[payment.method as PayMethodId] ?? payment.method}${
            payment.pay_provider ? ` · ${payment.pay_provider}` : ""
          }`
        : "—",
    ],
    [
      "Proof",
      proof
        ? `${proof.file_name} · ${Math.max(1, Math.round(proof.size_bytes / 1024))} KB`
        : "not needed for this method",
    ],
    [
      "Passengers",
      state.passengers
        .map((p) => `${p.last_name}/${p.first_name}`.toUpperCase())
        .join(", ") || "—",
    ],
    ["Sent", whenLabel(payment?.client_declared_paid_at ?? proof?.created_at ?? null)],
  ]

  return (
    <main className="shell view">
      <div className="hero-c">
        <div className="badge ok">{paid ? <IcBigCheck size={26} /> : <IcHourglass />}</div>
        <h2>
          {paid ? (
            <>
              Payment confirmed. <em>We are issuing your tickets</em>
            </>
          ) : (
            <>
              Details received. <em>We are checking the payment</em>
            </>
          )}
        </h2>
        <p>
          {paid
            ? "Your payment is confirmed. The tickets are being issued and land in your email and in this link."
            : "Everything is with our team. As soon as the payment shows up we issue the tickets and they land in your email and in this link."}
        </p>
        <div className="codebox" style={{ justifyContent: "center" }}>
          <div>
            <span>Request</span>
            <b>{state.request.reference}</b>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>Request status</h3>
          <span className="rt" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className="pulse" />
            {paid ? "issuing tickets" : "checking payment"}
          </span>
        </div>
        <Track state={state} />
        <p className="eta">
          {paid ? (
            <>
              Tickets are issued during business hours. We message you on{" "}
              <b className="mono">{phone}</b> the moment they are ready.
            </>
          ) : (
            <>
              Payments are checked during business hours, <b>usually within 2 hours</b>
              {payment?.review_deadline_at ? (
                <>
                  {" "}
                  and always within {PROOF_REVIEW_HOURS} hours
                </>
              ) : null}
              . We message you on <b className="mono">{phone}</b> the moment the
              tickets are issued.
            </>
          )}
        </p>
      </div>

      {payment?.proof_status === "rejeitado" && payment.proof_rejected_reason && (
        <div className="card">
          <div className="sechead">
            <h3>We need another proof</h3>
          </div>
          <p className="notice">{payment.proof_rejected_reason}</p>
        </div>
      )}

      <div className="card">
        <div className="sechead">
          <h3>What you sent us</h3>
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
              Go back and correct something
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
  const [pending, startTransition] = useTransition()

  const lastTotal = state.offers.length
    ? state.totals[state.offers[0].id]
    : null

  const rows: [string, string][] = [
    [
      "Dates",
      state.request.trip === "multi"
        ? state.request.legs.map((l) => fmtDate(l.date)).join(" · ")
        : fmtRange(
            state.request.departDate,
            state.request.trip === "round" ? state.request.returnDate : null
          ),
    ],
    ["Passengers", paxFull(state.request)],
    ["Cabin", CABIN_LABEL[state.request.cabin]],
    [
      "Last option",
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
        <h2>{overdueOnUs ? "This payment window closed" : "These options have expired"}</h2>
        <p>
          {overdueOnUs
            ? "Your proof reached us but we did not confirm it in time, so the price we held expired. This is on us: ask for a fresh search and we prioritise it."
            : "Airfares change several times a day. Your request is not lost: we run a fresh search with the same dates and let you know again."}
        </p>
        <div className="codebox" style={{ justifyContent: "center" }}>
          <div>
            <span>Request</span>
            <b>{state.request.reference}</b>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>What you asked for</h3>
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
                toast("We are searching again")
                router.refresh()
              } else {
                toast(result.error)
              }
            })
          }
        >
          {pending ? "Sending…" : "Request a new search"}
        </button>
        <p className="subnote">We keep the same dates and passengers.</p>
        <div style={{ marginTop: 12 }}>
          <a
            className="btn btn-ghost btn-sm"
            style={{ width: "100%" }}
            href="/pc"
          >
            Change the dates instead
          </a>
        </div>
        <div style={{ marginTop: 9 }}>
          <WaButton
            reference={state.request.reference}
            className="btn btn-ghost btn-sm"
            style={{ width: "100%" }}
          >
            Message the team
          </WaButton>
        </div>
      </div>
      <div className="spacer" />
    </main>
  )
}

// ── P9 · emitido ─────────────────────────────────────────────────────────────

export function ScreenP9({ state }: { state: PcState }) {
  const toast = useToast()
  const offer = selectedOfferOf(state)

  return (
    <main className="shell view">
      <div className="hero-c">
        <div className="badge ok">
          <IcBigCheck size={26} />
        </div>
        <h2>
          Tickets issued. <em>Have a great trip!</em>
        </h2>
        <p>
          We also sent them to <b>{state.contact.email}</b>. Keep your reference
          for anything related to this trip.
        </p>
        <div className="codebox">
          <div>
            <span>Booking reference</span>
            <b>{state.issued.pnr ?? "—"}</b>
          </div>
          <div>
            <span>WeeFly reference</span>
            <b style={{ fontSize: 15 }}>{state.request.reference}</b>
          </div>
        </div>
      </div>

      <div className="card tight">
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => toast("Your agent sends the ticket PDFs by email and WhatsApp")}
        >
          <IcDownload />
          Download all tickets
        </button>
        <p className="subnote" id="dlSub">
          One PDF with all{" "}
          {state.passengers.length === 1
            ? "the ticket"
            : `${state.passengers.length} tickets`}{" "}
          and the travel guide.
        </p>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>Tickets by passenger</h3>
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
            <button
              className="dl"
              type="button"
              onClick={() =>
                toast(
                  `Ticket for ${p.first_name.split(" ")[0]} — your agent sends the PDF`
                )
              }
            >
              PDF
            </button>
          </div>
        ))}
      </div>

      {offer && (
        <div className="card">
          <div className="sechead">
            <h3>Your flights</h3>
          </div>
          <div className="sumrows">
            <Rows rows={itineraryRows(state)} />
          </div>
        </div>
      )}

      <div className="card">
        <div className="sechead">
          <h3>Before you travel</h3>
        </div>
        <div className="sumrows">
          <Rows
            rows={[
              ["Online check-in opens", "48 h before"],
              ["At the airport", `3 h before · ${state.request.origin}`],
              ["Baggage included", offer?.baggage_hold ?? "See your ticket"],
              ["Documents", "Passport valid 6 months beyond the return"],
            ]}
          />
        </div>
        <p className="notice" style={{ marginTop: 12 }}>
          The ticket PDF includes a guide with everything to sort out before you
          travel, in time order.
        </p>
      </div>

      <ContactCard state={state} />
      <div className="spacer" />
    </main>
  )
}

function itineraryRows(state: PcState): [string, string][] {
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
      direction === "ida" ? "Outbound" : "Return",
      `${first.origin} ${first.depart_at?.slice(11, 16) ?? "--:--"} → ${
        last.destination
      } ${last.arrive_at?.slice(11, 16) ?? "--:--"}${
        segments.length > 1 ? " · 1 stop" : " · non-stop"
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
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  const cancelled = state.cancelled

  return (
    <div className="card tight">
      <WaButton reference={state.request.reference}>
        <IcWa />
        Message the team on WhatsApp
      </WaButton>
      <p className="subnote">Opens a chat with your reference already written.</p>

      {showCancel && !cancelled && (
        <>
          <div className="rowbtn" style={{ marginTop: 14 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: "100%" }}
              type="button"
              onClick={() => setOpen(true)}
            >
              Cancel request
            </button>
          </div>

          <div className={`cancelpanel${open ? " on" : ""}`}>
            <h4>Cancel this request?</h4>
            <p>
              The team stops searching and the request closes. You can start a new
              one any time.
            </p>
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="" disabled>
                Reason (helps us improve)
              </option>
              <option>I booked somewhere else</option>
              <option>My plans changed</option>
              <option>My dates changed</option>
              <option>It took too long</option>
              <option>Another reason</option>
            </select>
            <div className="rowbtn">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => setOpen(false)}
              >
                Keep request
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
                      toast("Request cancelled")
                      router.refresh()
                    } else {
                      toast(result.error)
                    }
                  })
                }
              >
                Yes, cancel
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
              <b>Request cancelled.</b> Reference{" "}
              <span className="mono">{state.request.reference}</span> stays in your
              history. You can start a new request whenever you like.
            </div>
          </div>
          <a
            className="btn btn-ghost btn-sm"
            style={{ width: "100%", marginTop: 11 }}
            href="/pc"
          >
            Start a new request
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
          WeeFly is saved on your device. We will notify you here.
        </div>
      </div>
    )
  }

  if (platform === "ios") {
    return (
      <div className="install">
        <div className="ih">
          <div>
            <h3>Save WeeFly to your iPhone</h3>
            <p>Three taps and you get an icon on your home screen.</p>
          </div>
        </div>
        <p className="why">
          <b>This is how we reach you first.</b> Once saved, you can get a
          notification when your options are ready.
        </p>
        <div className="tut">
          <div className="tutrow">
            <span className="n">1</span>
            <span className="t">
              Tap <b>Share</b> in the Safari bar
            </span>
          </div>
          <div className="tutrow">
            <span className="n">2</span>
            <span className="t">
              Scroll and choose <b>Add to Home Screen</b>
            </span>
          </div>
          <div className="tutrow">
            <span className="n">3</span>
            <span className="t">
              Confirm with <b>Add</b>
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
          <h3>Save WeeFly to your phone</h3>
          <p>It adds an icon to your home screen, like an app. It takes no space.</p>
        </div>
      </div>
      <p className="why">
        <b>This is how we reach you first.</b> With WeeFly saved, you get a
        notification the moment your options are ready.
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
        Install in one tap
      </button>
    </div>
  )
}
