import type { Metadata } from "next"

import { WeeFlyLogo } from "@/components/weefly-logo"

export const metadata: Metadata = {
  title: "WeeFly Concierge",
  // A tokenised link must never end up in a search index.
  robots: { index: false, follow: false },
}

/**
 * Public shell for the three tokenised client links.
 *
 * Deliberately outside the (dashboard) group: these pages are opened by
 * clients with no account, reached only via a link the admin sent them.
 */
export default function ClientLinkLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-4 sm:px-6">
          <WeeFlyLogo className="h-7 w-auto" />
          <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
            Concierge
          </span>
        </div>
      </header>
      {/*
        Largo o bastante para os cartões de oferta do comparador respirarem.
        As páginas que não precisam de tanto (o formulário do link 1, o
        pagamento) estreitam-se por dentro.
      */}
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  )
}
