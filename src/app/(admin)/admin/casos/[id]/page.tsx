import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Users, Ticket, ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  getCase,
  getCasePassengers,
  getCasePayment,
} from "@/lib/booking-cases"
import {
  CASE_STAGE_CHIP,
  CASE_STAGE_DISPLAY,
  LINK_STAGE_NAMES,
  LINK_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  WAITING_DOT,
  elapsedSince,
  formatAmount,
  type CaseStage,
} from "@/lib/case-status"
import { CaseLinkButtons } from "@/components/admin/case-link-buttons"
import { PayLinkForm, MarkPaidButton } from "@/components/admin/pay-link-form"

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

const TYPE_LABELS: Record<string, string> = {
  adult: "Adulto",
  child: "Criança",
  infant: "Bebé",
}

export default async function CaseDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const bookingCase = await getCase(params.id)
  if (!bookingCase) notFound()

  const [passengers, payment] = await Promise.all([
    getCasePassengers(bookingCase.id),
    getCasePayment(bookingCase.id),
  ])

  const trip = bookingCase.trip_request
  const display = CASE_STAGE_DISPLAY[bookingCase.stage as CaseStage]

  return (
    <div className="space-y-5">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-adm-muted transition-colors hover:text-adm-txt"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Links de atendimento
      </Link>

      {/* case bar */}
      <div className="rounded-xl border border-adm-line bg-adm-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold text-adm-txt">
                {trip?.lead?.full_name ?? "Aguarda preenchimento"}
              </h1>
              {trip?.reference && (
                <span className="rounded-md bg-adm-raise px-2 py-1 font-mono text-[12px] text-adm-txt-2">
                  {trip.reference}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                  CASE_STAGE_CHIP[bookingCase.stage as CaseStage]
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    WAITING_DOT[display.waiting]
                  )}
                />
                {display.code} · {display.label}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              <Meta label="Contacto">
                {trip?.lead?.email ?? "—"}
                {trip?.lead?.phone
                  ? ` · ${trip.lead.phone_prefix ?? ""} ${trip.lead.phone}`.trimEnd()
                  : ""}
              </Meta>
              <Meta label="Criado">
                {formatDateTime(bookingCase.created_at)}
              </Meta>
              <Meta label="Sem mexer há">
                {elapsedSince(bookingCase.updated_at)}
              </Meta>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <CaseLinkButtons
              token={bookingCase.token}
              links={bookingCase.links}
            />
            <span className="text-[11px] text-adm-muted">
              clique para copiar o endereço
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* onde está o cliente */}
          <Panel title="Onde está o cliente">
            <ul className="divide-y divide-adm-line-soft">
              {bookingCase.links.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]"
                >
                  <span className="font-medium text-adm-txt">
                    {l.stage}. {LINK_STAGE_NAMES[l.stage]}
                  </span>
                  <span className="flex items-center gap-3 text-[11px] text-adm-muted">
                    {l.first_opened_at && (
                      <span>Aberto {formatDateTime(l.first_opened_at)}</span>
                    )}
                    {l.submitted_at && (
                      <span className="text-adm-ok">
                        Preenchido {formatDateTime(l.submitted_at)}
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
                      {LINK_STATUS_LABELS[l.status]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {trip && (
            <Panel title="Pedido de viagem">
              <dl className="divide-y divide-adm-line-soft">
                <Row
                  label="Trajeto"
                  value={`${trip.origin} → ${trip.destination}`}
                />
                <Row label="Partida" value={formatDate(trip.depart_date)} />
                {trip.return_date && (
                  <Row label="Regresso" value={formatDate(trip.return_date)} />
                )}
                <Row
                  label="Passageiros"
                  value={`${trip.adults + trip.children + trip.infants}`}
                />
              </dl>
              <Link
                href={`/admin/pedidos/${trip.id}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-adm-ember hover:text-adm-ember-dark"
              >
                Ver pedido completo
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Panel>
          )}

          <Panel title="Passageiros">
            {passengers.length === 0 ? (
              <p className="flex items-center gap-2 text-[13px] text-adm-muted">
                <Users className="h-4 w-4" />
                Ainda sem dados. Partilhe o{" "}
                <b className="text-adm-txt-2">2 link</b> para o cliente
                preencher.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="text-[11px] uppercase tracking-wider text-adm-muted">
                    <tr>
                      <th className="pb-2 font-semibold">Nome</th>
                      <th className="pb-2 font-semibold">Tipo</th>
                      <th className="pb-2 font-semibold">Passaporte</th>
                      <th className="pb-2 font-semibold">Validade</th>
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
                          {TYPE_LABELS[p.passenger_type]}
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
          <Panel title="Pagamento">
            {!payment ? (
              <>
                <p className="mb-4 text-[13px] leading-relaxed text-adm-muted">
                  Indique o valor acordado com o cliente. Até o fazer, o{" "}
                  <b className="text-adm-txt-2">Pay link</b> mostra ao cliente
                  que a tarifa ainda está a ser preparada.
                </p>
                <PayLinkForm caseId={bookingCase.id} />
              </>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-2xl font-bold text-adm-txt">
                    {formatAmount(payment.amount, payment.currency)}
                  </p>
                  {payment.description && (
                    <p className="mt-1 text-[13px] text-adm-muted">
                      {payment.description}
                    </p>
                  )}
                  <p className="mt-2 text-[11.5px] font-semibold text-adm-txt-2">
                    Estado: {PAYMENT_STATUS_LABELS[payment.status]}
                  </p>
                  {payment.paid_at && (
                    <p className="text-[11.5px] text-adm-ok">
                      Pago a {formatDateTime(payment.paid_at)}
                    </p>
                  )}
                </div>

                {!payment.payment_url && payment.status !== "COMPLETED" && (
                  <p className="rounded-lg bg-adm-warn/10 p-3 text-[11.5px] leading-relaxed text-adm-warn">
                    A integração WeePay ainda não está ligada, por isso não há
                    link de pagamento automático. Combine o pagamento com o
                    cliente e registe-o abaixo.
                  </p>
                )}

                {payment.status !== "COMPLETED" && (
                  <MarkPaidButton
                    caseId={bookingCase.id}
                    paymentId={payment.id}
                  />
                )}
              </div>
            )}
          </Panel>

          {payment?.status === "COMPLETED" &&
            bookingCase.stage !== "emitido" && (
              <Panel title="Emissão">
                <p className="mb-3 flex items-center gap-2 text-[13px] text-adm-muted">
                  <Ticket className="h-4 w-4" />
                  Envie os bilhetes ao cliente e marque como emitido.
                </p>
                <IssueTicketsForm caseId={bookingCase.id} />
              </Panel>
            )}
        </div>
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

function Meta({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-adm-muted">
        {label}
      </span>
      <span className="text-[12.5px] text-adm-txt-2">{children}</span>
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
