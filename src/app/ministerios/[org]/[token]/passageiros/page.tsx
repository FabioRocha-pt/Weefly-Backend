import Link from "next/link"
import { notFound } from "next/navigation"

import { PcTopbar } from "@/components/pc/chrome"
import { listMinistryTravellers, loadSecretarySpace } from "@/lib/ministry"
import { getTranslator } from "@/i18n/server"

/**
 * B2G-25 · Passageiros: os passageiros guardados do ministério — só desse —,
 * com pesquisa por nome ou passaporte, e o aviso quando o passaporte está
 * expirado ou expira em menos de seis meses.
 *
 * Só leitura neste bloco: corrigir uma ficha e escolhê-la ao preencher os
 * passageiros de um pedido chegam com o bloco 6. O número do passaporte
 * aparece só pelos últimos caracteres.
 */

export const dynamic = "force-dynamic"

export default async function MinistryTravellersPage({
  params,
  searchParams,
}: {
  params: { org: string; token: string }
  searchParams: { q?: string | string[] }
}) {
  /* B2G-07 · sem a sessão do PIN desta secretária, nada (a moldura mostra o PIN). */
  const { lookup, signedIn } = await loadSecretarySpace(params.org, params.token)
  if (!lookup.ok) notFound()
  if (!signedIn) return null
  const { org } = lookup.ministry
  const t = getTranslator("pt")

  const q = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q ?? "").trim().slice(0, 80)
  const travellers = await listMinistryTravellers(org.id, q || null)
  const base = `/ministerios/${org.slug}/${org.token}/passageiros`

  const date = (d: string | null) =>
    d ? new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00`)) : "—"

  return (
    <>
      <PcTopbar currency={org.currency} lang="pt" />
      <main className="shell" style={{ paddingTop: 20 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{t("ministry.travellers.title")}</h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          {t("ministry.travellers.intro", { ministry: org.name })}
        </p>

        <form method="get" action={base} role="search" style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <div className="inp" style={{ flex: 1 }}>
            <input
              className="plain"
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t("ministry.travellers.search")}
              aria-label={t("ministry.travellers.search")}
            />
          </div>
          <button className="btn btn-ghost btn-sm" type="submit">
            {t("ministry.travellers.searchButton")}
          </button>
        </form>

        {q && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted)" }}>
            {t("ministry.travellers.count", { count: travellers.length })} ·{" "}
            <Link href={base}>{t("ministry.travellers.clear")}</Link>
          </p>
        )}

        {travellers.length === 0 ? (
          <p className="card" style={{ padding: 18, color: "var(--muted)" }}>
            {q ? t("ministry.travellers.noMatch", { q }) : t("ministry.travellers.none")}
          </p>
        ) : (
          travellers.map((tr) => (
            <article key={tr.id} className="card" style={{ padding: 14, marginTop: 10 }}>
              <b style={{ fontSize: 16 }}>
                {tr.lastName.toUpperCase()}, {tr.firstName}
              </b>
              <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>
                {tr.birthDate ? t("ministry.travellers.born", { date: date(tr.birthDate) }) : null}
                {tr.birthDate && tr.nationality ? " · " : null}
                {tr.nationality ?? null}
              </p>
              {(tr.passportTail || tr.passportExpiry) && (
                <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {tr.passportTail ? t("ministry.travellers.passport", { number: tr.passportTail }) : null}
                  {tr.passportExpiry ? ` · ${t("ministry.travellers.validUntil", { date: date(tr.passportExpiry) })}` : null}
                </p>
              )}
              {tr.passportWarning && (
                <p
                  role="note"
                  style={{
                    margin: "8px 0 0",
                    display: "inline-block",
                    background: tr.passportWarning === "expired" ? "#FEE2E2" : "#FEF3C7",
                    color: tr.passportWarning === "expired" ? "#B91C1C" : "#92400E",
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  ⚠ {t(`ministry.travellers.${tr.passportWarning}`)}
                </p>
              )}
            </article>
          ))
        )}
      </main>
    </>
  )
}
