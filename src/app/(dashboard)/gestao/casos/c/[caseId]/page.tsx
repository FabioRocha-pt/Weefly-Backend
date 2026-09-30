import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoScope, liveIntervention } from "@/lib/bo-scope"
import { formatAmount } from "@/lib/case-status"
import { getBoI18n } from "@/i18n/bo-server"
import { LOCALE_TAGS } from "@/i18n/config"
import { translateOr } from "@/i18n/translate"
import { InterveneForm } from "@/components/admin/intervention"

/**
 * ADM-04 · um caso de qualquer parceiro, em leitura: o pedido, a oferta
 * escolhida, os passageiros, o pagamento, a emissão e o histórico. Não há um
 * único botão que mude o caso — mudar é "Intervir", que regista quem e porquê.
 *
 * Um caso do próprio parceiro da conta (a WeeFly) abre direto no Concierge:
 * aí o Admin não está a entrar na casa de ninguém.
 */
export default async function AdminCaseReadPage({ params }: { params: { caseId: string } }) {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner || !/^[0-9a-f-]{36}$/i.test(params.caseId)) notFound()
  const { t, locale } = await getBoI18n()

  const { data } = await scope.db
    .from("booking_cases")
    .select(
      `id, stage, pnr, issued_at, created_at, cost_real, issuing_carrier, consolidator, partner_id,
       partner:partners(id, commercial_name),
       organisation:organisations(id, name),
       trip_request:trip_requests(reference, trip_type, origin, destination, depart_date, return_date, adults, children, infants, currency,
         lead:leads(full_name, email, phone_e164)),
       passengers:case_passengers(position, first_name, last_name, passenger_type, nationality, passport_expiry, ticket_number),
       payments:case_payments(status, amount, received_amount, currency, created_at)`
    )
    .eq("id", params.caseId)
    .maybeSingle()
  if (!data) notFound()
  const c = data as Record<string, any>
  const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null
  const partner = one(c.partner) as { id: string; commercial_name: string } | null
  const org = one(c.organisation) as { id: string; name: string } | null
  const trip = one(c.trip_request) as Record<string, any> | null
  const lead = trip ? (one(trip.lead) as Record<string, any> | null) : null
  const passengers = ((c.passengers ?? []) as Record<string, any>[]).sort((a, b) => a.position - b.position)
  const payments = ((c.payments ?? []) as Record<string, any>[]).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  )

  const [{ data: evData }, intervention] = await Promise.all([
    scope.db
      .from("case_events")
      .select("id, kind, title, detail, actor_email, created_at")
      .eq("case_id", params.caseId)
      .order("created_at", { ascending: false })
      .limit(60),
    liveIntervention(params.caseId),
  ])
  const events = (evData ?? []) as { id: string; kind: string; title: string; detail: string | null; actor_email: string | null; created_at: string }[]

  const own = c.partner_id === scope.partnerId
  const dt = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "short", timeStyle: "short" })
  const currency = String(payments[0]?.currency ?? trip?.currency ?? "EUR")

  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-900">{value ?? "—"}</p>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={partner ? `/gestao/casos/${partner.id}` : "/gestao/casos"} className="text-sm text-slate-500 hover:text-slate-900">
            ← {partner?.commercial_name ?? t("bo.adminCases.title")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            <span className="font-mono">{trip?.reference ?? c.id.slice(0, 8)}</span> · {trip ? `${trip.origin} → ${trip.destination}` : "—"}
          </h1>
          <p className="text-slate-500 mt-1">
            {partner?.commercial_name}
            {org ? ` · ${org.name}` : ""} · {translateOr(t, `caseStages.${c.stage}`, c.stage)}
          </p>
        </div>
        {own || intervention ? (
          <Link
            href={`/admin/price-checker/${c.id}`}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            {t("bo.adminCases.openInConcierge")}
          </Link>
        ) : (
          <InterveneForm caseId={c.id} />
        )}
      </div>

      {!own && (
        <p className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
          {intervention ? t("bo.adminCases.intervening", { reason: intervention.reason }) : t("bo.adminCases.readOnlyCase")}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {fact(t("bo.adminCases.client"), lead?.full_name)}
        {fact(t("bo.adminCases.contact"), [lead?.email, lead?.phone_e164].filter(Boolean).join(" · ") || null)}
        {fact(t("bo.adminCases.departure"), trip?.depart_date)}
        {fact(t("bo.adminCases.return"), trip?.return_date)}
        {fact(t("bo.adminCases.pax"), trip ? `${trip.adults ?? 0} · ${trip.children ?? 0} · ${trip.infants ?? 0}` : null)}
        {fact("PNR", c.pnr)}
        {fact(t("bo.adminCases.issuedAt"), c.issued_at ? dt.format(new Date(c.issued_at)) : null)}
        {fact(t("bo.finance.cost"), c.cost_real != null ? formatAmount(Number(c.cost_real), currency) : null)}
        {fact(t("bo.adminCases.carrier"), [c.issuing_carrier, c.consolidator].filter(Boolean).join(" · ") || null)}
        {fact(t("bo.adminCases.created"), dt.format(new Date(c.created_at)))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.adminCases.passengers")}</h2>
        {passengers.length === 0 ? (
          <p className="text-sm text-slate-500">{t("bo.caseView.pax.none")}</p>
        ) : (
          <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {passengers.map((p) => (
              <li key={p.position} className="px-4 py-2 flex flex-wrap gap-x-4">
                <b>{`${p.last_name}/${p.first_name}`.toUpperCase()}</b>
                <span className="text-slate-500">{translateOr(t, `bo.caseView.pax.type.${p.passenger_type}`, p.passenger_type)}</span>
                <span className="text-slate-500">{p.nationality ?? "—"}</span>
                <span className="text-slate-500">{t("bo.caseView.pax.validUntil")} {p.passport_expiry ?? "—"}</span>
                {p.ticket_number && <span className="font-mono">{p.ticket_number}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.adminCases.payments")}</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">—</p>
        ) : (
          <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {payments.map((p, i) => (
              <li key={i} className="px-4 py-2 flex gap-4">
                <span className="font-mono">{p.status}</span>
                <span>{formatAmount(Number(p.received_amount ?? p.amount), p.currency)}</span>
                <span className="text-slate-500">{dt.format(new Date(p.created_at))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.adminCases.history")}</h2>
        <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
          {events.map((e) => (
            <li key={e.id} className="px-4 py-2">
              <span className="text-slate-500">{dt.format(new Date(e.created_at))}</span> ·{" "}
              <b>{translateOr(t, `bo.events.${e.kind}`, e.title)}</b>
              {e.detail ? ` · ${e.detail}` : ""}
              {e.actor_email ? <span className="text-slate-500"> · {e.actor_email}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
