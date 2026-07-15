import { Wallet } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"

export default function CarteiraPage() {
  return (
    <SectionPlaceholder
      icon={<Wallet className="w-8 h-8 text-orange-600" />}
      title="Carteira de comissões"
      description="Acompanhe o saldo, as comissões por reserva e os levantamentos disponíveis."
    />
  )
}
