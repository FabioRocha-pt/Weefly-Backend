import { Calendar } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getBoI18n } from "@/i18n/bo-server"

export default async function CalendarioPage() {
  const { t } = await getBoI18n()

  return (
    <SectionPlaceholder
      icon={<Calendar className="w-8 h-8 text-orange-600" />}
      title={t("nav.calendar")}
      description={t("dashboard.calendarBody")}
      action={{ label: t("dashboard.addProduct"), href: "/empresa/produtos/novo" }}
    />
  )
}
