import { BookOpen } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getBoI18n } from "@/i18n/bo-server"

export default async function ReservasPage() {
  const { t } = await getBoI18n()

  return (
    <SectionPlaceholder
      icon={<BookOpen className="w-8 h-8 text-orange-600" />}
      title={t("dashboard.bookingsTitle")}
      description={t("dashboard.bookingsBody")}
    />
  )
}
