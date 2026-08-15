import Link from "next/link"
import { Search, Inbox, AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"
import { getRequestStats, listTravelRequests } from "@/lib/travel-requests"
import {
  REQUEST_STATUSES,
  STATUS_STYLES,
  type RequestStatus,
} from "@/lib/travel-request-status"
import { getI18n } from "@/i18n/server"
import type { Translator } from "@/i18n/translate"

export const dynamic = "force-dynamic"

const FILTERS = ["todos", ...REQUEST_STATUSES] as const

/** "YYYY-MM-DD" → "DD/MM/YYYY" without timezone drift. */
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

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string }
}) {
  const { t } = getI18n()

  const status = (
    FILTERS.includes(searchParams.status as (typeof FILTERS)[number])
      ? searchParams.status
      : "todos"
  ) as RequestStatus | "todos"
  const search = searchParams.q ?? ""

  const [requests, stats] = await Promise.all([
    listTravelRequests({ status, search }),
    getRequestStats(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-adm-ember">
          {t("common.concierge")}
        </p>
        <h1 className="text-2xl font-bold text-adm-txt">{t("adminRequests.title")}</h1>
        <p className="mt-1 text-adm-muted">{t("adminRequests.subtitle")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label={t("adminRequests.total")} value={stats.total} />
        {REQUEST_STATUSES.map((s) => (
          <StatTile key={s} label={t(`requestStatus.${s}`)} value={stats[s]} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f === status
            const href =
              f === "todos"
                ? `/admin/pedidos${search ? `?q=${encodeURIComponent(search)}` : ""}`
                : `/admin/pedidos?status=${f}${search ? `&q=${encodeURIComponent(search)}` : ""}`
            return (
              <Link
                key={f}
                href={href}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-adm-ember bg-adm-ember text-white"
                    : "border-adm-line bg-adm-panel text-adm-txt-2 hover:border-adm-muted"
                )}
              >
                {f === "todos"
                  ? t("adminRequests.filterAll")
                  : t(`requestStatus.${f}`)}
              </Link>
            )
          })}
        </div>

        <form action="/admin/pedidos" className="relative">
          {status !== "todos" && (
            <input type="hidden" name="status" value={status} />
          )}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adm-muted" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder={t("adminRequests.searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-adm-line bg-adm-panel pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-adm-muted focus:border-adm-ember sm:w-72"
          />
        </form>
      </div>

      {/* List */}
      {requests.length === 0 ? (
        <EmptyState t={t} hasFilters={status !== "todos" || Boolean(search)} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-adm-line bg-adm-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-adm-line bg-adm-raise text-xs uppercase tracking-wide text-adm-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("admin.colReference")}</th>
                <th className="px-4 py-3 font-semibold">{t("admin.colClient")}</th>
                <th className="px-4 py-3 font-semibold">{t("adminRequests.fieldRoute")}</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">
                  {t("adminRequests.colDeparture")}
                </th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">
                  {t("adminRequests.colReceived")}
                </th>
                <th className="px-4 py-3 font-semibold">{t("admin.colStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-adm-line-soft">
              {requests.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-adm-panel-2">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/pedidos/${r.id}`}
                      className="font-mono text-xs font-semibold text-adm-ember hover:text-adm-ember-dark"
                    >
                      {r.reference}
                    </Link>
                    {!r.team_notified && (
                      <span
                        title={t("adminRequests.notifyFailed")}
                        className="ml-2 inline-flex align-middle"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-adm-warn" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/pedidos/${r.id}`} className="block">
                      <span className="font-medium text-adm-txt">
                        {r.lead?.full_name ?? "—"}
                      </span>
                      <span className="block text-xs text-adm-muted">
                        {t(`channels.${r.lead?.source_channel ?? ""}`)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-adm-txt-2">
                    {r.origin} → {r.destination}
                  </td>
                  <td className="hidden px-4 py-3 text-adm-txt-2 md:table-cell">
                    {formatDate(r.depart_date)}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-adm-muted lg:table-cell">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
                        STATUS_STYLES[r.status]
                      )}
                    >
                      {t(`requestStatus.${r.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-adm-line bg-adm-panel px-4 py-3">
      <p className="text-xs font-medium text-adm-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-adm-txt">
        {value}
      </p>
    </div>
  )
}

function EmptyState({ t, hasFilters }: { t: Translator; hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-adm-line bg-adm-panel py-16 text-center">
      <Inbox className="mx-auto mb-4 h-10 w-10 text-adm-muted" />
      <p className="font-medium text-adm-txt">
        {hasFilters
          ? t("adminRequests.emptyFiltered")
          : t("adminRequests.emptyAll")}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-adm-muted">
        {hasFilters ? (
          <>
            {t("adminRequests.emptyFilteredHint")}{" "}
            <Link href="/admin/pedidos" className="font-medium text-adm-ember">
              {t("adminRequests.seeAll")}
            </Link>
          </>
        ) : (
          t("adminRequests.emptyAllHint")
        )}
      </p>
    </div>
  )
}
