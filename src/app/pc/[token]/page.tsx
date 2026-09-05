import { notFound } from "next/navigation"

import { loadPcState, touchLink } from "@/lib/pc/state"
import { pcLocale } from "@/lib/pc/locale"
import { PcFab, PcFooter, ToastHost } from "@/components/pc/chrome"
import { PcScreenRouter } from "@/components/pc/screen-router"
import { I18nProvider } from "@/i18n/provider"
import { getDictionary } from "@/i18n/server"
import { DEFAULT_LOCALE } from "@/i18n/config"

/**
 * /pc/{token} — o pedido do cliente, em qualquer ponto do percurso.
 *
 * Um endereço só para sete ecrãs. É o que o P3 promete ao cliente ("keep this
 * link: you can come back any time") e é a razão de o ecrã ser derivado do
 * estado em vez de ser escolhido pela navegação: entre uma visita e a seguinte,
 * quem mexeu no caso foi o back-office.
 *
 * T-08 · e é aqui que a língua do caso passa a mandar.
 *
 * Faltava o `I18nProvider`. Sem ele, o `useT()` de qualquer componente do fluxo
 * devolvia a própria chave — razão pela qual todos eles estavam escritos em
 * inglês literal, que é o que o cliente via independentemente do que tinha
 * escolhido. A resolução da língua está em `lib/pc/locale.ts`, com a ordem e o
 * porquê de cada degrau.
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
         um 404, que mandaria o cliente procurar o erro no link dele.

         Em inglês e sem dicionário de propósito: não há caso, logo não há
         língua do caso — e ir buscá-la ao browser aqui seria adivinhar. */
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

  const locale = pcLocale({
    token: params.token,
    stored: state.contact.locale,
    fromUrl: searchParams.lang,
  })

  /*
   * Marca a primeira abertura da etapa que este ecrã representa, para o
   * back-office saber se o cliente já viu o que lhe foi enviado. Best-effort e
   * sem esperar: um carimbo que falha não impede ninguém de ver a página.
   */
  const stage = state.screen === "p5" || state.screen === "p4b" ? 2 : state.screen.startsWith("p7") ? 3 : 1
  void touchLink(state, stage as 1 | 2 | 3)

  const view = Array.isArray(searchParams.view)
    ? searchParams.view[0]
    : searchParams.view

  return (
    <I18nProvider
      locale={locale}
      dictionary={getDictionary(locale)}
      /* O português serve de rede para uma chave ainda por traduzir: melhor uma
         frase na língua errada do que o nome da chave no ecrã do cliente. */
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
      <ToastHost>
        <PcScreenRouter state={state} forceView={view} locale={locale} />
        <PcFooter />
        <PcFab />
      </ToastHost>
    </I18nProvider>
  )
}
