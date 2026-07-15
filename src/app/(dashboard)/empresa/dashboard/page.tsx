import { redirect } from "next/navigation"
import { Package, BookOpen, Star, Wallet } from "lucide-react"
import { StatsCard } from "@/components/dashboard/stats-card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { getActiveCompany, COMPANY_TYPE_LABELS } from "@/lib/companies"

const RECENT_RESERVATIONS = [
  { id: "R-1042", product: "Toyota Yaris", client: "Maria Santos", date: "14 Jul", status: "confirmada" as const },
  { id: "R-1041", product: "Hyundai i10", client: "João Pereira", date: "13 Jul", status: "novo" as const },
  { id: "R-1039", product: "Nissan Micra", client: "Ana Costa", date: "12 Jul", status: "proposta" as const },
]

const STATUS: Record<string, { label: string; variant: "novo" | "proposta" | "confirmada" }> = {
  novo: { label: "Novo", variant: "novo" },
  proposta: { label: "Proposta", variant: "proposta" },
  confirmada: { label: "Confirmada", variant: "confirmada" },
}

export default async function CompanyDashboardPage() {
  const company = await getActiveCompany()
  if (!company) redirect("/criar-empresa")

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{company.commercialName}</h1>
        <p className="text-slate-500 mt-1">
          {COMPANY_TYPE_LABELS[company.type]} · visão geral dos últimos 30 dias.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Produtos ativos" value={8} icon={<Package className="w-6 h-6" />} />
        <StatsCard
          title="Reservas"
          value={24}
          icon={<BookOpen className="w-6 h-6" />}
          trend={{ value: "+18% vs. mês anterior", isPositive: true }}
        />
        <StatsCard title="Avaliação média" value="4.8" icon={<Star className="w-6 h-6" />} />
        <StatsCard
          title="Receita"
          value={formatCurrency(342000)}
          icon={<Wallet className="w-6 h-6" />}
          trend={{ value: "+9%", isPositive: true }}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-6 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Reservas recentes</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {RECENT_RESERVATIONS.map((r) => (
            <div key={r.id} className="p-4 sm:px-6 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-slate-900 truncate">{r.product}</p>
                <p className="text-sm text-slate-500 truncate">
                  {r.client} · {r.id}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-sm text-slate-500 hidden sm:block">{r.date}</span>
                <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
