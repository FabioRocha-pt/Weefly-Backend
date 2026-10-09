import Link from "next/link"

import { formatAmount } from "@/lib/case-status"
import { partnerSiteUrl } from "@/lib/site-url"
import type { OrganisationDetail, AlertRecipient } from "@/lib/b2g"
import { passportExpiringSoon, type Traveller } from "@/lib/travellers"
import { LOCALE_TAGS } from "@/i18n/config"
import type { Translator } from "@/i18n/translate"
import {
  AdjustForm,
  CreditForm,
  EditOrganisation,
  RecipientsEditor,
  ThresholdForm,
} from "@/components/b2g/b2g-forms"
import { SecretaryManager } from "@/components/b2g/secretaries"

/**
 * WeeFly · B2G · um ministério, por inteiro: saldo, secretárias (B2G-06),
 * limite, movimentos, alertas e casos.
 *
 * O mesmo ecrã para o backoffice do parceiro (PAR-02 a PAR-05) e para o espaço
 * B2G do Admin (ADM-08). No Admin é só de leitura, com uma excepção explícita:
 * corrigir o saldo (`AdjustForm`), que pede confirmação e motivo.
 */
export function OrganisationDetailView({
  detail,
  partner,
  mode,
  canManage,
  recipients,
  travellers = [],
  viewer,
  t,
  locale,
}: {
  detail: OrganisationDetail
  partner: { id: string; slug: string; is_operator: boolean; name: string }
  mode: "partner" | "admin"
  canManage: boolean
  recipients: AlertRecipient[]
  /** DAT-01 · as fichas dos viajantes do ministério. */
  travellers?: Traveller[]
  /** B2G-06 · quem está a ver: decide quem gere secretárias e gera PIN. */
  viewer: { email: string; isManager: boolean; crossPartner: boolean; backoffice: boolean }
  t: Translator
  locale: "pt" | "en"
}) {
  const { org } = detail
  const money = (v: number) => formatAmount(v, org.currency)
  const dt = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "short", timeStyle: "short" })
  const siteBase = partnerSiteUrl({ slug: partner.slug, isOperator: partner.is_operator })
  /* Decisão 5 · secretárias: qualquer conta do back-office da empresa, ou a WeeFly. */
  const manageSecretaries = viewer.crossPartner || (mode === "partner" && viewer.backoffice)
  const writable = mode === "partner" && canManage
  /* D-10 · editar: a empresa muda os limites; a WeeFly, também o nome e os logótipos. */
  const editable = writable || (mode === "admin" && viewer.crossPartner)
  const below = org.threshold != null && org.balance < org.threshold
  /* ADM-04 · no Admin, o caso abre em leitura. */
  const caseHref = (id: string) => (mode === "partner" ? `/admin/price-checker/${id}` : `/gestao/casos/c/${id}`)
  const expiring = travellers.filter((tr) => passportExpiringSoon(tr.passportExpiry)).length

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt={org.name} className="h-12 w-auto" />
          ) : org.crestUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.crestUrl} alt="" className="h-12 w-12 object-contain" />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{org.name}</h1>
            <p className="text-slate-500 text-sm">
              {partner.name} · <span className="font-mono">{org.slug}</span>
              {!org.active && ` · ${t("bo.b2g.detail.inactive")}`}
            </p>
          </div>
        </div>
        {editable && (
          <EditOrganisation
            identityEditable={viewer.crossPartner}
            initial={{
              id: org.id,
              name: org.name,
              slug: org.slug,
              logoUrl: org.logoUrl ?? "",
              crestUrl: org.crestUrl ?? "",
              alertThresholdAmount: org.alertThresholdAmount != null ? String(org.alertThresholdAmount / 100) : "",
              alertThresholdPercent: org.alertThresholdPercent != null ? String(org.alertThresholdPercent) : "",
              secretarySeesBalance: org.secretarySeesBalance,
            }}
          />
        )}
      </div>

      {mode === "admin" && (
        <p className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">{t("bo.b2g.admin.readOnly")}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-2xl border p-5 ${below ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("bo.b2g.detail.balance")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{money(org.balance)}</p>
          <p className="text-sm text-slate-500">
            {org.threshold != null
              ? t("bo.b2g.detail.threshold", { value: money(org.threshold) })
              : t("bo.b2g.detail.noThreshold")}
          </p>
          {below && <p className="mt-1 text-sm font-semibold text-red-700">{t("bo.b2g.detail.below")}</p>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("bo.secretaries.title")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{org.activeSecretaries.length}</p>
          <p className="text-sm text-slate-500">{org.activeSecretaries.join(", ") || "—"}</p>
          <p className="mt-1 text-xs text-slate-500">
            {org.secretarySeesBalance ? t("bo.b2g.detail.secretarySees") : t("bo.b2g.detail.secretaryNotSees")}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("bo.b2g.detail.requests")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{org.requests}</p>
          <p className="text-sm text-slate-500">
            {org.lastAlertAt ? t("bo.b2g.detail.lastAlert", { when: dt.format(new Date(org.lastAlertAt)) }) : t("bo.b2g.detail.noAlerts")}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">{t("bo.secretaries.title")}</h2>
        <p className="text-sm text-slate-500">{t("bo.secretaries.subtitle")}</p>
        <SecretaryManager
          orgId={org.id}
          secretaries={detail.secretaries}
          siteBase={siteBase}
          viewer={{ email: viewer.email, isManager: viewer.isManager, crossPartner: viewer.crossPartner }}
          canManage={manageSecretaries && org.active}
        />
      </section>

      {writable && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
          <h2 className="font-semibold text-slate-900">{t("bo.b2g.budget.title")}</h2>
          <CreditForm orgId={org.id} currency={org.currency} />
          <hr className="border-slate-100" />
          <ThresholdForm
            orgId={org.id}
            amount={org.alertThresholdAmount != null ? String(org.alertThresholdAmount / 100) : ""}
            percent={org.alertThresholdPercent != null ? String(org.alertThresholdPercent) : ""}
          />
        </section>
      )}

      {mode === "admin" && canManage && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">{t("bo.b2g.adjust.title")}</h2>
          <AdjustForm orgId={org.id} currency={org.currency} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.b2g.history.title")}</h2>
        {detail.movements.length === 0 ? (
          <p className="text-sm text-slate-500">{t("bo.b2g.history.empty")}</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("bo.b2g.history.date")}</th>
                  <th className="px-4 py-3">{t("bo.b2g.history.kind")}</th>
                  <th className="px-4 py-3 text-right">{t("bo.b2g.history.value")}</th>
                  <th className="px-4 py-3">{t("bo.b2g.history.reference")}</th>
                  <th className="px-4 py-3">{t("bo.b2g.history.who")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">{dt.format(new Date(m.createdAt))}</td>
                    <td className="px-4 py-2">{t(`bo.b2g.history.kinds.${m.kind}`)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${m.delta < 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {m.delta > 0 ? "+" : ""}
                      {money(m.delta)}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {[m.reference, m.documentRef, m.reason].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{m.createdByEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.b2g.alerts.title")}</h2>
        {detail.alerts.length === 0 ? (
          <p className="text-sm text-slate-500">{t("bo.b2g.alerts.empty")}</p>
        ) : (
          <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {detail.alerts.map((a) => (
              <li key={a.id} className="px-4 py-2">
                {a.alertDay} · {t("bo.b2g.alerts.line", { balance: money(a.balance), threshold: money(a.threshold), email: a.emailSent, whatsapp: a.whatsappSent })}
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">{t("bo.b2g.recipients.title")}</h3>
          {canManage ? (
            <RecipientsEditor
              partnerId={partner.id}
              recipients={recipients.filter((r) => !r.organisationId || r.organisationId === org.id)}
              organisations={[{ id: org.id, name: org.name }]}
              sides={mode === "admin" ? ["weefly", "partner"] : ["partner"]}
            />
          ) : (
            <p className="text-sm text-slate-500">
              {recipients.filter((r) => r.active).map((r) => r.name ?? r.email ?? r.whatsapp).join(", ") || t("bo.b2g.recipients.none")}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t("bo.travellers.title")} · {travellers.length}
          {expiring > 0 && <span className="ml-2 normal-case text-amber-700">⚠ {t("bo.travellers.expiringCount", { count: expiring })}</span>}
        </h2>
        {travellers.length === 0 ? (
          <p className="text-sm text-slate-500">{t("bo.travellers.empty")}</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("bo.travellers.name")}</th>
                  <th className="px-4 py-3">{t("bo.travellers.passport")}</th>
                  <th className="px-4 py-3">{t("bo.travellers.expiry")}</th>
                  <th className="px-4 py-3">{t("bo.travellers.contact")}</th>
                  <th className="px-4 py-3">{t("bo.travellers.updated")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {travellers.map((tr) => {
                  const soon = passportExpiringSoon(tr.passportExpiry)
                  const name = `${tr.lastName}/${tr.firstName}`.toUpperCase()
                  return (
                    <tr key={tr.id}>
                      <td className="px-4 py-2 font-medium">
                        {mode === "partner" ? (
                          <Link href={`/agente/ministerios/${org.id}/viajantes/${tr.id}`} className="text-orange-700 hover:underline">
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono">{tr.passportNumber ?? "—"}</td>
                      <td className={`px-4 py-2 font-mono ${soon ? "text-amber-700 font-semibold" : ""}`}>
                        {tr.passportExpiry ?? "—"}
                        {soon ? ` ⚠ ${t("bo.travellers.expiringSoon")}` : ""}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{[tr.phone, tr.email].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{dt.format(new Date(tr.updatedAt))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.b2g.cases.title")}</h2>
        {detail.cases.length === 0 ? (
          <p className="text-sm text-slate-500">{t("bo.b2g.cases.empty")}</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("bo.b2g.cases.reference")}</th>
                  <th className="px-4 py-3">{t("bo.b2g.cases.route")}</th>
                  <th className="px-4 py-3">{t("bo.b2g.cases.stage")}</th>
                  <th className="px-4 py-3">{t("bo.b2g.cases.external")}</th>
                  <th className="px-4 py-3">{t("bo.b2g.cases.created")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.cases.map((c) => {
                  const href = caseHref(c.caseId)
                  return (
                    <tr key={c.caseId}>
                      <td className="px-4 py-2 font-mono">
                        {href ? <Link href={href} className="text-orange-700 hover:underline">{c.reference ?? c.caseId.slice(0, 8)}</Link> : (c.reference ?? c.caseId.slice(0, 8))}
                      </td>
                      <td className="px-4 py-2">{c.route}</td>
                      <td className="px-4 py-2">{c.stage}</td>
                      <td className="px-4 py-2">{c.externalPaid ? "✓" : "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{dt.format(new Date(c.createdAt))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
