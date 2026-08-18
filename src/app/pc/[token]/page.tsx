import { notFound } from "next/navigation"

import { loadPcState, touchLink } from "@/lib/pc/state"
import { ToastHost } from "@/components/pc/chrome"
import { PcScreenRouter } from "@/components/pc/screen-router"

/**
 * /pc/{token} — o pedido do cliente, em qualquer ponto do percurso.
 *
 * Um endereço só para sete ecrãs. É o que o P3 promete ao cliente ("keep this
 * link: you can come back any time") e é a razão de o ecrã ser derivado do
 * estado em vez de ser escolhido pela navegação: entre uma visita e a seguinte,
 * quem mexeu no caso foi o back-office.
 */

export const dynamic = "force-dynamic"

export default async function PriceCheckerCasePage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const lookup = await loadPcState(params.token)

  if (!lookup.ok) {
    if (lookup.reason === "unavailable") {
      /* Sem service role o link não pode ser resolvido. Dizê-lo é melhor do que
         um 404, que mandaria o cliente procurar o erro no link dele. */
      return (
        <main className="shell" style={{ paddingTop: 40 }}>
          <div className="card">
            <h1 style={{ fontSize: 20 }}>We can&apos;t open your request right now</h1>
            <p style={{ color: "#64748B", marginTop: 10 }}>
              Something on our side is misconfigured. Your request is not lost —
              message us on WhatsApp and we&apos;ll pick it up from there.
            </p>
          </div>
        </main>
      )
    }
    notFound()
  }

  const state = lookup.state

  /*
   * Marca a primeira abertura da etapa que este ecrã representa, para o
   * back-office saber se o cliente já viu o que lhe foi enviado. Best-effort e
   * sem esperar: um carimbo que falha não impede ninguém de ver a página.
   */
  const stage = state.screen === "p5" || state.screen === "p4b" ? 2 : state.screen.startsWith("p7") ? 3 : 1
  void touchLink(params.token, stage as 1 | 2 | 3)

  const view = Array.isArray(searchParams.view)
    ? searchParams.view[0]
    : searchParams.view

  return (
    <ToastHost>
      <PcScreenRouter state={state} forceView={view} />
    </ToastHost>
  )
}
