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

  /*
   * C-02 · truncar o nome **antes** de o codificar, e não depois.
   *
   * `encodeURIComponent(name).slice(0, 200)` cortava a meio de uma sequência
   * percentual: um nome longo com acentos podia acabar em `%C3` ou em `%`, e um
   * `filename*` mal formado é um cabeçalho que o cliente rejeita — com o
   * ficheiro a não abrir e nada no ecrã a dizer porquê. Cortar primeiro os
   * caracteres garante que o que se codifica é sempre uma cadeia completa.
   */
  const encoded = encodeURIComponent(name.slice(0, 80))

  return [
    inline ? "inline" : "attachment",
    `filename="${safe || "comprovativo"}"`,
    `filename*=UTF-8''${encoded}`,
  ].join("; ")
}

/**
 * Um erro que se lê no separador que acabou de abrir.
 *
 * Isto era `NextResponse.json`, e o resultado de um comprovativo que não abria
 * era um separador em branco com `{"error":"sem acesso"}` — que é, do lado de
 * quem está a validar um pagamento, indistinguível de "a plataforma está
 * avariada". C-02 pede que o comprovativo abra; quando não puder abrir, tem de
 * dizer qual das cinco causas foi.
 */
function problem(title: string, detail: string, status: number): NextResponse {
  const esc = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  return new NextResponse(
    `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<title>Comprovativo · ${esc(title)}</title>
<style>
  body{font:15px/1.55 system-ui,sans-serif;background:#141A24;color:#E8EDF5;
       margin:0;display:grid;place-items:center;min-height:100vh;padding:24px}
  main{max-width:560px;background:#1B2330;border:1px solid #2A3444;
       border-radius:14px;padding:26px 28px}
  h1{font-size:17px;margin:0 0 10px}
  p{margin:0 0 12px;color:#A8B4C6}
  code{font-family:ui-monospace,monospace;font-size:12.5px;color:#E8EDF5}
</style></head><body><main>
<h1>${esc(title)}</h1>
<p>${esc(detail)}</p>
<p><code>HTTP ${status}</code> · id <code>proof/${status}</code></p>
</main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store, max-age=0",
      },
    }
  )
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  /* A verificação é aqui e não só no layout: uma rota é um endereço, e quem o
     souber chama-o sem passar por página nenhuma. */
  const identity = await boIdentity()
  if (!identity) {
    return problem(
      "Sessão não reconhecida",
      "Este endereço serve documentos privados e exige uma sessão do back-office. Abra o caso outra vez a partir da fila; se isto se repetir, volte a entrar na sua conta.",
      403
    )
  }

  const admin = createAdminClient()
  if (!admin) {
    return problem(
      "Serviço indisponível",
      "SUPABASE_SERVICE_ROLE_KEY não está definida neste ambiente, e sem ela o servidor não consegue ler o bucket privado.",
      503
    )
  }

  const { data: proof } = await admin
    .from("case_payment_proofs")
    .select("storage_path, file_name, mime_type, size_bytes")
    .eq("id", params.id)
    .maybeSingle()

  if (!proof) {
    return problem(
      "Comprovativo não encontrado",
      "Não existe nenhum comprovativo com este identificador. Se o cliente diz que o enviou, o envio falhou antes de chegar ao registo — a aba Pagamento mostra se ele apenas declarou ter pago.",
      404
    )
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
    return problem(
      "O ficheiro não está no armazenamento",
      `O registo aponta para "${row.storage_path}" no bucket ${PROOF_BUCKET}, e o armazenamento não tem nada nesse caminho. O registo foi escrito e o ficheiro não — ou o bucket mudou de nome.`,
      404
    )
  }

  const inline = INLINE_TYPES.includes(row.mime_type)

  /*
   * C-02 · o tamanho real do ficheiro, não o que o registo diz.
   *
   * `content-length` vinha de `size_bytes`, gravado no momento do upload. São
   * dois números que deviam ser o mesmo e não há nada que o garanta: basta uma
   * linha escrita por uma versão anterior, ou um `size_bytes` a zero, para o
   * cabeçalho contradizer o corpo — e um `content-length` que não corresponde
   * faz o browser abortar a transferência a meio, sem erro visível.
   *
   * O `Blob` que o Storage devolve sabe o seu próprio tamanho. É esse.
   */
  return new NextResponse(file.stream(), {
    headers: {
      /* O tipo guardado no registo, não o que o Storage adivinha: é o que o
         cliente enviou e o que o bucket já validou contra a lista permitida. */
      "content-type": row.mime_type || "application/octet-stream",
      "content-disposition": disposition(row.file_name, inline),
      "content-length": String(file.size),
      /* Um comprovativo não se guarda em cache nenhuma: nem no browser de quem
         o abriu, nem numa margem partilhada. */
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  })
}
