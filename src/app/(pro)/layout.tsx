import Link from "next/link"

import { WeeFlyLogo } from "@/components/weefly-logo"
import { UserMenu } from "@/components/dashboard/user-menu"
import { getCurrentUser } from "@/lib/current-user"
import { DEFAULT_LOCALE } from "@/i18n/config"
import { I18nProvider } from "@/i18n/provider"
import { LocaleSwitcher } from "@/i18n/locale-switcher"
import { getDictionary, getI18n, getLocale } from "@/i18n/server"

/**
 * WeeFly Pro · os ecrãs entre o login e um módulo: a escolha de módulo
 * (PRO-02) e a conta à espera de validação (PRO-09). Sem menu lateral — ainda
 * não se está em módulo nenhum.
 */
export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale()
  const { t } = getI18n()
  const user = await getCurrentUser()

  return (
    <I18nProvider
      locale={locale}
      dictionary={getDictionary(locale)}
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
      <div className="min-h-screen auth-bg">
        <nav className="bg-white/80 backdrop-blur-sm sticky top-0 z-50 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/modulo" className="flex items-center gap-2">
              <WeeFlyLogo className="h-7 w-auto" />
              <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-md font-bold tracking-wide">
                {t("auth.proBadge")}
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <LocaleSwitcher />
              <UserMenu
                user={
                  user
                    ? { fullName: user.fullName, email: user.email, initials: user.initials }
                    : null
                }
              />
            </div>
          </div>
        </nav>
        <main className="px-4 py-12">{children}</main>
      </div>
    </I18nProvider>
  )
}
