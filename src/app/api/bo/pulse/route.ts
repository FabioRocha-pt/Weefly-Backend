import { NextResponse } from "next/server"

import { getBoAccess } from "@/lib/bo-access"
import { createAdminClient } from "@/utils/supabase/admin"

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

export async function GET() {
  const access = await getBoAccess()
  if (!access.ok) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 })
  }

  const latest = async (table: string, column: string) => {
    const { data } = await admin
      .from(table)
      .select(column)
      .order(column, { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as Record<string, string> | null)?.[column] ?? ""
  }

  const count = async (table: string) => {
    const { count: n } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
    return n ?? 0
  }

  const [lastEvent, lastCase, lastPayment, events, cases] = await Promise.all([
    latest("case_events", "created_at"),
    latest("booking_cases", "updated_at"),
    latest("case_payments", "updated_at"),
    count("case_events"),
    count("booking_cases"),
  ])

  return NextResponse.json(
    {
      ok: true,
      /* Uma string só: o cliente compara-a com a anterior e não precisa de
         saber o que está lá dentro. */
      signature: [lastEvent, lastCase, lastPayment, events, cases].join("|"),
    },
    { headers: { "cache-control": "no-store" } }
  )
}
