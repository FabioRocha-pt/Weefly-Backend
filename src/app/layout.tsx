import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Preloader } from "@/components/Preloader"
import { LOCALE_TAGS } from "@/i18n/config"
import { getI18n } from "@/i18n/server"
import { pageMetadata, siteContext, themeColor } from "@/lib/site-meta"

/**
 * SEO-01 · SEO-02 · o `<head>` por defeito: ícones, manifesto, cor, título,
 * descrição e imagem de partilha da empresa do endereço (`lib/site-meta`).
 * Calculados por pedido, porque dependem do `Host` e do cookie do idioma.
 *
 * SEO-03 · por defeito nada se indexa; só a página inicial do price checker
 * o pede (`app/pc/page.tsx`).
 */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await siteContext())
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: themeColor(await siteContext()) }
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
