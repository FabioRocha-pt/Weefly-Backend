import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { WeeFlyLogo } from "@/components/weefly-logo"
import { getConversation } from "@/lib/conversations"
import { ChatWidget } from "@/components/concierge/chat-widget"
import { getDictionary, getI18n } from "@/i18n/server"
import { DEFAULT_LOCALE } from "@/i18n/config"
import { I18nProvider } from "@/i18n/provider"
import { LocaleSwitcher } from "@/i18n/locale-switcher"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "A sua conversa · WeeFly Concierge",
  // Como os links tokenizados: isto nunca pode acabar num índice de pesquisa.
  robots: { index: false, follow: false },
}

/**
 * Retomar uma conversa a partir do endereço.
 *
 * É para onde aponta o email que avisa que a proposta saiu. O `/newhome` guarda
 * o token no browser, o que chega para quem volta no mesmo dispositivo — este
 * endereço é o que funciona quando a pessoa abre o email no telemóvel e a
 * conversa começou no computador.
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams: { lang?: string }
}) {
  const conversation = await getConversation(params.token)
  if (!conversation) notFound()

  const { locale, t, dictionary } = getI18n(searchParams)

  return (
    <I18nProvider
      locale={locale}
      dictionary={dictionary}
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-4 sm:px-6">
          <Link href="/newhome" className="flex items-center gap-2">
            <WeeFlyLogo className="h-7 w-auto text-[#FF4747]" />
          </Link>
          <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
            {t("common.concierge")}
          </span>
          <div className="ml-auto">
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex h-[calc(100vh-11rem)] min-h-[480px] flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <ChatWidget token={params.token} />
        </div>
        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-slate-400">
          {t("chat.personalLink")}
        </p>
      </main>
    </div>
    </I18nProvider>
  )
}
