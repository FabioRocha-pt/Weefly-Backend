import type { Metadata } from "next"

import { getTranslator } from "@/i18n/server"

/**
 * B2G-07 · `/ministerios/<slug>` sem link pessoal: "não é possível fazer
 * nenhum pedido". Uma página de passagem, igual para qualquer endereço — não
 * diz se o ministério existe, não tem formulário nem acção nenhuma. Só a
 * explicação de como se entra.
 */

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Viagens",
  robots: { index: false, follow: false },
}

export default function MinistryLandingPage() {
  const t = getTranslator("pt")
  return (
    <main className="shell" style={{ paddingTop: 56, paddingBottom: 56 }}>
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>{t("ministry.landing.title")}</h1>
        <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6 }}>{t("ministry.landing.body")}</p>
      </div>
    </main>
  )
}
