import { BookOpen } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"

export default function ReservasPage() {
  return (
    <SectionPlaceholder
      icon={<BookOpen className="w-8 h-8 text-orange-600" />}
      title="Sem reservas por agora"
      description="Quando os clientes reservarem os seus produtos, as reservas aparecem aqui para gerir."
    />
  )
}
