import { notFound } from "next/navigation"
import { BarChart3, Coins, Landmark } from "lucide-react"

import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"

/**
 * Os menus do Admin que ainda não têm conteúdo. Estão na navegação, como a
 * tabela do Bloco B pede, e dizem de que item são e porque esperam.
 */
const AREAS: Record<string, { title: string; body: string; icon: React.ReactNode }> = {
  b2g: {
    title: "B2G",
    body: "Parceiros, ministérios, bolsas, alertas, casos e passagens — só de leitura por defeito (ADM-08, com ADM-04 e ADM-06). Entra no passo 5, com o backoffice da Alô.",
    icon: <Landmark className="w-8 h-8 text-orange-600" />,
  },
  numeros: {
    title: "Números",
    body: "Análise consolidada e exportação CSV (ADM-03). Entra no passo 8.",
    icon: <BarChart3 className="w-8 h-8 text-orange-600" />,
  },
  receita: {
    title: "Receita",
    body: "Taxas e comissões (ADM-07). Bloqueado até às decisões C1, D1, D7 e D8 — o campo da comissão já existe no caso, vazio.",
    icon: <Coins className="w-8 h-8 text-orange-600" />,
  },
}

export default function AdminAreaPage({ params }: { params: { area: string } }) {
  const area = AREAS[params.area]
  if (!area) notFound()
  return <SectionPlaceholder icon={area.icon} title={area.title} description={area.body} />
}
