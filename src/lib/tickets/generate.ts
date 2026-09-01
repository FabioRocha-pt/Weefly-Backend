/**
 * EM-02 · gerar o bilhete: ler, compor, guardar.
 *
 * Três passos e um orquestrador, para que cada um se possa testar e falhar
 * sozinho. O que este ficheiro acrescenta é a decisão de **quantos** documentos
 * se geram:
 *
 *   · um combinado, com todos os passageiros. É o que vai em anexo no email e o
 *     que a maioria das pessoas descarrega;
 *   · um por passageiro, quando são mais do que um. O FE-07 pede-os à letra —
 *     "PDFs por passageiro disponíveis individualmente além do ficheiro
 *     combinado" — e a razão é banal: quatro pessoas que viajam juntas e
 *     seguem em quatro carros diferentes para o aeroporto;
 *   · o guia de uma página (EM-04), que é igual para toda a gente e não tem
 *     dados de ninguém.
 *
 * Com um passageiro só não se gera o individual: seria o mesmo ficheiro com
 * outro nome.
 *
 * SÓ SERVIDOR.
 */

import { loadTicketData } from "./data"
import { renderTicketGuidePdf, renderTicketPdf } from "./pdf"
import { storeTicketDocument } from "./store"

export interface GeneratedFile {
  kind: "combined" | "passenger" | "guide"
  passengerId: string | null
  fileName: string
  bytes: Buffer
}

export type GenerateResult =
  | { ok: true; documentNumber: string; files: GeneratedFile[] }
  | { ok: false; reason: string }

export async function generateTicketDocuments(input: {
  caseId: string
  generatedBy: string | null
}): Promise<GenerateResult> {
  const loaded = await loadTicketData(input.caseId)
  if (!loaded.ok) return { ok: false, reason: loaded.reason }

  const data = loaded.data
  const files: GeneratedFile[] = []

  try {
    /* O combinado. `WF-TKT-{PNR}-{REFERÊNCIA}.pdf`, à letra do critério. */
    const combined = await renderTicketPdf(data)
    const combinedName = `${data.documentNumber}.pdf`

    const stored = await storeTicketDocument({
      caseId: data.caseId,
      passengerId: null,
      documentNumber: data.documentNumber,
      fileName: combinedName,
      bytes: combined,
      pnr: data.pnr,
      generatedBy: input.generatedBy,
    })

    if (!stored) return { ok: false, reason: "o documento não foi guardado" }

    files.push({
      kind: "combined",
      passengerId: null,
      fileName: combinedName,
      bytes: Buffer.from(combined),
    })

    if (data.passengers.length > 1) {
      for (const passenger of data.passengers) {
        const single = await renderTicketPdf(data, passenger)
        const name = `${data.documentNumber}-${passenger.tag}.pdf`

        await storeTicketDocument({
          caseId: data.caseId,
          passengerId: passenger.id,
          documentNumber: data.documentNumber,
          fileName: name,
          bytes: single,
          pnr: data.pnr,
          generatedBy: input.generatedBy,
        })

        files.push({
          kind: "passenger",
          passengerId: passenger.id,
          fileName: name,
          bytes: Buffer.from(single),
        })
      }
    }

    /*
     * EM-04 · o guia, gerado e não guardado.
     *
     * É igual para toda a gente e não tem dados de ninguém — o mesmo ficheiro
     * para o primeiro cliente e para o milésimo. Guardá-lo por caso seria
     * guardar mil cópias do mesmo PDF num bucket privado que existe para
     * proteger dados pessoais que este documento não tem.
     *
     * Sai em anexo com o bilhete e é servido a pedido no link do cliente.
     */
    files.push({
      kind: "guide",
      passengerId: null,
      fileName: "WeeFly-como-ler-o-bilhete.pdf",
      bytes: Buffer.from(await renderTicketGuidePdf()),
    })

    return { ok: true, documentNumber: data.documentNumber, files }
  } catch (err) {
    console.error("[tickets] geração falhou:", err)
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "erro na composição do PDF",
    }
  }
}
