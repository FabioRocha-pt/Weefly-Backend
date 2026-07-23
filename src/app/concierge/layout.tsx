import Link from "next/link"
import type { Metadata } from "next"

import { WeeFlyLogo } from "@/components/weefly-logo"

export const metadata: Metadata = {
  title: "Pedido de viagem · WeeFly Concierge",
  description:
    "Diga-nos para onde quer voar. A equipa de Concierge da WeeFly encontra as melhores opções e tarifas por si.",
}

export default function ConciergeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen auth-bg">
      <header className="bg-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-20">
            <Link href="/" className="flex items-center gap-2">
              <WeeFlyLogo className="h-7 w-auto" />
              <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-md font-bold tracking-wide">
                CONCIERGE
              </span>
            </Link>
          </div>
        </div>
      </header>
      <main className="px-4 py-8 sm:py-12">{children}</main>
    </div>
  )
}
