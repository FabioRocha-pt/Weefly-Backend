import { NextResponse } from "next/server"

import { CITY_CODE, cityInfoFor } from "@/lib/city-images"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/city-image/CDG
 *
 * IMG-01 · a imagem da cidade de um código (de cidade ou de aeroporto: CDG e
 * ORY respondem com a de Paris). Responde sempre com o nome da cidade quando
 * o conhece; `small`, `large` e `placeholder` vêm nulos quando a cidade não
 * tem imagem activa — é o sinal para o fundo da marca.
 *
 * Público, como `/api/airports`: é a app do cliente que pergunta, sem sessão,
 * e a resposta é a mesma para toda a gente. Cinco minutos de cache: uma
 * imagem trocada no Admin aparece depressa, e escrever um destino não faz um
 * pedido por tecla à base de dados.
 */
export async function GET(_: Request, { params }: { params: { code: string } }) {
  const code = (params.code ?? "").trim().toUpperCase()
  if (!CITY_CODE.test(code)) {
    return NextResponse.json({ error: "bad_code" }, { status: 400 })
  }

  const info = await cityInfoFor(code)
  return NextResponse.json(
    info ?? { code, city: null, alt: null, small: null, large: null, placeholder: null },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
  )
}
