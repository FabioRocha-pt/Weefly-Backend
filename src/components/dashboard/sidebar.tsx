"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  Calendar,
  BookOpen,
  Star,
  Wallet,
  Settings,
  Home,
  Car,
  Building,
  Compass,
  ChevronDown,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { WeeFlyLogo } from "@/components/weefly-logo"

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

const PROVIDER_NAV: NavItem[] = [
  { label: "Início (todas as empresas)", href: "/inicio", icon: <Home className="w-5 h-5" /> },
  { label: "Dashboard da empresa", href: "/empresa/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: "Produtos", href: "/empresa/produtos", icon: <Package className="w-5 h-5" /> },
  { label: "Calendário & preços", href: "/empresa/calendario", icon: <Calendar className="w-5 h-5" /> },
  { label: "Reservas", href: "/empresa/reservas", icon: <BookOpen className="w-5 h-5" /> },
  { label: "Avaliações", href: "/empresa/avaliacoes", icon: <Star className="w-5 h-5" /> },
  { label: "Financeiro", href: "/empresa/financeiro", icon: <Wallet className="w-5 h-5" /> },
  { label: "Definições da empresa", href: "/empresa/definicoes", icon: <Settings className="w-5 h-5" /> },
]

const AGENT_NAV: NavItem[] = [
  { label: "Área de agente", href: "/agente", icon: <Compass className="w-5 h-5" /> },
  { label: "Clientes", href: "/agente/clientes", icon: <Building className="w-5 h-5" /> },
  { label: "Carteira", href: "/agente/carteira", icon: <Wallet className="w-5 h-5" /> },
]

export type SidebarCompany = {
  id: string
  commercialName: string
  type: "rental" | "housing" | "tourism"
}

const TYPE_ICON: Record<SidebarCompany["type"], React.ReactNode> = {
  rental: <Car className="w-4 h-4 text-orange-600" />,
  housing: <Building className="w-4 h-4 text-sky-600" />,
  tourism: <Compass className="w-4 h-4 text-amber-600" />,
}

interface SidebarProps {
  companies: SidebarCompany[]
  /** When provided, renders as a mobile drawer that can be closed. */
  onClose?: () => void
}

export function Sidebar({ companies, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)

  const mode: "provider" | "agent" = pathname.startsWith("/agente") ? "agent" : "provider"
  const isDark = mode === "agent"
  const navItems = mode === "provider" ? PROVIDER_NAV : AGENT_NAV
  const activeCompany = companies[0] ?? null

  const handleToggle = (target: "provider" | "agent") => {
    if (target === mode) return
    router.push(target === "agent" ? "/agente" : "/inicio")
  }

  return (
    <aside
      className={cn(
        "w-64 shrink-0 min-h-screen flex flex-col transition-colors duration-300",
        isDark ? "sidebar-dark text-gray-300" : "bg-white border-r border-slate-200 text-slate-700"
      )}
    >
      {/* Logo */}
      <div className={cn("p-6 flex items-center justify-between border-b", isDark ? "border-gray-800" : "border-slate-200")}>
        <Link href={mode === "agent" ? "/agente" : "/inicio"} className="flex items-center gap-2">
          <WeeFlyLogo className="h-7 w-auto" />
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-md font-bold tracking-wide",
              isDark
                ? "bg-orange-500/15 text-orange-500"
                : "bg-slate-900 text-white"
            )}
          >
            {mode === "agent" ? "AGENTE" : "PRO"}
          </span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 text-slate-400 hover:text-slate-600" aria-label="Fechar menu">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div className="p-4">
        <div className={cn("rounded-lg p-1 flex", isDark ? "bg-gray-800" : "bg-slate-100")}>
          <button
            onClick={() => handleToggle("provider")}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
              mode === "provider"
                ? "bg-orange-600 text-white shadow-sm"
                : isDark
                ? "text-gray-300 hover:text-white"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Car className="w-4 h-4" />
            <span>Fornecedor</span>
          </button>
          <button
            onClick={() => handleToggle("agent")}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
              mode === "agent"
                ? "bg-orange-600 text-white shadow-sm"
                : isDark
                ? "text-gray-300 hover:text-white"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Compass className="w-4 h-4" />
            <span>Agente</span>
          </button>
        </div>
      </div>

      {/* Active company selector (provider only) */}
      {mode === "provider" && (
        <div className="px-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
            Empresa ativa
          </p>

          {activeCompany ? (
            <div className="relative">
              <button
                onClick={() => setShowCompanyDropdown((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
              >
                <span className="flex items-center gap-2 truncate">
                  {TYPE_ICON[activeCompany.type]}
                  <span className="truncate">{activeCompany.commercialName}</span>
                </span>
                <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", showCompanyDropdown && "rotate-180")} />
              </button>

              {showCompanyDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 rounded-lg shadow-lg overflow-hidden z-10 bg-white border border-slate-200">
                  <div className="py-1">
                    {companies.map((company) => (
                      <Link
                        key={company.id}
                        href="/empresa/dashboard"
                        onClick={() => setShowCompanyDropdown(false)}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                      >
                        {TYPE_ICON[company.type]}
                        <span className="truncate">{company.commercialName}</span>
                      </Link>
                    ))}
                    <Link
                      href="/criar-empresa"
                      onClick={() => setShowCompanyDropdown(false)}
                      className="w-full px-4 py-2 text-left text-sm text-orange-600 font-medium hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100"
                    >
                      + Criar empresa
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/criar-empresa"
              className="w-full flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all"
            >
              + Criar primeira empresa
            </Link>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-4 py-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                    active
                      ? isDark
                        ? "bg-orange-600/20 text-orange-500"
                        : "bg-orange-50 text-orange-600"
                      : isDark
                      ? "text-gray-400 hover:bg-white/5 hover:text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className={cn("m-4 p-4 rounded-xl", isDark ? "bg-gray-800" : "bg-slate-50")}>
        <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>Login único.</p>
        <p className={cn("text-xs mt-1", isDark ? "text-gray-400" : "text-slate-500")}>
          Acede a todas as empresas sem PIN. Gestão de equipa (RBAC) chega em breve.
        </p>
      </div>
    </aside>
  )
}
