import { NextResponse } from "next/server"

import { createAdminClient } from "@/utils/supabase/admin"
import { loadTicketDocument } from "@/lib/tickets/store"
import { renderTicketGuidePdf } from "@/lib/tickets/pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * FE-07 · o bilhete no link do cliente, permanentemente.
 *
 * "Disponível de forma permanente no link do cliente, e não apenas no email."
 * É esta a rota que o cumpre — e é por isso que ela existe separada da do
 * back-office: a credencial aqui é o token do endereço, não uma sessão.
 *
 * O token é resolvido contra `booking_cases` a cada pedido, e é isso que impede
 * pedir o bilhete de outro caso: o `caseId` nunca vem do endereço. Um token
 * revogado (LNK-08) deixa de resolver, e com ele deixa de abrir o documento —
 * que é exactamente o ponto de o poder revogar.
 *
 * Parâmetros:
 *   `?pax={id}`  o PDF de um passageiro, em vez do combinado
 *   `?guide=1`   o guia de uma página (EM-04), composto na hora
 */
export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const url = new URL(request.url)

  /* O guia não tem dados de ninguém e é igual para toda a gente. Serve-se sem
     sequer ir à base de dados — mas continua atrás do token, para não haver um
     endereço público neste caminho que alguém confunda com os outros. */
  const wantsGuide = url.searchParams.get("guide") === "1"

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: "serviço indisponível" }, { status: 503 })
  }

  const { data } = await admin
    .from("booking_cases")
    .select("id, stage")
    .eq("token", params.token)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ error: "link inválido" }, { status: 404 })
  }

  const bookingCase = data as { id: string; stage: string }
  if (bookingCase.stage === "cancelado") {
    return NextResponse.json({ error: "link inválido" }, { status: 404 })
  }

  if (wantsGuide) {
    const guide = await renderTicketGuidePdf()
    return new NextResponse(Buffer.from(guide), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'inline; filename="WeeFly-como-ler-o-bilhete.pdf"',
        /* O único documento desta rota que pode ficar em cache: é o mesmo para
           toda a gente e não muda de dia para dia. */
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    })
  }

  const passengerId = url.searchParams.get("pax")
  const document = await loadTicketDocument(bookingCase.id, passengerId)

  if (!document) {
    return NextResponse.json(
      { error: "ainda não há bilhete emitido para esta viagem" },
      { status: 404 }
    )
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
