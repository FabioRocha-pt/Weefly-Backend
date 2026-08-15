import Link from "next/link"
import { notFound } from "next/navigation"
import { Users, Ticket, ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  getCase,
  getCasePassengers,
  getCasePayment,
} from "@/lib/booking-cases"
import { conversationForCase, getMessages } from "@/lib/conversations"
import { isWeePayConfigured } from "@/lib/weepay"
import { CaseConversation } from "@/components/admin/case-conversation"
import { getI18n } from "@/i18n/server"
import { PayLinkForm } from "@/components/admin/pay-link-form"
import { PaymentPanel } from "@/components/admin/payment-panel"

export const dynamic = "force-dynamic"

function formatDate(value: string | null): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : value
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Atlantic/Cape_Verde",
  }).format(new Date(value))
}

export default async function CaseDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { t } = getI18n()
  const bookingCase = await getCase(params.id)
  if (!bookingCase) notFound()

  const [passengers, payment, conversation] = await Promise.all([
    getCasePassengers(bookingCase.id),
    getCasePayment(bookingCase.id),
    conversationForCase(bookingCase.id),
  ])

  const chatMessages = conversation
    ? await getMessages(conversation.id)
    : []

  const trip = bookingCase.trip_request

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {conversation && (
            <Panel title={t("admin.panelConversation")}>
              <CaseConversation
                caseId={bookingCase.id}
                messages={chatMessages}
                conversationToken={conversation.token}
              />
            </Panel>
          )}

          {/* onde está o cliente */}
          <Panel title={t("admin.panelWhereClient")}>
            <ul className="divide-y divide-adm-line-soft">
              {bookingCase.links.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]"
                >
                  <span className="font-medium text-adm-txt">
                    {l.stage}. {t("linkStages." + l.stage)}
                  </span>
                  <span className="flex items-center gap-3 text-[11px] text-adm-muted">
                    {l.first_opened_at && (
                      <span>
                        {t("admin.opened", {
                          when: formatDateTime(l.first_opened_at),
                        })}
                      </span>
                    )}
                    {l.submitted_at && (
                      <span className="text-adm-ok">
                        {t("admin.filled", {
                          when: formatDateTime(l.submitted_at),
                        })}
                      </span>
                    )}
                    <span
                      className={cn(
                        "font-semibold",
                        l.status === "submetido"
                          ? "text-adm-ok"
                          : l.status === "ativo"
                            ? "text-adm-txt-2"
                            : "text-adm-muted"
                      )}
                    >
                      {t("linkStatus." + l.status)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {trip && (
            <Panel title={t("admin.panelTrip")}>
              <dl className="divide-y divide-adm-line-soft">
                <Row
                  label={t("admin.tripRoute")}
                  value={`${trip.origin} → ${trip.destination}`}
                />
                <Row label={t("admin.tripDepart")} value={formatDate(trip.depart_date)} />
                {trip.return_date && (
                  <Row
                    label={t("admin.tripReturn")}
                    value={formatDate(trip.return_date)}
                  />
                )}
                <Row
                  label={t("admin.tripPassengers")}
                  value={`${trip.adults + trip.children + trip.infants}`}
                />
              </dl>
              <Link
                href={`/admin/pedidos/${trip.id}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-adm-ember hover:text-adm-ember-dark"
              >
                {t("admin.seeFullRequest")}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Panel>
          )}

          <Panel title={t("admin.panelPassengers")}>
            {passengers.length === 0 ? (
              <p className="flex items-center gap-2 text-[13px] text-adm-muted">
                <Users className="h-4 w-4" />
                {t("admin.noPassengersYet")}{" "}
                <Link
                  href={`/admin/casos/${bookingCase.id}/ofertas`}
                  className="font-semibold text-adm-ember hover:text-adm-ember-dark"
                >
                  {t("admin.link2")}
                </Link>
                .
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="text-[11px] uppercase tracking-wider text-adm-muted">
                    <tr>
                      <th className="pb-2 font-semibold">{t("admin.colName")}</th>
                      <th className="pb-2 font-semibold">{t("admin.colType")}</th>
                      <th className="pb-2 font-semibold">
                        {t("admin.colPassport")}
                      </th>
                      <th className="pb-2 font-semibold">
                        {t("admin.colValidUntil")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-adm-line-soft">
                    {passengers.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 font-medium text-adm-txt">
                          {p.first_name} {p.last_name}
                          <span className="block text-[11px] font-normal text-adm-muted">
                            {p.nationality} · {formatDate(p.birth_date)}
                          </span>
                        </td>
                        <td className="py-2.5 text-adm-txt-2">
                          {t("passengerTypes." + p.passenger_type)}
                        </td>
                        <td className="py-2.5 font-mono text-[12px] text-adm-txt-2">
                          {p.passport_number}
                        </td>
                        <td className="py-2.5 text-adm-txt-2">
                          {formatDate(p.passport_expiry)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title={t("admin.panelPayment")}>
            {!payment ? (
              <>
                <p className="mb-4 text-[13px] leading-relaxed text-adm-muted">
                  {t("admin.payAutoHint")}{" "}
                  <Link
                    href={`/admin/casos/${bookingCase.id}/ofertas`}
                    className="font-semibold text-adm-ember hover:text-adm-ember-dark"
                  >
                    {t("admin.payOffersTab")}
                  </Link>
                  {t("admin.payManualHint")}
                </p>
                <PayLinkForm caseId={bookingCase.id} />
              </>
            ) : (
              <div className="space-y-4">
                <PaymentPanel
                  caseId={bookingCase.id}
                  payment={payment}
                  weepayConfigured={isWeePayConfigured()}
                  declaredAt={payment.client_declared_paid_at}
                  lastCheckedAt={payment.last_checked_at}
                  failureReason={payment.failure_reason}
                />
              </div>
            )}
          </Panel>

          {payment?.status === "COMPLETED" &&
            bookingCase.stage !== "emitido" && (
              <Panel title={t("admin.panelIssue")}>
                <p className="mb-3 flex items-center gap-2 text-[13px] text-adm-muted">
                  <Ticket className="h-4 w-4" />
                  {t("admin.issueHint")}
                </p>
                <IssueTicketsForm caseId={bookingCase.id} />
              </Panel>
            )}
        </div>
    </div>
  )
}

/** Server-action form — no client state needed for a single button. */
function IssueTicketsForm({ caseId }: { caseId: string }) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server"
        const { markTicketsIssued } = await import("@/actions/booking-cases")
        formData.set("caseId", caseId)
        await markTicketsIssued(formData)
      }}
    >
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-adm-ember px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-adm-ember-dark"
      >
        <Ticket className="h-4 w-4" />
        Marcar bilhetes como emitidos
      </button>
    </form>
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
      <h2 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-adm-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-adm-muted">{label}</dt>
      <dd className="text-right text-[13px] font-medium text-adm-txt">
        {value}
      </dd>
    </div>
  )
}
