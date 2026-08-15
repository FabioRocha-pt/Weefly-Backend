import Link from "next/link"
import { WeeFlyLogo } from "@/components/weefly-logo"
import { LocaleSwitcher } from "@/i18n/locale-switcher"
import { getI18n } from "@/i18n/server"

/** O destino é fixo; só a etiqueta muda de língua. */
const NAV_MENU = [
  { key: "auth.navHow", href: "/como-funciona" },
  { key: "auth.navServices", href: "/servicos" },
  { key: "auth.navCommissions", href: "/comissoes" },
  { key: "auth.navHelp", href: "/ajuda" },
]

export function OnboardingNavbar() {
  const { t } = getI18n()

  return (
    <nav className="bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link href="/inicio" className="flex items-center gap-2">
            <WeeFlyLogo className="h-7 w-auto" />
            <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-md font-bold tracking-wide">
              {t("auth.proBadge")}
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
                {t(item.key)}
              </Link>
            ))}
          </div>

          {/* Entrar */}
          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <Link
              href="/login"
              className="px-5 py-2 rounded-lg border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              {t("auth.signIn")}
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
