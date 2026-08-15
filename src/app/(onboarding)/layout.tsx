import { OnboardingNavbar } from "@/components/onboarding/onboarding-navbar"
import { DEFAULT_LOCALE } from "@/i18n/config"
import { I18nProvider } from "@/i18n/provider"
import { getDictionary, getLocale } from "@/i18n/server"

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = getLocale()

  return (
    <I18nProvider
      locale={locale}
      dictionary={getDictionary(locale)}
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
      <div className="min-h-screen auth-bg">
        <OnboardingNavbar />
        <main className="px-4 py-12">{children}</main>
      </div>
    </I18nProvider>
  )
}
