import Link from "next/link"
import { notFound } from "next/navigation"

import { PcTopbar } from "@/components/pc/chrome"
import { InstallCard } from "@/components/pc/screens-status"
import { formatAmount } from "@/lib/case-status"
import {
  listMinistryRequests,
  loadSecretarySpace,
  ministryBalance,
  type MinistryRequest,
  type MinistryRequestStatus,
} from "@/lib/ministry"
import { getTranslator } from "@/i18n/server"

/**
 * B2G-08 · B2G-10 · D-4 · Os meus pedidos: **todos** os pedidos do ministério
 * (os desta secretária e os das colegas), com quem pediu, o estado e o
 * registo de actividade de cada um — uma lista fechada de acontecimentos,
 * com frases do dicionário (nunca notas internas, custos ou notas de agente).
 *
 * O saldo da bolsa aparece só se o ministério o puder ver (decisão O2).
 */

export const dynamic = "force-dynamic"

const STATUS_TONE: Record<MinistryRequestStatus, { bg: string; fg: string }> = {
  received: { bg: "var(--chalk)", fg: "var(--navy-soft)" },
  handling: { bg: "var(--chalk)", fg: "var(--navy)" },
  options: { bg: "var(--ember-tint)", fg: "var(--ember-dk)" },
  chosen: { bg: "var(--ember-tint)", fg: "var(--ember-dk)" },
  issued: { bg: "#E8F7EE", fg: "#166534" },
  used: { bg: "var(--chalk)", fg: "var(--muted)" },
  closed: { bg: "var(--chalk)", fg: "var(--muted)" },
  cancelled: { bg: "var(--chalk)", fg: "var(--muted)" },
}

const URGENCY_TONE = ["var(--muted)", "#B45309", "#B91C1C"] as const

export default async function MinistryRequestsPage({ params }: { params: { org: string; token: string } }) {
  /* B2G-07 · sem a sessão do PIN desta secretária, nada (a moldura mostra o PIN). */
  const { lookup, signedIn } = await loadSecretarySpace(params.org, params.token)
  if (!lookup.ok) notFound()
  if (!signedIn) return null
  const { org } = lookup.ministry
  const t = getTranslator("pt")

  const [requests, balance] = await Promise.all([
    listMinistryRequests(org.id),
    org.secretarySeesBalance ? ministryBalance(org.id) : Promise.resolve(null),
  ])

  const date = (d: string | null) =>
    d ? new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00`)) : "—"
  const stamp = (iso: string) =>
    new Intl.DateTimeFormat("pt-PT", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Atlantic/Cape_Verde",
    }).format(new Date(iso))

  const card = (r: MinistryRequest) => {
    const tone = STATUS_TONE[r.status]
    return (
      <article key={r.caseId} className="card" style={{ padding: 14, marginTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <b style={{ fontSize: 17 }}>
            {r.origin ?? "—"} → {r.destination ?? "—"}
          </b>
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            {r.reference ?? ""}
          </span>
        </div>
        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 14 }}>
          {date(r.departDate)}
          {r.returnDate ? ` – ${date(r.returnDate)}` : ` · ${t("ministry.requests.oneway")}`} ·{" "}
          {t("ministry.requests.people", { count: r.people })}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
          <span
            style={{
              background: tone.bg,
              color: tone.fg,
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {t(`ministry.requests.status.${r.status}`)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: URGENCY_TONE[r.urgency] }}>
            {r.urgency > 0 ? "● " : ""}
            {t(`ministry.urgency.${r.urgency}`)}
          </span>
          {r.secretaryName && (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              · {t("ministry.requests.by", { name: r.secretaryName })}
            </span>
          )}
          {r.pnr && (
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              · PNR {r.pnr}
            </span>
          )}
        </div>
        {r.notes && (
          <p style={{ margin: "8px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>
            <b>{t("ministry.requests.notes")}:</b> {r.notes}
          </p>
        )}

        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 13, fontWeight: 700, color: "var(--navy-soft)", cursor: "pointer" }}>
            {t("ministry.requests.activity")}
          </summary>
          {r.timeline.length ? (
            <ol style={{ listStyle: "none", margin: "8px 0 0", padding: 0, borderLeft: "2px solid var(--line)" }}>
              {r.timeline.map((e, i) => (
                <li key={`${e.kind}-${i}`} style={{ padding: "4px 0 4px 12px", fontSize: 13 }}>
                  <span style={{ color: "var(--muted)", marginRight: 6 }}>{stamp(e.at)}</span>
                  {e.kind === "request_submitted" && e.secretaryName
                    ? t("ministry.timeline.request_submittedBy", { name: e.secretaryName })
                    : t(`ministry.timeline.${e.kind}`)}
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>{t("ministry.requests.noActivity")}</p>
          )}
        </details>

        {r.status !== "cancelled" && r.status !== "closed" && (
          <Link
            href={`/pc/${r.token}`}
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10, textDecoration: "none" }}
          >
            {t("ministry.requests.open")}
          </Link>
        )}
      </article>
    )
  }

  return (
    <>
      <PcTopbar currency={org.currency} lang="pt" />
      <main className="shell" style={{ paddingTop: 20 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{t("ministry.requests.title")}</h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          {t("ministry.requests.intro", { ministry: org.name })}
        </p>

        {balance != null && (
          <p className="card" style={{ padding: 14 }}>
            {t("ministry.requests.balance")}: <b>{formatAmount(balance, org.currency)}</b>
          </p>
        )}

        {requests.length ? (
          requests.map(card)
        ) : (
          <p className="card" style={{ padding: 18, color: "var(--muted)" }}>
            {t("ministry.requests.none")}
          </p>
        )}

        {/* MIN-06 · instalar como aplicação: Android num toque, iOS em três. */}
        <div style={{ marginTop: 18 }}>
          <InstallCard appName={org.name} />
        </div>
      </main>
    </>
  )
}
