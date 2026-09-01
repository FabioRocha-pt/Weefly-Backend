import { notFound } from "next/navigation"

import { getBoAccess, listBoSellers } from "@/lib/bo-access"
import { loadBoCase } from "@/lib/pc/bo-queue"
import { getPcPayment, listProofs } from "@/lib/pc/payment"
import { getPublishedProposal } from "@/lib/proposals"
import { listCaseEvents } from "@/lib/case-events"
import { listCaseNotifications } from "@/lib/notifications"
import { listPassengerSeats } from "@/lib/issuance"
import { listTicketDocuments } from "@/lib/tickets/store"
import { createAdminClient } from "@/utils/supabase/admin"
import { BoCaseView } from "@/components/bo/case-view"
import type { CasePassenger } from "@/lib/case-status"

/**
 * B3 · a ficha do caso.
 *
 * Sete abas, e o que decide qual abre é o estado: um caso com comprovativo à
 * espera abre no Pagamento, porque é aí que está o trabalho. O `?aba=` da fila
 * sobrepõe-se, para quem clicou em "Validar" cair exatamente onde queria.
 */

export const dynamic = "force-dynamic"

export default async function BoCasePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const access = await getBoAccess()
  if (!access.ok) return null

  const detail = await loadBoCase(params.id)
  if (!detail) notFound()

  const admin = createAdminClient()

  const [
    payment,
    proposal,
    events,
    notifications,
    sellers,
    seats,
    documents,
    passengers,
  ] = await Promise.all([
    getPcPayment(params.id),
    getPublishedProposal(params.id),
    listCaseEvents(params.id),
    /* NT-06 · o registo de entrega, que a aba Comunicações mostra. */
    listCaseNotifications(params.id),
    /* BO-14 · os vendedores que existem no sistema, para o seletor. */
    listBoSellers(),
    /* EM-01 · os lugares por passageiro e por voo. */
    listPassengerSeats(params.id),
    /* EM-03 · o PDF já existe? Decide entre "gerar" e "reenviar". */
    listTicketDocuments(params.id),
    admin
      ? admin
          .from("case_passengers")
          .select(
            "id, position, passenger_type, title, first_name, last_name, gender, birth_date, nationality, passport_number, passport_expiry, issuing_country, ticket_number, seat_outbound, seat_inbound"
          )
          .eq("case_id", params.id)
          .order("position")
          .then(({ data }) => (data ?? []) as unknown as CasePassenger[])
      : Promise.resolve([] as CasePassenger[]),
  ])

  const proofs = payment ? await listProofs(payment.id) : []

  const requestedTab = Array.isArray(searchParams.aba)
    ? searchParams.aba[0]
    : searchParams.aba

  return (
    <BoCaseView
      detail={detail}
      payment={payment}
      proofs={proofs}
      proposal={proposal}
      passengers={passengers}
      events={events}
      notifications={notifications}
      sellers={sellers}
      seats={seats}
      hasTicketDocument={documents.some((d) => d.passenger_id === null)}
      initialTab={requestedTab}
      viewer={{ label: access.identity.label, email: access.identity.email }}
    />
  )
}
