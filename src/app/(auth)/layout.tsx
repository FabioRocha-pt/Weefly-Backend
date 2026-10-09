import { AuthNavbar } from "@/components/auth/auth-navbar"
import { DEFAULT_LOCALE } from "@/i18n/config"
import { I18nProvider } from "@/i18n/provider"
import { getDictionary, getLocale } from "@/i18n/server"
import { siteContext } from "@/lib/site-meta"

/**
 * O idioma sai do cookie, que o middleware preencheu a partir de `?lang=` — um
 * layout não recebe os parâmetros do endereço, e os formulários que estão cá
 * dentro são todos componentes de cliente, por isso o provider tem de os
 * envolver aqui.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = getLocale()
  /* DOM-01 · no endereço de uma empresa com marca própria, o logótipo é o dela. */
  const ctx = await siteContext()
  const brand = ctx.partnerBrand ? { name: ctx.brand.name, logoUrl: ctx.brand.logoUrl } : null

  return (
    <I18nProvider
      locale={locale}
      dictionary={getDictionary(locale)}
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
      <div className="min-h-screen auth-bg">
        <AuthNavbar brand={brand} />
        <main className="flex items-center justify-center py-8 px-4">
          {children}
        </main>
      </div>
    </I18nProvider>
  )
}
