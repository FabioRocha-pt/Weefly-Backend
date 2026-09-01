import { NextResponse } from "next/server"

import { boIdentity } from "@/lib/bo-access"
import { loadTicketDocument } from "@/lib/tickets/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * EM-03 · o bilhete, para quem o emitiu.
 *
 * A mesma decisão do X-01 e pelas mesmas razões: um endereço estável que um
 * `<a target="_blank">` abre no próprio clique, sem URL assinado a ficar no
 * histórico do browser e sem o bloqueador de pop-ups a apagar o gesto.
 *
 * `?pax={id}` serve o PDF de um passageiro; sem parâmetro é o combinado. Nunca
 * gera nada — se o documento não existir, responde 404 e quem quiser gerar
 * carrega no botão que o diz. É o que o EM-03 pede: reenviar não é regenerar.
 */
export async function GET(
  request: Request,
  { params }: { params: { caseId: string } }
) {
  const identity = await boIdentity()
  if (!identity) {
    return NextResponse.json({ error: "sem acesso" }, { status: 403 })
  }

  const passengerId = new URL(request.url).searchParams.get("pax")
  const document = await loadTicketDocument(params.caseId, passengerId)

  if (!document) {
    return NextResponse.json(
      { error: "este caso ainda não tem bilhete gerado" },
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
