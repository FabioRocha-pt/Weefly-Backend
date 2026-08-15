import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Mail,
  Phone,
  AlertTriangle,
  MessageSquare,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { getRequestNotes, getTravelRequest } from "@/lib/travel-requests"
import { STATUS_STYLES } from "@/lib/travel-request-status"
import { StatusSelector } from "@/components/admin/status-selector"
import { NoteForm } from "@/components/admin/note-form"
import { getI18n } from "@/i18n/server"
import type { Translator } from "@/i18n/translate"

export const dynamic = "force-dynamic"

function formatDate(value: string | null): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : value
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Atlantic/Cape_Verde",
  }).format(new Date(value))
}

/** "2 adultos · 1 criança" — só as contagens que não são zero. */
function passengers(
  t: Translator,
  r: { adults: number; children: number; infants: number }
) {
  const parts = [t("common.adults", { count: r.adults })]
  if (r.children > 0) parts.push(t("common.children", { count: r.children }))
  if (r.infants > 0) parts.push(t("common.infants", { count: r.infants }))
  return parts.join(" · ")
}

export default async function RequestDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { t } = getI18n()

  const request = await getTravelRequest(params.id)
  if (!request) notFound()

  const notes = await getRequestNotes(request.id)
  const lead = request.lead
  const phone = lead ? `${lead.phone_prefix ?? ""} ${lead.phone ?? ""}`.trim() : ""
  const route = `${request.origin} → ${request.destination}`

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-sm font-medium text-adm-muted transition-colors hover:text-adm-txt"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("adminRequests.backAll")}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-semibold text-adm-ember">
            {request.reference}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-adm-txt">{route}</h1>
          <p className="mt-1 text-sm text-adm-muted">
            {t("adminRequests.received", {
              when: formatDateTime(request.created_at),
              channel: t(`channels.${lead?.source_channel ?? ""}`),
            })}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium",
            STATUS_STYLES[request.status]
          )}
        >
          {t(`requestStatus.${request.status}`)}
        </span>
      </div>

      {/* Email delivery warning */}
      {(!request.team_notified || !request.email_sent) && (
        <div className="flex items-start gap-3 rounded-xl border border-adm-warn/30 bg-adm-warn/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adm-warn" />
          <div className="text-adm-warn">
            {!request.team_notified && <p>{t("adminRequests.warnTeam")}</p>}
            {!request.email_sent && <p>{t("adminRequests.warnClient")}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: details */}
        <div className="space-y-6 lg:col-span-2">
          <Panel title={t("adminRequests.panelContact")}>
            <dl className="divide-y divide-adm-line-soft">
              <Row
                label={t("adminRequests.fieldName")}
                value={lead?.full_name ?? "—"}
              />
              <Row
                label={t("auth.email")}
                value={
                  lead?.email ? (
                    <a
                      href={`mailto:${lead.email}`}
                      className="inline-flex items-center gap-1.5 font-medium text-adm-ember hover:text-adm-ember-dark"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {lead.email}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <Row
                label={t("onboarding.phone")}
                value={
                  phone ? (
                    <a
                      href={`tel:${phone.replace(/\s+/g, "")}`}
                      className="inline-flex items-center gap-1.5 font-medium text-adm-ember hover:text-adm-ember-dark"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {phone}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
            </dl>
          </Panel>

          <Panel title={t("adminRequests.panelRequest")}>
            <dl className="divide-y divide-adm-line-soft">
              <Row
                label={t("adminRequests.fieldTripType")}
                value={t(`tripTypes.${request.trip_type}`)}
              />
              <Row label={t("adminRequests.fieldRoute")} value={route} />
              <Row
                label={t("adminRequests.fieldDeparture")}
                value={formatDate(request.depart_date)}
              />
              {request.return_date && (
                <Row
                  label={t("adminRequests.fieldReturn")}
                  value={formatDate(request.return_date)}
                />
              )}
              <Row
                label={t("adminRequests.fieldPassengers")}
                value={passengers(t, request)}
              />
              <Row
                label={t("adminRequests.fieldCabin")}
                value={t(`cabins.${request.cabin_class}`)}
              />
            </dl>
          </Panel>

          <Panel title={t("adminRequests.panelNotes")}>
            <NoteForm id={request.id} />
            {notes.length > 0 && (
              <ul className="mt-5 space-y-3 border-t border-adm-line-soft pt-5">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-lg bg-adm-raise p-3 text-sm"
                  >
                    <p className="whitespace-pre-wrap text-adm-txt-2">
                      {note.body}
                    </p>
                    <p className="mt-2 text-xs text-adm-muted">
                      {note.author_email ?? t("adminRequests.noteTeam")} ·{" "}
                      {formatDateTime(note.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {notes.length === 0 && (
              <p className="mt-4 flex items-center gap-2 text-sm text-adm-muted">
                <MessageSquare className="h-4 w-4" />
                {t("adminRequests.noNotes")}
              </p>
            )}
          </Panel>
        </div>

        {/* Right: workflow */}
        <div className="space-y-6">
          <Panel title={t("adminRequests.panelStatus")}>
            <StatusSelector id={request.id} current={request.status} />
          </Panel>

          <Panel title={t("adminRequests.panelActions")}>
            <div className="space-y-2">
              {lead?.email && (
                <a
                  href={`mailto:${lead.email}?subject=${encodeURIComponent(
                    t("adminRequests.emailSubject", {
                      reference: request.reference,
                      route,
                    })
                  )}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-adm-ember px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-adm-ember-dark"
                >
                  <Mail className="h-4 w-4" />
                  {t("adminRequests.replyClient")}
                </a>
              )}
              {phone && (
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-adm-line px-4 py-2.5 text-sm font-semibold text-adm-txt-2 transition-colors hover:bg-adm-panel-2"
                >
                  <Phone className="h-4 w-4" />
                  {t("adminRequests.call")}
                </a>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-adm-line bg-adm-panel p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-adm-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-adm-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-adm-txt">{value}</dd>
    </div>
  )
}
