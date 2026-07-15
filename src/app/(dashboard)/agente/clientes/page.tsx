import { Users } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"

export default function ClientesPage() {
  return (
    <SectionPlaceholder
      icon={<Users className="w-8 h-8 text-orange-600" />}
      title="Os seus clientes"
      description="Os clientes para quem faz reservas aparecem aqui, com histórico e contactos."
    />
  )
}
