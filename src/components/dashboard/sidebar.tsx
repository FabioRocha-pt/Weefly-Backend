"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Building,
  ChevronDown,
  Car,
  Coins,
  FolderSearch,
  Handshake,
  Landmark,
  LayoutDashboard,
  UserCog,
  Compass,
  Home,
  Lock,
  Plane,
  Receipt,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
  PanelLeftClose,
  PanelLeftOpen,
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

/* O módulo Admin, com os menus da tabela do Bloco B. Os que ainda não têm
   conteúdo aparecem com Brevemente e dizem de que item são. */
const ADMIN_NAV: NavItem[] = [
  /* OCT-15 · o primeiro menu, aberto por defeito. */
  { labelKey: "bo.adminDashboard.nav", href: "/gestao/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { labelKey: "pro.adminAccounts", href: "/gestao/contas", icon: <Building className="w-5 h-5" /> },
  { labelKey: "pro.adminUsers", href: "/gestao/utilizadores", icon: <UserCog className="w-5 h-5" /> },
  { labelKey: "pro.adminPartners", href: "/gestao/parceiros", icon: <Handshake className="w-5 h-5" /> },
  /* OCT-17 · os clientes de todos os parceiros. */
  { labelKey: "bo.adminClients.nav", href: "/gestao/clientes", icon: <Users className="w-5 h-5" /> },
  { labelKey: "pro.adminB2g", href: "/gestao/b2g", icon: <Landmark className="w-5 h-5" /> },
  /* ADM-04 · os casos de todos os parceiros, em leitura. */
  { labelKey: "bo.adminCases.nav", href: "/gestao/casos", icon: <FolderSearch className="w-5 h-5" /> },
  /* ADM-03 · a análise consolidada. */
  { labelKey: "pro.adminNumbers", href: "/gestao/numeros", icon: <BarChart3 className="w-5 h-5" /> },
  { labelKey: "pro.adminRevenue", href: "/gestao/receita", icon: <Coins className="w-5 h-5" />, soon: true },
]

/* PAR-02 · os ministérios, num menu próprio enquanto a decisão O3 não disser
   se ficam dentro de Cliente. Só para quem vende ao Estado. */
const MINISTRIES_ITEM: NavItem = {
  labelKey: "bo.b2g.list.title",
  href: "/agente/ministerios",
  icon: <Landmark className="w-5 h-5" />,
}

/* PAR-08 · o acompanhamento financeiro, para o Admin do parceiro. */
const FINANCE_ITEM: NavItem = {
  labelKey: "bo.finance.nav",
  href: "/agente/financas",
  icon: <Receipt className="w-5 h-5" />,
}

/* ADM-02 · o Admin do parceiro gere a equipa dele a partir do Agente. */
const TEAM_ITEM: NavItem = {
  labelKey: "nav.team",
  href: "/agente/equipa",
  icon: <UserCog className="w-5 h-5" />,
}

interface SidebarProps {
  modules: SidebarModule[]
  agentMenus: SidebarAgentMenu[]
  companyName: string | null
  companyLogoUrl?: string | null
  /** ADM-02 · mostra "Equipa" no Agente (perfil Admin do parceiro). */
  canManageTeam?: boolean
  /** PAR-02 · o parceiro vende ao Estado (B2G). */
  sellsB2g?: boolean
  /** When provided, renders as a mobile drawer that can be closed. */
  onClose?: () => void
  /**
   * OCT-19 · dentro de Passagens o menu recolhe para ícones. Ao passar o rato
   * (ou com o foco do teclado) mostra os nomes por cima do ecrã, sem o
   * empurrar; o botão fixa-o aberto ou recolhido, e a escolha fica guardada
   * neste browser.
   */
  collapsible?: boolean
}

const COLLAPSE_KEY = "weefly.sidebar.collapsed"

export function Sidebar({
  modules,
  agentMenus,
  companyName,
  companyLogoUrl,
  canManageTeam,
  sellsB2g,
  onClose,
  collapsible = false,
}: SidebarProps) {
  const t = useT()
  const pathname = usePathname()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(collapsible)
  const [peek, setPeek] = useState(false)

  useEffect(() => {
    if (!collapsible) return
    try {
      const saved = window.localStorage.getItem(COLLAPSE_KEY)
      if (saved !== null) setCollapsed(saved === "1")
    } catch {
      /* sem armazenamento: fica recolhido */
    }
  }, [collapsible])

  const toggleCollapsed = () => {
    setCollapsed((was) => {
      const next = !was
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      } catch {
        /* sem armazenamento: vale só para esta página */
      }
      return next
    })
    setPeek(false)
  }

  /* Recolhido e sem o rato por cima: só os ícones. */
  const compact = collapsible && collapsed && !peek
  const hide = compact ? "hidden" : undefined

  const mode: SidebarModule["id"] | null = pathname.startsWith("/agente") || pathname.startsWith("/admin/price-checker")
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
          {
            titleKey: "pro.agentTools",
            items: [
              ...AGENT_TOOLS,
              ...(sellsB2g ? [MINISTRIES_ITEM] : []),
              ...(canManageTeam ? [FINANCE_ITEM, TEAM_ITEM] : []),
            ],
          },
        ]
      : mode === "admin"
        ? [{ items: ADMIN_NAV }]
        : []

  const aside = (
    <aside
      onMouseEnter={collapsible && collapsed ? () => setPeek(true) : undefined}
      onMouseLeave={
        collapsible
          ? () => {
              setPeek(false)
              setSwitcherOpen(false)
            }
          : undefined
      }
      onFocus={collapsible && collapsed ? () => setPeek(true) : undefined}
      className={cn(
        "shrink-0 min-h-screen flex flex-col transition-[width,colors] duration-200",
        compact ? "w-16" : "w-64",
        collapsible && "absolute inset-y-0 left-0 z-40 overflow-y-auto",
        collapsible && peek && collapsed && "shadow-2xl",
        isDark ? "sidebar-dark text-gray-300" : "bg-white border-r border-slate-200 text-slate-700"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center justify-between border-b", compact ? "p-3 flex-col gap-2" : "p-6", isDark ? "border-gray-800" : "border-slate-200")}>
        <Link href="/modulo" className="flex items-center gap-2">
          <WeeFlyLogo className={compact ? "h-5 w-auto" : "h-7 w-auto"} />
          <span
            className={cn(
              hide,
              "text-xs px-2 py-0.5 rounded-md font-bold tracking-wide",
              isDark ? "bg-orange-500/15 text-orange-500" : "bg-slate-900 text-white"
            )}
          >
            {mode === "agent" ? t("nav.agentBadge") : t("auth.proBadge")}
          </span>
        </Link>
        {collapsible && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn("p-1 rounded", isDark ? "text-gray-400 hover:text-white" : "text-slate-400 hover:text-slate-700")}
            aria-label={collapsed ? t("nav.sidebarPin") : t("nav.sidebarCollapse")}
            title={collapsed ? t("nav.sidebarPin") : t("nav.sidebarCollapse")}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
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

      {/* PRO-02 · OCT-16 · o seletor de módulo: o actual é um botão, e a lista
          dos outros abre ao clicar. Lado a lado, o Admin ficava cortado. */}
      <div className={compact ? "p-2" : "p-4"}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setSwitcherOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={switcherOpen}
            className={cn(
              "w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isDark ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-slate-100 text-slate-900 hover:bg-slate-200"
            )}
          >
            {mode ? MODULE_ICON[mode] : <Compass className="w-4 h-4" />}
            <span className={cn(hide, "flex-1 text-left")}>{mode ? t(`pro.module.${mode}`) : t("pro.switchModule")}</span>
            <ChevronDown className={cn(hide, "w-4 h-4 transition-transform", switcherOpen && "rotate-180")} />
          </button>
          {switcherOpen && !compact && (
            <div
              role="menu"
              className={cn(
                "absolute left-0 right-0 mt-1 z-20 rounded-lg border p-1 shadow-lg",
                isDark ? "bg-gray-900 border-gray-700" : "bg-white border-slate-200"
              )}
            >
              {modules
                .filter(({ id }) => id !== mode)
                .map(({ id, state }) => {
                  const cls = cn(
                    "w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    state === "soon"
                      ? isDark
                        ? "text-gray-500 cursor-not-allowed"
                        : "text-slate-400 cursor-not-allowed"
                      : isDark
                        ? "text-gray-300 hover:bg-white/5 hover:text-white"
                        : "text-slate-700 hover:bg-slate-100"
                  )
                  if (state === "soon") {
                    return (
                      <span key={id} role="menuitem" aria-disabled="true" className={cls}>
                        <Lock className="w-4 h-4" />
                        <span className="flex-1">{t(`pro.module.${id}`)}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide">{t("pro.soon")}</span>
                      </span>
                    )
                  }
                  return (
                    <form key={id} action={enterModule}>
                      <input type="hidden" name="module" value={id} />
                      <button type="submit" role="menuitem" className={cls}>
                        {MODULE_ICON[id]}
                        <span className="flex-1 text-left">{t(`pro.module.${id}`)}</span>
                      </button>
                    </form>
                  )
                })}
            </div>
          )}
        </div>
        {companyName && !compact && (
          <div className="mt-3 px-1 flex items-center gap-2 min-w-0">
            {companyLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={companyLogoUrl}
                alt={t("nav.companyLogoAlt", { name: companyName })}
                className="h-6 w-auto max-w-[96px] object-contain rounded bg-white px-1"
              />
            )}
            <p className={cn("text-xs truncate", isDark ? "text-gray-400" : "text-slate-500")}>{companyName}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 py-3 space-y-5", compact ? "px-2" : "px-4")}>
        {sections.map((section, i) => (
          <div key={section.titleKey ?? i}>
            {section.titleKey && (
              <p
                className={cn(
                  hide,
                  "text-xs font-semibold uppercase tracking-wider mb-2 px-1",
                  isDark ? "text-gray-500" : "text-slate-400"
                )}
              >
                {t(section.titleKey)}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href === "/admin/price-checker" && pathname.startsWith(item.href))
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      title={compact ? t(item.labelKey) : undefined}
                      aria-label={compact ? t(item.labelKey) : undefined}
                      className={cn(
                        "flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                        compact ? "justify-center px-0" : "px-4",
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
                      <span className={cn(hide, "flex-1")}>{t(item.labelKey)}</span>
                      {item.soon && !compact && (
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
      <div className={cn(hide, "m-4 p-4 rounded-xl", isDark ? "bg-gray-800" : "bg-slate-50")}>
        <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>
          {t("nav.footerTitle")}
        </p>
        <p className={cn("text-xs mt-1", isDark ? "text-gray-400" : "text-slate-500")}>
          {t("nav.footerBody")}
        </p>
      </div>
    </aside>
  )

  /* Recolhível: um lugar de 64 px no ecrã, e o menu por cima quando abre. */
  if (!collapsible) return aside
  return <div className={cn("relative shrink-0", collapsed ? "w-16" : "w-64")}>{aside}</div>
}
