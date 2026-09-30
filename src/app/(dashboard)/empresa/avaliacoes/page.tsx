import { Star } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getBoI18n } from "@/i18n/bo-server"

export default async function AvaliacoesPage() {
  const { t } = await getBoI18n()

  return (
    <SectionPlaceholder
      icon={<Star className="w-8 h-8 text-orange-600" />}
      title={t("dashboard.reviewsTitle")}
      description={t("dashboard.reviewsBody")}
    />
  )
}
