import Link from "next/link"
import { notFound } from "next/navigation"

import { PcTopbar } from "@/components/pc/chrome"
import { InstallCard } from "@/components/pc/screens-status"
import { listMinistryTrips, ministryBalance, resolveMinistry, type MinistryTrip } from "@/lib/ministry"
import { formatAmount } from "@/lib/case-status"
import { getTranslator } from "@/i18n/server"

/**
 * MIN-01 · Minhas passagens: a viagem activa em destaque, e o arquivo das
 * emitidas, usadas e expiradas por baixo — só as deste link de ministério.
 *
 * O saldo da bolsa aparece só se o ministério o puder ver (decisão O2,
 * `secretary_sees_balance`, por omissão desligado).
 */

export const dynamic = "force-dynamic"

export default async function MinistryTripsPage({ params }: { params: { org: string; token: string } }) {
  const lookup = await resolveMinistry(params.org, params.token)
  if (!lookup.ok) notFound()
  const { org } = lookup.ministry
  const t = getTranslator("pt")

  const [trips, balance] = await Promise.all([
    listMinistryTrips(org.id),
    org.secretarySeesBalance ? ministryBalance(org.id) : Promise.resolve(null),
  ])

  /* A viagem activa: a que ainda está a andar (pedido, proposta, passageiros,
     pagamento) ou emitida e por voar — a mais próxima da partida. */
  const upcoming = trips
    .filter((tr) => tr.status === "active" || tr.status === "issued")
    .sort((a, b) => (a.departDate ?? "9").localeCompare(b.departDate ?? "9"))
  const current = upcoming[0] ?? null
  const archive = trips.filter((tr) => tr.caseId !== current?.caseId)

  const date = (d: string | null) =>
    d ? new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00`)) : "—"

  const card = (tr: MinistryTrip, big = false) => (
    <Link
      key={tr.caseId}
      href={`/pc/${tr.token}`}
      className="card"
      style={{ display: "block", padding: big ? 20 : 14, marginBottom: 10, textDecoration: "none", color: "inherit" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <b style={{ fontSize: big ? 20 : 16 }}>
          {tr.origin ?? "—"} → {tr.destination ?? "—"}
        </b>
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
          {tr.reference ?? ""}
        </span>
      </div>
      <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 14 }}>
        {date(tr.departDate)}
        {tr.returnDate ? ` – ${date(tr.returnDate)}` : ""} · {t(`ministry.status.${tr.status}`)}
        {tr.pnr ? ` · PNR ${tr.pnr}` : ""}
      </p>
    </Link>
  )

  return (
    <>
      <PcTopbar currency={org.currency} lang="pt" />
      <main className="shell" style={{ paddingTop: 20 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>{t("ministry.trips.title")}</h1>

        {balance != null && (
          <p className="card" style={{ padding: 14, marginBottom: 14 }}>
            {t("ministry.trips.balance")}: <b>{formatAmount(balance, org.currency)}</b>
          </p>
        )}

        {current ? (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "0 0 6px" }}>
              {t("ministry.trips.current")}
            </p>
            {card(current, true)}
          </>
        ) : (
          <p className="card" style={{ padding: 18, color: "var(--muted)" }}>
            {t("ministry.trips.none")}
          </p>
        )}

        {archive.length > 0 && (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "18px 0 6px" }}>
              {t("ministry.trips.archive")}
            </p>
            {archive.map((tr) => card(tr))}
          </>
        )}

        {/* MIN-06 · instalar como aplicação: Android num toque, iOS em três. */}
        <div style={{ marginTop: 18 }}>
          <InstallCard appName={org.name} />
        </div>
      </main>
    </>
  )
}
