import Link from "next/link"
import { notFound } from "next/navigation"

import { PcTopbar } from "@/components/pc/chrome"
import { ScreenP5 } from "@/components/pc/screen-options"
import { ScreenP7 } from "@/components/pc/screen-passengers"
import { PickedOption } from "@/components/pc/picked-option"
import { MinistryPrintButton } from "@/components/ministry/print-button"
import { secretaryChooseOffer, secretarySavePassengers } from "@/actions/ministry-case"
import { listMinistryTravellerCards, loadSecretarySpace } from "@/lib/ministry"
import { loadSecretaryCase, type SecretaryCaseStep } from "@/lib/ministry-case"
import type { PcState } from "@/lib/pc/state"
import { getTranslator } from "@/i18n/server"

/**
 * B2G-15 · B2G-16 · B2G-17 · B2G-18 · o pedido, dentro do espaço do
 * ministério.
 *
 * Só com a sessão do PIN da secretária dona do link, e só um caso do
 * ministério dela — senão 404 (um caso de outro ministério nunca existe
 * aqui). As colegas do mesmo ministério abrem os pedidos umas das outras (D-4).
 *
 * O que se vê, por passo: à espera das ofertas; as ofertas **publicadas**
 * (nunca o rascunho nem a revisão da empresa), sem custo e sem notas do
 * agente, para imprimir e escolher; um bloco por pessoa, a escolher dos
 * passageiros guardados; "pronto a emitir" — sem nenhum ecrã de pagamento;
 * e, emitido, o PNR e os bilhetes para descarregar (pela sessão, nunca pelo
 * token do caso).
 */

export const dynamic = "force-dynamic"

const PRINT_CSS = `
@media print {
  nav, .fab, footer, .no-print, button, .btn { display: none !important; }
  body { background: #fff !important; }
  .card, .offer { break-inside: avoid; box-shadow: none !important; }
  a[href]::after { content: none !important; }
}`

