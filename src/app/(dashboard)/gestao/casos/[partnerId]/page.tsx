import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoScope } from "@/lib/bo-scope"
import { getBoI18n } from "@/i18n/bo-server"
import { LOCALE_TAGS } from "@/i18n/config"
import { translateOr } from "@/i18n/translate"

/**
 * ADM-04 · um parceiro, organizado por ministério: cada ministério com os
 * seus casos, e os casos sem ministério (o retalho) no fim. Só leitura.
 */
export default async function AdminPartnerCasesPage({ params }: { params: { partnerId: string } }) {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner || !/^[0-9a-f-]{36}$/i.test(params.partnerId)) notFound()
  const { t, locale } = await getBoI18n()

  const { data: partner } = await scope.db
    .from("partners")
    .select("id, commercial_name")
    .eq("id", params.partnerId)
    .maybeSingle()
  if (!partner) notFound()
  const p = partner as { id: string; commercial_name: string }

  const [orgRes, caseRes] = await Promise.all([
    scope.db.from("organisations").select("id, name, active").eq("partner_id", p.id).order("name"),
    scope.db
      .from("booking_cases")
      .select("id, stage, pnr, issued_at, created_at, organisation_id, trip_request:trip_requests(reference, origin, destination, depart_date)")
      .eq("partner_id", p.id)
      .order("created_at", { ascending: false })
      .limit(500),
  ])
  const orgs = (orgRes.data ?? []) as { id: string; name: string; active: boolean }[]
  const cases = ((caseRes.data ?? []) as Record<string, any>[]).map((c) => {
    const trip = Array.isArray(c.trip_request) ? c.trip_request[0] : c.trip_request
    return {
      id: c.id as string,
      stage: c.stage as string,
      pnr: (c.pnr as string | null) ?? null,
      issuedAt: (c.issued_at as string | null) ?? null,
      createdAt: c.created_at as string,
      organisationId: (c.organisation_id as string | null) ?? null,
      reference: trip?.reference ?? null,
      route: trip ? `${trip.origin} → ${trip.destination}` : "—",
      departDate: trip?.depart_date ?? null,
    }
  })

  const groups = [
    ...orgs.map((o) => ({ key: o.id, label: o.name, inactive: !o.active, rows: cases.filter((c) => c.organisationId === o.id) })),
    { key: "none", label: t("bo.adminCases.noMinistry"), inactive: false, rows: cases.filter((c) => !c.organisationId) },
  ].filter((g) => g.rows.length > 0 || g.key !== "none")

  const dt = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "short" })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/gestao/casos" className="text-sm text-slate-500 hover:text-slate-900">
          ← {t("bo.adminCases.title")}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{p.commercial_name}</h1>
        <p className="text-slate-500 mt-1">{t("bo.adminCases.partnerSubtitle", { count: cases.length })}</p>
      </div>

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {g.key !== "none" ? (
              <Link href={`/gestao/b2g/m/${g.key}`} className="hover:text-orange-700">
                {g.label}
              </Link>
            ) : (
              g.label
            )}
            {g.inactive && ` · ${t("bo.b2g.detail.inactive")}`} · {g.rows.length}
          </h2>
          {g.rows.length === 0 ? (
            <p className="text-sm text-slate-500">{t("bo.b2g.cases.empty")}</p>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t("bo.b2g.cases.reference")}</th>
                    <th className="px-4 py-3">{t("bo.b2g.cases.route")}</th>
                    <th className="px-4 py-3">{t("bo.adminCases.departure")}</th>
                    <th className="px-4 py-3">{t("bo.b2g.cases.stage")}</th>
                    <th className="px-4 py-3">PNR</th>
                    <th className="px-4 py-3">{t("bo.b2g.cases.created")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {g.rows.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 font-mono">
                        <Link href={`/gestao/casos/c/${c.id}`} className="text-orange-700 hover:underline">
                          {c.reference ?? c.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{c.route}</td>
                      <td className="px-4 py-2 text-slate-600">{c.departDate ?? "—"}</td>
                      <td className="px-4 py-2">{translateOr(t, `caseStages.${c.stage}`, c.stage)}</td>
                      <td className="px-4 py-2 font-mono">{c.pnr ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{dt.format(new Date(c.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
