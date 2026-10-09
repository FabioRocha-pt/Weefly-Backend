import type { Metadata } from "next"
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google"

import "@/styles/pc.css"

/**
 * B2G-22 · o terminal VIP. A mesma folha do `/pc` — é o mesmo formulário, com
 * a marca da empresa do VIP por cima (TEN-02).
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
  robots: { index: false, follow: false },
}

export default function VipRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`:root{--font-jakarta:${jakarta.style.fontFamily};--font-plex-mono:${plexMono.style.fontFamily}}`}</style>
      {children}
    </>
  )
}
