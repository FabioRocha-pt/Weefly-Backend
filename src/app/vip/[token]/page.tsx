import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { RequestWizard } from "@/components/pc/request-wizard"
import { PcBrandProvider, PcFab, PcFooter, ToastHost } from "@/components/pc/chrome"
import { brandCssVars, toClientBrand } from "@/lib/brand"
import { resolveVipLink } from "@/lib/vip"
import { CURRENCIES } from "@/lib/pc/catalog"
import { COUNTRY_BY_ISO, countryOfDial, toE164 } from "@/lib/countries"
import { I18nProvider } from "@/i18n/provider"
import { getDictionary, getLocale } from "@/i18n/server"
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config"

/**
 * B2G-22 · o terminal VIP: `/vip/<token>`.
 *
 * O link pessoal de um cliente VIP — opaco, permanente, com a marca da
 * empresa. Abre o formulário do Price Checker com o contacto dele preenchido;
 * o pedido entra na fila VIP da empresa (o intake resolve o token: o VIP e a
 * empresa nunca vêm do browser).
 *
 * Um VIP desactivado, uma empresa sem o canal VIP ou o endereço de outra
 * empresa dão "não encontrado", sem dizer porquê. Os pedidos que o VIP já
 * fez continuam nos seus `/pc/<token>`.
 */

export const dynamic = "force-dynamic"

type Props = {
  params: { token: string }
  searchParams: Record<string, string | string[] | undefined>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lookup = await resolveVipLink(params.token)
  if (!lookup.ok) return { title: "—", robots: { index: false, follow: false } }
  return { title: lookup.context.brand.name, robots: { index: false, follow: false } }
}

export default async function VipTerminalPage({ params, searchParams }: Props) {
  const lookup = await resolveVipLink(params.token)
  if (!lookup.ok) notFound()
  const { vip, brand } = lookup.context

  const one = (key: string): string => {
    const value = searchParams[key]
    return (Array.isArray(value) ? value[0] : value) ?? ""
  }

  const asked = one("lang").toLowerCase()
  const locale: Locale = isLocale(asked) ? asked : getLocale()

  /* O telefone do VIP chega como foi escrito no back-office ("+238 991 23
     45"): o formulário quer o país e o número nacional. */
  const raw = (vip.phone ?? "").replace(/[\s().-]+/g, "")
  const dial = raw.startsWith("+") ? raw.match(/^\+\d{1,3}/)?.[0] ?? "+238" : "+238"
  const country = countryOfDial(dial) || "CV"
  const national = raw.startsWith("+") ? raw.slice(dial.length) : raw
  const phoneOk = Boolean(national && toE164(dial, national))

  const askedCurrency = one("currency").toUpperCase()
  const currency = CURRENCIES.includes(askedCurrency)
    ? askedCurrency
    : country === "CV" && CURRENCIES.includes("CVE")
      ? "CVE"
      : "EUR"

  return (
    <I18nProvider
      locale={locale}
      dictionary={getDictionary(locale)}
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
      <PcBrandProvider brand={toClientBrand(brand)} cssVars={brandCssVars(brand)}>
        <ToastHost>
          <RequestWizard
            initialLang={locale}
            initialCurrency={currency}
            initialCountry={COUNTRY_BY_ISO[country] ? country : null}
            agentSlug={null}
            vip={{
              token: vip.token,
              contact: {
                name: vip.name,
                email: vip.email ?? "",
                country,
                phone: phoneOk ? national : "",
              },
            }}
          />
          {/* A marca da empresa e o "Powered by WeeFly", como no /pc. */}
          <PcFooter />
          <PcFab />
        </ToastHost>
      </PcBrandProvider>
    </I18nProvider>
  )
}
