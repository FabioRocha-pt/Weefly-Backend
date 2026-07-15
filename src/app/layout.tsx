import type { Metadata } from "next"
import "./globals.css"
import { Preloader } from "@/components/Preloader"

export const metadata: Metadata = {
  title: "WeeFly PRO - B2B Platform for Service Providers",
  description: "Plataforma B2B para fornecedores de serviços e agentes em Cabo Verde",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt">
      <body>
        <Preloader />
        {children}
      </body>
    </html>
  )
}