export default async function MinistryCasePage({
  params,
  searchParams,
}: {
  params: { org: string; token: string; caseId: string }
  searchParams: { view?: string | string[] }
}) {
  /* B2G-07 · sem a sessão do PIN desta secretária, nada (a moldura mostra o PIN). */
  const space = await loadSecretarySpace(params.org, params.token)
  if (!space.lookup.ok) notFound()
  if (!space.signedIn) return null

  const loaded = await loadSecretaryCase(params.org, params.token, params.caseId)
  if (!loaded) notFound()
  const { ministry, data } = loaded
  const { org, partner } = ministry
  const { state } = data
  const t = getTranslator("pt")

  const base = `/ministerios/${org.slug}/${org.token}`
  const casePath = `${base}/pedidos/${state.caseId}`
  const view = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view

  /* As acções, presas a este link e a este caso (a sessão é verificada outra
     vez no servidor, a cada chamada). */
  const choose = secretaryChooseOffer.bind(null, org.slug, org.token, state.caseId)
  const save = secretarySavePassengers.bind(null, org.slug, org.token, state.caseId)

  const open = data.step === "options" || data.step === "passengers" || data.step === "ready"
  let step: SecretaryCaseStep | "change-offer" | "edit-passengers" = data.step
  if (open && view === "ofertas" && state.offers.length) step = "change-offer"
  else if (data.step === "ready" && view === "passageiros") step = "edit-passengers"

  const date = (d: string | null) =>
    d
      ? new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00`))
      : "—"
  const r = state.request
  const people = r.adults + r.children + r.infantsInSeat + r.infantsOnLap

  const travellers =
    step === "passengers" || step === "edit-passengers" ? await listMinistryTravellerCards(org.id) : []

  const statusKey: Record<SecretaryCaseStep, string> = {
    waiting: "ministry.case.status.waiting",
    options: "ministry.case.status.options",
    passengers: "ministry.case.status.passengers",
    ready: "ministry.case.status.ready",
    issued: "ministry.case.status.issued",
    closed: "ministry.case.status.closed",
    cancelled: "ministry.case.status.cancelled",
  }

  return (
    <>
      <style>{PRINT_CSS}</style>
      <PcTopbar currency={org.currency} lang="pt" reference={r.reference} />

      <section className="shell" style={{ paddingTop: 16 }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <Link href={`${base}/pedidos`} className="btn btn-ghost btn-sm" style={{ width: "auto", textDecoration: "none" }}>
            ← {t("ministry.case.back")}
          </Link>
          {(data.step === "options" || step === "change-offer" || data.step === "issued") && <MinistryPrintButton />}
        </div>

        <article className="card" style={{ padding: 16, marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 20, margin: 0 }}>
              {r.cities[r.origin] ?? r.origin} → {r.cities[r.destination] ?? r.destination}
            </h1>
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              {r.reference}
            </span>
          </div>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 14 }}>
            {org.name} · {date(r.departDate)}
            {r.returnDate ? ` – ${date(r.returnDate)}` : ` · ${t("ministry.requests.oneway")}`} ·{" "}
            {t("ministry.requests.people", { count: people })}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 13 }}>
            <b>{t(statusKey[data.step])}</b>
            {data.urgency > 0 ? ` · ${t(`ministry.urgency.${data.urgency}`)}` : ""}
            {data.authorName ? ` · ${t("ministry.requests.by", { name: data.authorName })}` : ""}
          </p>
          {data.notes && (
            <p style={{ margin: "8px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>
              <b>{t("ministry.requests.notes")}:</b> {data.notes}
            </p>
          )}
        </article>
      </section>

      {step === "waiting" && (
        <main className="shell">
          <p className="card" style={{ padding: 16 }}>
            {t("ministry.case.waiting", { partner: partner.name })}
          </p>
        </main>
      )}

      {(step === "options" || step === "change-offer") && (
        <>
          <ScreenP5 state={state} choose={choose} afterChoose={casePath} />
          {step === "change-offer" && (
            <main className="shell no-print">
              <Link href={casePath} className="btn btn-ghost btn-sm" style={{ width: "auto", textDecoration: "none" }}>
                {t("ministry.case.keepOffer")}
              </Link>
            </main>
          )}
        </>
      )}

      {(step === "passengers" || step === "edit-passengers") && (
        <>
          <ScreenP7 state={state} save={save} afterSave={casePath} saved={travellers} />
          <main className="shell no-print">
            <Link href={`${casePath}?view=ofertas`} className="btn btn-ghost btn-sm" style={{ width: "auto", textDecoration: "none" }}>
              {t("ministry.case.changeOffer")}
            </Link>
          </main>
        </>
      )}

      {step === "ready" && (
        <main className="shell">
          {/* B2G-17 · sem ecrã de pagamento: a empresa emite. */}
          <div className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{t("ministry.case.readyTitle")}</h2>
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6 }}>
              {t("ministry.case.readyBody", { partner: partner.name })}
            </p>
          </div>
          <PickedOption state={state} showWindow={false} />
          <PassengerList state={state} t={t} />
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <Link href={`${casePath}?view=passageiros`} className="btn btn-ghost btn-sm" style={{ width: "auto", textDecoration: "none" }}>
              {t("ministry.case.editPassengers")}
            </Link>
            <Link href={`${casePath}?view=ofertas`} className="btn btn-ghost btn-sm" style={{ width: "auto", textDecoration: "none" }}>
              {t("ministry.case.changeOffer")}
            </Link>
          </div>
        </main>
      )}

      {step === "issued" && (
        <main className="shell">
          <div className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{t("ministry.case.issuedTitle")}</h2>
            {state.issued.pnr && (
              <p style={{ margin: 0 }}>
                PNR <b className="mono" style={{ letterSpacing: ".08em" }}>{state.issued.pnr}</b>
              </p>
            )}
            {/* B2G-18 · os bilhetes, pela sessão do PIN (nunca pelo token do caso). */}
            {data.tickets.combined || data.tickets.byPassenger.length ? (
              <div className="no-print" style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {data.tickets.combined && (
                  <a className="btn btn-primary" href={`${casePath}/bilhete`} target="_blank" rel="noopener">
                    {t("ministry.case.downloadAll")}
                  </a>
                )}
                {data.tickets.byPassenger.map((p) => (
                  <a key={p.id} className="btn btn-ghost btn-sm" href={`${casePath}/bilhete?pax=${p.id}`} target="_blank" rel="noopener">
                    {t("ministry.case.downloadOne", { name: p.name })}
                  </a>
                ))}
              </div>
            ) : (
              <p style={{ margin: "10px 0 0", color: "var(--muted)" }}>{t("ministry.case.ticketsPending")}</p>
            )}
          </div>
          <PassengerList state={state} t={t} withTickets />
        </main>
      )}

      {(step === "closed" || step === "cancelled") && (
        <main className="shell">
          <p className="card" style={{ padding: 16, color: "var(--muted)" }}>
            {t(step === "closed" ? "ministry.case.closedBody" : "ministry.case.cancelledBody")}
          </p>
        </main>
      )}
    </>
  )
}

function PassengerList({
  state,
  t,
  withTickets = false,
}: {
  state: PcState
  t: ReturnType<typeof getTranslator>
  withTickets?: boolean
}) {
  if (!state.passengers.length) return null
  const kind = (k: string) =>
    t(k === "adult" ? "pc.pax.kind.adult" : k === "child" ? "pc.pax.kind.child" : "pc.pax.kind.infant")
  return (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>{t("ministry.case.passengers")}</h3>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {state.passengers.map((p) => (
          <li key={p.id} style={{ padding: "3px 0", fontSize: 14 }}>
            <b>
              {String(p.last_name ?? "").toUpperCase()}, {p.first_name}
            </b>{" "}
            <span style={{ color: "var(--muted)" }}>· {kind(String(p.passenger_type ?? "adult"))}</span>
            {withTickets && p.ticket_number && (
              <span className="mono" style={{ color: "var(--muted)" }}>
                {" "}
                · {p.ticket_number}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
