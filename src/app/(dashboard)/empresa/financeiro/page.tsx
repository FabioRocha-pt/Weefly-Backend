import { Wallet } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"

export default function FinanceiroPage() {
  return (
    <SectionPlaceholder
      icon={<Wallet className="w-8 h-8 text-orange-600" />}
      title="Financeiro"
      description="Acompanhe receitas, pagamentos e transferências. Os dados aparecem após a primeira reserva concluída."
    />
  )
}
