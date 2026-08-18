import type { Metadata } from "next"
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google"

import "@/styles/pc.css"
import { RoutePreloader } from "@/components/route-preloader"
import { PcFab, PcFooter } from "@/components/pc/chrome"

/**
 * WeeFly Price Checker — o fluxo público, P1 → P9.
 *
 * A folha de estilos é a do mockup, sem uma linha mudada (src/styles/pc.css): o
 * desenho é o contrato, e reescrevê-lo em utilitários seria mudá-lo sem querer.
 * As duas únicas alterações são as famílias tipográficas, que passam a apontar
 * para as variáveis do next/font — a alternativa era um <link> para o Google a
 * cada carregamento.
 *
 * `pc.css` mexe no `body`. Isso é seguro porque só é carregada nesta secção: o
 * Next junta o CSS por rota, e quem abre /admin nunca a recebe.
 */

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "WeeFly Concierge · Price Checker",
  description:
    "Tell us where you are going. Our team searches several airlines and comes back with the best options.",
}

export default function PriceCheckerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {/*
       * As variáveis são declaradas no `:root` e não numa classe deste
       * componente porque `pc.css` estiliza o `body`, que está acima daqui — o
       * <body> vive no layout de raiz. Uma classe num <div> filho nunca chegaria
       * lá, e o tipo de letra do corpo cairia no system-ui.
       */}
      <style>{`:root{--font-jakarta:${jakarta.style.fontFamily};--font-plex-mono:${plexMono.style.fontFamily}}`}</style>
      <RoutePreloader background="#F1F5F9" label="Loading WeeFly" />
      {children}
      <PcFooter />
      <PcFab />
    </>
  )
}
