import Link from "next/link"
import type { Metadata } from "next"

import { WeeFlyLogo } from "@/components/weefly-logo"
import { DEFAULT_LOCALE } from "@/i18n/config"
import { I18nProvider } from "@/i18n/provider"
import { LocaleSwitcher } from "@/i18n/locale-switcher"
import { getDictionary, getI18n } from "@/i18n/server"

export function generateMetadata(): Metadata {
  const { t } = getI18n()
  return {
    title: t("meta.conciergeTitle"),
    description: t("meta.conciergeDescription"),
  }
}

export default function ConciergeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { locale, t, dictionary } = getI18n()

  return (
    <I18nProvider
      locale={locale}
      dictionary={dictionary}
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
      <div className="min-h-screen auth-bg">
        <header className="bg-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-20">
              <Link href="/" className="flex items-center gap-2">
                <WeeFlyLogo className="h-7 w-auto" />
                <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-md font-bold tracking-wide">
                  {t("common.conciergeBadge")}
                </span>
              </Link>
              <div className="ml-auto">
                <LocaleSwitcher />
              </div>
            </div>
          </div>
        </header>
        <main className="px-4 py-8 sm:py-12">{children}</main>
      </div>
    </I18nProvider>
  )
}
