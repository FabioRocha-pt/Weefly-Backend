import { NextResponse } from "next/server"

import { createAdminClient } from "@/utils/supabase/admin"
import { loadSecretarySpace } from "@/lib/ministry"
import { loadTicketDocument } from "@/lib/tickets/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * B2G-18 · os bilhetes no espaço da secretária.
 *
 * A credencial é a sessão do PIN (o cookie vai só para o link pessoal desta
 * secretária, `path=/ministerios/<org>/<link>`) e não o token do caso — a rota
 * do token (`/api/pc/<token>/ticket`) recusa casos de ministério. O caso tem de
 * ser do ministério desta secretária; o passageiro, quando pedido, do caso.
 *
 *   `?pax={id}`  o PDF de um passageiro, em vez do combinado
 */
export async function GET(
  request: Request,
  { params }: { params: { org: string; token: string; caseId: string } }
) {
  const notFound = () => NextResponse.json({ error: "não encontrado" }, { status: 404 })

  const { lookup, signedIn } = await loadSecretarySpace(params.org, params.token)
  if (!lookup.ok || !signedIn) return notFound()
  if (!/^[0-9a-f-]{36}$/i.test(params.caseId)) return notFound()

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: "serviço indisponível" }, { status: 503 })

  const { data } = await admin
    .from("booking_cases")
    .select("id, stage, pnr")
    .eq("id", params.caseId)
    .eq("organisation_id", lookup.ministry.org.id)
    .maybeSingle()
  const bookingCase = data as { id: string; stage: string; pnr: string | null } | null
  if (!bookingCase || bookingCase.stage === "cancelado") return notFound()

  const pax = new URL(request.url).searchParams.get("pax")
  if (pax && !/^[0-9a-f-]{36}$/i.test(pax)) return notFound()

  const document = await loadTicketDocument(bookingCase.id, pax)
  if (!document) {
    return NextResponse.json({ error: "ainda não há bilhete emitido para esta viagem" }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(document.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${document.fileName}"`,
      "content-length": String(document.bytes.byteLength),
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  })
}
