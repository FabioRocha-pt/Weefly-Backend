import type { Metadata } from "next"

import { WeeFlyLogo } from "@/components/weefly-logo"
import { getI18n } from "@/i18n/server"
import { weeflyPcSiteUrl } from "@/lib/site-url"

/**
 * DOM-01 · `<empresa>.weefly.africa` de uma empresa que não existe. O
 * middleware reescreve para aqui com 404: a marca WeeFly, nunca um erro
 * técnico.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function EmpresaInexistentePage() {
  const { t } = getI18n()
  const home = `${weeflyPcSiteUrl()}/pc`

  return (
    <div className="min-h-screen auth-bg flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <WeeFlyLogo className="h-12 mx-auto" />
        <h1 className="text-2xl font-bold text-slate-900 mt-8">{t("notFound.companyTitle")}</h1>
        <p className="text-slate-500 mt-2 mb-6">{t("notFound.companyBody")}</p>
        <a
          href={home}
          className="inline-flex items-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          {t("notFound.companyCta")}
        </a>
      </div>
    </div>
  )
}
