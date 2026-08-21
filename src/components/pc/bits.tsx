/**
 * WeeFly Price Checker — as peças que os nove ecrãs partilham.
 *
 * Os ícones são os SVG do mockup, à letra: são desenhados para o tamanho exato
 * em que aparecem e substituí-los por uma biblioteca mudaria o peso do traço em
 * todos os ecrãs de uma vez.
 *
 * Tudo aqui é renderizável no servidor. O que precisa de interação (WhatsApp,
 * contadores, copiar) vive nos componentes de cliente, ao lado.
 */

import type { PcRequestView, PcScreen, PcState } from "@/lib/pc/state"
import {
  cityOf,
  fmtDateY,
  fmtDate,
  money,
  paxFull,
  phoneDisplay,
  whenLabel,
  CABIN_LABEL,
  TRIP_LABEL,
} from "@/lib/pc/format"

// ── ícones ───────────────────────────────────────────────────────────────────

export const IcSwap = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
    <path
      d="M2 6h11l-2.4-2.6M16 12H5l2.4 2.6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IcPin = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path d="M8 14.5s5-4.2 5-8a5 5 0 10-10 0c0 3.8 5 8 5 8z" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="6.4" r="1.8" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)

export const IcUser = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="5.2" r="2.8" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.6 14c.6-2.8 2.8-4.2 5.4-4.2s4.8 1.4 5.4 4.2" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)

export const IcMail = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="3.3" width="13" height="9.4" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2 4.4l6 4 6-4" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)

