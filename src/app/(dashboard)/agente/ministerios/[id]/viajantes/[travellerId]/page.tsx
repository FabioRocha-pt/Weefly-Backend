import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoScope } from "@/lib/bo-scope"
import { loadTraveller, passportExpiringSoon } from "@/lib/travellers"
import { TravellerForm } from "@/components/b2g/traveller-form"
import { getBoI18n } from "@/i18n/bo-server"
import { LOCALE_TAGS } from "@/i18n/config"
import { translateOr } from "@/i18n/translate"

/**
 * DAT-01 · a ficha de um viajante do ministério: editável, com o histórico de
 * alterações por baixo (quem, quando, de onde, e o antes e o depois).
 */
export default async function TravellerPage({ params }: { params: { id: string; travellerId: string } }) {
  const scope = await getBoScope()
  if (!scope?.partnerId || !/^[0-9a-f-]{36}$/i.test(params.id)) notFound()

  /* TEN-03 · o ministério tem de ser do parceiro da sessão. */
  const { data: org } = await scope.db
    .from("organisations")
    .select("id, name")
    .eq("id", params.id)
    .eq("partner_id", scope.partnerId)
    .maybeSingle()
  if (!org) notFound()
  const o = org as { id: string; name: string }

  const loaded = await loadTraveller(scope, o.id, params.travellerId)
  if (!loaded) notFound()
  const { traveller: tr, changes } = loaded

  const { t, locale } = await getBoI18n()
  const dt = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "short", timeStyle: "short" })
  const soon = passportExpiringSoon(tr.passportExpiry)
  const show = (v: unknown) => (v == null || v === "" ? "—" : String(v))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href={`/agente/ministerios/${o.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {o.name}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{`${tr.lastName}/${tr.firstName}`.toUpperCase()}</h1>
        {soon && (
          <p className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
            ⚠ {t("bo.travellers.expiringBanner", { date: tr.passportExpiry ?? "" })}
            {tr.expiryAlertedAt ? ` · ${t("bo.travellers.alertSent", { when: dt.format(new Date(tr.expiryAlertedAt)) })}` : ""}
          </p>
        )}
      </div>

      <TravellerForm
        initial={{
          id: tr.id,
          title: (tr.title ?? "") as "" | "mr" | "mrs" | "ms",
          firstName: tr.firstName,
          lastName: tr.lastName,
          gender: (tr.gender === "f" || tr.gender === "m" ? tr.gender : "") as "" | "f" | "m",
          birthDate: tr.birthDate ?? "",
          nationality: tr.nationality ?? "",
          passportNumber: tr.passportNumber ?? "",
          passportExpiry: tr.passportExpiry ?? "",
          issuingCountry: tr.issuingCountry ?? "",
          phone: tr.phone ?? "",
          email: tr.email ?? "",
        }}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.travellers.history")}</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-slate-500">—</p>
        ) : (
          <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {changes.map((c) => (
              <li key={c.id} className="px-4 py-3 space-y-1">
                <p className="text-slate-600">
                  {dt.format(new Date(c.createdAt))} · {translateOr(t, `bo.travellers.sources.${c.source}`, c.source)}
                  {c.changedByEmail ? ` · ${c.changedByEmail}` : ""}
                  {c.caseId && (
                    <>
                      {" · "}
                      <Link href={`/admin/price-checker/${c.caseId}`} className="text-orange-700 hover:underline">
                        {t("bo.travellers.fromCase")}
                      </Link>
                    </>
                  )}
                </p>
                <ul className="text-xs text-slate-700">
                  {c.fields.map(([k, before, after]) => (
                    <li key={k}>
                      <b>{translateOr(t, `bo.travellers.columns.${k}`, k)}</b>: {show(before)} → {show(after)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
