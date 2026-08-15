import type { Metadata } from "next"
import "./globals.css"
import { Preloader } from "@/components/Preloader"
import { LOCALE_TAGS } from "@/i18n/config"
import { getI18n } from "@/i18n/server"

/**
 * O título e a descrição saem do dicionário, e por isso são calculados por
 * pedido em vez de serem uma constante — o cookie do idioma só existe quando o
 * pedido chega.
 */
export function generateMetadata(): Metadata {
  const { t } = getI18n()
  return {
    title: t("meta.appTitle"),
    description: t("meta.appDescription"),
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /*
   * O `lang` do <html> tem de acompanhar o idioma escolhido: é o que diz ao
   * leitor de ecrã como pronunciar a página e ao browser que dicionário usar
   * para a correção ortográfica dos formulários.
   */
  const { locale, t } = getI18n()

  return (
    <html lang={LOCALE_TAGS[locale]}>
      <body>
        <Preloader label={t("common.loadingApp")} />
        {children}
      </body>
    </html>
  )
}
