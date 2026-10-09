"use client"

import { useT } from "@/i18n/provider"

/**
 * B2G-15 · "A secretária vê as ofertas e pode imprimi-las." O browser imprime
 * a página; a folha de estilo de impressão da página do caso esconde a barra
 * inferior, os botões e o WhatsApp.
 */
export function MinistryPrintButton() {
  const t = useT()
  return (
    <button type="button" className="btn btn-ghost btn-sm no-print" style={{ width: "auto" }} onClick={() => window.print()}>
      🖨 {t("ministry.case.print")}
    </button>
  )
}
