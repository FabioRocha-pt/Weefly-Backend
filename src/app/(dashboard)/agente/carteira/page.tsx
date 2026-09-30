import { Wallet } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * PRO-05 · a Carteira existe e aparece, vazia. O conteúdo (só consulta) entra
 * depois de testado — Parte 3 do plano da semana.
 */
export default async function CarteiraPage() {
  const { t } = await getBoI18n()

  return (
    <SectionPlaceholder
      icon={<Wallet className="w-8 h-8 text-orange-600" />}
      title={t("dashboard.walletTitle")}
      description={t("pro.walletEmpty")}
    />
  )
}
