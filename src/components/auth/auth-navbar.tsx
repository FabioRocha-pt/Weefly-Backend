import Link from "next/link"
import { Button } from "@/components/ui/button"
import { WeeFlyLogo } from "@/components/weefly-logo"

const NAV_MENU = [
  { label: "Como funciona", href: "/como-funciona" },
  { label: "Serviços", href: "/servicos" },
  { label: "Comissões", href: "/comissoes" },
  { label: "Ajuda", href: "/ajuda" },
]

export function AuthNavbar() {
  return (
    <nav className="bg-white/80 backdrop-blur-sm sticky top-0 z-50 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and brand */}
          <Link href="/inicio" className="flex items-center gap-2">
            <WeeFlyLogo className="h-7 w-auto" />
            <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-md font-bold tracking-wide">
              PRO
            </span>
          </Link>

          {/* Main navigation */}
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

          {/* Auth buttons */}
          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="text-slate-700 hover:text-orange-600 transition-colors font-medium"
            >
              Entrar
            </Link>
            <Link href="/registro" passHref>
              <Button className="bg-orange-600 hover:bg-orange-700">Criar conta</Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
