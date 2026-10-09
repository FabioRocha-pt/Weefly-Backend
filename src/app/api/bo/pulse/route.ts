import { NextResponse, type NextRequest } from "next/server"

import { getBoScope, isCrossPartner } from "@/lib/bo-scope"

/**
 * T-03 · o batimento que diz ao back-office que alguma coisa mudou.
 *
 * O relatório de testes é literal: "o back-office não mostra notificação nenhuma
 * quando o cliente muda de estado, não se actualiza sozinho, e não dá sinal de
 * que chegou algo novo. É preciso recarregar à mão."
 *
 * O `BoLiveUpdates` já existia e já ouvia o Supabase Realtime. O problema do
 * Realtime é que ele funciona ou não funciona por razões que não estão neste
 * repositório — a publicação do Postgres, o RLS de quem subscreve, uma rede de
 * escritório a filtrar websockets, o Realtime desligado no projecto. Quando não
 * sobe, o recurso era uma sondagem de **20 segundos**, e o critério pede cinco.
 *
 * Sondar de cinco em cinco segundos com `router.refresh()` seria voltar a
 * renderizar a fila inteira doze vezes por minuto por agente. Este endpoint é a
 * alternativa: devolve uma assinatura curta do estado do mundo, e o browser só
 * pede o render novo quando ela muda.
 *
 * O que entra na assinatura é o que muda algum ecrã: o último acontecimento de
 * caso, o último caso tocado, o último pagamento tocado, e as contagens. As
 * contagens apanham o que as datas não apanham — uma linha apagada, uma inserida
 * no mesmo milissegundo.
 *
 * Autenticado como tudo o resto do back-office: quem não está na lista não fica
 * a saber quantos casos a WeeFly tem.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  /*
   * B2G-12 · B2G-14 · `?workspace=all` é a fila do master: todas as empresas.
   * `getBoScope` só o honra numa conta `cross_partner`; a de um parceiro
   * recebe o parceiro dela, como se não tivesse pedido nada.
   */
  const workspace = request.nextUrl.searchParams.get("workspace") === "all" ? "all" : "own"
  const scope = await getBoScope({ workspace })
  if (!scope) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  /*
   * TEN-03 · a assinatura é do mundo desta sessão, e não do mundo inteiro:
   * lida pelo cliente da sessão (o RLS decide) e pelo parceiro dela. Sem isto,
   * a fila do Alô recarregava a cada movimento da WeeFly — e as contagens
   * diziam ao Alô quantos casos a WeeFly tem.
   *
   * Os filhos do caso (acontecimentos, pagamentos) chegam ao parceiro pelo
   * caso: `booking_cases!inner` com o filtro dele.
   */
  const { db, partnerId } = scope

  const latest = async (table: string, column: string) => {
    let query = db
      .from(table)
      .select(table === "booking_cases" ? column : `${column}, booking_cases!inner(partner_id)`)
      .order(column, { ascending: false })
      .limit(1)
    if (partnerId) {
      query =
        table === "booking_cases"
          ? query.eq("partner_id", partnerId)
          : query.eq("booking_cases.partner_id", partnerId)
    }
    const { data } = await query.maybeSingle()
    return (data as Record<string, string> | null)?.[column] ?? ""
  }

  const count = async (table: string) => {
    let query = db
      .from(table)
      .select(table === "booking_cases" ? "id" : "id, booking_cases!inner(partner_id)", {
        count: "exact",
        head: true,
      })
    if (partnerId) {
      query =
        table === "booking_cases"
          ? query.eq("partner_id", partnerId)
          : query.eq("booking_cases.partner_id", partnerId)
    }
    const { count: n } = await query
    return n ?? 0
  }

  /*
   * B2G-12 · "o pedido chega à empresa e ao master". No concierge da sua
   * empresa, o master também tem de dar pelo pedido de ministério que entra
   * noutra empresa (a campainha dele mostra-o): a assinatura junta o último
   * pedido de ministério de todas. Só para `cross_partner` — o RLS mostrava-o
   * a mais ninguém, mas nem se pergunta.
   */
  const lastMinistry = async () => {
    if (!partnerId || !isCrossPartner(scope.identity)) return ""
    const { data } = await db
      .from("booking_cases")
      .select("created_at")
      .eq("channel", "ministerio")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as { created_at?: string } | null)?.created_at ?? ""
  }

  const [lastEvent, lastCase, lastPayment, events, cases, ministry] = await Promise.all([
    latest("case_events", "created_at"),
    latest("booking_cases", "updated_at"),
    latest("case_payments", "updated_at"),
    count("case_events"),
    count("booking_cases"),
    lastMinistry(),
  ])

  return NextResponse.json(
    {
      ok: true,
      /* Uma string só: o cliente compara-a com a anterior e não precisa de
         saber o que está lá dentro. */
      signature: [lastEvent, lastCase, lastPayment, events, cases, ministry].join("|"),
    },
    { headers: { "cache-control": "no-store" } }
  )
}
