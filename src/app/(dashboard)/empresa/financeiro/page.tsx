import { Wallet } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getBoI18n } from "@/i18n/bo-server"

export default async function FinanceiroPage() {
  const { t } = await getBoI18n()

  return (
    <SectionPlaceholder
      icon={<Wallet className="w-8 h-8 text-orange-600" />}
      title={t("nav.finance")}
      description={t("dashboard.financeBody")}
    />
  )
}