export const IcNext = () => (
  <svg width="15" height="12" viewBox="0 0 16 12" fill="none">
    <path
      d="M1 6h13M9.5 1.5L14 6l-4.5 4.5"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IcBack = () => (
  <svg width="15" height="12" viewBox="0 0 16 12" fill="none">
    <path
      d="M15 6H2M6.5 1.5L2 6l4.5 4.5"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IcTick = () => (
  <svg width="14" height="10" viewBox="0 0 13 10" fill="none">
    <path d="M1 5l3.6 3.6L12 1.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export const IcChevron = () => (
  <svg width="10" height="6" viewBox="0 0 11 7" fill="none">
    <path d="M1 1l4.5 4.5L10 1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
)

export const IcWa = ({ size = 19 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm5.3 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-1.7-.1a12 12 0 01-5.9-5.1c-.5-.9-.8-1.8-.5-2.6.1-.4.7-1.1 1-1.3.3-.2.7-.1.9.3l.7 1.6c.1.3 0 .5-.1.7l-.4.5c-.1.2-.2.3 0 .6.6 1 1.4 1.8 2.4 2.3.3.2.5.1.6 0l.6-.6c.2-.2.4-.2.6-.1l1.6.8c.3.2.4.4.3.7z" />
  </svg>
)

export const IcDownload = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path
      d="M8 1.6v8.6M4.6 7l3.4 3.4L11.4 7M2.4 13.4h11.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IcBigCheck = ({ size = 25 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M4 12.5l5 5L20 6.5"
      stroke="#0E7A5B"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IcHourglass = () => (
  <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
    <path d="M12 3.2v6.4M12 20.8v-2.4" stroke="#0E7A5B" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="12" cy="12" r="8.6" stroke="#0E7A5B" strokeWidth="1.9" />
  </svg>
)

export const IcExpired = () => (
  <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8.6" stroke="#9A5B06" strokeWidth="1.9" />
    <path d="M12 7.6V12l3 2" stroke="#9A5B06" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
)

export const IcCancelled = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    style={{ flex: "0 0 auto", marginTop: 1 }}
  >
    <circle cx="12" cy="12" r="9.4" stroke="#EE5128" strokeWidth="1.9" />
    <path d="M8.8 15.2l6.4-6.4" stroke="#EE5128" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
)

/** Os ícones das condições da tarifa, no cartão de cada opção. */
const TERM_PATHS: Record<string, JSX.Element> = {
  cabin: (
    <>
      <rect x="3.5" y="5" width="9" height="8.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 5V3.4h4V5" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  person: (
    <>
      <path d="M5 6V4.2a3 3 0 016 0V6" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="6" width="10" height="7.6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  hold: (
    <>
      <rect x="2.5" y="4.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5v9" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  no: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.6 10.4l4.8-4.8" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v3.4l2.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
}

export const TermIcon = ({ kind }: { kind: string }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    {TERM_PATHS[kind] ?? null}
  </svg>
)

/** Os ícones dos métodos de pagamento. */
const METHOD_PATHS: Record<string, JSX.Element> = {
  transfer: (
    <>
      <path d="M2.5 7L9 3l6.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path
        d="M4 8v5M7.6 8v5M10.4 8v5M14 8v5M2.5 15h13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  link: (
    <>
      <path d="M7.4 10.6l3.2-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M9.6 5.2l1.2-1.2a2.9 2.9 0 014.2 4.2l-1.2 1.2M8.4 12.8l-1.2 1.2a2.9 2.9 0 01-4.2-4.2l1.2-1.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  card: (
    <>
      <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 7.6h14" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  momo: (
    <>
      <rect x="4.5" y="2" width="9" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.6 13.2h2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  local: (
    <>
      <circle cx="9" cy="9" r="6.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.4 9h13.2M9 2.4c1.8 1.9 2.7 4.2 2.7 6.6S10.8 14.3 9 15.6C7.2 14.3 6.3 12 6.3 9S7.2 4.3 9 2.4z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </>
  ),
  cash: (
    <>
      <path d="M3 6.5h12v7H3z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 4.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
}

export const MethodIcon = ({ kind }: { kind: string }) => (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    {METHOD_PATHS[kind] ?? null}
  </svg>
)

export const IcFile = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path d="M3.5 2.5h6l3 3v8h-9z" stroke="#3A4557" strokeWidth="1.3" />
    <path d="M9.5 2.5v3h3" stroke="#3A4557" strokeWidth="1.3" />
  </svg>
)

// ── a rota, como aparece no resumo ───────────────────────────────────────────

export function RouteSummary({ request }: { request: PcRequestView }) {
  if (request.trip === "multi" && request.legs.length) {
    return (
      <>
        {request.legs.map((leg, i) => (
          <div key={leg.position} style={{ flex: 1, minWidth: 110 }}>
            <span className="cy">
              Flight {i + 1} · {fmtDate(leg.date)}
            </span>
            <span className="ia" style={{ fontSize: 15 }}>
              {leg.origin} → {leg.destination}
            </span>
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      <div className="pt">
        <span className="ia">{request.origin || "—"}</span>
        <span className="cy">{cityOf(request.origin, request.cities)}</span>
      </div>
      <div className="mid" aria-hidden="true">
        <span className="ln" />
        <span className="d a" />
        <span className="d b" />
      </div>
      <div className="pt r">
        <span className="ia">{request.destination || "—"}</span>
        <span className="cy">{cityOf(request.destination, request.cities)}</span>
      </div>
    </>
  )
}

/** As linhas "chave · valor" do resumo do pedido. */
export function SummaryRows({
  request,
  contact,
  withContact = false,
}: {
  request: PcRequestView
  contact?: { dialCode: string; phone: string; email: string }
  withContact?: boolean
}) {
  const rows: [string, string][] = [["Trip type", TRIP_LABEL[request.trip]]]

  if (request.trip !== "multi") {
    rows.push(["Departure", fmtDateY(request.departDate)])
    if (request.trip === "round") rows.push(["Return", fmtDateY(request.returnDate)])
  } else {
    request.legs.forEach((leg, i) =>
      rows.push([
        `Flight ${i + 1}`,
        `${cityOf(leg.origin, request.cities)} → ${cityOf(leg.destination, request.cities)} · ${fmtDateY(leg.date)}`,
      ])
    )
  }

  rows.push(["Passengers", paxFull(request)])
  rows.push(["Cabin", CABIN_LABEL[request.cabin]])

  if (withContact && contact) {
    rows.push(["Contact", phoneDisplay(contact.dialCode, contact.phone)])
    rows.push(["Email", contact.email])
  }

  return (
    <>
      {rows.map(([k, v]) => (
        <div className="srow" key={k}>
          <span className="k">{k}</span>
          <span className="v">{v || "—"}</span>
        </div>
      ))}
    </>
  )
}

export function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <>
      {rows.map(([k, v]) => (
        <div className="srow" key={k}>
          <span className="k">{k}</span>
          <span className="v">{v || "—"}</span>
        </div>
      ))}
    </>
  )
}

// ── o tracker de cinco passos ────────────────────────────────────────────────

/**
 * Onde o caso está, nas cinco etapas que o cliente entende.
 *
 * O `rank` sai do ecrã e não de um campo de estado: o ecrã já é a conclusão de
 * tudo o que a base de dados diz, e derivar duas vezes a mesma coisa é convidar
 * as duas leituras a discordarem.
 */
const RANK: Record<PcScreen, number> = {
  p3: 1,
  p4a: 1,
  p4b: 2,
  p5: 2,
  p7: 3,
  p7pay: 3,
  p7b: 3,
  p8: 2,
  p9: 5,
}

export function Track({ state }: { state: PcState }) {
  if (state.cancelled) {
    return (
      <ul className="track">
        <li className="done">
          <span className="mk">✓</span>
          <div>
            <b>Request received</b>
            <span>{whenLabel(state.request.createdAt)}</span>
          </div>
        </li>
        <li className="stop">
          <span className="mk">×</span>
          <div>
            <b>Request cancelled</b>
            <span>At your request</span>
          </div>
        </li>
      </ul>
    )
  }

  const rank = RANK[state.screen]
  const offers = state.offers.length
  const paid = Boolean(state.payment?.admin_confirmed) ||
    state.payment?.status === "COMPLETED"

  const steps = [
    { b: "Request received", s: whenLabel(state.request.createdAt) },
    {
      b: "Searching for the best fares",
      s: "Our team is comparing airlines",
      doneB: "Fares searched",
      doneS: state.proposalPublishedAt ? whenLabel(state.proposalPublishedAt) : "",
    },
    {
      b: "Options sent, your choice",
      s: offers
        ? `${offers} option${offers > 1 ? "s" : ""} · valid for a limited time`
        : "By WhatsApp, email and in this link",
      nextB: "Options sent",
      doneB: "Options sent",
    },
    {
      b: "Choice and payment",
      s: "Pick an option and get the instructions",
      doneB: "Payment confirmed",
      doneS: "Passenger details received",
      nowS:
        state.screen === "p7b"
          ? paid
            ? "Payment confirmed — issuing your tickets"
            : "We are checking your payment"
          : state.screen === "p7pay"
            ? "Send the proof of your payment"
            : "Send the passport details",
    },
    {
      b: "Ticket issued",
      s: state.issued.issuedAt
        ? whenLabel(state.issued.issuedAt)
        : "Sent by email and available here",
    },
  ]

  return (
    <ul className="track">
      {steps.map((step, i) => {
        const kind = i < rank ? "done" : i === rank ? "now" : "next"
        let title = step.b
        let sub = step.s

        if (kind === "done" && step.doneB) {
          title = step.doneB
          sub = step.doneS || sub
        }
        if (kind === "next" && step.nextB) title = step.nextB
        if (kind === "now" && step.nowS) sub = step.nowS
        if (state.screen === "p8" && i === 2) {
          title = "Options expired"
          sub = "Ask for a fresh search, same dates"
        }

        return (
          <li className={kind} key={i}>
            <span className="mk">{kind === "done" ? "✓" : i + 1}</span>
            <div>
              <b>{title}</b>
              <span>{sub}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── o preço de uma opção, em texto ───────────────────────────────────────────

export function priceLine(
  total: number,
  fare: number,
  taxes: number,
  currency: string
): string {
  return `${money(total, currency)} · Fare ${money(fare, currency)} + Taxes ${money(
    taxes,
    currency
  )}`
}
