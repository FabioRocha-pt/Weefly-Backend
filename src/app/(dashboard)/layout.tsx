import { getCurrentUser } from "@/lib/current-user"
import { getCompanies } from "@/lib/companies"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { DEFAULT_LOCALE } from "@/i18n/config"
import { I18nProvider } from "@/i18n/provider"
import { getDictionary, getLocale } from "@/i18n/server"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, companies] = await Promise.all([getCurrentUser(), getCompanies()])

  const menuUser = user
    ? { fullName: user.fullName, email: user.email, initials: user.initials }
    : null

  const sidebarCompanies = companies.map((c) => ({
    id: c.id,
    commercialName: c.commercialName,
    type: c.type,
  }))

  const locale = getLocale()

  return (
    <I18nProvider
      locale={locale}
      dictionary={getDictionary(locale)}
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
      <DashboardShell user={menuUser} companies={sidebarCompanies}>
        {children}
      </DashboardShell>
    </I18nProvider>
  )
}
