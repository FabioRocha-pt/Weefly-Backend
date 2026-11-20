import Link from "next/link"
import { notFound } from "next/navigation"

import { PcTopbar } from "@/components/pc/chrome"
import { VipInstallPrompt } from "@/components/vip/install-prompt"
import { VipLiveRefresh } from "@/components/vip/live-refresh"
import { resolveVipHandle, vipLocale } from "@/lib/vip"
import { loadVipTrips, type VipTrip } from "@/lib/vip-trips"
import { getTranslator } from "@/i18n/server"
import { LOCALE_TAGS } from "@/i18n/config"
import type { Translator } from "@/i18n/translate"

/**
 * APP-03 · Minhas passagens — onde o cliente segue tudo, sem precisar do email.
 *
 * Resolve o `E1`: o link pessoal voltava sempre ao formulário, e para escolher
 * a oferta era preciso o link do email. Agora os pedidos estão aqui:
 *
 *   · **Em curso** · os pedidos ainda sem bilhete, o mais recente em cima,
 *     com o estado de cada um;
 *   · **Viagens marcadas** · os bilhetes emitidos de viagens futuras, com o
 *     PDF para abrir — o atalho para os bilhetes;
 *   · **Histórico** · as viagens passadas e os pedidos fechados.
 *
 * Cada pedido abre o seu acompanhamento dentro da app (`./[caseToken]`): as
 * ofertas, a escolha, os passageiros, o pagamento e o bilhete.
 */

export const dynamic = "force-dynamic"

/** A cor do estado: o que espera pelo cliente destaca-se; o resto é neutro. */
const TONE: Record<VipTrip["status"], { bg: string; fg: string }> = {
  received: { bg: "var(--navy-tint)", fg: "var(--navy-soft)" },
  offers: { bg: "var(--ember-tint)", fg: "var(--ember-dk)" },
  passengers: { bg: "var(--ember-tint)", fg: "var(--ember-dk)" },
  payment: { bg: "var(--ember-tint)", fg: "var(--ember-dk)" },
  checking: { bg: "var(--warn-tint)", fg: "var(--warn)" },
  paid: { bg: "var(--ok-tint)", fg: "var(--ok)" },
  issued: { bg: "var(--ok-tint)", fg: "var(--ok)" },
  expired: { bg: "var(--chalk)", fg: "var(--muted)" },
  cancelled: { bg: "var(--chalk)", fg: "var(--muted)" },
  closed: { bg: "var(--chalk)", fg: "var(--muted)" },
}

export default async function VipTripsPage({ params }: { params: { token: string } }) {
  const lookup = await resolveVipHandle(params.token)
  if (!lookup.ok) notFound()
  const context = lookup.context
  const locale = vipLocale(context)
  const t = getTranslator(locale)
  const base = `/pc/${params.token}`
  const trips = await loadVipTrips(context.vip.id)

  const date = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(LOCALE_TAGS[locale], { day: "numeric", month: "short", year: "numeric" }).format(
          new Date(`${iso}T12:00:00`)
        )
      : ""

  const empty = trips.open.length + trips.booked.length + trips.history.length === 0

  return (
    <>
      <PcTopbar currency="EUR" lang={locale} hideLang hideCurrency />
      <VipLiveRefresh />

      <main className="shell view">
        <section className="hero">
          <span className="eyebrow">{context.brand.name}</span>
          <h1>{t("vipApp.trips.title")}</h1>
          <p>{t("vipApp.trips.lead")}</p>
        </section>

        {/* APP-05 · o convite para instalar: uma vez, depois do primeiro pedido. */}
        <VipInstallPrompt code={context.vip.code} appName={context.brand.name} />

        {empty && (
          <div className="card">
            <p style={{ margin: 0, fontWeight: 700 }}>{t("vipApp.trips.emptyTitle")}</p>
            <p className="subnote" style={{ textAlign: "left", marginTop: 6 }}>
              {t("vipApp.trips.emptyBody")}
            </p>
            <Link
              href={`${base}/pedido`}
              className="btn btn-primary"
              style={{ marginTop: 14, textDecoration: "none" }}
            >
              {t("vipApp.trips.newRequest")}
            </Link>
          </div>
        )}

        <Section title={t("vipApp.trips.open")} count={trips.open.length}>
          {trips.open.map((trip) => (
            <TripCard key={trip.token} trip={trip} base={base} t={t} date={date} />
          ))}
        </Section>

        <Section title={t("vipApp.trips.booked")} count={trips.booked.length}>
          {trips.booked.map((trip) => (
            <TripCard key={trip.token} trip={trip} base={base} t={t} date={date} />
          ))}
        </Section>

        <Section title={t("vipApp.trips.history")} count={trips.history.length}>
          {trips.history.map((trip) => (
            <TripCard key={trip.token} trip={trip} base={base} t={t} date={date} />
          ))}
        </Section>

        <div className="spacer" />
      </main>
    </>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <section style={{ marginTop: 22 }}>
      <div className="sechead" style={{ margin: "0 2px" }}>
        <h3>{title}</h3>
        <span className="rt">{count}</span>
      </div>
      {children}
    </section>
  )
}

function TripCard({
  trip,
  base,
  t,
  date,
}: {
  trip: VipTrip
  base: string
  t: Translator
  date: (iso: string | null) => string
}) {
  const tone = TONE[trip.status]
  const href = `${base}/passagens/${trip.token}`
  return (
    <article className="card" style={{ marginTop: 10, padding: 0, overflow: "hidden" }}>
      <Link
        href={href}
        style={{ display: "block", padding: 16, color: "inherit", textDecoration: "none" }}
        aria-label={t("vipApp.trips.openRequest", { reference: trip.reference })}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <b style={{ fontSize: 17, letterSpacing: "-.01em", minWidth: 0, overflowWrap: "anywhere" }}>
            {trip.originCity} → {trip.destinationCity}
          </b>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)", flex: "0 0 auto" }}>
            {trip.reference}
          </span>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--muted)" }}>
          {date(trip.departDate)}
          {trip.returnDate ? ` – ${date(trip.returnDate)}` : ""}
          {trip.trip === "oneway" ? ` · ${t("vipApp.trips.oneway")}` : ""}
          {trip.trip === "multi" ? ` · ${t("vipApp.trips.multi")}` : ""}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
          <span
            style={{
              background: tone.bg,
              color: tone.fg,
              borderRadius: 999,
              padding: "5px 11px",
              fontSize: 12.5,
              fontWeight: 800,
            }}
          >
            {/* O que espera pelo cliente diz-se com um ponto e com a frase:
                nunca só com a cor. */}
            {trip.needsClient ? "● " : ""}
            {t(`vipApp.trips.status.${trip.status}`, { count: trip.offersCount })}
          </span>
          {trip.pnr && (
            <span className="mono" style={{ fontSize: 12, color: "var(--navy-soft)" }}>
              PNR {trip.pnr}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "var(--ember)" }}>
            {t(trip.needsClient ? "vipApp.trips.continue" : "vipApp.trips.see")} ›
          </span>
        </div>
      </Link>
      {/* O atalho para os bilhetes: o PDF abre daqui, sem entrar no pedido. */}
      {trip.ticketReady && (
        <div style={{ borderTop: "1px solid var(--line-soft)", padding: "10px 16px" }}>
          <a
            className="btn btn-ghost btn-sm"
            style={{ width: "100%", textDecoration: "none" }}
            href={`/api/pc/${trip.token}/ticket`}
            target="_blank"
            rel="noreferrer"
          >
            {t("vipApp.trips.openTicket")}
          </a>
        </div>
      )}
    </article>
  )
}
