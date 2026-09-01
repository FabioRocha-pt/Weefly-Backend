/**
 * EM-03 · onde o bilhete gerado vive.
 *
 * "Reenviável a partir do back-office **sem regenerar**, mantendo o mesmo
 * número de documento." É essa frase que faz disto um armazenamento e não uma
 * função que compõe o PDF a cada pedido: um bilhete reenviado tem de ser byte a
 * byte o mesmo que o cliente já tem. Se o segundo trouxer uma hora de geração
 * diferente, ou um logótipo novo, deixou de ser prova de nada.
 *
 * O bucket é privado, como o dos comprovativos e pela mesma razão: um bilhete
 * tem nome, passaporte e PNR — e o PNR é a chave que abre a reserva na
 * companhia.
 *
 * SÓ SERVIDOR.
 */

import { createHash } from "crypto"

import { createAdminClient } from "@/utils/supabase/admin"

export const TICKET_BUCKET = "tickets"

export interface StoredTicket {
  id: string
  caseId: string
  passengerId: string | null
  documentNumber: string
  fileName: string
  storagePath: string
  sizeBytes: number
  generatedAt: string
  bytes: Buffer
}

export interface TicketRecord {
  id: string
  case_id: string
  passenger_id: string | null
  document_number: string
  file_name: string
  storage_path: string
  size_bytes: number
  generated_at: string
}

const COLUMNS =
  "id, case_id, passenger_id, document_number, file_name, storage_path, size_bytes, generated_at"

/**
 * Guarda um documento, substituindo o anterior do mesmo par (caso, passageiro).
 *
 * `upsert: true` no Storage e `onConflict` na tabela: voltar a gerar substitui
 * em vez de acumular. O número de documento não muda — deriva do PNR e da
 * referência (ver `ticketDocumentNumber`) — e é isso que faz do segundo ficheiro
 * o mesmo documento e não outro.
 */
export async function storeTicketDocument(input: {
  caseId: string
  passengerId: string | null
  documentNumber: string
  fileName: string
  bytes: Uint8Array
  pnr: string
  generatedBy: string | null
}): Promise<TicketRecord | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const suffix = input.passengerId ? `-${input.passengerId.slice(0, 8)}` : ""
  const storagePath = `${input.caseId}/${input.documentNumber}${suffix}.pdf`
  const body = Buffer.from(input.bytes)

  const upload = await admin.storage
    .from(TICKET_BUCKET)
    .upload(storagePath, body, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (upload.error) {
    console.error("[tickets] upload falhou:", upload.error.message)
    return null
  }

  const { data, error } = await admin
    .from("case_ticket_documents")
    .upsert(
      {
        case_id: input.caseId,
        passenger_id: input.passengerId,
        document_number: input.documentNumber,
        storage_path: storagePath,
        file_name: input.fileName,
        size_bytes: body.byteLength,
        /* Para se poder responder a "é mesmo o mesmo ficheiro?" sem o abrir. */
        content_hash: createHash("sha256").update(body).digest("hex"),
        pnr: input.pnr,
        generated_at: new Date().toISOString(),
        generated_by: input.generatedBy,
      },
      { onConflict: "case_id,passenger_id" }
    )
    .select(COLUMNS)
    .single()

  if (error) {
    console.error("[tickets] registo do documento falhou:", error.message)
    return null
  }

  return data as unknown as TicketRecord
}

/** Os documentos deste caso: o combinado primeiro, depois os individuais. */
export async function listTicketDocuments(
  caseId: string
): Promise<TicketRecord[]> {
  const admin = createAdminClient()
  if (!admin) return []

  const { data } = await admin
    .from("case_ticket_documents")
    .select(COLUMNS)
    .eq("case_id", caseId)
    .order("passenger_id", { ascending: true, nullsFirst: true })

  return (data ?? []) as unknown as TicketRecord[]
}

/**
 * Um documento e o seu conteúdo.
 *
 * `passengerId` nulo é o combinado, o de todos os passageiros. Devolve null
 * quando não existe — nunca gera nada: quem quiser gerar chama
 * `generateTicketDocuments` de propósito, e o EM-03 pede exactamente que o
 * reenvio não o faça.
 */
export async function loadTicketDocument(
  caseId: string,
  passengerId: string | null
): Promise<StoredTicket | null> {
  const admin = createAdminClient()
  if (!admin) return null

  let query = admin
    .from("case_ticket_documents")
    .select(COLUMNS)
    .eq("case_id", caseId)

  query = passengerId
    ? query.eq("passenger_id", passengerId)
    : query.is("passenger_id", null)

  const { data } = await query.maybeSingle()
  if (!data) return null

  const record = data as unknown as TicketRecord

  const file = await admin.storage
    .from(TICKET_BUCKET)
    .download(record.storage_path)

  if (file.error || !file.data) {
    console.error(
      "[tickets] documento registado sem ficheiro no bucket: %s (%s)",
      record.storage_path,
      file.error?.message ?? "sem erro"
    )
    return null
  }

  return {
    id: record.id,
    caseId: record.case_id,
    passengerId: record.passenger_id,
    documentNumber: record.document_number,
    fileName: record.file_name,
    storagePath: record.storage_path,
    sizeBytes: record.size_bytes,
    generatedAt: record.generated_at,
    bytes: Buffer.from(await file.data.arrayBuffer()),
  }
}
