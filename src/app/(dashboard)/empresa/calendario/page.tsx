import { Calendar } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"

export default function CalendarioPage() {
  return (
    <SectionPlaceholder
      icon={<Calendar className="w-8 h-8 text-orange-600" />}
      title="Calendário & preços"
      description="Defina disponibilidade, épocas e preços por dia ou por noite. Disponível assim que criar o primeiro produto."
      action={{ label: "Adicionar produto", href: "/empresa/produtos/novo" }}
    />
  )
}
