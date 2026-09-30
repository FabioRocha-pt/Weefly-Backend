import { Package } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getBoI18n } from "@/i18n/bo-server"

export default async function ProdutosPage() {
  const { t } = await getBoI18n()

  return (
    <SectionPlaceholder
      icon={<Package className="w-8 h-8 text-orange-600" />}
      title={t("dashboard.productsTitle")}
      description={t("dashboard.productsBody")}
      action={{ label: t("dashboard.addProduct"), href: "/empresa/produtos/novo" }}
    />
  )
}
