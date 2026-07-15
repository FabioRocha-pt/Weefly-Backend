import { MessageSquare, Users, Wallet, TrendingUp } from "lucide-react"
import { StatsCard } from "@/components/dashboard/stats-card"
import { RequestList } from "@/components/dashboard/request-list"
import { formatCurrency } from "@/lib/utils"
import { getCurrentUser } from "@/lib/current-user"
import type { DashboardStats, Request } from "@/types"

const MOCK_STATS: DashboardStats = {
  newRequests: 12,
  clients: 48,
  wallet: 125000,
  monthlyCommission: 8500,
}

const MOCK_REQUESTS: Request[] = [
  {
    id: "1",
    clientName: "Maria Santos",
    clientEmail: "maria@email.com",
    service: "Aluguer de carro · 3 dias",
    status: "novo",
    date: "14 Jul 2026",
  },
  {
    id: "2",
    clientName: "João Pereira",
    clientEmail: "joao@email.com",
    service: "Excursão Cidade Velha · 2 pax",
    status: "proposta",
    date: "13 Jul 2026",
    amount: 15000,
    commission: 1500,
  },
  {
    id: "3",
    clientName: "Ana Costa",
    clientEmail: "ana@email.com",
    service: "Casa Soleil · 2 semanas",
    status: "confirmada",
    date: "12 Jul 2026",
    amount: 45000,
    commission: 4500,
  },
  {
    id: "4",
    clientName: "Pedro Lima",
    clientEmail: "pedro@email.com",
    service: "Transfer Aeroporto · ida e volta",
    status: "proposta",
    date: "11 Jul 2026",
    amount: 5000,
    commission: 500,
  },
]

export default async function AgentDashboardPage() {
  const user = await getCurrentUser()
  const firstName = user?.firstName || user?.fullName || "bem-vindo"

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 mb-1">
          Área de agente
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Olá, {firstName}</h1>
        <p className="text-slate-500 mt-1">
          Faça reservas para terceiros e acompanhe as suas comissões.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Novos pedidos"
          value={MOCK_STATS.newRequests}
          icon={<MessageSquare className="w-6 h-6" />}
          trend={{ value: "+3 esta semana", isPositive: true }}
        />
        <StatsCard
          title="Clientes"
          value={MOCK_STATS.clients}
          icon={<Users className="w-6 h-6" />}
          trend={{ value: "+5 este mês", isPositive: true }}
        />
        <StatsCard
          title="Carteira"
          value={formatCurrency(MOCK_STATS.wallet)}
          icon={<Wallet className="w-6 h-6" />}
        />
        <StatsCard
          title="Comissões do mês"
          value={formatCurrency(MOCK_STATS.monthlyCommission)}
          icon={<TrendingUp className="w-6 h-6" />}
          trend={{ value: "+12% vs. mês anterior", isPositive: true }}
        />
      </div>

      {/* Requests */}
      <RequestList requests={MOCK_REQUESTS} />
    </div>
  )
}
