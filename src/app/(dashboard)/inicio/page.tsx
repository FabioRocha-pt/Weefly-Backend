import Link from "next/link"
import { Plus, Building2, Package, Send, Compass, Car, Home, Flag, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/current-user"
import { getCompanies, COMPANY_TYPE_LABELS, type Company } from "@/lib/companies"

const TYPE_ICON: Record<Company["type"], React.ReactNode> = {
  rental: <Car className="w-6 h-6 text-orange-600" />,
  housing: <Home className="w-6 h-6 text-sky-600" />,
  tourism: <Flag className="w-6 h-6 text-amber-600" />,
}

const TYPE_WRAPPER: Record<Company["type"], string> = {
  rental: "bg-orange-100",
  housing: "bg-sky-100",
  tourism: "bg-amber-100",
}

export default async function ProviderHomePage() {
  const [user, companies] = await Promise.all([getCurrentUser(), getCompanies()])
  const firstName = user?.firstName || user?.fullName || "bem-vindo"

  if (companies.length > 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 mb-1">
              Bem-vindo ao WeeFlyPro
            </p>
            <h1 className="text-2xl font-bold text-slate-900">Olá, {firstName}</h1>
            <p className="text-slate-500 mt-1">As suas empresas nesta conta.</p>
          </div>
          <Link href="/criar-empresa">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Criar empresa
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <Link
              key={company.id}
              href="/empresa/dashboard"
              className="group rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-md hover:border-slate-300 transition-all"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${TYPE_WRAPPER[company.type]}`}>
                {TYPE_ICON[company.type]}
              </div>
              <h3 className="font-bold text-slate-900 truncate">{company.commercialName}</h3>
              <p className="text-sm text-slate-500 mt-1">{COMPANY_TYPE_LABELS[company.type]}</p>
              {(company.city || company.country) && (
                <p className="text-sm text-slate-400 mt-0.5">
                  {[company.city, company.country].filter(Boolean).join(", ")}
                </p>
              )}
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-orange-600">
                Abrir dashboard
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Welcome banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 mb-2">
              Bem-vindo ao WeeFlyPro
            </p>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">Olá, {firstName}</h1>
            <p className="text-slate-600 mb-6 max-w-2xl">
              A sua conta está pronta. Para colocar serviços na plataforma, o primeiro passo é criar
              uma empresa — de fornecedor (carros, casas ou excursões) ou de agente. Pode ter várias,
              todas acessíveis com este único login.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/criar-empresa">
                <Button size="lg">
                  <Plus className="w-5 h-5 mr-2" />
                  Criar a primeira empresa
                </Button>
              </Link>
              <Button size="lg" variant="outline">
                Ver como funciona
              </Button>
            </div>
          </div>

          {/* Decorative panel */}
          <div className="hidden lg:flex items-center justify-center">
            <div className="w-full aspect-square max-w-[220px] rounded-2xl bg-orange-50 flex items-center justify-center">
              <Building2 className="w-20 h-20 text-orange-500" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StepCard
          icon={<Building2 className="w-6 h-6 text-orange-600" />}
          wrapper="bg-orange-100"
          title="1 · Crie a empresa"
          description="Dados fiscais, contactos e tipo de serviço. Fica ativa de imediato."
        />
        <StepCard
          icon={<Package className="w-6 h-6 text-slate-500" />}
          wrapper="bg-slate-100"
          title="2 · Adicione produtos"
          description="Carros, casas ou excursões — um de cada vez, com fotos e regras."
        />
        <StepCard
          icon={<Send className="w-6 h-6 text-slate-500" />}
          wrapper="bg-slate-100"
          title="3 · Venda em todo o lado"
          description="Pesquisável no WeeFly e em todos os canais ligados por API."
        />
      </div>

      {/* Agent note */}
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <Compass className="w-5 h-5 text-slate-500" />
        </div>
        <div>
          <p className="font-semibold text-slate-900">Também vai atuar como agente?</p>
          <p className="text-sm text-slate-500 mt-1">
            A área de agente já está incluída na sua conta — troque de modo no menu lateral quando
            quiser.
          </p>
        </div>
      </div>
    </div>
  )
}

function StepCard({
  icon,
  wrapper,
  title,
  description,
}: {
  icon: React.ReactNode
  wrapper: string
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${wrapper}`}>
        {icon}
      </div>
      <h3 className="font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  )
}
