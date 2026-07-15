import { Package } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"

export default function ProdutosPage() {
  return (
    <SectionPlaceholder
      icon={<Package className="w-8 h-8 text-orange-600" />}
      title="Ainda não há produtos"
      description="Adicione carros, casas ou excursões — um de cada vez, com fotos, preços e regras."
      action={{ label: "Adicionar produto", href: "/empresa/produtos/novo" }}
    />
  )
}
