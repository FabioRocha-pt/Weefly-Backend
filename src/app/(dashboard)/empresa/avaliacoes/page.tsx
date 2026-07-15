import { Star } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"

export default function AvaliacoesPage() {
  return (
    <SectionPlaceholder
      icon={<Star className="w-8 h-8 text-orange-600" />}
      title="Ainda sem avaliações"
      description="As avaliações dos clientes após cada reserva vão aparecer aqui e contribuir para a reputação da empresa."
    />
  )
}
