"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building,
  Car,
  Compass,
  Home,
  Lock,
  Plane,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { WeeFlyLogo } from "@/components/weefly-logo"
import { useT } from "@/i18n/provider"
import { enterModule } from "@/actions/pro"
import { AGENT_MENU_HREF, type AgentMenuId } from "@/lib/pro-menus"

/**
 * WeeFly Pro · o menu lateral.
 *
 * PRO-02 · o seletor de módulo: muda-se sem voltar a fazer login, e passa pelo
 *          `enterModule` para que "o último módulo usado" fique certo.
 * PRO-03 · Fornecedor aparece com cadeado e não é clicável.
 * PRO-04 · os menus do Agente chegam já filtrados do servidor (os desligados
 *          nem vêm); os que vêm como `soon` levam "Brevemente".
 */

export type SidebarModule = {
  id: "supplier" | "agent" | "admin"
  state: "open" | "soon"
}

export type SidebarAgentMenu = {
  menu: AgentMenuId
  state: "open" | "soon"
}

interface NavItem {
  labelKey: string
  href: string
  icon: React.ReactNode
  soon?: boolean
}

const MODULE_ICON: Record<SidebarModule["id"], React.ReactNode> = {
  supplier: <Store className="w-4 h-4" />,
  agent: <Compass className="w-4 h-4" />,
  admin: <ShieldCheck className="w-4 h-4" />,
}

const AGENT_MENU_ICON: Record<SidebarAgentMenu["menu"], React.ReactNode> = {
  flights: <Plane className="w-5 h-5" />,
  cars: <Car className="w-5 h-5" />,
  houses: <Home className="w-5 h-5" />,
  experiences: <Sparkles className="w-5 h-5" />,
  food: <UtensilsCrossed className="w-5 h-5" />,
}

const AGENT_TOOLS: NavItem[] = [
  { labelKey: "nav.clients", href: "/agente/clientes", icon: <Users className="w-5 h-5" /> },
  { labelKey: "nav.wallet", href: "/agente/carteira", icon: <Wallet className="w-5 h-5" /> },
]

const ADMIN_NAV: NavItem[] = [
  { labelKey: "pro.adminAccounts", href: "/gestao/contas", icon: <Building className="w-5 h-5" /> },
]

interface SidebarProps {
  modules: SidebarModule[]
  agentMenus: SidebarAgentMenu[]
  companyName: string | null
  /** When provided, renders as a mobile drawer that can be closed. */
  onClose?: () => void
}

export function Sidebar({ modules, agentMenus, companyName, onClose }: SidebarProps) {
  const t = useT()
  const pathname = usePathname()

  const mode: SidebarModule["id"] | null = pathname.startsWith("/agente")
    ? "agent"
    : pathname.startsWith("/gestao")
      ? "admin"
      : null
  const isDark = mode === "agent"

  const sections: { titleKey?: string; items: NavItem[] }[] =
    mode === "agent"
      ? [
          {
            titleKey: "pro.agentMenus",
            items: agentMenus.map(({ menu, state }) => ({
              labelKey: `pro.menu.${menu}`,
              href: AGENT_MENU_HREF[menu],
              icon: AGENT_MENU_ICON[menu],
              soon: state === "soon",
            })),
          },
          { titleKey: "pro.agentTools", items: AGENT_TOOLS },
        ]
      : mode === "admin"
        ? [{ items: ADMIN_NAV }]
        : []

  return (
    <aside
      className={cn(
        "w-64 shrink-0 min-h-screen flex flex-col transition-colors duration-300",
        isDark ? "sidebar-dark text-gray-300" : "bg-white border-r border-slate-200 text-slate-700"
      )}
    >
      {/* Logo */}
      <div className={cn("p-6 flex items-center justify-between border-b", isDark ? "border-gray-800" : "border-slate-200")}>
        <Link href="/modulo" className="flex items-center gap-2">
          <WeeFlyLogo className="h-7 w-auto" />
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-md font-bold tracking-wide",
              isDark ? "bg-orange-500/15 text-orange-500" : "bg-slate-900 text-white"
            )}
          >
            {mode === "agent" ? t("nav.agentBadge") : t("auth.proBadge")}
          </span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-slate-400 hover:text-slate-600"
            aria-label={t("nav.closeMenu")}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* PRO-02 · module switcher */}
      <div className="p-4">
        <div className={cn("rounded-lg p-1 flex gap-1", isDark ? "bg-gray-800" : "bg-slate-100")}>
          {modules.map(({ id, state }) => {
            const active = mode === id
            const cls = cn(
              "flex-1 py-2 px-2 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5",
              active
                ? "bg-orange-600 text-white shadow-sm"
                : state === "soon"
                  ? isDark
                    ? "text-gray-500 cursor-not-allowed"
                    : "text-slate-400 cursor-not-allowed"
                  : isDark
                    ? "text-gray-300 hover:text-white"
                    : "text-slate-500 hover:text-slate-900"
            )
            if (state === "soon") {
              return (
                <span
                  key={id}
                  className={cls}
                  aria-disabled="true"
                  title={t("pro.soon")}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t(`pro.module.${id}`)}</span>
                </span>
              )
            }
            return (
              <form key={id} action={enterModule} className="flex-1 flex">
                <input type="hidden" name="module" value={id} />
                <button type="submit" className={cls} aria-current={active ? "page" : undefined}>
                  {MODULE_ICON[id]}
                  <span>{t(`pro.module.${id}`)}</span>
                </button>
              </form>
            )
          })}
        </div>
        {companyName && (
          <p
            className={cn(
              "mt-3 px-1 text-xs truncate",
              isDark ? "text-gray-400" : "text-slate-500"
            )}
          >
            {companyName}
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-3 space-y-5">
        {sections.map((section, i) => (
          <div key={section.titleKey ?? i}>
            {section.titleKey && (
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-wider mb-2 px-1",
                  isDark ? "text-gray-500" : "text-slate-400"
                )}
              >
                {t(section.titleKey)}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = pathname === item.href
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
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
                      <span className="flex-1">{t(item.labelKey)}</span>
                      {item.soon && (
                        <span
                          className={cn(
                            "shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5",
                            isDark ? "bg-gray-800 text-gray-500" : "bg-slate-100 text-slate-400"
                          )}
                        >
                          {t("pro.soon")}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn("m-4 p-4 rounded-xl", isDark ? "bg-gray-800" : "bg-slate-50")}>
        <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>
          {t("nav.footerTitle")}
        </p>
        <p className={cn("text-xs mt-1", isDark ? "text-gray-400" : "text-slate-500")}>
          {t("nav.footerBody")}
        </p>
      </div>
    </aside>
  )
}
