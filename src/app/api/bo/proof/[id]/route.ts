import { NextResponse } from "next/server"

import { boIdentity } from "@/lib/bo-access"
import { createAdminClient } from "@/utils/supabase/admin"
import { PROOF_BUCKET } from "@/lib/pc/payment"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * X-01 · o comprovativo que não abria.
 *
 * O ficheiro sempre esteve lá. O que não funcionava era o gesto de o abrir:
 *
 *   1. o botão chamava uma server action para pedir um URL assinado e só depois
 *      fazia `window.open`. Entre o clique e a abertura havia um `await`, e um
 *      `window.open` que não acontece dentro do gesto do utilizador é bloqueado
 *      pelo browser como se fosse uma pop-up. Em Chrome e em Safari com o
 *      bloqueador no valor por omissão, o comprovativo simplesmente não abria —
 *      sem erro, sem separador, sem nada;
 *   2. mesmo quando abria, o Storage servia com o `content-type` que o upload
 *      lhe pôs e um nome de ficheiro gerado (`{payment}-{timestamp}.pdf`), pelo
 *      que o nome original do cliente desaparecia;
 *   3. e o URL assinado, sendo um URL, ficava no histórico do browser — um
 *      endereço que abre um documento com IBAN e montante, colável em qualquer
 *      lado durante dez minutos.
 *
 * Esta rota resolve as três: é um endereço estável que um `<a href target=_blank>`
 * abre no próprio clique, verifica a sessão a cada pedido, devolve o
 * `content-type` certo e o nome original no `content-disposition`. O ficheiro
 * continua num bucket privado e nunca é servido de uma pasta pública.
 *
 * O `id` é o da linha em `case_payment_proofs`, e não o caminho no Storage: um
 * caminho no endereço seria um parâmetro que alguém pode reescrever, e a
 * verificação teria de o validar contra a tabela na mesma. Assim a única coisa
 * que se pode pedir é uma linha que existe.
 */

/** O que o browser sabe abrir sem descarregar. O resto é entregue como anexo. */
const INLINE_TYPES = ["application/pdf", "image/jpeg", "image/png"]

/**
 * `filename*` em UTF-8, e um `filename` só com ASCII para os clientes antigos.
 *
 * Um comprovativo chama-se "Transferência João.pdf" mais vezes do que não, e um
 * cabeçalho HTTP não leva acentos sem isto — o nome chegava truncado no
 * primeiro carácter estranho, quando não rebentava o cabeçalho inteiro.
 */
function disposition(name: string, inline: boolean): string {
  const safe = name
    .replace(/[\r\n"\\]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, 120)
  return [
    inline ? "inline" : "attachment",
    `filename="${safe || "comprovativo"}"`,
    `filename*=UTF-8''${encodeURIComponent(name).slice(0, 200)}`,
  ].join("; ")
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  /* A verificação é aqui e não só no layout: uma rota é um endereço, e quem o
     souber chama-o sem passar por página nenhuma. */
  const identity = await boIdentity()
  if (!identity) {
    return NextResponse.json({ error: "sem acesso" }, { status: 403 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: "serviço indisponível" }, { status: 503 })
  }

  const { data: proof } = await admin
    .from("case_payment_proofs")
    .select("storage_path, file_name, mime_type, size_bytes")
    .eq("id", params.id)
    .maybeSingle()

  if (!proof) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 })
  }

  const row = proof as {
    storage_path: string
    file_name: string
    mime_type: string
    size_bytes: number
  }

  const { data: file, error } = await admin.storage
    .from(PROOF_BUCKET)
    .download(row.storage_path)

  if (error || !file) {
    /*
     * O registo diz que o ficheiro existe e o Storage diz que não.
     *
     * Vale a pena o log com o caminho: é a diferença entre "o bucket mudou de
     * nome" e "o upload nunca chegou a acontecer", e nenhuma delas se descobre
     * a partir de um 404 no ecrã.
     */
    console.error(
      "[bo/proof] ficheiro ausente no bucket %s: %s (%s)",
      PROOF_BUCKET,
      row.storage_path,
      error?.message ?? "sem erro"
    )
    return NextResponse.json(
      { error: "o ficheiro não está no armazenamento" },
      { status: 404 }
    )
  }

  const inline = INLINE_TYPES.includes(row.mime_type)

  return new NextResponse(file.stream(), {
    headers: {
      /* O tipo guardado no registo, não o que o Storage adivinha: é o que o
         cliente enviou e o que o bucket já validou contra a lista permitida. */
      "content-type": row.mime_type || "application/octet-stream",
      "content-disposition": disposition(row.file_name, inline),
      "content-length": String(row.size_bytes),
      /* Um comprovativo não se guarda em cache nenhuma: nem no browser de quem
         o abriu, nem numa margem partilhada. */
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  })
}
