import Link from "next/link"
import { notFound } from "next/navigation"
import { Users, Ticket, ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  getCase,
  getCasePassengers,
  getCasePayment,
} from "@/lib/booking-cases"
import {
  LINK_STAGE_NAMES,
  LINK_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatAmount,
} from "@/lib/case-status"
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

  return (
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
                Ainda sem dados. O cliente preenche-os depois de escolher uma
                opção no{" "}
                <Link
                  href={`/admin/casos/${bookingCase.id}/ofertas`}
                  className="font-semibold text-adm-ember hover:text-adm-ember-dark"
                >
                  link 2
                </Link>
                .
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
                  O valor entra aqui sozinho quando o cliente escolher uma opção
                  no{" "}
                  <Link
                    href={`/admin/casos/${bookingCase.id}/ofertas`}
                    className="font-semibold text-adm-ember hover:text-adm-ember-dark"
                  >
                    separador Ofertas
                  </Link>
                  . Se o caso foi fechado por fora, registe-o à mão abaixo — até
                  lá o <b className="text-adm-txt-2">Pay link</b> diz ao cliente
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
