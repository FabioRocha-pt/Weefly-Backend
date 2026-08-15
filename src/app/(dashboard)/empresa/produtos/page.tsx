import { Package } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getI18n } from "@/i18n/server"

export default function ProdutosPage() {
  const { t } = getI18n()

  return (
    <SectionPlaceholder
      icon={<Package className="w-8 h-8 text-orange-600" />}
      title={t("dashboard.productsTitle")}
      description={t("dashboard.productsBody")}
      action={{ label: t("dashboard.addProduct"), href: "/empresa/produtos/novo" }}
    />
  )
}
