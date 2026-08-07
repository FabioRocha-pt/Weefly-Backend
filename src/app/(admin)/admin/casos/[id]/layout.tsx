import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { getCase } from "@/lib/booking-cases"
import { getProposal } from "@/lib/proposals"
import {
  CASE_STAGE_CHIP,
  CASE_STAGE_DISPLAY,
  WAITING_DOT,
  elapsedSince,
  type CaseStage,
} from "@/lib/case-status"
import { CaseLinkButtons } from "@/components/admin/case-link-buttons"
import { CaseTabs } from "@/components/admin/case-tabs"

export const dynamic = "force-dynamic"

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Atlantic/Cape_Verde",
  }).format(new Date(value))
}

/**
 * A barra do caso, partilhada pelos separadores.
 *
 * Vive no layout e não em cada página porque é a mesma identidade em ambos:
 * mudar de separador não deve fazer o nome do cliente piscar.
 */
export default async function CaseLayout({
  params,
  children,
}: {
  params: { id: string }
  children: React.ReactNode
}) {
  const bookingCase = await getCase(params.id)
  if (!bookingCase) notFound()

  const proposal = await getProposal(bookingCase.id)
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

      <div className="rounded-xl border border-adm-line bg-adm-panel px-5 pt-5">
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
              <Meta label="Criado">{formatDateTime(bookingCase.created_at)}</Meta>
              <Meta label="Sem mexer há">
                {elapsedSince(bookingCase.updated_at)}
              </Meta>
              {proposal && (
                <Meta label="Revisão">
                  R{proposal.proposal.revision}
                  <span className="text-adm-muted">
                    {proposal.proposal.status === "publicada"
                      ? " · publicada"
                      : " · rascunho"}
                  </span>
                </Meta>
              )}
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

        <CaseTabs caseId={bookingCase.id} offerCount={proposal?.offers.length ?? 0} />
      </div>

      {children}
    </div>
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
