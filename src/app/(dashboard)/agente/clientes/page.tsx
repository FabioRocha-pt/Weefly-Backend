import { Users } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getI18n } from "@/i18n/server"

export default function ClientesPage() {
  const { t } = getI18n()

  return (
    <SectionPlaceholder
      icon={<Users className="w-8 h-8 text-orange-600" />}
      title={t("dashboard.clientsTitle")}
      description={t("dashboard.clientsBody")}
    />
  )
}
