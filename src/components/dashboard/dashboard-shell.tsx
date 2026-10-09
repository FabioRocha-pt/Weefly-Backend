"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"

import {
  Sidebar,
  type SidebarAgentMenu,
  type SidebarModule,
} from "@/components/dashboard/sidebar"
import { TutorialButton } from "@/components/tutorial-button"
import { UserMenu, type UserMenuData } from "@/components/dashboard/user-menu"
import { PoweredByWeefly } from "@/components/powered-by"
import { useT } from "@/i18n/provider"

/** O título do cabeçalho é a mesma etiqueta que o menu lateral usa. */
const TITLE_KEYS: Record<string, string> = {
  "/agente": "nav.agentArea",
  "/agente/clientes": "nav.clients",
  "/agente/carteira": "nav.wallet",
  "/agente/carros": "pro.menu.cars",
  "/agente/casas": "pro.menu.houses",
  "/agente/experiencias": "pro.menu.experiences",
  "/agente/comida": "pro.menu.food",
  "/gestao/dashboard": "bo.adminDashboard.nav",
  "/gestao/contas": "pro.adminAccounts",
  "/gestao/utilizadores": "pro.adminUsers",
  "/gestao/parceiros": "pro.adminPartners",
  "/gestao/b2g": "pro.adminB2g",
  "/gestao/numeros": "pro.adminNumbers",
  "/gestao/casos": "bo.adminCases.nav",
  "/agente/financas": "bo.finance.nav",
  "/gestao/receita": "pro.adminRevenue",
  "/agente/equipa": "nav.team",
  "/agente/ministerios": "bo.b2g.list.title",
  "/conta": "profile.title",
}

export function DashboardShell({
  user,
  modules,
  agentMenus,
  companyName,
  companyLogoUrl,
  canManageTeam,
  poweredByWeefly,
  channels,
  children,
}: {
  user: UserMenuData | null
  modules: SidebarModule[]
  agentMenus: SidebarAgentMenu[]
  companyName: string | null
  /** OCT-13 · o logótipo da empresa da conta (não da WeeFly). */
  companyLogoUrl?: string | null
  canManageTeam?: boolean
  /** TEN-05 · o parceiro da conta tem o interruptor ligado. */
  poweredByWeefly?: boolean
  channels?: readonly string[] | null
  children: React.ReactNode
}) {
  const nav = { modules, agentMenus, companyName, companyLogoUrl, canManageTeam, channels }
  const t = useT()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const title = t(
    TITLE_KEYS[pathname] ??
      (pathname.startsWith("/agente/clientes") ? "nav.clients" : "nav.agentArea")
  )

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar {...nav} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full animate-slide-in-right">
            <Sidebar {...nav} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700"
              aria-label={t("nav.openMenu")}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* A campainha que estava aqui não fazia nada e mostrava sempre um
                ponto de "não lido". Os avisos a sério vivem no Concierge. */}
            {/* I18N-01 · a língua escolhe-se nas Definições (o perfil), não
                aqui: "não no ecrã principal". */}
            {/* OCT-23 · o tutorial do ecrã actual. */}
            <TutorialButton />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8">
          {children}
          {/* TEN-05 · no back-office de um parceiro (conforme o interruptor
              dele) e no Admin. */}
          {(poweredByWeefly || pathname.startsWith("/gestao")) && <PoweredByWeefly className="text-slate-500" />}
        </main>
      </div>
    </div>
  )
}
