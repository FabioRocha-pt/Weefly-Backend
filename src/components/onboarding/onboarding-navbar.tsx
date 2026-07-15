import Link from "next/link"
import { WeeFlyLogo } from "@/components/weefly-logo"

const NAV_MENU = [
  { label: "Como funciona", href: "/como-funciona" },
  { label: "Serviços", href: "/servicos" },
  { label: "Comissões", href: "/comissoes" },
  { label: "Ajuda", href: "/ajuda" },
]

export function OnboardingNavbar() {
  return (
    <nav className="bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link href="/inicio" className="flex items-center gap-2">
            <WeeFlyLogo className="h-7 w-auto" />
            <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-md font-bold tracking-wide">
              PRO
            </span>
          </Link>

          {/* Main nav */}
          <div className="hidden md:flex items-center space-x-8">
            {NAV_MENU.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-slate-700 hover:text-orange-600 transition-colors font-medium"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Entrar */}
          <Link
            href="/login"
            className="px-5 py-2 rounded-lg border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
          >
            Entrar
          </Link>
        </div>
      </div>
    </nav>
  )
}
