"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Bell, Menu } from "lucide-react"

import { Sidebar, type SidebarCompany } from "@/components/dashboard/sidebar"
import { UserMenu, type UserMenuData } from "@/components/dashboard/user-menu"
import { LocaleSwitcher } from "@/i18n/locale-switcher"
import { useT } from "@/i18n/provider"

/** O título do cabeçalho é a mesma etiqueta que o menu lateral usa. */
const TITLE_KEYS: Record<string, string> = {
  "/inicio": "nav.home",
  "/empresa/dashboard": "nav.companyDashboard",
  "/empresa/produtos": "nav.products",
  "/empresa/calendario": "nav.calendar",
  "/empresa/reservas": "nav.bookings",
  "/empresa/avaliacoes": "nav.reviews",
  "/empresa/financeiro": "nav.finance",
  "/empresa/definicoes": "nav.companySettings",
  "/agente": "nav.agentArea",
  "/agente/clientes": "nav.clients",
  "/agente/carteira": "nav.wallet",
}

export function DashboardShell({
  user,
  companies,
  children,
}: {
  user: UserMenuData | null
  companies: SidebarCompany[]
  children: React.ReactNode
}) {
  const t = useT()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const title = t(TITLE_KEYS[pathname] ?? "nav.home")

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar companies={companies} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full animate-slide-in-right">
            <Sidebar companies={companies} onClose={() => setMobileOpen(false)} />
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
            <LocaleSwitcher />
            <button
              className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label={t("nav.notifications")}
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-600 rounded-full" />
            </button>
            <div className="h-8 w-px bg-slate-200" />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  )
}
