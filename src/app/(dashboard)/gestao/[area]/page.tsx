import { notFound } from "next/navigation"
import { BarChart3, Coins, Landmark } from "lucide-react"

import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * Os menus do Admin que ainda não têm conteúdo. Estão na navegação, como a
 * tabela do Bloco B pede, e dizem de que item são e porque esperam.
 */
const AREAS: Record<string, { icon: React.ReactNode }> = {
  b2g: { icon: <Landmark className="w-8 h-8 text-orange-600" /> },
  numeros: { icon: <BarChart3 className="w-8 h-8 text-orange-600" /> },
  receita: { icon: <Coins className="w-8 h-8 text-orange-600" /> },
}

export default async function AdminAreaPage({ params }: { params: { area: string } }) {
  const area = AREAS[params.area]
  if (!area) notFound()
  const { t } = await getBoI18n()
  return (
    <SectionPlaceholder
      icon={area.icon}
      title={t(`bo.pro.areas.${params.area}.title`)}
      description={t(`bo.pro.areas.${params.area}.body`)}
    />
  )
}
